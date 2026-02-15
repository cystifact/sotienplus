'use client';

import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Permission, UserRole, checkPermission } from '@/lib/permissions-config';

export function useCurrentUserPermissions() {
  const { data, isLoading } = trpc.users.getCurrentUser.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const permissions: Permission[] = data?.permissions || [];
  const role = (data?.role || 'staff') as UserRole;

  const hasPermission = useMemo(
    () => (module: string, action: string): boolean => {
      if (!data) return false;
      if (role === 'admin') return true;
      return checkPermission(permissions, module, action);
    },
    [data, permissions, role]
  );

  const canView = useMemo(() => (module: string) => hasPermission(module, 'view'), [hasPermission]);
  const canCreate = useMemo(() => (module: string) => hasPermission(module, 'create'), [hasPermission]);
  const canEdit = useMemo(() => (module: string) => hasPermission(module, 'edit'), [hasPermission]);
  const canDelete = useMemo(() => (module: string) => hasPermission(module, 'delete'), [hasPermission]);

  return useMemo(() => ({
    role,
    permissions,
    isLoading,
    hasPermission,
    canView,
    canCreate,
    canEdit,
    canDelete,
    isAdmin: role === 'admin',
    isManager: role === 'manager',
    isStaff: role === 'staff',
    userData: data,
  }), [role, permissions, isLoading, hasPermission, canView, canCreate, canEdit, canDelete, data]);
}
