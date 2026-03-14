/* global Terminal, FitAddon, WebSocket */

/**
 * TerminalManager — manages multiple xterm.js instances (one per session),
 * touch handling (double-tap zoom, long-press copy), and fullscreen mode.
 *
 * Attaches to window.app.terminal.
 */
(function () {
  'use strict';

  const SCROLLBACK = 5000;

  // Read terminal font size from CSS variable
  function getTermFontSize() {
    return parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--font-term')
    ) || 14;
  }

  const TERM_OPTIONS = {
    cursorBlink: true,
    fontSize: getTermFontSize(),
    fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    theme: {
      background: '#000000',
      foreground: '#c9d1d9',
      cursor: '#58a6ff',
      selectionBackground: 'rgba(88,166,255,0.3)',
    },
    scrollback: SCROLLBACK,
    allowProposedApi: true,
  };

  // --- State ---
  const terminals = new Map(); // sessionId -> { term, fitAddon, container, name }
  let activeSessionId = null;
  let fullscreenPillTimer = null;

  // --- Touch state ---
  let lastTapTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  let longPressTimer = null;
  let touchStartX = 0;
  let touchStartY = 0;

  // --- Helpers ---
  function getWs() {
    return window.app && window.app.ws;
  }

  function wsReady() {
    var ws = getWs();
    return ws && ws.readyState === WebSocket.OPEN;
  }

  // --- Terminal CRUD ---

  /**
   * getOrCreate(sessionId, name)
   * Creates an xterm.js Terminal + FitAddon in a .term-pane div if it doesn't
   * already exist. Hooks up term.onData() to send keystrokes via WebSocket.
   * Returns { term, fitAddon, container, name }.
   */
  function getOrCreate(sessionId, name) {
    if (terminals.has(sessionId)) {
      var entry = terminals.get(sessionId);
      if (name && entry.name !== name) entry.name = name;
      return entry;
    }

    var container = document.createElement('div');
    container.className = 'term-pane';
    container.dataset.sessionId = sessionId;
    document.getElementById('terminalContainer').appendChild(container);

    // Re-read font size in case CSS variables changed (responsive breakpoints)
    var opts = Object.assign({}, TERM_OPTIONS, { fontSize: getTermFontSize() });

    var term = new Terminal(opts);
    var fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);

    // Send keystrokes only for the active session
    term.onData(function (data) {
      if (wsReady() && activeSessionId === sessionId) {
        getWs().send(JSON.stringify({
          type: 'terminal_input',
          sessionId: sessionId,
          data: data,
        }));
      }
    });

    // Send resize only for the active session
    term.onResize(function (size) {
      if (wsReady() && activeSessionId === sessionId) {
        getWs().send(JSON.stringify({
          type: 'terminal_resize',
          sessionId: sessionId,
          cols: size.cols,
          rows: size.rows,
        }));
      }
    });

    var entry = { term: term, fitAddon: fitAddon, container: container, name: name || sessionId };
    terminals.set(sessionId, entry);
    return entry;
  }

  /**
   * switchTo(sessionId)
   * Shows the pane for this session, hides all others, fits the terminal,
   * and sends a resize message to the WebSocket.
   */
  function switchTo(sessionId) {
    if (!terminals.has(sessionId)) return;
    activeSessionId = sessionId;
    window.app.activeSessionId = sessionId;

    // Show/hide term panes
    terminals.forEach(function (entry, id) {
      if (id === sessionId) {
        entry.container.classList.add('active');
      } else {
        entry.container.classList.remove('active');
      }
    });

    // Refit active terminal
    var active = terminals.get(sessionId);
    if (active) {
      try {
        active.fitAddon.fit();
      } catch (e) { /* terminal may not be visible yet */ }
      active.term.focus();

      // Sync dimensions with agent
      if (wsReady()) {
        try {
          var dims = active.fitAddon.proposeDimensions();
          if (dims) {
            getWs().send(JSON.stringify({
              type: 'terminal_resize',
              sessionId: sessionId,
              cols: dims.cols,
              rows: dims.rows,
            }));
          }
        } catch (e) { /* ignore */ }
      }
    }

    // Update fullscreen pill if in fullscreen
    updateFullscreenPill();
  }

  /**
   * close(sessionId)
   * Disposes the terminal, removes its pane, and auto-switches to another
   * session if the closed one was active.
   */
  function close(sessionId) {
    var entry = terminals.get(sessionId);
    if (!entry) return;

    entry.term.dispose();
    entry.container.remove();
    terminals.delete(sessionId);

    // Auto-switch to another session
    if (activeSessionId === sessionId) {
      var remaining = Array.from(terminals.keys());
      if (remaining.length > 0) {
        switchTo(remaining[0]);
      } else {
        activeSessionId = null;
        window.app.activeSessionId = null;
      }
    }
  }

  /**
   * writeData(sessionId, data)
   * Writes data to a terminal. Creates the terminal lazily if it doesn't exist.
   */
  function writeData(sessionId, data) {
    var entry = getOrCreate(sessionId, sessionId);
    entry.term.write(data);
  }

  /**
   * sendInput(data)
   * Sends data to the active session's PTY via WebSocket.
   */
  function sendInput(data) {
    if (!activeSessionId || !wsReady()) return;
    getWs().send(JSON.stringify({
      type: 'terminal_input',
      sessionId: activeSessionId,
      data: data,
    }));
  }

  /**
   * fitActive()
   * Refits the active terminal. Call on window resize or panel open/close.
   */
  function fitActive() {
    if (!activeSessionId) return;
    var entry = terminals.get(activeSessionId);
    if (entry) {
      try {
        entry.fitAddon.fit();
      } catch (e) { /* terminal may not be ready */ }
    }
  }

  /**
   * getActiveSessionId()
   * Returns the currently active session ID.
   */
  function getActiveSessionId() {
    return activeSessionId;
  }

  /**
   * getEntry(sessionId)
   * Returns the terminal entry object { term, fitAddon, container, name }.
   */
  function getEntry(sessionId) {
    return terminals.get(sessionId) || null;
  }

  /**
   * updateSessionName(id, name)
   * Updates the name for an existing terminal session.
   */
  function updateSessionName(id, name) {
    var entry = terminals.get(id);
    if (entry && name) {
      entry.name = name;
    }
  }

  // --- Fullscreen ---

  /**
   * toggleFullscreen()
   * Adds/removes .fullscreen class on #app. Updates the floating pill.
   * Pill auto-fades after 3 seconds.
   */
  function toggleFullscreen() {
    var appEl = document.getElementById('app');
    if (!appEl) return;

    appEl.classList.toggle('fullscreen');
    var isFullscreen = appEl.classList.contains('fullscreen');

    if (isFullscreen) {
      updateFullscreenPill();
    }

    // Refit terminal after fullscreen transition
    setTimeout(function () {
      fitActive();
    }, 50);
  }

  function updateFullscreenPill() {
    var pill = document.getElementById('fullscreenPill');
    var nameEl = document.getElementById('fullscreenSessionName');
    if (!pill || !nameEl) return;

    var appEl = document.getElementById('app');
    if (!appEl || !appEl.classList.contains('fullscreen')) return;

    // Set session name on pill
    var entry = activeSessionId ? terminals.get(activeSessionId) : null;
    nameEl.textContent = entry ? entry.name : 'No session';

    // Reset fade
    pill.classList.remove('faded');

    // Clear any previous timer
    if (fullscreenPillTimer) {
      clearTimeout(fullscreenPillTimer);
    }

    // Auto-fade after 3 seconds
    fullscreenPillTimer = setTimeout(function () {
      pill.classList.add('faded');
    }, 3000);
  }

  // --- Touch handling ---

  function setupTouchHandlers() {
    var termContainer = document.getElementById('terminalContainer');
    if (!termContainer) return;

    // Double-tap detection
    termContainer.addEventListener('touchend', function (e) {
      var now = Date.now();
      var touch = e.changedTouches[0];
      if (!touch) return;

      var dx = Math.abs(touch.clientX - lastTapX);
      var dy = Math.abs(touch.clientY - lastTapY);
      var dt = now - lastTapTime;

      if (dt < 300 && dx < 30 && dy < 30) {
        // Double-tap detected
        onDoubleTap(touch.clientX, touch.clientY);
        lastTapTime = 0; // reset to avoid triple-tap
      } else {
        lastTapTime = now;
        lastTapX = touch.clientX;
        lastTapY = touch.clientY;
      }
    }, { passive: true });

    // Long-press detection
    termContainer.addEventListener('touchstart', function (e) {
      var touch = e.touches[0];
      if (!touch) return;

      touchStartX = touch.clientX;
      touchStartY = touch.clientY;

      longPressTimer = setTimeout(function () {
        onLongPress();
      }, 500);
    }, { passive: true });

    termContainer.addEventListener('touchmove', function (e) {
      if (!longPressTimer) return;
      var touch = e.touches[0];
      if (!touch) return;

      var dx = Math.abs(touch.clientX - touchStartX);
      var dy = Math.abs(touch.clientY - touchStartY);

      // Cancel long-press if finger moved more than 10px
      if (dx > 10 || dy > 10) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }, { passive: true });

    termContainer.addEventListener('touchend', function () {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }, { passive: true });

    termContainer.addEventListener('touchcancel', function () {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }, { passive: true });
  }

  /**
   * onDoubleTap — toggle zoom class for future use.
   */
  function onDoubleTap(x, y) {
    console.log('[terminal] double-tap at', x, y);
    var overlay = document.querySelector('.term-zoom-overlay');
    if (overlay) {
      overlay.classList.toggle('zoomed');
    }
  }

  /**
   * onLongPress — hook for copy toast. Currently copies terminal selection.
   */
  function onLongPress() {
    console.log('[terminal] long-press detected');
    if (!activeSessionId) return;

    var entry = terminals.get(activeSessionId);
    if (!entry) return;

    var selection = entry.term.getSelection();
    if (selection) {
      // Copy to clipboard
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(selection).then(function () {
          showCopyToast();
        }).catch(function () {
          // Fallback
          fallbackCopy(selection);
        });
      } else {
        fallbackCopy(selection);
      }
    }
  }

  function fallbackCopy(text) {
    // Fallback: create a temporary textarea
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showCopyToast();
    } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  function showCopyToast() {
    var container = document.getElementById('terminalContainer');
    if (!container) return;

    var toast = document.createElement('div');
    toast.className = 'copy-toast';
    toast.textContent = 'Copied to clipboard';
    container.appendChild(toast);

    setTimeout(function () {
      toast.remove();
    }, 1500);
  }

  // --- Initialization ---

  function init() {
    setupTouchHandlers();
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // --- Attach to window.app ---
  if (!window.app) window.app = {};

  window.app.terminal = {
    getOrCreate: getOrCreate,
    switchTo: switchTo,
    close: close,
    writeData: writeData,
    sendInput: sendInput,
    fitActive: fitActive,
    toggleFullscreen: toggleFullscreen,
    getActiveSessionId: getActiveSessionId,
    getEntry: getEntry,
    updateSessionName: updateSessionName,
  };
})();
