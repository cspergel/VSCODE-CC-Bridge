# State Machine Classifier Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace regex-based noise filtering and classification with a state machine that tracks Claude Code's output phases, auto-approves safe tools, escalates risky tools as decisions, and supports reaction-based approvals from WhatsApp.

**Architecture:** A new `ClaudeStateMachine` class sits between `LineBuffer` and `MessageRouter`. It receives cleaned lines, tracks which phase Claude Code is in (INITIALIZING → IDLE → THINKING → TOOL_USE / RESPONDING), and emits properly classified events. Tool permission prompts for safe tools are auto-approved by writing `y\r` back to the PTY. Risky tools are sent to WhatsApp as decisions with reaction support (👍/👎).

**Tech Stack:** TypeScript, vitest, existing monorepo packages (`@live-bridge/agent`, `@live-bridge/bridge`, `@live-bridge/shared`)

---

### Task 1: Create `ClaudeStateMachine` with tests — core state tracking

**Files:**
- Create: `packages/agent/src/state-machine.ts`
- Create: `packages/agent/src/__tests__/state-machine.test.ts`

**Step 1: Write the failing tests**

Create `packages/agent/src/__tests__/state-machine.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { ClaudeStateMachine, ClaudeState } from "../state-machine";
import { Classification } from "@live-bridge/shared";

describe("ClaudeStateMachine", () => {
  function createMachine() {
    const emitted: Array<{ text: string; classification: string }> = [];
    const writes: string[] = [];
    const sm = new ClaudeStateMachine(
      (line) => emitted.push({ text: line.text, classification: line.classification }),
      (text) => writes.push(text),
    );
    return { sm, emitted, writes };
  }

  describe("INITIALIZING state", () => {
    it("starts in INITIALIZING and drops welcome screen lines", () => {
      const { sm, emitted } = createMachine();
      expect(sm.state).toBe(ClaudeState.INITIALIZING);
      sm.processLine("Claude Code v2.1.50");
      sm.processLine("Tips for getting started");
      sm.processLine("Welcome back Craig! Run /init to create a CLAUDE.md");
      sm.processLine("Recent activity");
      sm.processLine("No recent activity");
      sm.processLine("Opus 4.6 · Claude Max · user@email.com");
      sm.processLine("Organization");
      sm.processLine("~/Documents/Coding Projects/MyApp");
      expect(emitted).toHaveLength(0);
    });

    it("transitions to IDLE on bare prompt", () => {
      const { sm } = createMachine();
      sm.processLine(">");
      expect(sm.state).toBe(ClaudeState.IDLE);
    });
  });

  describe("IDLE state", () => {
    it("drops prompt lines and echoed commands", () => {
      const { sm, emitted } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("> [ctx: main | 2 files changed] fix the bug");
      sm.processLine("? for shortcuts");
      expect(emitted).toHaveLength(0);
    });

    it("transitions to THINKING on spinner chars", () => {
      const { sm } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…");
      expect(sm.state).toBe(ClaudeState.THINKING);
    });
  });

  describe("THINKING state", () => {
    it("drops spinner noise and emits one Thinking status", () => {
      const { sm, emitted } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…"); // → THINKING
      sm.processLine("✢ * ✶ Symbioting… ✻");
      sm.processLine("(thinking)");
      sm.processLine("✢ Seasoning…");
      // Should emit exactly one status
      const statuses = emitted.filter(e => e.classification === Classification.Status);
      expect(statuses).toHaveLength(1);
      expect(statuses[0].text).toBe("Thinking...");
    });

    it("transitions to RESPONDING on clean text after thinking", () => {
      const { sm, emitted } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…"); // → THINKING
      sm.processLine("Got it — here is my response.");
      expect(sm.state).toBe(ClaudeState.RESPONDING);
      const outputs = emitted.filter(e => e.classification === Classification.Output);
      expect(outputs).toHaveLength(1);
      expect(outputs[0].text).toBe("Got it — here is my response.");
    });
  });

  describe("RESPONDING state", () => {
    it("forwards all lines as OUTPUT", () => {
      const { sm, emitted } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…"); // → THINKING
      sm.processLine("Here is line 1.");
      sm.processLine("Here is line 2.");
      sm.processLine("Here is line 3.");
      const outputs = emitted.filter(e => e.classification === Classification.Output);
      expect(outputs).toHaveLength(3);
    });

    it("transitions back to IDLE on prompt", () => {
      const { sm } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…"); // → THINKING
      sm.processLine("My response."); // → RESPONDING
      sm.processLine(">"); // → IDLE
      expect(sm.state).toBe(ClaudeState.IDLE);
    });

    it("transitions to THINKING on spinner (multi-step)", () => {
      const { sm } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…"); // → THINKING
      sm.processLine("Step 1 done."); // → RESPONDING
      sm.processLine("Seasoning…"); // → THINKING (next step)
      expect(sm.state).toBe(ClaudeState.THINKING);
    });

    it("classifies error lines as ERROR", () => {
      const { sm, emitted } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…"); // → THINKING
      sm.processLine("Error: ENOENT: no such file"); // → RESPONDING
      const errors = emitted.filter(e => e.classification === Classification.Error);
      expect(errors).toHaveLength(1);
    });

    it("classifies conversational questions as OUTPUT (not DECISION)", () => {
      const { sm, emitted } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…"); // → THINKING
      sm.processLine("Which approach would you prefer?");
      const outputs = emitted.filter(e => e.classification === Classification.Output);
      expect(outputs).toHaveLength(1);
      // Should NOT be Decision — it's a conversational question, not a tool permission
      const decisions = emitted.filter(e => e.classification === Classification.Decision);
      expect(decisions).toHaveLength(0);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/agent && npx vitest run src/__tests__/state-machine.test.ts`
