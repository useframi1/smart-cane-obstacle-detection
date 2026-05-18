import Tts from 'react-native-tts';

export async function configureAudioSession(): Promise<void> {
  await Tts.getInitStatus().catch(() => undefined);
  Tts.setIgnoreSilentSwitch('ignore');
  Tts.setDucking(true);
  Tts.setDefaultLanguage('en-US');
}
