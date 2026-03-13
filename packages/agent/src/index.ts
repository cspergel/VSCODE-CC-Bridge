import { readFileSync } from "fs";
import { resolve } from "path";
import { load } from "js-yaml";
import { SessionManager } from "./session-manager";
import { PtyWrapper } from "./pty-wrapper";
import { MessageRouter } from "./message-router";
import { AgentWSServer } from "./ws-server";
import { collectGitContext, formatContextHeader } from "./git-context";
import { MessageType, Source, Classification, createEnvelope, DEFAULTS } from "@live-bridge/shared";

interface Config {
  server: { port: number; host: string };
  classifier: { statusBatchInterval: number };
  gitContext: { mode: "auto" | "on-demand" };
  sessions?: { defaultProjectPath?: string };
}

function loadConfig(path: string): Config {
  try {
    const raw = readFileSync(path, "utf-8");
    return load(raw) as Config;
  } catch {
    return {
      server: { port: DEFAULTS.WS_PORT_BRIDGE, host: "127.0.0.1" },
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
  const wsServer = new AgentWSServer(config.server.port);
  const router = new MessageRouter(wsServer, {
    statusBatchIntervalMs: config.classifier.statusBatchInterval * 1000,
  });
  router.setDatabase(sessionManager.getDatabase());

  const ptySessions = new Map<string, PtyWrapper>();
  /** Track PTYs that have processed at least one command (to adjust Enter timing) */
  const ptyInitialized = new Set<string>();

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
    // IPC relay: send raw PTY data to parent (dashboard) if running as child process
    if (process.send) {
      pty.on("raw", (data: string) => {
        if (process.send) process.send({ type: "pty_data", sessionId, data });
      });
    }

    ptySessions.set(sessionId, pty);
    console.log(`[agent] Spawned PTY for session "${sessionName}" (pid: ${pty.pid})`);
    return pty;
  }

  // IPC: receive messages from dashboard (keyboard input, resize, session mgmt)
  if (process.send) {
    process.on("message", (msg: any) => {
      if (msg.type === "pty_input" && msg.sessionId) {
        const pty = ptySessions.get(msg.sessionId);
        if (pty) pty.write(msg.data);
      } else if (msg.type === "pty_resize" && msg.sessionId) {
        const pty = ptySessions.get(msg.sessionId);
        const cols = Math.max(1, Math.floor(msg.cols || 80));
        const rows = Math.max(1, Math.floor(msg.rows || 24));
        if (pty) pty.resize(cols, rows);
      } else if (msg.type === "list_sessions" && process.send) {
        process.send({ type: "sessions_list", sessions: sessionManager.listSessions() });
      } else if (msg.type === "create_session" && process.send) {
        const existing = sessionManager.resolve(msg.name);
        if (existing) {
          process.send({ type: "session_error", error: `Session "${msg.name}" already exists` });
          return;
        }
        const session = sessionManager.register(msg.name, msg.projectPath);
        sessionManager.switchActive(msg.name);
        getOrCreatePty(session.id, session.projectPath, session.name);
        broadcastSessionCount();
        process.send({ type: "session_created", session });
        process.send({ type: "sessions_list", sessions: sessionManager.listSessions() });
      } else if (msg.type === "delete_session" && process.send) {
        try {
          const session = sessionManager.resolve(msg.nameOrId);
          if (!session) {
            process.send({ type: "session_error", error: `Session "${msg.nameOrId}" not found` });
            return;
          }
          // Kill PTY if running
          const ptyEntry = ptySessions.get(session.id);
          if (ptyEntry) {
            try { ptyEntry.kill(); } catch {}
            ptySessions.delete(session.id);
          }
          sessionManager.getDatabase().deleteSession(session.id);
          broadcastSessionCount();
          process.send({ type: "session_deleted", sessionId: session.id });
          process.send({ type: "sessions_list", sessions: sessionManager.listSessions() });
        } catch (err: any) {
          console.error("[agent] delete_session error:", err);
          process.send!({ type: "session_error", error: err.message });
        }
      } else if (msg.type === "activate_session" && process.send) {
        const switched = sessionManager.switchActive(msg.nameOrId);
        if (switched) {
          getOrCreatePty(switched.id, switched.projectPath, switched.name);
          process.send({ type: "session_activated", session: switched });
          process.send({ type: "sessions_list", sessions: sessionManager.listSessions() });
        } else {
          process.send({ type: "session_error", error: `Session "${msg.nameOrId}" not found` });
        }
      }
    });
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

  // Send a text response back to bridge (WhatsApp/Telegram)
  function replyToBridge(text: string, sessionName = "system"): void {
    wsServer.sendToBridge(createEnvelope({
      type: MessageType.Response,
      source: Source.Agent,
      sessionId: "",
      payload: { text, sessionName },
    }));
  }

  console.log(`[agent] Bridge WS on :${config.server.port}`);

  // Handle inbound commands from bridge (WhatsApp/Telegram)
  wsServer.on("envelope", async (envelope) => {
    if (envelope.type !== MessageType.Command) return;

    const payload = envelope.payload as any;
    const intent = payload.intent ?? "command";

    // --- Session management intents ---

    if (intent === "list_sessions") {
      const sessions = sessionManager.listSessions();
      if (sessions.length === 0) {
        replyToBridge("No sessions. Send a message to auto-create one, or use /new <name> <path>");
        return;
      }
      const lines = sessions.map((s, i) =>
        `${s.isWhatsAppActive ? ">" : " "} ${i + 1}. *${s.name}* — ${s.projectPath}`
      );
      replyToBridge(`Sessions:\n${lines.join("\n")}\n\nUse /switch <name> to change.`);
      return;
    }

    if (intent === "switch") {
      const target = payload.targetSession ?? envelope.sessionId;
      const switched = sessionManager.switchActive(target);
      if (switched) {
        getOrCreatePty(switched.id, switched.projectPath, switched.name);
        replyToBridge(`Switched to *${switched.name}* (${switched.projectPath})`);
      } else {
        const sessions = sessionManager.listSessions();
        const names = sessions.map((s) => s.name).join(", ");
        replyToBridge(`Session "${target}" not found. Available: ${names || "none"}`);
      }
      return;
    }

    if (intent === "new_session") {
      const [name, path] = (payload.text as string).split("|");
      if (!name || !path) {
        replyToBridge("Usage: /new <name> <path>\nExample: /new myapp C:\\Projects\\myapp");
        return;
      }
      const existing = sessionManager.resolve(name);
      if (existing) {
        replyToBridge(`Session "${name}" already exists. Use /switch ${name}`);
        return;
      }
      const session = sessionManager.register(name, path);
      sessionManager.switchActive(name);
      getOrCreatePty(session.id, session.projectPath, session.name);
      broadcastSessionCount();
      if (process.send) process.send({ type: "sessions_list", sessions: sessionManager.listSessions() });
      replyToBridge(`Created & switched to *${session.name}* (${path})`);
      return;
    }

    // --- Special commands (help, status, abort, kill) ---
    if (intent === "special") {
      const special = payload.specialCommand as string;
      if (special === "help") {
        replyToBridge(
          `*Claude Bridge Commands*\n\n` +
          `*/help* — Show this command list\n` +
          `*/status* — Show session & PTY info\n` +
          `*/abort* — Send Ctrl+C to active PTY\n` +
          `*/kill* — Kill active PTY process\n` +
          `*/sessions* — List all sessions\n` +
          `*/switch <name>* — Switch active session\n` +
          `*/new <name> <path>* — Create new session\n` +
          `*/broadcast <msg>* — Send to all sessions`
        );
        return;
      }
      if (special === "status") {
        const sessions = sessionManager.listSessions();
        const active = sessionManager.getActive();
        const ptyCount = ptySessions.size;
        replyToBridge(
          `*Status*\n` +
          `Sessions: ${sessions.length}\n` +
          `Active: ${active ? `*${active.name}*` : "none"}\n` +
          `PTY processes: ${ptyCount}`
        );
        return;
      }
      if (special === "abort") {
        const active = sessionManager.getActive();
        if (active) {
          const pty = ptySessions.get(active.id);
          if (pty) {
            pty.write("\x03");
            replyToBridge(`Sent Ctrl+C to *${active.name}*`);
          } else {
            replyToBridge(`No PTY running for *${active.name}*`);
          }
        } else {
          replyToBridge("No active session");
        }
        return;
      }
      if (special === "kill") {
        const active = sessionManager.getActive();
        if (active) {
          const pty = ptySessions.get(active.id);
          if (pty) {
            pty.kill();
            ptySessions.delete(active.id);
            replyToBridge(`Killed PTY for *${active.name}*`);
          } else {
            replyToBridge(`No PTY running for *${active.name}*`);
          }
        } else {
          replyToBridge("No active session");
        }
        return;
      }
      // Unhandled specials fall through to regular PTY command
    }

    // --- Decision reply → forward directly to PTY ---
    // For interactive TUI pickers: translate number to arrow keys + Enter
    // For y/n prompts: forward as text
    if (intent === "decision_reply") {
      const session = sessionManager.resolve(envelope.sessionId) ?? sessionManager.getActive();
      if (session) {
        const pty = ptySessions.get(session.id);
        if (pty) {
          const t = (payload.text as string).trim();
          if (t) {
            const num = parseInt(t, 10);
            if (!isNaN(num) && num >= 1 && num <= 10) {
              // Interactive picker: send (N-1) down arrows then Enter
              const downArrow = "\x1b[B";
              for (let i = 1; i < num; i++) {
                pty.write(downArrow);
              }
              setTimeout(() => pty.write("\r"), 100);
              console.log(`[agent] Picker selection ${num} → ${num - 1} down arrows + Enter for "${session.name}"`);
            } else {
              // Text reply (y/n, accept/reject, etc.)
              pty.write(t + "\r");
              console.log(`[agent] Decision reply "${t}" forwarded to "${session.name}"`);
            }
          }
        }
      }
      return;
    }

    // --- Regular command → PTY ---

    const sessionId = envelope.sessionId;
    let session = sessionManager.resolve(sessionId) ?? sessionManager.getActive();

    // Auto-create a default session if none exists
    if (!session) {
      const projectPath = config.sessions?.defaultProjectPath ?? process.cwd();
      session = sessionManager.register("default", projectPath);
      console.log(`[agent] Auto-created default session at ${projectPath}`);
      broadcastSessionCount();
    }

    const ptySession = getOrCreatePty(session.id, session.projectPath, session.name);

    let text = payload.text as string;

    // Persist inbound message + audit log
    sessionManager.getDatabase().insertMessage({
      sessionId: session.id,
      source: Source.WhatsApp,
      classification: Classification.Command,
      rawContent: text,
      formattedContent: text,
    });
    sessionManager.getDatabase().logAudit({
      event: "command", source: payload.sender ?? "bridge",
      detail: text,
    });

    // Git context injection (auto mode)
    if (config.gitContext.mode === "auto") {
      const ctx = await collectGitContext(session.projectPath);
      ctx.sessionId = session.id;
      text = `${formatContextHeader(ctx)} ${text}`;
    }

    // Write text first, then send Enter after a delay
    // First command needs longer delay — Claude Code TUI is still initializing
    const isFirstCommand = !ptyInitialized.has(session.id);
    const enterDelay = isFirstCommand ? 5000 : 500;
    ptySession.write(text);
    setTimeout(() => {
      ptySession.write("\r");
      if (isFirstCommand) {
        ptyInitialized.add(session.id);
        console.log(`[agent] First command submitted to "${session.name}" (waited ${enterDelay}ms)`);
      }
    }, enterDelay);
  });

  // Audit log connection events
  wsServer.on("bridge_connected", () => {
    sessionManager.getDatabase().logAudit({ event: "bridge_connected", source: "agent", detail: "Bridge client connected" });
    broadcastSessionCount();
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
