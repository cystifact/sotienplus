import { z } from 'zod';
import { router, protectedProcedure, requirePermission } from '../trpc';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { TRPCError } from '@trpc/server';
import { FieldValue } from 'firebase-admin/firestore';
import { AVAILABLE_PERMISSIONS } from '@/lib/permissions-config';

const VALID_PERMISSION_KEYS = new Set(
  AVAILABLE_PERMISSIONS.map((p) => `${p.module}:${p.action}`)
);

const SHADOW_EMAIL_DOMAIN = '@sotienplus.local';

export const usersRouter = router({
  getCurrentUser: protectedProcedure.query(async ({ ctx }) => {
    return {
      ...ctx.userData,
      permissions: ctx.permissions,
    };
  }),

  list: protectedProcedure
    .use(requirePermission('users', 'view'))
    .query(async () => {
      const db = getAdminDb();
      const snapshot = await db.collection('users').orderBy('displayName').get();
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    }),

  getById: protectedProcedure
    .use(requirePermission('users', 'view'))
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const db = getAdminDb();
      const doc = await db.collection('users').doc(input.id).get();
      if (!doc.exists) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User không tồn tại' });
      }
      return { id: doc.id, ...doc.data() };
    }),

  create: protectedProcedure
    .use(requirePermission('users', 'create'))
    .input(
      z.object({
        username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/, 'Username chỉ chứa chữ, số, _ và -').optional(),
        email: z.string().email().optional(),
        displayName: z.string().min(1).max(100),
        password: z.string().min(8).max(128),
        role: z.enum(['admin', 'manager', 'staff']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const adminAuth = getAdminAuth();
      const db = getAdminDb();

      // Only admin can create admin accounts
      if (input.role === 'admin' && ctx.userData!.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Chỉ admin mới có thể tạo tài khoản admin' });
      }

      // Admin requires real email, staff/manager requires username
      if (input.role === 'admin' && !input.email) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Admin cần có email thực' });
      }
      if (input.role !== 'admin' && !input.username) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nhân viên cần có username' });
      }

      const email = input.role === 'admin' && input.email
        ? input.email
        : `${input.username}${SHADOW_EMAIL_DOMAIN}`;

      const username = input.username || input.email?.split('@')[0] || '';

      // Check if email/username already exists
      try {
        await adminAuth.getUserByEmail(email);
        throw new TRPCError({
          code: 'CONFLICT',
          message: input.role === 'admin' ? 'Email đã tồn tại' : 'Username đã tồn tại',
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

      // Atomic: if Firestore write fails, clean up the Auth user
      try {
        const now = FieldValue.serverTimestamp();
        await db.collection('users').doc(userRecord.uid).set({
          email,
          username,
          displayName: input.displayName,
          role: input.role,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      } catch (firestoreError) {
        // Rollback: delete the Firebase Auth user since Firestore write failed
        try {
          await adminAuth.deleteUser(userRecord.uid);
        } catch (_cleanupError) {
          console.error('[Users] Failed to rollback Auth user after Firestore error:', userRecord.uid);
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Tạo user thất bại' });
      }

      return { id: userRecord.uid };
    }),

  update: protectedProcedure
    .use(requirePermission('users', 'edit'))
    .input(
      z.object({
        id: z.string(),
        displayName: z.string().min(1).max(100).optional(),
        role: z.enum(['admin', 'manager', 'staff']).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const adminAuth = getAdminAuth();
      const { id, ...updateData } = input;
      const isCallerAdmin = ctx.userData!.role === 'admin';

      const doc = await db.collection('users').doc(id).get();
      if (!doc.exists) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User không tồn tại' });
      }

      const targetRole = doc.data()?.role;

      // Non-admin cannot modify admin accounts
      if (targetRole === 'admin' && !isCallerAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Chỉ admin mới có thể chỉnh sửa tài khoản admin' });
      }

      // Non-admin cannot promote to admin
      if (updateData.role === 'admin' && !isCallerAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Chỉ admin mới có thể cấp quyền admin' });
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
        // Clear permission overrides when role changes
        firestoreUpdate.permissions = FieldValue.delete();
      }
      if (updateData.isActive !== undefined) {
        firestoreUpdate.isActive = updateData.isActive;
        await adminAuth.updateUser(id, { disabled: !updateData.isActive });
      }

      await db.collection('users').doc(id).update(firestoreUpdate);
      return { success: true };
    }),

  updatePassword: protectedProcedure
    .use(requirePermission('users', 'edit'))
    .input(
      z.object({
        id: z.string(),
        password: z.string().min(8).max(128),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Non-admin cannot reset admin passwords
      if (ctx.userData!.role !== 'admin') {
        const db = getAdminDb();
        const targetDoc = await db.collection('users').doc(input.id).get();
        if (targetDoc.exists && targetDoc.data()?.role === 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Chỉ admin mới có thể đặt lại mật khẩu admin' });
        }
      }

      const adminAuth = getAdminAuth();
      await adminAuth.updateUser(input.id, { password: input.password });
      return { success: true };
    }),

  updatePermissions: protectedProcedure
    .use(requirePermission('users', 'edit'))
    .input(
      z.object({
        id: z.string(),
        permissions: z.array(
          z.object({
            module: z.string(),
            action: z.string(),
            granted: z.boolean(),
            label: z.string(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Only admin can change permissions
      if (ctx.userData!.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Chỉ admin mới có thể thay đổi quyền' });
      }

      // Cannot edit own permissions
      if (input.id === ctx.userData!.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Không thể chỉnh sửa quyền của chính mình' });
      }

      // Validate all permission keys are from AVAILABLE_PERMISSIONS
      for (const p of input.permissions) {
        if (!VALID_PERMISSION_KEYS.has(`${p.module}:${p.action}`)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Quyền không hợp lệ: ${p.module}:${p.action}` });
        }
      }

      const db = getAdminDb();
      const doc = await db.collection('users').doc(input.id).get();
      if (!doc.exists) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User không tồn tại' });
      }

      await db.collection('users').doc(input.id).update({
        permissions: input.permissions.length > 0 ? input.permissions : FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { success: true };
    }),

  delete: protectedProcedure
    .use(requirePermission('users', 'delete'))
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getAdminDb();
      const adminAuth = getAdminAuth();

      // Non-admin cannot delete admin accounts
      const targetDoc = await db.collection('users').doc(input.id).get();
      if (!targetDoc.exists) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User không tồn tại' });
      }
      if (targetDoc.data()?.role === 'admin' && ctx.userData!.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Chỉ admin mới có thể vô hiệu hóa tài khoản admin' });
      }

      await adminAuth.updateUser(input.id, { disabled: true });
      await db.collection('users').doc(input.id).update({
        isActive: false,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { success: true };
    }),
});
