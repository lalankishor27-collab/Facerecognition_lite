import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../constants/theme';

interface NetworkStatusCardProps {
  isOnline: boolean;
  onToggle: () => void;
  pulseAnim: Animated.Value;
}

const NetworkStatusCard: React.FC<NetworkStatusCardProps> = ({
  isOnline,
  onToggle,
  pulseAnim,
}) => {
  return (
    <View
      style={[
        styles.container,
        isOnline ? styles.onlineCard : styles.offlineCard,
      ]}>
      <Animated.View
        style={[
          styles.lightIndicator,
          isOnline ? styles.lightOnline : styles.lightOffline,
          { transform: [{ scale: pulseAnim }] },
        ]}
      />
      <Text style={styles.statusText}>
        {isOnline
          ? 'CLOUD LINK RESTORED (ONLINE)'
          : 'ZERO-NETWORK ZONE (SECURE OFFLINE)'}
      </Text>
      <TouchableOpacity style={styles.toggleButton} onPress={onToggle}>
        <Text style={styles.toggleButtonText}>SWITCH</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.white,
    borderColor: COLORS.border,
  },
  onlineCard: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  offlineCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  lightIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  lightOnline: {
    backgroundColor: COLORS.accent,
  },
  lightOffline: {
    backgroundColor: COLORS.danger,
  },
  statusText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.extrabold,
    color: COLORS.text,
    flex: 1,
  },
  toggleButton: {
    paddingVertical: 5,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
  },
  toggleButtonText: {
    fontSize: 9,
    fontWeight: FONT_WEIGHTS.extrabold,
    color: COLORS.primary,
  },
});

export default NetworkStatusCard;
