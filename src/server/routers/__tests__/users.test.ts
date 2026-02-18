import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import type { Permission } from '@/lib/permissions-config';
import { mergePermissions } from '@/lib/permissions-config';

// --- Mock firebase-admin before any imports that use it ---
const mockDb = {
  collection: vi.fn(),
};
const mockAuth = {
  verifyIdToken: vi.fn(),
  verifySessionCookie: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  getUserByEmail: vi.fn(),
};

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => mockDb,
  getAdminAuth: () => mockAuth,
}));

vi.mock('server-only', () => ({}));

// Mock kiotviet service (customers router depends on it)
vi.mock('@/server/services/kiotviet.service', () => ({
  syncCustomers: vi.fn(),
  testConnection: vi.fn(),
}));

import { appRouter } from '@/server/router';
import type { TRPCContext } from '@/server/trpc';

// --- Helpers ---
function mockDoc(id: string, data: Record<string, any> | null) {
  return {
    exists: data !== null,
    id,
    data: () => data,
    ref: { id },
  };
}

function mockSnapshot(docs: ReturnType<typeof mockDoc>[]) {
  return { docs, empty: docs.length === 0, size: docs.length };
}

function mockCollection(config: {
  docs?: Record<string, Record<string, any>>;
  queryDocs?: ReturnType<typeof mockDoc>[];
}) {
  const { docs = {}, queryDocs } = config;

  const docFn = vi.fn((id: string) => ({
    get: vi.fn().mockResolvedValue(mockDoc(id, docs[id] ?? null)),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }));

  const addFn = vi.fn().mockResolvedValue({ id: 'new-doc-id' });

  const allDocs = queryDocs ?? Object.entries(docs).map(([id, data]) => mockDoc(id, data));
  const snap = mockSnapshot(allDocs);

  return {
    doc: docFn,
    add: addFn,
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(snap),
  };
}

function createContext(uid: string = 'test-uid'): TRPCContext {
  return {
    user: { uid, email: `${uid}@test.com` } as any,
    userData: null,
    permissions: [],
  };
}

function setupCollections(collections: Record<string, Parameters<typeof mockCollection>[0]>) {
  mockDb.collection.mockImplementation((name: string) => {
    if (collections[name]) return mockCollection(collections[name]);
    return mockCollection({});
  });
}

