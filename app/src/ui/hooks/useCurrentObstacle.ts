import { useMemo } from 'react';

import type { AlertEvent, Direction, Zone } from '../../ble/types';
import { ZONE_PRIORITY } from '../../ble/types';

export interface CurrentObstacle {
  dir: Direction | null;
  zone: Zone;
  distMm: number;
  isLive: boolean;
}

export function useCurrentObstacle(
  current: Partial<Record<Direction, AlertEvent>>
): CurrentObstacle {
  return useMemo(() => {
    let best: AlertEvent | null = null;
    for (const dir of Object.keys(current) as Direction[]) {
      const e = current[dir];
      if (!e || e.zone === 'OFF') continue;
      if (!best || ZONE_PRIORITY[e.zone] > ZONE_PRIORITY[best.zone]) {
        best = e;
      }
    }

    if (best) {
      return { dir: best.dir, zone: best.zone, distMm: best.distMm, isLive: true };
    }
    return { dir: null, zone: 'OFF', distMm: 0, isLive: false };
  }, [current]);
}
