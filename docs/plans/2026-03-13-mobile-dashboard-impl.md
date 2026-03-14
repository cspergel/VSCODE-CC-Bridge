# Mobile-Optimized Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current desktop-centric dashboard with a mobile-first PWA featuring terminal-first layout, gesture-driven slide-up panels, a command palette, and context-aware quick actions — while preserving all existing backend functionality unchanged.

**Architecture:** The frontend (`packages/dashboard/public/`) is completely rewritten as a modular vanilla JS app with split CSS files. The backend (Express server, API routes, ProcessManager, LogBroadcaster) stays exactly as-is — the new frontend talks to the same WebSocket and REST endpoints. The current `index.html`, `style.css`, and `app.js` are replaced by the new file structure. No build tools — all files are served statically via Express.

**Tech Stack:** Vanilla JS (ES modules via `<script type="module">`), CSS custom properties, xterm.js 5.3.0 (CDN), PWA (manifest.json + service worker), `visualViewport` API for mobile keyboard handling.

**Design Doc Reference:** `docs/plans/2026-03-13-mobile-dashboard-design.md`

---

## Task 1: CSS Design Tokens & Foundation

**Files:**
- Create: `packages/dashboard/public/css/variables.css`

**Context:** This file defines all design tokens (colors, spacing, fonts, radii, breakpoints) used across every other CSS file. It must be created first since everything depends on it.

**Step 1: Create the CSS variables file**

```css
/* packages/dashboard/public/css/variables.css */
/* Design tokens — single source of truth for the entire dashboard UI */

* { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  /* Colors (GitHub dark theme) */
  --bg: #0d1117;
  --surface: #161b22;
  --border: #30363d;
  --text: #c9d1d9;
  --text-dim: #8b949e;
  --accent: #58a6ff;
  --green: #3fb950;
  --red: #f85149;
  --yellow: #d29922;
  --orange: #db6d28;

  /* Spacing — used everywhere */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;

  /* Font sizes — terminal font scales with breakpoints */
  --font-term: 16px;
  --font-ui: 14px;
  --font-ui-sm: 12px;
  --font-ui-xs: 11px;

  /* Font families */
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  --font-mono: 'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;

  /* Radii — slightly more rounded on mobile */
  --radius: 12px;
  --radius-sm: 8px;
  --radius-xs: 6px;

  /* Z-index layers */
  --z-terminal: 1;
  --z-quick-actions: 10;
  --z-input-bar: 10;
  --z-status-bar: 20;
  --z-sidebar: 30;
  --z-panel-backdrop: 40;
  --z-panel: 50;
  --z-palette-backdrop: 60;
  --z-palette: 70;
  --z-toast: 80;
  --z-modal: 90;

  /* Transition timings */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --duration-fast: 150ms;
  --duration-normal: 200ms;
  --duration-panel-open: 300ms;
  --duration-panel-close: 200ms;

  /* Touch target minimum */
  --touch-min: 48px;
}

/* Tablet: adjust terminal font */
@media (min-width: 480px) and (max-width: 768px) {
  :root {
    --font-term: 15px;
  }
}

/* Desktop: tighter spacing, smaller radii */
@media (min-width: 769px) {
  :root {
    --font-term: 14px;
    --radius: 8px;
    --radius-sm: 6px;
  }
}

body {
  font-family: var(--font-sans);
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  overflow: hidden;
  -webkit-tap-highlight-color: transparent;
  -webkit-text-size-adjust: 100%;
}
```

**Step 2: Verify the directory structure**

Run: `ls packages/dashboard/public/css/`
Expected: `variables.css` exists

**Step 3: Commit**

```bash
git add packages/dashboard/public/css/variables.css
git commit -m "feat(dashboard): add CSS design tokens (variables.css)"
```

---

## Task 2: PWA Foundation

**Files:**
- Create: `packages/dashboard/public/manifest.json`
- Create: `packages/dashboard/public/sw.js`
- Create: `packages/dashboard/public/icons/` (placeholder icons)

**Context:** Makes the dashboard installable as a PWA on mobile. The service worker caches static assets for instant load. Icons are simple SVG placeholders — they can be replaced with proper icons later.

**Step 1: Create the PWA manifest**

```json
{
  "name": "Claude Bridge Dashboard",
  "short_name": "Claude Bridge",
  "description": "Terminal-first dashboard for Claude Code Live Bridge",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#0d1117",
  "background_color": "#0d1117",
  "icons": [
    { "src": "/icons/icon-192.svg", "sizes": "192x192", "type": "image/svg+xml" },
    { "src": "/icons/icon-512.svg", "sizes": "512x512", "type": "image/svg+xml" }
  ]
}
```

**Step 2: Create a minimal service worker**

```js
// packages/dashboard/public/sw.js
const CACHE_NAME = 'claude-bridge-v1';
const STATIC_ASSETS = [
  '/',
  '/css/variables.css',
  '/css/layout.css',
  '/css/terminal.css',
  '/css/panels.css',
  '/css/palette.css',
  '/css/animations.css',
  '/js/app.js',
  '/js/terminal.js',
  '/js/panels.js',
  '/js/palette.js',
  '/js/sessions.js',
  '/js/input-bar.js',
  '/js/platform.js',
  '/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Network-first for API calls, cache-first for static assets
  if (e.request.url.includes('/api/') || e.request.url.includes('/ws')) {
    return; // Let these pass through to network
  }
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
```

**Step 3: Create placeholder SVG icons**

Create `packages/dashboard/public/icons/icon-192.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="32" fill="#0d1117"/>
  <text x="96" y="110" text-anchor="middle" fill="#58a6ff" font-size="80" font-family="monospace">&gt;_</text>
</svg>
```

Create `packages/dashboard/public/icons/icon-512.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#0d1117"/>
  <text x="256" y="300" text-anchor="middle" fill="#58a6ff" font-size="220" font-family="monospace">&gt;_</text>
</svg>
```

**Step 4: Commit**

```bash
git add packages/dashboard/public/manifest.json packages/dashboard/public/sw.js packages/dashboard/public/icons/
git commit -m "feat(dashboard): add PWA manifest, service worker, and icons"
```

---

## Task 3: New HTML Shell & Layout CSS

**Files:**
- Rewrite: `packages/dashboard/public/index.html`
- Create: `packages/dashboard/public/css/layout.css`

