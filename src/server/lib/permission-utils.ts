import { getAdminDb } from '@/lib/firebase-admin';
import {
  Permission,
  UserRole,
  mergePermissions,
  checkPermission,
} from '@/lib/permissions-config';

/**
 * Fetch user document and resolve merged permissions.
 * For use outside tRPC context (e.g., Cloud Functions).
 */
export async function getMergedPermissions(userId: string): Promise<Permission[]> {
  const db = getAdminDb();
  const userDoc = await db.collection('users').doc(userId).get();

  if (!userDoc.exists) return [];

  const data = userDoc.data()!;
  const role = (data.role || 'staff') as UserRole;
  const userOverrides: Permission[] = data.permissions || [];

  return mergePermissions(role, userOverrides);
}

/**
 * Check a single permission against a pre-resolved permissions array.
 */
export function hasPermission(permissions: Permission[], module: string, action: string): boolean {
  return checkPermission(permissions, module, action);
}
