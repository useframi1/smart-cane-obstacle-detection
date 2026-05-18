import Tts, { type Options, type TtsEvents } from 'react-native-tts';

import type { SpeakRequest, TtsAdapter, TtsVoice } from './ttsAdapter';

// AVSpeechUtterance accepts rate strictly between min (0.0) and max (1.0).
// Clamp generously inside that open interval so boundary values from the UI
// don't get rejected by the native module.
const AV_MIN_OPEN = 0.05;
const AV_MAX_OPEN = 0.95;
const clampRate = (r: number) => Math.max(AV_MIN_OPEN, Math.min(AV_MAX_OPEN, r));

// react-native-tts methods that take an optional ObjC `BOOL *` parameter
// (`stop`, `pause`, `setDefaultRate`, `setDucking`) can't be marshalled by
// the New-Arch JSI bridge — a JS boolean can't be coerced into a BOOL
// pointer. Calls throw or silently reject. We bypass these methods entirely
// and use per-utterance options on `Tts.speak`, which uses NSDictionary and
// marshals cleanly.
const stopSilently = () => {
  try {
    void Tts.stop(false);
  } catch {
    // No-op — broken under New Arch, expected.
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
      stopSilently();
      // Tts.speak's `Options` d.ts requires all three keys, but the iOS
      // native impl reads them by key via `valueForKey` and treats absent
      // keys as nil — so a partial dictionary is correct at runtime. Cast
      // through Partial to satisfy the (overly strict) types.
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
