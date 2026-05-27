/**
 * Jest global setup
 * - Polyfills crypto.randomUUID for test environment (Node.js <19 compatibility)
 * - Polyfills btoa/atob for Base64 encoding (used by crypto.ts)
 * - Resets FederatedLearningService singleton between test files
 */

// Polyfill crypto for Node test environment
const { webcrypto } = require('crypto');
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = webcrypto;
}

// Polyfill btoa/atob for Node test environment (needed by crypto.ts)
if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
}
if (typeof globalThis.atob === 'undefined') {
  globalThis.atob = (b64) => Buffer.from(b64, 'base64').toString('binary');
}

// Silence console.warn/error noise during tests (optional - comment out to debug)
// jest.spyOn(console, 'warn').mockImplementation(() => {});
// jest.spyOn(console, 'error').mockImplementation(() => {});
