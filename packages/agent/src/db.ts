import BetterSqlite3 from "better-sqlite3";
import { Session, SessionStatus, Source, Classification } from "@live-bridge/shared";

export class Database {
  private db: BetterSqlite3.Database;

  constructor(path: string) {
    this.db = new BetterSqlite3(path);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        aliases TEXT DEFAULT '[]',
        projectPath TEXT NOT NULL,
        status TEXT DEFAULT '${SessionStatus.Active}',
        isWhatsAppActive INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT (datetime('now')),
        lastActivityAt TEXT DEFAULT (datetime('now')),
        claudeCodePid INTEGER,
        vscodeConnected INTEGER DEFAULT 0,
        pendingDecision INTEGER DEFAULT 0,
        metadata TEXT DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sessionId TEXT NOT NULL REFERENCES sessions(id),
        seq INTEGER NOT NULL,
        timestamp TEXT DEFAULT (datetime('now')),
        source TEXT NOT NULL,
        classification TEXT NOT NULL,
        rawContent TEXT NOT NULL,
        formattedContent TEXT NOT NULL,
        whatsappFormatted TEXT,
        delivered TEXT DEFAULT '{"whatsapp":false,"vscode":false}'
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        event TEXT NOT NULL,
        source TEXT NOT NULL,
        detail TEXT NOT NULL,
        blocked INTEGER DEFAULT 0,
        blockReason TEXT
      );
    `);
  }

  createSession(opts: { id: string; name: string; projectPath: string }): void {
    this.db.prepare(
      "INSERT INTO sessions (id, name, projectPath) VALUES (?, ?, ?)"
    ).run(opts.id, opts.name, opts.projectPath);
  }

  getSession(id: string): Session | null {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as any;
    return row ? this.rowToSession(row) : null;
  }

  getSessionByName(name: string): Session | null {
    const row = this.db.prepare(
      "SELECT * FROM sessions WHERE name = ? OR aliases LIKE ?"
    ).get(name, `%"${name}"%`) as any;
    return row ? this.rowToSession(row) : null;
  }

  listSessions(): Session[] {
    const rows = this.db.prepare(
      "SELECT * FROM sessions WHERE status != 'terminated' ORDER BY lastActivityAt DESC"
    ).all() as any[];
    return rows.map((r) => this.rowToSession(r));
  }

  updateSession(id: string, fields: Partial<Record<string, unknown>>): void {
    const sets = Object.keys(fields).map((k) => `${k} = @${k}`).join(", ");
    this.db.prepare(`UPDATE sessions SET ${sets} WHERE id = @id`).run({ ...fields, id });
  }

  private seqCounters = new Map<string, number>();

  insertMessage(opts: {
    sessionId: string;
    source: Source;
    classification: Classification;
    rawContent: string;
    formattedContent: string;
    whatsappFormatted?: string;
  }): number {
    const seq = (this.seqCounters.get(opts.sessionId) ?? 0) + 1;
    this.seqCounters.set(opts.sessionId, seq);
    const result = this.db.prepare(
      `INSERT INTO messages (sessionId, seq, source, classification, rawContent, formattedContent, whatsappFormatted)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(opts.sessionId, seq, opts.source, opts.classification, opts.rawContent, opts.formattedContent, opts.whatsappFormatted ?? null);
    return result.lastInsertRowid as number;
  }

  getMessages(sessionId: string, limit: number): any[] {
    return this.db.prepare(
      "SELECT * FROM messages WHERE sessionId = ? ORDER BY seq DESC LIMIT ?"
    ).all(sessionId, limit);
  }

  logAudit(opts: { event: string; source: string; detail: string; blocked?: boolean; blockReason?: string }): void {
    this.db.prepare(
      `INSERT INTO audit_log (event, source, detail, blocked, blockReason) VALUES (?, ?, ?, ?, ?)`
    ).run(opts.event, opts.source, opts.detail, opts.blocked ? 1 : 0, opts.blockReason ?? null);
  }

  getAuditLogs(limit: number): any[] {
    return this.db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?").all(limit);
  }

  close(): void {
    this.db.close();
  }

  private rowToSession(row: any): Session {
    return {
      ...row,
      aliases: JSON.parse(row.aliases),
      isWhatsAppActive: !!row.isWhatsAppActive,
      vscodeConnected: !!row.vscodeConnected,
      pendingDecision: !!row.pendingDecision,
      metadata: JSON.parse(row.metadata),
    };
  }
}
