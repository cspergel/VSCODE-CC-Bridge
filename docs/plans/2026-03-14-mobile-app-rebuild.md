# Claude Code Mobile — Full Svelte Rebuild

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the dashboard frontend from scratch as a mobile-first Svelte app that feels like a native Claude Code phone client — instant session switching, always-visible terminal input, live activity feed, and optional messaging integration.

**Architecture:** Svelte 5 + Vite, compiled to static files served by the existing Express backend. Bottom tab navigation (Terminal, Sessions, Activity, Settings). Svelte stores manage WebSocket connection, session state, logs, and preferences. xterm.js wrapped in a Svelte component for terminal rendering.

**Tech Stack:** Svelte 5 (runes), Vite 6, xterm.js 5.3, TypeScript (optional — `.js` with JSDoc is fine for speed)

**Base path:** `packages/dashboard/client/`

**Note:** No automated test framework — this is a UI app. Each task includes manual verification steps.

---

## Directory Structure

```
packages/dashboard/
  client/                         # NEW — Svelte frontend
    src/
      lib/
        components/
          AppShell.svelte          # Tab bar + view container
          TabBar.svelte            # Bottom navigation
          Header.svelte            # Top status bar
          Toast.svelte             # Toast notifications
          StatusDot.svelte         # Colored status indicator
          HapticButton.svelte      # Button with haptic feedback
        terminal/
          TerminalView.svelte      # Main terminal tab
          TerminalPane.svelte      # xterm.js wrapper
          InputBar.svelte          # Always-visible command input
          QuickActions.svelte      # Context-aware action chips
          TerminalControls.svelte  # Font ±, select, keyboard, scroll
          SelectOverlay.svelte     # Text selection mode
        sessions/
          SessionsView.svelte      # Sessions tab
          SessionCard.svelte       # Individual session card
          FolderBrowser.svelte     # Browse local folders
          CreateSession.svelte     # New session flow
        activity/
          ActivityView.svelte      # Activity tab (logs/services/audit)
          LogStream.svelte         # Real-time log feed
          ServiceCard.svelte       # Service status + controls
          AuditList.svelte         # Audit event list
        settings/
          SettingsView.svelte      # Settings tab
          MessagingToggle.svelte   # WhatsApp/Telegram controls
        stores/
          websocket.js             # WebSocket connection store
          sessions.js              # Session state store
          terminal.js              # Terminal instances store
          logs.js                  # Log buffer store
          services.js              # Service status store
          preferences.js           # User preferences (localStorage)
          toast.js                 # Toast notification store
        utils/
          haptics.js               # Vibration patterns
          format.js                # Time, duration, truncate helpers
          platform.js              # iOS/Android detection
      App.svelte                   # Root — mounts AppShell
      main.js                      # Entry point
      app.css                      # Global styles + design tokens
    public/
      manifest.json                # PWA manifest (copy from old)
      icons/                       # App icons (copy from old)
      sw.js                        # Service worker
    index.html                     # Vite HTML entry
    vite.config.js
    package.json
  src/                             # Existing backend (unchanged)
  public/                          # Old frontend (kept as backup)
```

---

## Phase 1: Project Scaffold & Design System

### Task 1: Initialize Svelte + Vite project

**Files:**
- Create: `client/package.json`
- Create: `client/vite.config.js`
- Create: `client/index.html`
- Create: `client/src/main.js`
- Create: `client/src/App.svelte`

**Step 1: Create package.json**

```json
{
  "name": "@live-bridge/dashboard-client",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^4.0.0",
    "svelte": "^5.0.0",
    "vite": "^6.0.0"
  },
  "dependencies": {
    "xterm": "^5.3.0",
    "xterm-addon-fit": "^0.8.0"
  }
}
```

**Step 2: Create vite.config.js**

```js
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
```

**Step 3: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#0d1117">
  <title>Claude Code</title>
  <link rel="manifest" href="/manifest.json">
  <link rel="icon" href="/icons/icon-192.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/icons/icon-192.svg">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

**Step 4: Create main.js and App.svelte**

`client/src/main.js`:
```js
import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

const app = mount(App, { target: document.getElementById('app') });

export default app;
```

`client/src/App.svelte`:
```svelte
<script>
  import AppShell from './lib/components/AppShell.svelte';
</script>

<AppShell />
```

**Step 5: Install dependencies and verify**

```bash
cd packages/dashboard/client
npm install
npm run dev
```

**Verify:** Browser opens at localhost:5173, shows blank page with no errors in console.

**Step 6: Commit**

```bash
git add packages/dashboard/client/
git commit -m "feat: scaffold Svelte + Vite frontend project"
```

---

### Task 2: Design system — global CSS tokens and base styles

**Files:**
- Create: `client/src/app.css`

**Step 1: Write the design system**

```css
/* === RESET === */
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  /* Colors — dark theme */
  --bg: #0d1117;
  --surface: #161b22;
  --surface-raised: #1c2129;
  --border: #30363d;
  --border-subtle: rgba(255,255,255,0.06);
  --text: #e6edf3;
  --text-secondary: #8b949e;
  --text-tertiary: #6e7681;
  --accent: #58a6ff;
  --accent-subtle: rgba(88,166,255,0.15);
  --green: #3fb950;
  --green-subtle: rgba(63,185,80,0.15);
  --red: #f85149;
  --red-subtle: rgba(248,81,73,0.15);
  --yellow: #d29922;
  --yellow-subtle: rgba(210,153,34,0.15);
  --orange: #db6d28;

  /* Spacing — 4px base */
  --s1: 4px;
  --s2: 8px;
  --s3: 12px;
  --s4: 16px;
  --s5: 20px;
  --s6: 24px;
  --s8: 32px;
  --s10: 40px;
  --s12: 48px;

  /* Typography */
  --font-sans: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'SF Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  --text-xs: 11px;
  --text-sm: 13px;
  --text-base: 15px;
  --text-lg: 17px;
  --text-xl: 20px;
  --text-2xl: 24px;

  /* Radii */
  --r-sm: 6px;
  --r-md: 10px;
  --r-lg: 14px;
  --r-xl: 20px;
  --r-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.5);

  /* Z layers */
  --z-base: 1;
  --z-controls: 10;
  --z-header: 20;
  --z-tabbar: 30;
  --z-overlay: 40;
  --z-modal: 50;
  --z-toast: 60;

  /* Animation */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-in-out: cubic-bezier(0.45, 0, 0.55, 1);
  --duration-fast: 120ms;
  --duration-normal: 200ms;
  --duration-slow: 350ms;

  /* Touch */
  --touch-min: 44px;

  /* Safe areas */
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-right, 0px);

  /* Layout */
  --header-h: 48px;
  --tabbar-h: calc(52px + var(--safe-bottom));
  --input-h: 52px;
}

body {
  font-family: var(--font-sans);
  font-size: var(--text-base);
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
  overscroll-behavior: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-text-size-adjust: 100%;
  -webkit-font-smoothing: antialiased;
}

/* Utility classes */
.sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0,0,0,0); border: 0;
}

/* Scrollbar styling */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
```

**Verify:** Page has dark background, correct fonts rendering.

**Step 2: Commit**

```bash
git add client/src/app.css
git commit -m "feat: add design system tokens and base styles"
```

---

### Task 3: Utility modules — haptics, formatting, platform detection

**Files:**
- Create: `client/src/lib/utils/haptics.js`
- Create: `client/src/lib/utils/format.js`
- Create: `client/src/lib/utils/platform.js`

**Step 1: Write haptics.js**

```js
/** Haptic feedback patterns */
export function haptic(type = 'light') {
  if (!navigator.vibrate) return;
  switch (type) {
    case 'light':  navigator.vibrate(10); break;
    case 'medium': navigator.vibrate(20); break;
    case 'heavy':  navigator.vibrate(40); break;
    case 'double': navigator.vibrate([15, 50, 15]); break;
    case 'success': navigator.vibrate([10, 30, 10, 30, 10]); break;
    case 'error':  navigator.vibrate([50, 30, 50]); break;
  }
}
```

