import { BridgeWSClient } from "./ws-client";

export class GitWatcher {
  constructor(_wsClient: BridgeWSClient) {}
  async forceRefresh(): Promise<void> {}
  dispose(): void {}
}
