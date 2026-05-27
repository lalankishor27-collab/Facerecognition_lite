/**
 * SecureFaceApp - Type Definitions
 */

export interface EnrolledUser {
  name: string;
  employeeId: string;
  embedding: number[];
  enrolledAt: string;
}

/**
 * Internal storage format — embedding stored as encrypted base64 string.
 * Decrypted to EnrolledUser at read time.
 */
export interface StoredUser {
  name: string;
  employeeId: string;
  encryptedEmbedding: string; // AES-256-GCM encrypted base64
  embedding?: number[];       // Legacy unencrypted (migration support)
  enrolledAt: string;
}

export interface AttendanceLog {
  id: string;
  employeeId: string;
  name: string;
  timestamp: string;
  matchScore: number;
  syncStatus: 'pending' | 'synced';
}

export interface IdentifyResult {
  matched: boolean;
  user?: EnrolledUser;
  score: number;
  reason?: string;
}

export interface SyncResult {
  success: boolean;
  syncedCount?: number;
  purgedCount?: number;
  error?: string;
}

export type LivenessStep = 'ready' | 'active' | 'processing' | 'success' | 'failed';

export type ChallengeType = 'blink' | 'smile' | 'left' | 'right';

export interface LivenessStartedEvent {
  challenges: ChallengeType[];
}

export interface ChallengeCompleteEvent {
  challenge: ChallengeType;
  index: number;
}

export interface LivenessSuccessEvent {
  embedding: number[];
}

export interface LivenessFailedEvent {
  error: string;
}

export type ScreenName = 'dashboard' | 'register' | 'authenticate';

/**
 * Metadata for tracking sync state — enables incremental sync
 * and conflict resolution across multiple devices.
 */
export interface SyncMetadata {
  lastSyncTimestamp: string | null;   // ISO timestamp of last successful sync
  lastSyncedLogId: string | null;     // ID of last successfully synced log
  deviceId: string;                   // Unique device identifier for conflict resolution
  syncAttempts: number;               // Number of sync attempts since last success
}

/**
 * Conflict resolution strategy when server detects duplicate records.
 * - 'device-wins': Local device timestamp takes precedence
 * - 'server-wins': Server record takes precedence  
 * - 'latest-wins': Most recent timestamp wins regardless of source
 */
export type ConflictStrategy = 'device-wins' | 'server-wins' | 'latest-wins';

