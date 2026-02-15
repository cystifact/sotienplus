import { z } from 'zod';
import { router, protectedProcedure, requirePermission } from '../trpc';
import { getAdminDb } from '@/lib/firebase-admin';
import { syncCustomers, testConnection } from '../services/kiotviet.service';

export const customersRouter = router({
  list: protectedProcedure.query(async () => {
    const db = getAdminDb();
    const snapshot = await db.collection('customers')
      .where('isActive', '==', true)
      .orderBy('name')
      .get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  }),

  sync: protectedProcedure
    .use(requirePermission('kiotviet', 'sync'))
    .mutation(async () => {
      const result = await syncCustomers();
      return result;
    }),

  testConnection: protectedProcedure
    .use(requirePermission('kiotviet', 'configure'))
    .mutation(async () => {
      const result = await testConnection();
      return result;
    }),

  getSettings: protectedProcedure
    .use(requirePermission('kiotviet', 'view'))
    .query(async () => {
      const db = getAdminDb();
      const doc = await db.collection('settings').doc('kiotviet').get();
      if (!doc.exists) {
        return { configured: false };
      }
      const data = doc.data()!;
      return {
        configured: true,
        retailerCode: data.retailerCode || '',
        clientId: data.clientId || '',
        hasSecret: !!data.clientSecret,
        lastCustomerSync: data.lastCustomerSync || null,
        lastCustomerCount: data.lastCustomerCount || 0,
      };
    }),

  saveSettings: protectedProcedure
    .use(requirePermission('kiotviet', 'configure'))
    .input(
      z.object({
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
        retailerCode: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const db = getAdminDb();
      await db.collection('settings').doc('kiotviet').set({
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        retailerCode: input.retailerCode,
        updatedAt: new Date(),
      }, { merge: true });
      return { success: true };
    }),
});
