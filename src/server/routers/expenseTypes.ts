import { z } from 'zod';
import { router, protectedProcedure, requirePermission } from '../trpc';
import { getAdminDb } from '@/lib/firebase-admin';
import { TRPCError } from '@trpc/server';
import { FieldValue } from 'firebase-admin/firestore';

export const expenseTypesRouter = router({
  list: protectedProcedure
    .use(requirePermission('expenses', 'view'))
    .query(async () => {
      const db = getAdminDb();
      const snapshot = await db.collection('expense_types')
        .where('isActive', '==', true)
        .orderBy('sortOrder')
        .get();
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    }),

  create: protectedProcedure
    .use(requirePermission('expenses', 'manage_types'))
    .input(
      z.object({
        name: z.string().min(1).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const now = FieldValue.serverTimestamp();

      // Get max sortOrder for auto-assignment
      const snapshot = await db.collection('expense_types')
        .orderBy('sortOrder', 'desc')
        .limit(1)
        .get();
      const maxSortOrder = snapshot.empty ? 0 : (snapshot.docs[0].data().sortOrder || 0);

      const docRef = await db.collection('expense_types').add({
        name: input.name,
        sortOrder: maxSortOrder + 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        createdBy: ctx.userData!.id,
        updatedBy: null,
      });

      return { id: docRef.id };
    }),

  update: protectedProcedure
    .use(requirePermission('expenses', 'manage_types'))
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        sortOrder: z.number().int().min(0).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const { id, ...updateData } = input;

      const doc = await db.collection('expense_types').doc(id).get();
      if (!doc.exists) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Loại chi không tồn tại' });
      }

      const firestoreUpdate: Record<string, any> = {
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ctx.userData!.id,
      };
      if (updateData.name !== undefined) firestoreUpdate.name = updateData.name;
      if (updateData.sortOrder !== undefined) firestoreUpdate.sortOrder = updateData.sortOrder;

      await db.collection('expense_types').doc(id).update(firestoreUpdate);
      return { success: true };
    }),

  delete: protectedProcedure
    .use(requirePermission('expenses', 'manage_types'))
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      await db.collection('expense_types').doc(input.id).update({
        isActive: false,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ctx.userData!.id,
      });
      return { success: true };
    }),

  reorder: protectedProcedure
    .use(requirePermission('expenses', 'manage_types'))
    .input(
      z.object({
        updates: z.array(
          z.object({
            id: z.string(),
            sortOrder: z.number().int().min(0),
          })
        ).min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const batch = db.batch();
      const now = FieldValue.serverTimestamp();

      for (const update of input.updates) {
        const docRef = db.collection('expense_types').doc(update.id);
        batch.update(docRef, {
          sortOrder: update.sortOrder,
          updatedAt: now,
          updatedBy: ctx.userData!.id,
        });
      }

      await batch.commit();
      return { success: true };
    }),
});
