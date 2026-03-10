import { readFileSync } from "fs";
import { resolve } from "path";
import { load } from "js-yaml";
import { SessionManager } from "./session-manager";
import { PtyWrapper } from "./pty-wrapper";
import { MessageRouter } from "./message-router";
import { AgentWSServer } from "./ws-server";
import { collectGitContext, formatContextHeader } from "./git-context";
import { MessageType, Source, createEnvelope, DEFAULTS } from "@live-bridge/shared";

interface Config {
  server: { port: number; host: string; vscodePort: number };
  classifier: { statusBatchInterval: number };
  gitContext: { mode: "auto" | "on-demand" };
}

function loadConfig(path: string): Config {
  try {
    const raw = readFileSync(path, "utf-8");
    return load(raw) as Config;
  } catch {
    return {
      server: { port: DEFAULTS.WS_PORT_BRIDGE, host: "127.0.0.1", vscodePort: DEFAULTS.WS_PORT_VSCODE },
      classifier: { statusBatchInterval: DEFAULTS.STATUS_BATCH_INTERVAL_S },
      gitContext: { mode: "auto" },
    };
  }
}

async function main() {
  const configPath = resolve(process.env.HOME ?? process.env.USERPROFILE ?? "", ".claude-bridge", "config.yaml");
  const config = loadConfig(configPath);
  const dbPath = resolve(process.env.HOME ?? process.env.USERPROFILE ?? "", ".claude-bridge", "bridge.db");

  const sessionManager = new SessionManager(dbPath);
  const wsServer = new AgentWSServer(config.server.port, config.server.vscodePort);
  const router = new MessageRouter(wsServer, {
    statusBatchIntervalMs: config.classifier.statusBatchInterval * 1000,
  });

  const ptySessions = new Map<string, PtyWrapper>();

  function getOrCreatePty(sessionId: string, projectPath: string, sessionName: string): PtyWrapper {
    if (ptySessions.has(sessionId)) return ptySessions.get(sessionId)!;
    const pty = new PtyWrapper({
      command: "claude",
      args: [],
      cwd: projectPath,
      autoRestart: true,
    });
    pty.on("classified", (line) => router.route(sessionId, sessionName, line));
    pty.on("exit", (code) => {
      console.log(`[agent] PTY ${sessionName} exited with code ${code}`);
      sessionManager.getDatabase().logAudit({
        event: "pty_exit", source: "agent", detail: `Session ${sessionName} exited with code ${code}`,
      });
    });
    ptySessions.set(sessionId, pty);
    console.log(`[agent] Spawned PTY for session "${sessionName}" (pid: ${pty.pid})`);
    return pty;
  }

  function broadcastSessionCount(): void {
    const count = sessionManager.listSessions().length;
    wsServer.sendToBridge(createEnvelope({
      type: MessageType.Control,
      source: Source.Agent,
      sessionId: "",
      payload: { action: "session_count", count },
    }));
  }

  console.log(`[agent] Bridge WS on :${config.server.port}, VS Code WS on :${config.server.vscodePort}`);

  // Handle inbound commands from bridge (WhatsApp)
  wsServer.on("envelope", async (envelope, clientInfo) => {
    if (envelope.type === MessageType.Command) {
      const sessionId = envelope.sessionId;
      const session = sessionManager.resolve(sessionId) ?? sessionManager.getActive();
      if (!session) return;

      const ptySession = getOrCreatePty(session.id, session.projectPath, session.name);

      let text = (envelope.payload as any).text as string;

      // Audit log the command
      sessionManager.getDatabase().logAudit({
        event: "command", source: (envelope.payload as any).sender ?? "whatsapp",
        detail: text,
      });

      // Git context injection (auto mode)
      if (config.gitContext.mode === "auto" && clientInfo?.type === "bridge") {
        const ctx = await collectGitContext(session.projectPath);
        ctx.sessionId = session.id;
        text = `${formatContextHeader(ctx)}\n${text}`;
      }

      ptySession.write(text + "\n");
    }
  });

  // Handle VS Code session registration
  wsServer.on("envelope", (envelope) => {
    if (envelope.type === MessageType.Control) {
      const payload = envelope.payload as any;
      if (payload.action === "register") {
        const existing = sessionManager.resolve(payload.name);
        if (!existing) {
          const session = sessionManager.register(payload.name, payload.projectPath, payload.aliases ?? []);
          getOrCreatePty(session.id, session.projectPath, session.name);
          broadcastSessionCount();
        }
      }
    }
  });

  // Audit log connection events
  wsServer.on("bridge_connected", () => {
    sessionManager.getDatabase().logAudit({ event: "bridge_connected", source: "agent", detail: "Bridge client connected" });
    broadcastSessionCount();
  });
  wsServer.on("vscode_connected", () => {
    sessionManager.getDatabase().logAudit({ event: "vscode_connected", source: "agent", detail: "VS Code client connected" });
  });

  // Graceful shutdown
  function shutdown() {
    console.log("[agent] Shutting down...");
    router.destroy();
    for (const [id, pty] of ptySessions) {
      pty.kill();
      ptySessions.delete(id);
    }
    wsServer.close();
    sessionManager.close();
    process.exit(0);
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  console.log("[agent] Ready. Waiting for connections...");
}

main().catch((err) => {
  console.error("[agent] Fatal:", err);
  process.exit(1);
});
