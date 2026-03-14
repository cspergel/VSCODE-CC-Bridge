import { writable, get } from 'svelte/store';
import { onMessage } from './websocket.js';
import { showToast } from './toast.js';

export const sessions = writable([]);
export const activeSessionId = writable(null);

// WebSocket pushes
onMessage('sessions_update', (data) => {
  if (data?.sessions) {
    sessions.set(data.sessions);
    // Auto-set active if none
    const current = get(activeSessionId);
    if (!current && data.sessions.length > 0) {
      const active = data.sessions.find(s => s.isWhatsAppActive) || data.sessions[0];
      activeSessionId.set(active.id);
    }
  }
});

export async function fetchSessions() {
  try {
    const res = await fetch('/api/sessions');
    const data = await res.json();
    sessions.set(data || []);
    return data;
  } catch {
    showToast('Failed to load sessions');
    return [];
  }
}

export async function createSession(name, projectPath) {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, projectPath }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create session');
  }
  const session = await res.json();
  await fetchSessions();
  activeSessionId.set(session.id);
  return session;
}

export async function deleteSession(nameOrId) {
  await fetch(`/api/sessions/${encodeURIComponent(nameOrId)}`, { method: 'DELETE' });
  await fetchSessions();
}

export async function activateSession(nameOrId) {
  const res = await fetch(`/api/sessions/${encodeURIComponent(nameOrId)}/activate`, { method: 'POST' });
  const session = await res.json();
  activeSessionId.set(session.id);
  return session;
}
