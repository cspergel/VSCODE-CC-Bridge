import { Classification } from "@live-bridge/shared";

export enum ClaudeState {
  INITIALIZING = "initializing",
  IDLE = "idle",
  THINKING = "thinking",
  TOOL_USE = "tool_use",
  RESPONDING = "responding",
}

export interface ClassifiedLine {
  text: string;
  classification: Classification;
  timestamp: string;
  raw: string;
}

// Spinner and thinking animation characters used by Claude Code TUI
const SPINNER_CHARS = /[✢✶✻✽·]/;
const THINKING_VERB_RE = /^\w+…$/; // "Forming…", "Symbioting…", etc.
const THINKING_LINE_RE = /\w+…/; // word+ellipsis anywhere in line
const THINKING_LABEL_RE = /\(thinking\)/i;
const PROMPT_RE = /^>\s*$/; // bare ">" prompt
const ECHOED_CMD_RE = /^>\s*\[ctx:/; // our git context injection echo
const WELCOME_RE = /^(Claude Code v\d|Tips for getting|Welcome back|Recent activity|No recent activity|Opus \d|Claude \d|Sonnet \d|Haiku \d|Organization$)/i;
const UI_CHROME_RE = /^(\? for shortcuts|\/ide for |esc to (interrupt|cancel)|tab to amend|ctrl\+o)/i;

/** Detect lines that are purely spinner/thinking noise */
function isThinkingNoise(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  // Pure spinner chars
  if (/^[✢✶✻✽·*\s⏵>…●]+$/.test(t)) return true;
  // Thinking verb (Forming…, Seasoning…)
  if (THINKING_VERB_RE.test(t)) return true;
  // word+ellipsis with spinner chars
  if (THINKING_LINE_RE.test(t) && SPINNER_CHARS.test(t)) return true;
  // >30% spinner chars
  if ((t.match(/[✢✶✻✽·*…]/g)?.length ?? 0) > t.length * 0.3) return true;
  // (thinking) label
  if (THINKING_LABEL_RE.test(t) && t.length < 80) return true;
  if (/^\(?thinking\)?\s*>?\s*$/i.test(t)) return true;
  // No complete word in short text (cursor fragments)
  if (t.length < 50 && !/[a-zA-Z]{3}/.test(t)) return true;
  // "running stop hook"
  if (/running stop hook/i.test(t)) return true;
  return false;
}

/** Detect lines that look like Claude Code is starting to think */
function looksLikeThinking(text: string): boolean {
  return THINKING_VERB_RE.test(text.trim()) ||
    SPINNER_CHARS.test(text) ||
    THINKING_LABEL_RE.test(text) ||
    /^esc to (interrupt|cancel)/i.test(text.trim());
}

/** Detect a bare prompt line */
function isPrompt(text: string): boolean {
  const t = text.trim();
  return PROMPT_RE.test(t) || ECHOED_CMD_RE.test(t);
}

/** Detect welcome/initialization screen lines */
function isWelcomeScreen(text: string): boolean {
  return WELCOME_RE.test(text.trim());
}

/** Detect UI chrome that should always be dropped */
function isUiChrome(text: string): boolean {
  const t = text.trim();
  return UI_CHROME_RE.test(t) ||
    (/^[~\/\\]/.test(t) && t.length < 120 && !/\s{2}/.test(t)); // path-only lines
}

/** Check if text looks like a real response (not noise, not prompt, not thinking) */
function looksLikeContent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isPrompt(t)) return false;
  if (isUiChrome(t)) return false;
  if (isWelcomeScreen(t)) return false;
  if (isThinkingNoise(t)) return false;
  return true;
}

/** Use the existing classify() logic for content lines, but skip DECISION
 *  for conversational questions — those are OUTPUT in RESPONDING state */
