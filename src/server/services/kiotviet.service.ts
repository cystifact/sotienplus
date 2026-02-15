import { getAdminDb } from '@/lib/firebase-admin';

const KIOTVIET_TOKEN_URL = 'https://id.kiotviet.vn/connect/token';
const KIOTVIET_API_URL = 'https://public.kiotapi.com';

export interface KiotVietConfig {
  clientId: string;
  clientSecret: string;
  retailerCode: string;
}

export interface KiotVietCustomer {
  id: number;
  code: string;
  name: string;
  contactNumber?: string;
  address?: string;
  debt?: number;
}

async function getKiotVietConfig(): Promise<KiotVietConfig> {
  const db = getAdminDb();
  const doc = await db.collection('settings').doc('kiotviet').get();
  if (!doc.exists) {
    throw new Error('KiotViet chưa được cấu hình');
  }
  const data = doc.data()!;
  if (!data.clientId || !data.clientSecret || !data.retailerCode) {
    throw new Error('KiotViet config thiếu thông tin');
  }
  return {
    clientId: data.clientId,
    clientSecret: data.clientSecret,
    retailerCode: data.retailerCode,
  };
}

async function getToken(config: KiotVietConfig): Promise<string> {
  const body = new URLSearchParams({
    scopes: 'PublicApi.Access',
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(KIOTVIET_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Lỗi lấy token KiotViet: ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function fetchAllCustomers(config: KiotVietConfig, token: string): Promise<KiotVietCustomer[]> {
  const customers: KiotVietCustomer[] = [];
  let currentItem = 0;
  const pageSize = 100;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(
      `${KIOTVIET_API_URL}/customers?pageSize=${pageSize}&currentItem=${currentItem}&includeTotal=true`,
      {
        method: 'GET',
        headers: {
          'Retailer': config.retailerCode,
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Lỗi fetch customers: ${error}`);
    }

    const data = await response.json();
    const customerData = data.data || [];

    for (const c of customerData) {
      customers.push({
        id: c.id,
        code: c.code,
        name: c.name,
        contactNumber: c.contactNumber || undefined,
        address: c.address || undefined,
        debt: c.debt || 0,
      });
    }

    hasMore = customerData.length === pageSize;
    currentItem += pageSize;

    if (currentItem > 50000) break;
  }

  return customers;
}

export async function syncCustomers(): Promise<{ synced: number; total: number }> {
  const config = await getKiotVietConfig();
  const token = await getToken(config);
  const customers = await fetchAllCustomers(config, token);

  const db = getAdminDb();
  const batch = db.batch();
  const now = new Date();

  for (const customer of customers) {
    const docRef = db.collection('customers').doc(String(customer.id));
    batch.set(docRef, {
      kiotVietId: customer.id,
      code: customer.code,
      name: customer.name,
      phone: customer.contactNumber || null,
      address: customer.address || null,
      debt: customer.debt || 0,
      isActive: true,
      lastSyncAt: now,
      updatedAt: now,
    }, { merge: true });
  }

  // Firestore batch limit is 500, split if needed
  if (customers.length <= 500) {
    await batch.commit();
  } else {
    // Process in chunks of 500
    const chunks = [];
    for (let i = 0; i < customers.length; i += 500) {
      chunks.push(customers.slice(i, i + 500));
    }
    for (const chunk of chunks) {
      const chunkBatch = db.batch();
      for (const customer of chunk) {
        const docRef = db.collection('customers').doc(String(customer.id));
        chunkBatch.set(docRef, {
          kiotVietId: customer.id,
          code: customer.code,
          name: customer.name,
          phone: customer.contactNumber || null,
          address: customer.address || null,
          debt: customer.debt || 0,
          isActive: true,
          lastSyncAt: now,
          updatedAt: now,
        }, { merge: true });
      }
      await chunkBatch.commit();
    }
  }

  // Update last sync time in settings
  await db.collection('settings').doc('kiotviet').update({
    lastCustomerSync: now,
    lastCustomerCount: customers.length,
  });

  return { synced: customers.length, total: customers.length };
}

export async function testConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    const config = await getKiotVietConfig();
    const token = await getToken(config);

    const response = await fetch(`${KIOTVIET_API_URL}/customers?pageSize=1`, {
      method: 'GET',
      headers: {
        'Retailer': config.retailerCode,
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `API test failed: ${error}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
