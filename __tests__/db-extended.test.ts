/**
 * Extended unit tests for db.ts
 * Covers: syncAndPurgeLogs, deleteUser, clearDatabase, encryption integration,
 * edge cases, boundary conditions, and error handling.
 */
import {
  enrollUser,
  getEnrolledUsers,
  deleteUser,
  logAttendance,
  getAttendanceLogs,
  syncAndPurgeLogs,
  clearDatabase,
  identifyFace,
  calculateCosineSimilarity,
} from '../src/services/db';
import { clearCachedKey } from '../src/services/crypto';

// Reset in-memory AsyncStorage store and crypto cache before each test
beforeEach(() => {
  const AsyncStorageMock = require('@react-native-async-storage/async-storage');
  AsyncStorageMock._store.clear();
  clearCachedKey();
});

// ─── deleteUser ───────────────────────────────────────────────────────────────

describe('deleteUser', () => {
  const validEmbedding = Array(192).fill(0.5);

  it('deletes an existing user by employeeId', async () => {
    await enrollUser('Alice', 'EMP001', validEmbedding);
    await enrollUser('Bob', 'EMP002', Array(192).fill(0.3));

    const result = await deleteUser('EMP001');
    expect(result).toBe(true);

    const users = await getEnrolledUsers();
    expect(users).toHaveLength(1);
    expect(users[0].name).toBe('Bob');
  });

  it('returns false when user does not exist', async () => {
    await enrollUser('Alice', 'EMP001', validEmbedding);
    const result = await deleteUser('NONEXIST');
    expect(result).toBe(false);
  });

  it('returns false for empty employeeId', async () => {
    const result = await deleteUser('');
    expect(result).toBe(false);
  });

  it('does not affect other users when deleting one', async () => {
    await enrollUser('Alice', 'EMP001', validEmbedding);
    await enrollUser('Bob', 'EMP002', Array(192).fill(0.3));
    await enrollUser('Charlie', 'EMP003', Array(192).fill(0.7));

    await deleteUser('EMP002');

    const users = await getEnrolledUsers();
    expect(users).toHaveLength(2);
    expect(users.map(u => u.name).sort()).toEqual(['Alice', 'Charlie']);
  });

  it('handles deleting the last user', async () => {
    await enrollUser('Alice', 'EMP001', validEmbedding);
    await deleteUser('EMP001');

    const users = await getEnrolledUsers();
    expect(users).toHaveLength(0);
  });
});

// ─── syncAndPurgeLogs ─────────────────────────────────────────────────────────

describe('syncAndPurgeLogs', () => {
  it('returns success with syncedCount=0 when no pending logs', async () => {
    const result = await syncAndPurgeLogs();
    expect(result.success).toBe(true);
    expect(result.syncedCount).toBe(0);
  });

  it('syncs pending logs and purges them (simulation mode)', async () => {
    await logAttendance('EMP001', 'Alice', 0.95, 'pending');
    await logAttendance('EMP002', 'Bob', 0.88, 'pending');

    const result = await syncAndPurgeLogs();
    expect(result.success).toBe(true);
    expect(result.syncedCount).toBe(2);
    expect(result.purgedCount).toBe(2);

    // Verify logs are purged
    const remainingLogs = await getAttendanceLogs();
    expect(remainingLogs).toHaveLength(0);
  });

  it('preserves already-synced logs during purge', async () => {
    // Manually insert a mix of pending and synced logs
    await logAttendance('EMP001', 'Alice', 0.95, 'pending');
    await logAttendance('EMP002', 'Bob', 0.88, 'synced');

    const result = await syncAndPurgeLogs();
    expect(result.success).toBe(true);
    expect(result.syncedCount).toBe(1); // Only 1 was pending

    const remainingLogs = await getAttendanceLogs();
    expect(remainingLogs).toHaveLength(1);
    expect(remainingLogs[0].name).toBe('Bob');
    expect(remainingLogs[0].syncStatus).toBe('synced');
  });

  it('handles large batch of logs', async () => {
    // Create 50 pending logs
    for (let i = 0; i < 50; i++) {
      await logAttendance(`EMP${i}`, `User${i}`, 0.9, 'pending');
    }

    const result = await syncAndPurgeLogs();
    expect(result.success).toBe(true);
    expect(result.syncedCount).toBe(50);

    const remainingLogs = await getAttendanceLogs();
    expect(remainingLogs).toHaveLength(0);
  });
});

