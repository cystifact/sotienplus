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

// In-memory token cache
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getKiotVietConfig(): Promise<KiotVietConfig> {
  // Prefer environment variables for secrets
  if (process.env.KIOTVIET_CLIENT_ID && process.env.KIOTVIET_CLIENT_SECRET && process.env.KIOTVIET_RETAILER_CODE) {
    return {
      clientId: process.env.KIOTVIET_CLIENT_ID,
      clientSecret: process.env.KIOTVIET_CLIENT_SECRET,
      retailerCode: process.env.KIOTVIET_RETAILER_CODE,
    };
  }

  // Fall back to Firestore config
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
  // Return cached token if still valid (with 60s buffer)
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

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
    tokenCache = null;
    const errorText = await response.text();
    console.error('[KiotViet] Token fetch error:', errorText);
    throw new Error('Không thể kết nối KiotViet. Kiểm tra lại thông tin đăng nhập.');
  }

  const data = await response.json();
  const expiresIn = data.expires_in || 3600;
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  return data.access_token;
}

export async function fetchAllCustomers(config: KiotVietConfig, token: string): Promise<KiotVietCustomer[]> {
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
      console.error('[KiotViet] Customer fetch error:', error);
      throw new Error('Lỗi khi đồng bộ khách hàng từ KiotViet');
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
  const now = new Date();

  // Always use chunked batch writes (Firestore limit is 500 per batch)
  const chunks: KiotVietCustomer[][] = [];
  for (let i = 0; i < customers.length; i += 500) {
    chunks.push(customers.slice(i, i + 500));
  }

  for (const chunk of chunks) {
    const batch = db.batch();
    for (const customer of chunk) {
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
    await batch.commit();
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
      return { success: false, error: 'Kết nối KiotViet thất bại. Kiểm tra lại cấu hình.' };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Lỗi không xác định' };
  }
}
