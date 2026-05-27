/**
 * Action creators / async thunks for AppContext.
 *
 * These handle side effects (DB calls, permissions, alerts) and dispatch
 * state transitions to the reducer. Keeps the reducer pure.
 */
import React from 'react';
import { Alert, Platform, PermissionsAndroid } from 'react-native';
import { AppAction } from './AppContext';
import {
  getEnrolledUsers,
  enrollUser,
  getAttendanceLogs,
  logAttendance,
  syncAndPurgeLogs,
  identifyFace,
  clearDatabase,
} from '../services/db';
import {
  LivenessStartedEvent,
  ChallengeCompleteEvent,
  LivenessSuccessEvent,
  LivenessFailedEvent,
  EnrolledUser,
  AttendanceLog,
  ScreenName,
} from '../types';

type Dispatch = React.Dispatch<AppAction>;

// ─── Data Loading ─────────────────────────────────────────────────

export async function loadAppData(dispatch: Dispatch): Promise<void> {
  const [users, logs] = await Promise.all([
    getEnrolledUsers(),
    getAttendanceLogs(),
  ]);
  dispatch({ type: 'LOAD_DATA', users, logs });
}

// ─── Permissions ──────────────────────────────────────────────────

export async function checkAndRequestCameraPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.CAMERA,
      );
      if (granted) return true;

      const requested = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: 'Camera Permission Required',
          message:
            'Biometric Face Recognition requires camera access to analyze and capture face structures.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );
      return requested === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn('Camera permission error:', err);
      return false;
    }
  }
  return true; // iOS handles via Info.plist
}

// ─── Liveness Handlers ────────────────────────────────────────────

export function handleLivenessStarted(
  dispatch: Dispatch,
  data: LivenessStartedEvent,
): void {
  dispatch({ type: 'LIVENESS_STARTED', challenges: data.challenges });
}

export function handleChallengeComplete(
  dispatch: Dispatch,
  data: ChallengeCompleteEvent,
): void {
  dispatch({ type: 'CHALLENGE_COMPLETE', index: data.index });
}

export async function handleLivenessSuccess(
  dispatch: Dispatch,
  data: LivenessSuccessEvent,
  currentScreen: ScreenName,
  enrollName: string,
  enrollId: string,
): Promise<void> {
  dispatch({ type: 'LIVENESS_PROCESSING' });
  const embedding = data.embedding;

  if (currentScreen === 'register') {
    if (!enrollName || !enrollId) {
      dispatch({
        type: 'LIVENESS_FAILED',
        status: 'Enrollment failed: Name and ID missing.',
      });
      return;
    }

    const success = await enrollUser(enrollName, enrollId, embedding);
    if (success) {
      dispatch({
        type: 'LIVENESS_SUCCESS',
        status: 'Face template registered successfully!',
      });
      Alert.alert(
        'Enrollment Successful',
        'Face template has been registered successfully in the local database.',
        [
          {
            text: 'OK',
            onPress: async () => {
              dispatch({ type: 'CLEAR_ENROLL_FORM' });
              dispatch({ type: 'NAVIGATE', screen: 'dashboard' });
              await loadAppData(dispatch);
            },
          },
        ],
        { cancelable: false },
      );
    } else {
      dispatch({
        type: 'LIVENESS_FAILED',
        status: 'Failed to save template to local storage.',
      });
    }
  } else if (currentScreen === 'authenticate') {
    const result = await identifyFace(embedding, 0.82);
    if (result.matched && result.user) {
      dispatch({
        type: 'LIVENESS_SUCCESS',
        status: `Authenticated: ${result.user.name}`,
        matchedUser: result.user,
        score: result.score,
      });

      await logAttendance(
        result.user.employeeId,
        result.user.name,
        result.score,
        'pending',
      );
      await loadAppData(dispatch);

      Alert.alert(
        'Access Granted',
        `Successfully authenticated as:\n${result.user.name} (ID: ${result.user.employeeId})\n\nMatch Score: ${(result.score * 100).toFixed(1)}%`,
        [
          {
            text: 'OK',
            onPress: () => {
              dispatch({ type: 'NAVIGATE', screen: 'dashboard' });
            },
          },
        ],
        { cancelable: false },
      );
    } else {
      dispatch({
        type: 'LIVENESS_FAILED',
        status: result.reason || 'Authentication failed.',
        authMessage: 'Unauthorized identity detected. Access Denied.',
        score: result.score || 0,
      });
    }
  }
}