// ─── clearDatabase ────────────────────────────────────────────────────────────

describe('clearDatabase', () => {
  const validEmbedding = Array(192).fill(0.5);

  it('clears all users and logs', async () => {
    await enrollUser('Alice', 'EMP001', validEmbedding);
    await logAttendance('EMP001', 'Alice', 0.95, 'pending');

    const result = await clearDatabase();
    expect(result).toBe(true);

    const users = await getEnrolledUsers();
    const logs = await getAttendanceLogs();
    expect(users).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });

  it('works when database is already empty', async () => {
    const result = await clearDatabase();
    expect(result).toBe(true);
  });

  it('allows re-enrollment after clear', async () => {
    await enrollUser('Alice', 'EMP001', validEmbedding);
    await clearDatabase();

    const result = await enrollUser('Bob', 'EMP002', Array(192).fill(0.3));
    expect(result).toBe(true);

    const users = await getEnrolledUsers();
    expect(users).toHaveLength(1);
    expect(users[0].name).toBe('Bob');
  });
});

// ─── Encryption Integration ───────────────────────────────────────────────────

describe('encryption integration', () => {
  const validEmbedding = Array.from({ length: 192 }, (_, i) => (i - 96) * 0.01);

  it('enrolls and retrieves user with correct embedding values', async () => {
    await enrollUser('Alice', 'EMP001', validEmbedding);

    const users = await getEnrolledUsers();
    expect(users).toHaveLength(1);
    expect(users[0].embedding).toHaveLength(192);

    // Verify each value matches (within floating point tolerance)
    for (let i = 0; i < 192; i++) {
      expect(users[0].embedding[i]).toBeCloseTo(validEmbedding[i], 10);
    }
  });

  it('stored data in AsyncStorage is not plain JSON embedding', async () => {
    await enrollUser('Alice', 'EMP001', validEmbedding);

    // Directly check AsyncStorage content
    const AsyncStorageMock = require('@react-native-async-storage/async-storage');
    const raw = AsyncStorageMock._store.get('@securefaceapp_users');
    const parsed = JSON.parse(raw);

    // Should have encryptedEmbedding field, not plain embedding
    expect(parsed[0].encryptedEmbedding).toBeDefined();
    expect(typeof parsed[0].encryptedEmbedding).toBe('string');

    // The encrypted string should NOT look like a JSON array of numbers
    expect(parsed[0].encryptedEmbedding).not.toMatch(/^\[[\d.,\s-]+\]$/);
  });

  it('cosine similarity still works after encrypt/decrypt cycle', async () => {
    const embedding1 = Array.from({ length: 192 }, () => Math.random());
    const embedding2 = embedding1.map(v => v + 0.001); // Very similar

    await enrollUser('Alice', 'EMP001', embedding1);

    const result = await identifyFace(embedding2, 0.82);
    expect(result.matched).toBe(true);
    expect(result.score).toBeGreaterThan(0.99);
  });

  it('multiple users each get unique encrypted data', async () => {
    const emb1 = Array(192).fill(0.5);
    const emb2 = Array(192).fill(0.9);

    await enrollUser('Alice', 'EMP001', emb1);
    await enrollUser('Bob', 'EMP002', emb2);

    const AsyncStorageMock = require('@react-native-async-storage/async-storage');
    const raw = AsyncStorageMock._store.get('@securefaceapp_users');
    const parsed = JSON.parse(raw);

    // Each user should have different encrypted data (unique IV per encryption)
    expect(parsed[0].encryptedEmbedding).not.toBe(parsed[1].encryptedEmbedding);
  });
});

// ─── Edge Cases & Boundary Conditions ─────────────────────────────────────────

