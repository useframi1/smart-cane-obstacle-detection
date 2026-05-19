import Tts, { type Options, type TtsEvents } from 'react-native-tts';

import type { SpeakRequest, TtsAdapter, TtsVoice } from './ttsAdapter';

// AVSpeechUtterance accepts rate strictly between min (0.0) and max (1.0).
// Clamp generously inside that open interval so boundary values from the UI
// don't get rejected by the native module.
const AV_MIN_OPEN = 0.05;
const AV_MAX_OPEN = 0.95;
const clampRate = (r: number) => Math.max(AV_MIN_OPEN, Math.min(AV_MAX_OPEN, r));

// `Tts.stop` is patched via patches/react-native-tts+4.1.1.patch — the
// upstream signature is `stop:(BOOL *)onWordBoundary`, a pointer-to-BOOL the
// New-Arch JSI bridge can't marshal a JS boolean into. The patch drops the
// pointer so the call goes through and AVSpeechSynthesizer's queue actually
// clears. `setDefaultRate` and `setDucking` have the same BOOL* bug but we
// don't depend on them — per-utterance rate goes through `Tts.speak`'s
// NSDictionary options instead.
const stopSilently = () => {
  try {
    void Tts.stop(false);
  } catch {
    // Defensive — swallow transient teardown errors.
  }
};

// react-native-tts emits `tts-start/progress/finish/cancel` natively on each
// utterance. Without subscribers RN logs `Sending X with no listeners
// registered` every speak. Attach no-op listeners once at module init.
const TTS_EVENTS: TtsEvents[] = [
  'tts-start',
  'tts-progress',
  'tts-finish',
  'tts-cancel',
];
let listenersBound = false;
const bindEventSinks = () => {
  if (listenersBound) return;
  listenersBound = true;
  for (const event of TTS_EVENTS) {
    Tts.addEventListener(event, () => undefined);
  }
};

export function createNativeTts(): TtsAdapter {
  bindEventSinks();

  return {
    speak(req: SpeakRequest) {
      // Do not stop before speaking — iOS AVSpeechSynthesizer queues
      // utterances natively, which is what lets parallel-direction alerts
      // (F/L/R changing at the same scan) all be spoken in sequence. The
      // queue is only cleared by an explicit `cancel('*')` from mute or
      // disconnect. Tts.speak's `Options` d.ts requires all three keys,
      // but the iOS native impl reads them by key via `valueForKey` and
      // treats absent keys as nil — so a partial dictionary is correct at
      // runtime. Cast through Partial to satisfy the (overly strict) types.
      const options: Partial<Exclude<Options, string>> = {};
      if (req.rate !== undefined) options.rate = clampRate(req.rate);
      if (req.voiceId) options.iosVoiceId = req.voiceId;
      Tts.speak(req.text, options as Options);
    },

    cancel(_key: string) {
      stopSilently();
    },

    async voices(): Promise<TtsVoice[]> {
      const voices = await Tts.voices();
      return voices
        .filter((v) => !v.notInstalled)
        .map((v) => ({
          id: v.id,
          name: v.name ?? v.id,
          language: v.language ?? '',
        }));
    },
  };
}
