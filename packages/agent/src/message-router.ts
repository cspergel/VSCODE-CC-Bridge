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
