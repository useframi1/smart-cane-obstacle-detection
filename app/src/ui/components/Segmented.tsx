import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette, radius, shadow, spacing } from '../../theme/tokens';
import { type } from '../../theme/typography';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  return (
    <View style={styles.track}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              styles.segment,
              active && [styles.segmentActive, shadow.card],
              pressed && !active && styles.segmentPressed,
            ]}
          >
            <Text
              style={[
                type.body,
                styles.label,
                { color: active ? palette.textHi : palette.textMid },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  segmentActive: {
    backgroundColor: palette.surfaceHi,
  },
  segmentPressed: {
    opacity: 0.55,
  },
  label: {
    fontSize: 13,
    letterSpacing: 0.1,
  },
});
