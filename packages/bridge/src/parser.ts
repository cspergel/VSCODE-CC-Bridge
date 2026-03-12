export enum MessageIntent {
  Command = "command",
  TargetedCommand = "targeted_command",
  Switch = "switch",
  ListSessions = "list_sessions",
  NewSession = "new_session",
  Broadcast = "broadcast",
  DecisionReply = "decision_reply",
  Special = "special",
}

const SPECIAL_COMMANDS = new Set([
  "status", "abort", "kill", "help", "verbose", "ctx", "pause", "resume", "detach", "attach",
]);

export interface ParsedMessage {
  intent: MessageIntent;
  text: string;
  targetSession: string | null;
  actionIndex: number | null;
  specialCommand: string | null;
}

export function parseInbound(raw: string): ParsedMessage {
  const text = raw.trim();

  // Number reply (1, 2, 3) → decision response
  if (/^\d+$/.test(text) && parseInt(text) <= 10) {
    return { intent: MessageIntent.DecisionReply, text, targetSession: null, actionIndex: parseInt(text) - 1, specialCommand: null };
  }

  // "accept all", "reject" shorthand
  if (/^(accept|reject)\b/i.test(text)) {
    return { intent: MessageIntent.DecisionReply, text, targetSession: null, actionIndex: /^accept/i.test(text) ? 0 : -1, specialCommand: null };
  }

  // Slash commands
  if (text.startsWith("/")) {
    const parts = text.slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const rest = parts.slice(1).join(" ");

    if (cmd === "sessions" || cmd === "session" && parts[1] === "list") {
      return { intent: MessageIntent.ListSessions, text: "", targetSession: null, actionIndex: null, specialCommand: null };
    }

    if (cmd === "switch") {
      return { intent: MessageIntent.Switch, text: "", targetSession: rest, actionIndex: null, specialCommand: null };
    }

    if (cmd === "new") {
      // /new <name> <path> — create a new session
      const name = parts[1] || "";
      const path = parts.slice(2).join(" ") || "";
      return { intent: MessageIntent.NewSession, text: `${name}|${path}`, targetSession: null, actionIndex: null, specialCommand: null };
    }

    if (cmd === "all") {
      return { intent: MessageIntent.Broadcast, text: rest, targetSession: null, actionIndex: null, specialCommand: null };
    }

    if (SPECIAL_COMMANDS.has(cmd)) {
      return { intent: MessageIntent.Special, text: rest, targetSession: rest || null, specialCommand: cmd, actionIndex: null };
    }

    // Assume it's a /sessionname prefix
    return { intent: MessageIntent.TargetedCommand, text: rest, targetSession: cmd, actionIndex: null, specialCommand: null };
  }

  // Plain text → command to active session
  return { intent: MessageIntent.Command, text, targetSession: null, actionIndex: null, specialCommand: null };
}
