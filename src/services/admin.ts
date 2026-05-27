/**
 * SecureFaceApp - Admin PIN Authentication Service
 *
 * Protects sensitive operations (enrollment, deletion, factory reset)
 * behind a 4-digit admin PIN. Regular authentication (face scan) remains
 * accessible without PIN.
 *
 * Security:
 * - PIN is hashed before storage (SHA-256 via Web Crypto)
 * - 3 failed attempts → 30-second lockout
 * - PIN is never stored in plaintext
 *
 * Protected operations:
 * - Register new face template
 * - Delete enrolled users
 * - Factory reset database
 * - Change PIN
 * - Toggle network status (sync control)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const ADMIN_PIN_KEY = '@securefaceapp_admin_pin_hash';
const ADMIN_LOCKOUT_KEY = '@securefaceapp_admin_lockout';
const MAX_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 30000; // 30 seconds

// ─── PIN Hashing ──────────────────────────────────────────────────

/**
 * Hash a PIN using SHA-256 (Web Crypto API).
 * Falls back to simple hash if Web Crypto unavailable.
 */
async function hashPin(pin: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + '_securefaceapp_salt_v1');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback: simple string hash (not cryptographically secure, but functional)
  let hash = 0;
  const salted = pin + '_securefaceapp_salt_v1';
  for (let i = 0; i < salted.length; i++) {
    const char = salted.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ─── PIN Management ───────────────────────────────────────────────

/**
 * Check if an admin PIN has been set up.
 */
export async function isPinConfigured(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(ADMIN_PIN_KEY);
  return stored !== null && stored.length > 0;
}

/**
 * Set up a new admin PIN (first-time or change).
 * @param pin - Must be exactly 4 digits
 */
export async function setupPin(pin: string): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  const hashed = await hashPin(pin);
  await AsyncStorage.setItem(ADMIN_PIN_KEY, hashed);
  return true;
}

/**
 * Verify an entered PIN against the stored hash.
 * Implements lockout after MAX_ATTEMPTS failed tries.
 */
export async function verifyPin(pin: string): Promise<{ success: boolean; error?: string; remainingAttempts?: number }> {
  // Check lockout
  const lockoutData = await AsyncStorage.getItem(ADMIN_LOCKOUT_KEY);
  if (lockoutData) {
    const { lockedUntil, attempts } = JSON.parse(lockoutData);
    const now = Date.now();
    if (now < lockedUntil) {
      const remainingSeconds = Math.ceil((lockedUntil - now) / 1000);
      return {
        success: false,
        error: `Account locked. Try again in ${remainingSeconds} seconds.`,
        remainingAttempts: 0,
      };
    }
    // Lockout expired — reset
    if (attempts >= MAX_ATTEMPTS) {
      await AsyncStorage.removeItem(ADMIN_LOCKOUT_KEY);
    }
  }

  const storedHash = await AsyncStorage.getItem(ADMIN_PIN_KEY);
  if (!storedHash) {
    return { success: false, error: 'No PIN configured. Please set up a PIN first.' };
  }

  const enteredHash = await hashPin(pin);
  if (enteredHash === storedHash) {
    // Success — clear any failed attempt counter
    await AsyncStorage.removeItem(ADMIN_LOCKOUT_KEY);
    return { success: true };
  }

  // Failed attempt — track it
  let currentAttempts = 1;
  if (lockoutData) {
    const parsed = JSON.parse(lockoutData);
    currentAttempts = (parsed.attempts || 0) + 1;
  }

  if (currentAttempts >= MAX_ATTEMPTS) {
    // Lock out for 30 seconds
    const lockout = {
      attempts: currentAttempts,
      lockedUntil: Date.now() + LOCKOUT_DURATION_MS,
    };
    await AsyncStorage.setItem(ADMIN_LOCKOUT_KEY, JSON.stringify(lockout));
    return {
      success: false,
      error: `Too many failed attempts. Locked for 30 seconds.`,
      remainingAttempts: 0,
    };
  }

  // Store failed attempt count
  const attemptData = { attempts: currentAttempts, lockedUntil: 0 };
  await AsyncStorage.setItem(ADMIN_LOCKOUT_KEY, JSON.stringify(attemptData));

  return {
    success: false,
    error: 'Incorrect PIN.',
    remainingAttempts: MAX_ATTEMPTS - currentAttempts,
  };
}

/**
 * Change the admin PIN (requires old PIN verification first).
 */
export async function changePin(oldPin: string, newPin: string): Promise<{ success: boolean; error?: string }> {
  const verification = await verifyPin(oldPin);
  if (!verification.success) {
    return { success: false, error: verification.error };
  }
  if (!isValidPin(newPin)) {
    return { success: false, error: 'New PIN must be exactly 4 digits.' };
  }
  const hashed = await hashPin(newPin);
  await AsyncStorage.setItem(ADMIN_PIN_KEY, hashed);
  return { success: true };
}

/**
 * Remove the admin PIN (factory reset also calls this).
 */
export async function removePin(): Promise<void> {
  await AsyncStorage.removeItem(ADMIN_PIN_KEY);
  await AsyncStorage.removeItem(ADMIN_LOCKOUT_KEY);
}

// ─── Validation ───────────────────────────────────────────────────

/**
 * Validate PIN format: must be exactly 4 digits.
 */
export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
