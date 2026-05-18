import { Platform, type TextStyle } from 'react-native';

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
const display = Platform.select({
  ios: 'SF Pro Display',
  android: 'sans-serif-medium',
  default: 'System',
});

export const fontFamily = {
  mono,
  display,
} as const;

export const type = {
  numeral: {
    fontFamily: mono,
    fontWeight: '600' as const,
    fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
    letterSpacing: -2,
  },
  monoLabel: {
    fontFamily: mono,
    fontWeight: '400' as const,
    fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
  },
  zoneBanner: {
    fontFamily: display,
    fontWeight: '700' as const,
    letterSpacing: 8,
  },
  brand: {
    fontFamily: display,
    fontWeight: '700' as const,
    letterSpacing: -0.6,
  },
  title: {
    fontFamily: display,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
  },
  body: {
    fontFamily: display,
    fontWeight: '500' as const,
  },
  caption: {
    fontFamily: display,
    fontWeight: '600' as const,
    fontSize: 11,
    letterSpacing: 1.4,
  },
  captionMicro: {
    fontFamily: display,
    fontWeight: '600' as const,
    fontSize: 10,
    letterSpacing: 1.6,
  },
} satisfies Record<string, TextStyle>;
