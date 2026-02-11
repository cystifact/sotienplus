import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { TRPCError } from '@trpc/server';
import { FieldValue } from 'firebase-admin/firestore';

const SHADOW_EMAIL_DOMAIN = '@soghitien.local';

export const usersRouter = router({
  getCurrentUser: protectedProcedure.query(async ({ ctx }) => {
    return ctx.userData;
  }),

  list: adminProcedure.query(async () => {
    const db = getAdminDb();
    const snapshot = await db.collection('users').orderBy('displayName').get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  }),

  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const db = getAdminDb();
      const doc = await db.collection('users').doc(input.id).get();
      if (!doc.exists) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User không tồn tại' });
      }
      return { id: doc.id, ...doc.data() };
    }),

  create: adminProcedure
    .input(
      z.object({
        username: z.string().min(3).max(30),
        displayName: z.string().min(1).max(100),
        password: z.string().min(6),
        role: z.enum(['admin', 'staff']),
      })
    )
    .mutation(async ({ input }) => {
      const adminAuth = getAdminAuth();
      const db = getAdminDb();
      const email = `${input.username}${SHADOW_EMAIL_DOMAIN}`;

      // Check if username already exists
      try {
        await adminAuth.getUserByEmail(email);
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Username đã tồn tại',
        });
      } catch (error: any) {
        if (error.code !== 'auth/user-not-found' && error instanceof TRPCError) {
          throw error;
        }
      }

      const userRecord = await adminAuth.createUser({
        email,
        password: input.password,
        displayName: input.displayName,
      });

      const now = FieldValue.serverTimestamp();
      await db.collection('users').doc(userRecord.uid).set({
        email,
        username: input.username,
        displayName: input.displayName,
        role: input.role,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      return { id: userRecord.uid };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        displayName: z.string().min(1).max(100).optional(),
        role: z.enum(['admin', 'staff']).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getAdminDb();
      const adminAuth = getAdminAuth();
      const { id, ...updateData } = input;

      const doc = await db.collection('users').doc(id).get();
      if (!doc.exists) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User không tồn tại' });
      }

      const firestoreUpdate: Record<string, any> = {
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (updateData.displayName !== undefined) {
        firestoreUpdate.displayName = updateData.displayName;
        await adminAuth.updateUser(id, { displayName: updateData.displayName });
      }
      if (updateData.role !== undefined) {
        firestoreUpdate.role = updateData.role;
      }
      if (updateData.isActive !== undefined) {
        firestoreUpdate.isActive = updateData.isActive;
        await adminAuth.updateUser(id, { disabled: !updateData.isActive });
      }

      await db.collection('users').doc(id).update(firestoreUpdate);
      return { success: true };
    }),

  updatePassword: adminProcedure
    .input(
      z.object({
        id: z.string(),
        password: z.string().min(6),
      })
    )
    .mutation(async ({ input }) => {
      const adminAuth = getAdminAuth();
      await adminAuth.updateUser(input.id, { password: input.password });
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = getAdminDb();
      const adminAuth = getAdminAuth();

      await adminAuth.updateUser(input.id, { disabled: true });
      await db.collection('users').doc(input.id).update({
        isActive: false,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { success: true };
    }),
});