**Context:** This is the core structure change. The old HTML had a header, service cards, tab bar, and tab content sections. The new HTML has a status bar, terminal viewport, quick-action row, and input bar — with panels rendered via JS. The old `style.css` is kept alongside temporarily (we'll remove it at the end), while the new CSS files are loaded first.

**Step 1: Create the layout CSS**

Create `packages/dashboard/public/css/layout.css`:

```css
/* Layout — grid, status bar, input bar, quick actions */

/* === STATUS BAR === */
.status-bar {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 var(--space-md);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  z-index: var(--z-status-bar);
  gap: var(--space-sm);
  flex-shrink: 0;
}

.status-bar .logo {
  font-size: var(--font-ui);
  font-weight: 600;
  color: var(--accent);
  display: none; /* Hidden on phone, shown on desktop */
}

.session-selector {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  color: var(--text);
  font-size: var(--font-ui-sm);
  cursor: pointer;
  min-width: 0;
  max-width: 200px;
}

.session-selector .session-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-selector .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.session-selector .caret {
  font-size: 10px;
  color: var(--text-dim);
  flex-shrink: 0;
}

.status-bar .spacer { flex: 1; }

/* Platform indicators */
.platform-indicators {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.platform-indicator {
  font-size: 16px;
  cursor: pointer;
  transition: opacity var(--duration-fast);
  padding: var(--space-xs);
  user-select: none;
  -webkit-user-select: none;
}

.platform-indicator.paused {
  opacity: 0.3;
  text-decoration: line-through;
}

/* Status bar buttons */
.status-bar-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 16px;
  padding: var(--space-xs);
  cursor: pointer;
  border-radius: var(--radius-xs);
  min-width: var(--touch-min);
  min-height: var(--touch-min);
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-bar-btn:hover {
  color: var(--text);
  background: rgba(255,255,255,0.06);
}

/* === MAIN VIEWPORT === */
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh; /* Dynamic viewport height for mobile */
}

.terminal-viewport {
  flex: 1;
  position: relative;
  min-height: 0;
  background: #000;
  z-index: var(--z-terminal);
}

/* === QUICK-ACTION ROW === */
.quick-actions {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  background: var(--surface);
  border-top: 1px solid var(--border);
  z-index: var(--z-quick-actions);
  flex-shrink: 0;
  min-height: 40px;
  overflow-x: auto;
  scrollbar-width: none;
}

.quick-actions::-webkit-scrollbar { display: none; }

.quick-btn {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  color: var(--text);
  font-size: var(--font-ui-xs);
  cursor: pointer;
  white-space: nowrap;
  min-height: 32px;
  transition: background var(--duration-fast), transform var(--duration-fast);
  flex-shrink: 0;
}

.quick-btn:active {
  transform: scale(0.95);
}

.quick-btn.yes { color: var(--green); border-color: rgba(63,185,80,0.3); }
.quick-btn.no { color: var(--red); border-color: rgba(248,81,73,0.3); }
.quick-btn.cancel { color: var(--yellow); }
.quick-btn.accent { color: var(--accent); border-color: rgba(88,166,255,0.3); }

/* === INPUT BAR === */
.input-bar {
  display: flex;
  align-items: flex-end;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--surface);
  border-top: 1px solid var(--border);
  z-index: var(--z-input-bar);
  flex-shrink: 0;
}

.input-bar textarea {
  flex: 1;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-sm) var(--space-md);
  font-family: var(--font-mono);
  font-size: var(--font-ui);
  resize: none;
  min-height: 40px;
  max-height: 80px; /* ~3 lines */
  line-height: 1.4;
  overflow-y: auto;
}

.input-bar textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.input-bar textarea::placeholder {
  color: var(--text-dim);
}

.send-btn {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  width: 40px;
  height: 40px;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background var(--duration-fast);
}

.send-btn:hover { background: #4393e6; }
.send-btn:active { transform: scale(0.93); }

/* === PANEL LAUNCHER (mobile) === */
.panel-launcher {
  display: none; /* Shown via JS on swipe-up */
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--surface);
  border-top: 1px solid var(--border);
  border-radius: var(--radius) var(--radius) 0 0;
  padding: var(--space-md);
  z-index: var(--z-panel);
}

.panel-launcher.open { display: block; }

.panel-launcher-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-sm);
}

.panel-launch-btn {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: var(--font-ui);
  cursor: pointer;
  min-height: var(--touch-min);
}

.panel-launch-btn:active {
  background: rgba(88,166,255,0.08);
}

/* === FULLSCREEN MODE === */
.app-container.fullscreen .status-bar { display: none; }

.fullscreen-pill {
  display: none;
  position: absolute;
  top: var(--space-sm);
  right: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  background: rgba(22,27,34,0.8);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-dim);
  font-size: var(--font-ui-xs);
  z-index: 5;
  pointer-events: none;
  transition: opacity 0.3s;
}

.app-container.fullscreen .fullscreen-pill { display: block; }
.fullscreen-pill.faded { opacity: 0; }

/* === DESKTOP SIDEBAR (>768px) === */
@media (min-width: 769px) {
  .status-bar .logo { display: block; }

  .app-layout {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .sidebar {
    width: 48px;
    background: var(--surface);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: var(--space-sm);
    gap: var(--space-xs);
    flex-shrink: 0;
    z-index: var(--z-sidebar);
    transition: width var(--duration-normal) var(--ease-out);
  }

  .sidebar.expanded { width: 280px; }

  .sidebar-btn {
    width: 40px;
    height: 40px;
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 18px;
    cursor: pointer;
    border-radius: var(--radius-xs);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .sidebar-btn:hover { color: var(--text); background: rgba(255,255,255,0.06); }
  .sidebar-btn.active { color: var(--accent); }

  .sidebar-btn .sidebar-label {
    display: none;
    position: absolute;
    left: 52px;
    white-space: nowrap;
    font-size: var(--font-ui-sm);
    color: var(--text);
  }

  .sidebar.expanded .sidebar-btn {
    width: 100%;
    padding: 0 var(--space-md);
    justify-content: flex-start;
    gap: var(--space-sm);
  }

  .sidebar.expanded .sidebar-btn .sidebar-label { display: inline; position: static; }

  /* Sidebar tooltip on hover (collapsed) */
  .sidebar:not(.expanded) .sidebar-btn:hover::after {
    content: attr(data-tooltip);
    position: absolute;
    left: 52px;
    background: var(--surface);
    border: 1px solid var(--border);
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-xs);
    font-size: var(--font-ui-xs);
    color: var(--text);
    white-space: nowrap;
    z-index: 100;
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* Desktop panel: renders inside sidebar when expanded */
  .sidebar-panel {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-md);
    display: none;
  }

  .sidebar.expanded .sidebar-panel.active { display: block; }
}

/* === MOBILE: no sidebar === */
@media (max-width: 768px) {
  .sidebar { display: none; }
  .app-layout { display: contents; }
  .main-content { display: contents; }
}

/* === TOASTS === */
.toast-container {
  position: fixed;
  top: var(--space-md);
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  pointer-events: none;
}

.toast {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-sm) var(--space-md);
  font-size: var(--font-ui-sm);
  color: var(--text);
  animation: toastIn var(--duration-normal) var(--ease-out);
  pointer-events: auto;
}

.toast.leaving {
  animation: toastOut var(--duration-fast) ease-in forwards;
}

@keyframes toastIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes toastOut {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-10px); }
}
```

**Step 2: Rewrite index.html with the new shell**

Rewrite `packages/dashboard/public/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#0d1117">
  <title>Claude Bridge</title>
  <link rel="manifest" href="/manifest.json">
  <link rel="icon" href="/icons/icon-192.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/icons/icon-192.svg">

  <!-- CSS (order matters) -->
  <link rel="stylesheet" href="/css/variables.css">
  <link rel="stylesheet" href="/css/layout.css">
  <link rel="stylesheet" href="/css/terminal.css">
  <link rel="stylesheet" href="/css/panels.css">
  <link rel="stylesheet" href="/css/palette.css">
  <link rel="stylesheet" href="/css/animations.css">

  <!-- xterm.js -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css">
</head>
<body>
  <div class="app-container" id="app">

    <!-- Status Bar -->
    <div class="status-bar" id="statusBar">
      <span class="logo">Claude Bridge</span>
      <button class="session-selector" id="sessionSelector">
        <span class="dot running" id="sessionDot"></span>
        <span class="session-name" id="sessionName">No session</span>
        <span class="caret">&#9660;</span>
      </button>
      <span class="spacer"></span>
      <div class="platform-indicators" id="platformIndicators">
        <!-- Populated by JS based on config -->
      </div>
      <button class="status-bar-btn" id="btnFullscreen" title="Fullscreen">&#x26F6;</button>
      <button class="status-bar-btn" id="btnPalette" title="Command Palette">&#x26A1;</button>
    </div>

    <!-- Desktop: sidebar + main -->
    <div class="app-layout">
      <nav class="sidebar" id="sidebar">
        <button class="sidebar-btn" data-panel="sessions" data-tooltip="Sessions">
          &#x1F4CB;<span class="sidebar-label">Sessions</span>
        </button>
        <button class="sidebar-btn" data-panel="logs" data-tooltip="Logs">
          &#x1F4CA;<span class="sidebar-label">Logs</span>
        </button>
        <button class="sidebar-btn" data-panel="services" data-tooltip="Services">
          &#x2699;<span class="sidebar-label">Services</span>
        </button>
        <button class="sidebar-btn" data-panel="messages" data-tooltip="Messages">
          &#x1F4AC;<span class="sidebar-label">Messages</span>
        </button>
        <button class="sidebar-btn" data-panel="audit" data-tooltip="Audit">
          &#x1F4DC;<span class="sidebar-label">Audit</span>
        </button>
        <div class="sidebar-panel" id="sidebarPanel"></div>
      </nav>

      <div class="main-content">
        <!-- Terminal fills viewport -->
        <div class="terminal-viewport" id="terminalViewport">
          <div id="terminalContainer"></div>
          <div class="fullscreen-pill" id="fullscreenPill">
            <span id="fullscreenSessionName"></span>
          </div>
        </div>

        <!-- Quick-action row -->
        <div class="quick-actions" id="quickActions">
          <!-- Populated dynamically by JS based on terminal state -->
        </div>

        <!-- Input bar -->
        <div class="input-bar" id="inputBar">
          <textarea id="commandInput" rows="1" placeholder="Type command..."></textarea>
          <button class="send-btn" id="btnSend">&#x27A4;</button>
        </div>
      </div>
    </div>

    <!-- Panel backdrop (mobile) -->
    <div class="panel-backdrop" id="panelBackdrop"></div>

    <!-- Slide-up panel container (mobile) -->
    <div class="panel-container" id="panelContainer">
      <div class="panel-drag-handle"></div>
      <div class="panel-content" id="panelContent"></div>
    </div>

    <!-- Panel launcher (mobile swipe-up) -->
    <div class="panel-launcher" id="panelLauncher">
      <div class="panel-launcher-grid">
        <button class="panel-launch-btn" data-panel="sessions">&#x1F4CB; Sessions</button>
        <button class="panel-launch-btn" data-panel="logs">&#x1F4CA; Logs</button>
        <button class="panel-launch-btn" data-panel="services">&#x2699; Services</button>
        <button class="panel-launch-btn" data-panel="messages">&#x1F4AC; Messages</button>
        <button class="panel-launch-btn" data-panel="audit">&#x1F4DC; Audit</button>
      </div>
    </div>

    <!-- Command palette overlay -->
    <div class="palette-backdrop" id="paletteBackdrop"></div>
    <div class="palette" id="palette">
      <input class="palette-search" id="paletteSearch" type="text" placeholder="Search commands...">
      <div class="palette-list" id="paletteList"></div>
    </div>

    <!-- Toast container -->
    <div class="toast-container" id="toastContainer"></div>
  </div>

  <!-- xterm.js -->
  <script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>

  <!-- App modules (loaded as classic scripts — no module needed since there's no bundler) -->
  <script src="/js/app.js"></script>

  <!-- Register service worker -->
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  </script>
</body>
</html>
```

**Step 3: Verify the HTML loads without errors**

Run: `cd packages/dashboard && npm run build && npm start`
Open `http://localhost:3000` — should see the new shell structure (empty terminal, status bar, input bar). Console should show no 404s for CSS files.

**Step 4: Commit**

```bash
git add packages/dashboard/public/index.html packages/dashboard/public/css/layout.css
git commit -m "feat(dashboard): new mobile-first HTML shell and layout CSS"
```

---

## Task 4: Terminal CSS & Module

**Files:**
- Create: `packages/dashboard/public/css/terminal.css`
- Create: `packages/dashboard/public/js/terminal.js`

**Context:** This wraps xterm.js with mobile touch handling (momentum scroll, long-press select, double-tap zoom) and fullscreen mode. The terminal.js module also exposes a `TerminalView` interface for future dual-mode support. It manages multiple terminal instances (one per session) and handles resize/fit.

**Step 1: Create terminal CSS**

Create `packages/dashboard/public/css/terminal.css`:

```css
/* Terminal — xterm overrides, touch handling, fullscreen */

#terminalContainer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

.term-pane {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: none;
  touch-action: manipulation;
}

.term-pane.active {
  display: block;
}

/* xterm.js overrides */
.term-pane .xterm {
  height: 100%;
  padding: var(--space-xs);
}

.term-pane .xterm-viewport {
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch;
}

/* Fullscreen terminal: stretches to fill */
.app-container.fullscreen .terminal-viewport {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-terminal);
}

/* Terminal zoom overlay (double-tap zoom) */
.term-zoom-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none;
  z-index: 2;
  transform-origin: center;
  transition: transform var(--duration-normal) var(--ease-out);
}

.term-zoom-overlay.zoomed {
  transform: scale(1.5);
}

/* Copy toast after long-press select */
.copy-toast {
  position: absolute;
  bottom: 60px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-xs) var(--space-md);
  color: var(--text);
  font-size: var(--font-ui-sm);
  z-index: 10;
  pointer-events: none;
}
```

**Step 2: Create terminal.js module**

Create `packages/dashboard/public/js/terminal.js`:

This file manages the multi-terminal system. It should be structured as an object (`TerminalManager`) attached to `window.app.terminal`. Key functions:

- `getOrCreate(sessionId, name)` — Creates xterm.js instance in a `.term-pane` div if it doesn't exist. Returns `{ term, fitAddon, container, name }`.
- `switchTo(sessionId)` — Shows the pane for this session, hides others, calls `fitAddon.fit()`, sends resize to WebSocket.
- `renderTabs()` — Not needed in new design (session selector replaces tab bar).
- `close(sessionId)` — Disposes terminal, removes pane, auto-switches.
- `writeData(sessionId, data)` — Writes data to a terminal (creates lazily if needed).
- `sendInput(data)` — Sends keystroke data to active session via WebSocket.
- `fitActive()` — Refits active terminal (called on window resize, panel open/close).
- `toggleFullscreen()` — Toggles `.fullscreen` class on `.app-container`.
- `getActiveSessionId()` — Returns current active session ID.

The actual code (approximately 200 lines) should be a translation of the existing multi-terminal logic from `app.js` lines 15-214, with these additions:

1. Touch event handling on the terminal container:
   - `touch-action: manipulation` is set via CSS
   - Double-tap detection (two taps within 300ms) toggles a CSS `.zoomed` class
   - Long-press (500ms touchstart without move) triggers `document.execCommand('copy')` on selection

2. Fullscreen:
   - Adds/removes `.fullscreen` on `#app`
   - Updates the floating pill text with session name
   - Pill auto-fades after 3 seconds (setTimeout + `.faded` class)
   - Refits terminal on enter/exit

3. `visualViewport` tracking is NOT in terminal.js — it goes in input-bar.js

The terminal options should use `--font-term` CSS variable for fontSize:
```js
const fontSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--font-term'));
```

**Step 3: Verify terminals still render**

After wiring terminal.js into app.js (Task 6), verify that connecting to a session still shows xterm.js output.

**Step 4: Commit**

```bash
git add packages/dashboard/public/css/terminal.css packages/dashboard/public/js/terminal.js
git commit -m "feat(dashboard): terminal module with touch handling and fullscreen"
```

---

## Task 5: Input Bar & Quick Actions

**Files:**
- Create: `packages/dashboard/public/js/input-bar.js`

**Context:** The input bar replaces direct xterm.js keyboard input for mobile users. It sends commands to the active terminal's PTY via WebSocket. It also handles `visualViewport` API to keep itself above the virtual keyboard on iOS/Android. The quick-action buttons change dynamically based on terminal state (idle, awaiting approval, running).

**Step 1: Create input-bar.js**

Create `packages/dashboard/public/js/input-bar.js`:

This module manages:

1. **Command input** (`#commandInput` textarea):
   - Enter sends the text + `\n` to PTY via `app.terminal.sendInput(text + '\r')`
   - Shift+Enter inserts a newline
   - Auto-grows up to 3 lines, then internal scroll
   - Up-arrow when empty cycles command history

2. **Command history**:
   - Store last 50 commands in `localStorage` key `claudeBridge_cmdHistory`
   - Up/down arrow navigation when textarea is empty

3. **Send button** (`#btnSend`):
   - Sends the textarea content + `\r` to PTY
   - Clears textarea and refocuses

4. **`visualViewport` positioning** (critical for mobile):
   ```js
   if (window.visualViewport) {
     const inputBar = document.getElementById('inputBar');
     const quickActions = document.getElementById('quickActions');
     window.visualViewport.addEventListener('resize', () => {
       const offset = window.innerHeight - visualViewport.height - visualViewport.offsetTop;
       inputBar.style.transform = `translateY(-${offset}px)`;
       quickActions.style.transform = `translateY(-${offset}px)`;
     });
     window.visualViewport.addEventListener('scroll', () => {
       const offset = window.innerHeight - visualViewport.height - visualViewport.offsetTop;
       inputBar.style.transform = `translateY(-${offset}px)`;
       quickActions.style.transform = `translateY(-${offset}px)`;
     });
   }
   ```

5. **Quick-action buttons** (`#quickActions`):
   - `setContext(state)` updates the buttons based on terminal state
   - States: `idle`, `approval`, `running`, `picker`
   - Button definitions:

   ```js
   const QUICK_ACTION_SETS = {
     idle: [
       { label: '↑ History', action: () => cycleHistory(-1) },
       { label: 'Tab', action: () => sendInput('\t'), cls: '' },
       { label: '⚡ Cmds', action: () => app.palette.open(), cls: 'accent' },
     ],
     approval: [
       { label: '✓ Yes', action: () => sendInput('y\r'), cls: 'yes' },
       { label: '✗ No', action: () => sendInput('n\r'), cls: 'no' },
       { label: '⌃C Cancel', action: () => sendInput('\x03'), cls: 'cancel' },
     ],
     running: [
       { label: '⌃C Stop', action: () => sendInput('\x03'), cls: 'cancel' },
       { label: '⚡ Cmds', action: () => app.palette.open(), cls: 'accent' },
     ],
     picker: [
       { label: '↑', action: () => sendInput('\x1b[A') },
       { label: '↓', action: () => sendInput('\x1b[B') },
       { label: '⏎ Select', action: () => sendInput('\r') },
       { label: '⌃C', action: () => sendInput('\x03'), cls: 'cancel' },
     ],
   };
   ```

   - Render function creates `<button class="quick-btn">` elements with cross-fade transition (200ms opacity)
   - `sendInput(data)` calls `app.terminal.sendInput(data)`

6. **Context detection** — parse PTY output for patterns:
   - `[Y/n]`, `(y/N)`, `? (Y/n)` → `approval` state
   - `❯`, `$`, `>` at line start → `idle` state
   - Interactive picker patterns (`●`, `◯`) → `picker` state
   - Everything else while output is streaming → `running` state
   - The detection hooks into terminal data writes: after each `term.write()`, scan the last line of the terminal buffer

**Step 2: Verify input bar sends commands to terminal**

Type a command in the input bar, press Enter. It should appear in the terminal as if typed on a keyboard.

**Step 3: Commit**

```bash
git add packages/dashboard/public/js/input-bar.js
git commit -m "feat(dashboard): input bar with command history and context-aware quick actions"
```

---

## Task 6: App.js Core — State, WebSocket, Wiring

**Files:**
- Create: `packages/dashboard/public/js/app.js` (replaces the old one)

**Context:** This is the main entry point that wires everything together. It creates a global `app` object, manages WebSocket connection, and initializes all modules. The old `app.js` (818 lines) is completely replaced. This new version delegates to the sub-modules.

**Step 1: Write app.js**

Create `packages/dashboard/public/js/app.js`:

```js
/* global WebSocket, Terminal, FitAddon */

// Global app state — all modules attach here
window.app = {
  ws: null,
  terminal: null,  // set by terminal.js
  inputBar: null,  // set by input-bar.js
  palette: null,   // set by palette.js
  panels: null,    // set by panels.js
  platform: null,  // set by platform.js
  sessions: null,  // set by sessions.js
  activeSessionId: null,
};

// --- Toast notifications ---
function showToast(message, durationMs = 3000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 200);
  }, durationMs);
}
window.app.showToast = showToast;

// --- Helpers ---
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

window.app.escapeHtml = escapeHtml;
window.app.truncate = truncate;

// --- WebSocket ---
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/ws`);
  window.app.ws = ws;

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);

    switch (msg.type) {
      case 'history':
        // Log history buffer on connect
        for (const line of msg.data) {
          if (window.app.panels) window.app.panels.appendLog(line);
        }
        break;

      case 'log':
        if (window.app.panels) window.app.panels.appendLog(msg.data);
        break;

      case 'status':
        updateServiceStatus(msg.data.name, msg.data);
        break;

      case 'terminal_data': {
        const { sessionId, data } = msg.data;
        if (window.app.terminal) {
          window.app.terminal.writeData(sessionId, data);
          // Auto-switch to first session
          if (!window.app.activeSessionId) {
            window.app.terminal.switchTo(sessionId);
            window.app.activeSessionId = sessionId;
            updateSessionSelector(sessionId);
          }
        }
        break;
      }

      case 'sessions_update':
        if (window.app.terminal && Array.isArray(msg.data.sessions)) {
          for (const s of msg.data.sessions) {
            window.app.terminal.updateSessionName(s.id, s.name);
          }
          updateSessionSelector(window.app.activeSessionId);
        }
        break;
    }
  };

  ws.onclose = () => setTimeout(connectWS, 2000);
  ws.onerror = () => {};
}

