import type { Zone } from '../ble/types';

export const palette = {
  bg: '#FFFFFF',
  surface: '#F8FAFC',
  surfaceHi: '#FFFFFF',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  textHi: '#0F172A',
  textMid: '#475569',
  textLow: '#94A3B8',
  accent: '#1E40AF',
  accentHi: '#1E3A8A',
  accentSoft: '#E8EEFB',
  accentBorder: '#B6C5EF',
  ok: '#047857',
  okSoft: '#ECFDF5',
  okBorder: '#A7F3D0',
  danger: '#EF4444',
  dangerSoft: '#FEE2E2',
  dangerBorder: '#FCA5A5',
  zone: {
    OFF: '#94A3B8',
    FAR: '#10B981',
    MED: '#F59E0B',
    CLOSE: '#F97316',
    NEAR: '#EF4444',
  } as Record<Zone, string>,
  zoneSoft: {
    OFF: '#F1F5F9',
    FAR: '#ECFDF5',
    MED: '#FEF3C7',
    CLOSE: '#FFEDD5',
    NEAR: '#FEE2E2',
  } as Record<Zone, string>,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
  xxl: 64,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const motion = {
  fast: 120,
  base: 220,
  slow: 420,
} as const;

export const hairline = 1;

export const shadow = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  cta: {
    shadowColor: '#1E40AF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 4,
  },
} as const;
