import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, FL_CONFIG } from '../constants/theme';
import { FLModelMetrics } from '../types';
import { FederatedLearningService } from '../services/federatedLearning';

interface FederatedLearningPanelProps {
  flService: FederatedLearningService;
  isOnline: boolean;
}

const FederatedLearningPanel: React.FC<FederatedLearningPanelProps> = ({
  flService,
  isOnline,
}) => {
  const [metrics, setMetrics] = useState<FLModelMetrics>({
    modelVersion: '1.0.0',
    lastTrainedAt: '',
    localSamplesUsed: 0,
    totalContributions: 0,
    currentLoss: 0,
    accuracy: 0,
    isTraining: false,
  });
  const [isAggregating, setIsAggregating] = useState(false);

  // Subscribe to FL metric updates
  useEffect(() => {
    const loadMetrics = async () => {
      const m = await flService.getMetrics();
      setMetrics(m);
    };
    loadMetrics();

    const unsubscribe = flService.subscribe((updatedMetrics) => {
      setMetrics(updatedMetrics);
    });

    return unsubscribe;
  }, [flService]);

  const handleTrainLocal = useCallback(async () => {
    const sampleCount = flService.getLocalSampleCount();
    if (sampleCount < FL_CONFIG.MIN_SAMPLES_FOR_TRAINING) {
      Alert.alert(
        'Insufficient Data',
        `Need at least ${FL_CONFIG.MIN_SAMPLES_FOR_TRAINING} face samples to begin local training. Current: ${sampleCount}.\n\nEnroll multiple users and authenticate them to collect training data.`,
      );
      return;
    }

    const result = await flService.trainLocalModel();
    if (result) {
      Alert.alert(
        'Local Training Complete',
        `Epoch: ${result.epoch}\nLoss: ${result.loss.toFixed(4)}\nAccuracy: ${(result.accuracy * 100).toFixed(1)}%\n\nModel gradients are ready for federated aggregation.`,
      );
    }
  }, [flService]);

  const handleAggregate = useCallback(async () => {
    if (!isOnline) {
      Alert.alert(
        'Network Required',
        'Federated aggregation requires network connectivity. Switch to online mode first.',
      );
      return;
    }

    setIsAggregating(true);
    const success = await flService.attemptFederatedAggregation();
    setIsAggregating(false);

    if (success) {
      Alert.alert(
        'Aggregation Submitted',
        'Differentially-private gradient update has been submitted for federated averaging.\n\nYour raw face data was NOT shared - only noised model gradients were transmitted.',
      );
    } else {
      Alert.alert(
        'Aggregation Failed',
        'Could not submit gradient update. Ensure you have sufficient local training data.',
      );
    }
  }, [flService, isOnline]);

  const sampleCount = flService.getLocalSampleCount();
  const progressPercent = Math.min(
    100,
    (sampleCount / FL_CONFIG.MIN_SAMPLES_FOR_TRAINING) * 100,
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.sectionTitle}>Federated Learning</Text>
          <Text style={styles.sectionSubtitle}>
            On-device model improvement • Privacy-preserving
          </Text>
        </View>
        <View style={styles.versionBadge}>
          <Text style={styles.versionText}>v{metrics.modelVersion}</Text>
        </View>
      </View>

      {/* Privacy Notice */}
      <View style={styles.privacyNotice}>
        <Text style={styles.privacyIcon}>🔒</Text>
        <Text style={styles.privacyText}>
          Face data never leaves this device. Only differentially-private gradient
          updates are shared during aggregation.
        </Text>
      </View>

      {/* Training Progress */}
      <View style={styles.progressSection}>
        <View style={styles.progressLabelRow}>
          <Text style={styles.progressLabel}>Local Samples Collected</Text>
          <Text style={styles.progressCount}>
            {sampleCount} / {FL_CONFIG.MIN_SAMPLES_FOR_TRAINING}
          </Text>
        </View>
        <View style={styles.progressBarBg}>
          <View
            style={[styles.progressBarFill, { width: `${progressPercent}%` }]}
          />
        </View>
      </View>

      {/* Metrics Grid */}
      {metrics.lastTrainedAt ? (
        <View style={styles.metricsGrid}>
          <View style={styles.metricItem}>
            <Text style={styles.metricValue}>
              {(metrics.accuracy * 100).toFixed(1)}%
            </Text>
            <Text style={styles.metricLabel}>Accuracy</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricValue}>
              {metrics.currentLoss.toFixed(4)}
            </Text>
            <Text style={styles.metricLabel}>Loss</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricValue}>{metrics.totalContributions}</Text>
            <Text style={styles.metricLabel}>Contributions</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricValue}>{metrics.localSamplesUsed}</Text>
            <Text style={styles.metricLabel}>Samples Used</Text>
          </View>
        </View>
      ) : null}

      {/* Last Trained */}
      {metrics.lastTrainedAt ? (
        <Text style={styles.lastTrainedText}>
          Last trained: {new Date(metrics.lastTrainedAt).toLocaleString()}
        </Text>
      ) : null}

      {/* Action Buttons */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[
            styles.trainButton,
            (metrics.isTraining || sampleCount < FL_CONFIG.MIN_SAMPLES_FOR_TRAINING) &&
              styles.buttonDisabled,
          ]}
          onPress={handleTrainLocal}
          disabled={metrics.isTraining || sampleCount < FL_CONFIG.MIN_SAMPLES_FOR_TRAINING}>
          {metrics.isTraining ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text style={styles.trainButtonText}>TRAIN LOCAL</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.aggregateButton,
            (!isOnline || isAggregating) && styles.buttonDisabled,
          ]}
          onPress={handleAggregate}
          disabled={!isOnline || isAggregating}>
          {isAggregating ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text style={styles.aggregateButtonText}>FEDERATE</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Differential Privacy Info */}
      <View style={styles.dpInfoRow}>
        <Text style={styles.dpInfoText}>
          ε-DP Noise: σ={FL_CONFIG.NOISE_MULTIPLIER} • Clip Norm: {FL_CONFIG.GRADIENT_CLIP_NORM} • δ={FL_CONFIG.DELTA}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.cardBg,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: '#C4B5FD', // Purple accent border for ML section
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.extrabold,
    color: '#7C3AED', // Purple for ML
  },
  sectionSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSub,
    marginTop: 2,
  },
  versionBadge: {
    backgroundColor: '#EDE9FE',
    paddingVertical: 3,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  versionText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.extrabold,
    color: '#7C3AED',
  },
  privacyNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0FDF4',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  privacyIcon: {
    fontSize: 14,
    marginRight: SPACING.sm,
  },
  privacyText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: '#166534',
    lineHeight: 14,
  },
  progressSection: {
    marginBottom: SPACING.md,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  progressLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSub,
    fontWeight: FONT_WEIGHTS.medium,
  },
  progressCount: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: FONT_WEIGHTS.bold,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#7C3AED',
    borderRadius: 3,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: SPACING.sm,
  },
  metricItem: {
    width: '50%',
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  metricValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.extrabold,
    color: COLORS.text,
  },
  metricLabel: {
    fontSize: 9,
    color: COLORS.textSubtle,
    fontWeight: FONT_WEIGHTS.medium,
    marginTop: 2,
  },
  lastTrainedText: {
    fontSize: 9,
    color: COLORS.textSubtle,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  trainButton: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trainButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.extrabold,
    letterSpacing: 0.5,
  },
  aggregateButton: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aggregateButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.extrabold,
    letterSpacing: 0.5,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  dpInfoRow: {
    marginTop: SPACING.sm,
    alignItems: 'center',
  },
  dpInfoText: {
    fontSize: 8,
    color: COLORS.textSubtle,
    fontWeight: FONT_WEIGHTS.medium,
    letterSpacing: 0.3,
  },
});

export default FederatedLearningPanel;
