import { describe, it, expect } from 'vitest';
import {
  AVAILABLE_PERMISSIONS,
  ROLE_PERMISSIONS,
  getDefaultPermissions,
  mergePermissions,
  checkPermission,
  groupByModule,
  type Permission,
  type UserRole,
} from '../permissions-config';

describe('permissions-config', () => {
  describe('AVAILABLE_PERMISSIONS', () => {
    it('should have 20 permissions total', () => {
      expect(AVAILABLE_PERMISSIONS).toHaveLength(20);
    });

    it('should have 4 modules', () => {
      const modules = new Set(AVAILABLE_PERMISSIONS.map((p) => p.module));
      expect(modules.size).toBe(4);
      expect(modules).toEqual(new Set(['ledger', 'collectors', 'users', 'kiotviet']));
    });

    it('should have 9 ledger permissions', () => {
      const ledger = AVAILABLE_PERMISSIONS.filter((p) => p.module === 'ledger');
      expect(ledger).toHaveLength(9);
    });

    it('should have 4 collectors permissions', () => {
      const collectors = AVAILABLE_PERMISSIONS.filter((p) => p.module === 'collectors');
      expect(collectors).toHaveLength(4);
    });

    it('should have 4 users permissions', () => {
      const users = AVAILABLE_PERMISSIONS.filter((p) => p.module === 'users');
      expect(users).toHaveLength(4);
    });

    it('should have 3 kiotviet permissions', () => {
      const kiotviet = AVAILABLE_PERMISSIONS.filter((p) => p.module === 'kiotviet');
      expect(kiotviet).toHaveLength(3);
    });

    it('should include view_total in ledger permissions', () => {
      const viewTotal = AVAILABLE_PERMISSIONS.find(
        (p) => p.module === 'ledger' && p.action === 'view_total'
      );
      expect(viewTotal).toBeDefined();
      expect(viewTotal!.label).toBe('Xem tổng tiền');
    });

    it('should have unique module:action keys', () => {
      const keys = AVAILABLE_PERMISSIONS.map((p) => `${p.module}:${p.action}`);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  describe('ROLE_PERMISSIONS', () => {
    it('should define 3 roles', () => {
      const roles = Object.keys(ROLE_PERMISSIONS);
      expect(roles).toEqual(['admin', 'manager', 'staff']);
    });

    it('admin should have all permissions granted', () => {
      const adminPerms = ROLE_PERMISSIONS.admin;
      expect(adminPerms).toHaveLength(20);
      expect(adminPerms.every((p) => p.granted)).toBe(true);
    });

    it('manager should have view_total granted', () => {
      const managerViewTotal = ROLE_PERMISSIONS.manager.find(
        (p) => p.module === 'ledger' && p.action === 'view_total'
      );
      expect(managerViewTotal).toBeDefined();
      expect(managerViewTotal!.granted).toBe(true);
    });

    it('staff should NOT have view_total granted', () => {
      const staffViewTotal = ROLE_PERMISSIONS.staff.find(
        (p) => p.module === 'ledger' && p.action === 'view_total'
      );
      expect(staffViewTotal).toBeDefined();
      expect(staffViewTotal!.granted).toBe(false);
    });

    it('staff should have ledger:view, ledger:create, ledger:export, collectors:view', () => {
      const staffPerms = ROLE_PERMISSIONS.staff;
      const grantedKeys = staffPerms
        .filter((p) => p.granted)
        .map((p) => `${p.module}:${p.action}`);
      expect(grantedKeys).toEqual(
        expect.arrayContaining([
          'ledger:view',
          'ledger:create',
          'ledger:export',
          'collectors:view',
        ])
      );
      expect(grantedKeys).toHaveLength(4);
    });

    it('manager should NOT have kiotviet permissions', () => {
      const kiotviet = ROLE_PERMISSIONS.manager.filter(
        (p) => p.module === 'kiotviet' && p.granted
      );
      expect(kiotviet).toHaveLength(0);
    });

    it('manager should have users:view only', () => {
      const usersPerms = ROLE_PERMISSIONS.manager.filter(
        (p) => p.module === 'users' && p.granted
      );
      expect(usersPerms).toHaveLength(1);
      expect(usersPerms[0].action).toBe('view');
    });
  });

  describe('getDefaultPermissions', () => {
    it('should return admin permissions for admin role', () => {
      const perms = getDefaultPermissions('admin');
      expect(perms.every((p) => p.granted)).toBe(true);
    });

    it('should return staff permissions for staff role', () => {
      const perms = getDefaultPermissions('staff');
      const granted = perms.filter((p) => p.granted);
      expect(granted).toHaveLength(4);
    });

    it('should fall back to staff for unknown role', () => {
      const perms = getDefaultPermissions('unknown' as UserRole);
      const granted = perms.filter((p) => p.granted);
      expect(granted).toHaveLength(4);
    });
  });

  describe('mergePermissions', () => {
    it('should return defaults when no overrides', () => {
      const perms = mergePermissions('staff');
      const granted = perms.filter((p) => p.granted);
      expect(granted).toHaveLength(4);
    });

    it('should return defaults when overrides is empty array', () => {
      const perms = mergePermissions('staff', []);
      const granted = perms.filter((p) => p.granted);
      expect(granted).toHaveLength(4);
    });

    it('should grant a normally-denied permission via override', () => {
      const overrides: Permission[] = [
        { module: 'ledger', action: 'delete', granted: true, label: 'Xóa bản ghi' },
      ];
      const perms = mergePermissions('staff', overrides);
      const deleteP = perms.find((p) => p.module === 'ledger' && p.action === 'delete');
      expect(deleteP!.granted).toBe(true);
    });

    it('should revoke a normally-granted permission via override', () => {
      const overrides: Permission[] = [
        { module: 'ledger', action: 'view', granted: false, label: 'Xem sổ ghi tiền' },
      ];
      const perms = mergePermissions('staff', overrides);
      const viewP = perms.find((p) => p.module === 'ledger' && p.action === 'view');
      expect(viewP!.granted).toBe(false);
    });

    it('should keep non-overridden permissions at their default', () => {
      const overrides: Permission[] = [
        { module: 'ledger', action: 'delete', granted: true, label: 'Xóa bản ghi' },
      ];
      const perms = mergePermissions('staff', overrides);
      const createP = perms.find((p) => p.module === 'ledger' && p.action === 'create');
      expect(createP!.granted).toBe(true); // staff default

      const editP = perms.find((p) => p.module === 'ledger' && p.action === 'edit');
      expect(editP!.granted).toBe(false); // staff default
    });

    it('should always return all 20 permissions', () => {
      const overrides: Permission[] = [
        { module: 'ledger', action: 'view', granted: false, label: 'Xem' },
      ];
      const perms = mergePermissions('manager', overrides);
      expect(perms).toHaveLength(20);
    });
  });

  describe('checkPermission', () => {
    const testPerms: Permission[] = [
      { module: 'ledger', action: 'view', granted: true, label: 'View' },
      { module: 'ledger', action: 'edit', granted: false, label: 'Edit' },
      { module: 'users', action: 'create', granted: true, label: 'Create' },
    ];

    it('should return true for granted permission', () => {
      expect(checkPermission(testPerms, 'ledger', 'view')).toBe(true);
    });

    it('should return false for denied permission', () => {
      expect(checkPermission(testPerms, 'ledger', 'edit')).toBe(false);
    });

    it('should return false for missing permission', () => {
      expect(checkPermission(testPerms, 'kiotviet', 'sync')).toBe(false);
    });

    it('should return true for granted permission in different module', () => {
      expect(checkPermission(testPerms, 'users', 'create')).toBe(true);
    });

    it('should return false for empty permissions array', () => {
      expect(checkPermission([], 'ledger', 'view')).toBe(false);
    });
  });

  describe('groupByModule', () => {
    it('should group permissions by module', () => {
      const perms = getDefaultPermissions('admin');
      const grouped = groupByModule(perms);

      expect(Object.keys(grouped)).toEqual(
        expect.arrayContaining(['ledger', 'collectors', 'users', 'kiotviet'])
      );
      expect(grouped.ledger).toHaveLength(9);
      expect(grouped.collectors).toHaveLength(4);
      expect(grouped.users).toHaveLength(4);
      expect(grouped.kiotviet).toHaveLength(3);
    });

    it('should handle empty array', () => {
      const grouped = groupByModule([]);
      expect(Object.keys(grouped)).toHaveLength(0);
    });

    it('should preserve granted status', () => {
      const perms = getDefaultPermissions('staff');
      const grouped = groupByModule(perms);

      const grantedLedger = grouped.ledger.filter((p) => p.granted);
      expect(grantedLedger.map((p) => p.action)).toEqual(
        expect.arrayContaining(['view', 'create', 'export'])
      );
    });
  });
});
