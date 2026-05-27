import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Dimensions } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../constants/theme';
import { LivenessStep, ChallengeType, EnrolledUser } from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ChallengeHUDProps {
  livenessStep: LivenessStep;
  livenessStatus: string;
  challenges: ChallengeType[];
  currentChallengeIdx: number;
  matchedUser: EnrolledUser | null;
  scanResultScore: number;
  authStatusMessage: string;
  onRetry: () => void;
}

const getChallengeLabel = (challenge: ChallengeType | undefined): string => {
  if (!challenge) return 'PLEASE WAIT...';
  switch (challenge) {
    case 'blink':
      return 'BLINK YOUR EYES';
    case 'smile':
      return 'SMILE FOR THE CAMERA';
    case 'left':
      return 'TURN HEAD SLIGHTLY LEFT';
    case 'right':
      return 'TURN HEAD SLIGHTLY RIGHT';
    default:
      return String(challenge).toUpperCase();
  }
};

const ChallengeHUD: React.FC<ChallengeHUDProps> = ({
  livenessStep,
  livenessStatus,
  challenges,
  currentChallengeIdx,
  matchedUser,
  scanResultScore,
  authStatusMessage,
  onRetry,
}) => {
  if (livenessStep === 'ready') {
    return (
      <View style={styles.overlay}>
        <Text style={styles.status}>Starting Camera Stream...</Text>
        <ActivityIndicator color={COLORS.primary} size="large" style={styles.spinner} />
      </View>
    );
  }

  if (livenessStep === 'processing') {
    return (
      <View style={styles.overlay}>
        <Text style={styles.status}>Analyzing Face Embedding...</Text>
        <ActivityIndicator color={COLORS.primary} size="large" style={styles.spinner} />
      </View>
    );
  }

  if (livenessStep === 'success') {
    return (
      <View style={[styles.overlay, styles.overlaySuccess]}>
        <Text style={styles.titleSuccess}>VERIFIED</Text>
        <Text style={styles.statusText}>{livenessStatus}</Text>
        {matchedUser && (
          <View style={styles.resultCard}>
            <Text style={styles.resultText}>ID: {matchedUser.employeeId}</Text>
            <Text style={styles.resultText}>
              Match Confidence: {(scanResultScore * 100).toFixed(1)}%
            </Text>
          </View>
        )}
      </View>
    );
  }

  if (livenessStep === 'failed') {
    return (
      <View style={[styles.overlay, styles.overlayFailed]}>
        <Text style={styles.titleFailed}>ACCESS DENIED</Text>
        <Text style={styles.statusTextFailed}>{livenessStatus}</Text>
        {authStatusMessage ? (
          <Text style={styles.subtextFailed}>{authStatusMessage}</Text>
        ) : null}
        {scanResultScore > 0 && (
          <Text style={styles.resultText}>
            Best Match Score: {(scanResultScore * 100).toFixed(1)}%
          </Text>
        )}
        <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
          <Text style={styles.retryButtonText}>TRY AGAIN</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Active state - showing current challenge
  const currentChallenge = challenges[currentChallengeIdx];
  return (
    <View style={styles.overlay}>
      <Text style={styles.stepText}>
        CHALLENGE {Math.min(currentChallengeIdx + 1, challenges.length)} OF{' '}
        {challenges.length}
      </Text>
      <Text style={styles.instructionText}>
        {getChallengeLabel(currentChallenge)}
      </Text>
      <Text style={styles.status}>{livenessStatus}</Text>

      <View style={styles.dotsContainer}>
        {challenges.map((_, idx) => (
          <View
            key={idx}
            style={[
              styles.dot,
              idx < currentChallengeIdx && styles.dotCompleted,
              idx === currentChallengeIdx && styles.dotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 120,
    width: SCREEN_WIDTH - 40,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  overlaySuccess: {
    borderLeftWidth: 5,
    borderLeftColor: COLORS.accent,
  },
  overlayFailed: {
    borderLeftWidth: 5,
    borderLeftColor: COLORS.danger,
  },
  status: {
    fontSize: FONT_SIZES.base,
    color: COLORS.textSub,
    fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
  },
  spinner: {
    marginTop: 10,
  },
  titleSuccess: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.black,
    color: COLORS.accent,
    letterSpacing: 1,
  },
  titleFailed: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.black,
    color: COLORS.danger,
    letterSpacing: 1,
  },
  statusText: {
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  statusTextFailed: {
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  subtextFailed: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSub,
    marginTop: 2,
    fontWeight: FONT_WEIGHTS.medium,
  },
  resultCard: {
    backgroundColor: '#F3F4F6',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    width: '100%',
    marginTop: 10,
    alignItems: 'center',
  },
  resultText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.extrabold,
    color: COLORS.text,
    marginVertical: 1,
  },
  retryButton: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    borderRadius: SPACING.lg,
    backgroundColor: COLORS.primary,
  },
  retryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.extrabold,
  },
  stepText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.extrabold,
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  instructionText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.black,
    color: COLORS.text,
    marginVertical: 6,
    textAlign: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    marginTop: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 3,
  },
  dotActive: {
    backgroundColor: COLORS.primary,
    width: 14,
  },
  dotCompleted: {
    backgroundColor: COLORS.accent,
  },
});

export default ChallengeHUD;