// --- Service status tracking ---
const serviceStatuses = { agent: {}, bridge: {} };

function updateServiceStatus(name, info) {
  serviceStatuses[name] = info;
  // Update session dot color based on agent status
  const dot = document.getElementById('sessionDot');
  if (dot && name === 'agent') {
    dot.className = `dot ${info.status}`;
  }
  // Notify panels if services panel is open
  if (window.app.panels) window.app.panels.updateService(name, info);
}

window.app.serviceStatuses = serviceStatuses;
window.app.serviceAction = async function(name, action) {
  try {
    const res = await fetch(`/api/services/${name}/${action}`, { method: 'POST' });
    const data = await res.json();
    updateServiceStatus(name, data.status);
  } catch (err) {
    console.error('Service action failed:', err);
  }
};

// --- Session selector ---
function updateSessionSelector(sessionId) {
  const nameEl = document.getElementById('sessionName');
  if (!nameEl) return;
  if (!sessionId) {
    nameEl.textContent = 'No session';
    return;
  }
  const entry = window.app.terminal?.getEntry(sessionId);
  nameEl.textContent = entry?.name || sessionId;
}

document.getElementById('sessionSelector')?.addEventListener('click', () => {
  // Open sessions panel
  if (window.app.panels) window.app.panels.open('sessions');
});

