import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Animated,
  Alert,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../constants/theme';
import { AttendanceLog, EnrolledUser } from '../types';
import GovernmentHeader from '../components/GovernmentHeader';
import StatsCardBanner from '../components/StatsCardBanner';
import NetworkStatusCard from '../components/NetworkStatusCard';
import AttendanceLogItem from '../components/AttendanceLogItem';

interface DashboardScreenProps {
  users: EnrolledUser[];
  logs: AttendanceLog[];
  isOnline: boolean;
  isSyncing: boolean;
  enrollName: string;
  enrollId: string;
  enrollError: string;
  pulseAnim: Animated.Value;
  onToggleNetwork: () => void;
  onEnrollNameChange: (text: string) => void;
  onEnrollIdChange: (text: string) => void;
  onRegister: () => void;
  onAuthenticate: () => void;
  onSync: () => void;
  onClearDatabase: () => void;
  // Federated Learning
  renderFederatedLearningPanel?: () => React.ReactNode;
}

const DashboardScreen: React.FC<DashboardScreenProps> = ({
  users,
  logs,
  isOnline,
  isSyncing,
  enrollName,
  enrollId,
  enrollError,
  pulseAnim,
  onToggleNetwork,
  onEnrollNameChange,
  onEnrollIdChange,
  onRegister,
  onAuthenticate,
  onSync,
  onClearDatabase,
  renderFederatedLearningPanel,
}) => {
  const pendingLogs = logs.filter(log => log.syncStatus === 'pending');

  // Dynamic attendance rate calculation
  const presentLogs = logs.filter(log => log.matchScore >= 0.82);
  const attendanceRate =
    logs.length > 0
      ? ((presentLogs.length / logs.length) * 100).toFixed(1) + '%'
      : '100.0%';

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <GovernmentHeader />

      <StatsCardBanner
        enrolledCount={users.length}
        attendanceRate={attendanceRate}
        pendingLogsCount={pendingLogs.length}
      />

      <NetworkStatusCard
        isOnline={isOnline}
        onToggle={onToggleNetwork}
        pulseAnim={pulseAnim}
      />

      {/* Biometric Attendance Authentication */}
      <View style={styles.actionCard}>
        <Text style={styles.sectionHeader}>Biometric Attendance Audit</Text>
        <Text style={styles.panelDescription}>
          Audit physical presence offline by launching the face recognition and
          liveness pipeline.
        </Text>
        <TouchableOpacity style={styles.authActionButton} onPress={onAuthenticate}>
          <Text style={styles.authActionButtonText}>AUTHENTICATE PERSONNEL</Text>
        </TouchableOpacity>
      </View>

      {/* Personnel Enrollment */}
      <View style={styles.actionCard}>
        <Text style={styles.sectionHeader}>Personnel Enrollment</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Full Name"
          placeholderTextColor={COLORS.textSubtle}
          value={enrollName}
          onChangeText={onEnrollNameChange}
          maxLength={100}
        />
        <TextInput
          style={styles.textInput}
          placeholder="Employee ID"
          placeholderTextColor={COLORS.textSubtle}
          value={enrollId}
          onChangeText={onEnrollIdChange}
          autoCapitalize="characters"
          maxLength={20}
        />
        {enrollError ? <Text style={styles.errorText}>{enrollError}</Text> : null}
        <TouchableOpacity style={styles.primaryActionButton} onPress={onRegister}>
          <Text style={styles.primaryActionButtonText}>REGISTER FACE TEMPLATE</Text>
        </TouchableOpacity>
      </View>

      {/* Offline Attendance Logs */}
      <View style={styles.actionCard}>
        <View style={styles.syncRow}>
          <Text style={styles.sectionHeader}>Offline Attendance Cache</Text>
          <TouchableOpacity
            style={[
              styles.syncTriggerBtn,
              pendingLogs.length === 0 && styles.syncTriggerBtnDisabled,
            ]}
            onPress={onSync}
            disabled={isSyncing || pendingLogs.length === 0}>
            {isSyncing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.syncTriggerBtnText}>Sync & Purge</Text>
            )}
          </TouchableOpacity>
        </View>

        {logs.length === 0 ? (
          <Text style={styles.emptyText}>
            No attendance records recorded on this device.
          </Text>
        ) : (
          logs.map(log => <AttendanceLogItem key={log.id} log={log} />)
        )}
      </View>

      {/* Federated Learning Panel */}
      {renderFederatedLearningPanel && renderFederatedLearningPanel()}

      {/* Database Maintenance */}
      <TouchableOpacity style={styles.resetBtn} onPress={onClearDatabase}>
        <Text style={styles.resetBtnText}>FACTORY RESET LOCAL STORAGE</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 40,
  },
  actionCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionHeader: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.extrabold,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  panelDescription: {
    fontSize: FONT_SIZES.base,
    color: COLORS.textSub,
    lineHeight: 16,
    marginBottom: SPACING.xl,
  },
  textInput: {
    height: 44,
    backgroundColor: '#F9FAFB',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    fontSize: 13,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 10,
  },
  primaryActionButton: {
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryActionButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.extrabold,
  },
  authActionButton: {
    height: 44,
    borderRadius: BORDER_RADIUS.pill,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  authActionButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.extrabold,
    letterSpacing: 0.5,
  },
  syncRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  syncTriggerBtn: {
    paddingVertical: 5,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.primary,
  },
  syncTriggerBtnDisabled: {
    backgroundColor: COLORS.textSubtle,
    opacity: 0.5,
  },
  syncTriggerBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.extrabold,
    color: COLORS.white,
  },
  emptyText: {
    fontSize: FONT_SIZES.base,
    color: COLORS.textSubtle,
    textAlign: 'center',
    marginVertical: SPACING.md,
  },
  resetBtn: {
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.danger,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  resetBtnText: {
    color: COLORS.danger,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.extrabold,
  },
});

export default DashboardScreen;
