import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { Server } from "http";
import { EventEmitter } from "events";
import { LogLine } from "./process-manager";

interface WSMessage {
  type: "log" | "status" | "history" | "terminal_data" | "sessions_update";
  data: unknown;
}

export class LogBroadcaster extends EventEmitter {
  private wss: WebSocketServer;
  private buffer: LogLine[] = [];
  private readonly maxBuffer = 500;

  constructor(server: Server) {
    super();
    this.wss = new WebSocketServer({ server, path: "/ws" });

    this.wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
      // Send buffered history to new connections
      this.send(ws, { type: "history", data: this.buffer });

      // Handle incoming messages from browser (terminal input, resize)
      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "terminal_input") {
            this.emit("terminal_input", { sessionId: msg.sessionId, data: msg.data });
          } else if (msg.type === "terminal_resize") {
            this.emit("terminal_resize", { sessionId: msg.sessionId, cols: msg.cols, rows: msg.rows });
          }
        } catch { /* ignore non-JSON */ }
      });
    });
  }

  pushLog(line: LogLine): void {
    this.buffer.push(line);
    if (this.buffer.length > this.maxBuffer) {
      this.buffer.shift();
    }
    this.broadcast({ type: "log", data: line });
  }

  pushStatus(status: unknown): void {
    this.broadcast({ type: "status", data: status });
  }

  pushTerminalData(sessionId: string, data: string): void {
    this.broadcast({ type: "terminal_data", data: { sessionId, data } });
  }

  pushSessionsUpdate(sessions: unknown[]): void {
    this.broadcast({ type: "sessions_update", data: { sessions } });
  }

  private broadcast(msg: WSMessage): void {
    const json = JSON.stringify(msg);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    }
  }

  private send(ws: WebSocket, msg: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  close(): void {
    this.wss.close();
  }
}
