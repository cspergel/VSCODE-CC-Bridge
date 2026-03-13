import { EventEmitter } from "events";
import { spawn, ChildProcess } from "child_process";
import { Classification } from "@live-bridge/shared";

export interface ClassifiedLine {
  text: string;
  classification: Classification;
  timestamp: string;
  raw: string;
}

/**
 * Spawns `claude -p --output-format stream-json` as a child process.
 * Parses the JSONL stream and emits ClassifiedLine events compatible with MessageRouter.
 */
export class ClaudeProcess extends EventEmitter {
  private proc: ChildProcess | null = null;
  private accumulatedText = "";
  private sessionId: string | null = null;
  private partial = ""; // partial line buffer for stdout

  constructor(
    private projectPath: string,
    private resumeSessionId?: string,
  ) {
    super();
  }

  /** Send a prompt to Claude and stream the response */
  run(prompt: string): void {
    const args = [
      "-p",
      "--output-format", "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
    ];

    if (this.resumeSessionId) {
      args.push("--resume", this.resumeSessionId);
    }

    // Pass prompt via stdin to avoid shell escaping issues on Windows
    // (shell: true + args with special chars causes cmd.exe to misinterpret)

    // Strip CLAUDECODE env to avoid nested-session error
    const { CLAUDECODE, ...cleanEnv } = process.env;

    this.proc = spawn("claude", args, {
      cwd: this.projectPath,
      env: cleanEnv as Record<string, string>,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Write prompt to stdin and close it
    this.proc.stdin?.write(prompt);
    this.proc.stdin?.end();

    this.accumulatedText = "";
    this.partial = "";

    // Emit the prompt as terminal output so the dashboard shows the conversation
    this.emit("raw", `\r\n\x1b[36m> ${prompt}\x1b[0m\r\n\r\n`);

    this.proc.stdout?.on("data", (chunk: Buffer) => {
      this.handleStdout(chunk.toString());
    });

    let stderrBuf = "";
    this.proc.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    this.proc.on("close", (code) => {
      // Log and emit any stderr as error
      const stderrText = stderrBuf.trim();
      if (stderrText) {
        console.log(`[claude-proc] stderr: ${stderrText.slice(0, 500)}`);
        if (code !== 0) {
          this.emitClassified(`Claude error: ${stderrText.slice(0, 300)}`, Classification.Error);
        }
      }
      // Flush any remaining partial line
      if (this.partial.trim()) {
        this.parseLine(this.partial);
        this.partial = "";
      }
      // Emit accumulated text as final output if we have any
      if (this.accumulatedText.trim()) {
        this.emitClassified(this.accumulatedText.trim(), Classification.Output);
        this.accumulatedText = "";
      }
      this.emit("exit", code);
    });

    this.proc.on("error", (err) => {
      this.emitClassified(`Process error: ${err.message}`, Classification.Error);
      this.emit("exit", 1);
    });
  }

  /** Kill the running process */
  kill(): void {
    if (this.proc && !this.proc.killed) {
      this.proc.kill("SIGTERM");
    }
  }

  get pid(): number | undefined {
    return this.proc?.pid;
  }

  /** Get the session ID from the result (for resume) */
  getSessionId(): string | null {
    return this.sessionId;
  }

  private handleStdout(data: string): void {
    this.partial += data;
    const lines = this.partial.split("\n");
    // Keep the last element (may be incomplete)
    this.partial = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) this.parseLine(line.trim());
    }
  }

  private parseLine(line: string): void {
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      // Not JSON — might be plain text output
      console.log(`[claude-proc] non-JSON: ${line.slice(0, 100)}`);
      return;
    }

    const type = event.type;

    // --- content_block_start: detect tool usage ---
    if (type === "content_block_start") {
      const block = event.content_block;
      if (block?.type === "tool_use") {
        const toolName = block.name ?? "tool";
        const statusVerb =
          toolName === "Read" ? "Reading" :
          toolName === "Edit" ? "Editing" :
          toolName === "Write" ? "Writing" :
          toolName === "Glob" ? "Searching files" :
          toolName === "Grep" ? "Searching content" :
          toolName === "Bash" ? "Running command" :
          toolName === "WebFetch" ? "Fetching URL" :
          toolName === "WebSearch" ? "Searching web" :
          `Using ${toolName}`;
        this.emitClassified(`${statusVerb}...`, Classification.Status);
        this.emit("raw", `\r\n\x1b[33m${statusVerb}...\x1b[0m\r\n`);
      }
      return;
    }

    // --- content_block_delta: accumulate text ---
    if (type === "content_block_delta") {
      const delta = event.delta;
      if (delta?.type === "text_delta" && delta.text) {
        this.accumulatedText += delta.text;
        // Stream text to dashboard terminal in real-time
        this.emit("raw", delta.text.replace(/\n/g, "\r\n"));
      }
      return;
    }

    // --- result: final output with session ID ---
    if (type === "result") {
      if (event.session_id) {
        this.sessionId = event.session_id;
      }
      // The result object may contain the final text in event.result
      // But we already accumulated it from content_block_delta events
      // If we somehow missed it, use the result text
      if (!this.accumulatedText.trim() && event.result) {
        this.accumulatedText = event.result;
      }
      // Flush accumulated text
      if (this.accumulatedText.trim()) {
        this.emitClassified(this.accumulatedText.trim(), Classification.Output);
        this.accumulatedText = "";
      }
      return;
    }

    // --- message_start: emit thinking status ---
    if (type === "message_start") {
      this.emitClassified("Thinking...", Classification.Status);
      return;
    }

    // Ignore other event types (content_block_stop, message_delta, message_stop, etc.)
  }

  private emitClassified(text: string, classification: Classification): void {
    const line: ClassifiedLine = {
      text,
      classification,
      timestamp: new Date().toISOString(),
      raw: text,
    };
    this.emit("classified", line);
  }
}
