import { EventEmitter } from "events";
import * as pty from "node-pty";
import { LineBuffer } from "./line-buffer";
import { ClaudeStateMachine } from "./state-machine";

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

  private spawn(opts: PtyOptions): void {
    this.process = pty.spawn(opts.command, opts.args ?? [], {
      name: "xterm-256color",
      cwd: opts.cwd,
      env: (() => {
        // Strip env vars that cause issues:
        // - CLAUDECODE: prevents nested session error
        // - EDITOR/VISUAL: prevents Claude Code from launching VS Code
        // - TERM_PROGRAM/VSCODE_*: prevents Claude Code from detecting VS Code
        const clean: Record<string, string> = {};
        for (const [k, v] of Object.entries(process.env)) {
          if (v === undefined) continue;
          if (k === "CLAUDECODE") continue;
          if (k === "EDITOR" || k === "VISUAL") continue;
          if (k === "TERM_PROGRAM" && v.toLowerCase().includes("vscode")) continue;
          if (k.startsWith("VSCODE_")) continue;
          clean[k] = v;
        }
        return { ...clean, TERM_PROGRAM: "xterm-256color", ...opts.env };
      })() as Record<string, string>,
      cols: 120,
      rows: 40,
    });

    this.process.onData((data: string) => {
      this.lineBuffer.push(data);
      this.emit("raw", data);
    });

    this.process.onExit(({ exitCode }) => {
      this.lineBuffer.flush();
      this.emit("exit", exitCode);

      // Auto-restart on non-zero exit (with limit)
      if (opts.autoRestart && exitCode !== 0 && this.restartCount < PtyWrapper.MAX_RESTARTS) {
        this.restartCount++;
        console.log(`[pty] Restart ${this.restartCount}/${PtyWrapper.MAX_RESTARTS} in 2s...`);
        setTimeout(() => this.respawn(opts), 2000);
      }
    });
  }

  private respawn(opts: PtyOptions): void {
    this.stateMachine.reset();
    this.spawn(opts);
    this.emit("restarted");
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
