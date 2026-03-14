import { writable, derived } from 'svelte/store';
import { onMessage } from './websocket.js';

const MAX_LOGS = 500;

export const logBuffer = writable([]);
export const logFilter = writable('all'); // 'all' | 'agent' | 'bridge'

export const filteredLogs = derived(
  [logBuffer, logFilter],
  ([$logs, $filter]) => {
    if ($filter === 'all') return $logs;
    return $logs.filter(l => (l.service || '').toLowerCase() === $filter);
  }
);

onMessage('history', (lines) => {
  logBuffer.set(Array.isArray(lines) ? lines.slice(-MAX_LOGS) : []);
});

onMessage('log', (line) => {
  logBuffer.update(buf => {
    const next = [...buf, line];
    return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
  });
});

export function clearLogs() {
  logBuffer.set([]);
}
