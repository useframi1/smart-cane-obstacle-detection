import { StyleSheet, Text, View } from 'react-native';

import { palette, spacing } from '../../theme/tokens';
import { type } from '../../theme/typography';
import { SplitFlapDigit } from './SplitFlapDigit';

export interface DistanceReadoutProps {
  distMm: number;
  color: string;
  size?: number;
  active: boolean;
}

const pad4 = (mm: number) => {
  const clamped = Math.max(0, Math.min(9999, Math.round(mm)));
  return clamped.toString().padStart(4, '0');
};

export function DistanceReadout({ distMm, color, size = 78, active }: DistanceReadoutProps) {
  const digits = pad4(distMm);
  const digitColor = active ? color : palette.textLow;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {digits.split('').map((d, i) => (
          <SplitFlapDigit key={i} digit={d} color={digitColor} size={size} />
        ))}
      </View>
      <Text style={[type.captionMicro, styles.unit]}>MILLIMETRES</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
  },
  unit: {
    marginTop: spacing.md,
    color: palette.textLow,
  },
});
