import { initTRPC, TRPCError } from '@trpc/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { Permission, UserRole, mergePermissions } from '@/lib/permissions-config';
import { hasPermission } from './lib/permission-utils';

export interface UserData {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
}

interface CreateContextOptions {
  req: Request;
}

export interface TRPCContext {
  user: DecodedIdToken | null;
  userData: UserData | null;
  permissions: Permission[];
}

export const createTRPCContext = async (opts: CreateContextOptions): Promise<TRPCContext> => {
  let user: DecodedIdToken | null = null;

  // Try session cookie first
  const cookieHeader = (opts.req.headers.get('cookie') || '').toString();
  const sessionCookie = cookieHeader
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('__session='))
    ?.split('=')[1];

  if (sessionCookie) {
    try {
      const adminAuth = getAdminAuth();
      user = await adminAuth.verifySessionCookie(sessionCookie, true);
    } catch (_) {
      user = null;
    }
  }

  // Fallback to Bearer token
  if (!user) {
    const authHeader = opts.req.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const adminAuth = getAdminAuth();
        user = await adminAuth.verifyIdToken(token);
      } catch (_) {
        user = null;
      }
    }
  }

  return {
    user,
    userData: null,
    permissions: [],
  };
};

const t = initTRPC.context<typeof createTRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

const enforceUserIsAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Chưa đăng nhập' });
  }

  const adminDb = getAdminDb();
  const userDoc = await adminDb.collection('users').doc(ctx.user.uid).get();

  if (!userDoc.exists) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Tài khoản không hợp lệ' });
  }

  const data = userDoc.data()!;
  if (!data.isActive) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Tài khoản đã bị vô hiệu hóa' });
  }

  const userData: UserData = {
    id: userDoc.id,
    email: data.email,
    displayName: data.displayName,
    role: data.role as UserRole,
    isActive: data.isActive,
  };

  // Resolve permissions from same doc read (no extra Firestore call)
  const permissions = mergePermissions(
    data.role as UserRole,
    data.permissions || [],
  );

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      userData,
      permissions,
    },
  });
});

const enforceUserIsAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userData || ctx.userData.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Cần quyền admin' });
  }
  return next({ ctx });
});

export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);
export const adminProcedure = t.procedure.use(enforceUserIsAuthed).use(enforceUserIsAdmin);

// Permission-based middleware factory
export const requirePermission = (module: string, action: string) => {
  return t.middleware(async ({ ctx, next }) => {
    // Admin always bypasses permission checks
    if (ctx.userData?.role === 'admin') {
      return next({ ctx });
    }
    if (!hasPermission(ctx.permissions, module, action)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền thực hiện hành động này',
      });
    }
    return next({ ctx });
  });
};
