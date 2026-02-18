Do I need to manually test anything?
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// --- Mocks ---
const mockDb: any = {
  collection: vi.fn(),
  batch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  })),
  runTransaction: vi.fn(),
  getAll: vi.fn(),
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
    ref: { id, path: `cash_records/${id}` },
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

  const docFn = vi.fn((id?: string) => {
    const docId = id || `auto_${Date.now()}`;
    return {
      get: vi.fn().mockResolvedValue(mockDoc(docId, docs[docId] ?? null)),
      set: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      id: docId,
    };
  });

  const addFn = vi.fn().mockResolvedValue({ id: 'new-record-id' });
  const allDocs = queryDocs ?? Object.entries(docs).map(([id, data]) => mockDoc(id, data));

  return {
    doc: docFn,
    add: addFn,
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
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

describe('cashRecordsRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.batch.mockReturnValue({
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    });
  });

  describe('list', () => {
    it('should return active records for authorized user', async () => {
      const records = [
        mockDoc('r1', {
          date: '2025-01-15',
          customerName: 'Customer A',
          amount: 100000,
          isActive: true,
          createdAt: null,
          updatedAt: null,
          rpaSyncAt: null,
          rpaQueuedAt: null,
          rpaProcessingAt: null,
        }),
        mockDoc('r2', {
          date: '2025-01-15',
          customerName: 'Customer B',
          amount: 200000,
          isActive: false, // should be filtered out
          createdAt: null,
          updatedAt: null,
          rpaSyncAt: null,
          rpaQueuedAt: null,
          rpaProcessingAt: null,
        }),
      ];

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
        if (name === 'cash_records') {
          return mockCollection({ queryDocs: records });
        }
        return mockCollection({});
      });

      const caller = appRouter.createCaller(createContext('staff-uid'));
      const result = await caller.cashRecords.list({ date: '2025-01-15' });

      // Should filter out inactive records
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('r1');
    });

    it('should throw FORBIDDEN for user without ledger:view', async () => {
      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'users') {
          return mockCollection({
            docs: {
              'limited-uid': {
                email: 'limited@test.com',
                displayName: 'Limited',
                role: 'staff',
                isActive: true,
                permissions: [
                  { module: 'ledger', action: 'view', granted: false, label: 'View' },
                ],
              },
            },
          });
        }
        return mockCollection({});
      });

      const caller = appRouter.createCaller(createContext('limited-uid'));
      await expect(
        caller.cashRecords.list({ date: '2025-01-15' })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('create', () => {
    it('should create a record with RPA pending status for non-XB code', async () => {
      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'users') {
          return mockCollection({
            docs: {
              'staff-uid': {
                email: 'staff@test.com',
                displayName: 'Staff User',
                role: 'staff',
                isActive: true,
                permissions: [],
              },
            },
          });
        }
        if (name === 'cash_records') {
          const col = mockCollection({ docs: {} });
          col.add.mockResolvedValue({ id: 'new-record-id' });
          return col;
        }
        return mockCollection({});
      });

      const caller = appRouter.createCaller(createContext('staff-uid'));
      const result = await caller.cashRecords.create({
        date: '2025-01-15',
        customerName: 'Test Customer',
        customerCode: 'C001',
        amount: 500000,
        collectorId: 'col1',
        collectorName: 'Collector 1',
      });

      expect(result.id).toBe('new-record-id');
    });

    it('should set rpaStatus to null for XB-prefix customer codes', async () => {
      const addSpy = vi.fn().mockResolvedValue({ id: 'xb-record-id' });

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
        if (name === 'cash_records') {
          const col = mockCollection({ docs: {} });
          col.add = addSpy;
          return col;
        }
        return mockCollection({});
      });

      const caller = appRouter.createCaller(createContext('staff-uid'));
      await caller.cashRecords.create({
        date: '2025-01-15',
        customerName: 'XB Customer',
        customerCode: 'XB001',
        amount: 100000,
        collectorId: 'col1',
        collectorName: 'Collector 1',
      });

      const addCallArgs = addSpy.mock.calls[0][0];
      expect(addCallArgs.rpaStatus).toBeNull();
      expect(addCallArgs.rpaQueuedAt).toBeNull();
    });
  });

  describe('dailySummary', () => {
    it('should return totalAmount for admin', async () => {
      const records = [
        mockDoc('r1', { date: '2025-01-15', amount: 100000, isActive: true, checkActualReceived: true, checkKiotVietEntered: false }),
        mockDoc('r2', { date: '2025-01-15', amount: 200000, isActive: true, checkActualReceived: false, checkKiotVietEntered: true }),
      ];

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
        if (name === 'cash_records') {
          return mockCollection({ queryDocs: records });
        }
        return mockCollection({});
      });

      const caller = appRouter.createCaller(createContext('admin-uid'));
      const result = await caller.cashRecords.dailySummary({ date: '2025-01-15' });

      expect(result.totalAmount).toBe(300000);
      expect(result.totalRecords).toBe(2);
      expect(result.checkActualCount).toBe(1);
      expect(result.checkKiotVietCount).toBe(1);
    });

    it('should return totalAmount: 0 for staff without view_total', async () => {
      const records = [
        mockDoc('r1', { date: '2025-01-15', amount: 100000, isActive: true, checkActualReceived: false, checkKiotVietEntered: false }),
      ];

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
        if (name === 'cash_records') {
          return mockCollection({ queryDocs: records });
        }
        return mockCollection({});
      });

      const caller = appRouter.createCaller(createContext('staff-uid'));
      const result = await caller.cashRecords.dailySummary({ date: '2025-01-15' });

      // Staff doesn't have view_total by default
      expect(result.totalAmount).toBe(0);
      expect(result.totalRecords).toBe(1);
    });

    it('should return totalAmount for manager (has view_total)', async () => {
      const records = [
        mockDoc('r1', { date: '2025-01-15', amount: 500000, isActive: true, checkActualReceived: false, checkKiotVietEntered: false }),
      ];

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
        if (name === 'cash_records') {
          return mockCollection({ queryDocs: records });
        }
        return mockCollection({});
      });

      const caller = appRouter.createCaller(createContext('manager-uid'));
      const result = await caller.cashRecords.dailySummary({ date: '2025-01-15' });

      expect(result.totalAmount).toBe(500000);
    });

    it('should filter out inactive records from summary', async () => {
      const records = [
        mockDoc('r1', { date: '2025-01-15', amount: 100000, isActive: true, checkActualReceived: true, checkKiotVietEntered: false }),
        mockDoc('r2', { date: '2025-01-15', amount: 999999, isActive: false, checkActualReceived: true, checkKiotVietEntered: true }),
      ];

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
        if (name === 'cash_records') {
          return mockCollection({ queryDocs: records });
        }
        return mockCollection({});
      });

      const caller = appRouter.createCaller(createContext('admin-uid'));
      const result = await caller.cashRecords.dailySummary({ date: '2025-01-15' });

      expect(result.totalAmount).toBe(100000);
      expect(result.totalRecords).toBe(1);
    });
  });

  describe('delete', () => {
    it('should soft-delete a record', async () => {
      const cashCol = mockCollection({
        docs: {
          'r1': {
            date: '2025-01-15',
            customerName: 'Customer',
            amount: 100000,
            isActive: true,
          },
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
        if (name === 'cash_records') return cashCol;
        return mockCollection({});
      });

      const caller = appRouter.createCaller(createContext('admin-uid'));
      const result = await caller.cashRecords.delete({ id: 'r1' });
      expect(result.success).toBe(true);
    });

    it('should throw NOT_FOUND for non-existent record', async () => {
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
        if (name === 'cash_records') return mockCollection({ docs: {} });
        return mockCollection({});
      });

      const caller = appRouter.createCaller(createContext('admin-uid'));
      await expect(
        caller.cashRecords.delete({ id: 'nonexistent' })
      ).rejects.toThrow('Bản ghi không tồn tại');
    });
  });

  describe('toggleCheck', () => {
    it('should toggle checkActualReceived', async () => {
      const cashCol = mockCollection({
        docs: {
          'r1': {
            date: '2025-01-15',
            customerName: 'Customer',
            amount: 100000,
            isActive: true,
            checkActualReceived: false,
          },
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
        if (name === 'cash_records') return cashCol;
        return mockCollection({});
      });

      const caller = appRouter.createCaller(createContext('manager-uid'));
      const result = await caller.cashRecords.toggleCheck({
        id: 'r1',
        field: 'checkActualReceived',
        value: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('checkDuplicate', () => {
    it('should detect duplicates by customerName + amount + date', async () => {
      const records = [
        mockDoc('r1', {
          date: '2025-01-15',
          customerName: 'Same Customer',
          amount: 100000,
          isActive: true,
          collectorName: 'Col 1',
          createdByName: 'Staff 1',
        }),
      ];

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
        if (name === 'cash_records') {
          return mockCollection({ queryDocs: records });
        }
        return mockCollection({});
      });

      const caller = appRouter.createCaller(createContext('staff-uid'));
      const result = await caller.cashRecords.checkDuplicate({
        date: '2025-01-15',
        customerName: 'Same Customer',
        amount: 100000,
      });

      expect(result.hasDuplicate).toBe(true);
      expect(result.duplicates).toHaveLength(1);
    });
  });
});
