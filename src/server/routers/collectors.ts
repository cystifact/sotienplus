import { z } from 'zod';
import { router, protectedProcedure, requirePermission } from '../trpc';
import { getAdminDb } from '@/lib/firebase-admin';
import { TRPCError } from '@trpc/server';
import { FieldValue } from 'firebase-admin/firestore';

export const collectorsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = getAdminDb();
    const snapshot = await db.collection('collectors')
      .where('isActive', '==', true)
      .orderBy('name')
      .get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  }),

  listAll: protectedProcedure
    .use(requirePermission('collectors', 'view'))
    .query(async () => {
      const db = getAdminDb();
      const snapshot = await db.collection('collectors').orderBy('name').get();
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    }),

  create: protectedProcedure
    .use(requirePermission('collectors', 'create'))
    .input(
      z.object({
        name: z.string().min(1).max(100),
        phone: z.string().max(20).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getAdminDb();
      const now = FieldValue.serverTimestamp();
      const docRef = await db.collection('collectors').add({
        name: input.name,
        phone: input.phone || null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      return { id: docRef.id };
    }),

  update: protectedProcedure
    .use(requirePermission('collectors', 'edit'))
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        phone: z.string().max(20).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getAdminDb();
      const { id, ...updateData } = input;

      const doc = await db.collection('collectors').doc(id).get();
      if (!doc.exists) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Người nộp tiền không tồn tại' });
      }

      const firestoreUpdate: Record<string, any> = {
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (updateData.name !== undefined) firestoreUpdate.name = updateData.name;
      if (updateData.phone !== undefined) firestoreUpdate.phone = updateData.phone || null;
      if (updateData.isActive !== undefined) firestoreUpdate.isActive = updateData.isActive;

      await db.collection('collectors').doc(id).update(firestoreUpdate);
      return { success: true };
    }),

  delete: protectedProcedure
    .use(requirePermission('collectors', 'delete'))
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = getAdminDb();
      await db.collection('collectors').doc(input.id).update({
        isActive: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { success: true };
    }),
});
