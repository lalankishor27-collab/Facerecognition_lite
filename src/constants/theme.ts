/**
 * SecureFaceApp - Design System & Theme Constants
 * Matching Datalake 3.0 Government System Template
 */

export const COLORS = {
  background: '#F5F7FA',
  cardBg: '#FFFFFF',
  primary: '#0F3A80',
  secondary: '#D97706',
  accent: '#10B981',
  danger: '#EF4444',
  text: '#1F2937',
  textSub: '#4B5563',
  textSubtle: '#9CA3AF',
  border: '#E5E7EB',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export type ColorKey = keyof typeof COLORS;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const FONT_SIZES = {
  xs: 8,
  sm: 10,
  md: 11,
  base: 12,
  lg: 14,
  xl: 16,
  xxl: 18,
} as const;

export const FONT_WEIGHTS = {
  normal: '400' as const,
  medium: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
  black: '900' as const,
};

export const BORDER_RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 14,
  pill: 22,
  circle: 160,
} as const;

// Liveness thresholds - matching native module values
export const LIVENESS_CONFIG = {
  COSINE_SIMILARITY_THRESHOLD: 0.82,
  EYE_CLOSED_THRESHOLD: 0.15,
  EYE_OPEN_THRESHOLD: 0.65,
  SMILE_THRESHOLD: 0.75,
  HEAD_TURN_THRESHOLD: 18.0,
  STRAIGHT_FACE_THRESHOLD: 8.0,
} as const;