**Step 2: Write format.js**

```js
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '\u2026' : str;
}

export function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function shortId(id) {
  if (!id) return '';
  if (id.length > 20 && id.includes('-')) return id.slice(0, 8);
  return id;
}

export function folderName(path) {
  if (!path) return '';
  return path.split(/[/\\]/).filter(Boolean).pop() || path;
}
```

**Step 3: Write platform.js**

```js
const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

export const isIOS = /iPhone|iPad|iPod/.test(ua);
export const isAndroid = /Android/.test(ua);
export const isMobile = isIOS || isAndroid || (typeof window !== 'undefined' && window.innerWidth <= 768);
export const isSafari = isIOS && /WebKit/.test(ua) && !/CriOS/.test(ua);
export const isPWA = typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
   window.navigator.standalone === true);
```

**Verify:** Import these in App.svelte temporarily, confirm no errors.

**Step 4: Commit**

```bash
git add client/src/lib/utils/
git commit -m "feat: add utility modules (haptics, format, platform)"
```

---

## Phase 2: Stores & WebSocket

### Task 4: Preferences store (localStorage)

**Files:**
- Create: `client/src/lib/stores/preferences.js`

**Step 1: Write the store**

```js
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

export function addRecentPath(path, name) {
  recentPaths.update(list => {
    const filtered = list.filter(r => r.path !== path);
    filtered.unshift({ path, name: name || '' });
    return filtered.slice(0, 10);
  });
}
```

**Verify:** Import in App.svelte, check localStorage updates.

**Step 2: Commit**

```bash
git add client/src/lib/stores/preferences.js
git commit -m "feat: add preferences store with localStorage persistence"
```

---

### Task 5: Toast store

**Files:**
- Create: `client/src/lib/stores/toast.js`

**Step 1: Write the store**

```js
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
```

**Step 2: Commit**

```bash
git add client/src/lib/stores/toast.js
git commit -m "feat: add toast notification store"
```

---

### Task 6: WebSocket store

**Files:**
- Create: `client/src/lib/stores/websocket.js`

**Step 1: Write the store**

```js
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
```

**Step 2: Commit**

```bash
git add client/src/lib/stores/websocket.js
git commit -m "feat: add WebSocket connection store"
```

---

### Task 7: Services store

**Files:**
- Create: `client/src/lib/stores/services.js`

**Step 1: Write the store**

```js
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
```

**Step 2: Commit**

```bash
git add client/src/lib/stores/services.js
git commit -m "feat: add services status store"
```

---

### Task 8: Logs store

**Files:**
- Create: `client/src/lib/stores/logs.js`

**Step 1: Write the store**

```js
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
```

**Step 2: Commit**

```bash
git add client/src/lib/stores/logs.js
git commit -m "feat: add log buffer store with filtering"
```

---

### Task 9: Sessions store

**Files:**
- Create: `client/src/lib/stores/sessions.js`

**Step 1: Write the store**

```js
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
```

**Step 2: Commit**

```bash
git add client/src/lib/stores/sessions.js
git commit -m "feat: add sessions store with CRUD operations"
```

---

### Task 10: Terminal instances store

**Files:**
- Create: `client/src/lib/stores/terminal.js`

**Step 1: Write the store**

```js
import { writable, get } from 'svelte/store';
import { onMessage } from './websocket.js';
import { activeSessionId } from './sessions.js';
import { fontSize } from './preferences.js';

// Map of sessionId -> { term, fitAddon, name }
// Not reactive (xterm instances are mutable objects) — use a plain Map
export const terminalInstances = new Map();

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

  // Write to terminal if it exists
  const entry = terminalInstances.get(sessionId);
  if (entry) {
    entry.term.write(text);
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
```

**Step 2: Commit**

```bash
git add client/src/lib/stores/terminal.js
git commit -m "feat: add terminal instances store"
```

---

## Phase 3: App Shell & Navigation

### Task 11: TabBar component

**Files:**
- Create: `client/src/lib/components/TabBar.svelte`

**Step 1: Write the component**

```svelte
<script>
  import { haptic } from '../utils/haptics.js';

  let { activeTab = 'terminal', onSwitch } = $props();

  const tabs = [
    { id: 'terminal', label: 'Terminal', icon: '>' },
    { id: 'sessions', label: 'Sessions', icon: '\u2630' },
    { id: 'activity', label: 'Activity', icon: '\u25C9' },
    { id: 'settings', label: 'Settings', icon: '\u2699' },
  ];

  function switchTab(id) {
    if (id === activeTab) return;
    haptic('light');
    onSwitch?.(id);
  }
</script>

<nav class="tabbar">
  {#each tabs as tab}
    <button
      class="tab"
      class:active={activeTab === tab.id}
      onclick={() => switchTab(tab.id)}
    >
      <span class="tab-icon">{tab.icon}</span>
      <span class="tab-label">{tab.label}</span>
    </button>
  {/each}
</nav>

<style>
  .tabbar {
    display: flex;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: var(--tabbar-h);
    background: var(--surface);
    border-top: 1px solid var(--border);
    z-index: var(--z-tabbar);
    padding-bottom: var(--safe-bottom);
    -webkit-tap-highlight-color: transparent;
  }

  .tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    background: none;
    border: none;
    color: var(--text-tertiary);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: color var(--duration-fast);
    padding: var(--s1) 0;
    position: relative;
    min-height: var(--touch-min);
  }

  .tab.active {
    color: var(--accent);
  }

  .tab-icon {
    font-size: 20px;
    line-height: 1;
  }

  .tab-label {
    font-size: var(--text-xs);
    font-weight: 500;
  }

  .tab.active::before {
    content: '';
    position: absolute;
    top: 0;
    left: 25%;
    right: 25%;
    height: 2px;
    background: var(--accent);
    border-radius: 0 0 2px 2px;
  }
</style>
```

**Verify:** Renders 4 tabs at bottom of screen, tap switches active state.

**Step 2: Commit**

```bash
git add client/src/lib/components/TabBar.svelte
git commit -m "feat: add bottom tab bar navigation"
```

---

### Task 12: Header component

**Files:**
- Create: `client/src/lib/components/Header.svelte`

**Step 1: Write the component**

```svelte
<script>
  import { activeSessionId, sessions } from '../stores/sessions.js';
  import { services } from '../stores/services.js';
  import { wsConnected } from '../stores/websocket.js';
  import { shortId, folderName } from '../utils/format.js';

  let { title = '' } = $props();

  let sessionName = $derived.by(() => {
    const id = $activeSessionId;
    if (!id) return 'No session';
    const s = $sessions.find(s => s.id === id);
    if (s?.name) return s.name;
    return shortId(id);
  });

  let agentStatus = $derived($services.agent?.status || 'stopped');
  let connected = $derived($wsConnected);
</script>

<header class="header">
  <div class="header-left">
    <span class="status-dot {agentStatus}" class:disconnected={!connected}></span>
    <span class="header-title">{title || sessionName}</span>
  </div>
  <div class="header-right">
    {#if !connected}
      <span class="conn-label">Reconnecting\u2026</span>
    {/if}
  </div>
</header>

<style>
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--header-h);
    padding: 0 var(--s4);
    padding-top: var(--safe-top);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    z-index: var(--z-header);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--s2);
    min-width: 0;
  }

  .header-title {
    font-size: var(--text-base);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--text-tertiary);
    transition: background var(--duration-fast);
  }

  .status-dot.running { background: var(--green); }
  .status-dot.starting { background: var(--yellow); animation: pulse 2s infinite; }
  .status-dot.error { background: var(--red); }
  .status-dot.disconnected { background: var(--red); animation: pulse 1s infinite; }

  .header-right {
    display: flex;
    align-items: center;
    gap: var(--s2);
  }

  .conn-label {
    font-size: var(--text-xs);
    color: var(--red);
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
</style>
```

