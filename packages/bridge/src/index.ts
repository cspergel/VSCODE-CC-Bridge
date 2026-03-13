import WebSocket from "ws";
import { WhatsAppClient } from "./baileys.js";
import { TelegramClient } from "./telegram.js";
import { formatForWhatsApp } from "./formatter.js";
import { Envelope, MessageType, Source, createEnvelope, Classification, DEFAULTS } from "@live-bridge/shared";
import { readFileSync } from "fs";
import { resolve } from "path";
import { load } from "js-yaml";

// Suppress Signal protocol crypto session dumps (they bypass Baileys logger)
const origWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const first = String(args[0] ?? "");
  if (first.includes("Closing session") || first.includes("SessionEntry") || first.includes("_chains")) return;
  origWarn(...args);
};

interface Config {
  whatsapp?: { allowedNumbers: string[]; sessionPath: string; pin?: string; rateLimit: { maxPerHour: number; burstMax: number } };
  telegram?: { botToken: string; allowedChatIds: number[] };
  server: { port: number };
}

function loadConfig(): Config {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  try {
    return load(readFileSync(resolve(home, ".claude-bridge", "config.yaml"), "utf-8")) as Config;
  } catch {
    return {
      server: { port: DEFAULTS.WS_PORT_BRIDGE },
    };
  }
}

async function main() {
  const config = loadConfig();

  if (!config.whatsapp && !config.telegram) {
    console.error("[bridge] No messaging platform configured. Add 'whatsapp' and/or 'telegram' to config.yaml");
    process.exit(1);
  }

  // Connect to agent
  let agentWs: WebSocket | null = null;
  let sessionCount = 1;

  function sendToAgent(envelope: Envelope): void {
    if (agentWs?.readyState === WebSocket.OPEN) {
      agentWs.send(JSON.stringify(envelope));
    }
  }

  /** Format and dispatch an agent response to all configured platforms */
  async function dispatchResponse(envelope: Envelope): Promise<void> {
    const payload = envelope.payload as any;

    // Skip Status messages — user only wants decisions & final responses
    if (envelope.type === MessageType.Status) {
      console.log(`[bridge] SKIP status: ${JSON.stringify(payload).slice(0, 80)}`);
      return;
    }

    const classification =
      envelope.type === MessageType.Decision ? Classification.Decision :
      envelope.type === MessageType.Error ? Classification.Error :
      Classification.Output;

    console.log(`[bridge] ← agent (${envelope.type}): ${JSON.stringify(payload).slice(0, 150)}`);

    // Track session count for multi-session tagging
    if (envelope.type === MessageType.Control && payload.action === "session_count") {
      sessionCount = payload.count ?? 1;
      return;
    }

    const rawText = payload.text as string;
    if (!rawText?.trim()) return;

    // Safety-net filter for TUI noise that slips through the agent
    const cleanedLines = rawText.split("\n").filter((line: string) => {
      const t = line.trim();
      if (!t) return false;
      // Spinner/animation chars only
      if (/^[✢✶✻✽·*\s⏵>…●]+$/.test(t)) return false;
      // >30% spinner chars
      if ((t.match(/[✢✶✻✽·*…]/g)?.length ?? 0) > t.length * 0.3) return false;
      // No complete word in short text
      if (t.length < 50 && !/[a-zA-Z]{3}/.test(t)) return false;
      // TUI tab indicators
      if (/^⧉/.test(t)) return false;
      return true;
    });
    const text = cleanedLines.join("\n").trim();
    if (!text) {
      console.log(`[bridge] FILTERED (noise): ${rawText.slice(0, 80)}`);
      return;
    }

    const formatted = formatForWhatsApp({
      classification,
      text,
      sessionName: payload.sessionName ?? "default",
      multiSession: sessionCount > 1,
      actions: payload.actions,
    });

    if (!formatted.trim()) return;

    console.log(`[bridge] → messaging (${classification}): ${formatted.slice(0, 80)}${formatted.length > 80 ? "..." : ""}`);

    // Send to WhatsApp
    if (waClient) {
      for (const num of config.whatsapp!.allowedNumbers) {
        try {
          await waClient.sendToNumber(num, formatted);
        } catch (err) {
          console.error(`[bridge] WhatsApp send to ${num} failed:`, err);
        }
      }
    }

    // Send to Telegram
    if (tgClient) {
      try {
        await tgClient.broadcast(formatted);
      } catch (err) {
        console.error(`[bridge] Telegram broadcast failed:`, err);
      }
    }
  }

  function connectToAgent() {
    agentWs = new WebSocket(`ws://127.0.0.1:${config.server.port}`);
    agentWs.on("open", () => console.log("[bridge] Connected to agent"));
    agentWs.on("close", () => { setTimeout(connectToAgent, 3000); });
    agentWs.on("error", () => {});

    agentWs.on("message", async (data) => {
      try {
        const envelope: Envelope = JSON.parse(data.toString());
        await dispatchResponse(envelope);
      } catch (err) {
        console.error("[bridge] Error processing agent message:", err);
      }
    });
  }

  // --- WhatsApp (optional) ---
  let waClient: WhatsAppClient | null = null;
  if (config.whatsapp) {
    waClient = new WhatsAppClient({
      sessionPath: config.whatsapp.sessionPath,
      allowedNumbers: config.whatsapp.allowedNumbers,
      rateLimit: config.whatsapp.rateLimit,
      pin: config.whatsapp.pin,
    });

    waClient.on("message", ({ sender, parsed, raw }) => {
      sendToAgent(createEnvelope({
        type: MessageType.Command,
        source: Source.WhatsApp,
        sessionId: parsed.targetSession ?? "",
        payload: { text: parsed.text, intent: parsed.intent, specialCommand: parsed.specialCommand, targetSession: parsed.targetSession, sender, raw },
      }));
    });

    waClient.on("connected", () => console.log("[bridge] WhatsApp connected"));
    waClient.on("blocked", ({ text, reason }: { text: string; reason: string }) => console.log(`[bridge] Blocked: ${reason} — ${text}`));

    // Reaction-based decision approval (legacy — decisions are auto-approved now, but keep for manual override)
    waClient.on("reaction", ({ messageId, emoji, sender }: { messageId: string; emoji: string; sender: string }) => {
      console.log(`[bridge] Reaction: ${emoji} on ${messageId} from ${sender}`);
    });
  }

  // --- Telegram (optional) ---
  let tgClient: TelegramClient | null = null;
  if (config.telegram) {
    tgClient = new TelegramClient({
      botToken: config.telegram.botToken,
      allowedChatIds: config.telegram.allowedChatIds,
    });

    tgClient.on("message", ({ sender, parsed, raw }) => {
      sendToAgent(createEnvelope({
        type: MessageType.Command,
        source: Source.Telegram,
        sessionId: parsed.targetSession ?? "",
        payload: { text: parsed.text, intent: parsed.intent, specialCommand: parsed.specialCommand, targetSession: parsed.targetSession, sender, raw },
      }));
    });

    tgClient.on("connected", () => console.log("[bridge] Telegram connected"));
  }

  // Graceful shutdown
  let shuttingDown = false;
  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("[bridge] Shutting down...");
    agentWs?.close();
    tgClient?.stop();
    process.exit(0);
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  connectToAgent();

  // Start configured platforms
  if (waClient) {
    await waClient.connect();
    console.log("[bridge] WhatsApp ready. Scan QR code if prompted.");
  }

  if (tgClient) {
    await tgClient.connect();
    console.log("[bridge] Telegram ready.");
  }

  console.log("[bridge] Ready.");
}

main().catch(console.error);