export function handleLivenessFailed(
  dispatch: Dispatch,
  data: LivenessFailedEvent,
): void {
  dispatch({
    type: 'LIVENESS_FAILED',
    status: data.error || 'Liveness check failed.',
  });
}

export function handleRetry(
  dispatch: Dispatch,
  faceCameraRef: React.RefObject<any>,
): void {
  dispatch({ type: 'LIVENESS_RETRY' });
  faceCameraRef.current?.reset();
}

// ─── Navigation Actions ───────────────────────────────────────────

export async function openRegister(
  dispatch: Dispatch,
  enrollName: string,
  enrollId: string,
): Promise<void> {
  if (!enrollName.trim() || !enrollId.trim()) {
    dispatch({ type: 'SET_ENROLL_ERROR', error: 'Name and Employee ID are required.' });
    return;
  }
  if (enrollName.trim().length < 2) {
    dispatch({ type: 'SET_ENROLL_ERROR', error: 'Name must be at least 2 characters.' });
    return;
  }
  if (enrollId.trim().length < 3) {
    dispatch({ type: 'SET_ENROLL_ERROR', error: 'Employee ID must be at least 3 characters.' });
    return;
  }

  const hasCamPerm = await checkAndRequestCameraPermission();
  if (!hasCamPerm) {
    Alert.alert(
      'Permission Required',
      'Camera permission is required to register your face.',
    );
    return;
  }
  dispatch({ type: 'PREPARE_REGISTER' });
}

export async function openAuthenticate(
  dispatch: Dispatch,
  users: EnrolledUser[],
): Promise<void> {
  if (users.length === 0) {
    Alert.alert(
      'Authentication Blocked',
      'No personnel templates found in local database. Please enroll a user first.',
    );
    return;
  }
  const hasCamPerm = await checkAndRequestCameraPermission();
  if (!hasCamPerm) {
    Alert.alert(
      'Permission Required',
      'Camera permission is required for authentication.',
    );
    return;
  }
  dispatch({ type: 'PREPARE_AUTHENTICATE' });
}

// ─── Sync & Database Actions ──────────────────────────────────────

export async function handleSyncLogs(
  dispatch: Dispatch,
  logs: AttendanceLog[],
  isOnline: boolean,
): Promise<void> {
  if (!isOnline) {
    Alert.alert(
      'Zero-Network Zone Active',
      'Cannot sync attendance logs. Establish cloud synchronization by toggling network status to "Online" first.',
      [{ text: 'OK' }],
    );
    return;
  }

  const pendingLogs = logs.filter(log => log.syncStatus === 'pending');
  if (pendingLogs.length === 0) {
    Alert.alert('System Message', 'All local logs are already synchronized.');
    return;
  }

  try {
    dispatch({ type: 'SET_SYNCING', isSyncing: true });
    const res = await syncAndPurgeLogs();
    dispatch({ type: 'SET_SYNCING', isSyncing: false });

    if (res.success) {
      Alert.alert(
        'Synchronization Successful',
        `Successfully uploaded ${res.syncedCount} records to AWS S3 & DynamoDB. Local database was safely PURGED to optimize storage.`,
        [{ text: 'OK', onPress: () => loadAppData(dispatch) }],
      );
    } else {
      Alert.alert('Sync Failed', `AWS Upload Error: ${res.error}`);
    }
  } catch (e) {
    dispatch({ type: 'SET_SYNCING', isSyncing: false });
    Alert.alert('Error', 'An unexpected error occurred during sync.');
  }
}

export function handleClearDatabase(dispatch: Dispatch): void {
  Alert.alert(
    'Factory Reset',
    'This will permanently delete ALL enrolled face templates and attendance logs. This cannot be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'RESET EVERYTHING',
        style: 'destructive',
        onPress: async () => {
          dispatch({ type: 'CLEAR_DATABASE' });
          try {
            await clearDatabase();
          } catch (e) {
            console.warn('[App] clearDatabase error (non-critical):', e);
          }
          Alert.alert('Reset Complete', 'All local data has been permanently wiped.');
        },
      },
    ],
  );
}
