import type { TRPCContext, UserData } from '@/server/trpc';
import type { Permission, UserRole } from '@/lib/permissions-config';
import { mergePermissions } from '@/lib/permissions-config';
import { appRouter } from '@/server/router';

interface TestContextOptions {
  uid?: string;
  email?: string;
  displayName?: string;
  role?: UserRole;
  isActive?: boolean;
  permissions?: Permission[];
}

/**
 * Create a TRPCContext for testing. Note: the `protectedProcedure` middleware
 * reads user data from Firestore internally, so we need to ensure the mock
 * Firestore `users` collection returns matching user docs.
 *
 * This context is used as the _initial_ context passed to createCaller.
 * The middleware will enrich it with userData and permissions from Firestore.
 */
export function createTestContext(opts: TestContextOptions = {}): TRPCContext {
  const uid = opts.uid ?? 'test-user-id';

  return {
    user: {
      uid,
      email: opts.email ?? 'test@example.com',
      aud: 'test',
      auth_time: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      iss: 'https://securetoken.google.com/test',
      sub: uid,
      firebase: {
        identities: {},
        sign_in_provider: 'password',
      },
    } as any,
    userData: null,
    permissions: [],
  };
}

/**
 * Create an unauthenticated context (no user token).
 */
export function createUnauthenticatedContext(): TRPCContext {
  return {
    user: null,
    userData: null,
    permissions: [],
  };
}

/**
 * Create a tRPC caller with the given context.
 */
export function createTestCaller(ctx: TRPCContext) {
  return appRouter.createCaller(ctx);
}

/**
 * Build a user Firestore document that matches what protectedProcedure expects.
 */
export function buildUserDoc(opts: TestContextOptions = {}) {
  return {
    email: opts.email ?? 'test@example.com',
    username: 'testuser',
    displayName: opts.displayName ?? 'Test User',
    role: opts.role ?? 'staff',
    isActive: opts.isActive ?? true,
    permissions: opts.permissions ?? [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
