import express from "express";
import { createServer } from "http";
import { resolve } from "path";
import { Database } from "@live-bridge/agent/db";
import { ProcessManager } from "./process-manager";
import { LogBroadcaster } from "./log-broadcaster";
import { createApiRouter } from "./api";

const PORT = parseInt(process.env.DASHBOARD_PORT ?? "3000", 10);

async function main() {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const dbPath = resolve(home, ".claude-bridge", "bridge.db");

  const db = new Database(dbPath);
  const pm = new ProcessManager();

  const app = express();
  const server = createServer(app);

  const broadcaster = new LogBroadcaster(server);

  // Wire ProcessManager events to LogBroadcaster
  pm.on("log", (line) => broadcaster.pushLog(line));
  pm.on("status", (status) => broadcaster.pushStatus(status));

  // Wire IPC session updates to browser
  pm.on("agent_ipc", (msg: any) => {
    if (msg.type === "sessions_list" && msg.sessions) {
      broadcaster.pushSessionsUpdate(msg.sessions);
    }
  });

  // Wire IPC terminal relay: agent PTY ↔ browser xterm.js
  pm.on("pty_data", ({ sessionId, data }: { sessionId: string; data: string }) => {
    broadcaster.pushTerminalData(sessionId, data);
  });
  broadcaster.on("terminal_input", ({ sessionId, data }: { sessionId: string; data: string }) => {
    pm.sendToAgent({ type: "pty_input", sessionId, data });
  });
  broadcaster.on("terminal_resize", ({ sessionId, cols, rows }: { sessionId: string; cols: number; rows: number }) => {
    pm.sendToAgent({ type: "pty_resize", sessionId, cols, rows });
  });

  // API routes
  app.use("/api", createApiRouter(pm, db));

  // Static files
  app.use(express.static(resolve(__dirname, "..", "public")));

  // Start HTTP server
  server.listen(PORT, () => {
    console.log(`[dashboard] http://localhost:${PORT}`);
  });

  // Auto-start services: agent first, then bridge after 2s
  console.log("[dashboard] Starting agent...");
  pm.start("agent");

  setTimeout(() => {
    console.log("[dashboard] Starting bridge...");
    pm.start("bridge");
  }, 2000);

  // Graceful shutdown
  let shuttingDown = false;
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\n[dashboard] Shutting down...");
    await pm.shutdownAll();
    broadcaster.close();
    db.close();
    server.close();
    process.exit(0);
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[dashboard] Fatal:", err);
  process.exit(1);
});