// --- Fullscreen ---
document.getElementById('btnFullscreen')?.addEventListener('click', () => {
  if (window.app.terminal) window.app.terminal.toggleFullscreen();
});

// --- Command palette button ---
document.getElementById('btnPalette')?.addEventListener('click', () => {
  if (window.app.palette) window.app.palette.open();
});

// --- Health polling (fallback) ---
setInterval(async () => {
  try {
    const res = await fetch('/api/services');
    const data = await res.json();
    for (const name of ['agent', 'bridge']) {
      if (data[name]) updateServiceStatus(name, data[name]);
    }
  } catch { /* dashboard server down */ }
}, 5000);

// --- Window resize ---
window.addEventListener('resize', () => {
  if (window.app.terminal) window.app.terminal.fitActive();
});

// --- Init ---
connectWS();
```

**Note:** The sub-module JS files (terminal.js, input-bar.js, panels.js, palette.js, sessions.js, platform.js) must also be loaded. They can be added to index.html as additional `<script>` tags after app.js, or loaded at the end of app.js with dynamic script insertion. The simplest approach: add `<script>` tags in index.html for each file, in dependency order:
1. `app.js` (core, WebSocket, state)
2. `terminal.js` (terminal management)
3. `input-bar.js` (input + quick actions)
4. `panels.js` (panel system)
5. `palette.js` (command palette)
6. `sessions.js` (session CRUD)
7. `platform.js` (platform toggles)

Update `index.html` to include all scripts:
```html
<script src="/js/app.js"></script>
<script src="/js/terminal.js"></script>
<script src="/js/input-bar.js"></script>
<script src="/js/panels.js"></script>
<script src="/js/palette.js"></script>
<script src="/js/sessions.js"></script>
<script src="/js/platform.js"></script>
```

**Step 2: Remove the old app.js and style.css**

After verifying the new UI works, delete:
- `packages/dashboard/public/app.js` (replaced by `js/app.js`)
- `packages/dashboard/public/style.css` (replaced by `css/*.css`)

**Important:** Only remove these files AFTER confirming the new JS files are fully wired and functional. Until then, keep them as backup reference.

**Step 3: Verify WebSocket connects and terminal data flows**

Run dashboard, verify WebSocket connects (check browser DevTools Network → WS tab). Terminal data should flow to xterm.js. Service status dots should update.

**Step 4: Commit**

```bash
git add packages/dashboard/public/js/app.js packages/dashboard/public/index.html
git commit -m "feat(dashboard): new app.js core with modular architecture"
```

---

## Task 7: Panel System (CSS + JS)

**Files:**
- Create: `packages/dashboard/public/css/panels.css`
- Create: `packages/dashboard/public/js/panels.js`

**Context:** The panel system is the backbone of the mobile navigation. Panels slide up from the bottom with gesture-driven snap points (30%, 50%, 85%). On desktop, panel content renders inside the expanded sidebar instead. The panels.js module also includes the log viewer logic (moved from old app.js) and renders panel content dynamically.

**Step 1: Create panels.css**

Create `packages/dashboard/public/css/panels.css`:

```css
/* Panels — slide-up sheets (mobile), sidebar content (desktop) */

