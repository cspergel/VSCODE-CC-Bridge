import TelegramBot from "node-telegram-bot-api";
import { EventEmitter } from "events";
import { parseInbound, type ParsedMessage } from "./parser.js";

export interface TelegramConfig {
  botToken: string;
  allowedChatIds: number[];
}

export class TelegramClient extends EventEmitter {
  private bot: TelegramBot;
  private allowedChatIds: Set<number>;

  constructor(private config: TelegramConfig) {
    super();
    this.allowedChatIds = new Set(config.allowedChatIds);
    this.bot = new TelegramBot(config.botToken, { polling: true });
  }

  async connect(): Promise<void> {
    this.bot.on("message", (msg) => {
      const chatId = msg.chat.id;

      // If no chat IDs configured, log for discovery and allow all
      if (this.allowedChatIds.size === 0) {
        console.log(`[telegram] Discovery mode — message from chat ${chatId} (user: ${msg.from?.username ?? msg.from?.id}). Add this ID to allowedChatIds in config.yaml`);
      } else if (!this.allowedChatIds.has(chatId)) {
        console.log(`[telegram] Ignoring message from unauthorized chat ${chatId}`);
        return;
      }

      const text = msg.text;
      if (!text) return;

      const parsed: ParsedMessage = parseInbound(text);

      this.emit("message", {
        sender: String(chatId),
        parsed,
        raw: text,
      });
    });

    this.bot.on("polling_error", (err) => {
      console.error(`[telegram] Polling error:`, err.message);
    });

    const me = await this.bot.getMe();
    console.log(`[telegram] Bot connected: @${me.username}`);
    this.emit("connected");
  }

  async sendMessage(chatId: number | string, text: string): Promise<void> {
    try {
      await this.bot.sendMessage(Number(chatId), text, { parse_mode: "Markdown" });
    } catch (err: any) {
      // Retry without Markdown if parsing fails
      if (err.message?.includes("can't parse")) {
        await this.bot.sendMessage(Number(chatId), text);
      } else {
        throw err;
      }
    }
  }

  /** Send to all allowed chat IDs */
  async broadcast(text: string): Promise<void> {
    for (const chatId of this.allowedChatIds) {
      try {
        await this.sendMessage(chatId, text);
      } catch (err) {
        console.error(`[telegram] Failed to send to ${chatId}:`, err);
      }
    }
  }

  stop(): void {
    this.bot.stopPolling();
  }
}
