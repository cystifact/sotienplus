import { vi } from 'vitest';

// --- Firestore document mock ---
export function createMockDoc(id: string, data: Record<string, any> | null) {
  return {
    exists: data !== null,
    id,
    data: () => data,
    ref: { id, path: `mock/${id}` },
  };
}

// --- Firestore query snapshot mock ---
export function createMockQuerySnapshot(docs: ReturnType<typeof createMockDoc>[]) {
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach: (cb: (doc: any) => void) => docs.forEach(cb),
  };
}

// --- Chainable Firestore query mock ---
export function createMockQuery(docs: ReturnType<typeof createMockDoc>[] = []) {
  const snapshot = createMockQuerySnapshot(docs);
  const query: any = {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    startAfter: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(snapshot),
  };
  return query;
}

// --- Firestore collection mock ---
export interface MockCollectionConfig {
  docs?: Record<string, Record<string, any>>;
  queryDocs?: ReturnType<typeof createMockDoc>[];
}

export function createMockCollection(config: MockCollectionConfig = {}) {
  const { docs = {}, queryDocs } = config;

  const docFn = vi.fn((id: string) => {
    const data = docs[id] ?? null;
    return {
      get: vi.fn().mockResolvedValue(createMockDoc(id, data)),
      set: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
  });

  const addFn = vi.fn().mockImplementation(async (data: any) => {
    const id = `auto_${Date.now()}`;
    return { id, path: `mock/${id}` };
  });

  // Build query chain from queryDocs or all docs
  const allDocs = queryDocs ??
    Object.entries(docs).map(([id, data]) => createMockDoc(id, data));

  const query = createMockQuery(allDocs);

  return {
    doc: docFn,
    add: addFn,
    where: query.where,
    orderBy: query.orderBy,
    limit: query.limit,
    get: query.get,
  };
}

// --- Full Firestore DB mock ---
export function createMockDb(collections: Record<string, MockCollectionConfig> = {}) {
  const collectionFn = vi.fn((name: string) => {
    return createMockCollection(collections[name] || {});
  });

  const batchFn = vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  }));

  const runTransactionFn = vi.fn(async (fn: (t: any) => Promise<any>) => {
    const transaction = {
      get: vi.fn().mockResolvedValue(createMockDoc('tx-doc', {})),
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    return fn(transaction);
  });

  return {
    collection: collectionFn,
    batch: batchFn,
    runTransaction: runTransactionFn,
  };
}

// --- Firebase Auth mock ---
export function createMockAuth() {
  return {
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'test-uid', email: 'test@example.com' }),
    verifySessionCookie: vi.fn().mockResolvedValue({ uid: 'test-uid', email: 'test@example.com' }),
    createUser: vi.fn().mockResolvedValue({ uid: 'new-user-uid' }),
    updateUser: vi.fn().mockResolvedValue(undefined),
    deleteUser: vi.fn().mockResolvedValue(undefined),
    getUserByEmail: vi.fn().mockImplementation(() => {
      const error: any = new Error('User not found');
      error.code = 'auth/user-not-found';
      throw error;
    }),
    revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
  };
}

// --- Convenience: set up full vi.mock for firebase-admin ---
export function setupFirebaseAdminMock(
  db: ReturnType<typeof createMockDb> = createMockDb(),
  auth: ReturnType<typeof createMockAuth> = createMockAuth()
) {
  vi.mock('@/lib/firebase-admin', () => ({
    getAdminDb: () => db,
    getAdminAuth: () => auth,
  }));

  return { db, auth };
}
