import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, requirePermission } from '../trpc';
import { getAdminDb } from '@/lib/firebase-admin';
import { syncCustomers, testConnection } from '../services/kiotviet.service';
import { hasPermission } from '../lib/permission-utils';

// Customer code prefixes to exclude from search (e.g. Shopee marketplace customers)
const EXCLUDED_CODE_PREFIXES = ['KHSPE'];

export const customersRouter = router({
  list: protectedProcedure
    .use(requirePermission('ledger', 'view'))
    .query(async () => {
    const db = getAdminDb();
    const snapshot = await db.collection('customers')
      .where('isActive', '==', true)
      .orderBy('name')
      .get();
    return snapshot.docs
      .filter((doc) => {
        const code = (doc.data().code as string) || '';
        return !EXCLUDED_CODE_PREFIXES.some((p) => code.startsWith(p));
      })
      .map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          name: d.name as string,
          code: (d.code as string) || '',
          phone: (d.phone as string) || '',
          debt: (d.debt as number) || 0,
        };
      });
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
    .query(async ({ ctx }) => {
      // Require at least one kiotviet permission
      const canView = ctx.userData?.role === 'admin' || hasPermission(ctx.permissions, 'kiotviet', 'view');
      const canConfigure = ctx.userData?.role === 'admin' || hasPermission(ctx.permissions, 'kiotviet', 'configure');
      const canSync = ctx.userData?.role === 'admin' || hasPermission(ctx.permissions, 'kiotviet', 'sync');

      if (!canView && !canConfigure && !canSync) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn không có quyền thực hiện hành động này' });
      }

      const db = getAdminDb();
      const doc = await db.collection('settings').doc('kiotviet').get();
      if (!doc.exists) {
        return { configured: false };
      }
      const data = doc.data()!;
      return {
        configured: true,
        // Only expose config details to users with view/configure permission
        retailerCode: (canView || canConfigure) ? (data.retailerCode || '') : undefined,
        clientId: (canView || canConfigure) ? (data.clientId || '') : undefined,
        hasSecret: (canView || canConfigure) ? !!data.clientSecret : undefined,
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
