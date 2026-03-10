import { EventEmitter } from "events";

export class BridgeWSClient extends EventEmitter {
  connect(_port?: number): void {}
  disconnect(): void {}
  sendCommand(_text: string): void {}
  setSessionName(_name: string): void {}
  requestRouteHere(): void {}
  sendContext(_context: Record<string, unknown>): void {}
}
