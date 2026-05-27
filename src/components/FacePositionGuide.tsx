/**
 * FacePositionGuide - Animated oval overlay that guides user to position their face.
 *
 * Colors:
 * - Pulsing blue (primary): Waiting / ready state — "position your face here"
 * - Solid green (accent): Face detected, challenges active — "keep going"
 * - Orange (secondary): Processing — "hold still"
 * - Green glow: Success
 * - Red glow: Failed
 *
 * The oval pulses gently in ready state to draw attention, then becomes
 * solid once the liveness pipeline is active.
 */
import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { COLORS } from '../constants/theme';
import { LivenessStep } from '../types';

interface FacePositionGuideProps {
  livenessStep: LivenessStep;
}

const FacePositionGuide: React.FC<FacePositionGuideProps> = ({ livenessStep }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation in ready state
  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;

    if (livenessStep === 'ready') {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.04,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
      );
      animation.start();
    } else {
      // Stop pulsing, reset to 1.0
      pulseAnim.setValue(1.0);
    }

    return () => {
      if (animation) animation.stop();
    };
  }, [livenessStep, pulseAnim]);

  // Glow effect on success/failure
  useEffect(() => {
    if (livenessStep === 'success' || livenessStep === 'failed') {
      Animated.timing(glowAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: false,
      }).start();
    } else {
      glowAnim.setValue(0);
    }
  }, [livenessStep, glowAnim]);

  // Determine colors based on state
  let borderColor: string;
  let borderWidth = 3;
  let opacity = 0.9;

  switch (livenessStep) {
    case 'ready':
      borderColor = COLORS.primary;
      opacity = 0.6;
      break;
    case 'active':
      borderColor = COLORS.accent;
      borderWidth = 3;
      break;
    case 'processing':
      borderColor = COLORS.secondary;
      borderWidth = 2;
      opacity = 0.7;
      break;
    case 'success':
      borderColor = COLORS.accent;
      borderWidth = 4;
      break;
    case 'failed':
      borderColor = COLORS.danger;
      borderWidth = 4;
      break;
    default:
      borderColor = COLORS.primary;
  }

  // Interpolate glow shadow
  const shadowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.6],
  });

  const shadowRadius = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 20],
  });

  return (
    <Animated.View
      style={[
        styles.guide,
        {
          borderColor,
          borderWidth,
          opacity,
          transform: [{ scale: pulseAnim }],
          shadowColor: borderColor,
          shadowOpacity: shadowOpacity as any,
          shadowRadius: shadowRadius as any,
        },
      ]}
    >
      {/* Corner markers for visual guidance */}
      <View style={[styles.corner, styles.cornerTopLeft, { borderColor }]} />
      <View style={[styles.corner, styles.cornerTopRight, { borderColor }]} />
      <View style={[styles.corner, styles.cornerBottomLeft, { borderColor }]} />
      <View style={[styles.corner, styles.cornerBottomRight, { borderColor }]} />

      {/* Center crosshair (subtle) */}
      {livenessStep === 'ready' && (
        <View style={styles.crosshairContainer}>
          <View style={styles.crosshairH} />
          <View style={styles.crosshairV} />
        </View>
      )}
    </Animated.View>
  );
};

const GUIDE_SIZE = 280;

const styles = StyleSheet.create({
  guide: {
    width: GUIDE_SIZE,
    height: GUIDE_SIZE * 1.2, // Slightly taller than wide (oval shape for face)
    borderRadius: GUIDE_SIZE * 0.6, // Makes it oval
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderWidth: 3,
    borderColor: COLORS.primary,
  },
  cornerTopLeft: {
    top: 20,
    left: 20,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
  },
  cornerTopRight: {
    top: 20,
    right: 20,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 8,
  },
  cornerBottomLeft: {
    bottom: 20,
    left: 20,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
  },
  cornerBottomRight: {
    bottom: 20,
    right: 20,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 8,
  },
  crosshairContainer: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  crosshairH: {
    position: 'absolute',
    width: 20,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  crosshairV: {
    position: 'absolute',
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
});

export default FacePositionGuide;