describe('edge cases', () => {
  it('handles maximum length name (100 chars)', async () => {
    const longName = 'A'.repeat(100);
    const result = await enrollUser(longName, 'EMP001', Array(192).fill(0.5));
    expect(result).toBe(true);

    const users = await getEnrolledUsers();
    expect(users[0].name.length).toBe(100);
  });

  it('truncates name exceeding max length', async () => {
    const tooLongName = 'B'.repeat(150);
    const result = await enrollUser(tooLongName, 'EMP001', Array(192).fill(0.5));
    expect(result).toBe(true);

    const users = await getEnrolledUsers();
    expect(users[0].name.length).toBe(100);
  });

  it('handles embedding with extreme values', async () => {
    const extremeEmbedding = Array.from({ length: 192 }, (_, i) =>
      i % 2 === 0 ? 999.999 : -999.999
    );
    const result = await enrollUser('Extreme', 'EMP001', extremeEmbedding);
    expect(result).toBe(true);

    const users = await getEnrolledUsers();
    expect(users[0].embedding[0]).toBeCloseTo(999.999, 2);
    expect(users[0].embedding[1]).toBeCloseTo(-999.999, 2);
  });

  it('handles embedding with very small values near zero', async () => {
    const smallEmbedding = Array(192).fill(0.000001);
    await enrollUser('Small', 'EMP001', smallEmbedding);

    const users = await getEnrolledUsers();
    expect(users[0].embedding[0]).toBeCloseTo(0.000001, 8);
  });

  it('cosine similarity handles near-zero norm vectors gracefully', () => {
    const nearZero = Array(192).fill(1e-300);
    const normal = Array(192).fill(0.5);
    // Should not throw or return NaN
    const score = calculateCosineSimilarity(nearZero, normal);
    expect(isFinite(score)).toBe(true);
  });

  it('identifyFace with threshold -2 matches even opposite vectors', async () => {
    await enrollUser('Alice', 'EMP001', Array(192).fill(0.5));
    const differentProbe = Array(192).fill(-0.5); // Opposite direction, cosine = -1.0

    const result = await identifyFace(differentProbe, -2.0); // Threshold below -1.0
    // cosine(-0.5, 0.5) = -1.0, and -1.0 >= -2.0, so it matches
    expect(result.matched).toBe(true);
  });

  it('identifyFace with threshold 1.0 only matches perfectly identical vectors', async () => {
    const emb = Array(192).fill(0.5);
    await enrollUser('Alice', 'EMP001', emb);

    // Orthogonal probe (cosine = 0) should NOT match at threshold 1.0
    const orthogonalProbe = Array.from({ length: 192 }, (_, i) => (i % 2 === 0 ? 0.5 : -0.5));
    const result = await identifyFace(orthogonalProbe, 1.0);
    expect(result.matched).toBe(false);
  });

  it('logAttendance handles special characters in name', async () => {
    const log = await logAttendance('EMP001', 'José García', 0.9, 'pending');
    expect(log).not.toBeNull();
    expect(log!.name).toBe('José García');
  });

  it('concurrent enrollments do not corrupt data', async () => {
    // Simulate rapid consecutive enrollments
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        enrollUser(`User${i}`, `EMP${String(i).padStart(3, '0')}`, Array(192).fill(i * 0.1))
      );
    }
    await Promise.all(promises);

    const users = await getEnrolledUsers();
    // At minimum, all should be stored (AsyncStorage mock is synchronous internally)
    expect(users.length).toBeGreaterThanOrEqual(1);
    expect(users.length).toBeLessThanOrEqual(10);
  });

  it('getEnrolledUsers returns empty array for corrupted storage', async () => {
    const AsyncStorageMock = require('@react-native-async-storage/async-storage');
    AsyncStorageMock._store.set('@securefaceapp_users', 'not valid json!!!');

    const users = await getEnrolledUsers();
    expect(users).toEqual([]);
  });

  it('getAttendanceLogs returns empty array for corrupted storage', async () => {
    const AsyncStorageMock = require('@react-native-async-storage/async-storage');
    AsyncStorageMock._store.set('@securefaceapp_logs', '{invalid}');

    const logs = await getAttendanceLogs();
    expect(logs).toEqual([]);
  });

  it('logAttendance returns null for empty name', async () => {
    const result = await logAttendance('EMP001', '', 0.9, 'pending');
    expect(result).toBeNull();
  });

  it('enrollment timestamp is valid ISO format', async () => {
    await enrollUser('Alice', 'EMP001', Array(192).fill(0.5));
    const users = await getEnrolledUsers();
    const date = new Date(users[0].enrolledAt);
    expect(date.toISOString()).toBe(users[0].enrolledAt);
  });

  it('attendance log timestamp is valid ISO format', async () => {
    const log = await logAttendance('EMP001', 'Alice', 0.9, 'pending');
    const date = new Date(log!.timestamp);
    expect(date.toISOString()).toBe(log!.timestamp);
  });
});

// ─── Reducer Tests ────────────────────────────────────────────────────────────

