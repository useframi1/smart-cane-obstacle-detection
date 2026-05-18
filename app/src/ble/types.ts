export type Direction = 'F' | 'L' | 'R';

export type Zone = 'OFF' | 'FAR' | 'MED' | 'CLOSE' | 'NEAR';

export interface AlertEvent {
  dir: Direction;
  zone: Zone;
  distMm: number;
}

export const ZONE_PRIORITY: Record<Zone, number> = {
  OFF: 0,
  FAR: 1,
  MED: 2,
  CLOSE: 3,
  NEAR: 4,
};

export const DIRECTION_LABEL: Record<Direction, string> = {
  F: 'Forward',
  L: 'Left',
  R: 'Right',
};
