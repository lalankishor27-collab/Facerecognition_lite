/**
 * Unit tests for db.ts
 * Covers: calculateCosineSimilarity, enrollUser, identifyFace, logAttendance
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  calculateCosineSimilarity,
  enrollUser,
  getEnrolledUsers,
  identifyFace,
  logAttendance,
  getAttendanceLogs,
  clearDatabase,
} from '../src/services/db';

// Reset in-memory AsyncStorage store before each test
beforeEach(() => {
  const AsyncStorageMock = require('@react-native-async-storage/async-storage');
  AsyncStorageMock._store.clear();
});


// ─── calculateCosineSimilarity ────────────────────────────────────────────────

describe('calculateCosineSimilarity', () => {
  const dim = 192;
  const ones = Array(dim).fill(1.0);
  const neg = Array(dim).fill(-1.0);
  const zeros = Array(dim).fill(0.0);

  it('returns 1.0 for identical vectors', () => {
    const score = calculateCosineSimilarity(ones, ones);
    expect(score).toBeCloseTo(1.0, 5);
  });

  it('returns -1.0 for perfectly opposite vectors', () => {
    const score = calculateCosineSimilarity(ones, neg);
    expect(score).toBeCloseTo(-1.0, 5);
  });

  it('returns 0 for zero vectors', () => {
    expect(calculateCosineSimilarity(zeros, ones)).toBe(0);
    expect(calculateCosineSimilarity(ones, zeros)).toBe(0);
    expect(calculateCosineSimilarity(zeros, zeros)).toBe(0);
  });

  it('returns 0 for empty or mismatched-length vectors', () => {
    expect(calculateCosineSimilarity([], [])).toBe(0);
    expect(calculateCosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it('returns value in [-1, 1] for random vectors', () => {
    const a = Array.from({ length: dim }, () => Math.random() - 0.5);
    const b = Array.from({ length: dim }, () => Math.random() - 0.5);
    const score = calculateCosineSimilarity(a, b);
    expect(score).toBeGreaterThanOrEqual(-1.0);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('is symmetric: sim(A,B) === sim(B,A)', () => {
    const a = Array.from({ length: dim }, (_, i) => i * 0.01);
    const b = Array.from({ length: dim }, (_, i) => (dim - i) * 0.01);
    expect(calculateCosineSimilarity(a, b)).toBeCloseTo(
      calculateCosineSimilarity(b, a), 8
    );
  });
});

// ─── enrollUser & getEnrolledUsers ────────────────────────────────────────────

describe('enrollUser', () => {
  const validEmbedding = Array(192).fill(0.5);

  it('successfully enrolls a valid user', async () => {
    const result = await enrollUser('Alice Smith', 'EMP001', validEmbedding);
    expect(result).toBe(true);
    const users = await getEnrolledUsers();
    expect(users).toHaveLength(1);
    expect(users[0].name).toBe('Alice Smith');
    expect(users[0].employeeId).toBe('EMP001');
  });

  it('updates existing user when enrolling same employeeId', async () => {
    await enrollUser('Alice Smith', 'EMP001', validEmbedding);
    const newEmbedding = Array(192).fill(0.8);
    await enrollUser('Alice Updated', 'EMP001', newEmbedding);
    const users = await getEnrolledUsers();
    expect(users).toHaveLength(1);
    expect(users[0].name).toBe('Alice Updated');
  });

  it('rejects empty name', async () => {
    const result = await enrollUser('', 'EMP001', validEmbedding);
    expect(result).toBe(false);
  });

  it('rejects name shorter than 2 characters', async () => {
    const result = await enrollUser('A', 'EMP001', validEmbedding);
    expect(result).toBe(false);
  });

  it('rejects employeeId shorter than 3 characters', async () => {
    const result = await enrollUser('Alice', 'AB', validEmbedding);
    expect(result).toBe(false);
  });

  it('rejects invalid embedding (wrong dimension)', async () => {
    const badEmbedding = Array(100).fill(0.5); // Should be 192
    const result = await enrollUser('Alice', 'EMP001', badEmbedding);
    expect(result).toBe(false);
  });

  it('rejects embedding containing NaN', async () => {
    const nanEmbedding = [...validEmbedding];
    nanEmbedding[10] = NaN;
    const result = await enrollUser('Alice', 'EMP001', nanEmbedding);
    expect(result).toBe(false);
  });

  it('rejects embedding containing Infinity', async () => {
    const infEmbedding = [...validEmbedding];
    infEmbedding[0] = Infinity;
    const result = await enrollUser('Alice', 'EMP001', infEmbedding);
    expect(result).toBe(false);
  });

  it('sanitizes XSS/injection chars from name and ID', async () => {
    const result = await enrollUser('<script>alert(1)</script>', 'EMP"001', validEmbedding);
    expect(result).toBe(true);
    const users = await getEnrolledUsers();
    expect(users[0].name).not.toContain('<');
    expect(users[0].name).not.toContain('>');
    expect(users[0].employeeId).not.toContain('"');
  });

  it('enrolls multiple distinct users', async () => {
    await enrollUser('Alice', 'EMP001', validEmbedding);
    await enrollUser('Bob', 'EMP002', Array(192).fill(0.3));
    const users = await getEnrolledUsers();
    expect(users).toHaveLength(2);
  });
});

// ─── identifyFace ─────────────────────────────────────────────────────────────

describe('identifyFace', () => {
  const aliceEmbedding = Array(192).fill(0.8);
  const bobEmbedding = Array(192).fill(0.1);
  // A probe very close to Alice
  const aliceProbe = aliceEmbedding.map(v => v + 0.001);

  beforeEach(async () => {
    await enrollUser('Alice', 'EMP001', aliceEmbedding);
    await enrollUser('Bob', 'EMP002', bobEmbedding);
  });

  it('matches probe to correct user when above threshold', async () => {
    const result = await identifyFace(aliceProbe, 0.82);
    expect(result.matched).toBe(true);
    expect(result.user?.name).toBe('Alice');
    expect(result.score).toBeGreaterThanOrEqual(0.82);
  });

  it('does not match when below threshold', async () => {
    // Completely different embedding
    const unknownProbe = Array(192).fill(-0.9);
    const result = await identifyFace(unknownProbe, 0.82);
    expect(result.matched).toBe(false);
    expect(result.user).toBeUndefined();
  });

  it('returns matched: false with no enrolled users', async () => {
    await clearDatabase();
    const result = await identifyFace(aliceProbe, 0.82);
    expect(result.matched).toBe(false);
    expect(result.reason).toMatch(/no registered/i);
  });

  it('rejects invalid probe embedding', async () => {
    const result = await identifyFace([1, 2, 3], 0.82); // Wrong dimension
    expect(result.matched).toBe(false);
    expect(result.reason).toMatch(/invalid/i);
  });
});

// ─── logAttendance ────────────────────────────────────────────────────────────

describe('logAttendance', () => {
  it('creates an attendance log with correct fields', async () => {
    const log = await logAttendance('EMP001', 'Alice', 0.95, 'pending');
    expect(log).not.toBeNull();
    expect(log!.employeeId).toBe('EMP001');
    expect(log!.name).toBe('Alice');
    expect(log!.matchScore).toBe(0.95);
    expect(log!.syncStatus).toBe('pending');
    expect(log!.id).toBeDefined();
    expect(log!.timestamp).toBeDefined();
  });

  it('clamps matchScore to [0, 1]', async () => {
    const over = await logAttendance('EMP001', 'Alice', 1.5, 'pending');
    const under = await logAttendance('EMP001', 'Alice', -0.5, 'pending');
    expect(over!.matchScore).toBe(1.0);
    expect(under!.matchScore).toBe(0.0);
  });

  it('generates unique IDs for each log', async () => {
    const log1 = await logAttendance('EMP001', 'Alice', 0.9, 'pending');
    const log2 = await logAttendance('EMP001', 'Alice', 0.9, 'pending');
    expect(log1!.id).not.toBe(log2!.id);
  });

  it('stores logs in reverse chronological order (latest first)', async () => {
    await logAttendance('EMP001', 'Alice', 0.9, 'pending');
    await logAttendance('EMP002', 'Bob', 0.85, 'pending');
    const logs = await getAttendanceLogs();
    expect(logs[0].name).toBe('Bob'); // Latest first
    expect(logs[1].name).toBe('Alice');
  });

  it('returns null for invalid parameters', async () => {
    const result = await logAttendance('', 'Alice', 0.9, 'pending');
    expect(result).toBeNull();
  });
});
