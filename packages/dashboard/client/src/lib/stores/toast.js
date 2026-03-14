import { writable } from 'svelte/store';

export const toasts = writable([]);

let nextId = 0;

export function showToast(message, duration = 3000) {
  const id = nextId++;
  toasts.update(t => [...t, { id, message }]);
  setTimeout(() => {
    toasts.update(t => t.filter(x => x.id !== id));
  }, duration);
}
