import * as vscode from "vscode";
import { SidebarProvider } from "./sidebar";
import { BridgeWSClient } from "./ws-client";
import { GitWatcher } from "./git-watcher";

let wsClient: BridgeWSClient | undefined;
let gitWatcher: GitWatcher | undefined;

export function activate(context: vscode.ExtensionContext) {
  wsClient = new BridgeWSClient();
  gitWatcher = new GitWatcher(wsClient);

  const sidebarProvider = new SidebarProvider(context.extensionUri, wsClient);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("claudeBridge.sidebar", sidebarProvider),

    vscode.commands.registerCommand("claudeBridge.connect", () => {
      wsClient!.connect();
    }),

    vscode.commands.registerCommand("claudeBridge.disconnect", () => {
      wsClient!.disconnect();
    }),

    vscode.commands.registerCommand("claudeBridge.refreshContext", () => {
      gitWatcher!.forceRefresh();
    }),

    vscode.commands.registerCommand("claudeBridge.setSessionName", async () => {
      const name = await vscode.window.showInputBox({ prompt: "Session name for this workspace" });
      if (name) wsClient!.setSessionName(name);
    }),

    vscode.commands.registerCommand("claudeBridge.routeHere", () => {
      wsClient!.requestRouteHere();
    }),

    vscode.commands.registerCommand("claudeBridge.acceptAll", () => {
      wsClient!.sendCommand("y");
    }),

    vscode.commands.registerCommand("claudeBridge.rejectAll", () => {
      wsClient!.sendCommand("n");
    }),
  );

  // Status bar
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBar.text = "$(radio-tower) Bridge: Disconnected";
  statusBar.command = "claudeBridge.connect";
  statusBar.show();
  context.subscriptions.push(statusBar);

  wsClient.on("connected", () => {
    statusBar.text = "$(radio-tower) Bridge: Connected";
    statusBar.color = undefined;
  });
  wsClient.on("disconnected", () => {
    statusBar.text = "$(radio-tower) Bridge: Disconnected";
    statusBar.color = new vscode.ThemeColor("errorForeground");
  });
}

export function deactivate() {
  wsClient?.disconnect();
  gitWatcher?.dispose();
}
