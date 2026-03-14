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
  const FONT_SIZE_MIN = 8;
  const FONT_SIZE_MAX = 28;
  const FONT_SIZE_STEP = 2;
  const FONT_SIZE_KEY = 'claudeBridge_fontSize';

  // Read terminal font size from CSS variable or localStorage
  function getTermFontSize() {
    var stored = localStorage.getItem(FONT_SIZE_KEY);
    if (stored) {
      var parsed = parseInt(stored, 10);
      if (parsed >= FONT_SIZE_MIN && parsed <= FONT_SIZE_MAX) return parsed;
    }
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

  // --- Pinch state ---
  let pinchStartDist = 0;
  let pinchStartFontSize = 0;
  let isPinching = false;

  // --- Select mode state ---
  let selectModeActive = false;
  let keyboardActive = false;

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
    var opts = Object.assign({}, TERM_OPTIONS, {
      fontSize: getTermFontSize(),
    });

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
      // Only focus terminal on desktop — on mobile, focus stays on input bar
      if (window.innerWidth > 768) {
        active.term.focus();
      }

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
   * On first data for a session, auto-switches and fits the terminal.
   */
  function writeData(sessionId, data) {
    var isNew = !terminals.has(sessionId);
    var entry = getOrCreate(sessionId, sessionId);
    entry.term.write(data);

    // On first data: ensure terminal is visible, fitted, and active
    if (isNew) {
      // Auto-switch to this terminal if none is active
      if (!activeSessionId) {
        switchTo(sessionId);
      }
      // Defer fit to next frame so container has dimensions
      requestAnimationFrame(function () {
        try { entry.fitAddon.fit(); } catch (e) { /* ignore */ }
      });
    }
  }

  /**
   * sendInput(data)
   * Sends data to the active session's PTY via WebSocket.
   */
  function sendInput(data) {
    if (!activeSessionId) {
      // Fallback: check window.app.activeSessionId in case it was set externally
      if (window.app && window.app.activeSessionId) {
        activeSessionId = window.app.activeSessionId;
      } else {
        if (window.app && window.app.showToast) {
          window.app.showToast('No active session — select one first');
        }
        console.error('[terminal] sendInput: no activeSessionId');
        return;
      }
    }
    if (!wsReady()) {
      if (window.app && window.app.showToast) {
        window.app.showToast('Not connected — retrying...');
      }
      console.error('[terminal] sendInput: WebSocket not ready');
      return;
    }
    var msg = {
      type: 'terminal_input',
      sessionId: activeSessionId,
      data: data,
    };
    console.log('[terminal] sendInput:', JSON.stringify(msg).slice(0, 200));
    getWs().send(JSON.stringify(msg));
  }

  /**
   * fitActive()
   * Refits the active terminal. Call on window resize or panel open/close.
   * Also updates font size from CSS variable in case breakpoint changed.
   */
  function fitActive() {
    if (!activeSessionId) return;
    var entry = terminals.get(activeSessionId);
    if (entry) {
      try {
        // Update font size from CSS variable (may change at breakpoints)
        var newSize = getTermFontSize();
        if (entry.term.options.fontSize !== newSize) {
          entry.term.options.fontSize = newSize;
        }
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

    // Double-tap detection (NO single-tap focus on mobile — use keyboard button)
    termContainer.addEventListener('touchend', function (e) {
      if (isPinching) return;
      var now = Date.now();
      var touch = e.changedTouches[0];
      if (!touch) return;

      var dx = Math.abs(touch.clientX - lastTapX);
      var dy = Math.abs(touch.clientY - lastTapY);
      var dt = now - lastTapTime;

      if (dt < 300 && dx < 30 && dy < 30) {
        // Double-tap detected — reset font size
        onDoubleTap(touch.clientX, touch.clientY);
        lastTapTime = 0;
      } else {
        lastTapTime = now;
        lastTapX = touch.clientX;
        lastTapY = touch.clientY;
        // NO term.focus() on single tap — keyboard button handles this
      }
    }, { passive: true });

    // Long-press detection
    termContainer.addEventListener('touchstart', function (e) {
      // Cancel long-press if two fingers (pinch)
      if (e.touches.length >= 2) {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        onPinchStart(e);
        return;
      }

      var touch = e.touches[0];
      if (!touch) return;

      touchStartX = touch.clientX;
      touchStartY = touch.clientY;

      longPressTimer = setTimeout(function () {
        onLongPress();
      }, 500);
    }, { passive: true });

    termContainer.addEventListener('touchmove', function (e) {
      // Handle pinch zoom
      if (e.touches.length >= 2 && isPinching) {
        onPinchMove(e);
        return;
      }

      if (!longPressTimer) return;
      var touch = e.touches[0];
      if (!touch) return;

      var dx = Math.abs(touch.clientX - touchStartX);
      var dy = Math.abs(touch.clientY - touchStartY);

      if (dx > 10 || dy > 10) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }, { passive: true });

    termContainer.addEventListener('touchend', function (e) {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (isPinching && e.touches.length < 2) {
        onPinchEnd();
      }
    }, { passive: true });

    termContainer.addEventListener('touchcancel', function () {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (isPinching) {
        onPinchEnd();
      }
    }, { passive: true });
  }

  // --- Pinch-to-zoom ---

  function getTouchDistance(t1, t2) {
    var dx = t1.clientX - t2.clientX;
    var dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onPinchStart(e) {
    if (e.touches.length < 2) return;
    isPinching = true;
    pinchStartDist = getTouchDistance(e.touches[0], e.touches[1]);

    var entry = activeSessionId ? terminals.get(activeSessionId) : null;
    pinchStartFontSize = entry ? entry.term.options.fontSize : getTermFontSize();

    // Apply transform origin at pinch midpoint
    if (entry) {
      var rect = entry.container.getBoundingClientRect();
      var midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      var midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      entry.container.style.transformOrigin = midX + 'px ' + midY + 'px';
    }
  }

  function onPinchMove(e) {
    if (!isPinching || e.touches.length < 2) return;
    var currentDist = getTouchDistance(e.touches[0], e.touches[1]);
    var scale = currentDist / pinchStartDist;

    // Clamp scale
    scale = Math.max(0.5, Math.min(2.5, scale));

    var entry = activeSessionId ? terminals.get(activeSessionId) : null;
    if (entry) {
      entry.container.style.transform = 'scale(' + scale + ')';
    }
  }

  function onPinchEnd() {
    isPinching = false;

    var entry = activeSessionId ? terminals.get(activeSessionId) : null;
    if (!entry) return;

    // Read current scale from transform
    var transform = entry.container.style.transform;
    var scaleMatch = transform.match(/scale\(([\d.]+)\)/);
    var scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;

    // Reset transform
    entry.container.style.transform = '';
    entry.container.style.transformOrigin = '';

    // Convert scale to font size change
    var newSize = Math.round(pinchStartFontSize * scale);
    newSize = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, newSize));

    if (newSize !== entry.term.options.fontSize) {
      entry.term.options.fontSize = newSize;
      localStorage.setItem(FONT_SIZE_KEY, String(newSize));
      try { entry.fitAddon.fit(); } catch (e2) { /* ignore */ }
      showFontSizeToast(newSize);
    }
  }

  // --- Font size controls ---

  function changeFontSize(delta) {
    var entry = activeSessionId ? terminals.get(activeSessionId) : null;
    if (!entry) return;

    var current = entry.term.options.fontSize;
    var newSize = current + delta;
    newSize = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, newSize));

    if (newSize !== current) {
      entry.term.options.fontSize = newSize;
      localStorage.setItem(FONT_SIZE_KEY, String(newSize));
      try { entry.fitAddon.fit(); } catch (e) { /* ignore */ }
      showFontSizeToast(newSize);
    }
  }

  function resetFontSize() {
    localStorage.removeItem(FONT_SIZE_KEY);
    var defaultSize = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--font-term')
    ) || 14;

    var entry = activeSessionId ? terminals.get(activeSessionId) : null;
    if (!entry) return;

    entry.term.options.fontSize = defaultSize;
    try { entry.fitAddon.fit(); } catch (e) { /* ignore */ }
    showFontSizeToast(defaultSize);
  }

  function showFontSizeToast(size) {
    if (window.app && window.app.showToast) {
      window.app.showToast('Font size: ' + size + 'px');
    }
  }

  function setupFontControls() {
    var btnDown = document.getElementById('termFontDown');
    var btnReset = document.getElementById('termFontReset');
    var btnUp = document.getElementById('termFontUp');

    if (btnDown) btnDown.addEventListener('click', function (e) {
      e.stopPropagation();
      changeFontSize(-FONT_SIZE_STEP);
    });
    if (btnReset) btnReset.addEventListener('click', function (e) {
      e.stopPropagation();
      resetFontSize();
    });
    if (btnUp) btnUp.addEventListener('click', function (e) {
      e.stopPropagation();
      changeFontSize(FONT_SIZE_STEP);
    });
  }

  // --- Select mode ---

  function toggleSelectMode() {
    selectModeActive = !selectModeActive;
    var overlay = document.getElementById('termSelectOverlay');
    var btn = document.getElementById('termSelectBtn');
    var copyBtn = document.getElementById('termCopyBtn');

    if (!overlay || !btn) return;

    if (selectModeActive) {
      // Populate overlay with terminal buffer text
      var entry = activeSessionId ? terminals.get(activeSessionId) : null;
      if (!entry) { selectModeActive = false; return; }

      var buffer = entry.term.buffer.active;
      var lines = [];
      for (var i = 0; i < buffer.length; i++) {
        var line = buffer.getLine(i);
        if (line) lines.push(line.translateToString());
      }
      overlay.textContent = lines.join('\n');
      overlay.classList.add('active');
      btn.classList.add('active');
      if (copyBtn) copyBtn.classList.remove('visible');
    } else {
      overlay.classList.remove('active');
      overlay.textContent = '';
      btn.classList.remove('active');
      if (copyBtn) copyBtn.classList.remove('visible');
    }
  }

  function setupSelectMode() {
    var selectBtn = document.getElementById('termSelectBtn');
    var copyBtn = document.getElementById('termCopyBtn');

    if (selectBtn) {
      selectBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleSelectMode();
      });
    }

    // Show copy button when text is selected in overlay
    document.addEventListener('selectionchange', function () {
      if (!selectModeActive) return;
      var sel = window.getSelection();
      if (sel && sel.toString().trim().length > 0) {
        if (copyBtn) copyBtn.classList.add('visible');
      } else {
        if (copyBtn) copyBtn.classList.remove('visible');
      }
    });

    if (copyBtn) {
      copyBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var sel = window.getSelection();
        if (!sel) return;
        var text = sel.toString();
        if (!text) return;

        // iOS-safe copy: visible textarea with font-size 16px
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        ta.style.fontSize = '16px'; // Prevents iOS zoom
        ta.style.opacity = '0.01';
        document.body.appendChild(ta);
        ta.focus();
        ta.setSelectionRange(0, ta.value.length);

        var copied = false;
        try {
          copied = document.execCommand('copy');
        } catch (err) { /* ignore */ }

        if (!copied && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).catch(function () {});
          copied = true;
        }

        document.body.removeChild(ta);

        if (copied) {
          showCopyToast();
          // Exit select mode after copy
          toggleSelectMode();
        }
      });
    }
  }

  // --- Keyboard toggle ---

  function toggleKeyboard() {
    keyboardActive = !keyboardActive;
    var btn = document.getElementById('termKeyboardBtn');

    if (keyboardActive) {
      // Show command bar and focus input — handles dictation correctly
      var appEl = document.getElementById('app');
      if (appEl && !appEl.classList.contains('command-bar-visible')) {
        appEl.classList.add('command-bar-visible');
        if (window.app) window.app.commandBarVisible = true;
      }
      // Focus the input bar textarea (not xterm — avoids speech-to-text duplication)
      var input = document.getElementById('commandInput');
      if (input) {
        setTimeout(function () { input.focus(); }, 50);
      }
      if (btn) btn.classList.add('active');
      setTimeout(fitActive, 100);
    } else {
      // Hide command bar, blur input
      var appEl2 = document.getElementById('app');
      if (appEl2) {
        appEl2.classList.remove('command-bar-visible');
        if (window.app) window.app.commandBarVisible = false;
      }
      var input2 = document.getElementById('commandInput');
      if (input2) input2.blur();
      blurTerminal();
      if (btn) btn.classList.remove('active');
      setTimeout(fitActive, 100);
    }
  }

  function setupKeyboardToggle() {
    var btn = document.getElementById('termKeyboardBtn');
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleKeyboard();
      });
    }
  }

  // --- Scroll buttons ---

  function setupScrollButtons() {
    var scrollTopBtn = document.getElementById('termScrollTop');
    var scrollBottomBtn = document.getElementById('termScrollBottom');

    if (scrollTopBtn) {
      scrollTopBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var entry = activeSessionId ? terminals.get(activeSessionId) : null;
        if (entry) entry.term.scrollToTop();
      });
    }

    if (scrollBottomBtn) {
      scrollBottomBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var entry = activeSessionId ? terminals.get(activeSessionId) : null;
        if (entry) entry.term.scrollToBottom();
      });
    }

    // Poll scroll position to show/hide buttons and update progress bar
    if (window.innerWidth <= 768) {
      var scrollTrack = document.getElementById('termScrollTrack');
      var scrollThumb = document.getElementById('termScrollThumb');
      var hideTrackTimer = null;

      setInterval(function () {
        var entry = activeSessionId ? terminals.get(activeSessionId) : null;
        if (!entry) return;

        var viewport = entry.container.querySelector('.xterm-viewport');
        if (!viewport) return;

        var scrollTop = viewport.scrollTop;
        var scrollHeight = viewport.scrollHeight;
        var clientHeight = viewport.clientHeight;
        var atTop = scrollTop <= 10;
        var atBottom = scrollTop + clientHeight >= scrollHeight - 10;
        var hasScroll = scrollHeight > clientHeight + 20;

        if (scrollTopBtn) {
          scrollTopBtn.classList.toggle('visible', !atTop && hasScroll);
        }
        if (scrollBottomBtn) {
          scrollBottomBtn.classList.toggle('visible', !atBottom && hasScroll);
        }

        // Update scroll progress bar
        if (scrollTrack && scrollThumb && hasScroll) {
          scrollTrack.classList.add('visible');

          var trackHeight = scrollTrack.offsetHeight;
          var ratio = clientHeight / scrollHeight;
          var thumbHeight = Math.max(20, trackHeight * ratio);
          var scrollRange = scrollHeight - clientHeight;
          var thumbTop = scrollRange > 0 ? (scrollTop / scrollRange) * (trackHeight - thumbHeight) : 0;

          scrollThumb.style.height = thumbHeight + 'px';
          scrollThumb.style.top = thumbTop + 'px';

          // Auto-hide after 2s of no scroll change
          if (hideTrackTimer) clearTimeout(hideTrackTimer);
          hideTrackTimer = setTimeout(function () {
            if (scrollTrack) scrollTrack.classList.remove('visible');
          }, 2000);
        } else if (scrollTrack) {
          scrollTrack.classList.remove('visible');
        }
      }, 500);
    }
  }

  /**
   * focusTerminal()
   * Focuses the active terminal for direct keyboard input on mobile.
   */
  function focusTerminal() {
    if (!activeSessionId) return;
    var entry = terminals.get(activeSessionId);
    if (entry) {
      allowXtermFocus = true;
      entry.term.focus();
      setTimeout(function () { allowXtermFocus = false; }, 200);
      setTimeout(fitActive, 50);
    }
  }

  /**
   * blurTerminal()
   * Removes focus from the terminal.
   */
  function blurTerminal() {
    if (!activeSessionId) return;
    var entry = terminals.get(activeSessionId);
    if (entry) {
      entry.term.blur();
    }
    setTimeout(fitActive, 50);
  }

  /**
   * setupTermFocusRedirect()
   * On mobile, intercepts focus on xterm's internal helper textarea and
   * redirects to the command bar. This ensures voice dictation and keyboard
   * input always go through the command bar (avoids speech-to-text duplication).
   */
  var allowXtermFocus = false; // flag to permit intentional xterm focus

  function setupTermFocusRedirect() {
    if (window.innerWidth > 768) return; // desktop only — no redirect needed

    document.addEventListener('focusin', function (e) {
      if (allowXtermFocus) return;
      // Detect xterm's internal helper textarea
      if (e.target && e.target.classList && e.target.classList.contains('xterm-helper-textarea')) {
        e.target.blur();
        // Open command bar and focus input instead
        if (!keyboardActive) {
          keyboardActive = true;
          var btn = document.getElementById('termKeyboardBtn');
          if (btn) btn.classList.add('active');
        }
        var appEl = document.getElementById('app');
        if (appEl && !appEl.classList.contains('command-bar-visible')) {
          appEl.classList.add('command-bar-visible');
          if (window.app) window.app.commandBarVisible = true;
        }
        var input = document.getElementById('commandInput');
        if (input) {
          setTimeout(function () { input.focus(); }, 50);
        }
        setTimeout(fitActive, 100);
      }
    });
  }

  /**
   * onDoubleTap — reset font size to default.
   */
  function onDoubleTap(x, y) {
    console.log('[terminal] double-tap at', x, y);
    resetFontSize();
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

  // --- Auto-fit on container resize ---

  function setupResizeObserver() {
    var termContainer = document.getElementById('terminalContainer');
    if (!termContainer || typeof ResizeObserver === 'undefined') return;

    var resizeTimer = null;
    var observer = new ResizeObserver(function () {
      // Debounce: fit after resize settles
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        fitActive();
      }, 50);
    });
    observer.observe(termContainer);
  }

  // --- Initialization ---

  function init() {
    setupTouchHandlers();
    setupResizeObserver();
    setupTermFocusRedirect();
    setupFontControls();
    setupSelectMode();
    setupKeyboardToggle();
    setupScrollButtons();

    // Aggressive initial fit — covers cases where container gets dimensions after load
    setTimeout(fitActive, 100);
    setTimeout(fitActive, 500);
    setTimeout(fitActive, 1500);
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
    focusTerminal: focusTerminal,
    blurTerminal: blurTerminal,
    toggleSelectMode: toggleSelectMode,
    toggleKeyboard: toggleKeyboard,
    changeFontSize: changeFontSize,
    resetFontSize: resetFontSize,
  };
})();
