/**
 * Jest global setup
 * - Polyfills crypto.randomUUID for test environment (Node.js <19 compatibility)
 * - Resets FederatedLearningService singleton between test files
 */

// Polyfill crypto for Node test environment
const { webcrypto } = require('crypto');
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = webcrypto;
}

// Silence console.warn/error noise during tests (optional - comment out to debug)
// jest.spyOn(console, 'warn').mockImplementation(() => {});
// jest.spyOn(console, 'error').mockImplementation(() => {});
