import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { EventEmitter } from "events";
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

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
    });

    this.sock.ev.on("creds.update", saveCreds);

    this.sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect } = update;
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

    this.sock.ev.on("messages.upsert", ({ messages }) => {
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;

        const sender =
          msg.key.remoteJid?.replace(/@s\.whatsapp\.net$/, "") ?? "";
        const phoneNumber = "+" + sender;

        // Auth check
        if (!this.auth.isAllowed(phoneNumber)) {
          this.emit("auth_failure", phoneNumber);
          continue;
        }

        if (!this.auth.checkRateLimit(phoneNumber)) {
          this.emit("rate_limited", phoneNumber);
          continue;
        }

        const text =
          msg.message.conversation ??
          msg.message.extendedTextMessage?.text ??
          "";

        if (!text) continue;

        const jid = sender + "@s.whatsapp.net";

        // Check for pending PIN challenge reply
        const pending = this.pendingPinChallenges.get(phoneNumber);
        if (pending) {
          this.pendingPinChallenges.delete(phoneNumber);
          if (this.config.pin && text.trim() === this.config.pin) {
            // PIN correct — forward the original command
            const parsed: ParsedMessage = parseInbound(pending.text);
            this.emit("message", { sender: phoneNumber, parsed, raw: pending.text, msgKey: msg.key });
          } else {
            this.sendMessage(jid, "Incorrect PIN. Command cancelled.");
            this.emit("pin_failed", { phoneNumber, text: pending.text });
          }
          continue;
        }

        // Safety check — blocklist
        const safetyResult = this.safety.check(text);
        if (safetyResult.blocked) {
          this.emit("blocked", { phoneNumber, text, reason: safetyResult.reason });
          this.sendMessage(jid, `Command blocked: ${safetyResult.reason}`);
          continue;
        }

        // Safety check — PIN required for destructive commands
        if (this.config.pin && this.safety.needsPin(text)) {
          this.pendingPinChallenges.set(phoneNumber, { text, jid });
          this.sendMessage(jid, "This command requires your PIN. Reply with PIN:");
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
    await this.sock.sendMessage(jid, { text });
  }

  async sendToNumber(phoneNumber: string, text: string): Promise<void> {
    const jid = phoneNumber.replace("+", "") + "@s.whatsapp.net";
    await this.sendMessage(jid, text);
  }
}