/* === BACKDROP === */
.panel-backdrop {
  display: none;
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.6);
  z-index: var(--z-panel-backdrop);
  opacity: 0;
  transition: opacity var(--duration-normal);
}

.panel-backdrop.visible {
  display: block;
  opacity: 1;
}

/* === PANEL CONTAINER (mobile) === */
.panel-container {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--surface);
  border-radius: var(--radius) var(--radius) 0 0;
  z-index: var(--z-panel);
  transform: translateY(100%);
  transition: transform var(--duration-panel-open) var(--ease-out);
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel-container.open {
  transform: translateY(0);
}

/* Snap points controlled via JS transform */

.panel-drag-handle {
  width: 36px;
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  margin: var(--space-sm) auto;
  flex-shrink: 0;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 var(--space-md) var(--space-md);
}

/* === PANEL HEADER === */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm) 0 var(--space-md);
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--space-md);
}

.panel-header h2 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.panel-header-actions {
  display: flex;
  gap: var(--space-sm);
}

/* === SESSION CARDS === */
.session-card {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-sm);
  cursor: pointer;
  transition: border-color var(--duration-fast);
  min-height: var(--touch-min);
}

.session-card:active {
  background: rgba(88,166,255,0.06);
}

.session-card.active {
  border-left: 3px solid var(--accent);
}

.session-card-info {
  flex: 1;
  min-width: 0;
}

.session-card-name {
  font-size: var(--font-ui);
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-card-path {
  font-size: var(--font-ui-xs);
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-card-status {
  font-size: var(--font-ui-xs);
  color: var(--text-dim);
}

.session-card .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* === LOG VIEWER === */
.log-filter-chips {
  display: flex;
  gap: var(--space-xs);
  margin-bottom: var(--space-sm);
  flex-wrap: wrap;
}

.filter-chip {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius);
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-size: var(--font-ui-xs);
  cursor: pointer;
  min-height: 32px;
  display: flex;
  align-items: center;
}

.filter-chip.active {
  border-color: var(--accent);
  color: var(--accent);
}

.log-scroll {
  background: #010409;
  border-radius: var(--radius-xs);
  padding: var(--space-sm);
  max-height: 60vh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  font-family: var(--font-mono);
  font-size: var(--font-ui-xs);
  line-height: 1.5;
}

.log-line {
  white-space: pre-wrap;
  word-break: break-all;
}

.log-line .ts { color: var(--text-dim); margin-right: var(--space-sm); }
.log-line .svc { font-weight: 600; margin-right: var(--space-sm); }
.log-line .svc.agent { color: var(--accent); }
.log-line .svc.bridge { color: var(--orange); }
.log-line.stderr .msg { color: var(--red); }

/* === SERVICE CARDS === */
.service-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-md);
  margin-bottom: var(--space-sm);
}

.service-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-sm);
}

.service-card-name {
  font-weight: 600;
  font-size: var(--font-ui);
}

.service-status-badge {
  font-size: var(--font-ui-xs);
  padding: 2px var(--space-sm);
  border-radius: var(--radius);
  text-transform: uppercase;
  font-weight: 600;
}

.service-status-badge.running { background: rgba(63,185,80,0.15); color: var(--green); }
.service-status-badge.starting { background: rgba(210,153,34,0.15); color: var(--yellow); }
.service-status-badge.error { background: rgba(248,81,73,0.15); color: var(--red); }
.service-status-badge.stopped { background: var(--border); color: var(--text-dim); }

.service-card-info {
  font-size: var(--font-ui-xs);
  color: var(--text-dim);
  margin-bottom: var(--space-sm);
}

.service-card-actions {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.service-btn {
  padding: var(--space-sm) var(--space-md);
  background: var(--border);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  color: var(--text);
  font-size: var(--font-ui-sm);
  cursor: pointer;
  min-height: var(--touch-min);
  display: flex;
  align-items: center;
  justify-content: center;
}

.service-btn:active { background: #3d444d; }
.service-btn.danger { color: var(--red); }

/* === PLATFORM TOGGLE (in Services panel) === */
.platform-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm) 0;
  border-top: 1px solid var(--border);
  margin-top: var(--space-sm);
}