**Step 2: Commit**

```bash
git add client/src/lib/components/Header.svelte
git commit -m "feat: add header component with session status"
```

---

### Task 13: Toast component

**Files:**
- Create: `client/src/lib/components/Toast.svelte`

**Step 1: Write the component**

```svelte
<script>
  import { toasts } from '../stores/toast.js';
</script>

{#if $toasts.length > 0}
  <div class="toast-container">
    {#each $toasts as toast (toast.id)}
      <div class="toast" transition:fly={{ y: -20, duration: 200 }}>
        {toast.message}
      </div>
    {/each}
  </div>
{/if}

<script context="module">
  import { fly } from 'svelte/transition';
</script>

<style>
  .toast-container {
    position: fixed;
    top: calc(var(--s4) + var(--safe-top));
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-toast);
    display: flex;
    flex-direction: column;
    gap: var(--s2);
    pointer-events: none;
  }

  .toast {
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: var(--s2) var(--s4);
    font-size: var(--text-sm);
    color: var(--text);
    box-shadow: var(--shadow-md);
    pointer-events: auto;
    white-space: nowrap;
  }
</style>
```

**Step 2: Commit**

```bash
git add client/src/lib/components/Toast.svelte
git commit -m "feat: add toast notification component"
```

---

### Task 14: AppShell — wire it all together

**Files:**
- Create: `client/src/lib/components/AppShell.svelte`

**Step 1: Write the component**

```svelte
<script>
  import Header from './Header.svelte';
  import TabBar from './TabBar.svelte';
  import Toast from './Toast.svelte';
  import { connect } from '../stores/websocket.js';
  import { pollServices } from '../stores/services.js';
  import { fetchSessions } from '../stores/sessions.js';
  import { onMount } from 'svelte';

  let activeTab = $state('terminal');

  function handleSwitch(tab) {
    activeTab = tab;
  }

  const TAB_TITLES = {
    terminal: '',
    sessions: 'Sessions',
    activity: 'Activity',
    settings: 'Settings',
  };

  onMount(() => {
    connect();
    fetchSessions();
    pollServices();
    // Poll services every 5s as fallback
    const interval = setInterval(pollServices, 5000);
    return () => clearInterval(interval);
  });
</script>

<div class="app-shell">
  <Header title={TAB_TITLES[activeTab]} />

  <main class="app-content">
    {#if activeTab === 'terminal'}
      <div class="view">
        <p style="padding: var(--s4); color: var(--text-secondary);">Terminal view — coming in Phase 4</p>
      </div>
    {:else if activeTab === 'sessions'}
      <div class="view">
        <p style="padding: var(--s4); color: var(--text-secondary);">Sessions view — coming in Phase 5</p>
      </div>
    {:else if activeTab === 'activity'}
      <div class="view">
        <p style="padding: var(--s4); color: var(--text-secondary);">Activity view — coming in Phase 6</p>
      </div>
    {:else if activeTab === 'settings'}
      <div class="view">
        <p style="padding: var(--s4); color: var(--text-secondary);">Settings view — coming in Phase 7</p>
      </div>
    {/if}
  </main>

  <TabBar {activeTab} onSwitch={handleSwitch} />
  <Toast />
</div>

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
  }

  .app-content {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
    padding-bottom: var(--tabbar-h);
  }

  .view {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
</style>
```

**Verify:** Full app shell renders — header at top with status dot, placeholder content in middle, 4-tab bar at bottom. Tabs switch, WebSocket connects, services poll. Toasts work (import `showToast` in console to test).

**Step 2: Commit**

```bash
git add client/src/lib/components/AppShell.svelte client/src/App.svelte
git commit -m "feat: wire up app shell with header, tabs, toast, stores"
```

---

## Phase 4: Terminal View

### Task 15: TerminalPane — xterm.js Svelte wrapper

**Files:**
- Create: `client/src/lib/terminal/TerminalPane.svelte`

**Step 1: Write the component**

```svelte
<script>
  import { onMount, onDestroy } from 'svelte';
  import { Terminal } from 'xterm';
  import { FitAddon } from 'xterm-addon-fit';
  import 'xterm/css/xterm.css';
  import { sendTerminalInput, sendTerminalResize } from '../stores/websocket.js';
  import { terminalInstances } from '../stores/terminal.js';
  import { fontSize } from '../stores/preferences.js';

  let { sessionId, active = false } = $props();

  let containerEl;
  let term;
  let fitAddon;
  let resizeObserver;

  onMount(() => {
    const currentSize = $fontSize || 14;

    term = new Terminal({
      cursorBlink: true,
      fontSize: currentSize,
      fontFamily: "'SF Mono', 'Cascadia Code', 'JetBrains Mono', monospace",
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        selectionBackground: 'rgba(88,166,255,0.3)',
      },
      scrollback: 5000,
      allowProposedApi: true,
    });

    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerEl);

    // Send keystrokes
    term.onData((data) => {
      if (active) sendTerminalInput(sessionId, data);
    });

    // Send resize
    term.onResize((size) => {
      if (active) sendTerminalResize(sessionId, size.cols, size.rows);
    });

    // Register in global map
    terminalInstances.set(sessionId, { term, fitAddon, name: sessionId });

    // Fit on container resize
    resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try { fitAddon.fit(); } catch {}
      });
    });
    resizeObserver.observe(containerEl);

    // Initial fit
    requestAnimationFrame(() => {
      try { fitAddon.fit(); } catch {}
    });
  });

  onDestroy(() => {
    if (resizeObserver) resizeObserver.disconnect();
    terminalInstances.delete(sessionId);
    if (term) term.dispose();
  });

  // React to fontSize changes
  $effect(() => {
    const size = $fontSize;
    if (term && size && term.options.fontSize !== size) {
      term.options.fontSize = size;
      try { fitAddon.fit(); } catch {}
    }
  });

  // Refit when becoming active
  $effect(() => {
    if (active && fitAddon) {
      requestAnimationFrame(() => {
        try {
          fitAddon.fit();
          if (term) {
            sendTerminalResize(sessionId, term.cols, term.rows);
          }
        } catch {}
      });
    }
  });
</script>

<div class="terminal-pane" class:active bind:this={containerEl}></div>

<style>
  .terminal-pane {
    width: 100%;
    height: 100%;
    display: none;
  }

  .terminal-pane.active {
    display: block;
  }

  .terminal-pane :global(.xterm) {
    height: 100%;
    padding: 2px;
  }

  .terminal-pane :global(.xterm-viewport) {
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    scroll-behavior: smooth;
  }

  .terminal-pane :global(.xterm-viewport::-webkit-scrollbar) {
    width: 3px;
  }

  .terminal-pane :global(.xterm-viewport::-webkit-scrollbar-thumb) {
    background: var(--border);
    border-radius: 2px;
  }
</style>
```

**Step 2: Commit**

```bash
git add client/src/lib/terminal/TerminalPane.svelte
git commit -m "feat: add xterm.js Svelte wrapper component"
```

---

### Task 16: InputBar — always-visible command input

**Files:**
- Create: `client/src/lib/terminal/InputBar.svelte`

**Step 1: Write the component**

