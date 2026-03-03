'use client';

import { useMemo, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { useCurrentUserPermissions } from './use-current-user-permissions';

export function usePeriodLock() {
  const { data, isLoading } = trpc.settings.getPeriodLock.useQuery(undefined, {
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000,
  });
  const { isAdmin } = useCurrentUserPermissions();

  const lockDate = data?.lockDate ?? null;

  const isDateLocked = useCallback(
    (date: string): boolean => {
      if (isAdmin) return false;
      if (!lockDate) return false;
      return date <= lockDate;
    },
    [lockDate, isAdmin]
  );

  return useMemo(
    () => ({ lockDate, isLoading, isDateLocked }),
    [lockDate, isLoading, isDateLocked]
  );
}
