'use client';

import { ReactNode, memo } from 'react';
import { useCurrentUserPermissions } from '@/hooks/use-current-user-permissions';

interface PermissionGuardProps {
  children: ReactNode;
  module?: string;
  action?: string;
  fallback?: ReactNode;
  requireAll?: boolean;
  permissions?: Array<{ module: string; action: string }>;
}

function PermissionGuardBase({
  children,
  module,
  action,
  fallback = null,
  requireAll = false,
  permissions,
}: PermissionGuardProps) {
  const { hasPermission } = useCurrentUserPermissions();

  if (permissions) {
    const has = requireAll
      ? permissions.every((p) => hasPermission(p.module, p.action))
      : permissions.some((p) => hasPermission(p.module, p.action));
    return has ? <>{children}</> : <>{fallback}</>;
  }

  if (!module || !action) return <>{fallback}</>;

  return hasPermission(module, action) ? <>{children}</> : <>{fallback}</>;
}

export const PermissionGuard = memo(PermissionGuardBase);

export function ViewGuard({ children, module, fallback }: { children: ReactNode; module: string; fallback?: ReactNode }) {
  return <PermissionGuard module={module} action="view" fallback={fallback}>{children}</PermissionGuard>;
}

export function CreateGuard({ children, module, fallback }: { children: ReactNode; module: string; fallback?: ReactNode }) {
  return <PermissionGuard module={module} action="create" fallback={fallback}>{children}</PermissionGuard>;
}

export function EditGuard({ children, module, fallback }: { children: ReactNode; module: string; fallback?: ReactNode }) {
  return <PermissionGuard module={module} action="edit" fallback={fallback}>{children}</PermissionGuard>;
}

export function DeleteGuard({ children, module, fallback }: { children: ReactNode; module: string; fallback?: ReactNode }) {
  return <PermissionGuard module={module} action="delete" fallback={fallback}>{children}</PermissionGuard>;
}

export function AdminGuard({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const { isAdmin } = useCurrentUserPermissions();
  return isAdmin ? <>{children}</> : <>{fallback ?? null}</>;
}
