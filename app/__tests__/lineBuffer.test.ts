import { LineBuffer } from '../src/ble/lineBuffer';

describe('LineBuffer', () => {
  it('returns a single complete line', () => {
    const b = new LineBuffer();
    expect(b.push('F:NEAR:120\n')).toEqual(['F:NEAR:120']);
    expect(b.pending).toBe('');
  });

  it('preserves a trailing partial across pushes', () => {
    const b = new LineBuffer();
    expect(b.push('F:NEAR:1')).toEqual([]);
    expect(b.pending).toBe('F:NEAR:1');
    expect(b.push('20\n')).toEqual(['F:NEAR:120']);
  });

  it('returns multiple lines from one push', () => {
    const b = new LineBuffer();
    expect(b.push('F:FAR:1500\nL:MED:800\nR:OFF:0\n')).toEqual([
      'F:FAR:1500',
      'L:MED:800',
      'R:OFF:0',
    ]);
  });

  it('keeps the trailing partial when last segment has no newline', () => {
    const b = new LineBuffer();
    expect(b.push('F:FAR:1500\nL:MED:8')).toEqual(['F:FAR:1500']);
    expect(b.pending).toBe('L:MED:8');
    expect(b.push('00\n')).toEqual(['L:MED:800']);
  });

  it('ignores empty push', () => {
    const b = new LineBuffer();
    expect(b.push('')).toEqual([]);
    expect(b.pending).toBe('');
  });

  it('drops pending on overflow without throwing', () => {
    const b = new LineBuffer();
    const junk = 'x'.repeat(300);
    expect(b.push(junk)).toEqual([]);
    expect(b.pending).toBe('');
    expect(b.push('F:NEAR:100\n')).toEqual(['F:NEAR:100']);
  });

  it('skips empty segments between consecutive newlines', () => {
    const b = new LineBuffer();
    expect(b.push('F:FAR:1500\n\nL:MED:800\n')).toEqual(['F:FAR:1500', 'L:MED:800']);
  });

  it('reset clears pending', () => {
    const b = new LineBuffer();
    b.push('partial');
    expect(b.pending).toBe('partial');
    b.reset();
    expect(b.pending).toBe('');
  });
});