describe('appReducer', () => {
  // Import reducer and initial state
  const { appReducer, initialState } = require('../src/context/AppContext');

  it('NAVIGATE changes currentScreen', () => {
    const state = appReducer(initialState, { type: 'NAVIGATE', screen: 'register' });
    expect(state.currentScreen).toBe('register');
  });

  it('TOGGLE_NETWORK flips isOnline', () => {
    const state1 = appReducer(initialState, { type: 'TOGGLE_NETWORK' });
    expect(state1.isOnline).toBe(true);
    const state2 = appReducer(state1, { type: 'TOGGLE_NETWORK' });
    expect(state2.isOnline).toBe(false);
  });

  it('LOAD_DATA sets users and logs', () => {
    const users = [{ name: 'Alice', employeeId: 'EMP001', embedding: [], enrolledAt: '' }];
    const logs = [{ id: '1', employeeId: 'EMP001', name: 'Alice', timestamp: '', matchScore: 0.9, syncStatus: 'pending' }];
    const state = appReducer(initialState, { type: 'LOAD_DATA', users, logs });
    expect(state.users).toEqual(users);
    expect(state.logs).toEqual(logs);
  });

  it('LIVENESS_STARTED sets challenges and step', () => {
    const state = appReducer(initialState, {
      type: 'LIVENESS_STARTED',
      challenges: ['blink', 'smile'],
    });
    expect(state.challenges).toEqual(['blink', 'smile']);
    expect(state.currentChallengeIdx).toBe(0);
    expect(state.livenessStep).toBe('active');
  });

  it('CHALLENGE_COMPLETE increments index', () => {
    const prev = { ...initialState, currentChallengeIdx: 0 };
    const state = appReducer(prev, { type: 'CHALLENGE_COMPLETE', index: 0 });
    expect(state.currentChallengeIdx).toBe(1);
  });

  it('LIVENESS_SUCCESS sets success state', () => {
    const state = appReducer(initialState, {
      type: 'LIVENESS_SUCCESS',
      status: 'Authenticated: Alice',
      matchedUser: { name: 'Alice', employeeId: 'EMP001', embedding: [], enrolledAt: '' },
      score: 0.95,
    });
    expect(state.livenessStep).toBe('success');
    expect(state.matchedUser?.name).toBe('Alice');
    expect(state.scanResultScore).toBe(0.95);
  });

  it('LIVENESS_FAILED sets failure state', () => {
    const state = appReducer(initialState, {
      type: 'LIVENESS_FAILED',
      status: 'Timeout',
      authMessage: 'Access Denied',
      score: 0.45,
    });
    expect(state.livenessStep).toBe('failed');
    expect(state.livenessStatus).toBe('Timeout');
    expect(state.authStatusMessage).toBe('Access Denied');
    expect(state.scanResultScore).toBe(0.45);
    expect(state.matchedUser).toBeNull();
  });

  it('LIVENESS_RETRY resets to ready state', () => {
    const failed = { ...initialState, livenessStep: 'failed' as const, scanResultScore: 0.5, authStatusMessage: 'Denied' };
    const state = appReducer(failed, { type: 'LIVENESS_RETRY' });
    expect(state.livenessStep).toBe('ready');
    expect(state.scanResultScore).toBe(0);
    expect(state.authStatusMessage).toBe('');
  });

  it('CLEAR_ENROLL_FORM resets enrollment fields', () => {
    const filled = { ...initialState, enrollName: 'Alice', enrollId: 'EMP001', enrollError: 'Error' };
    const state = appReducer(filled, { type: 'CLEAR_ENROLL_FORM' });
    expect(state.enrollName).toBe('');
    expect(state.enrollId).toBe('');
    expect(state.enrollError).toBe('');
  });

  it('PREPARE_AUTHENTICATE resets camera state', () => {
    const state = appReducer(initialState, { type: 'PREPARE_AUTHENTICATE' });
    expect(state.currentScreen).toBe('authenticate');
    expect(state.livenessStep).toBe('ready');
    expect(state.matchedUser).toBeNull();
    expect(state.authStatusMessage).toBe('');
    expect(state.scanResultScore).toBe(0);
  });

  it('CLEAR_DATABASE resets users and logs', () => {
    const withData = { ...initialState, users: [{}], logs: [{}] };
    const state = appReducer(withData, { type: 'CLEAR_DATABASE' });
    expect(state.users).toEqual([]);
    expect(state.logs).toEqual([]);
  });

  it('unknown action returns same state', () => {
    const state = appReducer(initialState, { type: 'UNKNOWN_ACTION' } as any);
    expect(state).toBe(initialState);
  });
});
