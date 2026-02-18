import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// --- Mocks ---
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

const mockSyncCustomers = vi.fn();
const mockTestConnection = vi.fn();

vi.mock('@/server/services/kiotviet.service', () => ({
  syncCustomers: (...args: any[]) => mockSyncCustomers(...args),
  testConnection: (...args: any[]) => mockTestConnection(...args),
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
  }));

  const allDocs = queryDocs ?? Object.entries(docs).map(([id, data]) => mockDoc(id, data));

  return {
    doc: docFn,
    add: vi.fn().mockResolvedValue({ id: 'new-id' }),
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

describe('customersRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should return active customers for user with ledger:view', async () => {
      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'users') {
          return mockCollection({
            docs: {
              'staff-uid': {
                email: 'staff@test.com',
                displayName: 'Staff',
                role: 'staff',
                isActive: true,
                permissions: [],
              },
            },
          });
        }
        if (name === 'customers') {
          return mockCollection({
            queryDocs: [
              mockDoc('cust1', { name: 'Customer 1', code: 'C001', isActive: true }),
            ],
          });
        }
        return mockCollection({});
      });

      const caller = appRouter.createCaller(createContext('staff-uid'));
      const result = await caller.customers.list();

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('id', 'cust1');
    });
  });

  describe('getSettings', () => {
    it('should return configured: false when no settings doc', async () => {
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
        if (name === 'settings') {
          return mockCollection({ docs: {} }); // no 'kiotviet' doc
        }
        return mockCollection({});
      });

      const caller = appRouter.createCaller(createContext('admin-uid'));
      const result = await caller.customers.getSettings();

      expect(result.configured).toBe(false);
    });

    it('should mask clientSecret (return hasSecret flag)', async () => {
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
        if (name === 'settings') {
          return mockCollection({
            docs: {
              kiotviet: {
                clientId: 'test-client-id',
                clientSecret: 'secret-value',
                retailerCode: 'myshop',
                lastCustomerSync: null,
                lastCustomerCount: 42,
              },
            },
          });
        }
        return mockCollection({});
      });

      const caller = appRouter.createCaller(createContext('admin-uid'));
      const result = await caller.customers.getSettings();

      expect(result.configured).toBe(true);
      expect(result.hasSecret).toBe(true);
      expect(result.retailerCode).toBe('myshop');
      // Should NOT expose the actual secret
      expect((result as any).clientSecret).toBeUndefined();
    });
  });

  describe('sync', () => {
    it('should call syncCustomers service', async () => {
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
        return mockCollection({});
      });

      mockSyncCustomers.mockResolvedValue({ synced: 100 });

      const caller = appRouter.createCaller(createContext('admin-uid'));
      const result = await caller.customers.sync();

      expect(mockSyncCustomers).toHaveBeenCalled();
      expect(result).toEqual({ synced: 100 });
    });

    it('should throw FORBIDDEN for staff without kiotviet:sync', async () => {
      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'users') {
          return mockCollection({
            docs: {
              'staff-uid': {
                email: 'staff@test.com',
                displayName: 'Staff',
                role: 'staff',
                isActive: true,
                permissions: [],
              },
            },
          });
        }
        return mockCollection({});
      });

      const caller = appRouter.createCaller(createContext('staff-uid'));
      await expect(caller.customers.sync()).rejects.toThrow(TRPCError);
    });
  });

  describe('saveSettings', () => {
    it('should save kiotviet settings for admin', async () => {
      const settingsCol = mockCollection({ docs: {} });

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
        if (name === 'settings') return settingsCol;
        return mockCollection({});
      });

      const caller = appRouter.createCaller(createContext('admin-uid'));
      const result = await caller.customers.saveSettings({
        clientId: 'new-client-id',
        clientSecret: 'new-secret',
        retailerCode: 'newshop',
      });

      expect(result.success).toBe(true);
    });
  });
});