```svelte
<script>
  import { sendTerminalInput } from '../stores/websocket.js';
  import { activeSessionId } from '../stores/sessions.js';
  import { cmdHistory } from '../stores/preferences.js';
  import { haptic } from '../utils/haptics.js';
  import { showToast } from '../stores/toast.js';

  let inputEl;
  let text = $state('');
  let historyIndex = $state(-1);
  let draft = $state('');

  function send() {
    if (!text.trim()) return;
    const sid = $activeSessionId;
    if (!sid) {
      showToast('No active session');
      return;
    }

    // Add to history
    cmdHistory.update(h => {
      const next = [...h];
      if (next[next.length - 1] !== text) next.push(text);
      return next.slice(-50);
    });

    haptic('light');
    sendTerminalInput(sid, text + '\r');
    text = '';
    historyIndex = -1;

    // Blur on mobile to dismiss keyboard
    if (window.innerWidth <= 768 && inputEl) inputEl.blur();
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
    if (e.key === 'ArrowUp' && !text) {
      e.preventDefault();
      const h = $cmdHistory;
      if (h.length === 0) return;
      if (historyIndex === -1) { draft = text; historyIndex = h.length - 1; }
      else if (historyIndex > 0) historyIndex--;
      text = h[historyIndex] || '';
    }
    if (e.key === 'ArrowDown' && historyIndex >= 0) {
      e.preventDefault();
      const h = $cmdHistory;
      if (historyIndex < h.length - 1) { historyIndex++; text = h[historyIndex]; }
      else { historyIndex = -1; text = draft; }
    }
  }
</script>

<div class="input-bar">
  <input
    bind:this={inputEl}
    bind:value={text}
    onkeydown={handleKeydown}
    type="text"
    placeholder="Type a command\u2026"
    autocomplete="off"
    autocorrect="off"
    autocapitalize="off"
    spellcheck="false"
  />
  <button class="send-btn" onclick={send} disabled={!text.trim()}>
    &#x27A4;
  </button>
</div>

<style>
  .input-bar {
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: var(--s2) var(--s3);
    background: var(--surface);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  input {
    flex: 1;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: var(--s2) var(--s3);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    min-height: 40px;
    outline: none;
    -webkit-appearance: none;
  }

  input:focus {
    border-color: var(--accent);
  }

  input::placeholder {
    color: var(--text-tertiary);
  }

  .send-btn {
    width: 40px;
    height: 40px;
    border-radius: var(--r-md);
    background: var(--accent);
    color: #fff;
    border: none;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: opacity var(--duration-fast);
  }

  .send-btn:disabled {
    opacity: 0.4;
  }

  .send-btn:active {
    transform: scale(0.93);
  }
</style>
```

**Step 2: Commit**

```bash
git add client/src/lib/terminal/InputBar.svelte
git commit -m "feat: add always-visible input bar with history"
```

---

### Task 17: QuickActions — context-aware action chips

**Files:**
- Create: `client/src/lib/terminal/QuickActions.svelte`

**Step 1: Write the component**

```svelte
<script>
  import { sendTerminalInput } from '../stores/websocket.js';
  import { activeSessionId } from '../stores/sessions.js';
  import { haptic } from '../utils/haptics.js';

  let { context = 'idle' } = $props();

  function act(data) {
    const sid = $activeSessionId;
    if (!sid) return;
    haptic('light');
    sendTerminalInput(sid, data);
  }

  const ACTIONS = {
    idle: [
      { label: '\u2191 History', action: () => {}, cls: '' },
      { label: 'Tab', action: () => act('\t'), cls: '' },
      { label: 'Clear', action: () => act('clear\r'), cls: '' },
    ],
    approval: [
      { label: '\u2713 Yes', action: () => act('y\r'), cls: 'green' },
      { label: '\u2717 No', action: () => act('n\r'), cls: 'red' },
      { label: '\u2303C', action: () => act('\x03'), cls: 'yellow' },
    ],
    running: [
      { label: '\u23F9 Stop', action: () => act('\x03'), cls: 'red' },
    ],
    picker: [
      { label: '\u2191', action: () => act('\x1b[A'), cls: '' },
      { label: '\u2193', action: () => act('\x1b[B'), cls: '' },
      { label: 'Select', action: () => act('\r'), cls: 'green' },
      { label: 'Cancel', action: () => act('\x03'), cls: 'red' },
    ],
  };

  let buttons = $derived(ACTIONS[context] || ACTIONS.idle);
</script>

<div class="quick-actions">
  {#each buttons as btn}
    <button class="chip {btn.cls}" onclick={btn.action}>{btn.label}</button>
  {/each}
</div>

<style>
  .quick-actions {
    display: flex;
    gap: var(--s1);
    padding: var(--s1) var(--s3);
    overflow-x: auto;
    scrollbar-width: none;
    flex-shrink: 0;
  }
  .quick-actions::-webkit-scrollbar { display: none; }

  .chip {
    padding: var(--s1) var(--s3);
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--r-full);
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    min-height: 30px;
    display: flex;
    align-items: center;
    transition: transform 50ms;
    -webkit-tap-highlight-color: transparent;
  }

  .chip:active { transform: scale(0.93); }
  .chip.green { color: var(--green); border-color: var(--green-subtle); }
  .chip.red { color: var(--red); border-color: var(--red-subtle); }
  .chip.yellow { color: var(--yellow); border-color: var(--yellow-subtle); }
</style>
```

**Step 2: Commit**

```bash
git add client/src/lib/terminal/QuickActions.svelte
git commit -m "feat: add context-aware quick action chips"
```

---

### Task 18: TerminalView — assemble terminal tab

**Files:**
- Create: `client/src/lib/terminal/TerminalView.svelte`

**Step 1: Write the component**

This is the main terminal tab. It manages terminal panes for each session, the input bar, and quick actions.

```svelte
<script>
  import TerminalPane from './TerminalPane.svelte';
  import InputBar from './InputBar.svelte';
  import QuickActions from './QuickActions.svelte';
  import { activeSessionId } from '../stores/sessions.js';
  import { terminalData } from '../stores/terminal.js';
  import { onMessage } from '../stores/websocket.js';
  import { onMount } from 'svelte';

  let context = $state('idle');
  let knownSessions = $state(new Set());

  // Track sessions that have sent terminal data
  $effect(() => {
    const dataMap = $terminalData;
    knownSessions = new Set(dataMap.keys());
  });

  // Context detection from terminal output
  onMount(() => {
    return onMessage('terminal_data', (data) => {
      if (data.sessionId !== $activeSessionId) return;
      const text = data.data;
      if (/\[Y\/n\]|\(y\/N\)|Allow|Approve|Confirm.*\?/i.test(text)) {
        context = 'approval';
      } else if (/[●◯◉].*│|❯.*│/.test(text)) {
        context = 'picker';
      } else if (/[❯$>]\s*$/.test(text)) {
        context = 'idle';
      } else {
        context = 'running';
      }
    });
  });
</script>

<div class="terminal-view">
  <div class="terminal-area">
    {#each [...knownSessions] as sid (sid)}
      <TerminalPane sessionId={sid} active={sid === $activeSessionId} />
    {/each}

    {#if knownSessions.size === 0}
      <div class="empty-state">
        <div class="empty-icon">&#x276F;_</div>
        <p>No active terminal</p>
        <p class="empty-hint">Switch to Sessions tab to connect to a repo</p>
      </div>
    {/if}
  </div>

  <QuickActions {context} />
  <InputBar />
</div>

<style>
  .terminal-view {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .terminal-area {
    flex: 1;
    min-height: 0;
    position: relative;
    background: #0d1117;
  }

  .empty-state {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--s2);
    color: var(--text-tertiary);
  }

  .empty-icon {
    font-size: 48px;
    font-family: var(--font-mono);
    opacity: 0.3;
  }

  .empty-hint {
    font-size: var(--text-sm);
  }
</style>
```

**Verify:** Terminal tab shows empty state. When backend sends terminal_data via WebSocket, a terminal pane appears and renders output. Input bar sends commands. Quick actions change based on output context.

**Step 2: Commit**

```bash
git add client/src/lib/terminal/TerminalView.svelte
git commit -m "feat: assemble terminal view with pane, input, quick actions"
```

---

## Phase 5: Sessions View

### Task 19: SessionCard component