Expected: FAIL — `state-machine.ts` does not exist

**Step 3: Write the state machine implementation**

Create `packages/agent/src/state-machine.ts`:

```typescript
import { EventEmitter } from "events";
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

  // ─── State handlers ──────────────────────────────────────────────

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
    // Send one "Thinking..." status per thinking phase
    if (!this.thinkingNotified) {
      this.thinkingNotified = true;
      this.emit("Thinking...", Classification.Status);
    }
    if (isPrompt(text)) {
      this.transition(ClaudeState.IDLE);
      return;
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
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/agent && npx vitest run src/__tests__/state-machine.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/agent/src/state-machine.ts packages/agent/src/__tests__/state-machine.test.ts
git commit -m "feat: add ClaudeStateMachine with core state tracking and tests"
```

---

### Task 2: Add TOOL_USE state with auto-approve and decision escalation

**Files:**
- Modify: `packages/agent/src/state-machine.ts` (handleToolUse method, add tool detection)
- Modify: `packages/agent/src/__tests__/state-machine.test.ts` (add tool tests)

**Step 1: Write the failing tests**

Add to `packages/agent/src/__tests__/state-machine.test.ts`:

```typescript
  describe("TOOL_USE state", () => {
    it("detects tool permission and auto-approves safe tools", () => {
      const { sm, emitted, writes } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…"); // → THINKING
      sm.processLine("Read src/app.ts"); // → TOOL_USE
      sm.processLine("Allow Read tool?");
      // Should auto-approve by writing to PTY
      expect(writes).toContain("y\r");
      // Should emit status
      const statuses = emitted.filter(e => e.classification === Classification.Status);
      expect(statuses.some(s => s.text.includes("Reading"))).toBe(true);
    });

    it("escalates risky tools as DECISION", () => {
      const { sm, emitted, writes } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…"); // → THINKING
      sm.processLine("Bash npm install express");
      sm.processLine("Allow Bash tool?");
      // Should NOT auto-approve
      expect(writes.filter(w => w === "y\r")).toHaveLength(0);
      // Should emit decision
      const decisions = emitted.filter(e => e.classification === Classification.Decision);
      expect(decisions).toHaveLength(1);
      expect(decisions[0].text).toContain("Bash");
      expect(decisions[0].text).toContain("npm install express");
    });

    it("auto-approves Edit tool (safe by default)", () => {
      const { sm, writes } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…"); // → THINKING
      sm.processLine("Edit src/app.ts");
      sm.processLine("Allow Edit tool?");
      expect(writes).toContain("y\r");
    });

    it("transitions to THINKING after auto-approve", () => {
      const { sm } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…"); // → THINKING
      sm.processLine("Read src/app.ts");
      sm.processLine("Allow Read tool?"); // auto-approve → THINKING
      expect(sm.state).toBe(ClaudeState.THINKING);
    });
  });
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/agent && npx vitest run src/__tests__/state-machine.test.ts`
Expected: FAIL — tool detection not implemented yet

