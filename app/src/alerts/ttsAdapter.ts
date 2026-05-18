export interface SpeakRequest {
  text: string;
  priority: number;
  key: string;
  rate?: number;
  voiceId?: string | null;
}

export interface TtsVoice {
  id: string;
  name: string;
  language: string;
}

export interface TtsAdapter {
  speak(req: SpeakRequest): void;
  cancel(key: string): void;
  voices(): Promise<TtsVoice[]>;
}
