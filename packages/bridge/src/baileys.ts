import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { EventEmitter } from "events";
import qrcode from "qrcode-terminal";
import { AuthGuard } from "./auth.js";
import { SafetyFilter } from "./safety.js";
import { parseInbound, type ParsedMessage } from "./parser.js";

export interface BaileysConfig {
  sessionPath: string;
  allowedNumbers: string[];
  rateLimit: { maxPerHour: number; burstMax: number };
  pin?: string;
}

export class WhatsAppClient extends EventEmitter {
  private sock: WASocket | null = null;
  private auth: AuthGuard;
  private safety: SafetyFilter;
  private config: BaileysConfig;
  private reconnectDelay = 3000;
  private static readonly MAX_RECONNECT_DELAY = 60_000;
  private pendingPinChallenges = new Map<string, { text: string; jid: string }>();
  /** Track message IDs sent by the bridge to avoid processing our own replies */
  private sentMessageIds = new Set<string>();
  /** Map phone numbers to their most recent reply JID (handles LID format) */
  private phoneToJid = new Map<string, string>();

  constructor(config: BaileysConfig) {
    super();
    this.config = config;
    this.auth = new AuthGuard({
      allowedNumbers: config.allowedNumbers,
      rateLimit: config.rateLimit,
    });
    this.safety = new SafetyFilter();
  }

  async connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(
      this.config.sessionPath
    );

    const sock = makeWASocket({
      auth: state,
      browser: ["Claude Bridge", "Chrome", "145.0.0"],
      version: [2, 3000, 1033893291],
      logger: {
        level: "error",
        info: () => {}, debug: () => {}, trace: () => {},
        warn: (...args: unknown[]) => {
          // Suppress Baileys crypto session dumps
          const first = String(args[0] ?? "");
          if (first.includes("session") || first.includes("Session") || typeof args[0] === "object") return;
          console.warn(...args);
        },
        error: console.error,
        child: function() { return this; },
      } as any,
    });
    this.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Display QR code for pairing
      if (qr) {
        console.log("\n[baileys] Scan this QR code with WhatsApp (Linked Devices > Link a Device):\n");
        qrcode.generate(qr, { small: true });
      }

      if (connection === "close") {
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
        if (reason !== DisconnectReason.loggedOut) {
          console.log(`[baileys] Reconnecting in ${this.reconnectDelay / 1000}s...`);
          setTimeout(() => this.connect(), this.reconnectDelay);
          this.reconnectDelay = Math.min(this.reconnectDelay * 2, WhatsAppClient.MAX_RECONNECT_DELAY);
        }
        this.emit("disconnected", reason);
      } else if (connection === "open") {
        this.reconnectDelay = 3000;
        this.emit("connected");
      }
    });

    sock.ev.on("messages.upsert", ({ messages, type }) => {
      for (const msg of messages) {
        if (!msg.message) continue;

        // Skip messages sent by the bridge itself (avoid loops)
        if (msg.key.id && this.sentMessageIds.has(msg.key.id)) {
          this.sentMessageIds.delete(msg.key.id);
          continue;
        }

        // Only process real-time messages, not history sync
        if (type !== "notify") continue;

        // Resolve sender phone number
        const remoteJid = msg.key.remoteJid ?? "";
        let phoneNumber: string;
        let replyJid: string;

        if (remoteJid.endsWith("@s.whatsapp.net")) {
          // Traditional format: number@s.whatsapp.net
          const sender = remoteJid.replace(/@s\.whatsapp\.net$/, "");
          phoneNumber = "+" + sender;
          replyJid = remoteJid;
        } else if (remoteJid.endsWith("@lid")) {
          // LID (Linked Identity) format — resolve from socket user info
          const myNumber = sock.user?.id?.replace(/:.*$/, "") ?? "";
          phoneNumber = "+" + myNumber;
          replyJid = remoteJid; // Reply to the same LID JID
          console.log(`[baileys] Resolved LID → ${phoneNumber}`);
        } else {
          // Unknown format (group, broadcast, etc.) — skip
          console.log(`[baileys] Skipping unknown JID format: ${remoteJid}`);
          continue;
        }

        // Auth check
        if (!this.auth.isAllowed(phoneNumber)) {
          this.emit("auth_failure", phoneNumber);
          continue;
        }

        if (!this.auth.checkRateLimit(phoneNumber)) {
          this.emit("rate_limited", phoneNumber);
          continue;
        }

        // Cache the JID so sendToNumber can use the correct format
        this.phoneToJid.set(phoneNumber, replyJid);

        const text =
          msg.message.conversation ??
          msg.message.extendedTextMessage?.text ??
          "";

        if (!text) continue;

        // Check for pending PIN challenge reply
        const pending = this.pendingPinChallenges.get(phoneNumber);
        if (pending) {
          this.pendingPinChallenges.delete(phoneNumber);
          if (this.config.pin && text.trim() === this.config.pin) {
            // PIN correct — forward the original command
            const parsed: ParsedMessage = parseInbound(pending.text);
            this.emit("message", { sender: phoneNumber, parsed, raw: pending.text, msgKey: msg.key });
          } else {
            this.sendMessage(pending.jid, "Incorrect PIN. Command cancelled.");
            this.emit("pin_failed", { phoneNumber, text: pending.text });
          }
          continue;
        }

        // Safety check — blocklist
        const safetyResult = this.safety.check(text);
        if (safetyResult.blocked) {
          this.emit("blocked", { phoneNumber, text, reason: safetyResult.reason });
          this.sendMessage(replyJid, `Command blocked: ${safetyResult.reason}`);
          continue;
        }

        // Safety check — PIN required for destructive commands
        if (this.config.pin && this.safety.needsPin(text)) {
          this.pendingPinChallenges.set(phoneNumber, { text, jid: replyJid });
          this.sendMessage(replyJid, "This command requires your PIN. Reply with PIN:");
          this.emit("pin_required", { phoneNumber, text });
          continue;
        }

        const parsed: ParsedMessage = parseInbound(text);
        this.emit("message", {
          sender: phoneNumber,
          parsed,
          raw: text,
          msgKey: msg.key,
        });
      }
    });
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.sock) return;
    const sent = await this.sock.sendMessage(jid, { text });
    if (sent?.key?.id) {
      this.sentMessageIds.add(sent.key.id);
      // Clean up old IDs to prevent memory leak (keep last 500)
      if (this.sentMessageIds.size > 500) {
        const first = this.sentMessageIds.values().next().value;
        if (first) this.sentMessageIds.delete(first);
      }
    }
  }

  async sendToNumber(phoneNumber: string, text: string): Promise<void> {
    // Always use @s.whatsapp.net — LID JIDs cause "waiting for this message"
    const jid = phoneNumber.replace("+", "") + "@s.whatsapp.net";
    console.log(`[baileys] Sending to: ${jid}`);
    await this.sendMessage(jid, text);
  }
}