**Step 3: Add tool detection and auto-approve to state machine**

Add these constants and update `handleToolUse` and `handleThinking` in `packages/agent/src/state-machine.ts`:

```typescript
// Add near the top, after imports:

const SAFE_TOOLS = new Set(["Read", "Glob", "Grep", "WebFetch", "WebSearch", "Task"]);
// Edit and Write are auto-approved — Claude Code's edit acceptance is a separate UX
// Bash is risky — it runs arbitrary shell commands
const RISKY_TOOLS = new Set(["Bash"]);
// All known tools — for detecting tool-use lines
const ALL_TOOLS = new Set([...SAFE_TOOLS, ...RISKY_TOOLS, "Edit", "Write", "NotebookEdit"]);

const TOOL_LINE_RE = /^(Read|Edit|Write|Bash|Glob|Grep|WebFetch|WebSearch|NotebookEdit|Task)\b/;
const PERMISSION_RE = /^Allow\b.*\btool\b/i;

// Add a tool context tracker:
private pendingTool: { name: string; description: string } | null = null;
```

Update `handleThinking`:
```typescript
  private handleThinking(text: string): void {
    if (!this.thinkingNotified) {
      this.thinkingNotified = true;
      this.emit("Thinking...", Classification.Status);
    }
    if (isPrompt(text)) {
      this.transition(ClaudeState.IDLE);
      return;
    }
    // Check for tool use entry
    const toolMatch = text.match(TOOL_LINE_RE);
    if (toolMatch) {
      this.pendingTool = { name: toolMatch[1], description: text };
      this.transition(ClaudeState.TOOL_USE);
      return;
    }
    if (looksLikeContent(text)) {
      this.transition(ClaudeState.RESPONDING);
      this.emit(text, classifyContent(text));
      return;
    }
  }
```

Update `handleToolUse`:
```typescript
  private handleToolUse(text: string): void {
    if (isPrompt(text)) {
      this.pendingTool = null;
      this.transition(ClaudeState.IDLE);
      return;
    }
    // Check for permission prompt
    if (PERMISSION_RE.test(text) && this.pendingTool) {
      const toolName = this.pendingTool.name;
      if (RISKY_TOOLS.has(toolName)) {
        // Escalate to WhatsApp
        this.emit(
          `Allow ${toolName} tool?\n\n${this.pendingTool.description}\n\n👍 = Allow  |  👎 = Deny\nOr reply: y / n`,
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
    // Collect more tool context
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
      this.transition(ClaudeState.RESPONDING);
      this.emit(text, classifyContent(text));
    }
  }
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/agent && npx vitest run src/__tests__/state-machine.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/agent/src/state-machine.ts packages/agent/src/__tests__/state-machine.test.ts
git commit -m "feat: add tool auto-approve and risky tool escalation to state machine"
```

---

### Task 3: Wire state machine into PtyWrapper (replace isNoise + classify)

**Files:**
- Modify: `packages/agent/src/pty-wrapper.ts:1-53` (replace LineBuffer callback with state machine)
- Modify: `packages/agent/src/__tests__/pty-wrapper.test.ts` (update if needed)

**Step 1: Update PtyWrapper to use ClaudeStateMachine**

Replace the existing `LineBuffer` callback in `packages/agent/src/pty-wrapper.ts`:

```typescript
import { EventEmitter } from "events";
import * as pty from "node-pty";
import { LineBuffer } from "./line-buffer";
import { ClaudeStateMachine, type ClassifiedLine } from "./state-machine";

// Re-export ClassifiedLine so existing imports from pty-wrapper still work
export type { ClassifiedLine } from "./state-machine";

export interface PtyOptions {
  command: string;
  args?: string[];
  cwd: string;
  env?: Record<string, string>;
  autoRestart?: boolean;
}

export class PtyWrapper extends EventEmitter {
  private process!: pty.IPty;
  private lineBuffer: LineBuffer;
  private stateMachine: ClaudeStateMachine;
  private restartCount = 0;
  private static readonly MAX_RESTARTS = 5;

  constructor(opts: PtyOptions) {
    super();

    this.stateMachine = new ClaudeStateMachine(
      (line) => this.emit("classified", line),
      (text) => this.process.write(text),
    );

    this.lineBuffer = new LineBuffer((line) => {
      this.stateMachine.processLine(line);
    });

    this.spawn(opts);
  }

  // ... spawn, respawn, write, kill, pid, resize methods remain UNCHANGED
```