**Files:**
- Create: `client/src/lib/sessions/SessionCard.svelte`

**Step 1: Write the component**

```svelte
<script>
  import { haptic } from '../utils/haptics.js';
  import { truncate, folderName } from '../utils/format.js';

  let { session, isActive = false, onSelect, onDelete } = $props();
  let swiped = $state(false);

  function select() {
    if (swiped) { swiped = false; return; }
    haptic('light');
    onSelect?.(session);
  }
</script>

<div class="card" class:active={isActive} onclick={select}>
  <div class="dot-wrap">
    <span class="dot {session.status || 'idle'}"></span>
  </div>
  <div class="info">
    <div class="name">{session.name || session.id}</div>
    <div class="path">{truncate(session.projectPath || '', 50)}</div>
  </div>
  <span class="status-badge {session.status || 'idle'}">{session.status || 'idle'}</span>
  <span class="arrow">&#x203A;</span>
</div>

<style>
  .card {
    display: flex;
    align-items: center;
    gap: var(--s3);
    padding: var(--s3) var(--s4);
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    margin-bottom: var(--s2);
    cursor: pointer;
    min-height: 68px;
    transition: border-color var(--duration-fast), background var(--duration-fast);
    -webkit-tap-highlight-color: transparent;
  }

  .card:active { background: var(--accent-subtle); }
  .card.active { border-left: 3px solid var(--accent); }

  .dot-wrap { width: 20px; flex-shrink: 0; display: flex; justify-content: center; }
  .dot {
    width: 12px; height: 12px; border-radius: 50%;
    background: var(--text-tertiary);
  }
  .dot.running { background: var(--green); }
  .dot.active { background: var(--green); }
  .dot.error { background: var(--red); }
  .dot.paused { background: var(--yellow); }

  .info { flex: 1; min-width: 0; }
  .name {
    font-size: var(--text-base); font-weight: 500;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .path {
    font-size: var(--text-xs); color: var(--text-tertiary);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    margin-top: 2px;
  }

  .status-badge {
    font-size: var(--text-xs); padding: 2px 8px;
    border-radius: var(--r-full); text-transform: uppercase;
    font-weight: 600; flex-shrink: 0;
  }
  .status-badge.running, .status-badge.active { background: var(--green-subtle); color: var(--green); }
  .status-badge.idle { background: var(--border); color: var(--text-tertiary); }
  .status-badge.error { background: var(--red-subtle); color: var(--red); }

  .arrow { font-size: 22px; color: var(--text-tertiary); flex-shrink: 0; }
</style>
```

**Step 2: Commit**

```bash
git add client/src/lib/sessions/SessionCard.svelte
git commit -m "feat: add session card component"
```

---

### Task 20: FolderBrowser component

**Files:**
- Create: `client/src/lib/sessions/FolderBrowser.svelte`

**Step 1: Write the component**

```svelte
<script>
  import { haptic } from '../utils/haptics.js';

  let { onSelect } = $props();
  let currentPath = $state('');
  let entries = $state([]);
  let segments = $state([]);
  let filter = $state('');
  let loading = $state(false);

  let filtered = $derived(
    filter
      ? entries.filter(e => e.name.toLowerCase().includes(filter.toLowerCase()))
      : entries
  );

  export async function browseTo(path) {
    loading = true;
    filter = '';
    try {
      const res = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      currentPath = data.current || path;
      entries = data.entries || [];
      segments = data.segments || [];
    } catch {
      entries = [];
    }
    loading = false;
  }

  function selectFolder(entry) {
    haptic('light');
    browseTo(entry.path);
    onSelect?.(entry.path);
  }

  function goUp() {
    if (segments.length > 1) {
      const parent = segments[segments.length - 2];
      browseTo(parent.path);
      onSelect?.(parent.path);
    }
  }

  function crumbNav(seg) {
    haptic('light');
    browseTo(seg.path);
    onSelect?.(seg.path);
  }

  // Start browsing
  import { onMount } from 'svelte';
  onMount(() => {
    const startPath = navigator.platform?.includes('Win') ? 'C:\\Users' : '/home';
    browseTo(startPath);
  });
</script>

<div class="browser">
  <div class="breadcrumbs">
    {#each segments as seg, i}
      {#if i > 0}<span class="sep">/</span>{/if}
      <button class="crumb" onclick={() => crumbNav(seg)}>{seg.name}</button>
    {/each}
  </div>

  <input
    class="filter"
    type="text"
    bind:value={filter}
    placeholder="Filter folders\u2026"
    autocomplete="off"
  />

  <div class="folder-list">
    {#if segments.length > 1}
      <button class="folder-item" onclick={goUp}>
        <span class="fi-icon">\u{1F4C1}</span>
        <span class="fi-name">..</span>
        <span class="fi-chevron">&#x203A;</span>
      </button>
    {/if}

    {#each filtered as entry}
      <button class="folder-item" class:git={entry.isGitRepo} onclick={() => selectFolder(entry)}>
        <span class="fi-icon">{entry.isGitRepo ? '\u{1F4E6}' : '\u{1F4C1}'}</span>
        <span class="fi-name">{entry.name}</span>
        <span class="fi-chevron">&#x203A;</span>
      </button>
    {/each}

    {#if filtered.length === 0 && !loading}
      <div class="empty">No folders found</div>
    {/if}
  </div>
</div>

<style>
  .browser {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    overflow: hidden;
  }

  .breadcrumbs {
    display: flex; align-items: center; gap: 2px;
    padding: var(--s2) var(--s3);
    border-bottom: 1px solid var(--border);
    overflow-x: auto; scrollbar-width: none;
    font-size: var(--text-sm);
  }
  .breadcrumbs::-webkit-scrollbar { display: none; }
  .crumb {
    background: none; border: none; color: var(--accent);
    padding: var(--s1) var(--s2); border-radius: var(--r-sm);
    cursor: pointer; white-space: nowrap; min-height: 32px;
    display: flex; align-items: center; font-size: var(--text-sm);
    font-family: var(--font-sans);
  }
  .crumb:active { background: var(--accent-subtle); }
  .sep { color: var(--text-tertiary); }

  .filter {
    width: 100%; background: var(--surface);
    color: var(--text); border: none;
    border-bottom: 1px solid var(--border);
    padding: var(--s2) var(--s3);
    font-size: var(--text-sm); outline: none;
    font-family: var(--font-sans);
    min-height: 40px;
  }
  .filter:focus { border-bottom-color: var(--accent); }
  .filter::placeholder { color: var(--text-tertiary); }

  .folder-list {
    max-height: 40vh; overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .folder-item {
    display: flex; align-items: center; gap: var(--s2);
    width: 100%; padding: var(--s3) var(--s4);
    background: none; border: none;
    border-bottom: 1px solid var(--border-subtle);
    cursor: pointer; min-height: 52px;
    font-size: var(--text-base); color: var(--text);
    font-family: var(--font-sans);
    text-align: left;
  }
  .folder-item:active { background: var(--accent-subtle); }
  .folder-item.git .fi-name { color: var(--accent); font-weight: 500; }
  .fi-icon { font-size: 18px; flex-shrink: 0; width: 24px; text-align: center; }
  .fi-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fi-chevron { font-size: 20px; color: var(--text-tertiary); flex-shrink: 0; }

  .empty { padding: var(--s6); text-align: center; color: var(--text-tertiary); font-size: var(--text-sm); }
</style>
```

**Step 2: Commit**

```bash
git add client/src/lib/sessions/FolderBrowser.svelte
git commit -m "feat: add folder browser with filter and breadcrumbs"
```

---

### Task 21: SessionsView — full sessions tab

**Files:**
- Create: `client/src/lib/sessions/SessionsView.svelte`

**Step 1: Write the component**

This combines the session list, recent projects, folder browser, and create-session flow into one tab.

