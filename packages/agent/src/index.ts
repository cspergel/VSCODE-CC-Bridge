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

  console.log(`[agent] Bridge WS on :${config.server.port}, VS Code WS on :${config.server.vscodePort}`);

  // Handle inbound commands from bridge (WhatsApp)
  wsServer.on("envelope", async (envelope, clientInfo) => {
    if (envelope.type === MessageType.Command) {
      const sessionId = envelope.sessionId;
      const session = sessionManager.resolve(sessionId) ?? sessionManager.getActive();
      if (!session) return;

      const ptySession = ptySessions.get(session.id);
      if (!ptySession) return;

      let text = (envelope.payload as any).text as string;

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
          sessionManager.register(payload.name, payload.projectPath, payload.aliases ?? []);
        }
      }
    }
  });

  console.log("[agent] Ready. Waiting for connections...");
}

main().catch((err) => {
  console.error("[agent] Fatal:", err);
  process.exit(1);
});