Key changes:
- Remove imports of `classify`, `isNoise` from `./classifier`
- Remove `rawBuffer` (state machine doesn't need it; raw data still flows via `emit("raw")`)
- Create `ClaudeStateMachine` in constructor with two callbacks:
  - `onClassified` → emits `"classified"` event (same as before)
  - `writeToPty` → writes to `this.process` (for auto-approve)
- LineBuffer callback just calls `stateMachine.processLine(line)`
- On PTY restart (`respawn`), call `this.stateMachine.reset()`

**Step 2: Update respawn to reset state machine**

In the `respawn` method:
```typescript
  private respawn(opts: PtyOptions): void {
    this.stateMachine.reset();
    this.spawn(opts);
    this.emit("restarted");
  }
```

**Step 3: Verify existing tests still pass**

Run: `cd packages/agent && npx vitest run`
Expected: ALL existing tests still pass (classifier tests, line-buffer tests, etc.)

**Step 4: Build the project**

Run: `cd /c/Users/drcra/Documents/Coding\ Projects/WhatsApp-Claude-Code-Live-Bridge && npm run build`
Expected: Clean build with no errors

**Step 5: Commit**

```bash
git add packages/agent/src/pty-wrapper.ts
git commit -m "feat: wire ClaudeStateMachine into PtyWrapper, replacing isNoise+classify"
```

---

### Task 4: Add reaction support to bridge for decision responses

**Files:**
- Modify: `packages/bridge/src/baileys.ts:112-220` (add reaction listener)
- Modify: `packages/bridge/src/index.ts:57-109` (track decision messages, handle reactions)

**Step 1: Add reaction event listener to baileys.ts**

In `packages/bridge/src/baileys.ts`, inside the `connect()` method, after the `messages.upsert` handler (after line 220), add:

```typescript
    // Listen for message reactions (👍/👎 for decision approval)
    sock.ev.on("messages.reaction", (reactions) => {
      for (const { key, reaction } of reactions) {
        if (!reaction?.text) continue;
        // Only process reactions from allowed numbers
        const reactorJid = reaction.key?.participant ?? reaction.key?.remoteJid ?? "";
        let phoneNumber: string;
        if (reactorJid.endsWith("@s.whatsapp.net")) {
          phoneNumber = "+" + reactorJid.replace(/@s\.whatsapp\.net$/, "");
        } else if (reactorJid.endsWith("@lid")) {
          phoneNumber = "+" + (sock.user?.id?.replace(/:.*$/, "") ?? "");
        } else {
          continue;
        }
        if (!this.auth.isAllowed(phoneNumber)) continue;

        this.emit("reaction", {
          messageId: key.id,
          emoji: reaction.text,
          sender: phoneNumber,
        });
      }
    });
```

**Step 2: Track decision message IDs in bridge/index.ts**

In `packages/bridge/src/index.ts`, add decision tracking state near the top of `main()` (after `let sessionCount = 1;`):

```typescript
  // Track the last decision message ID for reaction-based approval
  let lastDecisionMessageId: string | null = null;
```

**Step 3: Store message ID when sending decisions**

In the bridge's message handler, when sending a DECISION classification, capture the message ID. Modify the send loop:

```typescript
        // Send to all allowed numbers (single-user)
        for (const num of config.whatsapp.allowedNumbers) {
          try {
            const msgId = await waClient.sendToNumber(num, formatted);
            // Track decision messages for reaction-based approval
            if (classification === Classification.Decision) {
              lastDecisionMessageId = msgId ?? null;
            }
          } catch (err) {
            console.error(`[bridge] Failed to send to ${num}:`, err);
          }
        }
```

This requires `sendToNumber` to return the message ID. Update `sendToNumber` in `baileys.ts`:

```typescript
  async sendToNumber(phoneNumber: string, text: string): Promise<string | undefined> {
    const jid = phoneNumber.replace("+", "") + "@s.whatsapp.net";
    console.log(`[baileys] Sending DM to: ${jid}`);
    return await this.sendMessage(jid, text);
  }
```

And update `sendMessage` to return the message ID:

```typescript
  async sendMessage(jid: string, text: string): Promise<string | undefined> {
    if (!this.sock) return undefined;
    return new Promise((resolve, reject) => {
      this.sendQueue.push({
        jid, text,
        resolve: (msgId?: string) => resolve(msgId),
        reject,
      });
      this.processSendQueue();
    });
  }
```

Update the send queue item type and `processSendQueue` resolve call:

```typescript
  private sendQueue: Array<{ jid: string; text: string; resolve: (msgId?: string) => void; reject: (err: any) => void }> = [];
```

And in `processSendQueue`, pass the message ID to resolve:

```typescript
          sent = true;
          item.resolve(result?.key?.id);
          break;
```

**Step 4: Handle reaction events in bridge/index.ts**

After the `waClient.on("blocked", ...)` handler, add:

```typescript
  waClient.on("reaction", ({ messageId, emoji, sender }) => {
    console.log(`[bridge] Reaction: ${emoji} on ${messageId} from ${sender}`);
    // Only handle reactions on the last decision message
    if (messageId === lastDecisionMessageId) {
      lastDecisionMessageId = null;
      const approved = emoji === "👍" || emoji === "👍🏻" || emoji === "👍🏼" ||
        emoji === "👍🏽" || emoji === "👍🏾" || emoji === "👍🏿";
      const denied = emoji === "👎" || emoji === "👎🏻" || emoji === "👎🏼" ||
        emoji === "👎🏽" || emoji === "👎🏾" || emoji === "👎🏿";
      if (approved || denied) {
        const reply = approved ? "y" : "n";
        if (agentWs?.readyState === WebSocket.OPEN) {
          agentWs.send(JSON.stringify(createEnvelope({
            type: MessageType.Command,
            source: Source.WhatsApp,
            sessionId: "",
            payload: { text: reply, intent: "decision_reply", sender },
          })));
        }
        console.log(`[bridge] Decision ${approved ? "APPROVED" : "DENIED"} via reaction`);
      }
    }
  });
```

**Step 5: Build and verify**

Run: `cd /c/Users/drcra/Documents/Coding\ Projects/WhatsApp-Claude-Code-Live-Bridge && npm run build`
Expected: Clean build

**Step 6: Commit**

```bash
git add packages/bridge/src/baileys.ts packages/bridge/src/index.ts
git commit -m "feat: add reaction-based decision approval (👍/👎) to bridge"
```

---

### Task 5: Update formatter for new status formats

**Files:**
- Modify: `packages/bridge/src/formatter.ts:22-51` (update Status and Decision formatting)
- Create: `packages/bridge/src/__tests__/formatter.test.ts`

**Step 1: Write the failing test**

Create `packages/bridge/src/__tests__/formatter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatForWhatsApp } from "../formatter";
import { Classification } from "@live-bridge/shared";

describe("formatForWhatsApp", () => {
  it("formats thinking status with emoji", () => {
    const result = formatForWhatsApp({
      classification: Classification.Status,
      text: "Thinking...",
      sessionName: "default",
      multiSession: false,
    });
    expect(result).toBe("🤔 Thinking...");
  });

  it("formats tool status with tool emoji", () => {
    const result = formatForWhatsApp({
      classification: Classification.Status,
      text: "Reading: src/app.ts",
      sessionName: "default",
      multiSession: false,
    });
    expect(result).toContain("📖");
    expect(result).toContain("src/app.ts");
  });

  it("formats decision with reaction instructions", () => {
    const result = formatForWhatsApp({
      classification: Classification.Decision,
      text: "Allow Bash tool?\n\nnpm install express\n\n👍 = Allow  |  👎 = Deny\nOr reply: y / n",
      sessionName: "default",
      multiSession: false,
    });
    expect(result).toContain("⚠️");
    expect(result).toContain("Bash");
    expect(result).toContain("👍");
  });

  it("formats output without prefix", () => {
    const result = formatForWhatsApp({
      classification: Classification.Output,
      text: "Here is the response.",
      sessionName: "default",
      multiSession: false,
    });
    expect(result).toBe("Here is the response.");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/bridge && npx vitest run src/__tests__/formatter.test.ts`
Expected: Some may pass, some may fail (status formatting needs update)

**Step 3: Update formatter**

In `packages/bridge/src/formatter.ts`, update the Status case to use context-aware emojis:

```typescript
    case Classification.Status: {
      // Use context-specific emoji based on status text
      let emoji = "📡";
      const t = input.text;
      if (/^Thinking/i.test(t)) emoji = "🤔";
      else if (/^Reading/i.test(t)) emoji = "📖";
      else if (/^Editing/i.test(t)) emoji = "✏️";
      else if (/^Writing/i.test(t)) emoji = "📝";
      else if (/^Searching/i.test(t)) emoji = "🔍";
      else if (/^Running/i.test(t) || /^Using/i.test(t)) emoji = "⚡";
      lines.push(`${emoji} ${input.text}`);
      break;
    }
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/bridge && npx vitest run src/__tests__/formatter.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/bridge/src/formatter.ts packages/bridge/src/__tests__/formatter.test.ts
git commit -m "feat: context-aware status emojis and formatter tests"
```

---

### Task 6: Update agent index.ts to handle decision replies via PTY

**Files:**
- Modify: `packages/agent/src/index.ts:274-322` (handle decision_reply intent by writing to PTY)

**Step 1: Update the command handler**

In `packages/agent/src/index.ts`, add handling for `decision_reply` intent before the regular PTY command section (before line 274 `// --- Regular command → PTY ---`):

```typescript
    // --- Decision reply → write y/n directly to PTY ---
    if (intent === "decision_reply") {
      const session = sessionManager.resolve(sessionId) ?? sessionManager.getActive();
      if (session) {
        const pty = ptySessions.get(session.id);
        if (pty) {
          // Map text: "y", "yes", "accept", "1" → "y\r"; "n", "no", "reject", "2" → "n\r"
          const t = (payload.text as string).trim().toLowerCase();
          const approved = t === "y" || t === "yes" || t === "accept" || t === "1";
          const denied = t === "n" || t === "no" || t === "reject" || t === "2";
          if (approved || denied) {
            pty.write(approved ? "y\r" : "n\r");
            console.log(`[agent] Decision ${approved ? "APPROVED" : "DENIED"} for "${session.name}"`);
          }
        }
      }
      return;
    }
```

**Step 2: Build and verify**

Run: `cd /c/Users/drcra/Documents/Coding\ Projects/WhatsApp-Claude-Code-Live-Bridge && npm run build`
Expected: Clean build

**Step 3: Commit**

```bash
git add packages/agent/src/index.ts
git commit -m "feat: handle decision_reply intent — write y/n to PTY for tool approval"
```

---

### Task 7: Integration test and cleanup

**Files:**
- Modify: `packages/agent/src/classifier.ts` (keep `classify` export for backward compat, remove `isNoise` if no longer imported elsewhere)
- Run: full test suite

**Step 1: Check for remaining imports of isNoise**

Search for `isNoise` across the codebase. It was previously imported by `pty-wrapper.ts` — after Task 3 that import is removed. If no other files import it, it can stay as an unexported helper or be removed.

**Step 2: Check for remaining imports of classify from classifier**

The `classify` function may still be used in tests. Keep it exported for backward compatibility. The state machine uses its own `classifyContent` internally.

**Step 3: Run full test suite**

Run: `cd /c/Users/drcra/Documents/Coding\ Projects/WhatsApp-Claude-Code-Live-Bridge && npm run build && cd packages/agent && npx vitest run && cd ../bridge && npx vitest run && cd ../shared && npx vitest run`
Expected: ALL tests pass across all packages

**Step 4: Manual smoke test**

1. Restart services: `curl -s -X POST http://localhost:3000/api/services/agent/restart && curl -s -X POST http://localhost:3000/api/services/bridge/restart`
2. Send a test message from WhatsApp
3. Verify: Only clean response reaches WhatsApp (no spinner noise)
4. Verify: "🤔 Thinking..." status sent during processing
5. Verify: Dashboard terminal still shows raw PTY output (unchanged)

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: cleanup classifier exports and verify integration"
```

---

## Verification Checklist

After all tasks are complete:

- [ ] State machine tests pass (`packages/agent/src/__tests__/state-machine.test.ts`)
- [ ] Formatter tests pass (`packages/bridge/src/__tests__/formatter.test.ts`)
- [ ] All existing tests still pass (classifier, line-buffer, protocol, etc.)
- [ ] Clean build across all packages
- [ ] WhatsApp receives clean responses (no spinner noise)
- [ ] WhatsApp receives "🤔 Thinking..." status during processing
- [ ] Dashboard terminal still works (raw PTY output unaffected)
- [ ] Reaction-based approval (👍/👎) sends y/n to PTY
- [ ] Text-based approval ("y"/"n") sends y/n to PTY
- [ ] Safe tools auto-approved with status notification
- [ ] Risky tools (Bash) escalated as DECISION to WhatsApp
