import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { palette, radius, spacing } from '../../theme/tokens';
import { type } from '../../theme/typography';

export interface PillProps {
  label: string;
  tint?: string;
  background?: string;
  border?: string;
  dot?: boolean;
  style?: ViewStyle;
}

export function Pill({
  label,
  tint = palette.textMid,
  background = palette.surface,
  border = palette.border,
  dot,
  style,
}: PillProps) {
  return (
    <View
      style={[
        styles.base,
        { backgroundColor: background, borderColor: border },
        style,
      ]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: tint }]} /> : null}
      <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md - 2,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.sm - 2,
  },
  label: {
    fontFamily: undefined,
    fontWeight: '600',
    fontSize: 11,
    letterSpacing: 0.2,
  },
});
