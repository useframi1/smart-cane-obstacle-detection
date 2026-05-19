import { useEffect, useMemo, useRef } from 'react';

import { createAlertEngine, type AlertEngine } from '../../alerts/engine';
import { phrases } from '../../alerts/phrases';
import { configureAudioSession } from '../../alerts/audioSession';
import { createNativeTts } from '../../alerts/nativeTts';
import type { TtsAdapter } from '../../alerts/ttsAdapter';
import { createCaneManager, type CaneManager } from '../../ble/manager';
import { useAppStore, type Settings } from '../../store/useAppStore';

export interface CaneController {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  testSpeech: (text: string) => void;
  tts: TtsAdapter;
}

const settingsToEngineConfig = (settings: Settings) => ({
  throttleMsByZone: settings.throttleMs,
  verbose: settings.verbose,
  muted: settings.muted,
  rate: settings.rate,
  voiceId: settings.voiceId,
});

export function useCane(): CaneController {
  const manager = useRef<CaneManager | null>(null);
  const tts = useRef<TtsAdapter | null>(null);
  const engine = useRef<AlertEngine | null>(null);

  if (!tts.current) tts.current = createNativeTts();
  if (!engine.current) {
    const initial = useAppStore.getState().settings;
    engine.current = createAlertEngine(
      settingsToEngineConfig(initial),
      tts.current,
      phrases
    );
  }
  if (!manager.current) manager.current = createCaneManager({ autoReconnect: true });

  useEffect(() => {
    void configureAudioSession();

    const m = manager.current!;
    const eng = engine.current!;
    const setBleState = useAppStore.getState().setBleState;
    const ingestAlert = useAppStore.getState().ingestAlert;

    const offState = m.subscribeState((state) => {
      if (state.kind !== 'connected') tts.current?.cancel('*');
      setBleState(state);
    });
    const offAlert = m.onAlert((event) => {
      ingestAlert(event);
      eng.ingest(event, Date.now());
    });

    const unsubSettings = useAppStore.subscribe((state, prev) => {
      if (state.settings !== prev.settings) {
        if (state.settings.muted && !prev.settings.muted) {
          tts.current?.cancel('*');
        }
        eng.configure(settingsToEngineConfig(state.settings));
      }
    });

    return () => {
      offState();
      offAlert();
      unsubSettings();
      m.destroy();
      manager.current = null;
    };
  }, []);

  return useMemo<CaneController>(
    () => ({
      connect: () => manager.current?.start() ?? Promise.resolve(),
      disconnect: () => manager.current?.disconnect() ?? Promise.resolve(),
      testSpeech: (text) => {
        const settings = useAppStore.getState().settings;
        tts.current?.speak({
          text,
          priority: 1,
          key: 'test',
          rate: settings.rate,
          voiceId: settings.voiceId,
        });
      },
      tts: tts.current!,
    }),
    []
  );
}
