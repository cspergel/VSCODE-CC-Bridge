export { Classification } from "@live-bridge/shared";
import { Classification } from "@live-bridge/shared";

// ─── Noise detection ────────────────────────────────────────────────────────
// Terminal UI elements that should never reach WhatsApp.
// Called in PtyWrapper BEFORE routing — noise never enters the pipeline.

/** Check if a line is Claude Code terminal UI noise */
export function isNoise(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  // Backspace / control characters only
  if (/^[\b\x7f\s]+$/.test(t)) return true;
  // Spinner/animation characters only
  if (/^[✢✶✻✽·*\s⏵>…●]+$/.test(t)) return true;
  // "esc to interrupt/cancel" prompts
  if (/esc to (interrupt|cancel)/i.test(t)) return true;
  // "accept edits" prompts
  if (/accept edits/i.test(t)) return true;
  // Pure spinner lines with minimal real content (>30% spinner chars)
  if ((t.match(/[✢✶✻✽·*…]/g)?.length ?? 0) > t.length * 0.3) return true;
  // Claude Code thinking indicators (random verbs: Forming, Seasoning, Spelunking, etc.)
  if (/^[✢✶✻✽·*\s⏵>]*\w+…[✢✶✻✽·*\s⏵>]*$/i.test(t)) return true;
  // Thinking animation with spinner chars (e.g. "✢ * Symbioting… ✶ Symbioting…")
  if (/\w+…/.test(t) && /[✢✶✻✽·*]/.test(t)) return true;
  // "thinking" label — only short lines to avoid killing lines mixed with real content
  if (/\bthinking\b/i.test(t) && /[✢✶✻✽·*…]/.test(t) && t.length < 100) return true;
  // "(thinking)" status anywhere in a short line (cursor fragments + thinking label)
  if (/\(thinking\)/i.test(t) && t.length < 80) return true;
  // Bare "thinking >" prompt or "(thinking)" status
  if (/^\(?thinking\)?\s*>?\s*$/i.test(t)) return true;
  // Tab to amend, ctrl+o prompts
  if (/tab to amend|ctrl\+o/i.test(t)) return true;
  // Claude Code welcome screen lines
  if (/^Claude Code v\d/i.test(t)) return true;
  if (/^Tips for getting started$/i.test(t)) return true;
  if (/^Welcome back .+! Run \/init/i.test(t)) return true;
  if (/^Recent activity$/i.test(t)) return true;
  if (/^No recent activity$/i.test(t)) return true;
  if (/^Opus \d|^Claude \d|^Sonnet \d|^Haiku \d/i.test(t)) return true;
  if (/^Organization$/i.test(t)) return true;
  // Path-only lines (working directory display)
  if (/^[~\/\\]/.test(t) && t.length < 120 && !/\s{2}/.test(t)) return true;
  // /ide for Visual Studio Code
  if (/^\/ide for /i.test(t)) return true;
  // "? for shortcuts" prompt
  if (/^\? for shortcuts/i.test(t)) return true;
  // Echoed command with git context prefix (our own injection)
  if (/^>\s*\[ctx:/.test(t)) return true;
  // Empty prompt line
  if (/^>\s*$/.test(t)) return true;
  // Fragmented spinner animation: no complete word (3+ consecutive letters) = noise
  if (t.length < 50 && !/[a-zA-Z]{3}/.test(t)) return true;
  // "running stop hook" and similar internal indicators
  if (/running stop hook/i.test(t)) return true;
  return false;
}

// ─── Classification ─────────────────────────────────────────────────────────
// Semantic bucketing for real (non-noise) content.

const STATUS_PATTERNS = [
  /^(Reading|Searching|Analyzing|Loading|Scanning|Compiling|Indexing)\b/i,
  /^\s*(\||\\|\/|-)\s*$/,
  /^(\d+)\/(\d+) (files|tests|modules)/,
  /^\.\.\.$/,
];

const DECISION_PATTERNS = [
  /\b(proceed|confirm|apply|approve|accept|continue)\b.*\?/i,
  /\b(y\/n|yes\/no)\b/i,
  /\b(should I|shall I|do you want|would you like)\b/i,
  /^(Run|Execute|Create|Delete|Modify)\b.*\?/i,
  /\b(allow|permit|enable|overwrite|replace)\b.*\?/i,
];

const ERROR_PATTERNS = [
  /^(Error|ERROR|FATAL|Exception|Traceback|panic):/,
  /^\s+at\s+/,
  /^(npm ERR!|SyntaxError|TypeError|ReferenceError)/,
  /exit code [1-9]/i,
];

export function classify(text: string): Classification {
  const trimmed = text.trim();
  const firstLine = trimmed.split("\n")[0];

  // ERROR — check all lines, first line priority
  for (const p of ERROR_PATTERNS) {
    if (p.test(firstLine) || p.test(trimmed) || p.test(text)) return Classification.Error;
  }

  // DECISION — check full text
  for (const p of DECISION_PATTERNS) {
    if (p.test(trimmed)) return Classification.Decision;
  }

  // STATUS — first line only
  for (const p of STATUS_PATTERNS) {
    if (p.test(firstLine)) return Classification.Status;
  }

  // Default: OUTPUT
  return Classification.Output;
}
