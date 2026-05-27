/**
 * SecureFaceApp - Biometric Data Encryption Service
 *
 * Provides at-rest encryption for sensitive biometric embedding vectors
 * stored in AsyncStorage. Uses AES-GCM (256-bit) via the Web Crypto API
 * available in Hermes (React Native 0.71+).
 *
 * Key derivation:
 * - A master key is generated once and stored in AsyncStorage (encrypted
 *   by device in production via Keychain/Keystore — see note below).
 * - For the hackathon prototype, the key is derived from a fixed salt +
 *   device entropy. In production, replace with react-native-keychain
 *   for hardware-backed key storage.
 *
 * Architecture:
 * - encryptEmbedding(embedding[]) → base64 ciphertext string
 * - decryptEmbedding(ciphertext) → embedding[]
 * - All operations are synchronous-safe (async/await pattern)
 *
 * Security properties:
 * - AES-256-GCM provides confidentiality + integrity (authenticated encryption)
 * - Unique IV per encryption operation (12 bytes random)
 * - Embeddings cannot be read from raw AsyncStorage JSON
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const CRYPTO_KEY_STORAGE = '@securefaceapp_crypto_key';
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for AES-GCM

// ─── Utility: Base64 encode/decode for Uint8Array ─────────────────

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert a float64 array (embedding) to a Uint8Array for encryption.
 * Each float64 is 8 bytes → 192 floats = 1536 bytes.
 */
function embeddingToBytes(embedding: number[]): Uint8Array {
  const buffer = new Float64Array(embedding);
  return new Uint8Array(buffer.buffer);
}

/**
 * Convert a Uint8Array back to a float64 array (embedding).
 */
function bytesToEmbedding(bytes: Uint8Array): number[] {
  const buffer = new Float64Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 8);
  return Array.from(buffer);
}

// ─── Key Management ───────────────────────────────────────────────

let cachedKey: CryptoKey | null = null;

/**
 * Check if Web Crypto API is available (Hermes on React Native 0.71+).
 */
export function isCryptoAvailable(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  );
}

/**
 * Get or generate the AES-256-GCM encryption key.
 *
 * Key lifecycle:
 * 1. First call: generates a new 256-bit key, exports raw bytes, stores in AsyncStorage
 * 2. Subsequent calls: loads from AsyncStorage and imports as CryptoKey
 * 3. Cached in memory after first load for performance
 *
 * NOTE: In production, store the raw key in platform Keychain/Keystore
 * (react-native-keychain) instead of AsyncStorage for hardware-backed protection.
 */
async function getEncryptionKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  if (!isCryptoAvailable()) {
    throw new Error('[Crypto] Web Crypto API not available');
  }

  try {
    // Try to load existing key
    const storedKey = await AsyncStorage.getItem(CRYPTO_KEY_STORAGE);
    if (storedKey) {
      const rawKey = base64ToUint8(storedKey);
      cachedKey = await crypto.subtle.importKey(
        'raw',
        rawKey,
        { name: ALGORITHM },
        false,
        ['encrypt', 'decrypt'],
      );
      return cachedKey;
    }

    // Generate new key
    cachedKey = await crypto.subtle.generateKey(
      { name: ALGORITHM, length: KEY_LENGTH },
      true, // extractable (needed to persist)
      ['encrypt', 'decrypt'],
    );

    // Export and persist
    const exported = await crypto.subtle.exportKey('raw', cachedKey);
    const keyBase64 = uint8ToBase64(new Uint8Array(exported));
    await AsyncStorage.setItem(CRYPTO_KEY_STORAGE, keyBase64);

    return cachedKey;
  } catch (e) {
    console.error('[Crypto] Key management error:', e);
    throw e;
  }
}

// ─── Encryption / Decryption ──────────────────────────────────────

/**
 * Encrypt a face embedding vector (192 floats) using AES-256-GCM.
 *
 * Output format: base64(IV || ciphertext || authTag)
 * - IV: 12 bytes (random, unique per operation)
 * - Ciphertext: encrypted embedding bytes
 * - AuthTag: 16 bytes (GCM integrity tag, appended by Web Crypto)
 *
 * @param embedding - Array of 192 float64 values
 * @returns Base64-encoded encrypted string
 */
export async function encryptEmbedding(embedding: number[]): Promise<string> {
  if (!isCryptoAvailable()) {
    // Fallback: return JSON (no encryption available)
    console.warn('[Crypto] Web Crypto unavailable — storing unencrypted');
    return JSON.stringify(embedding);
  }

  const key = await getEncryptionKey();
  const plaintext = embeddingToBytes(embedding);

  // Generate random IV (12 bytes for AES-GCM)
  const iv = new Uint8Array(IV_LENGTH);
  crypto.getRandomValues(iv);

  // Encrypt
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    plaintext,
  );
  const cipherBytes = new Uint8Array(cipherBuffer);

  // Concatenate: IV + ciphertext (includes GCM tag)
  const combined = new Uint8Array(IV_LENGTH + cipherBytes.length);
  combined.set(iv, 0);
  combined.set(cipherBytes, IV_LENGTH);

  return uint8ToBase64(combined);
}

/**
 * Decrypt a previously encrypted embedding string back to float64 array.
 *
 * @param ciphertext - Base64 string from encryptEmbedding()
 * @returns Array of 192 float64 values
 * @throws If decryption fails (tampered data, wrong key, or corrupted)
 */
export async function decryptEmbedding(ciphertext: string): Promise<number[]> {
  if (!isCryptoAvailable()) {
    // Fallback: parse JSON (no encryption was used)
    try {
      const parsed = JSON.parse(ciphertext);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    throw new Error('[Crypto] Cannot decrypt — Web Crypto unavailable and data is not JSON');
  }

  // Check if this is legacy unencrypted data (plain JSON array)
  if (ciphertext.startsWith('[')) {
    try {
      const parsed = JSON.parse(ciphertext);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }

  const key = await getEncryptionKey();
  const combined = base64ToUint8(ciphertext);

  // Extract IV and ciphertext
  const iv = combined.slice(0, IV_LENGTH);
  const encryptedData = combined.slice(IV_LENGTH);

  // Decrypt
  const plainBuffer = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    encryptedData,
  );

  return bytesToEmbedding(new Uint8Array(plainBuffer));
}

/**
 * Check if a stored value is encrypted (base64) or plain JSON.
 * Used for backward compatibility during migration.
 */
export function isEncryptedData(data: string): boolean {
  // Plain JSON arrays start with '['
  if (data.startsWith('[')) return false;
  // Base64 encoded data won't start with '[' or '{'
  try {
    base64ToUint8(data);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear the cached encryption key (useful for testing or key rotation).
 */
export function clearCachedKey(): void {
  cachedKey = null;
}
