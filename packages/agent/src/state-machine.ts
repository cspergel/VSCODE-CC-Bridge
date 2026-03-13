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
const SPINNER_CHARS = /[✢✶✻✽·*⏵]/;
const THINKING_VERB_RE = /^[*\s✢✶✻✽·⏵>]*\w+…[*\s✢✶✻✽·⏵>]*$/; // "Forming…", "* Swirling…", "Swirling… >"
const THINKING_LINE_RE = /\w+…/; // word+ellipsis anywhere in line
const THINKING_LABEL_RE = /\(thinking\)/i;
const PROMPT_RE = /^[>❯]\s*$/; // bare ">" or "❯" prompt
const ECHOED_CMD_RE = /^>?\s*\[ctx:/; // our git context injection echo (with or without > prefix)
const WELCOME_RE = /^(Claude Code v\d|Tips for getting|Welcome back|Recent activity|No recent activity|Opus \d|Claude \d|Sonnet \d|Haiku \d|Organization$|cspergel|Claude Max)/i;
const UI_CHROME_RE = /^(\? for shortcuts|\/ide for |esc to (interrupt|cancel)|tab to amend|ctrl\+o|Enter to select|↑\/↓ to navigate|Esc to cancel)/i;

// Tool classification
const SAFE_TOOLS = new Set(["Read", "Glob", "Grep", "WebFetch", "WebSearch", "Task", "Edit", "Write", "NotebookEdit"]);
// Bash is risky — it runs arbitrary shell commands
const RISKY_TOOLS = new Set(["Bash"]);
// All known tools — for detecting tool-use lines
const ALL_TOOLS = new Set([...SAFE_TOOLS, ...RISKY_TOOLS]);

const TOOL_LINE_RE = /^(Read|Edit|Write|Bash|Glob|Grep|WebFetch|WebSearch|NotebookEdit|Task)\b/;
const PERMISSION_RE = /^Allow\b.*\btool\b/i;
// Claude Code Edit/Write uses a different prompt format:
// "Do you want to make this edit to index.html?" / "Do you want to write this file?"
const EDIT_WRITE_PERMISSION_RE = /^Do you want to (make this edit|write this file|create this file|overwrite)\b/i;

/** Detect lines that are purely spinner/thinking noise */
function isThinkingNoise(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  // Pure spinner chars
  if (/^[✢✶✻✽·*\s⏵>…]+$/.test(t)) return true;
  // Thinking verb (Forming…, Seasoning…)
  if (THINKING_VERB_RE.test(t)) return true;
  // word+ellipsis with spinner chars or "thinking" label (e.g. "Combobulating… thinking >")
  if (THINKING_LINE_RE.test(t) && SPINNER_CHARS.test(t)) return true;
  if (THINKING_LINE_RE.test(t) && /\bthinking\b/i.test(t) && t.length < 80) return true;
  // >30% spinner chars
  if ((t.match(/[✢✶✻✽·*…]/g)?.length ?? 0) > t.length * 0.3) return true;
  // (thinking) label
  if (THINKING_LABEL_RE.test(t) && t.length < 80) return true;
  if (/^\(?thinking\)?\s*>?\s*$/i.test(t)) return true;
  // "(thought for Ns)" status line
  if (/^\(thought for \d+s?\)/.test(t)) return true;
  // No complete word in short text (cursor fragments)
  if (t.length < 50 && !/[a-zA-Z]{3}/.test(t)) return true;
  // "running stop hook"
  if (/running stop hook/i.test(t)) return true;
  return false;
}

/** Detect lines that look like Claude Code is starting to think */
function looksLikeThinking(text: string): boolean {
  const t = text.trim();
  if (THINKING_VERB_RE.test(t)) return true;
  if (THINKING_LABEL_RE.test(t)) return true;
  if (/^esc to (interrupt|cancel)/i.test(t)) return true;
  // Only match spinner chars if the line is MOSTLY spinner chars (not "● real content")
  if (SPINNER_CHARS.test(t) && t.length < 20 && !/[a-zA-Z]{3}/.test(t)) return true;
  return false;
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
  if (UI_CHROME_RE.test(t)) return true;
  // Path-only lines
  if (/^[~\/\\]/.test(t) && t.length < 120 && !/\s{2}/.test(t)) return true;
  // TUI tree markers: "⎿ filename" (tool output summaries)
  if (/^[⎿⏐⎡⎣│├└]/.test(t)) return true;
  // TUI tab indicators: "⧉ In filename.ts"
  if (/^⧉/.test(t)) return true;
  // Tool status lines: "Reading 1 file…", "Read 1 file (ctrl+o to expand)", "Update (file.ts)"
  if (/^(Reading|Read|Wrote|Updated|Created|Deleted) \d+ files?[\s…(]/i.test(t)) return true;
  if (/^Update \(.+\)$/.test(t)) return true;
  // Choice prompts that were auto-approved ("> 1. Yes", "2. Yes, allow all edits")
  if (/^>?\s*\d+\.\s*(Yes|No|Allow|Deny|Skip)\b/.test(t)) return true;
  // Interactive picker indicators: "☐ Test", "Enter to select", navigation hints
  if (/^[☐☑✓]\s/.test(t)) return true;
  if (/Enter to select|↑\/↓|Esc to cancel/i.test(t)) return true;
  // Echoed command with context header
  if (ECHOED_CMD_RE.test(t)) return true;
  // Horizontal rules (TUI separators)
  if (/^[─━═]{10,}$/.test(t)) return true;
  return false;
}

/** Detect tool output: diffs, code with line numbers, file content summaries.
 *  These should NOT be forwarded to WhatsApp — only Claude's natural language response matters. */
function isToolOutput(text: string): boolean {
  const t = text.trim();
  // Numbered diff lines: "168 - title:", "168 + title:"
  if (/^\d{1,5}\s*[-+]\s/.test(t)) return true;
  // Numbered code lines: "165 url:", "171 icon:", "173 features:"
  if (/^\d{1,5}\s+\S/.test(t)) return true;
  // Diff file header or tool summary: "index.html", "src/app.ts"
  if (/^\S+\.(ts|tsx|js|jsx|html|css|json|yaml|yml|md|py|go|rs|java|rb|sh|sql|toml)\s*$/.test(t)) return true;
  // Tool output with file context: "Update (file)", "Read 1 file"
  if (/^(Update|Read|Write|Edit|Glob|Grep)\s*\(/.test(t)) return true;
  // Lines that are clearly code (assignments, brackets, common syntax)
  if (/^(import|export|const|let|var|function|class|if|for|while|return|throw)\b/.test(t)) return true;
  // Lines starting with common diff markers
  if (/^[<>]{3,}/.test(t)) return true;
  // Truncated code lines from TUI (missing chars): "nd rapid", "ccelerate", "on process ng"
  if (t.length < 80 && /^\w{2,15}\s\w/.test(t) && !/[.!?]$/.test(t) && !/^[A-Z][a-z]/.test(t)) return false; // not reliable enough
  return false;
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
  pendingTool: { name: string; description: string } | null = null;

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
    this.pendingTool = null;
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
    // Check for tool use entry (e.g., "Read src/app.ts", "Bash npm install")
    const toolMatch = text.match(TOOL_LINE_RE);
    if (toolMatch) {
      this.pendingTool = { name: toolMatch[1], description: text };
      this.transition(ClaudeState.TOOL_USE);
      return;
    }
    // Drop tool output (diffs, code) — only forward natural language responses
    if (isToolOutput(text)) return;
    if (looksLikeContent(text)) {
      this.transition(ClaudeState.RESPONDING);
      this.emit(text, classifyContent(text));
      return;
    }
    // Otherwise drop (spinner noise, thinking labels, etc.)
  }

  private handleToolUse(text: string): void {
    if (isPrompt(text)) {
      this.pendingTool = null;
      this.transition(ClaudeState.IDLE);
      return;
    }
    // Check for permission prompt (e.g., "Allow Read tool?")
    if (PERMISSION_RE.test(text) && this.pendingTool) {
      const toolName = this.pendingTool.name;
      if (RISKY_TOOLS.has(toolName)) {
        // Escalate to WhatsApp as a decision
        this.emit(
          `Allow ${toolName} tool?\n\n${this.pendingTool.description}\n\n\u{1F44D} = Allow  |  \u{1F44E} = Deny\nOr reply: y / n`,
          Classification.Decision,
        );
        // Stay in TOOL_USE — waiting for user response via PTY write
      } else {
        // Auto-approve safe tools
        this.writeToPty("y\r");
        const statusVerb = toolName === "Read" ? "Reading" :
          toolName === "Edit" ? "Editing" :
          toolName === "Write" ? "Writing" :
          toolName === "Glob" ? "Searching files" :
          toolName === "Grep" ? "Searching content" :
          `Using ${toolName}`;
        this.emit(`${statusVerb}: ${this.pendingTool.description.replace(/^\w+\s*/, "")}`, Classification.Status);
        this.transition(ClaudeState.THINKING);
      }
      this.pendingTool = null;
      return;
    }
    // Check for Edit/Write permission prompt (different format from other tools)
    // "Do you want to make this edit to index.html?"
    if (EDIT_WRITE_PERMISSION_RE.test(text)) {
      // Auto-approve — Edit/Write are safe tools. Send "1" (Yes, and stop asking)
      this.writeToPty("1\r");
      this.emit(`Auto-approved edit/write`, Classification.Status);
      this.pendingTool = null;
      this.transition(ClaudeState.THINKING);
      return;
    }
    // Collect more tool context lines (e.g., file contents, parameters)
    if (this.pendingTool && !looksLikeThinking(text) && !isUiChrome(text)) {
      this.pendingTool.description += "\n" + text;
    }
    if (looksLikeThinking(text)) {
      this.pendingTool = null;
      this.transition(ClaudeState.THINKING);
      return;
    }
    if (looksLikeContent(text) && !PERMISSION_RE.test(text)) {
      this.pendingTool = null;
      // Don't emit tool output — just transition silently
      this.transition(ClaudeState.RESPONDING);
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
    // Check for tool use entry while responding (Claude can start a tool mid-response)
    const toolMatch = text.match(TOOL_LINE_RE);
    if (toolMatch) {
      this.pendingTool = { name: toolMatch[1], description: text };
      this.transition(ClaudeState.TOOL_USE);
      return;
    }
    // Check for Edit/Write permission prompt appearing directly in response
    if (EDIT_WRITE_PERMISSION_RE.test(text)) {
      this.writeToPty("1\r");
      this.emit(`Auto-approved edit/write`, Classification.Status);
      this.transition(ClaudeState.THINKING);
      return;
    }
    if (isUiChrome(text)) return;
    if (isThinkingNoise(text)) return; // Drop spinner fragments that slip through
    if (isToolOutput(text)) return; // Drop diff/code content — only forward natural language
    // Forward content as classified output
    this.emit(text, classifyContent(text));
  }
}
