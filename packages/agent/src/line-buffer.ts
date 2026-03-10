const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07/g;

export class LineBuffer {
  private buffer = "";

  constructor(private onLine: (line: string) => void) {}

  push(chunk: string): void {
    this.buffer += chunk;
    const parts = this.buffer.split("\n");
    // Last element is the incomplete remainder
    this.buffer = parts.pop()!;
    for (const part of parts) {
      this.onLine(part.replace(ANSI_RE, "").trimEnd());
    }
  }

  flush(): void {
    if (this.buffer.length > 0) {
      this.onLine(this.buffer.replace(ANSI_RE, "").trimEnd());
      this.buffer = "";
    }
  }
}
