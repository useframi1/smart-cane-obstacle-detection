import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { AlertEvent, Direction, Zone } from '../../ble/types';
import { ZONE_PRIORITY } from '../../ble/types';
import { palette, spacing } from '../../theme/tokens';

export interface DirectionGaugeProps {
  current: Partial<Record<Direction, AlertEvent>>;
}

const DIRECTIONS: Direction[] = ['L', 'F', 'R'];

function intensity(zone: Zone | undefined): number {
  if (!zone || zone === 'OFF') return 0;
  return ZONE_PRIORITY[zone] / 4;
}

function colorFor(zone: Zone | undefined): string {
  if (!zone || zone === 'OFF') return palette.borderStrong;
  return palette.zone[zone];
}

interface ArrowProps {
  rotate: number;
  zone: Zone | undefined;
}

function Arrow({ rotate, zone }: ArrowProps) {
  const i = useSharedValue(0);

  useEffect(() => {
    i.value = withTiming(intensity(zone), { duration: 220 });
  }, [zone, i]);

  const animated = useAnimatedStyle(() => ({
    opacity: 0.3 + i.value * 0.7,
    transform: [{ scale: 0.85 + i.value * 0.3 }, { rotate: `${rotate}deg` }],
  }));

  const color = colorFor(zone);

  return (
    <Animated.View style={[styles.arrowCell, animated]}>
      <View
        style={[
          styles.arrow,
          {
            borderBottomColor: color,
          },
        ]}
      />
    </Animated.View>
  );
}

export function DirectionGauge({ current }: DirectionGaugeProps) {
  return (
    <View style={styles.row}>
      {DIRECTIONS.map((dir) => {
        const rotate = dir === 'F' ? 0 : dir === 'L' ? -90 : 90;
        return <Arrow key={dir} rotate={rotate} zone={current[dir]?.zone} />;
      })}
    </View>
  );
}

const ARROW_SIZE = 26;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingVertical: spacing.md,
  },
  arrowCell: {
    width: ARROW_SIZE * 2,
    height: ARROW_SIZE * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_SIZE * 0.55,
    borderRightWidth: ARROW_SIZE * 0.55,
    borderBottomWidth: ARROW_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
