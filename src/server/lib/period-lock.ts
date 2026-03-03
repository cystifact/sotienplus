import { getAdminDb } from '@/lib/firebase-admin';
import { TRPCError } from '@trpc/server';

// In-memory cache to reduce Firestore reads (one read per 30 seconds instead of per mutation).
// NOTE: This cache is per-process. In serverless/multi-container deployments (e.g. Vercel),
// each instance has its own cache, so enforcement may lag up to 30s after a lock change.
// This is an acceptable tradeoff — the backend is the security boundary, not real-time sync.
let cachedLockDate: { value: string | null; expiresAt: number } | null = null;
const LOCK_CACHE_TTL = 30 * 1000; // 30 seconds

async function getLockDate(): Promise<string | null> {
  if (cachedLockDate && cachedLockDate.expiresAt > Date.now()) {
    return cachedLockDate.value;
  }

  const db = getAdminDb();
  const doc = await db.collection('settings').doc('periodLock').get();
  const lockDate = doc.exists ? (doc.data()?.lockDate as string | null) ?? null : null;

  cachedLockDate = { value: lockDate, expiresAt: Date.now() + LOCK_CACHE_TTL };
  return lockDate;
}

/** Invalidate the cached lock date (call after setPeriodLock) */
export function invalidateLockDateCache(): void {
  cachedLockDate = null;
}

/**
 * Enforce period lock: throws FORBIDDEN if the record date is within a locked period.
 * Admin users always bypass this check.
 *
 * @param recordDate - ISO date string (YYYY-MM-DD) of the record
 * @param isAdmin - whether the current user is admin
 */
export async function enforcePeriodLock(recordDate: string, isAdmin: boolean): Promise<void> {
  if (isAdmin) return;

  const lockDate = await getLockDate();
  if (!lockDate) return;

  // ISO string comparison works correctly for YYYY-MM-DD format
  if (recordDate <= lockDate) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Kỳ đã khóa sổ đến ngày ${lockDate}. Không thể thêm/sửa/xóa bản ghi trong kỳ đã khóa.`,
    });
  }
}
