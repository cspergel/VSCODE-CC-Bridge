import * as vscode from "vscode";
import { BridgeWSClient } from "./ws-client";

export class SidebarProvider implements vscode.WebviewViewProvider {
  constructor(
    _extensionUri: vscode.Uri,
    _wsClient: BridgeWSClient
  ) {}

  resolveWebviewView(_view: vscode.WebviewView): void {}
}
