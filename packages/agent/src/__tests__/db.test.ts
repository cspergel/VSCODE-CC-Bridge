import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Database } from "../db";
import { SessionStatus, Source, Classification } from "@live-bridge/shared";

describe("Database", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("creates and retrieves a session", () => {
    db.createSession({ id: "s1", name: "chartcopilot", projectPath: "/projects/ccp" });
    const session = db.getSession("s1");
    expect(session).toBeTruthy();
    expect(session!.name).toBe("chartcopilot");
    expect(session!.status).toBe(SessionStatus.Active);
  });

  it("lists all active sessions", () => {
    db.createSession({ id: "s1", name: "ccp", projectPath: "/p1" });
    db.createSession({ id: "s2", name: "sched", projectPath: "/p2" });
    const sessions = db.listSessions();
    expect(sessions).toHaveLength(2);
  });

  it("inserts and retrieves messages", () => {
    db.createSession({ id: "s1", name: "test", projectPath: "/p" });
    db.insertMessage({
      sessionId: "s1",
      source: Source.WhatsApp,
      classification: Classification.Command,
      rawContent: "fix the bug",
      formattedContent: "fix the bug",
    });
    const msgs = db.getMessages("s1", 10);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].rawContent).toBe("fix the bug");
  });

  it("logs audit entries", () => {
    db.logAudit({ event: "command_received", source: "+1234567890", detail: "fix the bug" });
    const logs = db.getAuditLogs(10);
    expect(logs).toHaveLength(1);
    expect(logs[0].event).toBe("command_received");
  });
});
