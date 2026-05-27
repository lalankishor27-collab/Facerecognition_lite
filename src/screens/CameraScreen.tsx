import React, { useRef, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StatusBar,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../constants/theme';
import {
  LivenessStep,
  ChallengeType,
  EnrolledUser,
  LivenessStartedEvent,
  ChallengeCompleteEvent,
  LivenessSuccessEvent,
  LivenessFailedEvent,
} from '../types';
import ChallengeHUD from '../components/ChallengeHUD';
import FaceCamera from '../components/FaceCamera';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface CameraScreenProps {
  livenessStep: LivenessStep;
  livenessStatus: string;
  challenges: ChallengeType[];
  currentChallengeIdx: number;
  matchedUser: EnrolledUser | null;
  scanResultScore: number;
  authStatusMessage: string;
  onLivenessStarted: (data: LivenessStartedEvent) => void;
  onChallengeComplete: (data: ChallengeCompleteEvent) => void;
  onLivenessSuccess: (data: LivenessSuccessEvent) => void;
  onLivenessFailed: (data: LivenessFailedEvent) => void;
  onRetry: () => void;
  onCancel: () => void;
  faceCameraRef: React.RefObject<any>;
}

const CameraScreen: React.FC<CameraScreenProps> = ({
  livenessStep,
  livenessStatus,
  challenges,
  currentChallengeIdx,
  matchedUser,
  scanResultScore,
  authStatusMessage,
  onLivenessStarted,
  onChallengeComplete,
  onLivenessSuccess,
  onLivenessFailed,
  onRetry,
  onCancel,
  faceCameraRef,
}) => {
  const isSuccess = livenessStep === 'success';
  const isFailed = livenessStep === 'failed';
  const isProcessing = livenessStep === 'processing' || livenessStep === 'ready';

  let borderColor = COLORS.secondary;
  if (isSuccess) borderColor = COLORS.accent;
  if (isFailed) borderColor = COLORS.danger;
  if (isProcessing) borderColor = COLORS.primary;

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <FaceCamera
        ref={faceCameraRef}
        style={styles.fullCamera}
        onLivenessStarted={onLivenessStarted}
        onChallengeComplete={onChallengeComplete}
        onLivenessSuccess={onLivenessSuccess}
        onLivenessFailed={onLivenessFailed}
      />

      <View style={[styles.borderFrame, { borderColor }]}>
        <View style={styles.scannerLine} />
      </View>

      <ChallengeHUD
        livenessStep={livenessStep}
        livenessStatus={livenessStatus}
        challenges={challenges}
        currentChallengeIdx={currentChallengeIdx}
        matchedUser={matchedUser}
        scanResultScore={scanResultScore}
        authStatusMessage={authStatusMessage}
        onRetry={onRetry}
      />

      <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
        <Text style={styles.cancelButtonText}>CANCEL SCAN</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullCamera: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  borderFrame: {
    width: 320,
    height: 320,
    borderRadius: BORDER_RADIUS.circle,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ translateY: -70 }],
  },
  scannerLine: {
    width: '100%',
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  cancelButton: {
    position: 'absolute',
    bottom: 40,
    height: 44,
    paddingHorizontal: 24,
    borderRadius: BORDER_RADIUS.pill,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.extrabold,
    letterSpacing: 1,
  },
});

export default CameraScreen;
