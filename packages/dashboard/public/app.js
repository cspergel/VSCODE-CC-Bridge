/* global WebSocket, fetch, Terminal, FitAddon */

const MAX_LOG_LINES = 1000;
const SCROLLBACK = 5000;
let logFilter = "all";
let ws = null;

// --- Folder Browser State ---
let currentBrowsePath = null;
let selectedProjectPath = null;
let selectedIsGitRepo = false;
const RECENT_PATHS_KEY = "claudeBridge_recentPaths";
const MAX_RECENT_PATHS = 8;

// --- Multi-Terminal State ---
const terminals = new Map(); // sessionId → { term, fitAddon, container, name }
let activeSessionId = null;

const TERM_OPTIONS = {
  cursorBlink: true,
  fontSize: 14,
  fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
  theme: {
    background: "#000000",
    foreground: "#c9d1d9",
    cursor: "#58a6ff",
    selectionBackground: "rgba(88,166,255,0.3)",
  },
  scrollback: SCROLLBACK,
  allowProposedApi: true,
};

function getOrCreateTerminal(sessionId, name) {
  if (terminals.has(sessionId)) {
    const entry = terminals.get(sessionId);
    if (name && entry.name !== name) entry.name = name;
    return entry;
  }

  const container = document.createElement("div");
  container.className = "term-pane";
  container.dataset.sessionId = sessionId;
  document.getElementById("terminalContainer").appendChild(container);

  const term = new Terminal(TERM_OPTIONS);
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(container);

  // Send keystrokes only for the active session
  term.onData((data) => {
    if (ws && ws.readyState === WebSocket.OPEN && activeSessionId === sessionId) {
      ws.send(JSON.stringify({ type: "terminal_input", sessionId, data }));
    }
  });

  // Send resize only for the active session
  term.onResize(({ cols, rows }) => {
    if (ws && ws.readyState === WebSocket.OPEN && activeSessionId === sessionId) {
      ws.send(JSON.stringify({ type: "terminal_resize", sessionId, cols, rows }));
    }
  });

  const entry = { term, fitAddon, container, name: name || sessionId };
  terminals.set(sessionId, entry);
  renderSessionTabs();
  return entry;
}

function switchToSession(sessionId) {
  if (!terminals.has(sessionId)) return;
  activeSessionId = sessionId;

  // Show/hide term panes
  for (const [id, entry] of terminals) {
    if (id === sessionId) {
      entry.container.classList.add("active");
    } else {
      entry.container.classList.remove("active");
    }
  }

  // Refit active terminal
  const active = terminals.get(sessionId);
  if (active) {
    active.fitAddon.fit();
    active.term.focus();
    // Sync dimensions with agent
    if (ws && ws.readyState === WebSocket.OPEN) {
      const dims = active.fitAddon.proposeDimensions();
      if (dims) {
        ws.send(JSON.stringify({
          type: "terminal_resize", sessionId,
          cols: dims.cols, rows: dims.rows,
        }));
      }
    }
  }

  renderSessionTabs();
}

function renderSessionTabs() {
  const bar = document.getElementById("sessionTabBar");
  if (!bar) return;

  // Remove existing tabs (keep the + button)
  const addBtn = document.getElementById("btnNewSession");
  bar.innerHTML = "";

  for (const [id, entry] of terminals) {
    const tab = document.createElement("button");
    tab.className = `session-tab${id === activeSessionId ? " active" : ""}`;
    tab.dataset.sessionId = id;

    const label = document.createElement("span");
    label.textContent = entry.name;
    tab.appendChild(label);

    const close = document.createElement("span");
    close.className = "tab-close";
    close.textContent = "\u00d7";
    close.title = "Close session";
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      closeSession(id);
    });
    tab.appendChild(close);

    tab.addEventListener("click", () => switchToSession(id));
    bar.appendChild(tab);
  }

  bar.appendChild(addBtn);
}