function classifyContent(text: string): Classification {
  const trimmed = text.trim();
  // ERROR patterns
  if (/^(Error|ERROR|FATAL|Exception|Traceback|panic):/.test(trimmed)) return Classification.Error;
  if (/^\s+at\s+/.test(trimmed)) return Classification.Error;
  if (/^(npm ERR!|SyntaxError|TypeError|ReferenceError)/.test(trimmed)) return Classification.Error;
  if (/exit code [1-9]/i.test(trimmed)) return Classification.Error;
  // Everything else in RESPONDING state is OUTPUT
  // (Decisions come from TOOL_USE state, not from response text)
  return Classification.Output;
}

export class ClaudeStateMachine {
  private _state: ClaudeState = ClaudeState.INITIALIZING;
  private thinkingNotified = false;

  constructor(
    private onClassified: (line: ClassifiedLine) => void,
    private writeToPty: (text: string) => void,
  ) {}

  get state(): ClaudeState {
    return this._state;
  }

  /** Reset state (e.g., when PTY restarts) */
  reset(): void {
    this._state = ClaudeState.INITIALIZING;
    this.thinkingNotified = false;
  }

  processLine(line: string): void {
    const t = line.trim();
    if (!t) return;

    switch (this._state) {
      case ClaudeState.INITIALIZING:
        this.handleInitializing(t);
        break;
      case ClaudeState.IDLE:
        this.handleIdle(t);
        break;
      case ClaudeState.THINKING:
        this.handleThinking(t);
        break;
      case ClaudeState.TOOL_USE:
        this.handleToolUse(t);
        break;
      case ClaudeState.RESPONDING:
        this.handleResponding(t);
        break;
    }
  }

  private transition(newState: ClaudeState): void {
    if (newState === this._state) return;
    this._state = newState;
    if (newState === ClaudeState.THINKING) {
      this.thinkingNotified = false;
    }
  }

  private emit(text: string, classification: Classification): void {
    this.onClassified({
      text,
      classification,
      timestamp: new Date().toISOString(),
      raw: "",
    });
  }

  // --- State handlers ---

  private handleInitializing(text: string): void {
    // Drop everything until bare prompt
    if (isPrompt(text)) {
      this.transition(ClaudeState.IDLE);
    }
  }

  private handleIdle(text: string): void {
    if (isPrompt(text) || isUiChrome(text) || isWelcomeScreen(text)) return;
    if (looksLikeThinking(text)) {
      this.transition(ClaudeState.THINKING);
      return;
    }
    if (looksLikeContent(text)) {
      this.transition(ClaudeState.RESPONDING);
      this.emit(text, classifyContent(text));
    }
  }

  private handleThinking(text: string): void {
    // Check for prompt BEFORE emitting status — avoids false "Thinking..." on zero-length phases
    if (isPrompt(text)) {
      this.transition(ClaudeState.IDLE);
      return;
    }
    // Send one "Thinking..." status per thinking phase (only after confirming real thinking)
    if (!this.thinkingNotified) {
      this.thinkingNotified = true;
      this.emit("Thinking...", Classification.Status);
    }
    if (looksLikeContent(text)) {
      this.transition(ClaudeState.RESPONDING);
      this.emit(text, classifyContent(text));
      return;
    }
    // Otherwise drop (spinner noise, thinking labels, etc.)
  }

  private handleToolUse(text: string): void {
    // Placeholder — Task 2 adds full tool handling
    if (isPrompt(text)) {
      this.transition(ClaudeState.IDLE);
      return;
    }
    if (looksLikeThinking(text)) {
      this.transition(ClaudeState.THINKING);
      return;
    }
    if (looksLikeContent(text)) {
      this.transition(ClaudeState.RESPONDING);
      this.emit(text, classifyContent(text));
    }
  }

  private handleResponding(text: string): void {
    if (isPrompt(text)) {
      this.transition(ClaudeState.IDLE);
      return;
    }
    if (looksLikeThinking(text)) {
      this.transition(ClaudeState.THINKING);
      return;
    }
    if (isUiChrome(text)) return;
    // Forward content as classified output
    this.emit(text, classifyContent(text));
  }
}
