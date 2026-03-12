// Comprehensive ANSI/terminal escape sequence removal:
// - CSI sequences: ESC [ (with optional ? / > / ! prefixes) params letter/~
// - OSC sequences: ESC ] ... (BEL or ST)
// - Single-char escapes: ESC followed by one char (e.g., ESC=, ESC>, ESC(B)
// - DCS/PM/APC sequences
// - C1 control codes (0x80-0x9F as single bytes)
const ANSI_RE =
  // CSI: ESC[ with optional ?/>! prefix, semicolon-separated params, ending in letter or ~
  /\x1b\[[\?!>]?[0-9;]*[a-zA-Z~@`]|/.source +
  // OSC: ESC] ... terminated by BEL or ESC backslash (ST)
  /\x1b\].*?(?:\x07|\x1b\\)|/.source +
  // DCS/PM/APC: ESC P/^/_ ... ST
  /\x1b[P^_].*?(?:\x07|\x1b\\)|/.source +
  // Two-char escape: ESC + single char (charset, keypad mode, etc.)
  /\x1b[^\[\]P^_\x1b]|/.source +
  // C1 control codes as single bytes
  /[\x80-\x9f]/g.source;

const ANSI_FULL_RE = new RegExp(ANSI_RE, "g");

// Box-drawing (U+2500-257F), block elements (U+2580-259F), braille patterns (U+2800-28FF)
const TUI_CHROME_RE = /[\u2500-\u257F\u2580-\u259F\u2800-\u28FF]/g;

/**
 * Strip TUI chrome from a line. Returns cleaned text or empty string if purely decorative.
 * Lines like "│ Here is my response │" → "Here is my response"
 * Lines like "╭───────────────╮" → "" (pure border)
 */
export function stripTuiChrome(line: string): string {
  const stripped = line.replace(TUI_CHROME_RE, " ").replace(/\s+/g, " ").trim();
  return stripped;
}

export class LineBuffer {
  private buffer = "";

  constructor(private onLine: (line: string) => void) {}

  push(chunk: string): void {
    this.buffer += chunk;
    const parts = this.buffer.split("\n");
    // Last element is the incomplete remainder
    this.buffer = parts.pop()!;
    for (const part of parts) {
      const cleaned = part.replace(ANSI_FULL_RE, " ").replace(/\s+/g, " ").trimEnd();
      const text = stripTuiChrome(cleaned);
      if (text.length > 0) {
        this.onLine(text);
      }
    }
  }

  flush(): void {
    if (this.buffer.length > 0) {
      const cleaned = this.buffer.replace(ANSI_FULL_RE, " ").replace(/\s+/g, " ").trimEnd();
      const text = stripTuiChrome(cleaned);
      if (text.length > 0) {
        this.onLine(text);
      }
      this.buffer = "";
    }
  }
}
