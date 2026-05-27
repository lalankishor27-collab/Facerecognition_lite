import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../constants/theme';

interface StatsCardBannerProps {
  enrolledCount: number;
  attendanceRate: string;
  pendingLogsCount: number;
}

const StatsCardBanner: React.FC<StatsCardBannerProps> = ({
  enrolledCount,
  attendanceRate,
  pendingLogsCount,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.statColumn}>
        <Text style={styles.statTitle}>Enrolled Faces</Text>
        <Text style={styles.statNumber}>{enrolledCount}</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.statColumn}>
        <Text style={styles.statTitle}>Attendance Rate</Text>
        <View style={styles.attendanceBadge}>
          <Text style={styles.attendanceBadgeText}>{attendanceRate}</Text>
        </View>
      </View>
      <View style={styles.divider} />
      <View style={styles.statColumn}>
        <Text style={styles.statTitle}>Pending Logs</Text>
        <Text style={styles.statNumber}>{pendingLogsCount}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    shadowColor: '#0F3A80',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  statColumn: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  statTitle: {
    fontSize: FONT_SIZES.md,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: SPACING.xs,
  },
  statNumber: {
    fontSize: FONT_SIZES.xl,
    color: COLORS.white,
    fontWeight: FONT_WEIGHTS.extrabold,
  },
  attendanceBadge: {
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: 6,
  },
  attendanceBadgeText: {
    fontSize: FONT_SIZES.base,
    color: COLORS.white,
    fontWeight: FONT_WEIGHTS.extrabold,
  },
});

export default StatsCardBanner;
