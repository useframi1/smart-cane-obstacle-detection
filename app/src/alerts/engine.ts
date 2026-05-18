import type { AlertEvent, Direction, Zone } from '../ble/types';
import { ZONE_PRIORITY } from '../ble/types';
import type { PhraseMap } from './phrases';
import type { SpeakRequest, TtsAdapter } from './ttsAdapter';

export interface EngineConfig {
  throttleMsByZone: Record<Zone, number>;
  verbose: boolean;
  muted: boolean;
  rate: number;
  voiceId: string | null;
}

export interface AlertEngine {
  ingest(event: AlertEvent, nowMs: number): SpeakRequest | null;
  configure(patch: Partial<EngineConfig>): void;
}

export const DEFAULT_THROTTLE_MS: Record<Zone, number> = {
  OFF: 0,
  FAR: 8000,
  MED: 4000,
  CLOSE: 2000,
  NEAR: 1200,
};

type LastByDirZone = Record<`${Direction}:${Zone}`, number>;
type LastZoneByDir = Partial<Record<Direction, Zone>>;

export function createAlertEngine(
  initial: EngineConfig,
  tts: TtsAdapter,
  phrases: PhraseMap
): AlertEngine {
  let cfg: EngineConfig = { ...initial };
  const lastSpoken: LastByDirZone = {} as LastByDirZone;
  const lastZone: LastZoneByDir = {};

  const ingest: AlertEngine['ingest'] = (event, nowMs) => {
    const { dir, zone, distMm } = event;

    if (zone === 'OFF') {
      const prev = lastZone[dir];
      if (prev && prev !== 'OFF') {
        tts.cancel(dir);
        delete lastSpoken[`${dir}:${prev}` as const];
      }
      lastZone[dir] = 'OFF';
      return null;
    }

    const prevZone = lastZone[dir];
    const newPriority = ZONE_PRIORITY[zone];

    if (prevZone && prevZone !== 'OFF' && prevZone !== zone) {
      const prevPriority = ZONE_PRIORITY[prevZone];
      if (newPriority > prevPriority) {
        tts.cancel(dir);
      }
    }

    const key = `${dir}:${zone}` as const;
    const last = lastSpoken[key] ?? -Infinity;
    if (nowMs - last < cfg.throttleMsByZone[zone]) {
      lastZone[dir] = zone;
      return null;
    }

    const phrase = phrases[cfg.verbose ? 'verbose' : 'terse'][dir][zone](distMm);
    const req: SpeakRequest = {
      text: phrase,
      priority: newPriority,
      key: dir,
      rate: cfg.rate,
      voiceId: cfg.voiceId,
    };

    lastSpoken[key] = nowMs;
    lastZone[dir] = zone;

    if (cfg.muted) return null;

    tts.speak(req);
    return req;
  };

  const configure: AlertEngine['configure'] = (patch) => {
    cfg = { ...cfg, ...patch, throttleMsByZone: { ...cfg.throttleMsByZone, ...patch.throttleMsByZone } };
  };

  return { ingest, configure };
}
