import { WebSocketServer, WebSocket } from "ws";
import { EventEmitter } from "events";
import { Envelope, createEnvelope, MessageType, Source } from "@live-bridge/shared";

export class AgentWSServer extends EventEmitter {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();

  constructor(port: number) {
    super();

    this.wss = new WebSocketServer({ port });

    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      ws.on("message", (data) => this.handleMessage(ws, data.toString()));
      const heartbeat = setInterval(() => ws.ping(), 30_000);
      ws.on("close", () => {
        clearInterval(heartbeat);
        this.clients.delete(ws);
      });
      this.emit("bridge_connected");
    });
  }

  private handleMessage(ws: WebSocket, raw: string): void {
    try {
      const envelope: Envelope = JSON.parse(raw);
      this.emit("envelope", envelope);
    } catch {
      // Ignore malformed messages
    }
  }

  sendToBridge(envelope: Envelope): void {
    const json = JSON.stringify(envelope);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json);
      }
    }
  }

  close(): void {
    this.wss.close();
  }
}
