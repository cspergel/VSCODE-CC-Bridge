import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SessionManager } from "../session-manager";

describe("SessionManager", () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = new SessionManager(":memory:");
  });

  afterEach(() => {
    mgr.close();
  });

  it("registers a new session and sets it as active", () => {
    mgr.register("chartcopilot", "/projects/ccp");
    const sessions = mgr.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].name).toBe("chartcopilot");
    expect(sessions[0].isWhatsAppActive).toBe(true);
  });

  it("resolves session by alias", () => {
    mgr.register("chartcopilot", "/projects/ccp", ["ccp", "chart"]);
    const session = mgr.resolve("ccp");
    expect(session).toBeTruthy();
    expect(session!.name).toBe("chartcopilot");
  });

  it("switches active session", () => {
    mgr.register("ccp", "/p1");
    mgr.register("sched", "/p2");
    mgr.switchActive("sched");
    const active = mgr.getActive();
    expect(active!.name).toBe("sched");
  });

  it("fuzzy matches session names", () => {
    mgr.register("hospitalist-scheduler", "/p1", ["sched"]);
    const session = mgr.resolve("scheduler");
    expect(session).toBeTruthy();
    expect(session!.name).toBe("hospitalist-scheduler");
  });
});
