import WebSocket from "ws";
import { WhatsAppClient } from "./baileys.js";
import { formatForWhatsApp } from "./formatter.js";
import { parseInbound } from "./parser.js";
import { Envelope, MessageType, Source, createEnvelope, Classification, DEFAULTS } from "@live-bridge/shared";
import { readFileSync } from "fs";
import { resolve } from "path";
import { load } from "js-yaml";

interface Config {
  whatsapp: { allowedNumbers: string[]; sessionPath: string; pin?: string; rateLimit: { maxPerHour: number; burstMax: number } };
  server: { port: number };
}

function loadConfig(): Config {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  try {
    return load(readFileSync(resolve(home, ".claude-bridge", "config.yaml"), "utf-8")) as Config;
  } catch {
    return {
      whatsapp: { allowedNumbers: [], sessionPath: resolve(home, ".claude-bridge", "wa-session"), rateLimit: { maxPerHour: 30, burstMax: 5 } },
      server: { port: DEFAULTS.WS_PORT_BRIDGE },
    };
  }
}

async function main() {
  const config = loadConfig();

  // Connect to agent
  let agentWs: WebSocket | null = null;
  let sessionCount = 1;
  // Track the last decision message ID for reaction-based approval
  let lastDecisionMessageId: string | null = null;

  function connectToAgent() {
    agentWs = new WebSocket(`ws://127.0.0.1:${config.server.port}`);
    agentWs.on("open", () => console.log("[bridge] Connected to agent"));
    agentWs.on("close", () => { setTimeout(connectToAgent, 3000); });
    agentWs.on("error", () => {});

    agentWs.on("message", async (data) => {
      try {
        const envelope: Envelope = JSON.parse(data.toString());
        const payload = envelope.payload as any;
        const classification =
          envelope.type === MessageType.Decision ? Classification.Decision :
          envelope.type === MessageType.Error ? Classification.Error :
          envelope.type === MessageType.Status ? Classification.Status :
          Classification.Output;

        // Track session count for multi-session tagging
        if (envelope.type === MessageType.Control && payload.action === "session_count") {
          sessionCount = payload.count ?? 1;
          return;
        }

        const formatted = formatForWhatsApp({
          classification,
          text: payload.text,
          sessionName: payload.sessionName ?? "default",
          multiSession: sessionCount > 1,
          actions: payload.actions,
        });

        console.log(`[bridge] → WhatsApp (${classification}): ${formatted.slice(0, 80)}${formatted.length > 80 ? "..." : ""}`);

        // Send to all allowed numbers (single-user)
        for (const num of config.whatsapp.allowedNumbers) {
          try {
            const msgId = await waClient.sendToNumber(num, formatted);
            // Track decision messages for reaction-based approval
            if (classification === Classification.Decision) {
              lastDecisionMessageId = msgId ?? null;
            }
          } catch (err) {
            console.error(`[bridge] Failed to send to ${num}:`, err);
          }
        }
      } catch (err) {
        console.error("[bridge] Error processing agent message:", err);
      }
    });
  }

  // Start WhatsApp
  const waClient = new WhatsAppClient({
    sessionPath: config.whatsapp.sessionPath,
    allowedNumbers: config.whatsapp.allowedNumbers,
    rateLimit: config.whatsapp.rateLimit,
    pin: config.whatsapp.pin,
  });

  waClient.on("message", ({ sender, parsed, raw }) => {
    if (agentWs?.readyState === WebSocket.OPEN) {
      agentWs.send(JSON.stringify(createEnvelope({
        type: MessageType.Command,
        source: Source.WhatsApp,
        sessionId: parsed.targetSession ?? "",
        payload: { text: parsed.text, intent: parsed.intent, specialCommand: parsed.specialCommand, targetSession: parsed.targetSession, sender, raw },
      })));
    }
  });

  waClient.on("connected", () => console.log("[bridge] WhatsApp connected"));
  waClient.on("blocked", ({ text, reason }: { text: string; reason: string }) => console.log(`[bridge] Blocked: ${reason} — ${text}`));

  // Handle reaction-based decision approval (👍/👎)
  waClient.on("reaction", ({ messageId, emoji, sender }: { messageId: string; emoji: string; sender: string }) => {
    console.log(`[bridge] Reaction: ${emoji} on ${messageId} from ${sender}`);
    // Only handle reactions on the last decision message
    if (messageId === lastDecisionMessageId) {
      lastDecisionMessageId = null;
      const approved = emoji === "\u{1F44D}" || emoji === "\u{1F44D}\u{1F3FB}" || emoji === "\u{1F44D}\u{1F3FC}" ||
        emoji === "\u{1F44D}\u{1F3FD}" || emoji === "\u{1F44D}\u{1F3FE}" || emoji === "\u{1F44D}\u{1F3FF}";
      const denied = emoji === "\u{1F44E}" || emoji === "\u{1F44E}\u{1F3FB}" || emoji === "\u{1F44E}\u{1F3FC}" ||
        emoji === "\u{1F44E}\u{1F3FD}" || emoji === "\u{1F44E}\u{1F3FE}" || emoji === "\u{1F44E}\u{1F3FF}";
      if (approved || denied) {
        const reply = approved ? "y" : "n";
        if (agentWs?.readyState === WebSocket.OPEN) {
          agentWs.send(JSON.stringify(createEnvelope({
            type: MessageType.Command,
            source: Source.WhatsApp,
            sessionId: "",
            payload: { text: reply, intent: "decision_reply", sender },
          })));
        }
        console.log(`[bridge] Decision ${approved ? "APPROVED" : "DENIED"} via reaction`);
      }
    }
  });

  // Graceful shutdown
  let shuttingDown = false;
  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("[bridge] Shutting down...");
    agentWs?.close();
    process.exit(0);
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  connectToAgent();
  await waClient.connect();
  console.log("[bridge] Ready. Scan QR code if prompted.");
}

main().catch(console.error);
