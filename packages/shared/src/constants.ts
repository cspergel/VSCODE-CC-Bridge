export enum MessageType {
  Command = "command",
  Response = "response",
  Stream = "stream",
  Decision = "decision",
  Status = "status",
  Error = "error",
  Control = "control",
  Context = "context",
}

export enum Source {
  WhatsApp = "whatsapp",
  VSCode = "vscode",
  Agent = "agent",
  ClaudeCode = "claude-code",
}

export enum SessionStatus {
  Active = "active",
  Paused = "paused",
  Detached = "detached",
  Terminated = "terminated",
}

export enum Classification {
  Command = "command",
  Status = "status",
  Output = "output",
  Decision = "decision",
  Error = "error",
  Control = "control",
}

export const DEFAULTS = {
  WS_PORT_BRIDGE: 9377,
  WS_PORT_VSCODE: 9378,
  STATUS_BATCH_INTERVAL_S: 10,
  WAIT_TIMEOUT_MS: 500,
  MAX_WA_MESSAGE_LENGTH: 1500,
  RATE_LIMIT_PER_HOUR: 30,
  RATE_LIMIT_BURST: 5,
  RECENT_COMMIT_COUNT: 3,
  MAX_DIFF_FILES: 10,
  AUDIT_RETENTION_DAYS: 30,
} as const;
