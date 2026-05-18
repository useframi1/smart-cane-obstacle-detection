import { parseLine } from '../src/ble/parser';
import type { Direction, Zone } from '../src/ble/types';

const DIRS: Direction[] = ['F', 'L', 'R'];
const ZONES: Zone[] = ['OFF', 'FAR', 'MED', 'CLOSE', 'NEAR'];

describe('parseLine — happy path', () => {
  for (const dir of DIRS) {
    for (const zone of ZONES) {
      it(`parses ${dir}:${zone}:480`, () => {
        expect(parseLine(`${dir}:${zone}:480`)).toEqual({ dir, zone, distMm: 480 });
      });
    }
  }

  it('parses zero distance (OFF case)', () => {
    expect(parseLine('R:OFF:0')).toEqual({ dir: 'R', zone: 'OFF', distMm: 0 });
  });

  it('parses max five-digit distance', () => {
    expect(parseLine('F:FAR:65535')).toEqual({ dir: 'F', zone: 'FAR', distMm: 65535 });
  });

  it('trims surrounding whitespace', () => {
    expect(parseLine('  F:NEAR:120  ')).toEqual({ dir: 'F', zone: 'NEAR', distMm: 120 });
  });
});

describe('parseLine — malformed input', () => {
  it.each([
    ['empty string', ''],
    ['whitespace only', '   '],
    ['unknown direction', 'X:NEAR:100'],
    ['unknown zone', 'F:HUGE:100'],
    ['non-numeric distance', 'F:NEAR:abc'],
    ['distance > 65535', 'F:NEAR:99999'],
    ['too few parts', 'F:NEAR'],
    ['too many parts', 'F:NEAR:100:extra'],
    ['lowercase direction', 'f:NEAR:100'],
    ['lowercase zone', 'F:near:100'],
    ['negative distance', 'F:NEAR:-100'],
    ['extra characters', 'F:NEAR:100extra'],
  ])('returns null for %s', (_label, input) => {
    expect(parseLine(input)).toBeNull();
  });

  it('tolerates a trailing newline by trimming', () => {
    expect(parseLine('F:NEAR:120\n')).toEqual({ dir: 'F', zone: 'NEAR', distMm: 120 });
  });
});
