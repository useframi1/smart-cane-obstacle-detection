import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_THROTTLE_MS } from '../alerts/engine';
import type { BleState } from '../ble/manager';
import type { AlertEvent, Direction, Zone } from '../ble/types';

export interface Settings {
  muted: boolean;
  verbose: boolean;
  voiceId: string | null;
  rate: number;
  throttleMs: Record<Zone, number>;
}

export interface AppState {
  bleState: BleState;
  current: Partial<Record<Direction, AlertEvent>>;
  settings: Settings;
  setBleState(s: BleState): void;
  ingestAlert(e: AlertEvent): void;
  updateSettings(p: Partial<Settings>): void;
}

const DEFAULT_SETTINGS: Settings = {
  muted: false,
  verbose: false,
  voiceId: null,
  rate: 0.5,
  throttleMs: { ...DEFAULT_THROTTLE_MS },
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      bleState: { kind: 'idle' },
      current: {},
      settings: DEFAULT_SETTINGS,

      setBleState: (s) => set({ bleState: s }),

      ingestAlert: (e) =>
        set((state) => ({
          current: { ...state.current, [e.dir]: e },
        })),

      updateSettings: (patch) =>
        set((state) => ({
          settings: {
            ...state.settings,
            ...patch,
            throttleMs: { ...state.settings.throttleMs, ...patch.throttleMs },
          },
        })),
    }),
    {
      name: 'soniccane.settings.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);
