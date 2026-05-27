/**
 * SecureFaceApp - Main Application Entry
 *
 * Offline Facial Recognition & Liveness Detection System
 *
 * Architecture: Context + Reducer pattern
 * - AppProvider wraps the app with centralized state
 * - AppContent renders screens based on state
 * - Actions handle async side effects (DB, permissions, alerts)
 */
import React, { useEffect, useCallback } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  View,
  StatusBar,
} from 'react-native';
import { COLORS } from './src/constants/theme';
import { AppProvider, useAppContext } from './src/context/AppContext';
import {
  loadAppData,
  handleLivenessStarted as onLivenessStarted,
  handleChallengeComplete as onChallengeComplete,
  handleLivenessSuccess as onLivenessSuccess,
  handleLivenessFailed as onLivenessFailed,
  handleRetry as onRetry,
  openRegister,
  openAuthenticate,
  handleSyncLogs,
  handleClearDatabase,
} from './src/context/actions';
import DashboardScreen from './src/screens/DashboardScreen';
import CameraScreen from './src/screens/CameraScreen';

// ─── App Content (consumes context) ───────────────────────────────

function AppContent() {
  const { state, dispatch, faceCameraRef, pulseAnim } = useAppContext();

  // Load data on mount
  useEffect(() => {
    loadAppData(dispatch);
  }, [dispatch]);

  // ─── Memoized Event Handlers ──────────────────────────────────
  const handleLivenessStartedCb = useCallback(
    (data: any) => onLivenessStarted(dispatch, data),
    [dispatch],
  );

  const handleChallengeCompleteCb = useCallback(
    (data: any) => onChallengeComplete(dispatch, data),
    [dispatch],
  );

  const handleLivenessSuccessCb = useCallback(
    (data: any) =>
      onLivenessSuccess(
        dispatch,
        data,
        state.currentScreen,
        state.enrollName,
        state.enrollId,
      ),
    [dispatch, state.currentScreen, state.enrollName, state.enrollId],
  );

  const handleLivenessFailedCb = useCallback(
    (data: any) => onLivenessFailed(dispatch, data),
    [dispatch],
  );

  const handleRetryCb = useCallback(
    () => onRetry(dispatch, faceCameraRef),
    [dispatch, faceCameraRef],
  );

  const handleRegister = useCallback(
    () => openRegister(dispatch, state.enrollName, state.enrollId),
    [dispatch, state.enrollName, state.enrollId],
  );

  const handleAuthenticate = useCallback(
    () => openAuthenticate(dispatch, state.users),
    [dispatch, state.users],
  );

  const handleSync = useCallback(
    () => handleSyncLogs(dispatch, state.logs, state.isOnline),
    [dispatch, state.logs, state.isOnline],
  );

  const handleClear = useCallback(
    () => handleClearDatabase(dispatch),
    [dispatch],
  );

  const handleToggleNetwork = useCallback(
    () => dispatch({ type: 'TOGGLE_NETWORK' }),
    [dispatch],
  );

  const handleEnrollNameChange = useCallback(
    (text: string) => dispatch({ type: 'SET_ENROLL_NAME', name: text }),
    [dispatch],
  );

  const handleEnrollIdChange = useCallback(
    (text: string) => dispatch({ type: 'SET_ENROLL_ID', id: text }),
    [dispatch],
  );

  const handleCancel = useCallback(
    () => dispatch({ type: 'NAVIGATE', screen: 'dashboard' }),
    [dispatch],
  );

  // ─── Render ────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <View style={styles.mainContainer}>
        {state.currentScreen === 'dashboard' ? (
          <DashboardScreen
            users={state.users}
            logs={state.logs}
            isOnline={state.isOnline}
            isSyncing={state.isSyncing}
            enrollName={state.enrollName}
            enrollId={state.enrollId}
            enrollError={state.enrollError}
            pulseAnim={pulseAnim}
            onToggleNetwork={handleToggleNetwork}
            onEnrollNameChange={handleEnrollNameChange}
            onEnrollIdChange={handleEnrollIdChange}
            onRegister={handleRegister}
            onAuthenticate={handleAuthenticate}
            onSync={handleSync}
            onClearDatabase={handleClear}
          />
        ) : (
          <CameraScreen
            livenessStep={state.livenessStep}
            livenessStatus={state.livenessStatus}
            challenges={state.challenges}
            currentChallengeIdx={state.currentChallengeIdx}
            matchedUser={state.matchedUser}
            scanResultScore={state.scanResultScore}
            authStatusMessage={state.authStatusMessage}
            onLivenessStarted={handleLivenessStartedCb}
            onChallengeComplete={handleChallengeCompleteCb}
            onLivenessSuccess={handleLivenessSuccessCb}
            onLivenessFailed={handleLivenessFailedCb}
            onRetry={handleRetryCb}
            onCancel={handleCancel}
            faceCameraRef={faceCameraRef}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── App Root (provides context) ──────────────────────────────────

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
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
