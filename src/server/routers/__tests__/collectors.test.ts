import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// --- Mock firebase-admin ---
const mockDb = {
  collection: vi.fn(),
};
const mockAuth = {
  verifyIdToken: vi.fn(),
  verifySessionCookie: vi.fn(),
};

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => mockDb,
  getAdminAuth: () => mockAuth,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/server/services/kiotviet.service', () => ({
  syncCustomers: vi.fn(),
  testConnection: vi.fn(),
}));

import { appRouter } from '@/server/router';
import type { TRPCContext } from '@/server/trpc';

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

  const addFn = vi.fn().mockResolvedValue({ id: 'new-collector-id' });
  const allDocs = queryDocs ?? Object.entries(docs).map(([id, data]) => mockDoc(id, data));

  return {
    doc: docFn,
    add: addFn,
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(mockSnapshot(allDocs)),
  };
}

function createContext(uid: string = 'test-uid'): TRPCContext {
  return {
    user: { uid } as any,
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

describe('collectorsRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should return active collectors for user with collectors:view', async () => {
      setupCollections({
        users: {
          docs: {
            'manager-uid': {
              email: 'manager@test.com',
              displayName: 'Manager',
              role: 'manager',
              isActive: true,
              permissions: [],
            },
          },
        },
        collectors: {
          queryDocs: [
            mockDoc('c1', { name: 'Collector 1', phone: '123', isActive: true }),
            mockDoc('c2', { name: 'Collector 2', phone: '456', isActive: true }),
          ],
        },
      });

      const caller = appRouter.createCaller(createContext('manager-uid'));
      const result = await caller.collectors.list();

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('id', 'c1');
      expect(result[0]).toHaveProperty('name', 'Collector 1');
    });

    it('should throw FORBIDDEN for staff without collectors:view override', async () => {
      // Staff by default has collectors:view, so this shouldn't throw
      // Let's test with a staff who had their collectors:view revoked
      setupCollections({
        users: {
          docs: {
            'limited-staff': {
              email: 'limited@test.com',
              displayName: 'Limited',
              role: 'staff',
              isActive: true,
              permissions: [
                { module: 'collectors', action: 'view', granted: false, label: 'View' },
              ],
            },
          },
        },
      });

      const caller = appRouter.createCaller(createContext('limited-staff'));
      await expect(caller.collectors.list()).rejects.toThrow(TRPCError);
    });
  });

  describe('create', () => {
    it('should create a collector when user has collectors:create', async () => {
      setupCollections({
        users: {
          docs: {
            'manager-uid': {
              email: 'manager@test.com',
              displayName: 'Manager',
              role: 'manager',
              isActive: true,
              permissions: [],
            },
          },
        },
        collectors: { docs: {} },
      });

      const caller = appRouter.createCaller(createContext('manager-uid'));
      const result = await caller.collectors.create({
        name: 'New Collector',
        phone: '0123456789',
      });

      expect(result).toHaveProperty('id');
    });

    it('should throw FORBIDDEN for staff trying to create', async () => {
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
      await expect(
        caller.collectors.create({ name: 'Collector' })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('update', () => {
    it('should update collector when user has collectors:edit', async () => {
      const collectorsCol = mockCollection({
        docs: {
          'c1': { name: 'Old Name', phone: '123', isActive: true },
        },
      });

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'users') {
          return mockCollection({
            docs: {
              'manager-uid': {
                email: 'manager@test.com',
                displayName: 'Manager',
                role: 'manager',
                isActive: true,
                permissions: [],
              },
            },
          });
        }
        if (name === 'collectors') return collectorsCol;
        return mockCollection({});
      });

      const caller = appRouter.createCaller(createContext('manager-uid'));
      const result = await caller.collectors.update({
        id: 'c1',
        name: 'New Name',
      });

      expect(result.success).toBe(true);
    });

    it('should throw NOT_FOUND for non-existent collector', async () => {
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
        collectors: { docs: {} },
      });

      const caller = appRouter.createCaller(createContext('admin-uid'));
      await expect(
        caller.collectors.update({ id: 'nonexistent', name: 'Test' })
      ).rejects.toThrow('Người nộp tiền không tồn tại');
    });
  });

  describe('delete (soft)', () => {
    it('should soft-delete a collector', async () => {
      const collectorsCol = mockCollection({
        docs: {
          'c1': { name: 'To Delete', isActive: true },
        },
      });

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'users') {
          return mockCollection({
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
        }
        if (name === 'collectors') return collectorsCol;
        return mockCollection({});
      });

      const caller = appRouter.createCaller(createContext('admin-uid'));
      const result = await caller.collectors.delete({ id: 'c1' });
      expect(result.success).toBe(true);
    });
  });
});
