import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { palette, radius, shadow } from '../../theme/tokens';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

export interface IconButtonProps {
  name: FeatherName;
  onPress: () => void;
  active?: boolean;
  accessibilityLabel: string;
}

export function IconButton({ name, onPress, active, accessibilityLabel }: IconButtonProps) {
  const color = active ? palette.accent : palette.textMid;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.base,
        shadow.card,
        {
          borderColor: active ? palette.accentBorder : palette.border,
          backgroundColor: active
            ? palette.accentSoft
            : pressed
              ? palette.surface
              : palette.surfaceHi,
        },
      ]}
    >
      <Feather name={name} size={18} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
