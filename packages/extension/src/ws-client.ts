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
