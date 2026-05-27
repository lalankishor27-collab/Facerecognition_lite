import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS } from '../constants/theme';
import { AttendanceLog } from '../types';

interface AttendanceLogItemProps {
  log: AttendanceLog;
}

const AttendanceLogItem: React.FC<AttendanceLogItemProps> = ({ log }) => {
  const formattedTime = log.timestamp
    ? new Date(log.timestamp).toLocaleTimeString()
    : 'N/A';

  return (
    <View style={styles.container}>
      <View style={styles.leftSection}>
        <Text style={styles.name}>{log.name}</Text>
        <Text style={styles.idText}>
          ID: {log.employeeId} &bull; Sim: {(log.matchScore * 100).toFixed(1)}%
        </Text>
        <Text style={styles.time}>{formattedTime}</Text>
      </View>
      <View
        style={[
          styles.badge,
          log.syncStatus === 'synced' ? styles.badgeSynced : styles.badgePending,
        ]}>
        <Text style={styles.badgeText}>
          {(log.syncStatus || 'pending').toUpperCase()}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  leftSection: {
    flex: 1,
  },
  name: {
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
  },
  idText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSub,
    marginTop: 2,
  },
  time: {
    fontSize: 9,
    color: COLORS.textSubtle,
    marginTop: 1,
  },
  badge: {
    paddingVertical: 3,
    paddingHorizontal: SPACING.sm,
    borderRadius: 4,
  },
  badgeSynced: {
    backgroundColor: '#DEF7EC',
  },
  badgePending: {
    backgroundColor: '#FEF3C7',
  },
  badgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.extrabold,
    color: COLORS.textSub,
  },
});

export default AttendanceLogItem;
