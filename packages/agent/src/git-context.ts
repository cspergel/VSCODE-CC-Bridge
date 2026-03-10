import { execFile } from "child_process";
import { promisify } from "util";
import { ContextSnapshot } from "@live-bridge/shared";

const exec = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  try {
    const { stdout } = await exec("git", args, { cwd, timeout: 5000 });
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function collectGitContext(cwd: string): Promise<ContextSnapshot> {
  const branch = await git(cwd, "rev-parse", "--abbrev-ref", "HEAD");
  if (!branch) {
    return emptySnapshot("", cwd);
  }

  const repoRoot = await git(cwd, "rev-parse", "--show-toplevel");
  const repoName = repoRoot.split("/").pop() ?? repoRoot.split("\\").pop() ?? "";

  // Tracking status
  const tracking = await git(cwd, "rev-list", "--left-right", "--count", `${branch}...@{upstream}`);
  let trackingStatus: string | null = null;
  if (tracking) {
    const [ahead, behind] = tracking.split(/\s+/).map(Number);
    const parts: string[] = [];
    if (ahead) parts.push(`ahead ${ahead}`);
    if (behind) parts.push(`behind ${behind}`);
    trackingStatus = parts.join(", ") || null;
  }

  // Diff stats
  const diffStat = await git(cwd, "diff", "--stat", "--numstat");
  const lines = diffStat.split("\n").filter(Boolean);
  let insertions = 0;
  let deletions = 0;
  const files: { name: string; status: string; lines: number }[] = [];
  for (const line of lines) {
    const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (match) {
      const ins = match[1] === "-" ? 0 : parseInt(match[1], 10);
      const del = match[2] === "-" ? 0 : parseInt(match[2], 10);
      insertions += ins;
      deletions += del;
      files.push({ name: match[3], status: "M", lines: ins + del });
    }
  }

  // Recent commits
  const logRaw = await git(cwd, "log", "--oneline", "-5", "--format=%h|%s|%an|%ai");
  const recentCommits = logRaw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, message, author, date] = line.split("|");
      return { hash, message, author, date };
    });

  return {
    sessionId: "",
    updatedAt: new Date().toISOString(),
    branch,
    trackingStatus,
    uncommittedSummary: { filesChanged: files.length, insertions, deletions, files },
    recentCommits,
    openFiles: [],
    activeFile: null,
    activeLine: null,
    repoName,
    repoRoot,
  };
}

export function formatContextHeader(ctx: ContextSnapshot): string {
  const parts: string[] = [];
  parts.push(ctx.branch);
  if (ctx.trackingStatus) parts.push(ctx.trackingStatus);
  if (ctx.uncommittedSummary.filesChanged > 0) {
    parts.push(
      `${ctx.uncommittedSummary.filesChanged} files changed (+${ctx.uncommittedSummary.insertions} -${ctx.uncommittedSummary.deletions})`
    );
  }
  if (ctx.openFiles.length > 0) {
    parts.push(`open: ${ctx.openFiles.slice(0, 5).join(", ")}`);
  }
  return `[ctx: ${parts.join(" | ")}]`;
}

function emptySnapshot(sessionId: string, cwd: string): ContextSnapshot {
  return {
    sessionId,
    updatedAt: new Date().toISOString(),
    branch: "",
    trackingStatus: null,
    uncommittedSummary: { filesChanged: 0, insertions: 0, deletions: 0, files: [] },
    recentCommits: [],
    openFiles: [],
    activeFile: null,
    activeLine: null,
    repoName: "",
    repoRoot: cwd,
  };
}