```svelte
<script>
  import SessionCard from './SessionCard.svelte';
  import FolderBrowser from './FolderBrowser.svelte';
  import { sessions, activeSessionId, activateSession, createSession, fetchSessions, deleteSession } from '../stores/sessions.js';
  import { recentPaths, addRecentPath } from '../stores/preferences.js';
  import { showToast } from '../stores/toast.js';
  import { haptic } from '../utils/haptics.js';
  import { folderName, truncate } from '../utils/format.js';
  import { onMount } from 'svelte';

  let view = $state('list'); // 'list' | 'create'
  let selectedPath = $state('');
  let sessionName = $state('');
  let creating = $state(false);

  onMount(() => { fetchSessions(); });

  async function handleSelect(session) {
    try {
      await activateSession(session.id);
      showToast(`Switched to ${session.name || 'session'}`);
    } catch {
      showToast('Failed to switch session');
    }
  }

  async function handleCreate() {
    if (!selectedPath) { showToast('Select a folder first'); return; }
    creating = true;
    try {
      const s = await createSession(sessionName || folderName(selectedPath), selectedPath);
      addRecentPath(selectedPath, sessionName || s.name);
      showToast('Session created');
      haptic('success');
      view = 'list';
      sessionName = '';
      selectedPath = '';
    } catch (e) {
      showToast(e.message || 'Failed to create session');
      haptic('error');
    }
    creating = false;
  }

  function selectRecent(r) {
    haptic('light');
    selectedPath = r.path;
    sessionName = r.name || folderName(r.path);
    view = 'create';
  }
</script>

<div class="sessions-view">
  {#if view === 'list'}
    <div class="section">
      <div class="section-header">
        <h3>Active Sessions</h3>
        <button class="btn-primary" onclick={() => { view = 'create'; }}>+ New</button>
      </div>

      {#if $sessions.length === 0}
        <div class="empty">
          <p>No sessions yet</p>
          <p class="hint">Tap "+ New" to connect to a repo</p>
        </div>
      {:else}
        {#each $sessions as s (s.id)}
          <SessionCard
            session={s}
            isActive={s.id === $activeSessionId}
            onSelect={handleSelect}
          />
        {/each}
      {/if}
    </div>

    {#if $recentPaths.length > 0}
      <div class="section">
        <h3 class="section-title">Recent Projects</h3>
        {#each $recentPaths.slice(0, 6) as r}
          <button class="recent-item" onclick={() => selectRecent(r)}>
            <span class="ri-icon">\u{1F4C1}</span>
            <div class="ri-info">
              <div class="ri-name">{r.name || folderName(r.path)}</div>
              <div class="ri-path">{truncate(r.path, 50)}</div>
            </div>
            <span class="ri-arrow">&#x203A;</span>
          </button>
        {/each}
      </div>
    {/if}

  {:else}
    <div class="section">
      <div class="section-header">
        <h3>New Session</h3>
        <button class="btn-ghost" onclick={() => { view = 'list'; }}>Cancel</button>
      </div>

      <FolderBrowser onSelect={(path) => { selectedPath = path; }} />

      <input
        class="field"
        type="text"
        bind:value={sessionName}
        placeholder="Session name (optional)"
      />

      <div class="chosen-path">
        {selectedPath || 'No folder selected'}
      </div>

      <button
        class="btn-primary full"
        onclick={handleCreate}
        disabled={!selectedPath || creating}
      >
        {creating ? 'Creating\u2026' : 'Create Session'}
      </button>
    </div>
  {/if}
</div>

<style>
  .sessions-view { padding: var(--s4); }

  .section { margin-bottom: var(--s6); }
  .section-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: var(--s3);
  }
  .section-title {
    font-size: var(--text-sm); color: var(--text-tertiary);
    text-transform: uppercase; letter-spacing: 0.05em;
    margin-bottom: var(--s2);
  }
  h3 { font-size: var(--text-lg); font-weight: 600; }

  .btn-primary {
    background: var(--accent); color: #fff; border: none;
    padding: var(--s2) var(--s4); border-radius: var(--r-md);
    font-size: var(--text-sm); font-weight: 600; cursor: pointer;
    min-height: var(--touch-min); font-family: var(--font-sans);
  }
  .btn-primary:active { opacity: 0.8; }
  .btn-primary:disabled { opacity: 0.4; }
  .btn-primary.full { width: 100%; margin-top: var(--s3); }

  .btn-ghost {
    background: none; border: 1px solid var(--border); color: var(--text-secondary);
    padding: var(--s2) var(--s4); border-radius: var(--r-md);
    font-size: var(--text-sm); cursor: pointer; min-height: var(--touch-min);
    font-family: var(--font-sans);
  }

  .field {
    width: 100%; background: var(--bg); color: var(--text);
    border: 1px solid var(--border); border-radius: var(--r-md);
    padding: var(--s3); font-size: var(--text-base); outline: none;
    margin-top: var(--s3); min-height: var(--touch-min);
    font-family: var(--font-sans);
  }
  .field:focus { border-color: var(--accent); }

  .chosen-path {
    padding: var(--s2) var(--s3); font-size: var(--text-sm);
    color: var(--text-tertiary); margin-top: var(--s2);
    background: var(--bg); border-radius: var(--r-sm);
    word-break: break-all;
  }

  .empty {
    text-align: center; padding: var(--s8) var(--s4);
    color: var(--text-tertiary);
  }
  .hint { font-size: var(--text-sm); margin-top: var(--s1); }

  .recent-item {
    display: flex; align-items: center; gap: var(--s3);
    width: 100%; padding: var(--s3) var(--s4);
    background: var(--surface-raised); border: 1px solid var(--border);
    border-radius: var(--r-md); cursor: pointer;
    margin-bottom: var(--s2); min-height: 56px;
    text-align: left; font-family: var(--font-sans);
    color: var(--text);
    -webkit-tap-highlight-color: transparent;
  }
  .recent-item:active { background: var(--accent-subtle); }
  .ri-icon { font-size: 20px; flex-shrink: 0; }
  .ri-info { flex: 1; min-width: 0; }
  .ri-name { font-weight: 500; font-size: var(--text-base); }
  .ri-path {
    font-size: var(--text-xs); color: var(--text-tertiary);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px;
  }
  .ri-arrow { font-size: 20px; color: var(--text-tertiary); }
</style>
```

**Verify:** Sessions tab shows session list (or empty state), recent projects, new session creation flow with folder browser.

**Step 2: Commit**

```bash
git add client/src/lib/sessions/SessionsView.svelte
git commit -m "feat: add complete sessions view with CRUD and folder browser"
```

---

## Phase 6: Activity View

### Task 22: ActivityView — logs, services, audit in one tab

**Files:**
- Create: `client/src/lib/activity/ActivityView.svelte`
- Create: `client/src/lib/activity/LogStream.svelte`
- Create: `client/src/lib/activity/ServiceCard.svelte`
- Create: `client/src/lib/activity/AuditList.svelte`

These are straightforward rendering components. The stores (logs.js, services.js) already handle the data. The ActivityView uses a segmented control (Logs | Services | Audit) to switch sub-views.

**Step 1: Write LogStream.svelte**

