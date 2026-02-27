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

const VALID_ROLES: UserRole[] = ['admin', 'manager', 'staff'];

// Cache verified sessions for 5 minutes to avoid repeated Firebase calls
interface CachedContext {
  user: DecodedIdToken;
  userData: UserData;
  permissions: Permission[];
  expiresAt: number;
}

const contextCache = new Map<string, CachedContext>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const createTRPCContext = async (opts: CreateContextOptions): Promise<TRPCContext> => {
  // Try session cookie first
  const cookieHeader = (opts.req.headers.get('cookie') || '').toString();
  const sessionCookie = cookieHeader
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('__session='))
    ?.split('=')[1];

  const cacheKey = sessionCookie || '';

  // Check cache first
  if (cacheKey) {
    const cached = contextCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        user: cached.user,
        userData: cached.userData,
        permissions: cached.permissions,
      };
    }
  }

  let user: DecodedIdToken | null = null;

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

  // Resolve userData + permissions once per request (shared across batched procedures)
  let userData: UserData | null = null;
  let permissions: Permission[] = [];

  if (user) {
    const adminDb = getAdminDb();
    const userDoc = await adminDb.collection('users').doc(user.uid).get();

    if (userDoc.exists) {
      const data = userDoc.data()!;
      const role: UserRole = VALID_ROLES.includes(data.role) ? data.role : 'staff';

      userData = {
        id: userDoc.id,
        email: data.email,
        displayName: data.displayName,
        role,
        isActive: data.isActive,
      };

      permissions = mergePermissions(role, data.permissions || []);

      // Cache the result
      if (cacheKey) {
        contextCache.set(cacheKey, {
          user,
          userData,
          permissions,
          expiresAt: Date.now() + CACHE_TTL,
        });

        // Clean up old entries periodically (when cache grows large)
        if (contextCache.size > 100) {
          const now = Date.now();
          for (const [key, value] of contextCache) {
            if (value.expiresAt <= now) {
              contextCache.delete(key);
            }
          }
        }
      }
    }
  }

  return {
    user,
    userData,
    permissions,
  };
};

const t = initTRPC.context<typeof createTRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

const enforceUserIsAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user || !ctx.userData) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Chưa đăng nhập' });
  }

  if (!ctx.userData.isActive) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Tài khoản đã bị vô hiệu hóa' });
  }

  return next({ ctx });
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
