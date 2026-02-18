import { describe, it, expect } from 'vitest';
import { hasPermission } from '../permission-utils';
import type { Permission } from '@/lib/permissions-config';

describe('hasPermission', () => {
  const permissions: Permission[] = [
    { module: 'ledger', action: 'view', granted: true, label: 'View' },
    { module: 'ledger', action: 'create', granted: true, label: 'Create' },
    { module: 'ledger', action: 'edit', granted: false, label: 'Edit' },
    { module: 'collectors', action: 'view', granted: true, label: 'View collectors' },
  ];

  it('should return true when permission is granted', () => {
    expect(hasPermission(permissions, 'ledger', 'view')).toBe(true);
    expect(hasPermission(permissions, 'ledger', 'create')).toBe(true);
    expect(hasPermission(permissions, 'collectors', 'view')).toBe(true);
  });

  it('should return false when permission is explicitly denied', () => {
    expect(hasPermission(permissions, 'ledger', 'edit')).toBe(false);
  });

  it('should return false when permission does not exist', () => {
    expect(hasPermission(permissions, 'kiotviet', 'sync')).toBe(false);
    expect(hasPermission(permissions, 'ledger', 'nonexistent')).toBe(false);
  });

  it('should return false for empty permissions array', () => {
    expect(hasPermission([], 'ledger', 'view')).toBe(false);
  });
});
