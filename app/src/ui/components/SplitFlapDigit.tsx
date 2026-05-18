import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { palette, radius, shadow } from '../../theme/tokens';
import { type } from '../../theme/typography';

export interface SplitFlapDigitProps {
  digit: string;
  color: string;
  size?: number;
}

const FLIP_HALF_MS = 105;

// Menlo's vertical metrics put the baseline well below centre — naïve
// flex-centring leaves the glyph hugging the top of the cell. We compensate
// with a positive top offset (about 12 % of the font size) so the visible
// glyph sits in the optical centre of the cell.
const BASELINE_NUDGE = 0.12;

export function SplitFlapDigit({ digit, color, size = 88 }: SplitFlapDigitProps) {
  const rotate = useSharedValue(0);

  useEffect(() => {
    rotate.value = withSequence(
      withTiming(-90, { duration: FLIP_HALF_MS }),
      withTiming(0, { duration: FLIP_HALF_MS })
    );
  }, [digit, rotate]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 800 }, { rotateX: `${rotate.value}deg` }],
  }));

  const cellHeight = size * 1.16;
  const cellWidth = size * 0.7;
  const digitSize = size;
  const nudge = digitSize * BASELINE_NUDGE;

  return (
    <View
      style={[
        styles.cell,
        shadow.card,
        { width: cellWidth, height: cellHeight },
      ]}
    >
      <View style={styles.divider} />
      <Animated.View style={[styles.flap, animatedStyle]}>
        <Text
          style={[
            type.numeral,
            styles.digit,
            {
              color,
              fontSize: digitSize,
              lineHeight: digitSize,
              marginTop: nudge,
            },
          ]}
          allowFontScaling={false}
        >
          {digit}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    backgroundColor: palette.surfaceHi,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginHorizontal: 3,
  },
  divider: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1,
    backgroundColor: palette.border,
    zIndex: 2,
  },
  flap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: {
    includeFontPadding: false,
    textAlign: 'center',
  },
});
