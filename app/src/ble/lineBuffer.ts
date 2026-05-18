const MAX_PENDING = 256;

export class LineBuffer {
  private buf = '';

  push(chunk: string): string[] {
    if (chunk.length === 0) return [];

    this.buf += chunk;

    if (this.buf.length > MAX_PENDING) {
      this.buf = '';
      return [];
    }

    if (!this.buf.includes('\n')) return [];

    const segments = this.buf.split('\n');
    this.buf = segments.pop() ?? '';

    return segments.filter((s) => s.length > 0);
  }

  reset(): void {
    this.buf = '';
  }

  get pending(): string {
    return this.buf;
  }
}
