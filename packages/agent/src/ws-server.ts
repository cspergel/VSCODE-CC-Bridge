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