.platform-toggle-label {
  font-size: var(--font-ui);
  color: var(--text);
}

/* Toggle switch */
.toggle-switch {
  position: relative;
  width: 44px;
  height: 24px;
  background: var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition: background var(--duration-fast);
}

.toggle-switch.active {
  background: var(--green);
}

.toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: #fff;
  border-radius: 50%;
  transition: transform var(--duration-fast);
}

.toggle-switch.active::after {
  transform: translateX(20px);
}

/* === MESSAGE BUBBLES === */
.message-bubble {
  max-width: 85%;
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius);
  margin-bottom: var(--space-sm);
  font-size: var(--font-ui-sm);
  line-height: 1.4;
  word-break: break-word;
}

.message-bubble.incoming {
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom-left-radius: var(--space-xs);
  margin-right: auto;
}

.message-bubble.outgoing {
  background: rgba(88,166,255,0.12);
  border: 1px solid rgba(88,166,255,0.2);
  border-bottom-right-radius: var(--space-xs);
  margin-left: auto;
}

.message-bubble .msg-source {
  font-size: var(--font-ui-xs);
  color: var(--text-dim);
  margin-bottom: 2px;
}

.message-bubble .msg-time {
  font-size: 10px;
  color: var(--text-dim);
  text-align: right;
  margin-top: 2px;
}

.message-bubble.truncated {
  cursor: pointer;
}

.message-bubble.truncated::after {
  content: 'Tap to expand';
  display: block;
  font-size: 10px;
  color: var(--accent);
  margin-top: var(--space-xs);
}

/* === AUDIT LIST === */
.audit-item {
  display: flex;
  gap: var(--space-sm);
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--border);
  font-size: var(--font-ui-sm);
}

.audit-item .audit-time {
  color: var(--text-dim);
  font-size: var(--font-ui-xs);
  flex-shrink: 0;
  width: 70px;
}

.audit-item .audit-event {
  font-weight: 500;
  flex-shrink: 0;
  width: 100px;
}

.audit-item .audit-detail {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit-item.blocked {
  background: rgba(248,81,73,0.06);
}

/* === NEW SESSION PANEL === */
.new-session-panel .recent-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.recent-project-card {
  padding: var(--space-md);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  min-height: var(--touch-min);
}

.recent-project-card:active {
  border-color: var(--accent);
}

.recent-project-card .project-name {
  font-weight: 500;
  font-size: var(--font-ui);
  margin-bottom: 2px;
}

.recent-project-card .project-path {
  font-size: var(--font-ui-xs);
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Folder browser inside panel */
.panel-folder-browser {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  margin-bottom: var(--space-sm);
}

.panel-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: var(--space-sm) var(--space-sm);
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  scrollbar-width: none;
  font-size: var(--font-ui-sm);
}

.panel-breadcrumbs::-webkit-scrollbar { display: none; }

.panel-folder-list {
  max-height: 40vh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.panel-folder-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  cursor: pointer;
  min-height: var(--touch-min);
  font-size: var(--font-ui);
}

.panel-folder-item:active {
  background: rgba(88,166,255,0.08);
}

.panel-input {
  width: 100%;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-xs);
  font-size: var(--font-ui);
  margin-bottom: var(--space-sm);
  min-height: var(--touch-min);
}

.panel-input:focus {
  outline: none;
  border-color: var(--accent);
}

.panel-actions {
  display: flex;
  gap: var(--space-sm);
  justify-content: flex-end;
  margin-top: var(--space-md);
}

.panel-btn {
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-sm);
  font-size: var(--font-ui);
  cursor: pointer;
  min-height: var(--touch-min);
  border: 1px solid var(--border);
  background: var(--border);
  color: var(--text);
}

.panel-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-weight: 600;
}

/* Hide panel container on desktop — sidebar handles it */
@media (min-width: 769px) {
  .panel-container,
  .panel-backdrop,
  .panel-launcher { display: none !important; }
}
```

**Step 2: Create panels.js**

Create `packages/dashboard/public/js/panels.js`:

This module handles:

1. **Panel system** (`open(panelName)`, `close()`, `toggle(panelName)`):
   - On mobile (≤768px): Slides up the `.panel-container`, renders content into `#panelContent`
   - On desktop (>768px): Toggles sidebar expansion, renders content into `#sidebarPanel`
   - Manages backdrop visibility and opacity

2. **Gesture handling** (mobile only):
   - Touch drag on `.panel-drag-handle` moves the panel
   - Snap points at 30%, 50%, 85% of viewport height
   - Velocity-based snap: flick up → next snap, flick down → dismiss
   - Uses `requestAnimationFrame` for smooth 60fps dragging
   - Tap on backdrop dismisses panel

3. **Panel content renderers** — each returns an HTML string:
   - `renderSessionsPanel()` — fetches `/api/sessions`, renders session cards
   - `renderLogsPanel()` — filter chips + log scroll container
   - `renderServicesPanel()` — service cards with status, actions, platform toggles
   - `renderMessagesPanel()` — session picker + chat bubbles
   - `renderAuditPanel()` — audit event list
   - `renderNewSessionPanel()` — recent projects grid + folder browser

4. **Log management** (migrated from old app.js):
   - `appendLog(line)` — appends to internal buffer (max 1000), renders if logs panel is open
   - `logBuffer` array stores all received logs
   - Filter by service (all/agent/bridge)

5. **Service UI updates**:
   - `updateService(name, info)` — updates service card if services panel is open

6. **Desktop sidebar**:
   - Click sidebar buttons → toggle `expanded` class + load panel content
   - `[` key toggles sidebar
   - `1-5` keys open panels by index

Attach to `window.app.panels`.

**Step 3: Verify panels open and close on mobile**

Resize browser to <768px. Tap session selector → sessions panel should slide up. Drag handle should allow dragging. Backdrop tap should dismiss.

**Step 4: Commit**

```bash
git add packages/dashboard/public/css/panels.css packages/dashboard/public/js/panels.js
git commit -m "feat(dashboard): panel system with gesture-driven slide-up sheets"
```

---

## Task 8: Command Palette (CSS + JS)

**Files:**
- Create: `packages/dashboard/public/css/palette.css`
- Create: `packages/dashboard/public/js/palette.js`

**Context:** The command palette is a searchable overlay with 40+ categorized commands. On mobile it slides up from the bottom. On desktop it appears as a centered overlay (VS Code Cmd+K style). All filtering is client-side.

**Step 1: Create palette.css**

Create `packages/dashboard/public/css/palette.css`:

