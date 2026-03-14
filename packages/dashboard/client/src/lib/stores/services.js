import { writable } from 'svelte/store';
import { onMessage } from './websocket.js';

export const services = writable({
  agent: { status: 'stopped' },
  bridge: { status: 'stopped' },
  tunnel: { status: 'stopped' },
});

// Subscribe to WebSocket status updates
onMessage('status', (data) => {
  services.update(s => ({ ...s, [data.name]: data }));
});

// REST fallback — poll every 5s
export async function pollServices() {
  try {
    const res = await fetch('/api/services');
    const data = await res.json();
    services.set(data);
  } catch {}
}

export async function serviceAction(name, action) {
  const res = await fetch(`/api/services/${name}/${action}`, { method: 'POST' });
  const data = await res.json();
  if (data.status) {
    services.update(s => ({ ...s, [name]: data.status }));
  }
  return data;
}
