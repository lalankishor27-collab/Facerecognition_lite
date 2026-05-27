import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StatusBar,
  Animated,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  PermissionsAndroid
} from 'react-native';

import {
  getEnrolledUsers,
  enrollUser,
  deleteUser,
  getAttendanceLogs,
  logAttendance,
  syncAndPurgeLogs,
  identifyFace,
  clearDatabase
} from './src/services/db';

import FaceCamera from './src/components/FaceCamera';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Colors Palette matching Datalake 3.0 System Template
const COLORS = {
  background: '#F5F7FA', // Light Gray background
  cardBg: '#FFFFFF',     // White card bg
  primary: '#0F3A80',    // Brand Navy Blue
  secondary: '#D97706',  // Gold/Yellow accents
  accent: '#10B981',     // Success Green
  danger: '#EF4444',     // Danger Red
  text: '#1F2937',       // Dark Charcoal text
  textSub: '#4B5563',    // Medium Slate text
  textSubtle: '#9CA3AF', // Light Gray text
  border: '#E5E7EB',     // Border Gray
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('dashboard'); // 'dashboard', 'register', 'authenticate'
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isOnline, setIsOnline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Enrollment State
  const [enrollName, setEnrollName] = useState('');
  const [enrollId, setEnrollId] = useState('');
  const [enrollError, setEnrollError] = useState('');

  // Liveness & Recognition State
  const [challenges, setChallenges] = useState([]);
  const [currentChallengeIdx, setCurrentChallengeIdx] = useState(0);
  const [livenessStatus, setLivenessStatus] = useState('Initializing camera...');
  const [livenessStep, setLivenessStep] = useState('ready'); // ready, active, processing, success, failed
  const [matchedUser, setMatchedUser] = useState(null);
  const [authStatusMessage, setAuthStatusMessage] = useState('');
  const [scanResultScore, setScanResultScore] = useState(0);
  
  const faceCameraRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Load database on start
  const loadData = async () => {
    const enrolledUsers = await getEnrolledUsers();
    const attendanceLogs = await getAttendanceLogs();
    setUsers(enrolledUsers);
    setLogs(attendanceLogs);
  };

  useEffect(() => {
    loadData();

    // Start pulsing status indicator
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // Request camera permission on-demand
  const checkAndRequestCameraPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
        if (granted) return true;
        const requested = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission Required',
            message: 'Biometric Face Recognition requires camera access to analyze and capture face structures.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        return requested === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true;
  };

  // Event handlers from Native FaceCamera component
  const handleLivenessStarted = (data) => {
    setChallenges(data.challenges);
    setCurrentChallengeIdx(0);
    setLivenessStep('active');
    setLivenessStatus('Position face inside the frame.');
  };

  const handleChallengeComplete = (data) => {
    setCurrentChallengeIdx(data.index + 1);
    setLivenessStatus('Challenge completed. Preparing next step...');
  };

  const handleLivenessSuccess = async (data) => {
    setLivenessStep('processing');
    const embedding = data.embedding;
    
    if (currentScreen === 'register') {
      if (!enrollName || !enrollId) {
        setLivenessStatus('Enrollment failed: Name and ID missing.');
        setLivenessStep('failed');
        return;
      }
      const success = await enrollUser(enrollName, enrollId, embedding);
      if (success) {
        setLivenessStatus('Face template registered successfully!');
        setLivenessStep('success');
        setTimeout(() => {
          setEnrollName('');
          setEnrollId('');
          setCurrentScreen('dashboard');
          loadData();
        }, 2000);
      } else {
        setLivenessStatus('Failed to save template to local storage.');
        setLivenessStep('failed');
      }
    } else if (currentScreen === 'authenticate') {
      const result = await identifyFace(embedding, 0.82); // Calibrated Cosine Similarity threshold
      if (result.matched) {
        setMatchedUser(result.user);
        setScanResultScore(result.score);
        setLivenessStep('success');
        setLivenessStatus(`Authenticated: ${result.user.name}`);
        
        await logAttendance(result.user.employeeId, result.user.name, result.score, 'pending');
        loadData();

        setTimeout(() => {
          setCurrentScreen('dashboard');
        }, 3000);
      } else {
        setLivenessStep('failed');
        setMatchedUser(null);
        setScanResultScore(result.score || 0);
        setLivenessStatus(result.reason || 'Authentication failed.');
        setAuthStatusMessage('Unauthorized identity detected. Access Denied.');
      }
    }
  };

  const handleLivenessFailed = (data) => {
    setLivenessStep('failed');
    setLivenessStatus(data.error || 'Liveness check failed.');
  };

  // Sync logs from local DB to cloud and purge
  const handleSyncLogs = async () => {
    if (!isOnline) {
      Alert.alert(
        'Zero-Network Zone Active',
        'Cannot sync attendance logs. Establish cloud synchronization by toggling network status to "Online" first.',
        [{ text: 'OK' }]
      );
      return;
    }

    const pendingLogs = logs.filter(log => log.syncStatus === 'pending');
    if (pendingLogs.length === 0) {
      Alert.alert('System Message', 'All local logs are already synchronized.');
      return;
    }

    try {
      setIsSyncing(true);
      const res = await syncAndPurgeLogs();
      setIsSyncing(false);
      
      if (res.success) {
        Alert.alert(
          'Synchronization Successful',
          `Successfully uploaded ${res.syncedCount} records to AWS S3 & DynamoDB. Local database was safely PURGED to optimize storage.`,
          [{ text: 'OK', onPress: loadData }]
        );
      } else {
        Alert.alert('Sync Failed', `AWS Upload Error: ${res.error}`);
      }
    } catch (e) {
      setIsSyncing(false);
      Alert.alert('Error', 'An unexpected error occurred during sync.');
    }
  };

  const handleClearDatabase = () => {
    Alert.alert(
      'Factory Reset DB',
      'Are you sure you want to delete all registered face templates and local logs? This is irreversible.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Reset', 
          style: 'destructive',
          onPress: async () => {
            await clearDatabase();
            loadData();
          }
        }
      ]
    );
  };

  // Navigation handlers
  const openRegister = async () => {
    if (!enrollName.trim() || !enrollId.trim()) {
      setEnrollError('Name and Employee ID are required.');
      return;
    }
    const hasCamPerm = await checkAndRequestCameraPermission();
    if (!hasCamPerm) {
      Alert.alert('Permission Required', 'Camera permission is required to register your face.');
      return;
    }
    setEnrollError('');
    setLivenessStep('ready');
    setCurrentScreen('register');
  };

  const openAuthenticate = async () => {
    if (users.length === 0) {
      Alert.alert('Authentication Blocked', 'No personnel templates found in local database. Please enroll a user first.');
      return;
    }
    const hasCamPerm = await checkAndRequestCameraPermission();
    if (!hasCamPerm) {
      Alert.alert('Permission Required', 'Camera permission is required for authentication.');
      return;
    }
    setLivenessStep('ready');
    setMatchedUser(null);
    setCurrentScreen('authenticate');
  };

  const getChallengeLabel = (chal) => {
    if (!chal) return 'PLEASE WAIT...';
    switch (chal) {
      case 'blink': return 'BLINK YOUR EYES';
      case 'smile': return 'SMILE FOR THE CAMERA';
      case 'left': return 'TURN HEAD SLIGHTLY LEFT';
      case 'right': return 'TURN HEAD SLIGHTLY RIGHT';
      default: return String(chal).toUpperCase();
    }
  };

  // Challenge instruction helper
  const renderChallengeHUD = () => {
    if (livenessStep === 'ready') {
      return (
        <View style={styles.hudOverlay}>
          <Text style={styles.hudStatus}>Starting Camera Stream...</Text>
          <ActivityIndicator color={COLORS.primary} size="large" style={styles.spinner} />
        </View>
      );
    }

    if (livenessStep === 'processing') {
      return (
        <View style={styles.hudOverlay}>
          <Text style={styles.hudStatus}>Analyzing Face Embedding...</Text>
          <ActivityIndicator color={COLORS.primary} size="large" style={styles.spinner} />
        </View>
      );
    }

    if (livenessStep === 'success') {
      return (
        <View style={[styles.hudOverlay, styles.hudOverlaySuccess]}>
          <Text style={styles.hudTitleText}>VERIFIED</Text>
          <Text style={styles.hudStatusText}>{livenessStatus}</Text>
          {matchedUser && (
            <View style={styles.resultDetailsCard}>
              <Text style={styles.resultText}>ID: {matchedUser.employeeId}</Text>
              <Text style={styles.resultText}>Match Confidence: {(scanResultScore * 100).toFixed(1)}%</Text>
            </View>
          )}
        </View>
      );
    }

    if (livenessStep === 'failed') {
      return (
        <View style={[styles.hudOverlay, styles.hudOverlayFailed]}>
          <Text style={styles.hudTitleTextFailed}>ACCESS DENIED</Text>
          <Text style={styles.hudStatusTextFailed}>{livenessStatus}</Text>
          {authStatusMessage ? <Text style={styles.hudSubtextFailed}>{authStatusMessage}</Text> : null}
          {scanResultScore > 0 && (
            <Text style={styles.resultText}>Best Match Score: {(scanResultScore * 100).toFixed(1)}%</Text>
          )}
          <TouchableOpacity 
            style={styles.retryButton} 
            onPress={() => {
              setLivenessStep('ready');
              faceCameraRef.current?.reset();
            }}
          >
            <Text style={styles.retryButtonText}>TRY AGAIN</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const currentChallenge = challenges[currentChallengeIdx];
    return (
      <View style={styles.hudOverlay}>
        <Text style={styles.hudStepText}>CHALLENGE {Math.min(currentChallengeIdx + 1, challenges.length)} OF {challenges.length}</Text>
        <Text style={styles.hudInstructionText}>{getChallengeLabel(currentChallenge)}</Text>
        <Text style={styles.hudStatus}>{livenessStatus}</Text>

        <View style={styles.dotsContainer}>
          {challenges.map((_, idx) => (
            <View 
              key={idx} 
              style={[
                styles.dot, 
                idx < currentChallengeIdx && styles.dotCompleted,
                idx === currentChallengeIdx && styles.dotActive
              ]} 
            />
          ))}
        </View>
      </View>
    );
  };

  // Render Government Header layout matching Datalake 3.0
  const renderHeader = () => (
    <View style={styles.govHeader}>
      <View style={styles.govHeaderLeft}>
        <View style={styles.emblemContainer}>
          <View style={styles.emblemSaffron} />
          <View style={styles.emblemWhite}>
            <View style={styles.emblemChakra} />
          </View>
          <View style={styles.emblemGreen} />
        </View>
        <View style={styles.headerTextCol}>
          <Text style={styles.govTitle}>NHAI</Text>
          <Text style={styles.govSubtitle}>Government of India</Text>
        </View>
      </View>
    </View>
  );

  // Render Simple Datalake Dashboard containing only the Face Recognition controls
  const renderDashboard = () => {
    const pendingLogs = logs.filter(log => log.syncStatus === 'pending');
    
    // Dynamic attendance rate calculation based on local logs
    const presentLogs = logs.filter(log => log.matchScore >= 0.82);
    const mockAttendanceRate = logs.length > 0 
      ? ((presentLogs.length / logs.length) * 100).toFixed(1) + '%'
      : '100.0%';

    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {renderHeader()}

        {/* Summary Stats Banner (Mockup Blue Stat Card) */}
        <View style={styles.statsCardBanner}>
          <View style={styles.statCol}>
            <Text style={styles.statColTitle}>Enrolled Faces</Text>
            <Text style={styles.statColNum}>{users.length}</Text>
          </View>
          <View style={styles.statColDivider} />
          <View style={styles.statCol}>
            <Text style={styles.statColTitle}>Attendance Rate</Text>
            <View style={styles.attendanceBadge}>
              <Text style={styles.attendanceBadgeText}>{mockAttendanceRate}</Text>
            </View>
          </View>
          <View style={styles.statColDivider} />
          <View style={styles.statCol}>
            <Text style={styles.statColTitle}>Pending Logs</Text>
            <Text style={styles.statColNum}>{pendingLogs.length}</Text>
          </View>
        </View>

        {/* Zero-Network Zone Settings */}
        <View style={[styles.networkStatusCard, isOnline ? styles.networkOnlineCard : styles.networkOfflineCard]}>
          <Animated.View style={[styles.lightIndicator, isOnline ? styles.lightOnline : styles.lightOffline, { transform: [{ scale: pulseAnim }] }]} />
          <Text style={styles.networkStatusText}>
            {isOnline ? 'CLOUD LINK RESTORED (ONLINE)' : 'ZERO-NETWORK ZONE (SECURE OFFLINE)'}
          </Text>
          <TouchableOpacity 
            style={styles.networkToggleBtn} 
            onPress={() => setIsOnline(!isOnline)}
          >
            <Text style={styles.networkToggleBtnText}>SWITCH</Text>
          </TouchableOpacity>
        </View>

        {/* Action 1: Authenticate Personnel (Scan Face) */}
        <View style={styles.actionCard}>
          <Text style={styles.sectionHeader}>Biometric Attendance Audit</Text>
          <Text style={styles.panelDescription}>
            Audit physical presence offline by launching the face recognition and liveness pipeline.
          </Text>
          <TouchableOpacity style={styles.authActionButton} onPress={openAuthenticate}>
            <Text style={styles.authActionButtonText}>AUTHENTICATE PERSONNEL</Text>
          </TouchableOpacity>
        </View>

        {/* Action 2: Personnel Registration */}
        <View style={styles.actionCard}>
          <Text style={styles.sectionHeader}>Personnel Enrollment</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Full Name"
            placeholderTextColor={COLORS.textSubtle}
            value={enrollName}
            onChangeText={setEnrollName}
          />
          <TextInput
            style={styles.textInput}
            placeholder="Employee ID"
            placeholderTextColor={COLORS.textSubtle}
            value={enrollId}
            onChangeText={setEnrollId}
            autoCapitalize="characters"
          />
          {enrollError ? <Text style={styles.errorText}>{enrollError}</Text> : null}
          <TouchableOpacity style={styles.primaryActionButton} onPress={openRegister}>
            <Text style={styles.primaryActionButtonText}>REGISTER FACE TEMPLATE</Text>
          </TouchableOpacity>
        </View>

        {/* Action 3: Offline Attendance Logs Cache */}
        <View style={styles.actionCard}>
          <View style={styles.syncRow}>
            <Text style={styles.sectionHeader}>Offline Attendance Cache</Text>
            <TouchableOpacity 
              style={[styles.syncTriggerBtn, pendingLogs.length === 0 && styles.syncTriggerBtnDisabled]} 
              onPress={handleSyncLogs}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.syncTriggerBtnText}>Sync & Purge</Text>
              )}
            </TouchableOpacity>
          </View>

          {logs.length === 0 ? (
            <Text style={styles.emptyText}>No attendance records recorded on this device.</Text>
          ) : (
            logs.map(log => (
              <View key={log.id} style={styles.logCard}>
                <View style={styles.logCardLeft}>
                  <Text style={styles.logCardName}>{log.name}</Text>
                  <Text style={styles.logCardId}>ID: {log.employeeId} • Sim: {(log.matchScore * 100).toFixed(1)}%</Text>
                  <Text style={styles.logCardTime}>{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : 'N/A'}</Text>
                </View>
                <View style={[styles.badgeContainer, log.syncStatus === 'synced' ? styles.badgeSynced : styles.badgePending]}>
                  <Text style={styles.badgeText}>{(log.syncStatus || 'pending').toUpperCase()}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Database Maintenance */}
        <TouchableOpacity style={styles.resetBtn} onPress={handleClearDatabase}>
          <Text style={styles.resetBtnText}>FACTORY RESET LOCAL STORAGE</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // Render Camera Screen Layout
  const renderCameraView = () => {
    const isSuccess = livenessStep === 'success';
    const isFailed = livenessStep === 'failed';
    const isProcessing = livenessStep === 'processing' || livenessStep === 'ready';

    let borderColor = COLORS.secondary;
    if (isSuccess) borderColor = COLORS.accent;
    if (isFailed) borderColor = COLORS.danger;
    if (isProcessing) borderColor = COLORS.primary;

    return (
      <View style={styles.cameraScreenContainer}>
        <StatusBar hidden />
        <FaceCamera
          ref={faceCameraRef}
          style={styles.fullCamera}
          onLivenessStarted={handleLivenessStarted}
          onChallengeComplete={handleChallengeComplete}
          onLivenessSuccess={handleLivenessSuccess}
          onLivenessFailed={handleLivenessFailed}
        />

        <View style={[styles.cameraBorderFrame, { borderColor: borderColor }]}>
          <View style={styles.scannerLine} />
        </View>

        {renderChallengeHUD()}

        <TouchableOpacity 
          style={styles.closeCameraButton} 
          onPress={() => setCurrentScreen('dashboard')}
        >
          <Text style={styles.closeCameraText}>CANCEL SCAN</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.mainContainer}>
        {currentScreen === 'dashboard' ? renderDashboard() : renderCameraView()}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  mainContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  // Government Header
  govHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  govHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emblemContainer: {
    width: 24,
    height: 24,
    borderRadius: 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  emblemSaffron: {
    flex: 1,
    backgroundColor: '#FF9933',
  },
  emblemWhite: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emblemChakra: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#000080',
  },
  emblemGreen: {
    flex: 1,
    backgroundColor: '#138808',
  },
  headerTextCol: {
    marginLeft: 10,
  },
  govTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  govSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSub,
  },
  headerRight: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  // Welcome Text
  welcomeText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 16,
    letterSpacing: 0.2,
  },
  // Blue Statistics Card Banner
  statsCardBanner: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#0F3A80',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statColDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  statColTitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    marginBottom: 4,
  },
  statColNum: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  attendanceBadge: {
    backgroundColor: COLORS.accent,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  attendanceBadgeText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  // Network status card
  networkStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderColor: COLORS.border,
  },
  networkOnlineCard: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  networkOfflineCard: {
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
  networkStatusText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.text,
    flex: 1,
  },
  networkToggleBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: '#FFFFFF',
  },
  networkToggleBtnText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.primary,
  },
  // Content Cards
  actionCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 12,
  },
  panelDescription: {
    fontSize: 12,
    color: COLORS.textSub,
    lineHeight: 16,
    marginBottom: 14,
  },
  textInput: {
    height: 44,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    fontSize: 13,
    color: COLORS.text,
    marginBottom: 12,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: '700',
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
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  authActionButton: {
    height: 44,
    borderRadius: 22,
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
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  // Sync details
  syncRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  syncTriggerBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
  },
  syncTriggerBtnDisabled: {
    backgroundColor: COLORS.textSubtle,
    opacity: 0.5,
  },
  syncTriggerBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  emptyText: {
    fontSize: 12,
    color: COLORS.textSubtle,
    textAlign: 'center',
    marginVertical: 12,
  },
  logCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  logCardLeft: {
    flex: 1,
  },
  logCardName: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
  },
  logCardId: {
    fontSize: 10,
    color: COLORS.textSub,
    marginTop: 2,
  },
  logCardTime: {
    fontSize: 9,
    color: COLORS.textSubtle,
    marginTop: 1,
  },
  badgeContainer: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  badgeSynced: {
    backgroundColor: '#DEF7EC',
  },
  badgePending: {
    backgroundColor: '#FEF3C7',
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: COLORS.textSub,
  },
  // Reset Button
  resetBtn: {
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.danger,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  resetBtnText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: '800',
  },
  // Camera view screen details
  cameraScreenContainer: {
    flex: 1,
    backgroundColor: '#000000',
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
  cameraBorderFrame: {
    width: 320,
    height: 320,
    borderRadius: 160, // Circular scanning sweep HUD
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
  closeCameraButton: {
    position: 'absolute',
    bottom: 40,
    height: 44,
    paddingHorizontal: 24,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeCameraText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  // HUD Overlays
  hudOverlay: {
    position: 'absolute',
    bottom: 120,
    width: SCREEN_WIDTH - 40,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  hudOverlaySuccess: {
    borderLeftWidth: 5,
    borderLeftColor: COLORS.accent,
  },
  hudOverlayFailed: {
    borderLeftWidth: 5,
    borderLeftColor: COLORS.danger,
  },
  hudStatus: {
    fontSize: 12,
    color: COLORS.textSub,
    fontWeight: '700',
    textAlign: 'center',
  },
  spinner: {
    marginTop: 10,
  },
  hudTitleText: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: 1,
  },
  hudTitleTextFailed: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.danger,
    letterSpacing: 1,
  },
  hudStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 4,
    textAlign: 'center',
  },
  hudStatusTextFailed: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 4,
    textAlign: 'center',
  },
  hudSubtextFailed: {
    fontSize: 10,
    color: COLORS.textSub,
    marginTop: 2,
    fontWeight: '600',
  },
  resultDetailsCard: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 8,
    width: '100%',
    marginTop: 10,
    alignItems: 'center',
  },
  resultText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.text,
    marginVertical: 1,
  },
  retryButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  hudStepText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  hudInstructionText: {
    fontSize: 14,
    fontWeight: '900',
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
