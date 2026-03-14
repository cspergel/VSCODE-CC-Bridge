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
function showToast(message, durationMs) {
  if (durationMs === undefined) durationMs = 3000;
  var container = document.getElementById('toastContainer');
  if (!container) return;
  var toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(function () {
    toast.classList.add('leaving');
    setTimeout(function () { toast.remove(); }, 200);
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

function formatDuration(s) {
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
  return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
}

window.app.escapeHtml = escapeHtml;
window.app.truncate = truncate;
window.app.formatDuration = formatDuration;

// --- Service status tracking ---
var serviceStatuses = { agent: {}, bridge: {} };

function updateServiceStatus(name, info) {
  serviceStatuses[name] = info;
  // Update session dot color based on agent status
  var dot = document.getElementById('sessionDot');
  if (dot && name === 'agent') {
    dot.className = 'dot ' + info.status;
  }
  // Notify panels if services panel is open
  if (window.app.panels && window.app.panels.updateService) {
    window.app.panels.updateService(name, info);
  }
}

window.app.serviceStatuses = serviceStatuses;

window.app.serviceAction = function (name, action) {
  return fetch('/api/services/' + name + '/' + action, { method: 'POST' })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      updateServiceStatus(name, data.status);
    })
    .catch(function (err) {
      console.error('Service action failed:', err);
    });
};

// --- Session selector ---
function updateSessionSelector(sessionId) {
  var nameEl = document.getElementById('sessionName');
  if (!nameEl) return;
  if (!sessionId) {
    nameEl.textContent = 'No session';
    return;
  }
  var entry = window.app.terminal ? window.app.terminal.getEntry(sessionId) : null;
  nameEl.textContent = (entry && entry.name) ? entry.name : sessionId;
}

(function () {
  var sel = document.getElementById('sessionSelector');
  if (sel) {
    sel.addEventListener('click', function () {
      // Open sessions panel
      if (window.app.panels && window.app.panels.open) {
        window.app.panels.open('sessions');
      }
    });
  }
})();

// --- WebSocket ---
function connectWS() {
  var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  var ws = new WebSocket(proto + '//' + location.host + '/ws');
  window.app.ws = ws;

  ws.onmessage = function (ev) {
    var msg = JSON.parse(ev.data);

    switch (msg.type) {
      case 'history':
        // Log history buffer on connect
        if (window.app.panels && window.app.panels.appendLog) {
          for (var i = 0; i < msg.data.length; i++) {
            window.app.panels.appendLog(msg.data[i]);
          }
        }
        break;

      case 'log':
        if (window.app.panels && window.app.panels.appendLog) {
          window.app.panels.appendLog(msg.data);
        }
        break;

      case 'status':
        updateServiceStatus(msg.data.name, msg.data);
        break;

      case 'terminal_data': {
        var sessionId = msg.data.sessionId;
        var data = msg.data.data;
        if (window.app.terminal) {
          window.app.terminal.writeData(sessionId, data);
          // Auto-switch to first session
          if (!window.app.activeSessionId) {
            window.app.terminal.switchTo(sessionId);
            window.app.activeSessionId = sessionId;
            updateSessionSelector(sessionId);
          }
          // Context detection for quick actions
          if (window.app.inputBar && sessionId === window.app.activeSessionId) {
            var context = window.app.inputBar.detectContext(data);
            window.app.inputBar.setContext(context);
          }
        }
        break;
      }

      case 'sessions_update':
        if (window.app.terminal && Array.isArray(msg.data.sessions)) {
          for (var j = 0; j < msg.data.sessions.length; j++) {
            var s = msg.data.sessions[j];
            window.app.terminal.updateSessionName(s.id, s.name);
          }
          updateSessionSelector(window.app.activeSessionId);
        }
        break;
    }
  };

  ws.onclose = function () {
    setTimeout(connectWS, 2000);
  };
  ws.onerror = function () {};
}

// --- Button event listeners ---
(function () {
  var btnFullscreen = document.getElementById('btnFullscreen');
  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', function () {
      if (window.app.terminal) window.app.terminal.toggleFullscreen();
    });
  }

  var btnPalette = document.getElementById('btnPalette');
  if (btnPalette) {
    btnPalette.addEventListener('click', function () {
      if (window.app.palette) window.app.palette.open();
    });
  }
})();

// --- Health polling (fallback) ---
setInterval(function () {
  fetch('/api/services')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var names = ['agent', 'bridge'];
      for (var i = 0; i < names.length; i++) {
        if (data[names[i]]) updateServiceStatus(names[i], data[names[i]]);
      }
    })
    .catch(function () { /* dashboard server down */ });
}, 5000);

// --- Window resize ---
window.addEventListener('resize', function () {
  if (window.app.terminal) window.app.terminal.fitActive();
});

// --- Init ---
connectWS();