function closeSession(sessionId) {
  const entry = terminals.get(sessionId);
  if (!entry) return;

  entry.term.dispose();
  entry.container.remove();
  terminals.delete(sessionId);

  // Auto-switch to another session
  if (activeSessionId === sessionId) {
    const remaining = [...terminals.keys()];
    if (remaining.length > 0) {
      switchToSession(remaining[0]);
    } else {
      activeSessionId = null;
    }
  }

  renderSessionTabs();
}

// --- WebSocket ---
function connectWS() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/ws`);

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "history") {
      for (const line of msg.data) appendLog(line);
    } else if (msg.type === "log") {
      appendLog(msg.data);
    } else if (msg.type === "status") {
      updateServiceUI(msg.data.name, msg.data);
    } else if (msg.type === "terminal_data") {
      const sessionId = msg.data.sessionId;
      // Lazily create terminal for new sessions
      const entry = getOrCreateTerminal(sessionId, sessionId);
      // Write data regardless of whether this is the active tab
      entry.term.write(msg.data.data);

      // Auto-switch to first session
      if (!activeSessionId) {
        switchToSession(sessionId);
      }
    } else if (msg.type === "sessions_update") {
      handleSessionsUpdate(msg.data.sessions);
    }
  };

  ws.onclose = () => setTimeout(connectWS, 2000);
  ws.onerror = () => {};
}

function handleSessionsUpdate(sessions) {
  if (!Array.isArray(sessions)) return;

  // Update names for existing terminals, create entries for new sessions
  for (const s of sessions) {
    if (terminals.has(s.id)) {
      const entry = terminals.get(s.id);
      if (entry.name !== s.name) {
        entry.name = s.name;
      }
    }
    // Don't auto-create terminals for sessions without PTY data yet
  }

  renderSessionTabs();
}

// --- Window resize: refit only active terminal ---
window.addEventListener("resize", () => {
  if (activeSessionId && document.getElementById("tab-terminal").style.display !== "none") {
    const entry = terminals.get(activeSessionId);
    if (entry) entry.fitAddon.fit();
  }
});

// --- Folder Browser Helpers ---
function getRecentPaths() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_PATHS_KEY) || "[]");
  } catch { return []; }
}

function addRecentPath(p) {
  let paths = getRecentPaths().filter((x) => x !== p);
  paths.unshift(p);
  if (paths.length > MAX_RECENT_PATHS) paths = paths.slice(0, MAX_RECENT_PATHS);
  localStorage.setItem(RECENT_PATHS_KEY, JSON.stringify(paths));
}

function removeRecentPath(p) {
  const paths = getRecentPaths().filter((x) => x !== p);
  localStorage.setItem(RECENT_PATHS_KEY, JSON.stringify(paths));
}

function renderRecentPaths() {
  const recents = getRecentPaths();
  const wrap = document.getElementById("recentPaths");
  const chips = document.getElementById("recentChips");
  if (!recents.length) { wrap.style.display = "none"; return; }

  wrap.style.display = "";
  chips.innerHTML = "";
  for (const p of recents) {
    const chip = document.createElement("span");
    chip.className = "recent-chip";
    // Show just the last folder name as display
    const label = p.split(/[\\/]/).filter(Boolean).pop() || p;
    chip.title = p;

    const text = document.createElement("span");
    text.textContent = label;
    chip.appendChild(text);

    const remove = document.createElement("span");
    remove.className = "chip-remove";
    remove.textContent = "\u00d7";
    remove.addEventListener("click", (e) => {
      e.stopPropagation();
      removeRecentPath(p);
      renderRecentPaths();
    });
    chip.appendChild(remove);

    chip.addEventListener("click", () => {
      selectPath(p, false);
      browseTo(p);
    });
    chips.appendChild(chip);
  }
}

async function browseTo(dirPath) {
  const list = document.getElementById("browserList");
  list.innerHTML = '<div class="browser-loading">Loading...</div>';

  try {
    const url = dirPath ? `/api/browse?path=${encodeURIComponent(dirPath)}` : "/api/browse";
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json();
      list.innerHTML = `<div class="browser-empty">${escapeHtml(err.error || "Error")}</div>`;
      return;
    }
    const data = await res.json();
    currentBrowsePath = data.current;

    // Select current directory
    selectPath(data.current, data.currentIsGitRepo);

    // Render breadcrumbs
    renderBreadcrumbs(data.segments);

    // Render folder list
    list.innerHTML = "";
    if (!data.entries.length) {
      list.innerHTML = '<div class="browser-empty">No subfolders</div>';
      return;
    }
    for (const entry of data.entries) {
      const row = document.createElement("div");
      row.className = "browser-item";
      row.innerHTML =
        `<span class="folder-icon">\uD83D\uDCC1</span>` +
        `<span class="folder-name">${escapeHtml(entry.name)}</span>` +
        (entry.isGitRepo ? '<span class="git-badge">git</span>' : "");
      row.addEventListener("click", () => browseTo(entry.path));
      list.appendChild(row);
    }
  } catch (err) {
    list.innerHTML = `<div class="browser-empty">Failed to load</div>`;
    console.error("Browse error:", err);
  }
}

function renderBreadcrumbs(segments) {
  const bar = document.getElementById("browserBreadcrumbs");
  bar.innerHTML = "";
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.className = "breadcrumb-sep";
      sep.textContent = "/";
      bar.appendChild(sep);
    }
    const seg = document.createElement("span");
    seg.className = "breadcrumb-seg";
    seg.textContent = segments[i].name;
    seg.addEventListener("click", () => browseTo(segments[i].path));
    bar.appendChild(seg);
  }
  // Auto-scroll breadcrumbs to end
  bar.scrollLeft = bar.scrollWidth;
}

function selectPath(path, isGitRepo) {
  selectedProjectPath = path;
  selectedIsGitRepo = isGitRepo;

  const bar = document.getElementById("selectedPathBar");
  const text = document.getElementById("selectedPathText");
  const badge = document.getElementById("selectedGitBadge");
  bar.style.display = "flex";
  text.textContent = path;
  text.title = path;
  badge.style.display = isGitRepo ? "" : "none";

  // Auto-fill session name from folder name (unless user edited it)
  const nameInput = document.getElementById("modalSessionName");
  if (!nameInput.dataset.userEdited) {
    const folderName = path.split(/[\\/]/).filter(Boolean).pop() || "";
    nameInput.value = folderName;
  }
}

// --- New Session Modal ---
document.getElementById("btnNewSession").addEventListener("click", () => {
  // Reset state
  selectedProjectPath = null;
  selectedIsGitRepo = false;
  const nameInput = document.getElementById("modalSessionName");
  nameInput.value = "";
  nameInput.dataset.userEdited = "";
  document.getElementById("selectedPathBar").style.display = "none";
  document.getElementById("manualPathWrap").style.display = "none";
  document.getElementById("modalSessionPath").value = "";

  document.getElementById("newSessionModal").classList.add("open");

  // Render recent paths and start browsing
  renderRecentPaths();
  const recents = getRecentPaths();
  // Browse to parent of most recent, or home
  const startPath = recents.length > 0
    ? recents[0].split(/[\\/]/).slice(0, -1).join("\\") || recents[0]
    : null;
  browseTo(startPath);
});

// Track if user manually edited the name
document.getElementById("modalSessionName").addEventListener("input", () => {
  document.getElementById("modalSessionName").dataset.userEdited = "1";
});

document.getElementById("btnModalCancel").addEventListener("click", () => {
  document.getElementById("newSessionModal").classList.remove("open");
});

document.getElementById("btnModalCreate").addEventListener("click", createSession);

// Manual path toggle
document.getElementById("btnManualToggle").addEventListener("click", (e) => {
  e.preventDefault();
  const wrap = document.getElementById("manualPathWrap");
  const visible = wrap.style.display !== "none";
  wrap.style.display = visible ? "none" : "";
  if (!visible) document.getElementById("modalSessionPath").focus();
});

// Enter in manual path field → browse to it
document.getElementById("modalSessionPath").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const val = e.target.value.trim();
    if (val) browseTo(val);
  }
});

// Close modal on backdrop click
document.getElementById("newSessionModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.classList.remove("open");
  }
});

async function createSession() {
  const nameInput = document.getElementById("modalSessionName");
  const pathInput = document.getElementById("modalSessionPath");
  const name = nameInput.value.trim();
  const projectPath = selectedProjectPath || pathInput.value.trim();

  if (!name || !projectPath) {
    alert("Enter both a name and project path");
    return;
  }

  try {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, projectPath }),
    });
    const data = await res.json();

    if (!res.ok) {
      // If session already exists, try to activate the existing one instead
      if (res.status === 409) {
        const activated = await activateExistingSession(name, projectPath);
        if (activated) return;
      }
      alert(data.error || "Failed to create session");
      return;
    }

    // Save to recent paths
    addRecentPath(projectPath);
    closeModalAndSwitch(data.id, name);
  } catch (err) {
    console.error("Failed to create session:", err);
  }
}

async function activateExistingSession(name, projectPath) {
  try {
    // Find the existing session by name or path
    const listRes = await fetch("/api/sessions/live");
    const sessions = await listRes.json();
    const existing = sessions.find((s) => s.name === name || s.projectPath === projectPath);
    if (!existing) return false;

    const actRes = await fetch(`/api/sessions/${existing.id}/activate`, { method: "POST" });
    if (!actRes.ok) return false;

    addRecentPath(projectPath);
    closeModalAndSwitch(existing.id, existing.name);
    return true;
  } catch {
    return false;
  }
}

function closeModalAndSwitch(sessionId, name) {
  const nameInput = document.getElementById("modalSessionName");
  const pathInput = document.getElementById("modalSessionPath");
  nameInput.value = "";
  nameInput.dataset.userEdited = "";
  pathInput.value = "";
  selectedProjectPath = null;
  document.getElementById("newSessionModal").classList.remove("open");

  getOrCreateTerminal(sessionId, name);
  switchToSession(sessionId);
}

// --- Logs ---
const logViewer = document.getElementById("logViewer");

function appendLog(line) {
  const el = document.createElement("div");
  el.className = `log-line ${line.stream}`;
  el.dataset.service = line.service;

  const ts = line.ts ? new Date(line.ts).toLocaleTimeString() : "";
  el.innerHTML =
    `<span class="ts">${ts}</span>` +
    `<span class="svc ${line.service}">[${line.service}]</span>` +
    `<span class="msg">${escapeHtml(line.text)}</span>`;

  // Apply filter
  if (logFilter !== "all" && line.service !== logFilter) {
    el.style.display = "none";
  }

  logViewer.appendChild(el);

  // Cap DOM lines
  while (logViewer.children.length > MAX_LOG_LINES) {
    logViewer.removeChild(logViewer.firstChild);
  }

  if (document.getElementById("autoScroll").checked) {
    logViewer.scrollTop = logViewer.scrollHeight;
  }
}

function clearLogs() {
  logViewer.innerHTML = "";
}

function applyLogFilter(filter) {
  logFilter = filter;
  for (const el of logViewer.children) {
    if (filter === "all") {
      el.style.display = "";
    } else {
      el.style.display = el.dataset.service === filter ? "" : "none";
    }
  }
}

// Filter radio buttons
document.querySelectorAll('input[name="logFilter"]').forEach((radio) => {
  radio.addEventListener("change", (e) => applyLogFilter(e.target.value));
});

// --- Service Control ---
async function serviceAction(name, action) {
  try {
    const res = await fetch(`/api/services/${name}/${action}`, { method: "POST" });
    const data = await res.json();
    updateServiceUI(name, data.status);
  } catch (err) {
    console.error("Service action failed:", err);
  }
}

function updateServiceUI(name, info) {
  // Update dot
  const dot = document.getElementById(`dot-${name}`);
  if (dot) {
    dot.className = `dot ${info.status}`;
  }

  // Update badge
  const badge = document.getElementById(`status-${name}`);
  if (badge) {
    badge.textContent = info.status;
    badge.className = `status-badge ${info.status}`;
  }

  // Update info
  const pidEl = document.getElementById(`pid-${name}`);
  if (pidEl) {
    pidEl.textContent = info.pid ? `PID: ${info.pid}` : "";
  }

  const uptimeEl = document.getElementById(`uptime-${name}`);
  if (uptimeEl && info.startedAt) {
    const ago = Math.round((Date.now() - new Date(info.startedAt).getTime()) / 1000);
    uptimeEl.textContent = ago > 0 ? ` | Up: ${formatDuration(ago)}` : "";
  }
}

function formatDuration(s) {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

// --- Tabs ---
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => (c.style.display = "none"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).style.display = "block";

    // Auto-load data / refit terminal for selected tab
    if (tab.dataset.tab === "terminal" && activeSessionId) {
      const entry = terminals.get(activeSessionId);
      if (entry) entry.fitAddon.fit();
    }
    if (tab.dataset.tab === "sessions") loadSessions();
    if (tab.dataset.tab === "messages") loadSessionsAndAutoSelect();
    if (tab.dataset.tab === "audit") loadAudit();
  });
});

// --- Sessions ---
async function loadSessions() {
  try {
    const res = await fetch("/api/sessions");
    const sessions = await res.json();
    const tbody = document.querySelector("#sessionsTable tbody");
    tbody.innerHTML = "";

    // Also populate message session dropdown
    const select = document.getElementById("msgSessionSelect");
    select.innerHTML = '<option value="">Select session...</option>';

    for (const s of sessions) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        `<td>${escapeHtml(s.name)}</td>` +
        `<td>${escapeHtml(s.status)}</td>` +
        `<td title="${escapeHtml(s.projectPath)}">${escapeHtml(truncate(s.projectPath, 40))}</td>` +
        `<td>${s.lastActivityAt || ""}</td>` +
        `<td><button onclick="openSession('${s.id}', '${escapeHtml(s.name)}')" style="color:var(--green)">Open</button> ` +
        `<button onclick="loadMessagesFor('${s.id}')">Messages</button> ` +
        `<button onclick="deleteSession('${s.id}', '${escapeHtml(s.name)}')" style="color:var(--red)">Delete</button></td>`;
      tbody.appendChild(tr);

      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      select.appendChild(opt);
    }
  } catch (err) {
    console.error("Failed to load sessions:", err);
  }
}

async function openSession(id, name) {
  try {
    const res = await fetch(`/api/sessions/${id}/activate`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Failed to activate session");
      return;
    }
    // Create terminal tab and switch to it
    getOrCreateTerminal(id, name);
    switchToSession(id);
    // Switch to terminal tab
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => (c.style.display = "none"));
    document.querySelector('[data-tab="terminal"]').classList.add("active");
    document.getElementById("tab-terminal").style.display = "block";
    const entry = terminals.get(id);
    if (entry) entry.fitAddon.fit();
  } catch (err) {
    console.error("Failed to open session:", err);
  }
}

async function deleteSession(id, name) {
  if (!confirm(`Delete session "${name}"? This removes the session and all its messages.`)) return;
  try {
    const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Failed to delete session");
      return;
    }
    // Close terminal tab if open
    closeSession(id);
    loadSessions();
  } catch (err) {
    console.error("Failed to delete session:", err);
  }
}

// --- Messages ---
async function loadSessionsAndAutoSelect() {
  await loadSessions();
  const select = document.getElementById("msgSessionSelect");
  // Auto-select first session and load its messages
  if (select.options.length > 1 && !select.value) {
    select.selectedIndex = 1;
    await loadMessagesFor(select.value);
  } else if (select.value) {
    await loadMessagesFor(select.value);
  }
}

async function loadMessages() {
  const sessionId = document.getElementById("msgSessionSelect").value;
  if (!sessionId) return;
  await loadMessagesFor(sessionId);
}

async function loadMessagesFor(sessionId) {
  try {
    // Switch to messages tab
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => (c.style.display = "none"));
    document.querySelector('[data-tab="messages"]').classList.add("active");
    document.getElementById("tab-messages").style.display = "block";

    const res = await fetch(`/api/sessions/${sessionId}/messages?limit=50`);
    const messages = await res.json();
    const tbody = document.querySelector("#messagesTable tbody");
    tbody.innerHTML = "";

    for (const m of messages) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        `<td>${m.seq}</td>` +
        `<td>${m.timestamp || ""}</td>` +
        `<td>${escapeHtml(m.source)}</td>` +
        `<td>${escapeHtml(m.classification)}</td>` +
        `<td title="${escapeHtml(m.rawContent)}">${escapeHtml(truncate(m.formattedContent || m.rawContent, 80))}</td>`;
      tbody.appendChild(tr);
    }

    // Update dropdown
    document.getElementById("msgSessionSelect").value = sessionId;
  } catch (err) {
    console.error("Failed to load messages:", err);
  }
}

// --- Audit ---
async function loadAudit() {
  try {
    const res = await fetch("/api/audit?limit=100");
    const logs = await res.json();
    const tbody = document.querySelector("#auditTable tbody");
    tbody.innerHTML = "";

    for (const l of logs) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        `<td>${l.timestamp || ""}</td>` +
        `<td>${escapeHtml(l.event)}</td>` +
        `<td>${escapeHtml(l.source)}</td>` +
        `<td title="${escapeHtml(l.detail)}">${escapeHtml(truncate(l.detail, 60))}</td>` +
        `<td>${l.blocked ? "Yes" : ""}</td>`;
      tbody.appendChild(tr);
    }
  } catch (err) {
    console.error("Failed to load audit:", err);
  }
}

// --- Health Polling (fallback) ---
setInterval(async () => {
  try {
    const res = await fetch("/api/services");
    const data = await res.json();
    for (const name of ["agent", "bridge"]) {
      if (data[name]) updateServiceUI(name, data[name]);
    }
  } catch {
    // Dashboard server itself is down
  }
}, 5000);

// --- Helpers ---
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "..." : str;
}

// --- WhatsApp Re-link ---
document.getElementById("btnRelink").addEventListener("click", async () => {
  if (!confirm("Re-link WhatsApp? This will clear the current session and generate a new QR code in the Logs tab.")) return;
  try {
    const res = await fetch("/api/relink", { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      // Switch to logs tab so they can see the QR code
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((c) => (c.style.display = "none"));
      document.querySelector('[data-tab="logs"]').classList.add("active");
      document.getElementById("tab-logs").style.display = "block";
    } else {
      alert(data.error || "Failed to re-link");
    }
  } catch (err) {
    console.error("Re-link failed:", err);
  }
});

// --- Dashboard Restart ---
document.getElementById("btnRestartDashboard").addEventListener("click", async () => {
  const btn = document.getElementById("btnRestartDashboard");
  if (btn.classList.contains("restarting")) return;
  btn.classList.add("restarting");
  try {
    await fetch("/api/restart", { method: "POST" });
  } catch { /* server is restarting */ }
  // Poll until server comes back
  const poll = setInterval(async () => {
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        clearInterval(poll);
        location.reload();
      }
    } catch { /* still restarting */ }
  }, 1000);
  // Give up after 30s
  setTimeout(() => { clearInterval(poll); btn.classList.remove("restarting"); }, 30000);
});

// --- Init ---
connectWS();
loadSessions();