```css
/* Command palette — search + categorized command list */

.palette-backdrop {
  display: none;
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  z-index: var(--z-palette-backdrop);
}

.palette-backdrop.visible { display: block; }

.palette {
  display: none;
  position: fixed;
  z-index: var(--z-palette);
  background: var(--surface);
  border: 1px solid var(--border);
  overflow: hidden;
  flex-direction: column;
}

.palette.open { display: flex; }

/* Mobile: slide up from bottom */
@media (max-width: 768px) {
  .palette {
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 80vh;
    border-radius: var(--radius) var(--radius) 0 0;
  }
}

/* Desktop: centered overlay */
@media (min-width: 769px) {
  .palette {
    top: 15vh;
    left: 50%;
    transform: translateX(-50%);
    width: 520px;
    max-height: 60vh;
    border-radius: var(--radius-sm);
    box-shadow: 0 16px 48px rgba(0,0,0,0.4);
  }
}

.palette-search {
  width: 100%;
  padding: var(--space-md);
  background: var(--bg);
  border: none;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-size: var(--font-ui);
  font-family: var(--font-sans);
}

.palette-search:focus { outline: none; }

.palette-search::placeholder { color: var(--text-dim); }

.palette-list {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.palette-category {
  padding: var(--space-sm) var(--space-md);
  font-size: var(--font-ui-xs);
  color: var(--text-dim);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  position: sticky;
  top: 0;
  background: var(--surface);
  z-index: 1;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  cursor: pointer;
  min-height: var(--touch-min);
  transition: background var(--duration-fast);
  font-size: var(--font-ui);
  color: var(--text);
}

.palette-item:hover,
.palette-item.focused {
  background: rgba(88,166,255,0.08);
}

.palette-item:active {
  transform: scale(0.98);
}

.palette-item .palette-icon {
  font-size: 16px;
  width: 24px;
  text-align: center;
  flex-shrink: 0;
}

.palette-item .palette-label {
  flex: 1;
}

.palette-item .palette-shortcut {
  font-size: var(--font-ui-xs);
  color: var(--text-dim);
  background: var(--bg);
  padding: 2px var(--space-sm);
  border-radius: var(--radius-xs);
}

/* Toggle items (mode switches) */
.palette-item.toggle {
  justify-content: space-between;
}

.palette-item.toggle .toggle-switch {
  flex-shrink: 0;
}

/* Danger items (YOLO mode, kill session) */
.palette-item.danger {
  color: var(--red);
}
```

**Step 2: Create palette.js**

Create `packages/dashboard/public/js/palette.js`:

This module:

1. **Command definitions** — a `COMMANDS` array of objects:
   ```js
   { category: '⚡ Quick Actions', label: 'Compact context', action: () => sendToTerminal('/compact'), icon: '📦' }
   ```
   Include ALL commands from the design doc (Section 4): mode toggles, quick actions, development, superpowers, git & project intel, session management, and custom shortcuts.

2. **Open/close**:
   - `open()` — shows palette + backdrop, focuses search, renders full list
   - `close()` — hides palette + backdrop
   - `Escape` key closes
   - Backdrop click closes

3. **Search filtering**:
   - Keyup on search input filters commands by label (case-insensitive substring)
   - Categories with no matching items are hidden
   - Empty search shows all

4. **Keyboard navigation**:
   - Arrow up/down moves `.focused` class
   - Enter executes focused item
   - Tab also moves focus

5. **Command execution**:
   - Most commands call `app.terminal.sendInput(command + '\r')`
   - Mode toggles update internal state + show toast
   - Session management commands call appropriate API

6. **Keyboard shortcut** to open: `Ctrl+K` / `Cmd+K`

7. **Recent/favorites**: Track most-used commands in `localStorage`, show them at top

Attach to `window.app.palette`.

**Step 3: Verify palette opens, searches, and executes**

Press the `⚡` button → palette opens. Type "compact" → filters to "Compact context". Click/Enter → sends `/compact` to terminal.

**Step 4: Commit**

```bash
git add packages/dashboard/public/css/palette.css packages/dashboard/public/js/palette.js
git commit -m "feat(dashboard): command palette with 40+ searchable commands"
```

---

## Task 9: Sessions Module

**Files:**
- Create: `packages/dashboard/public/js/sessions.js`

**Context:** Manages session CRUD operations — fetching session list, creating new sessions (via the folder browser panel), deleting sessions, and switching between sessions. The folder browser logic is migrated from the old `app.js` but adapted to work inside slide-up panels instead of modals.

**Step 1: Create sessions.js**

This module handles:

1. **Load sessions**: `loadSessions()` — `GET /api/sessions`, returns array
2. **Create session**: `createSession(name, projectPath)` — `POST /api/sessions`
3. **Delete session**: `deleteSession(id)` — `DELETE /api/sessions/:id`
4. **Activate session**: `activateSession(id)` — `POST /api/sessions/:id/activate`
5. **Load messages**: `loadMessages(sessionId)` — `GET /api/sessions/:id/messages?limit=50`
6. **Load audit**: `loadAudit()` — `GET /api/audit?limit=100`
7. **Folder browser**: `browseTo(path)` — `GET /api/browse?path=...`
8. **Recent paths**: localStorage management (same as old app.js)

All functions return data — they don't directly manipulate DOM. The panel renderers (in panels.js) call these functions and render the results.

Attach to `window.app.sessions`.

**Step 2: Verify session operations work**

Create a new session via the sessions panel. Verify it appears in the list. Open it → terminal should activate.

**Step 3: Commit**

```bash
git add packages/dashboard/public/js/sessions.js
git commit -m "feat(dashboard): sessions module (CRUD, folder browser, messages, audit)"
```

---

## Task 10: Platform Toggle Module

**Files:**
- Create: `packages/dashboard/public/js/platform.js`
- Modify: `packages/dashboard/src/api.ts` (add pause toggle endpoint)
- Modify: `packages/bridge/src/index.ts` (add pause support via IPC)

**Context:** Per-platform "Do Not Disturb" that pauses message forwarding for WhatsApp and/or Telegram independently. This requires a small backend change: the dashboard API needs a toggle endpoint, and the bridge needs to support pausing platforms via IPC.

**Step 1: Add pause toggle API endpoint**

Add to `packages/dashboard/src/api.ts`:

```typescript
// Platform pause toggles
const platformPaused: Record<string, boolean> = {};

router.get('/api/platforms', (_req, res) => {
  res.json(platformPaused);
});

router.post('/api/platforms/:name/toggle', (req, res) => {
  const { name } = req.params;
  if (name !== 'whatsapp' && name !== 'telegram') {
    return res.status(400).json({ error: 'Invalid platform' });
  }
  platformPaused[name] = !platformPaused[name];
  // Notify bridge via IPC
  pm.sendToBridge({ type: 'platform_pause', platform: name, paused: platformPaused[name] });
  res.json({ platform: name, paused: platformPaused[name] });
});
```

Also add `sendToBridge` method to ProcessManager if it doesn't exist — it should send IPC messages to the bridge child process, similar to `sendToAgent`.

**Step 2: Add pause support to bridge**

In `packages/bridge/src/index.ts`, listen for IPC messages from the parent process:

```typescript
process.on('message', (msg: any) => {
  if (msg.type === 'platform_pause') {
    // Set a flag that the relay function checks before forwarding responses
    platformPaused[msg.platform] = msg.paused;
  }
});
```

Modify the response relay function to check `platformPaused[platform]` before sending. If paused, queue the message. On un-pause, flush the queue.

**Step 3: Create platform.js frontend module**

Create `packages/dashboard/public/js/platform.js`:

This module:
1. Fetches initial state from `GET /api/platforms`
2. Renders platform indicators in the status bar (📱 for WhatsApp, 💬 for Telegram)
3. Tap toggles → `POST /api/platforms/:name/toggle`
4. Updates indicator opacity (`.paused` class)
5. Also renders toggle switches in the services panel
6. Provides `hapticFeedback('double')` on toggle via `navigator.vibrate([20, 50, 20])`

Attach to `window.app.platform`.

**Step 4: Verify toggle works**

Click the WhatsApp indicator → should dim. Send a WhatsApp message → should not be forwarded. Click again → un-pauses, queued messages flush.

**Step 5: Commit**

