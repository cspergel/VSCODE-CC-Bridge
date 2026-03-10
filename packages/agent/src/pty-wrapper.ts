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
  autoRestart?: boolean;
}

export interface ClassifiedLine {
  text: string;
  classification: Classification;
  timestamp: string;
  raw: string;
}

export class PtyWrapper extends EventEmitter {
  private process!: pty.IPty;
  private lineBuffer: LineBuffer;
  private rawBuffer: string[] = [];
  private restartCount = 0;
  private static readonly MAX_RESTARTS = 5;

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

    this.spawn(opts);
  }

  private spawn(opts: PtyOptions): void {
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

      // Auto-restart on non-zero exit (with limit)
      if (opts.autoRestart && exitCode !== 0 && this.restartCount < PtyWrapper.MAX_RESTARTS) {
        this.restartCount++;
        console.log(`[pty] Restart ${this.restartCount}/${PtyWrapper.MAX_RESTARTS} in 2s...`);
        setTimeout(() => this.respawn(opts), 2000);
      }
    });
  }

  private respawn(opts: PtyOptions): void {
    this.rawBuffer = [];
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
