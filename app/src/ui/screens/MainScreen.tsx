import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { DIRECTION_LABEL } from '../../ble/types';
import { useAppStore } from '../../store/useAppStore';
import { palette, spacing } from '../../theme/tokens';
import { type } from '../../theme/typography';
import { DirectionGauge } from '../components/DirectionGauge';
import { DistanceReadout } from '../components/DistanceReadout';
import { IconButton } from '../components/IconButton';
import { PrimaryButton } from '../components/PrimaryButton';
import { StatusPill } from '../components/StatusPill';
import { ZoneBanner } from '../components/ZoneBanner';
import { useCane } from '../hooks/useCane';
import { useCurrentObstacle } from '../hooks/useCurrentObstacle';
import { SettingsSheet } from './SettingsSheet';

const TOP_INSET = Platform.select({ ios: 58, android: 32, default: 24 });
const BOTTOM_INSET = Platform.select({ ios: 34, android: 16, default: 16 });

export function MainScreen() {
  const controller = useCane();
  const bleState = useAppStore((s) => s.bleState);
  const current = useAppStore((s) => s.current);
  const muted = useAppStore((s) => s.settings.muted);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const [settingsOpen, setSettingsOpen] = useState(false);

  const obstacle = useCurrentObstacle(current);
  const isConnected = bleState.kind === 'connected';
  const isWorking =
    bleState.kind === 'scanning' || bleState.kind === 'connecting';

  const accentColor =
    obstacle.zone === 'OFF' ? palette.textHi : palette.zone[obstacle.zone];

  const buttonLabel = (() => {
    if (bleState.kind === 'connected') return 'Disconnect';
    if (bleState.kind === 'scanning') return 'Scanning…';
    if (bleState.kind === 'connecting') return 'Connecting…';
    if (bleState.kind === 'disconnected') return 'Reconnect';
    if (bleState.kind === 'error') return 'Retry';
    return 'Connect';
  })();

  const handlePrimary = () => {
    if (isConnected) {
      void controller.disconnect();
    } else {
      void controller.connect();
    }
  };

  const directionCaption = obstacle.dir
    ? DIRECTION_LABEL[obstacle.dir].toUpperCase()
    : 'STANDBY';

  return (
    <View
      style={[
        styles.container,
        { paddingTop: TOP_INSET, paddingBottom: BOTTOM_INSET },
      ]}
    >
      <View style={styles.topBar}>
        <IconButton
          name="settings"
          accessibilityLabel="Settings"
          onPress={() => setSettingsOpen(true)}
        />
        <StatusPill state={bleState} />
        <IconButton
          name={muted ? 'volume-x' : 'volume-2'}
          accessibilityLabel={muted ? 'Unmute speech' : 'Mute speech'}
          active={muted}
          onPress={() => updateSettings({ muted: !muted })}
        />
      </View>

      <View style={styles.heading}>
        <Text style={[type.brand, styles.brand]} allowFontScaling={false}>
          SonicCane
        </Text>
        <Text style={[type.captionMicro, styles.subtitle]}>
          {directionCaption}
        </Text>
      </View>

      <View style={styles.readout}>
        <DistanceReadout
          distMm={obstacle.distMm}
          color={accentColor}
          size={72}
          active={obstacle.isLive}
        />
      </View>

      <View style={styles.gauge}>
        <DirectionGauge current={current} />
      </View>

      <ZoneBanner zone={obstacle.zone} />

      <View style={styles.footer}>
        <PrimaryButton
          label={buttonLabel}
          onPress={handlePrimary}
          loading={isWorking}
          destructive={isConnected}
        />
      </View>

      <SettingsSheet
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        controller={controller}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
    paddingHorizontal: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  heading: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  brand: {
    fontSize: 28,
    color: palette.textHi,
  },
  subtitle: {
    color: palette.textLow,
    marginTop: spacing.sm,
    letterSpacing: 2.6,
  },
  readout: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  gauge: {
    marginTop: spacing.lg,
  },
  footer: {
    marginTop: 'auto',
  },
});
