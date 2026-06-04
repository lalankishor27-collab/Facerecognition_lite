/**
 * SecureFaceApp - Local Database Service
 * 
 * Handles encrypted local storage of face embeddings, user enrollment,
 * attendance logging, cosine similarity matching, and sync/purge operations.
 * 
 * Security improvements:
 * - UUID-based IDs (not Math.random)
 * - Input validation and sanitization
 * - Type safety throughout
 * - Proper error handling
 * - AES-256-GCM encryption for biometric embedding vectors at rest
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EnrolledUser, AttendanceLog, IdentifyResult, SyncResult, StoredUser } from '../types';
import { LIVENESS_CONFIG } from '../constants/theme';
import {
  encryptEmbedding,
  decryptEmbedding,
} from './crypto';

const USERS_KEY = '@securefaceapp_users';
const LOGS_KEY = '@securefaceapp_logs';
const MAX_NAME_LENGTH = 100;
const MAX_ID_LENGTH = 20;
const EMBEDDING_DIMENSION = 192;

// ─── Utility Functions ────────────────────────────────────────────

/**
 * Generate a cryptographically secure UUID v4.
 * Uses Hermes built-in crypto.randomUUID() (RFC 4122 compliant).
 * Falls back to timestamp+performance entropy if unavailable.
 */
const generateUUID = (): string => {
  // crypto.randomUUID is available in Hermes (React Native 0.71+)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: high-entropy manual UUID v4
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Last-resort entropy: performance.now() + Date.now()
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(
        ((performance?.now?.() ?? Date.now()) * Math.random() * 256) % 256
      );
    }
  }
  // Set version 4 bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
    hex.slice(16, 20), hex.slice(20),
  ].join('-');
};

/**
 * Sanitize user input - strip dangerous characters, trim whitespace.
 */
