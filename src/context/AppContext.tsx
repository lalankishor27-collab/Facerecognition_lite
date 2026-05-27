/**
 * AppContext - Centralized state management using Context + useReducer.
 *
 * Replaces the 15+ useState calls in App.tsx with a single, predictable
 * state tree and typed actions. Benefits:
 * - Single source of truth for all app state
 * - Predictable state transitions via reducer
 * - Easy to test (pure reducer function)
 * - Avoids prop drilling
 * - Better performance (components only re-render on relevant state changes)
 */
import React, { createContext, useContext, useReducer, useRef, useCallback, useEffect } from 'react';
import { Animated } from 'react-native';
import {
  ScreenName,
  LivenessStep,
  ChallengeType,
  EnrolledUser,
  AttendanceLog,
} from '../types';

// ─── State Shape ──────────────────────────────────────────────────

export interface AppState {
  // Navigation
  currentScreen: ScreenName;

  // Data
  users: EnrolledUser[];
  logs: AttendanceLog[];
  isOnline: boolean;
  isSyncing: boolean;

  // Enrollment Form
  enrollName: string;
  enrollId: string;
  enrollError: string;

  // Liveness & Recognition
  challenges: ChallengeType[];
  currentChallengeIdx: number;
  livenessStatus: string;
  livenessStep: LivenessStep;
  matchedUser: EnrolledUser | null;
  authStatusMessage: string;
  scanResultScore: number;
}

export const initialState: AppState = {
  currentScreen: 'dashboard',
  users: [],
  logs: [],
  isOnline: false,
  isSyncing: false,
  enrollName: '',
  enrollId: '',
  enrollError: '',
  challenges: [],
  currentChallengeIdx: 0,
  livenessStatus: 'Initializing camera...',
  livenessStep: 'ready',
  matchedUser: null,
  authStatusMessage: '',
  scanResultScore: 0,
};

// ─── Action Types ─────────────────────────────────────────────────

export type AppAction =
  | { type: 'NAVIGATE'; screen: ScreenName }
  | { type: 'SET_USERS'; users: EnrolledUser[] }
  | { type: 'SET_LOGS'; logs: AttendanceLog[] }
  | { type: 'LOAD_DATA'; users: EnrolledUser[]; logs: AttendanceLog[] }
  | { type: 'TOGGLE_NETWORK' }
  | { type: 'SET_SYNCING'; isSyncing: boolean }
  | { type: 'SET_ENROLL_NAME'; name: string }
  | { type: 'SET_ENROLL_ID'; id: string }
  | { type: 'SET_ENROLL_ERROR'; error: string }
  | { type: 'CLEAR_ENROLL_FORM' }
  | { type: 'LIVENESS_STARTED'; challenges: ChallengeType[] }
  | { type: 'CHALLENGE_COMPLETE'; index: number }
  | { type: 'LIVENESS_PROCESSING' }
  | { type: 'LIVENESS_SUCCESS'; status: string; matchedUser?: EnrolledUser | null; score?: number }
  | { type: 'LIVENESS_FAILED'; status: string; authMessage?: string; score?: number }
  | { type: 'LIVENESS_RETRY' }
  | { type: 'PREPARE_REGISTER' }
  | { type: 'PREPARE_AUTHENTICATE' }
  | { type: 'CLEAR_DATABASE' };

// ─── Reducer ──────────────────────────────────────────────────────

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'NAVIGATE':
      return { ...state, currentScreen: action.screen };

    case 'SET_USERS':
      return { ...state, users: action.users };

    case 'SET_LOGS':
      return { ...state, logs: action.logs };

    case 'LOAD_DATA':
      return { ...state, users: action.users, logs: action.logs };

    case 'TOGGLE_NETWORK':
      return { ...state, isOnline: !state.isOnline };

    case 'SET_SYNCING':
      return { ...state, isSyncing: action.isSyncing };

    case 'SET_ENROLL_NAME':
      return { ...state, enrollName: action.name };

    case 'SET_ENROLL_ID':
      return { ...state, enrollId: action.id };

    case 'SET_ENROLL_ERROR':
      return { ...state, enrollError: action.error };

    case 'CLEAR_ENROLL_FORM':
      return { ...state, enrollName: '', enrollId: '', enrollError: '' };

    case 'LIVENESS_STARTED':
      return {
        ...state,
        challenges: action.challenges,
        currentChallengeIdx: 0,
        livenessStep: 'active',
        livenessStatus: 'Position face inside the frame.',
      };

    case 'CHALLENGE_COMPLETE':
      return {
        ...state,
        currentChallengeIdx: action.index + 1,
        livenessStatus: 'Challenge completed. Preparing next step...',
      };

    case 'LIVENESS_PROCESSING':
      return { ...state, livenessStep: 'processing' };

    case 'LIVENESS_SUCCESS':
      return {
        ...state,
        livenessStep: 'success',
        livenessStatus: action.status,
        matchedUser: action.matchedUser ?? state.matchedUser,
        scanResultScore: action.score ?? state.scanResultScore,
      };

    case 'LIVENESS_FAILED':
      return {
        ...state,
        livenessStep: 'failed',
        livenessStatus: action.status,
        matchedUser: null,
        authStatusMessage: action.authMessage ?? '',
        scanResultScore: action.score ?? 0,
      };

    case 'LIVENESS_RETRY':
      return {
        ...state,
        livenessStep: 'ready',
        authStatusMessage: '',
        scanResultScore: 0,
      };

    case 'PREPARE_REGISTER':
      return {
        ...state,
        enrollError: '',
        livenessStep: 'ready',
        currentScreen: 'register',
      };

    case 'PREPARE_AUTHENTICATE':
      return {
        ...state,
        livenessStep: 'ready',
        matchedUser: null,
        authStatusMessage: '',
        scanResultScore: 0,
        currentScreen: 'authenticate',
      };

    case 'CLEAR_DATABASE':
      return { ...state, users: [], logs: [] };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  faceCameraRef: React.RefObject<any>;
  pulseAnim: Animated.Value;
}

const AppContext = createContext<AppContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const faceCameraRef = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation lifecycle
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  const value: AppContextValue = {
    state,
    dispatch,
    faceCameraRef,
    pulseAnim,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// ─── Hook ─────────────────────────────────────────────────────────

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppContext must be used within <AppProvider>');
  }
  return ctx;
}
