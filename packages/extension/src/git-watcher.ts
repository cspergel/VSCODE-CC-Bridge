import * as vscode from "vscode";
import { BridgeWSClient } from "./ws-client";
import { execFile } from "child_process";
import { promisify } from "util";

const exec = promisify(execFile);

export class GitWatcher {
  private disposables: vscode.Disposable[] = [];
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly DEBOUNCE_MS = 2000;

  constructor(private wsClient: BridgeWSClient) {
    // File save -> refresh context
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument(() => this.refresh())
    );

    // Active editor change -> update active file
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.wsClient.sendContext({
            activeFile: editor.document.fileName,
            activeLine: editor.selection.active.line + 1,
          });
        }
      })
    );

    // Watch .git/HEAD for branch changes
    const gitHeadWatcher = vscode.workspace.createFileSystemWatcher("**/.git/HEAD");
    gitHeadWatcher.onDidChange(() => this.refresh());
    this.disposables.push(gitHeadWatcher);

    // Watch .git/index for staging changes
    const gitIndexWatcher = vscode.workspace.createFileSystemWatcher("**/.git/index");
    gitIndexWatcher.onDidChange(() => this.refresh());
    this.disposables.push(gitIndexWatcher);
  }

  async forceRefresh(): Promise<void> {
    await this.doRefresh();
  }

  private refresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.doRefresh(), GitWatcher.DEBOUNCE_MS);
  }

  private async doRefresh(): Promise<void> {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!cwd) return;

    try {
      const [branchResult, diffResult, logResult] = await Promise.all([
        exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd }),
        exec("git", ["diff", "--stat", "--numstat"], { cwd }),
        exec("git", ["log", "--oneline", "-3", "--format=%h|%s|%an|%ai"], { cwd }),
      ]);

      const openFiles = vscode.window.tabGroups.all
        .flatMap((g) => g.tabs)
        .map((t) => (t.input as any)?.uri?.fsPath)
        .filter(Boolean);

      this.wsClient.sendContext({
        branch: branchResult.stdout.trim(),
        diffRaw: diffResult.stdout.trim(),
        logRaw: logResult.stdout.trim(),
        openFiles,
        activeFile: vscode.window.activeTextEditor?.document.fileName ?? null,
        activeLine: vscode.window.activeTextEditor
          ? vscode.window.activeTextEditor.selection.active.line + 1
          : null,
      });
    } catch {
      // Not a git repo or git not available
    }
  }

  dispose(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.disposables.forEach((d) => d.dispose());
  }
}