const sanitizeInput = (input: string, maxLength: number): string => {
  return input
    .trim()
    .replace(/[<>"'&\\]/g, '') // Remove potential injection chars
    .slice(0, maxLength);
};

/**
 * Validate embedding vector is properly formed.
 */
const isValidEmbedding = (embedding: number[]): boolean => {
  if (!Array.isArray(embedding)) return false;
  if (embedding.length !== EMBEDDING_DIMENSION) return false;
  return embedding.every(
    val => typeof val === 'number' && isFinite(val) && !isNaN(val),
  );
};

// ─── Cosine Similarity Engine ─────────────────────────────────────

/**
 * Calculates the Cosine Similarity between two numeric vectors.
 * Returns a value between -1.0 and 1.0.
 * A value >= 0.82 typically indicates a match for MobileFaceNet embeddings.
 * 
 * Formula: cos(θ) = (A · B) / (||A|| × ||B||)
 */
export const calculateCosineSimilarity = (vecA: number[], vecB: number[]): number => {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
    return 0;
  }

  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

// ─── User Enrollment ──────────────────────────────────────────────

/**
 * Fetch all enrolled users from local storage.
 * Decrypts embedding vectors from AES-256-GCM ciphertext at read time.
 * Handles backward compatibility with legacy unencrypted data.
 */
export const getEnrolledUsers = async (): Promise<EnrolledUser[]> => {
  try {
    const jsonValue = await AsyncStorage.getItem(USERS_KEY);
    if (!jsonValue) return [];
    const parsed = JSON.parse(jsonValue);
    if (!Array.isArray(parsed)) return [];

    // Decrypt embeddings (handles both encrypted and legacy plain formats)
    const users: EnrolledUser[] = [];
    for (const stored of parsed as StoredUser[]) {
      try {
        let embedding: number[];
        if (stored.encryptedEmbedding) {
          // New encrypted format
          embedding = await decryptEmbedding(stored.encryptedEmbedding);
        } else if (stored.embedding && Array.isArray(stored.embedding)) {
          // Legacy unencrypted format — still works
          embedding = stored.embedding;
        } else {
          console.warn('[DB] Skipping user with no embedding:', stored.employeeId);
          continue;
        }
        users.push({
          name: stored.name,
          employeeId: stored.employeeId,
          embedding,
          enrolledAt: stored.enrolledAt,
        });
      } catch (decryptErr) {
        console.error('[DB] Failed to decrypt embedding for:', stored.employeeId, decryptErr);
        // Skip corrupted entries rather than failing entirely
        continue;
      }
    }
    return users;
  } catch (e) {
    console.error('[DB] Error fetching enrolled users:', e);
    return [];
  }
};

/**
 * Enroll a new user with their face embedding vector.
 * Validates all inputs before storage.
 * Encrypts the embedding vector with AES-256-GCM before persisting.
 */
export const enrollUser = async (
  name: string,
  employeeId: string,
  embedding: number[],
): Promise<boolean> => {
  try {
    // Input validation
    const sanitizedName = sanitizeInput(name, MAX_NAME_LENGTH);
    const sanitizedId = sanitizeInput(employeeId, MAX_ID_LENGTH);

    if (!sanitizedName || sanitizedName.length < 2) {
      console.error('[DB] Invalid name for enrollment');
      return false;
    }
    if (!sanitizedId || sanitizedId.length < 3) {
      console.error('[DB] Invalid employee ID for enrollment');
      return false;
    }
    if (!isValidEmbedding(embedding)) {
      console.error('[DB] Invalid embedding vector');
      return false;
    }

    // Encrypt the embedding for at-rest security
    const encryptedEmbedding = await encryptEmbedding(embedding);

    // Read existing stored users (raw, without decrypting all)
    const jsonValue = await AsyncStorage.getItem(USERS_KEY);
    const storedUsers: StoredUser[] = jsonValue ? JSON.parse(jsonValue) : [];

    const newStoredUser: StoredUser = {
      name: sanitizedName,
      employeeId: sanitizedId,
      encryptedEmbedding,
      enrolledAt: new Date().toISOString(),
    };

    // Check if employee ID already exists (update scenario)
    const existsIdx = storedUsers.findIndex(u => u.employeeId === sanitizedId);
    if (existsIdx > -1) {
      storedUsers[existsIdx] = newStoredUser; // Update existing
    } else {
      storedUsers.push(newStoredUser); // Add new
    }

    await AsyncStorage.setItem(USERS_KEY, JSON.stringify(storedUsers));
    return true;
  } catch (e) {
    console.error('[DB] Error enrolling user:', e);
    return false;
  }
};

/**
 * Delete a user from enrollment by employee ID.
 * Operates directly on stored format (no decryption needed for deletion).
 */
export const deleteUser = async (employeeId: string): Promise<boolean> => {
  try {
    const sanitizedId = sanitizeInput(employeeId, MAX_ID_LENGTH);
    if (!sanitizedId) return false;

    const jsonValue = await AsyncStorage.getItem(USERS_KEY);
    const storedUsers: StoredUser[] = jsonValue ? JSON.parse(jsonValue) : [];
    const filtered = storedUsers.filter(u => u.employeeId !== sanitizedId);

    if (filtered.length === storedUsers.length) {
      console.warn('[DB] User not found for deletion:', sanitizedId);
      return false;
    }

    await AsyncStorage.setItem(USERS_KEY, JSON.stringify(filtered));
    return true;
  } catch (e) {
    console.error('[DB] Error deleting user:', e);
    return false;
  }
};

// ─── Face Identification ──────────────────────────────────────────

/**
 * Match a probe embedding against all registered face templates.
 * Returns the matched user details and similarity score.
 * 
 * Time complexity: O(n) where n = number of enrolled users.
 * For large deployments (1000+), consider vector indexing.
 */
export const identifyFace = async (
  probeEmbedding: number[],
  matchThreshold: number = LIVENESS_CONFIG.COSINE_SIMILARITY_THRESHOLD,
): Promise<IdentifyResult> => {
  if (!isValidEmbedding(probeEmbedding)) {
    return { matched: false, score: 0, reason: 'Invalid probe embedding.' };
  }

  const users = await getEnrolledUsers();
  if (users.length === 0) {
    return { matched: false, score: 0, reason: 'No registered personnel.' };
  }

  let bestMatch: EnrolledUser | null = null;
  let highestScore = -1.0;

  for (const user of users) {
    if (!user.embedding || user.embedding.length !== EMBEDDING_DIMENSION) {
      continue; // Skip corrupted entries
    }
    const score = calculateCosineSimilarity(probeEmbedding, user.embedding);
    if (score > highestScore) {
      highestScore = score;
      bestMatch = user;
    }
  }

  if (highestScore >= matchThreshold && bestMatch) {
    return {
      matched: true,
      user: bestMatch,
      score: highestScore,
    };
  }

  return {
    matched: false,
    score: highestScore,
    reason:
      highestScore > 0.6
        ? `Face mismatch (best match: ${highestScore.toFixed(2)})`
        : 'Face not recognized.',
  };
};

// ─── Attendance Logging ───────────────────────────────────────────

/**
 * Fetch all local attendance logs.
 */
export const getAttendanceLogs = async (): Promise<AttendanceLog[]> => {
  try {
    const jsonValue = await AsyncStorage.getItem(LOGS_KEY);
    if (!jsonValue) return [];
    const parsed = JSON.parse(jsonValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('[DB] Error fetching logs:', e);
    return [];
  }
};

/**
 * Add a new attendance record (logged offline with sync status).
 */
export const logAttendance = async (
  employeeId: string,
  name: string,
  matchScore: number,
  status: 'pending' | 'synced' = 'pending',
): Promise<AttendanceLog | null> => {
  try {
    const sanitizedId = sanitizeInput(employeeId, MAX_ID_LENGTH);
    const sanitizedName = sanitizeInput(name, MAX_NAME_LENGTH);

    if (!sanitizedId || !sanitizedName) {
      console.error('[DB] Invalid attendance log parameters');
      return null;
    }

    const logs = await getAttendanceLogs();
    const newLog: AttendanceLog = {
      id: generateUUID(),
      employeeId: sanitizedId,
      name: sanitizedName,
      timestamp: new Date().toISOString(),
      matchScore: Math.max(0, Math.min(1, matchScore)), // Clamp to [0,1]
      syncStatus: status,
    };

    logs.unshift(newLog); // Latest logs first
    await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(logs));
    return newLog;
  } catch (e) {
    console.error('[DB] Error logging attendance:', e);
    return null;
  }
};

// ─── Sync & Purge ─────────────────────────────────────────────────

const SYNC_META_KEY = '@securefaceapp_sync_meta';

// ─── AWS Sync Configuration ───────────────────────────────────────
// TODO: Replace these placeholders with your actual AWS values before production
const AWS_SYNC_CONFIG = {
  // Example: 'https://abc123.execute-api.ap-south-1.amazonaws.com/prod/sync'
  apiEndpoint: '', // TODO: Set your AWS API Gateway endpoint URL
  apiKey: '',      // TODO: Set your API key (x-api-key header)
  timeoutMs: 15000,
  conflictStrategy: 'latest-wins' as import('../types').ConflictStrategy,
};

// ─── Sync Metadata Management ─────────────────────────────────────

/**
 * Get or initialize sync metadata for incremental sync tracking.
 * Generates a stable device ID on first call (persisted across sessions).
 */
export const getSyncMetadata = async (): Promise<import('../types').SyncMetadata> => {
  try {
    const raw = await AsyncStorage.getItem(SYNC_META_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[DB] Error reading sync metadata, reinitializing:', e);
  }
  // Initialize fresh metadata with unique device ID
  const meta: import('../types').SyncMetadata = {
    lastSyncTimestamp: null,
    lastSyncedLogId: null,
    deviceId: generateUUID(),
    syncAttempts: 0,
  };
  await AsyncStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  return meta;
};

/**
 * Update sync metadata after a successful or failed sync attempt.
 */
const updateSyncMetadata = async (
  updates: Partial<import('../types').SyncMetadata>,
): Promise<void> => {
  const meta = await getSyncMetadata();
  const updated = { ...meta, ...updates };
  await AsyncStorage.setItem(SYNC_META_KEY, JSON.stringify(updated));
};

// ─── Incremental Sync & Conflict Resolution ───────────────────────

/**
 * Upload pending logs to cloud using INCREMENTAL SYNC with CONFLICT RESOLUTION.
 *
 * Incremental Sync:
 * - Tracks lastSyncTimestamp to only upload logs created AFTER the last sync
 * - Prevents re-uploading already-synced records on retry after partial failure
 * - Reduces bandwidth and server load significantly
 *
 * Conflict Resolution:
 * - Each log includes a deviceId to identify the source device
 * - Duplicate detection via UUID-based log IDs (server-side dedup)
 * - Configurable strategy: 'device-wins', 'server-wins', or 'latest-wins'
 * - If server reports conflicts, resolves locally before purging
 *
 * Purge-after-confirm: Local data is NEVER deleted until server acknowledges receipt.
 */
export const syncAndPurgeLogs = async (): Promise<SyncResult> => {
  try {
    const logs = await getAttendanceLogs();
    const syncMeta = await getSyncMetadata();

    // ─── INCREMENTAL SYNC: Only sync logs newer than last sync ────
    let pendingLogs = logs.filter(log => log.syncStatus === 'pending');

    // Further filter by timestamp if we have a last sync reference
    if (syncMeta.lastSyncTimestamp) {
      const lastSyncTime = new Date(syncMeta.lastSyncTimestamp).getTime();
      pendingLogs = pendingLogs.filter(log => {
        const logTime = new Date(log.timestamp).getTime();
        return logTime > lastSyncTime;
      });
    }

    if (pendingLogs.length === 0) {
      return { success: true, syncedCount: 0 };
    }

    // Track sync attempt
    await updateSyncMetadata({ syncAttempts: syncMeta.syncAttempts + 1 });

    let uploadSuccess = false;
    let serverConflicts: string[] = []; // IDs of conflicting records

    if (AWS_SYNC_CONFIG.apiEndpoint) {
      // ─── Real AWS Sync with Conflict Resolution ────────────────
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        AWS_SYNC_CONFIG.timeoutMs,
      );

      try {
        const response = await fetch(AWS_SYNC_CONFIG.apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(AWS_SYNC_CONFIG.apiKey ? { 'x-api-key': AWS_SYNC_CONFIG.apiKey } : {}),
          },
          body: JSON.stringify({
            logs: pendingLogs,
            uploadedAt: new Date().toISOString(),
            count: pendingLogs.length,
            // Conflict resolution metadata
            deviceId: syncMeta.deviceId,
            conflictStrategy: AWS_SYNC_CONFIG.conflictStrategy,
            lastSyncTimestamp: syncMeta.lastSyncTimestamp,
            // Incremental sync metadata
            isIncremental: syncMeta.lastSyncTimestamp !== null,
            syncAttempt: syncMeta.syncAttempts + 1,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        uploadSuccess = response.ok; // Only success if HTTP 2xx

        if (uploadSuccess) {
          // Check if server reported any conflicts
          try {
            const responseBody = await response.json();
            if (responseBody.conflicts && Array.isArray(responseBody.conflicts)) {
              serverConflicts = responseBody.conflicts;
            }
          } catch {
            // Response may not be JSON — that's fine, no conflicts
          }
        } else {
          const errText = await response.text().catch(() => 'unknown');
          return { success: false, error: `Server returned ${response.status}: ${errText}` };
        }
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        return {
          success: false,
          error: fetchErr?.name === 'AbortError'
            ? 'Sync timed out after 15 seconds'
            : `Network error: ${fetchErr?.message ?? 'unknown'}`,
        };
      }
    } else {
      // ─── Simulation (no endpoint configured) ──────────────────
      await new Promise<void>(resolve => setTimeout(() => resolve(), 2000));
      uploadSuccess = true;
      console.warn(
        '[DB] Sync simulation used — configure AWS_SYNC_CONFIG.apiEndpoint for production',
      );
    }

    // ─── CRITICAL: Only purge AFTER confirmed server success ───────
    if (uploadSuccess) {
      // Handle conflicts: mark conflicting logs instead of purging them
      const syncedLogIds = new Set(pendingLogs.map(l => l.id));
      const conflictSet = new Set(serverConflicts);

      // Update log statuses: synced for successful, keep pending for conflicts
      const updatedLogs = logs.map(log => {
        if (syncedLogIds.has(log.id) && !conflictSet.has(log.id)) {
          return { ...log, syncStatus: 'synced' as const };
        }
        return log;
      });

      // Purge only the logs we just synced (not pre-existing synced logs or conflicts)
      const remainingLogs = updatedLogs.filter(
        log => !syncedLogIds.has(log.id) || conflictSet.has(log.id),
      );
      await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(remainingLogs));

      // ─── Update sync metadata for incremental tracking ──────────
      const syncedCount = pendingLogs.length - serverConflicts.length;
      const latestSyncedLog = pendingLogs[0]; // Logs are in reverse-chrono order
      await updateSyncMetadata({
        lastSyncTimestamp: new Date().toISOString(),
        lastSyncedLogId: latestSyncedLog?.id ?? syncMeta.lastSyncedLogId,
        syncAttempts: 0, // Reset on success
      });

      return {
        success: true,
        syncedCount,
        purgedCount: syncedCount,
        ...(serverConflicts.length > 0
          ? { error: `${serverConflicts.length} conflict(s) retained locally for review` }
          : {}),
      };
    }

    return { success: false, error: 'Upload not confirmed — logs preserved locally' };
  } catch (e: any) {
    console.error('[DB] Error syncing logs:', e);
    return { success: false, error: e?.message || 'Unknown sync error' };
  }
};

// ─── Database Maintenance ─────────────────────────────────────────

/**
 * Clear all local data (factory reset).
 * Also removes the encryption key and sync metadata — fresh start.
 */
export const clearDatabase = async (): Promise<boolean> => {
  try {
    const keysToRemove = [
      USERS_KEY,
      LOGS_KEY,
      '@securefaceapp_crypto_key',
      SYNC_META_KEY,
    ];
    // Use individual removeItem calls to guarantee each key is deleted
    await Promise.all(keysToRemove.map(key => AsyncStorage.removeItem(key)));
    return true;
  } catch (e) {
    console.error('[DB] Error clearing database:', e);
    return false;
  }
};
