export type UserRole = 'admin' | 'manager' | 'staff';

export interface Permission {
  module: string;
  action: string;
  granted: boolean;
  label: string;
}

// All available permissions
export const AVAILABLE_PERMISSIONS: Omit<Permission, 'granted'>[] = [
  // Sổ Ghi Tiền
  { module: 'ledger', action: 'view', label: 'Xem sổ ghi tiền' },
  { module: 'ledger', action: 'create', label: 'Thêm bản ghi mới' },
  { module: 'ledger', action: 'edit', label: 'Sửa bản ghi' },
  { module: 'ledger', action: 'delete', label: 'Xóa bản ghi' },
  { module: 'ledger', action: 'check', label: 'Duyệt tiền (tick ✓)' },
  { module: 'ledger', action: 'bulk_check', label: 'Duyệt hàng loạt' },
  { module: 'ledger', action: 'export', label: 'Xuất Excel' },
  { module: 'ledger', action: 'rpa_sync', label: 'Đồng bộ KiotViet (RPA)' },

  // Người Nộp Tiền
  { module: 'collectors', action: 'view', label: 'Xem người nộp tiền' },
  { module: 'collectors', action: 'create', label: 'Thêm người nộp tiền' },
  { module: 'collectors', action: 'edit', label: 'Sửa người nộp tiền' },
  { module: 'collectors', action: 'delete', label: 'Xóa người nộp tiền' },

  // Quản lý Người Dùng
  { module: 'users', action: 'view', label: 'Xem quản lý người dùng' },
  { module: 'users', action: 'create', label: 'Thêm người dùng' },
  { module: 'users', action: 'edit', label: 'Sửa người dùng' },
  { module: 'users', action: 'delete', label: 'Xóa người dùng' },

  // KiotViet
  { module: 'kiotviet', action: 'view', label: 'Xem cài đặt KiotViet' },
  { module: 'kiotviet', action: 'configure', label: 'Cấu hình KiotViet API' },
  { module: 'kiotviet', action: 'sync', label: 'Đồng bộ khách hàng' },
];

// Helper: create Permission[] with specific grants
function withGrants(grants: Record<string, string[]>): Permission[] {
  return AVAILABLE_PERMISSIONS.map((p) => ({
    ...p,
    granted: grants[p.module]?.includes(p.action) ?? false,
  }));
}

// Role presets
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: AVAILABLE_PERMISSIONS.map((p) => ({ ...p, granted: true })),

  manager: withGrants({
    ledger: ['view', 'create', 'edit', 'delete', 'check', 'bulk_check', 'export', 'rpa_sync'],
    collectors: ['view', 'create', 'edit', 'delete'],
    users: ['view'],
    kiotviet: [],
  }),

  staff: withGrants({
    ledger: ['view', 'create', 'export'],
    collectors: ['view'],
    users: [],
    kiotviet: [],
  }),
};

// Module labels for UI
export const MODULE_LABELS: Record<string, string> = {
  ledger: 'Sổ Ghi Tiền',
  collectors: 'Người Nộp Tiền',
  users: 'Quản Lý Người Dùng',
  kiotviet: 'KiotViet',
};

// Get default permissions for a role
export function getDefaultPermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.staff;
}

// Merge role defaults with user-specific overrides
export function mergePermissions(role: UserRole, userOverrides?: Permission[]): Permission[] {
  const defaults = getDefaultPermissions(role);
  if (!userOverrides || userOverrides.length === 0) {
    return defaults;
  }

  const overrideMap = new Map<string, boolean>();
  for (const p of userOverrides) {
    overrideMap.set(`${p.module}:${p.action}`, p.granted);
  }

  return defaults.map((p) => {
    const key = `${p.module}:${p.action}`;
    const overrideGranted = overrideMap.get(key);
    return overrideGranted !== undefined ? { ...p, granted: overrideGranted } : p;
  });
}

// Check if a permission is granted
export function checkPermission(permissions: Permission[], module: string, action: string): boolean {
  return permissions.some((p) => p.module === module && p.action === action && p.granted);
}

// Group permissions by module (for UI grid)
export function groupByModule(permissions: Permission[]): Record<string, Permission[]> {
  const grouped: Record<string, Permission[]> = {};
  for (const p of permissions) {
    if (!grouped[p.module]) grouped[p.module] = [];
    grouped[p.module].push(p);
  }
  return grouped;
}
