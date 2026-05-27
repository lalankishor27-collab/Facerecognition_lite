/**
 * SecureFaceApp - Type Definitions
 */

export interface EnrolledUser {
  name: string;
  employeeId: string;
  embedding: number[];
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
