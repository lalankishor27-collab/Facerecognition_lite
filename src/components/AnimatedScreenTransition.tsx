/**
 * AnimatedScreenTransition - Smooth fade + slide transition wrapper.
 *
 * Wraps screen content and animates on mount:
 * - Fade in from 0 → 1 opacity
 * - Slide up from 30px offset → 0
 *
 * Duration: 300ms (fast enough to feel responsive, slow enough to notice)
 * Uses native driver for 60fps performance.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, ViewStyle } from 'react-native';

interface AnimatedScreenTransitionProps {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Direction of slide: 'up' (default), 'left', 'right' */
  direction?: 'up' | 'left' | 'right';
  /** Animation duration in ms (default: 300) */
  duration?: number;
}

const AnimatedScreenTransition: React.FC<AnimatedScreenTransitionProps> = ({
  children,
  style,
  direction = 'up',
  duration = 300,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(getInitialOffset(direction))).current;

  useEffect(() => {
    // Run both animations in parallel on mount
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim, duration]);

  const translateStyle = getTranslateStyle(direction, slideAnim);

  return (
    <Animated.View
      style={[
        styles.container,
        style,
        {
          opacity: fadeAnim,
          transform: [translateStyle],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

function getInitialOffset(direction: 'up' | 'left' | 'right'): number {
  switch (direction) {
    case 'up':
      return 30;
    case 'left':
      return 50;
    case 'right':
      return -50;
    default:
      return 30;
  }
}

function getTranslateStyle(
  direction: 'up' | 'left' | 'right',
  anim: Animated.Value,
): { translateY: Animated.Value } | { translateX: Animated.Value } {
  switch (direction) {
    case 'up':
      return { translateY: anim };
    case 'left':
    case 'right':
      return { translateX: anim };
    default:
      return { translateY: anim };
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default AnimatedScreenTransition;