// --- Tests ---
describe('usersRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCurrentUser', () => {
    it('should return current user data and permissions', async () => {
      const adminPerms = mergePermissions('admin');
      setupCollections({
        users: {
          docs: {
            'admin-uid': {
              email: 'admin@test.com',
              displayName: 'Admin User',
              role: 'admin',
              isActive: true,
              permissions: [],
            },
          },
        },
      });

      const caller = appRouter.createCaller(createContext('admin-uid'));
      const result = await caller.users.getCurrentUser();

      expect(result.id).toBe('admin-uid');
      expect(result.role).toBe('admin');
      expect(result.displayName).toBe('Admin User');
      expect(result.permissions).toBeDefined();
      expect(result.permissions.length).toBeGreaterThan(0);
    });

    it('should throw UNAUTHORIZED for unauthenticated user', async () => {
      const caller = appRouter.createCaller({
        user: null,
        userData: null,
        permissions: [],
      });

      await expect(caller.users.getCurrentUser()).rejects.toThrow(TRPCError);
    });

    it('should throw FORBIDDEN for inactive user', async () => {
      setupCollections({
        users: {
          docs: {
            'inactive-uid': {
              email: 'inactive@test.com',
              displayName: 'Inactive',
              role: 'staff',
              isActive: false,
            },
          },
        },
      });

      const caller = appRouter.createCaller(createContext('inactive-uid'));
      await expect(caller.users.getCurrentUser()).rejects.toThrow(TRPCError);
    });
  });

  describe('list', () => {
    it('should return all users when caller has users:view permission', async () => {
      const userDocs = {
        'admin-uid': {
          email: 'admin@test.com',
          displayName: 'Admin',
          role: 'admin',
          isActive: true,
          permissions: [],
        },
        'staff-uid': {
          email: 'staff@test.com',
          displayName: 'Staff',
          role: 'staff',
          isActive: true,
          permissions: [],
        },
      };

      setupCollections({ users: { docs: userDocs } });

      const caller = appRouter.createCaller(createContext('admin-uid'));
      const result = await caller.users.list();

      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should throw FORBIDDEN for staff without users:view', async () => {
      setupCollections({
        users: {
          docs: {
            'staff-uid': {
              email: 'staff@test.com',
              displayName: 'Staff',
              role: 'staff',
              isActive: true,
              permissions: [],
            },
          },
        },
      });

      const caller = appRouter.createCaller(createContext('staff-uid'));
      await expect(caller.users.list()).rejects.toThrow(TRPCError);
    });
  });

  describe('create', () => {
    it('should create a staff user with shadow email', async () => {
      setupCollections({
        users: {
          docs: {
            'admin-uid': {
              email: 'admin@test.com',
              displayName: 'Admin',
              role: 'admin',
              isActive: true,
              permissions: [],
            },
          },
        },
      });

      mockAuth.getUserByEmail.mockImplementation(() => {
        const err: any = new Error('not found');
        err.code = 'auth/user-not-found';
        throw err;
      });
      mockAuth.createUser.mockResolvedValue({ uid: 'new-staff-uid' });

      const caller = appRouter.createCaller(createContext('admin-uid'));
      const result = await caller.users.create({
        username: 'newstaff',
        displayName: 'New Staff',
        password: 'password123',
        role: 'staff',
      });

      expect(result.id).toBe('new-staff-uid');
      expect(mockAuth.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'newstaff@sotienplus.local',
          password: 'password123',
          displayName: 'New Staff',
        })
      );
    });

    it('should require email for admin accounts', async () => {
      setupCollections({
        users: {
          docs: {
            'admin-uid': {
              email: 'admin@test.com',
              displayName: 'Admin',
              role: 'admin',
              isActive: true,
              permissions: [],
            },
          },
        },
      });

      const caller = appRouter.createCaller(createContext('admin-uid'));
      await expect(
        caller.users.create({
          username: 'newadmin',
          displayName: 'New Admin',
          password: 'password123',
          role: 'admin',
        })
      ).rejects.toThrow('Admin cần có email thực');
    });

    it('should throw CONFLICT when username already exists', async () => {
      setupCollections({
        users: {
          docs: {
            'admin-uid': {
              email: 'admin@test.com',
              displayName: 'Admin',
              role: 'admin',
              isActive: true,
              permissions: [],
            },
          },
        },
      });

      mockAuth.getUserByEmail.mockResolvedValue({ uid: 'existing-uid' });

      const caller = appRouter.createCaller(createContext('admin-uid'));
      await expect(
        caller.users.create({
          username: 'existinguser',
          displayName: 'Duplicate',
          password: 'password123',
          role: 'staff',
        })
      ).rejects.toThrow('Username đã tồn tại');
    });

    it('should rollback Auth user if Firestore write fails', async () => {
      const usersCol = mockCollection({
        docs: {
          'admin-uid': {
            email: 'admin@test.com',
            displayName: 'Admin',
            role: 'admin',
            isActive: true,
            permissions: [],
          },
        },
      });

      // Make the set call fail
      usersCol.doc.mockImplementation((id: string) => {
        if (id === 'admin-uid') {
          return {
            get: vi.fn().mockResolvedValue(mockDoc('admin-uid', {
              email: 'admin@test.com',
              displayName: 'Admin',
              role: 'admin',
              isActive: true,
              permissions: [],
            })),
            set: vi.fn().mockRejectedValue(new Error('Firestore error')),
            update: vi.fn(),
          };
        }
        return {
          get: vi.fn().mockResolvedValue(mockDoc(id, null)),
          set: vi.fn().mockRejectedValue(new Error('Firestore error')),
          update: vi.fn(),
        };
      });

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'users') return usersCol;
        return mockCollection({});
      });

      mockAuth.getUserByEmail.mockImplementation(() => {
        const err: any = new Error('not found');
        err.code = 'auth/user-not-found';
        throw err;
      });
      mockAuth.createUser.mockResolvedValue({ uid: 'new-uid' });

      const caller = appRouter.createCaller(createContext('admin-uid'));
      await expect(
        caller.users.create({
          username: 'failuser',
          displayName: 'Fail',
          password: 'password123',
          role: 'staff',
        })
      ).rejects.toThrow('Tạo user thất bại');

      expect(mockAuth.deleteUser).toHaveBeenCalledWith('new-uid');
    });
  });

  describe('updatePermissions', () => {
    it('should reject non-admin from updating permissions (even with users:edit)', async () => {
      // Give manager users:edit override so the middleware passes,
      // then the handler's own admin check should reject
      setupCollections({
        users: {
          docs: {
            'manager-uid': {
              email: 'manager@test.com',
              displayName: 'Manager',
              role: 'manager',
              isActive: true,
              permissions: [
                { module: 'users', action: 'edit', granted: true, label: 'Edit' },
              ],
            },
          },
        },
      });

      const caller = appRouter.createCaller(createContext('manager-uid'));
      await expect(
        caller.users.updatePermissions({
          id: 'some-uid',
          permissions: [{ module: 'ledger', action: 'view', granted: true, label: 'View' }],
        })
      ).rejects.toThrow('Chỉ admin mới có thể thay đổi quyền');
    });

    it('should reject editing own permissions', async () => {
      setupCollections({
        users: {
          docs: {
            'admin-uid': {
              email: 'admin@test.com',
              displayName: 'Admin',
              role: 'admin',
              isActive: true,
              permissions: [],
            },
          },
        },
      });

      const caller = appRouter.createCaller(createContext('admin-uid'));
      await expect(
        caller.users.updatePermissions({
          id: 'admin-uid',
          permissions: [{ module: 'ledger', action: 'view', granted: true, label: 'View' }],
        })
      ).rejects.toThrow('Không thể chỉnh sửa quyền của chính mình');
    });

    it('should reject invalid permission keys', async () => {
      setupCollections({
        users: {
          docs: {
            'admin-uid': {
              email: 'admin@test.com',
              displayName: 'Admin',
              role: 'admin',
              isActive: true,
              permissions: [],
            },
          },
        },
      });

      const caller = appRouter.createCaller(createContext('admin-uid'));
      await expect(
        caller.users.updatePermissions({
          id: 'target-uid',
          permissions: [{ module: 'fake', action: 'hack', granted: true, label: 'Hack' }],
        })
      ).rejects.toThrow('Quyền không hợp lệ: fake:hack');
    });
  });

  describe('updatePassword', () => {
    it('should allow admin to reset any password', async () => {
      setupCollections({
        users: {
          docs: {
            'admin-uid': {
              email: 'admin@test.com',
              displayName: 'Admin',
              role: 'admin',
              isActive: true,
              permissions: [],
            },
          },
        },
      });

      const caller = appRouter.createCaller(createContext('admin-uid'));
      const result = await caller.users.updatePassword({
        id: 'target-uid',
        password: 'newpassword123',
      });

      expect(result.success).toBe(true);
      expect(mockAuth.updateUser).toHaveBeenCalledWith('target-uid', { password: 'newpassword123' });
    });

    it('should prevent non-admin from resetting admin password', async () => {
      const managerCol = mockCollection({
        docs: {
          'manager-uid': {
            email: 'manager@test.com',
            displayName: 'Manager',
            role: 'manager',
            isActive: true,
            permissions: [
              { module: 'users', action: 'edit', granted: true, label: 'Edit' },
            ],
          },
        },
      });

      // For the manager's own doc lookup (middleware) + target doc lookup (endpoint)
      managerCol.doc.mockImplementation((id: string) => {
        const docs: Record<string, any> = {
          'manager-uid': {
            email: 'manager@test.com',
            displayName: 'Manager',
            role: 'manager',
            isActive: true,
            permissions: [
              { module: 'users', action: 'edit', granted: true, label: 'Edit' },
            ],
          },
          'admin-target': {
            email: 'admin2@test.com',
            displayName: 'Admin2',
            role: 'admin',
            isActive: true,
          },
        };
        return {
          get: vi.fn().mockResolvedValue(mockDoc(id, docs[id] ?? null)),
          set: vi.fn().mockResolvedValue(undefined),
          update: vi.fn().mockResolvedValue(undefined),
        };
      });

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'users') return managerCol;
        return mockCollection({});
      });

      const caller = appRouter.createCaller(createContext('manager-uid'));
      await expect(
        caller.users.updatePassword({
          id: 'admin-target',
          password: 'newpassword123',
        })
      ).rejects.toThrow('Chỉ admin mới có thể đặt lại mật khẩu admin');
    });
  });

  describe('delete', () => {
    it('should soft-delete by disabling Auth and marking inactive', async () => {
      const usersCol = mockCollection({
        docs: {
          'admin-uid': {
            email: 'admin@test.com',
            displayName: 'Admin',
            role: 'admin',
            isActive: true,
            permissions: [],
          },
          'target-uid': {
            email: 'staff@test.com',
            displayName: 'Staff',
            role: 'staff',
            isActive: true,
          },
        },
      });

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'users') return usersCol;
        return mockCollection({});
      });

      const caller = appRouter.createCaller(createContext('admin-uid'));
      const result = await caller.users.delete({ id: 'target-uid' });

      expect(result.success).toBe(true);
      expect(mockAuth.updateUser).toHaveBeenCalledWith('target-uid', { disabled: true });
    });
  });
});
