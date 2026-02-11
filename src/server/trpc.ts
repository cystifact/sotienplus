import { initTRPC, TRPCError } from '@trpc/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import type { DecodedIdToken } from 'firebase-admin/auth';

export interface UserData {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'staff';
  isActive: boolean;
}

interface CreateContextOptions {
  req: Request;
}

export interface TRPCContext {
  user: DecodedIdToken | null;
  userData: UserData | null;
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
    role: data.role,
    isActive: data.isActive,
  };

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      userData,
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