```bash
git add packages/dashboard/public/js/platform.js packages/dashboard/src/api.ts packages/bridge/src/index.ts
git commit -m "feat(dashboard): per-platform pause toggles with message queuing"
```

---

## Task 11: Animations CSS

**Files:**
- Create: `packages/dashboard/public/css/animations.css`

**Context:** Polish animations for the dashboard — spring physics for panels, cross-fade for quick actions, micro-interactions, and loading states. Most animation work is done via CSS classes toggled by JS.

**Step 1: Create animations.css**

Create `packages/dashboard/public/css/animations.css`:

```css
/* Animations — transitions, haptics setup, micro-interactions */

/* === PANEL SPRING ANIMATION === */
.panel-container {
  transition: transform var(--duration-panel-open) var(--ease-spring);
}

.panel-container.closing {
  transition-duration: var(--duration-panel-close);
  transition-timing-function: ease-in;
}

.panel-container.dragging {
  transition: none; /* Finger controls position directly */
}

/* === QUICK-ACTION CROSS-FADE === */
.quick-actions {
  position: relative;
}

.quick-btn {
  animation: quickBtnIn var(--duration-normal) var(--ease-spring);
}

@keyframes quickBtnIn {
  from { opacity: 0; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1); }
}

/* === FULLSCREEN TOGGLE === */
.app-container.fullscreen .terminal-viewport {
  animation: fullscreenIn 250ms var(--ease-out);
}

@keyframes fullscreenIn {
  from { transform: scale(0.95); opacity: 0.8; }
  to { transform: scale(1); opacity: 1; }
}

/* === SESSION SWITCH FADE === */
.term-pane {
  transition: opacity var(--duration-fast);
}

.term-pane.switching-in {
  animation: fadeIn var(--duration-fast) ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* === STATUS BADGE PULSE === */
.session-selector .dot.needs-attention {
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* === PALETTE ITEM PRESS === */
.palette-item:active {
  transform: scale(0.97);
  transition: transform 50ms;
}

/* === SWIPE-TO-DELETE === */
.session-card {
  position: relative;
  overflow: hidden;
}

.session-card .delete-reveal {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 80px;
  background: var(--red);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 600;
  font-size: var(--font-ui-sm);
  transform: translateX(100%);
  transition: transform var(--duration-normal) var(--ease-spring);
}

.session-card.swiped .delete-reveal {
  transform: translateX(0);
}

/* === LOADING SKELETON === */
.skeleton {
  background: linear-gradient(90deg, var(--border) 25%, rgba(48,54,61,0.5) 50%, var(--border) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-xs);
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Skeleton shapes */
.skeleton-line {
  height: 14px;
  margin-bottom: var(--space-sm);
}

.skeleton-line.short { width: 60%; }
.skeleton-line.medium { width: 80%; }

.skeleton-card {
  height: 60px;
  margin-bottom: var(--space-sm);
}

/* === PULL TO REFRESH === */
.pull-indicator {
  text-align: center;
  padding: var(--space-sm);
  color: var(--text-dim);
  font-size: var(--font-ui-xs);
  transition: opacity var(--duration-fast);
}

/* === TERMINAL CONNECTING PULSE === */
.connecting-cursor {
  display: inline-block;
  width: 8px;
  height: 16px;
  background: var(--accent);
  animation: cursorPulse 1s ease-in-out infinite;
}

@keyframes cursorPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.2; }
}
```

**Step 2: Commit**

```bash
git add packages/dashboard/public/css/animations.css
git commit -m "feat(dashboard): animations CSS (springs, fades, skeletons, micro-interactions)"
```

---

## Task 12: Cleanup & Final Integration

**Files:**
- Delete: `packages/dashboard/public/app.js` (old)
- Delete: `packages/dashboard/public/style.css` (old)
- Modify: `packages/dashboard/public/sw.js` (update cache list if needed)

**Context:** Remove old frontend files, ensure all new modules are loaded, and do a final integration pass.

**Step 1: Verify all features work end-to-end**

Test checklist (manual):
- [ ] PWA: "Add to Home Screen" works on mobile browser
- [ ] Terminal: xterm.js renders, keystrokes flow bidirectionally
- [ ] Input bar: commands send to terminal, history works
- [ ] Quick actions: buttons change based on terminal state
- [ ] Fullscreen: toggle works, pill shows and fades
- [ ] Session selector: opens sessions panel
- [ ] Panels (mobile): slide-up, drag, snap, dismiss
- [ ] Sidebar (desktop): expands/collapses, shows panel content
- [ ] Command palette: opens, searches, executes
- [ ] Platform toggles: pause/unpause WhatsApp and Telegram
- [ ] Services panel: shows status, restart works
- [ ] Logs panel: filter chips, auto-scroll
- [ ] Messages panel: chat bubbles render
- [ ] Audit panel: event list renders
- [ ] New session: folder browser, recent paths, create
- [ ] Keyboard shortcuts: Ctrl+K, [, 1-5, Esc
- [ ] Animations: panel springs, quick-action cross-fade, skeleton loading
- [ ] Toast notifications appear and auto-dismiss
- [ ] Responsive: works at phone (<480px), tablet (480-768px), desktop (>768px)

**Step 2: Remove old files**

```bash
rm packages/dashboard/public/app.js
rm packages/dashboard/public/style.css
```

**Step 3: Update service worker cache list**

Ensure `sw.js` STATIC_ASSETS array includes all new JS and CSS files.

**Step 4: Final commit**

```bash
git add -A packages/dashboard/public/
git commit -m "feat(dashboard): complete mobile-optimized PWA dashboard redesign

- Terminal-first layout with status bar, quick actions, input bar
- Gesture-driven slide-up panels with snap points (mobile)
- Collapsible sidebar with panel content (desktop)
- Command palette with 40+ searchable commands
- Per-platform pause toggles (WhatsApp/Telegram)
- Context-aware quick-action buttons
- PWA support (manifest, service worker, installable)
- Spring animations, haptic feedback, skeleton loading
- 3-tier responsive breakpoints (phone/tablet/desktop)
- Chat-bubble message view, filter-chip log viewer
- Fullscreen mode with floating session pill"
```

---

## Task Dependencies

```
Task 1 (CSS tokens) ──┐
                       ├── Task 3 (HTML + layout CSS)
Task 2 (PWA) ─────────┘            │
                                    ├── Task 4 (terminal CSS + JS)
                                    ├── Task 5 (input bar + quick actions)
                                    ├── Task 6 (app.js core) ──── depends on 4, 5
                                    ├── Task 7 (panels CSS + JS) ── depends on 6
                                    ├── Task 8 (command palette) ── depends on 6
                                    ├── Task 9 (sessions module) ── depends on 7
                                    ├── Task 10 (platform toggles) ── depends on 7
                                    ├── Task 11 (animations) ── independent
                                    └── Task 12 (cleanup) ── depends on ALL
```

Tasks 1 and 2 can run in parallel. Tasks 4, 5, 11 can run in parallel. Tasks 7, 8 can run in parallel. Tasks 9, 10 can run in parallel.

---

## Backend Changes Summary

Only Task 10 touches backend code:
- `packages/dashboard/src/api.ts`: Add `/api/platforms` and `/api/platforms/:name/toggle` endpoints
- `packages/dashboard/src/process-manager.ts`: Add `sendToBridge()` method if not present
- `packages/bridge/src/index.ts`: Handle `platform_pause` IPC message, queue messages when paused

Everything else is purely frontend (static files in `packages/dashboard/public/`).
