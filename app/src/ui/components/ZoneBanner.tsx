import { StyleSheet, Text } from 'react-native';

import type { Zone } from '../../ble/types';
import { palette, spacing } from '../../theme/tokens';
import { type } from '../../theme/typography';

export interface ZoneBannerProps {
  zone: Zone | undefined;
}

const LABEL: Record<Zone, string> = {
  OFF: 'CLEAR',
  FAR: 'FAR',
  MED: 'MID',
  CLOSE: 'CLOSE',
  NEAR: 'STOP',
};

export function ZoneBanner({ zone }: ZoneBannerProps) {
  const effective = zone ?? 'OFF';
  const label = LABEL[effective];
  const color = effective === 'OFF' ? palette.textLow : palette.zone[effective];

  return (
    <Text style={[type.zoneBanner, styles.text, { color }]} allowFontScaling={false}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 22,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
