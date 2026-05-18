import { createAlertEngine, DEFAULT_THROTTLE_MS, type EngineConfig } from '../src/alerts/engine';
import { phrases } from '../src/alerts/phrases';
import type { SpeakRequest, TtsAdapter } from '../src/alerts/ttsAdapter';
import type { AlertEvent } from '../src/ble/types';

class FakeTts implements TtsAdapter {
  spoken: SpeakRequest[] = [];
  cancelled: string[] = [];
  speak(req: SpeakRequest) {
    this.spoken.push(req);
  }
  cancel(key: string) {
    this.cancelled.push(key);
  }
  async voices() {
    return [];
  }
}

const defaultCfg = (): EngineConfig => ({
  throttleMsByZone: { ...DEFAULT_THROTTLE_MS },
  verbose: false,
  muted: false,
  rate: 0.5,
  voiceId: null,
});

const ev = (dir: AlertEvent['dir'], zone: AlertEvent['zone'], distMm: number): AlertEvent => ({
  dir,
  zone,
  distMm,
});

describe('AlertEngine', () => {
  it('speaks an event the first time', () => {
    const tts = new FakeTts();
    const engine = createAlertEngine(defaultCfg(), tts, phrases);
    engine.ingest(ev('F', 'CLOSE', 400), 0);
    expect(tts.spoken).toHaveLength(1);
    expect(tts.spoken[0]?.text).toBe('front close');
  });

  it('throttles repeated events in the same zone', () => {
    const tts = new FakeTts();
    const engine = createAlertEngine(defaultCfg(), tts, phrases);
    engine.ingest(ev('F', 'CLOSE', 400), 0);
    engine.ingest(ev('F', 'CLOSE', 380), 500);
    engine.ingest(ev('F', 'CLOSE', 360), 1500);
    expect(tts.spoken).toHaveLength(1);
  });

  it('speaks again after the throttle window elapses', () => {
    const tts = new FakeTts();
    const engine = createAlertEngine(defaultCfg(), tts, phrases);
    engine.ingest(ev('F', 'CLOSE', 400), 0);
    engine.ingest(ev('F', 'CLOSE', 390), DEFAULT_THROTTLE_MS.CLOSE + 1);
    expect(tts.spoken).toHaveLength(2);
  });

  it('NEAR preempts an in-flight CLOSE on the same direction', () => {
    const tts = new FakeTts();
    const engine = createAlertEngine(defaultCfg(), tts, phrases);
    engine.ingest(ev('F', 'CLOSE', 400), 0);
    engine.ingest(ev('F', 'NEAR', 150), 200);
    expect(tts.cancelled).toContain('F');
    expect(tts.spoken).toHaveLength(2);
    expect(tts.spoken[1]?.text).toBe('front stop');
  });

  it('does not cancel when escalating from no prior zone', () => {
    const tts = new FakeTts();
    const engine = createAlertEngine(defaultCfg(), tts, phrases);
    engine.ingest(ev('F', 'NEAR', 150), 0);
    expect(tts.cancelled).toHaveLength(0);
  });

  it('OFF cancels pending speech for the same direction and never throttles', () => {
    const tts = new FakeTts();
    const engine = createAlertEngine(defaultCfg(), tts, phrases);
    engine.ingest(ev('F', 'CLOSE', 400), 0);
    const result = engine.ingest(ev('F', 'OFF', 0), 100);
    expect(result).toBeNull();
    expect(tts.cancelled).toContain('F');
  });

  it('OFF without prior non-OFF zone does not cancel', () => {
    const tts = new FakeTts();
    const engine = createAlertEngine(defaultCfg(), tts, phrases);
    engine.ingest(ev('F', 'OFF', 0), 0);
    expect(tts.cancelled).toHaveLength(0);
  });

  it('mute suppresses output but still advances throttle bookkeeping', () => {
    const tts = new FakeTts();
    const engine = createAlertEngine({ ...defaultCfg(), muted: true }, tts, phrases);
    engine.ingest(ev('F', 'CLOSE', 400), 0);
    expect(tts.spoken).toHaveLength(0);

    engine.configure({ muted: false });
    engine.ingest(ev('F', 'CLOSE', 390), 500);
    expect(tts.spoken).toHaveLength(0);

    engine.ingest(ev('F', 'CLOSE', 380), DEFAULT_THROTTLE_MS.CLOSE + 10);
    expect(tts.spoken).toHaveLength(1);
  });

  it('cross-direction events do not throttle each other', () => {
    const tts = new FakeTts();
    const engine = createAlertEngine(defaultCfg(), tts, phrases);
    engine.ingest(ev('F', 'CLOSE', 400), 0);
    engine.ingest(ev('L', 'FAR', 1500), 100);
    engine.ingest(ev('R', 'MED', 700), 200);
    expect(tts.spoken).toHaveLength(3);
  });

  it('verbose phrasing renders distance in metres', () => {
    const tts = new FakeTts();
    const engine = createAlertEngine({ ...defaultCfg(), verbose: true }, tts, phrases);
    engine.ingest(ev('F', 'CLOSE', 380), 0);
    expect(tts.spoken[0]?.text).toBe('close obstacle ahead, 0.38 metres');
  });

  it('configure can patch throttle for one zone without clobbering others', () => {
    const tts = new FakeTts();
    const engine = createAlertEngine(defaultCfg(), tts, phrases);
    engine.configure({ throttleMsByZone: { ...DEFAULT_THROTTLE_MS, CLOSE: 100 } });
    engine.ingest(ev('F', 'CLOSE', 400), 0);
    engine.ingest(ev('F', 'CLOSE', 380), 200);
    expect(tts.spoken).toHaveLength(2);
  });
});
