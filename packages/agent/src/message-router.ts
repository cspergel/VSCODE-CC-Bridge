import { Classification, MessageType, Source, createEnvelope } from "@live-bridge/shared";
import { AgentWSServer } from "./ws-server";
import { ClassifiedLine } from "./pty-wrapper";
import { Database } from "./db";

export class MessageRouter {
  private statusBuffer = new Map<string, string[]>();
  private statusTimers = new Map<string, ReturnType<typeof setInterval>>();
  private outputBuffer = new Map<string, { lines: string[]; sessionName: string; timer: ReturnType<typeof setTimeout> }>();
  private batchIntervalMs: number;
  private outputDebounceMs: number;
  private db: Database | null = null;

  constructor(
    private wsServer: AgentWSServer,
    opts: { statusBatchIntervalMs?: number; outputDebounceMs?: number } = {}
  ) {
    this.batchIntervalMs = opts.statusBatchIntervalMs ?? 10_000;
    this.outputDebounceMs = opts.outputDebounceMs ?? 2_000;
  }

  setDatabase(db: Database): void {
    this.db = db;
  }

  route(sessionId: string, sessionName: string, line: ClassifiedLine): void {
    console.log(`[router] ${line.classification}: ${line.text.slice(0, 100)}`);

    // Persist to database
    this.db?.insertMessage({
      sessionId,
      source: Source.ClaudeCode,
      classification: line.classification,
      rawContent: line.raw ?? line.text,
      formattedContent: line.text,
    });

    // Route to bridge based on classification
    switch (line.classification) {
      case Classification.Status:
        this.bufferStatus(sessionId, sessionName, line.text);
        break;
      case Classification.Decision:
        // Decisions are urgent — send immediately (flush any pending output first)
        this.flushOutput(sessionId);
        this.wsServer.sendToBridge(createEnvelope({
          type: MessageType.Decision,
          source: Source.ClaudeCode,
          sessionId,
          payload: { text: line.text, sessionName },
        }));
        break;
      case Classification.Error:
        // Errors are urgent — send immediately
        this.flushOutput(sessionId);
        this.wsServer.sendToBridge(createEnvelope({
          type: MessageType.Error,
          source: Source.ClaudeCode,
          sessionId,
          payload: { text: line.text, sessionName },
        }));
        break;
      case Classification.Output:
      default:
        this.bufferOutput(sessionId, sessionName, line.text);
        break;
    }
  }

  private bufferOutput(sessionId: string, sessionName: string, text: string): void {
    const existing = this.outputBuffer.get(sessionId);
    if (existing) {
      existing.lines.push(text);
      // Reset debounce timer
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => this.flushOutput(sessionId), this.outputDebounceMs);
    } else {
      const timer = setTimeout(() => this.flushOutput(sessionId), this.outputDebounceMs);
      this.outputBuffer.set(sessionId, { lines: [text], sessionName, timer });
    }
  }

  private flushOutput(sessionId: string): void {
    const buf = this.outputBuffer.get(sessionId);
    if (!buf || buf.lines.length === 0) return;

    clearTimeout(buf.timer);
    const digest = buf.lines.join("\n");
    this.outputBuffer.delete(sessionId);
    console.log(`[router] FLUSH output (${buf.lines.length} lines): ${digest.slice(0, 120)}`);

    this.wsServer.sendToBridge(createEnvelope({
      type: MessageType.Response,
      source: Source.ClaudeCode,
      sessionId,
      payload: { text: digest, sessionName: buf.sessionName },
    }));
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
    // Flush any pending output before shutdown
    for (const sessionId of this.outputBuffer.keys()) this.flushOutput(sessionId);
  }
}
