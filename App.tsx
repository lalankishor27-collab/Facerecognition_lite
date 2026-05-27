/**
 * SecureFaceApp - Main Application Entry
 *
 * Offline Facial Recognition & Liveness Detection System
 * Thin orchestration shell - all UI logic delegated to screens/components.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  View,
  StatusBar,
  Alert,
  Platform,
  PermissionsAndroid,
  Animated,
} from 'react-native';
import { COLORS } from './src/constants/theme';
import {
  ScreenName,
  LivenessStep,
  ChallengeType,
  EnrolledUser,
  AttendanceLog,
  LivenessStartedEvent,
  ChallengeCompleteEvent,
  LivenessSuccessEvent,
  LivenessFailedEvent,
} from './src/types';
import {
  getEnrolledUsers,
  enrollUser,
  getAttendanceLogs,
  logAttendance,
  syncAndPurgeLogs,
  identifyFace,
  clearDatabase,
} from './src/services/db';
import DashboardScreen from './src/screens/DashboardScreen';
import CameraScreen from './src/screens/CameraScreen';

export default function App() {
  // Navigation
  const [currentScreen, setCurrentScreen] = useState<ScreenName>('dashboard');

  // Data State
  const [users, setUsers] = useState<EnrolledUser[]>([]);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Enrollment State
  const [enrollName, setEnrollName] = useState('');
  const [enrollId, setEnrollId] = useState('');
  const [enrollError, setEnrollError] = useState('');

  // Liveness & Recognition State
  const [challenges, setChallenges] = useState<ChallengeType[]>([]);
  const [currentChallengeIdx, setCurrentChallengeIdx] = useState(0);
  const [livenessStatus, setLivenessStatus] = useState('Initializing camera...');
  const [livenessStep, setLivenessStep] = useState<LivenessStep>('ready');
  const [matchedUser, setMatchedUser] = useState<EnrolledUser | null>(null);
  const [authStatusMessage, setAuthStatusMessage] = useState('');
  const [scanResultScore, setScanResultScore] = useState(0);

  // Refs
  const faceCameraRef = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  // ─── Data Loading ────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const [enrolledUsers, attendanceLogs] = await Promise.all([
      getEnrolledUsers(),
      getAttendanceLogs(),
    ]);
    setUsers(enrolledUsers);
    setLogs(attendanceLogs);
  }, []);

  useEffect(() => {
    loadData();

    // Pulse animation with cleanup
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
    animationRef.current = animation;
    animation.start();

    return () => {
      animation.stop();
    };
  }, [loadData, pulseAnim]);

  // ─── Permissions ─────────────────────────────────────────────────
  const checkAndRequestCameraPermission = async (): Promise<boolean> => {
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
  };

  // ─── Liveness Event Handlers ─────────────────────────────────────
  const handleLivenessStarted = useCallback((data: LivenessStartedEvent) => {
    setChallenges(data.challenges);
    setCurrentChallengeIdx(0);
    setLivenessStep('active');
    setLivenessStatus('Position face inside the frame.');
  }, []);

  const handleChallengeComplete = useCallback((data: ChallengeCompleteEvent) => {
    setCurrentChallengeIdx(data.index + 1);
    setLivenessStatus('Challenge completed. Preparing next step...');
  }, []);

  const handleLivenessSuccess = useCallback(
    async (data: LivenessSuccessEvent) => {
      setLivenessStep('processing');
      const embedding = data.embedding;

      if (currentScreen === 'register') {
        if (!enrollName || !enrollId) {
          setLivenessStatus('Enrollment failed: Name and ID missing.');
          setLivenessStep('failed');
          return;
        }
        const success = await enrollUser(enrollName, enrollId, embedding);
        if (success) {
          setLivenessStatus('Face template registered successfully!');
          setLivenessStep('success');
          Alert.alert(
            'Enrollment Successful',
            'Face template has been registered successfully in the local database.',
            [
              {
                text: 'OK',
                onPress: () => {
                  setEnrollName('');
                  setEnrollId('');
                  setCurrentScreen('dashboard');
                  loadData();
                },
              },
            ],
            { cancelable: false },
          );
        } else {
          setLivenessStatus('Failed to save template to local storage.');
          setLivenessStep('failed');
        }
      } else if (currentScreen === 'authenticate') {
        const result = await identifyFace(embedding, 0.82);
        if (result.matched && result.user) {
          setMatchedUser(result.user);
          setScanResultScore(result.score);
          setLivenessStep('success');
          setLivenessStatus(`Authenticated: ${result.user.name}`);

          await logAttendance(
            result.user.employeeId,
            result.user.name,
            result.score,
            'pending',
          );
          loadData();
          Alert.alert(
            'Access Granted',
            `Successfully authenticated as:\n${result.user.name} (ID: ${result.user.employeeId})\n\nMatch Score: ${(result.score * 100).toFixed(1)}%`,
            [
              {
                text: 'OK',
                onPress: () => {
                  setCurrentScreen('dashboard');
                },
              },
            ],
            { cancelable: false },
          );
        } else {
          setLivenessStep('failed');
          setMatchedUser(null);
          setScanResultScore(result.score || 0);
          setLivenessStatus(result.reason || 'Authentication failed.');
          setAuthStatusMessage('Unauthorized identity detected. Access Denied.');
        }
      }
    },
    [currentScreen, enrollName, enrollId, loadData],
  );

  const handleLivenessFailed = useCallback((data: LivenessFailedEvent) => {
    setLivenessStep('failed');
    setLivenessStatus(data.error || 'Liveness check failed.');
  }, []);

  const handleRetry = useCallback(() => {
    setLivenessStep('ready');
    setAuthStatusMessage('');
    setScanResultScore(0);
    faceCameraRef.current?.reset();
  }, []);

  // ─── Navigation Actions ──────────────────────────────────────────
  const openRegister = async () => {
    if (!enrollName.trim() || !enrollId.trim()) {
      setEnrollError('Name and Employee ID are required.');
      return;
    }
    if (enrollName.trim().length < 2) {
      setEnrollError('Name must be at least 2 characters.');
      return;
    }
    if (enrollId.trim().length < 3) {
      setEnrollError('Employee ID must be at least 3 characters.');
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
    setEnrollError('');
    setLivenessStep('ready');
    setCurrentScreen('register');
  };

  const openAuthenticate = async () => {
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
    setLivenessStep('ready');
    setMatchedUser(null);
    setAuthStatusMessage('');
    setScanResultScore(0);
    setCurrentScreen('authenticate');
  };

  // ─── Sync & Database Actions ─────────────────────────────────────
  const handleSyncLogs = async () => {
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
      setIsSyncing(true);
      const res = await syncAndPurgeLogs();
      setIsSyncing(false);

      if (res.success) {
        Alert.alert(
          'Synchronization Successful',
          `Successfully uploaded ${res.syncedCount} records to AWS S3 & DynamoDB. Local database was safely PURGED to optimize storage.`,
          [{ text: 'OK', onPress: loadData }],
        );
      } else {
        Alert.alert('Sync Failed', `AWS Upload Error: ${res.error}`);
      }
    } catch (e) {
      setIsSyncing(false);
      Alert.alert('Error', 'An unexpected error occurred during sync.');
    }
  };

  const handleClearDatabase = () => {
    Alert.alert(
      'Factory Reset',
      'This will permanently delete ALL enrolled face templates and attendance logs. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'RESET EVERYTHING',
          style: 'destructive',
          onPress: async () => {
            // Clear UI immediately
            setUsers([]);
            setLogs([]);
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
  };

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <View style={styles.mainContainer}>
        {currentScreen === 'dashboard' ? (
          <DashboardScreen
            users={users}
            logs={logs}
            isOnline={isOnline}
            isSyncing={isSyncing}
            enrollName={enrollName}
            enrollId={enrollId}
            enrollError={enrollError}
            pulseAnim={pulseAnim}
            onToggleNetwork={() => setIsOnline(!isOnline)}
            onEnrollNameChange={setEnrollName}
            onEnrollIdChange={setEnrollId}
            onRegister={openRegister}
            onAuthenticate={openAuthenticate}
            onSync={handleSyncLogs}
            onClearDatabase={handleClearDatabase}
          />
        ) : (
          <CameraScreen
            livenessStep={livenessStep}
            livenessStatus={livenessStatus}
            challenges={challenges}
            currentChallengeIdx={currentChallengeIdx}
            matchedUser={matchedUser}
            scanResultScore={scanResultScore}
            authStatusMessage={authStatusMessage}
            onLivenessStarted={handleLivenessStarted}
            onChallengeComplete={handleChallengeComplete}
            onLivenessSuccess={handleLivenessSuccess}
            onLivenessFailed={handleLivenessFailed}
            onRetry={handleRetry}
            onCancel={() => setCurrentScreen('dashboard')}
            faceCameraRef={faceCameraRef}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  mainContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
