/**
 * Manual Jest mock for @react-native-async-storage/async-storage (v3.x)
 *
 * Placed at __mocks__/@react-native-async-storage/async-storage.js
 * Jest picks this up automatically for all test files.
 *
 * Uses plain functions (NOT jest.fn()) so jest.clearAllMocks() / jest.resetAllMocks()
 * cannot break the implementations. The _store Map is exposed for direct reset in tests.
 */

const store = new Map();

const AsyncStorage = {
  _store: store,

  getItem: async (key) => store.get(key) ?? null,
  setItem: async (key, value) => { store.set(key, value); },
  removeItem: async (key) => { store.delete(key); },

  multiRemove: async (keys) => { keys.forEach((k) => store.delete(k)); },
  multiGet: async (keys) => keys.map((key) => [key, store.get(key) ?? null]),
  multiSet: async (pairs) => { pairs.forEach(([key, value]) => store.set(key, value)); },

  getAllKeys: async () => Array.from(store.keys()),
  clear: async () => { store.clear(); },
  flushGetRequests: () => {},
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
