import AsyncStorage from '@react-native-async-storage/async-storage';

const USERS_KEY = '@securefaceapp_users';
const LOGS_KEY = '@securefaceapp_logs';

/**
 * Calculates the Cosine Similarity between two numeric vectors.
 * Returns a value between -1.0 and 1.0. A value >= 0.82 typically indicates a match.
 */
export const calculateCosineSimilarity = (vecA, vecB) => {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

/**
 * Fetch all enrolled users from AsyncStorage.
 */
export const getEnrolledUsers = async () => {
  try {
    const jsonValue = await AsyncStorage.getItem(USERS_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error fetching enrolled users:', e);
    return [];
  }
};

/**
 * Enroll a new user with their face embedding vector.
 */
export const enrollUser = async (name, employeeId, embedding) => {
  try {
    const users = await getEnrolledUsers();
    
    // Check if employee ID already exists
    const existsIdx = users.findIndex(u => u.employeeId === employeeId);
    const newUser = {
      name,
      employeeId,
      embedding,
      enrolledAt: new Date().toISOString()
    };
    
    if (existsIdx > -1) {
      users[existsIdx] = newUser; // Update existing
    } else {
      users.push(newUser); // Add new
    }
    
    await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
    return true;
  } catch (e) {
    console.error('Error enrolling user:', e);
    return false;
  }
};

/**
 * Delete a user from enrollment.
 */
export const deleteUser = async (employeeId) => {
  try {
    const users = await getEnrolledUsers();
    const filtered = users.filter(u => u.employeeId !== employeeId);
    await AsyncStorage.setItem(USERS_KEY, JSON.stringify(filtered));
    return true;
  } catch (e) {
    console.error('Error deleting user:', e);
    return false;
  }
};

/**
 * Match a probe embedding against all registered face templates.
 * Returns the matched user details and similarity score, or null if no match is found.
 */
export const identifyFace = async (probeEmbedding, matchThreshold = 0.82) => {
  const users = await getEnrolledUsers();
  if (users.length === 0) return { matched: false, reason: 'No registered personnel.' };

  let bestMatch = null;
  let highestScore = -1.0;

  for (const user of users) {
    const score = calculateCosineSimilarity(probeEmbedding, user.embedding);
    if (score > highestScore) {
      highestScore = score;
      bestMatch = user;
    }
  }

  if (highestScore >= matchThreshold && bestMatch) {
    return {
      matched: true,
      user: bestMatch,
      score: highestScore
    };
  }

  return {
    matched: false,
    score: highestScore,
    reason: highestScore > 0.6 ? `Face mismatch (best match: ${highestScore.toFixed(2)})` : 'Face not recognized.'
  };
};

/**
 * Fetch all local attendance logs.
 */
export const getAttendanceLogs = async () => {
  try {
    const jsonValue = await AsyncStorage.getItem(LOGS_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error fetching logs:', e);
    return [];
  }
};

/**
 * Add a new attendance record (logged offline with sync status).
 */
export const logAttendance = async (employeeId, name, matchScore, status = 'pending') => {
  try {
    const logs = await getAttendanceLogs();
    const newLog = {
      id: Math.random().toString(36).substring(2, 9),
      employeeId,
      name,
      timestamp: new Date().toISOString(),
      matchScore,
      syncStatus: status // 'pending' or 'synced'
    };
    logs.unshift(newLog); // Put latest logs first
    await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(logs));
    return newLog;
  } catch (e) {
    console.error('Error logging attendance:', e);
    return null;
  }
};

/**
 * Simulate uploading pending logs to the AWS Cloud and then purging them.
 * In a real implementation, this performs an API request. Here, we simulate
 * network latency, mark them synced, and provide the option to purge them.
 */
export const syncAndPurgeLogs = async () => {
  try {
    const logs = await getAttendanceLogs();
    const pendingLogs = logs.filter(log => log.syncStatus === 'pending');
    
    if (pendingLogs.length === 0) {
      return { success: true, syncedCount: 0 };
    }

    // Simulate network API request delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Mark all pending logs as synced
    const updatedLogs = logs.map(log => {
      if (log.syncStatus === 'pending') {
        return { ...log, syncStatus: 'synced' };
      }
      return log;
    });

    // Option: Purge synced records. As per the problem statement requirement:
    // "local data to be purged" upon restoration of network.
    // So we completely filter out and delete/purge any synced logs to free space!
    const purgedLogs = updatedLogs.filter(log => log.syncStatus !== 'synced');
    
    await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(purgedLogs));
    
    return {
      success: true,
      syncedCount: pendingLogs.length,
      purgedCount: pendingLogs.length
    };
  } catch (e) {
    console.error('Error syncing logs:', e);
    return { success: false, error: e.message };
  }
};

/**
 * Clear all data (for testing/resetting).
 */
export const clearDatabase = async () => {
  try {
    await AsyncStorage.removeItem(USERS_KEY);
    await AsyncStorage.removeItem(LOGS_KEY);
    return true;
  } catch (e) {
    return false;
  }
};
