import type { AlertEvent, Direction, Zone } from './types';

const FRAME = /^([FLR]):(OFF|FAR|MED|CLOSE|NEAR):(\d{1,5})$/;
const MAX_DIST_MM = 65535;

export function parseLine(line: string): AlertEvent | null {
  const trimmed = line.trim();
  const match = FRAME.exec(trimmed);
  if (!match) return null;

  const distMm = Number(match[3]);
  if (distMm > MAX_DIST_MM) return null;

  return {
    dir: match[1] as Direction,
    zone: match[2] as Zone,
    distMm,
  };
}
