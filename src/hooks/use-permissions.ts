'use client';

import { useMemo } from 'react';
import { Permission, checkPermission, groupByModule } from '@/lib/permissions-config';

export function usePermissions(permissions: Permission[]) {
  const hasPermission = useMemo(
    () => (module: string, action: string) => checkPermission(permissions, module, action),
    [permissions]
  );

  const canView = useMemo(() => (module: string) => hasPermission(module, 'view'), [hasPermission]);
  const canCreate = useMemo(() => (module: string) => hasPermission(module, 'create'), [hasPermission]);
  const canEdit = useMemo(() => (module: string) => hasPermission(module, 'edit'), [hasPermission]);
  const canDelete = useMemo(() => (module: string) => hasPermission(module, 'delete'), [hasPermission]);

  const grouped = useMemo(() => groupByModule(permissions), [permissions]);

  return { hasPermission, canView, canCreate, canEdit, canDelete, grouped };
}
