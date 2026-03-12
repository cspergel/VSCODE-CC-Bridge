import { randomUUID } from "crypto";
import { Database } from "./db";
import { Session } from "@live-bridge/shared";

export class SessionManager {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
  }

  register(name: string, projectPath: string, aliases: string[] = []): Session {
    const id = randomUUID();
    this.db.createSession({ id, name, projectPath });
    if (aliases.length > 0) {
      this.db.updateSession(id, { aliases: JSON.stringify(aliases) });
    }

    // If this is the first session, make it active
    const sessions = this.db.listSessions();
    if (sessions.length === 1) {
      this.db.updateSession(id, { isWhatsAppActive: 1 });
    }

    return this.db.getSession(id)!;
  }

  resolve(nameOrAlias: string): Session | null {
    // Exact match on ID
    const byId = this.db.getSession(nameOrAlias);
    if (byId) return byId;

    // Exact match on name
    const exact = this.db.getSessionByName(nameOrAlias);
    if (exact) return exact;

    // Fuzzy match: check if input is a substring of any session name or alias
    const all = this.db.listSessions();
    const lower = nameOrAlias.toLowerCase();

    for (const s of all) {
      if (s.name.toLowerCase().includes(lower)) return s;
      for (const alias of s.aliases) {
        if (alias.toLowerCase().includes(lower)) return s;
      }
    }

    return null;
  }

  switchActive(nameOrAlias: string): Session | null {
    const target = this.resolve(nameOrAlias);
    if (!target) return null;

    // Deactivate all
    for (const s of this.db.listSessions()) {
      this.db.updateSession(s.id, { isWhatsAppActive: 0 });
    }

    // Activate target
    this.db.updateSession(target.id, { isWhatsAppActive: 1, lastActivityAt: new Date().toISOString() });
    return this.db.getSession(target.id);
  }

  getActive(): Session | null {
    return this.db.listSessions().find((s) => s.isWhatsAppActive) ?? null;
  }

  listSessions(): Session[] {
    return this.db.listSessions();
  }

  getDatabase(): Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}
