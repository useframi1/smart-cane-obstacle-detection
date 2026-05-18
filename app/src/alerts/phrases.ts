import type { Direction, Zone } from '../ble/types';

type SpokenZone = Exclude<Zone, 'OFF'>;
type PhraseFn = (mm: number) => string;
export type PhraseMap = Record<'terse' | 'verbose', Record<Direction, Record<SpokenZone, PhraseFn>>>;

const DIR_TERSE: Record<Direction, string> = { F: 'front', L: 'left', R: 'right' };
const DIR_VERBOSE: Record<Direction, string> = {
  F: 'ahead',
  L: 'to your left',
  R: 'to your right',
};

const formatMetres = (mm: number): string => {
  const m = Math.round(mm / 10) / 100;
  return m.toFixed(2);
};

const terse =
  (dir: Direction, label: string): PhraseFn =>
  () =>
    `${DIR_TERSE[dir]} ${label}`;

const verbose =
  (dir: Direction, prefix: string): PhraseFn =>
  (mm) =>
    `${prefix} ${DIR_VERBOSE[dir]}, ${formatMetres(mm)} metres`;

const directionPhrases = (dir: Direction): Record<'terse' | 'verbose', Record<SpokenZone, PhraseFn>> => ({
  terse: {
    FAR: terse(dir, 'far'),
    MED: terse(dir, 'mid'),
    CLOSE: terse(dir, 'close'),
    NEAR: terse(dir, 'stop'),
  },
  verbose: {
    FAR: verbose(dir, 'obstacle'),
    MED: verbose(dir, 'obstacle'),
    CLOSE: verbose(dir, 'close obstacle'),
    NEAR: (mm) => `stop — obstacle ${DIR_VERBOSE[dir]}, ${formatMetres(mm)} metres`,
  },
});

export const phrases: PhraseMap = {
  terse: {
    F: directionPhrases('F').terse,
    L: directionPhrases('L').terse,
    R: directionPhrases('R').terse,
  },
  verbose: {
    F: directionPhrases('F').verbose,
    L: directionPhrases('L').verbose,
    R: directionPhrases('R').verbose,
  },
};
