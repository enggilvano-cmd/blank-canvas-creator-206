import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup após cada teste
afterEach(() => {
  cleanup();
  // Clear all mock stores to ensure test isolation
  Object.values(idbStore).forEach(store => store.clear());
});

// Mock do useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      user_metadata: {
        full_name: 'Test User',
      },
    },
    session: {
      access_token: 'test-token',
    },
    profile: {
      id: 'test-profile-id',
      user_id: 'test-user-id',
      role: 'user',
    },
    isLoading: false,
    signOut: vi.fn(),
  }),
  AuthContext: {},
}));

// Mock do matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock do ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock do Supabase Client
const createQueryBuilder = () => {
  const builder: any = {};
  
  const methods = [
    'select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'gt', 'gte', 
    'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'contrained', 
    'order', 'limit', 'range'
  ];
  
  methods.forEach(method => {
    builder[method] = vi.fn().mockReturnValue(builder);
  });

  builder.single = vi.fn(() => Promise.resolve({ data: {}, error: null }));
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: {}, error: null }));
  builder.then = (resolve: any) => resolve({ data: [], error: null });

  return builder;
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => createQueryBuilder()),
    rpc: vi.fn(() => Promise.resolve({ data: { success: true }, error: null })),
    functions: {
      invoke: vi.fn(() => Promise.resolve({ data: {}, error: null })),
    },
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'test-user-id' } }, error: null })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'test-token' } }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    channel: vi.fn(() => ({
      on: vi.fn(() => ({
        subscribe: vi.fn(),
      })),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })),
  },
}));

// Mock IDBKeyRange
global.IDBKeyRange = {
  only: (value: any) => ({ lower: value, upper: value, lowerOpen: false, upperOpen: false } as IDBKeyRange),
  lowerBound: (lower: any, open?: boolean) => ({ lower, upper: undefined, lowerOpen: open || false, upperOpen: false } as IDBKeyRange),
  upperBound: (upper: any, open?: boolean) => ({ lower: undefined, upper, lowerOpen: false, upperOpen: open || false } as IDBKeyRange),
  bound: (lower: any, upper: any, lowerOpen?: boolean, upperOpen?: boolean) => ({ lower, upper, lowerOpen: lowerOpen || false, upperOpen: upperOpen || false } as IDBKeyRange),
  includes: (key: any) => true
} as any;

// Mock do IndexedDB (Simplificado para passar nos testes de integração)
const createIDBRequest = (result: any = undefined) => {
  const request: any = {
    result,
    error: null,
    onsuccess: null,
    onerror: null,
  };
  setTimeout(() => {
    if (request.onsuccess) {
      request.onsuccess({ target: request });
    }
  }, 0);
  return request;
};

// In-memory storage for IndexedDB mock
const idbStore: Record<string, Map<any, any>> = {};

const mockIDBDatabase = {
  objectStoreNames: {
    contains: vi.fn(() => true), // Always say yes to avoid createObjectStore calls in init
  },
  transaction: vi.fn((storeNames, mode) => {
    const tx: any = {
      objectStore: vi.fn((name) => {
        if (!idbStore[name]) {
          idbStore[name] = new Map();
        }
        const store = idbStore[name];

        return {
          put: vi.fn((value) => {
            // Assume keyPath is 'id' or 'key' for simplicity, or use the value itself if it's a primitive
            const key = value.id || value.key || value; 
            store.set(key, value);
            return createIDBRequest(key);
          }),
          add: vi.fn((value) => {
            const key = value.id || value.key || value;
            store.set(key, value);
            return createIDBRequest(key);
          }),
          get: vi.fn((key) => {
            return createIDBRequest(store.get(key));
          }),
          getAll: vi.fn(() => {
            return createIDBRequest(Array.from(store.values()));
          }),
          delete: vi.fn((key) => {
            store.delete(key);
            return createIDBRequest();
          }),
          clear: vi.fn(() => {
            store.clear();
            return createIDBRequest();
          }),
          count: vi.fn(() => {
            return createIDBRequest(store.size);
          }),
          createIndex: vi.fn(),
          index: vi.fn((indexName) => ({
            openCursor: vi.fn((range) => {
               const values = Array.from(store.values());
               let index = 0;
               const request: any = {
                 result: null,
                 onsuccess: null,
                 onerror: null,
               };
               
               const advance = () => {
                 if (index < values.length) {
                   const value = values[index];
                   // Basic filtering if range is provided (very simple)
                   // In a real mock, we would check the index key
                   
                   const cursor = {
                     value: value,
                     continue: () => {
                       index++;
                       setTimeout(advance, 0);
                     },
                     delete: () => {
                        // Find key and delete
                        const key = value.id || value.key;
                        store.delete(key);
                     }
                   };
                   request.result = cursor;
                 } else {
                   request.result = null;
                 }
                 if (request.onsuccess) {
                   request.onsuccess({ target: request });
                 }
               };

               setTimeout(advance, 0);
               return request;
            }),
            get: vi.fn((key) => {
               // Simple scan for index (inefficient but works for mock)
               // Assuming indexName matches a property in the object
               const found = Array.from(store.values()).find(v => v[indexName] === key);
               return createIDBRequest(found);
            }),
            getAll: vi.fn((key) => {
               // Simple scan
               const found = Array.from(store.values()).filter(v => v[indexName] === key);
               return createIDBRequest(found);
            }),
          })),
        };
      }),
      oncomplete: null,
      onerror: null,
      abort: vi.fn(),
    };
    setTimeout(() => {
      if (tx.oncomplete) {
        tx.oncomplete({ target: tx });
      }
    }, 0);
    return tx;
  }),
  createObjectStore: vi.fn((name) => {
    if (!idbStore[name]) {
      idbStore[name] = new Map();
    }
    return {
      createIndex: vi.fn(),
    };
  }),
  close: vi.fn(),
};

const mockIDBFactory = {
  open: vi.fn(() => {
    const request: any = {
      result: mockIDBDatabase,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    };
    setTimeout(() => {
      // Trigger upgrade needed first if stores don't exist (simplified logic)
      if (request.onupgradeneeded) {
         request.onupgradeneeded({ target: { result: mockIDBDatabase } });
      }
      if (request.onsuccess) {
        request.onsuccess({ target: request });
      }
    }, 0);
    return request;
  }),
};

global.indexedDB = mockIDBFactory as any;


// Mock do useToast
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock do ResizeObserver (necessário para alguns componentes de UI)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
