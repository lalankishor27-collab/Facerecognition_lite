/**
 * SecureFaceApp - Haptic Feedback Service
 *
 * Provides tactile vibration feedback for liveness events:
 * - Challenge passed: short tick (50ms)
 * - Liveness success: double pulse (success pattern)
 * - Liveness failed: long buzz (error pattern)
 *
 * Uses React Native's Vibration API (no native module needed).
 * Falls back silently if vibration is not supported.
 */
import { Vibration, Platform } from 'react-native';

/**
 * Short tick vibration — used when a single challenge is completed.
 * Feels like a gentle "tap" confirmation.
 */
export function hapticTick(): void {
  try {
    if (Platform.OS === 'android') {
      Vibration.vibrate(40);
    } else {
      // iOS: short vibration
      Vibration.vibrate(10);
    }
  } catch {
    // Vibration not available — fail silently
  }
}

/**
 * Success vibration pattern — used on authentication/enrollment success.
 * Double-pulse pattern: buzz-pause-buzz (feels celebratory).
 */
export function hapticSuccess(): void {
  try {
    if (Platform.OS === 'android') {
      // Pattern: [delay, vibrate, pause, vibrate]
      Vibration.vibrate([0, 60, 100, 60]);
    } else {
      // iOS: two short vibrations
      Vibration.vibrate([0, 50, 80, 50]);
    }
  } catch {
    // Vibration not available — fail silently
  }
}

/**
 * Error/failure vibration — used on liveness failure or access denied.
 * Single long buzz (feels urgent/warning).
 */
export function hapticError(): void {
  try {
    if (Platform.OS === 'android') {
      Vibration.vibrate(200);
    } else {
      // iOS: longer vibration
      Vibration.vibrate(150);
    }
  } catch {
    // Vibration not available — fail silently
  }
}

/**
 * Cancel any ongoing vibration.
 */
export function hapticCancel(): void {
  try {
    Vibration.cancel();
  } catch {
    // Ignore
  }
}
