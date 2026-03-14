import { writable, get } from 'svelte/store';
import { onMessage } from './websocket.js';
import { activeSessionId } from './sessions.js';
import { fontSize } from './preferences.js';

// Map of sessionId -> { term, fitAddon, name }
// Not reactive (xterm instances are mutable objects) — use a plain Map
export const terminalInstances = new Map();

// Buffer for terminal data that arrives before a TerminalPane mounts
// sessionId -> string[]
export const pendingDataBuffers = new Map();

// Track which sessions have received data (for lazy terminal creation)
export const terminalData = writable(new Map()); // sessionId -> true

onMessage('terminal_data', (data) => {
  const { sessionId, data: text } = data;

  // Signal that this session has data
  terminalData.update(m => {
    const next = new Map(m);
    next.set(sessionId, true);
    return next;
  });

  // Write to terminal if it exists, otherwise buffer
  const entry = terminalInstances.get(sessionId);
  if (entry) {
    entry.term.write(text);
  } else {
    // Buffer data until TerminalPane mounts and can replay it
    if (!pendingDataBuffers.has(sessionId)) {
      pendingDataBuffers.set(sessionId, []);
    }
    pendingDataBuffers.get(sessionId).push(text);
  }

  // Auto-set active session on first data
  const current = get(activeSessionId);
  if (!current) {
    activeSessionId.set(sessionId);
  }
});

export function getTerminal(sessionId) {
  return terminalInstances.get(sessionId) || null;
}
