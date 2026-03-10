import { describe, it, expect } from "vitest";
import os from "os";
import { collectGitContext, formatContextHeader } from "../git-context";
import { ContextSnapshot } from "@live-bridge/shared";

describe("Git Context", () => {
  it("collects context from a real git repo", async () => {
    // Use this project's own repo for testing
    const ctx = await collectGitContext(process.cwd());
    expect(ctx.branch).toBeTruthy();
    expect(ctx.repoRoot).toBeTruthy();
  });

  it("formats a compact context header", () => {
    const snapshot: ContextSnapshot = {
      sessionId: "test",
      updatedAt: new Date().toISOString(),
      branch: "main",
      trackingStatus: "ahead 2",
      uncommittedSummary: {
        filesChanged: 3,
        insertions: 45,
        deletions: 12,
        files: [{ name: "auth.ts", status: "M", lines: 20 }],
      },
      recentCommits: [{ hash: "abc", message: "fix auth", author: "craig", date: "2026-03-10" }],
      openFiles: ["auth.ts", "routes.ts"],
      activeFile: "auth.ts",
      activeLine: 42,
      repoName: "chartcopilot",
      repoRoot: "/projects/chartcopilot",
    };

    const header = formatContextHeader(snapshot);
    expect(header).toContain("main");
    expect(header).toContain("3 files changed");
    expect(header).toContain("+45 -12");
  });

  it("returns sensible defaults for non-git directory", async () => {
    const ctx = await collectGitContext(os.tmpdir());
    expect(ctx.branch).toBe("");
  });
});
