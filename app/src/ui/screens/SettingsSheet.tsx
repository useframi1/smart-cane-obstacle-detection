import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { DEFAULT_THROTTLE_MS } from '../../alerts/engine';
import type { TtsVoice } from '../../alerts/ttsAdapter';
import type { Zone } from '../../ble/types';
import { useAppStore } from '../../store/useAppStore';
import { palette, radius, shadow, spacing } from '../../theme/tokens';
import { type } from '../../theme/typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { Segmented } from '../components/Segmented';
import type { CaneController } from '../hooks/useCane';

export interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  controller: CaneController;
}

type RatePreset = 'slow' | 'normal' | 'fast';
type CadencePreset = 'rare' | 'normal' | 'frequent';

// iOS AVSpeechUtterance is highly compressed around rate=0.5. A 0.4–0.6 spread
// is barely audible. 0.3 / 0.5 / 0.7 lands in clearly distinct register.
const RATE_VALUES: Record<RatePreset, number> = {
  slow: 0.3,
  normal: 0.5,
  fast: 0.7,
};

const CADENCE_VALUES: Record<CadencePreset, Record<Zone, number>> = {
  rare: { OFF: 0, FAR: 12_000, MED: 6_000, CLOSE: 3_000, NEAR: 1_500 },
  normal: { ...DEFAULT_THROTTLE_MS },
  frequent: { OFF: 0, FAR: 4_000, MED: 2_000, CLOSE: 1_000, NEAR: 600 },
};

const nearestRate = (r: number): RatePreset => {
  if (r <= 0.4) return 'slow';
  if (r >= 0.6) return 'fast';
  return 'normal';
};

const nearestCadence = (t: Record<Zone, number>): CadencePreset => {
  if (t.CLOSE <= 1_500) return 'frequent';
  if (t.CLOSE >= 2_500) return 'rare';
  return 'normal';
};

export function SettingsSheet({ visible, onClose, controller }: SettingsSheetProps) {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [voices, setVoices] = useState<TtsVoice[]>([]);

  useEffect(() => {
    if (!visible) return;
    void controller.tts.voices().then((all) => {
      const en = all.filter((v) => v.language.toLowerCase().startsWith('en'));
      setVoices(en.length > 0 ? en : all);
    });
  }, [visible, controller]);

  const ratePreset = useMemo(() => nearestRate(settings.rate), [settings.rate]);
  const cadencePreset = useMemo(() => nearestCadence(settings.throttleMs), [settings.throttleMs]);

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="slide"
      presentationStyle="pageSheet"
      transparent={false}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[type.title, styles.title]}>Settings</Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <Feather name="x" size={18} color={palette.textHi} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Section label="Speech">
            <Field label="Rate">
              <Segmented<RatePreset>
                options={[
                  { value: 'slow', label: 'Slow' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'fast', label: 'Fast' },
                ]}
                value={ratePreset}
                onChange={(v) => updateSettings({ rate: RATE_VALUES[v] })}
              />
            </Field>

            <Field label="Phrasing">
              <Segmented<'terse' | 'verbose'>
                options={[
                  { value: 'terse', label: 'Terse' },
                  { value: 'verbose', label: 'Verbose' },
                ]}
                value={settings.verbose ? 'verbose' : 'terse'}
                onChange={(v) => updateSettings({ verbose: v === 'verbose' })}
              />
            </Field>

            <Field label="Voice">
              <ScrollView
                style={styles.voiceScroll}
                contentContainerStyle={styles.voiceList}
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                {voices.length === 0 ? (
                  <Text style={[type.body, styles.empty]}>Loading voices…</Text>
                ) : (
                  voices.map((v, idx) => {
                    const active = v.id === settings.voiceId;
                    const isLast = idx === voices.length - 1;
                    return (
                      <Pressable
                        key={v.id}
                        onPress={() => updateSettings({ voiceId: v.id })}
                        style={[
                          styles.voiceRow,
                          !isLast && styles.voiceRowDivided,
                          active && styles.voiceRowActive,
                        ]}
                      >
                        <View style={styles.voiceText}>
                          <Text style={[type.body, styles.voiceName]} numberOfLines={1}>
                            {v.name}
                          </Text>
                          <Text style={[type.captionMicro, styles.voiceLang]} numberOfLines={1}>
                            {v.language}
                          </Text>
                        </View>
                        {active ? (
                          <Feather name="check" size={16} color={palette.accent} />
                        ) : null}
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </Field>
          </Section>

          <Section label="Alert behaviour">
            <Field label="Cadence">
              <Segmented<CadencePreset>
                options={[
                  { value: 'rare', label: 'Rare' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'frequent', label: 'Frequent' },
                ]}
                value={cadencePreset}
                onChange={(v) => updateSettings({ throttleMs: CADENCE_VALUES[v] })}
              />
            </Field>

            <View style={styles.muteRow}>
              <View style={styles.muteText}>
                <Text style={[type.body, styles.muteLabel]}>Mute speech</Text>
                <Text style={[type.captionMicro, styles.muteHint]}>
                  Disables spoken alerts. BLE and on-screen zone display continue.
                </Text>
              </View>
              <Switch
                value={settings.muted}
                onValueChange={(v) => updateSettings({ muted: v })}
                trackColor={{ false: palette.border, true: palette.accent }}
                ios_backgroundColor={palette.border}
              />
            </View>
          </Section>

          <View style={styles.testRow}>
            <PrimaryButton
              label="Test speech"
              onPress={() =>
                controller.testSpeech(
                  settings.verbose
                    ? 'Obstacle ahead, 0.40 metres'
                    : 'front close'
                )
              }
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[type.caption, styles.sectionLabel]}>{label.toUpperCase()}</Text>
      <View style={[styles.sectionBody, shadow.card]}>{children}</View>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={[type.captionMicro, styles.fieldLabel]}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: 24,
    color: palette.textHi,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  section: {
    marginBottom: spacing.xl - 8,
  },
  sectionLabel: {
    color: palette.textLow,
    marginBottom: spacing.sm,
    marginLeft: spacing.sm,
    letterSpacing: 1.4,
  },
  sectionBody: {
    backgroundColor: palette.surfaceHi,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
  },
  field: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    color: palette.textMid,
    marginBottom: spacing.sm,
    letterSpacing: 1.4,
  },
  voiceScroll: {
    maxHeight: 220,
    backgroundColor: palette.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  voiceList: {
    paddingVertical: 2,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  voiceRowDivided: {
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  voiceRowActive: {
    backgroundColor: palette.accentSoft,
  },
  voiceText: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  voiceName: {
    color: palette.textHi,
    fontSize: 14,
  },
  voiceLang: {
    color: palette.textLow,
    marginTop: 2,
  },
  empty: {
    padding: spacing.md,
    color: palette.textLow,
  },
  muteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  muteText: {
    flex: 1,
  },
  muteLabel: {
    color: palette.textHi,
    fontSize: 15,
  },
  muteHint: {
    color: palette.textLow,
    marginTop: 4,
    letterSpacing: 0.2,
    fontSize: 11,
  },
  testRow: {
    marginTop: spacing.sm,
  },
});