```svelte
<script>
  import { filteredLogs, logFilter, clearLogs } from '../stores/logs.js';
  import { formatTime } from '../utils/format.js';
  import { onMount, tick } from 'svelte';

  let scrollEl;
  let autoScroll = $state(true);

  $effect(() => {
    if ($filteredLogs && autoScroll && scrollEl) {
      tick().then(() => { scrollEl.scrollTop = scrollEl.scrollHeight; });
    }
  });
</script>

<div class="log-controls">
  <div class="filter-chips">
    {#each ['all', 'agent', 'bridge'] as f}
      <button
        class="chip" class:active={$logFilter === f}
        onclick={() => logFilter.set(f)}
      >{f}</button>
    {/each}
  </div>
  <button class="clear-btn" onclick={clearLogs}>Clear</button>
</div>

<div class="log-scroll" bind:this={scrollEl} onscroll={() => {
  autoScroll = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 20;
}}>
  {#each $filteredLogs as line}
    <div class="log-line" class:stderr={line.stream === 'stderr'}>
      <span class="ts">{formatTime(line.ts)}</span>
      <span class="svc {line.service || ''}">{line.service || ''}</span>
      <span class="msg">{line.text || ''}</span>
    </div>
  {:else}
    <div class="empty">No logs yet</div>
  {/each}
</div>

<style>
  .log-controls {
    display: flex; justify-content: space-between; align-items: center;
    padding: var(--s2) 0; gap: var(--s2);
  }
  .filter-chips { display: flex; gap: var(--s1); }
  .chip {
    padding: var(--s1) var(--s3); border-radius: var(--r-full);
    background: var(--bg); border: 1px solid var(--border);
    color: var(--text-tertiary); font-size: var(--text-xs);
    cursor: pointer; min-height: 32px; font-family: var(--font-sans);
    text-transform: capitalize;
  }
  .chip.active { border-color: var(--accent); color: var(--accent); }
  .clear-btn {
    background: none; border: 1px solid var(--border); color: var(--text-secondary);
    padding: var(--s1) var(--s3); border-radius: var(--r-sm);
    font-size: var(--text-xs); cursor: pointer; font-family: var(--font-sans);
  }

  .log-scroll {
    background: #010409; border-radius: var(--r-sm);
    padding: var(--s2); max-height: 65vh; overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    font-family: var(--font-mono); font-size: var(--text-xs); line-height: 1.6;
  }
  .log-line { white-space: pre-wrap; word-break: break-all; }
  .ts { color: var(--text-tertiary); margin-right: var(--s2); }
  .svc { font-weight: 600; margin-right: var(--s2); }
  .svc.agent { color: var(--accent); }
  .svc.bridge { color: var(--orange); }
  .log-line.stderr .msg { color: var(--red); }
  .empty { text-align: center; padding: var(--s6); color: var(--text-tertiary); }
</style>
```

**Step 2: Write ServiceCard.svelte**

```svelte
<script>
  import { serviceAction } from '../stores/services.js';
  import { formatDuration } from '../utils/format.js';
  import { haptic } from '../utils/haptics.js';
  import { showToast } from '../stores/toast.js';

  let { name, info } = $props();
  let status = $derived(info?.status || 'stopped');

  async function act(action) {
    haptic('light');
    try {
      await serviceAction(name, action);
      showToast(`${name}: ${action}`);
    } catch {
      showToast(`Failed to ${action} ${name}`);
    }
  }
</script>

<div class="svc-card">
  <div class="svc-header">
    <span class="svc-name">{name.charAt(0).toUpperCase() + name.slice(1)}</span>
    <span class="badge {status}">{status}</span>
  </div>
  <div class="svc-info">
    PID: {info?.pid || '--'} &middot;
    Uptime: {info?.startedAt ? formatDuration(Math.floor((Date.now() - new Date(info.startedAt).getTime()) / 1000)) : '--'}
  </div>
  <div class="svc-actions">
    {#if status === 'running'}
      <button class="svc-btn" onclick={() => act('stop')}>Stop</button>
      <button class="svc-btn" onclick={() => act('restart')}>Restart</button>
    {:else}
      <button class="svc-btn" onclick={() => act('start')}>Start</button>
    {/if}
  </div>
</div>

<style>
  .svc-card {
    background: var(--surface-raised); border: 1px solid var(--border);
    border-radius: var(--r-md); padding: var(--s4); margin-bottom: var(--s2);
  }
  .svc-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--s2); }
  .svc-name { font-weight: 600; font-size: var(--text-base); }
  .badge {
    font-size: var(--text-xs); padding: 2px 8px; border-radius: var(--r-full);
    text-transform: uppercase; font-weight: 600;
  }
  .badge.running { background: var(--green-subtle); color: var(--green); }
  .badge.starting { background: var(--yellow-subtle); color: var(--yellow); }
  .badge.error { background: var(--red-subtle); color: var(--red); }
  .badge.stopped { background: var(--border); color: var(--text-tertiary); }
  .svc-info { font-size: var(--text-xs); color: var(--text-tertiary); margin-bottom: var(--s3); }
  .svc-actions { display: flex; gap: var(--s2); }
  .svc-btn {
    padding: var(--s2) var(--s4); background: var(--border); border: 1px solid var(--border);
    border-radius: var(--r-sm); color: var(--text); font-size: var(--text-sm);
    cursor: pointer; min-height: var(--touch-min); font-family: var(--font-sans);
  }
  .svc-btn:active { background: var(--surface); }
</style>
```

**Step 3: Write ActivityView.svelte**

```svelte
<script>
  import LogStream from './LogStream.svelte';
  import ServiceCard from './ServiceCard.svelte';
  import { services } from '../stores/services.js';
  import { haptic } from '../utils/haptics.js';
  import { onMount } from 'svelte';
  import { formatTime } from '../utils/format.js';

  let segment = $state('logs'); // 'logs' | 'services' | 'audit'
  let auditEvents = $state([]);

  function switchSegment(s) {
    haptic('light');
    segment = s;
    if (s === 'audit' && auditEvents.length === 0) loadAudit();
  }

  async function loadAudit() {
    try {
      const res = await fetch('/api/audit?limit=100');
      auditEvents = await res.json();
    } catch { auditEvents = []; }
  }
</script>

<div class="activity-view">
  <div class="segments">
    {#each ['logs', 'services', 'audit'] as s}
      <button class="seg" class:active={segment === s} onclick={() => switchSegment(s)}>
        {s.charAt(0).toUpperCase() + s.slice(1)}
      </button>
    {/each}
  </div>

  <div class="segment-content">
    {#if segment === 'logs'}
      <LogStream />
    {:else if segment === 'services'}
      {#each Object.entries($services) as [name, info]}
        <ServiceCard {name} {info} />
      {/each}
    {:else}
      {#each auditEvents as ev}
        <div class="audit-item" class:blocked={ev.blocked}>
          <span class="audit-time">{formatTime(ev.timestamp)}</span>
          <span class="audit-event">{ev.event}</span>
          <span class="audit-detail">{ev.detail}</span>
        </div>
      {:else}
        <div class="empty">No audit events</div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .activity-view { padding: var(--s4); }

  .segments {
    display: flex; gap: var(--s1); margin-bottom: var(--s4);
    background: var(--bg); border-radius: var(--r-md); padding: var(--s1);
  }
  .seg {
    flex: 1; padding: var(--s2); border-radius: var(--r-sm);
    background: none; border: none; color: var(--text-tertiary);
    font-size: var(--text-sm); font-weight: 500; cursor: pointer;
    min-height: 36px; font-family: var(--font-sans);
    transition: all var(--duration-fast);
  }
  .seg.active { background: var(--surface-raised); color: var(--text); }

  .audit-item {
    display: flex; gap: var(--s2); padding: var(--s2) 0;
    border-bottom: 1px solid var(--border-subtle); font-size: var(--text-sm);
  }
  .audit-item.blocked { background: var(--red-subtle); }
  .audit-time { color: var(--text-tertiary); font-size: var(--text-xs); flex-shrink: 0; width: 70px; }
  .audit-event { font-weight: 500; flex-shrink: 0; width: 100px; }
  .audit-detail { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { text-align: center; padding: var(--s8); color: var(--text-tertiary); }
</style>
```

**Verify:** Activity tab shows segmented control with Logs/Services/Audit. Logs stream in real-time. Service cards show status with start/stop/restart buttons. Audit loads on demand.

**Step 4: Commit**

```bash
git add client/src/lib/activity/
git commit -m "feat: add activity view with logs, services, audit"
```

---

