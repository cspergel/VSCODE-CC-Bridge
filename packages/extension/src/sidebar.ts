import * as vscode from "vscode";
import { BridgeWSClient } from "./ws-client";
import { Envelope, MessageType } from "@live-bridge/shared";

export class SidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private extensionUri: vscode.Uri,
    private wsClient: BridgeWSClient
  ) {
    wsClient.on("envelope", (env: Envelope) => {
      this.view?.webview.postMessage({ type: "envelope", data: env });
    });
    wsClient.on("connected", () => {
      this.view?.webview.postMessage({ type: "status", connected: true });
    });
    wsClient.on("disconnected", () => {
      this.view?.webview.postMessage({ type: "status", connected: false });
    });
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.getHtml();

    view.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "send") {
        this.wsClient.sendCommand(msg.text);
      }
      if (msg.type === "accept" || msg.type === "reject") {
        this.wsClient.sendCommand(msg.type === "accept" ? "y" : "n");
      }
    });
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: var(--vscode-editor-font-family); font-size: 12px; padding: 0; margin: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); display: flex; flex-direction: column; height: 100vh; }
    #messages { flex: 1; overflow-y: auto; padding: 8px; }
    .msg { margin: 4px 0; padding: 6px 10px; border-radius: 6px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
    .msg.wa { background: rgba(37,211,102,0.1); border-left: 2px solid #25D366; }
    .msg.cc { background: var(--vscode-editor-inactiveSelectionBackground); }
    .msg.decision { background: rgba(244,63,94,0.1); border-left: 2px solid #f43f5e; }
    .msg.error { background: rgba(239,68,68,0.1); border-left: 2px solid #ef4444; }
    .msg.status { opacity: 0.6; font-style: italic; }
    .source { font-size: 10px; opacity: 0.6; margin-bottom: 2px; }
    .actions { display: flex; gap: 6px; margin-top: 6px; }
    .actions button { padding: 3px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600; }
    .btn-accept { background: rgba(37,211,102,0.2); color: #25D366; }
    .btn-reject { background: rgba(244,63,94,0.15); color: #f43f5e; }
    #input-bar { display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--vscode-panel-border); }
    #input-bar input { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 6px; border-radius: 4px; font-family: inherit; }
    #input-bar button { padding: 6px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; }
    #status-bar { padding: 4px 8px; font-size: 10px; text-align: center; border-bottom: 1px solid var(--vscode-panel-border); }
    #status-bar.connected { color: #25D366; }
    #status-bar.disconnected { color: #f43f5e; }
  </style>
</head>
<body>
  <div id="status-bar" class="disconnected">Disconnected</div>
  <div id="messages"></div>
  <div id="input-bar">
    <input id="input" placeholder="Type here to take over from phone..." />
    <button id="send">Send</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById("messages");
    const inputEl = document.getElementById("input");
    const statusEl = document.getElementById("status-bar");

    document.getElementById("send").addEventListener("click", send);
    inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });

    function send() {
      const text = inputEl.value.trim();
      if (!text) return;
      vscode.postMessage({ type: "send", text });
      addMessage("You", text, "wa");
      inputEl.value = "";
    }

    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (msg.type === "status") {
        statusEl.textContent = msg.connected ? "Connected" : "Disconnected";
        statusEl.className = msg.connected ? "connected" : "disconnected";
      }
      if (msg.type === "envelope") {
        const env = msg.data;
        const sourceLabel = env.source === "whatsapp" ? "WhatsApp" : env.source === "claude-code" ? "Claude Code" : "VS Code";
        const cls = env.type === "decision" ? "decision" : env.type === "error" ? "error" : env.type === "status" ? "status" : "cc";
        addMessage(env.payload.sessionName || env.source, env.payload.text, cls);

        if (env.type === "decision") {
          const el = messagesEl.lastElementChild;
          const actions = document.createElement("div");
          actions.className = "actions";
          const acceptBtn = document.createElement("button");
          acceptBtn.className = "btn-accept";
          acceptBtn.textContent = "Accept";
          acceptBtn.addEventListener("click", () => vscode.postMessage({type:"accept"}));
          const rejectBtn = document.createElement("button");
          rejectBtn.className = "btn-reject";
          rejectBtn.textContent = "Reject";
          rejectBtn.addEventListener("click", () => vscode.postMessage({type:"reject"}));
          actions.appendChild(acceptBtn);
          actions.appendChild(rejectBtn);
          el.appendChild(actions);
        }
      }
    });

    function addMessage(source, text, cls) {
      const div = document.createElement("div");
      div.className = "msg " + cls;
      const sourceDiv = document.createElement("div");
      sourceDiv.className = "source";
      sourceDiv.textContent = source;
      div.appendChild(sourceDiv);
      div.appendChild(document.createTextNode(text || ""));
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  </script>
</body>
</html>`;
  }
}
