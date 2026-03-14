import { writable, get } from 'svelte/store';

export const wsConnected = writable(false);

let ws = null;
let reconnectTimer = null;
const listeners = new Map(); // type -> Set<callback>

export function onMessage(type, callback) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(callback);
  return () => listeners.get(type)?.delete(callback);
}

function dispatch(type, data) {
  const cbs = listeners.get(type);
  if (cbs) cbs.forEach(cb => cb(data));
}

export function connect() {
  if (ws && ws.readyState <= 1) return; // CONNECTING or OPEN

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws`);

  ws.onopen = () => {
    wsConnected.set(true);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      dispatch(msg.type, msg.data);
    } catch {}
  };

  ws.onclose = () => {
    wsConnected.set(false);
    ws = null;
    reconnectTimer = setTimeout(connect, 2000);
  };

  ws.onerror = () => {};
}

export function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function sendTerminalInput(sessionId, data) {
  send({ type: 'terminal_input', sessionId, data });
}

export function sendTerminalResize(sessionId, cols, rows) {
  send({ type: 'terminal_resize', sessionId, cols, rows });
}
