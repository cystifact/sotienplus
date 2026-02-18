import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';

admin.initializeApp();

const KIOTVIET_TOKEN_URL = 'https://id.kiotviet.vn/connect/token';
const KIOTVIET_API_URL = 'https://public.kiotapi.com';

interface KiotVietConfig {
  clientId: string;
  clientSecret: string;
  retailerCode: string;
}

async function getKiotVietConfig(): Promise<KiotVietConfig> {
  const db = admin.firestore();
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

async function fetchAllCustomers(config: KiotVietConfig, token: string) {
  const customers: any[] = [];
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
      // Skip inactive customers or marketplace customers (e.g. Shopee)
      if (c.isActive === false) continue;
      if (c.code && c.code.startsWith('KHSPE')) continue;

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

/**
 * Scheduled function: Sync customers from KiotViet daily at midnight (Vietnam time)
 * Runs every day at 00:00 Asia/Ho_Chi_Minh
 */
export const scheduledCustomerSync = onSchedule(
  {
    schedule: '0 0 * * *',
    timeZone: 'Asia/Ho_Chi_Minh',
    region: 'asia-southeast1',
    retryCount: 2,
    timeoutSeconds: 300,
  },
  async () => {
    console.log('Starting scheduled customer sync...');

    try {
      const config = await getKiotVietConfig();
      const token = await getToken(config);
      const customers = await fetchAllCustomers(config, token);

      const db = admin.firestore();
      const now = new Date();

      // Always use chunked batch writes (Firestore limit is 500 per batch)
      const chunks: any[][] = [];
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

      // Mark customers not in this sync as inactive
      const syncedIds = new Set(customers.map((c: any) => String(c.id)));
      const allCustomersDocs = await db.collection('customers')
        .where('isActive', '==', true)
        .select()
        .get();
      const staleRefs = allCustomersDocs.docs
        .filter((doc) => !syncedIds.has(doc.id))
        .map((doc) => doc.ref);

      if (staleRefs.length > 0) {
        const staleChunks: FirebaseFirestore.DocumentReference[][] = [];
        for (let i = 0; i < staleRefs.length; i += 500) {
          staleChunks.push(staleRefs.slice(i, i + 500));
        }
        for (const chunk of staleChunks) {
          const batch = db.batch();
          for (const ref of chunk) {
            batch.update(ref, { isActive: false, updatedAt: now });
          }
          await batch.commit();
        }
        console.log(`Marked ${staleRefs.length} stale customers as inactive`);
      }

      // Update last sync time
      await db.collection('settings').doc('kiotviet').update({
        lastCustomerSync: now,
        lastCustomerCount: customers.length,
      });

      console.log(`Synced ${customers.length} customers successfully`);
    } catch (error) {
      console.error('Customer sync failed:', error);
      throw error; // Re-throw to trigger retry
    }
  }
);
