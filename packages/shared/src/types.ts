import { SessionStatus, Classification, Source } from "./constants";

export interface Session {
  id: string;
  name: string;
  aliases: string[];
  projectPath: string;
  status: SessionStatus;
  isWhatsAppActive: boolean;
  createdAt: string;
  lastActivityAt: string;
  claudeCodePid: number | null;
  pendingDecision: boolean;
  metadata: Record<string, unknown>;
}

export interface Message {
  id?: number;
  sessionId: string;
  seq: number;
  timestamp: string;
  source: Source;
  classification: Classification;
  rawContent: string;
  formattedContent: string;
  whatsappFormatted: string | null;
  delivered: { whatsapp: boolean };
}

export interface AuditEntry {
  id?: number;
  timestamp: string;
  event: string;
  source: string;
  detail: string;
  blocked: boolean;
  blockReason: string | null;
}

export interface ContextSnapshot {
  sessionId: string;
  updatedAt: string;
  branch: string;
  trackingStatus: string | null;
  uncommittedSummary: {
    filesChanged: number;
    insertions: number;
    deletions: number;
    files: { name: string; status: string; lines: number }[];
  };
  recentCommits: { hash: string; message: string; author: string; date: string }[];
  openFiles: string[];
  activeFile: string | null;
  activeLine: number | null;
  repoName: string;
  repoRoot: string;
}
