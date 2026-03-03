import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { invalidateLockDateCache } from '../lib/period-lock';

export const settingsRouter = router({
  getPeriodLock: protectedProcedure.query(async () => {
    const db = getAdminDb();
    const doc = await db.collection('settings').doc('periodLock').get();
    if (!doc.exists) return { lockDate: null };
    return { lockDate: (doc.data()?.lockDate as string) || null };
  }),

  setPeriodLock: adminProcedure
    .input(
      z.object({
        lockDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày không hợp lệ (YYYY-MM-DD)')
          .nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      await db.collection('settings').doc('periodLock').set(
        {
          lockDate: input.lockDate,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: ctx.userData!.id,
        },
        { merge: true }
      );

      // Invalidate server-side cache so next mutation sees the new lock date immediately
      invalidateLockDateCache();

      return { success: true };
    }),
});
