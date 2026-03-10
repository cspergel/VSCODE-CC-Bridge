import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SessionManager } from "../session-manager";
import { classify } from "../classifier";
import { collectGitContext, formatContextHeader } from "../git-context";
import { Classification } from "@live-bridge/shared";
import { parseInbound, MessageIntent } from "../../../../packages/bridge/src/parser";

describe("End-to-end integration", () => {
  let mgr: SessionManager;

  beforeAll(() => {
    mgr = new SessionManager(":memory:");
    mgr.register("chartcopilot", process.cwd(), ["ccp"]);
    mgr.register("scheduler", "/tmp/sched", ["sched"]);
  });

  afterAll(() => mgr.close());

  it("routes /ccp command to chartcopilot", () => {
    const parsed = parseInbound("/ccp fix the HCC pipeline");
    expect(parsed.intent).toBe(MessageIntent.TargetedCommand);
    const session = mgr.resolve(parsed.targetSession!);
    expect(session!.name).toBe("chartcopilot");
  });

  it("classifies Claude Code output correctly through the pipeline", () => {
    expect(classify("Reading src/api/auth.ts...")).toBe(Classification.Status);
    expect(classify("Should I proceed? (y/n)")).toBe(Classification.Decision);
    expect(classify("Error: ENOENT")).toBe(Classification.Error);
    expect(classify("Found 3 issues in the auth flow")).toBe(Classification.Output);
  });

  it("collects and formats git context", async () => {
    const ctx = await collectGitContext(process.cwd());
    if (ctx.branch) {
      const header = formatContextHeader(ctx);
      expect(header).toMatch(/^\[ctx:/);
    }
  });

  it("handles /switch and active session tracking", () => {
    mgr.switchActive("scheduler");
    expect(mgr.getActive()!.name).toBe("scheduler");

    mgr.switchActive("ccp");
    expect(mgr.getActive()!.name).toBe("chartcopilot");
  });
});
