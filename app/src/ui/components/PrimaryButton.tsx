import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { palette, radius, shadow, spacing } from '../../theme/tokens';
import { type } from '../../theme/typography';

export interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  destructive?: boolean;
  disabled?: boolean;
}

export function PrimaryButton({
  label,
  onPress,
  loading,
  destructive,
  disabled,
}: PrimaryButtonProps) {
  const isInactive = disabled || loading;

  const filled = !destructive;
  const baseColor = destructive ? palette.danger : palette.accent;
  const pressedColor = destructive ? '#DC2626' : palette.accentHi;

  return (
    <Pressable
      onPress={onPress}
      disabled={isInactive}
      style={({ pressed }) => [
        styles.base,
        filled ? shadow.cta : null,
        {
          backgroundColor: filled
            ? pressed
              ? pressedColor
              : baseColor
            : pressed
              ? palette.dangerSoft
              : palette.surfaceHi,
          borderColor: filled ? baseColor : palette.dangerBorder,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator
            size="small"
            color={filled ? '#FFFFFF' : baseColor}
            style={styles.spinner}
          />
        ) : null}
        <Text
          style={[
            type.body,
            styles.label,
            { color: filled ? '#FFFFFF' : baseColor },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: 15,
    letterSpacing: 0.2,
  },
  spinner: {
    marginRight: spacing.sm,
  },
});
