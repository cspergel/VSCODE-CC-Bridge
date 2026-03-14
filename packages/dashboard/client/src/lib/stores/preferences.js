import { writable } from 'svelte/store';

const KEYS = {
  fontSize: 'cc_fontSize',
  recentPaths: 'cc_recentPaths',
  cmdHistory: 'cc_cmdHistory',
  fabPosition: 'cc_fabPosition',
};

function persistedWritable(key, defaultValue) {
  let initial = defaultValue;
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) initial = JSON.parse(stored);
  } catch {}

  const store = writable(initial);

  store.subscribe(value => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  });

  return store;
}

export const fontSize = persistedWritable(KEYS.fontSize, 14);
export const recentPaths = persistedWritable(KEYS.recentPaths, []);
export const cmdHistory = persistedWritable(KEYS.cmdHistory, []);
export const fabPosition = persistedWritable(KEYS.fabPosition, null);
export const projectsDir = persistedWritable('cc_projectsDir', '');

export function addRecentPath(path, name) {
  recentPaths.update(list => {
    const filtered = list.filter(r => r.path !== path);
    filtered.unshift({ path, name: name || '' });
    return filtered.slice(0, 10);
  });
}