## Phase 7: Settings & Messaging

### Task 23: SettingsView

**Files:**
- Create: `client/src/lib/settings/SettingsView.svelte`

**Step 1: Write the component**

```svelte
<script>
  import { fontSize } from '../stores/preferences.js';
  import { haptic } from '../utils/haptics.js';
  import { showToast } from '../stores/toast.js';

  let whatsappPaused = $state(false);
  let telegramPaused = $state(false);

  import { onMount } from 'svelte';
  onMount(async () => {
    try {
      const res = await fetch('/api/platforms');
      const data = await res.json();
      whatsappPaused = data.whatsapp || false;
      telegramPaused = data.telegram || false;
    } catch {}
  });

  async function togglePlatform(name) {
    haptic('light');
    try {
      const res = await fetch(`/api/platforms/${name}/toggle`, { method: 'POST' });
      const data = await res.json();
      if (name === 'whatsapp') whatsappPaused = data.paused;
      if (name === 'telegram') telegramPaused = data.paused;
      showToast(`${name}: ${data.paused ? 'paused' : 'active'}`);
    } catch {
      showToast(`Failed to toggle ${name}`);
    }
  }

  function changeFontSize(delta) {
    haptic('light');
    fontSize.update(s => Math.max(8, Math.min(28, s + delta)));
    showToast(`Font size: ${$fontSize}px`);
  }
</script>

<div class="settings-view">
  <div class="section">
    <h3 class="section-title">Terminal</h3>
    <div class="setting-row">
      <span>Font Size</span>
      <div class="font-controls">
        <button class="fc-btn" onclick={() => changeFontSize(-2)}>A-</button>
        <span class="fc-value">{$fontSize}px</span>
        <button class="fc-btn" onclick={() => changeFontSize(2)}>A+</button>
      </div>
    </div>
  </div>

  <div class="section">
    <h3 class="section-title">Messaging</h3>
    <div class="setting-row">
      <span>WhatsApp</span>
      <button class="toggle" class:active={!whatsappPaused} onclick={() => togglePlatform('whatsapp')}>
        <span class="toggle-thumb"></span>
      </button>
    </div>
    <div class="setting-row">
      <span>Telegram</span>
      <button class="toggle" class:active={!telegramPaused} onclick={() => togglePlatform('telegram')}>
        <span class="toggle-thumb"></span>
      </button>
    </div>
  </div>

  <div class="section">
    <h3 class="section-title">About</h3>
    <div class="about">Claude Code Mobile v0.1.0</div>
  </div>
</div>

<style>
  .settings-view { padding: var(--s4); }
  .section { margin-bottom: var(--s6); }
  .section-title {
    font-size: var(--text-sm); color: var(--text-tertiary);
    text-transform: uppercase; letter-spacing: 0.05em;
    margin-bottom: var(--s3);
  }

  .setting-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: var(--s3) var(--s4);
    background: var(--surface-raised); border: 1px solid var(--border);
    border-radius: var(--r-md); margin-bottom: var(--s2);
    min-height: 52px; font-size: var(--text-base);
  }

  .font-controls { display: flex; align-items: center; gap: var(--s2); }
  .fc-btn {
    width: 36px; height: 36px; border-radius: var(--r-sm);
    background: var(--bg); border: 1px solid var(--border);
    color: var(--text); font-size: var(--text-sm); font-weight: 600;
    cursor: pointer; font-family: var(--font-sans);
  }
  .fc-btn:active { background: var(--accent-subtle); }
  .fc-value { font-size: var(--text-sm); color: var(--text-secondary); min-width: 40px; text-align: center; }

  .toggle {
    position: relative; width: 48px; height: 28px;
    background: var(--border); border: none; border-radius: 14px;
    cursor: pointer; transition: background var(--duration-fast);
  }
  .toggle.active { background: var(--green); }
  .toggle-thumb {
    position: absolute; top: 3px; left: 3px;
    width: 22px; height: 22px; background: #fff;
    border-radius: 50%; transition: transform var(--duration-fast);
  }
  .toggle.active .toggle-thumb { transform: translateX(20px); }

  .about { font-size: var(--text-sm); color: var(--text-tertiary); padding: var(--s3) var(--s4); }
</style>
```

**Step 2: Commit**

```bash
git add client/src/lib/settings/SettingsView.svelte
git commit -m "feat: add settings view with font size and messaging toggles"
```

---

## Phase 8: Wire Views into AppShell & Backend Integration

### Task 24: Update AppShell with real views

**Files:**
- Modify: `client/src/lib/components/AppShell.svelte`

**Step 1:** Replace placeholder views with real components. Import TerminalView, SessionsView, ActivityView, SettingsView and render them based on activeTab.

**Verify:** All four tabs render their full views. Terminal connects and renders. Sessions CRUD works. Logs stream. Settings toggles work.

**Step 2: Commit**

```bash
git commit -m "feat: wire all views into app shell"
```

---

### Task 25: Update backend to serve Svelte build

**Files:**
- Modify: `packages/dashboard/src/index.ts` (one line change)

**Step 1:** Change the static file serving path.

Find the line that looks like:
```typescript
app.use(express.static(path.join(__dirname, '../public')));
```

Change it to:
```typescript
// Serve new Svelte frontend (built), fall back to legacy
const clientDist = path.join(__dirname, '../client/dist');
const legacyPublic = path.join(__dirname, '../public');
app.use(express.static(fs.existsSync(clientDist) ? clientDist : legacyPublic));
```

This way: if the Svelte build exists, serve it. Otherwise fall back to the old vanilla JS frontend.

**Step 2:** Build the Svelte frontend:

```bash
cd packages/dashboard/client
npm run build
```

**Step 3:** Copy PWA assets from old public to client/public:

```bash
cp -r packages/dashboard/public/icons packages/dashboard/client/public/
cp packages/dashboard/public/manifest.json packages/dashboard/client/public/
cp packages/dashboard/public/sw.js packages/dashboard/client/public/
```

**Verify:** Restart the dashboard server. Open on phone. The new Svelte app loads.

**Step 4: Commit**

```bash
git commit -m "feat: serve Svelte frontend from backend, with legacy fallback"
```

---

## Phase 9: Polish — Native App Feel

### Task 26: View transitions

Add Svelte transitions between tab switches — cross-fade or slide based on tab index direction. Use `{#key activeTab}` with `transition:fly` in AppShell.

### Task 27: Pull-to-refresh on sessions

Add touch gesture detection at top of SessionsView to refresh the session list on pull-down.

### Task 28: Swipe to delete sessions

Add horizontal swipe gesture on SessionCard that reveals a delete button.

### Task 29: Terminal touch controls

Port the select mode, keyboard toggle, font controls, scroll buttons, and pinch-to-zoom from the vanilla JS implementation into Svelte components within `client/src/lib/terminal/TerminalControls.svelte`.

### Task 30: Keyboard-aware input bar positioning

Port the `visualViewport` positioning logic so the input bar rises above the mobile keyboard. Use `$effect` to listen to `visualViewport.resize` events.

### Task 31: PWA enhancements

- Update `manifest.json` with new name "Claude Code"
- Update service worker for offline shell caching
- Add splash screen icons for iOS

---

## Verification Checklist

1. Open on phone — app loads instantly, no FOUC
2. Bottom tab bar — 4 tabs, tap to switch, active indicator animates
3. Terminal tab — xterm renders, input bar always visible, quick actions contextual
4. Type command in input bar — sends to terminal, output appears
5. Sessions tab — list loads, tap to switch, + New creates session
6. Folder browser — search filters, breadcrumbs navigate, tap selects
7. Activity tab — logs stream live, services show status, audit loads
8. Settings — font size changes terminal, messaging toggles work
9. Haptic feedback on all taps
10. Works offline (PWA cached shell)
11. Add to home screen — launches fullscreen, no browser chrome
