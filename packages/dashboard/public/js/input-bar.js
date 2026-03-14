/* Input Bar — command input, history, quick-action buttons, visualViewport positioning */

/**
 * InputBar — manages the command textarea, send button, command history,
 * context-aware quick-action buttons, and mobile keyboard positioning.
 *
 * Attaches to window.app.inputBar.
 */
(function () {
  'use strict';

  // --- Constants ---
  var HISTORY_KEY = 'claudeBridge_cmdHistory';
  var MAX_HISTORY = 50;
  var MAX_ROWS = 3;

  // --- State ---
  var history = [];
  var historyIndex = -1;    // -1 = not browsing history
  var currentDraft = '';    // saves user's in-progress text when browsing history
  var currentContext = 'idle';

  // --- DOM refs (set in init) ---
  var commandInput = null;
  var btnSend = null;
  var inputBar = null;
  var quickActions = null;

  // =====================================================================
  // Haptic Feedback
  // =====================================================================

  /**
   * haptic(type)
   * Triggers a haptic vibration pattern if available.
   *   - 'light': 10ms pulse (button taps)
   *   - 'medium': 20ms pulse (panel snaps)
   *   - 'double': two 20ms pulses with 50ms gap (mode toggles)
   */
  function haptic(type) {
    if (!navigator.vibrate) return;
    switch (type) {
      case 'light':
        navigator.vibrate(10);
        break;
      case 'medium':
        navigator.vibrate(20);
        break;
      case 'double':
        navigator.vibrate([20, 50, 20]);
        break;
    }
  }

  // =====================================================================
  // Command History
  // =====================================================================

  /** Load history from localStorage */
  function loadHistory() {
    try {
      var stored = localStorage.getItem(HISTORY_KEY);
      if (stored) {
        history = JSON.parse(stored);
        if (!Array.isArray(history)) history = [];
      }
    } catch (e) {
      history = [];
    }
  }

  /** Save history to localStorage */
  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) { /* quota exceeded — silently ignore */ }
  }

  /**
   * addToHistory(cmd)
   * Adds a command to the history ring buffer (max 50).
   * Deduplicates consecutive identical commands.
   */
  function addToHistory(cmd) {
    if (!cmd || !cmd.trim()) return;
    // Don't add if identical to the most recent entry
    if (history.length > 0 && history[history.length - 1] === cmd) return;
    history.push(cmd);
    if (history.length > MAX_HISTORY) {
      history = history.slice(history.length - MAX_HISTORY);
    }
    historyIndex = -1;
    saveHistory();
  }

  /**
   * cycleHistory(direction)
   * Cycles through command history.
   *   direction: -1 = older (up), +1 = newer (down)
   */
  function cycleHistory(direction) {
    if (!commandInput) return;
    if (history.length === 0) return;

    // Save current draft if we're starting to browse
    if (historyIndex === -1) {
      currentDraft = commandInput.value;
    }

    if (direction === -1) {
      // Going back in history (older)
      if (historyIndex === -1) {
        historyIndex = history.length - 1;
      } else if (historyIndex > 0) {
        historyIndex--;
      }
    } else if (direction === 1) {
      // Going forward in history (newer)
      if (historyIndex === -1) return; // already at draft
      if (historyIndex < history.length - 1) {
        historyIndex++;
      } else {
        // Past the end — restore draft
        historyIndex = -1;
        commandInput.value = currentDraft;
        autoGrow();
        return;
      }
    }

    if (historyIndex >= 0 && historyIndex < history.length) {
      commandInput.value = history[historyIndex];
      autoGrow();
    }
  }

  /** Reset history browsing index (called when user types) */
  function resetHistoryIndex() {
    historyIndex = -1;
  }

  // =====================================================================
  // Auto-grow Textarea
  // =====================================================================

  /**
   * autoGrow()
   * Adjusts the textarea rows attribute (1..MAX_ROWS) based on content.
   * Beyond MAX_ROWS, internal scrolling kicks in.
   */
  function autoGrow() {
    if (!commandInput) return;
    // Reset to 1 to measure scrollHeight correctly
    commandInput.rows = 1;
    var lineHeight = parseInt(getComputedStyle(commandInput).lineHeight) || 20;
    var lines = Math.ceil(commandInput.scrollHeight / lineHeight);
    commandInput.rows = Math.min(Math.max(lines, 1), MAX_ROWS);
  }

  // =====================================================================
  // Send Command
  // =====================================================================

  /**
   * sendCommand()
   * Sends the textarea content to the terminal PTY and clears the input.
   */
  function sendCommand() {
    if (!commandInput) return;
    var text = commandInput.value;
    if (!text) return;

    addToHistory(text);
    sendInput(text + '\r');

    commandInput.value = '';
    autoGrow();
    commandInput.focus();
  }

  /**
   * sendInput(data)
   * Proxy to window.app.terminal.sendInput().
   */
  function sendInput(data) {
    if (window.app && window.app.terminal && window.app.terminal.sendInput) {
      window.app.terminal.sendInput(data);
    }
  }

  // =====================================================================
  // Quick-Action Buttons
  // =====================================================================

  var QUICK_ACTION_SETS = {
    idle: [
      { label: '\u2191 History', action: function () { cycleHistory(-1); }, cls: '' },
      { label: 'Tab', action: function () { sendInput('\t'); }, cls: '' },
      { label: '\u26A1 Cmds', action: function () { if (window.app && window.app.palette) window.app.palette.open(); }, cls: 'accent' },
    ],
    approval: [
      { label: '\u2713 Yes', action: function () { sendInput('y\r'); }, cls: 'yes' },
      { label: '\u2717 No', action: function () { sendInput('n\r'); }, cls: 'no' },
      { label: '\u2303C Cancel', action: function () { sendInput('\x03'); }, cls: 'cancel' },
    ],
    running: [
      { label: '\u2303C Stop', action: function () { sendInput('\x03'); }, cls: 'cancel' },
      { label: '\u26A1 Cmds', action: function () { if (window.app && window.app.palette) window.app.palette.open(); }, cls: 'accent' },
    ],
    picker: [
      { label: '\u2191', action: function () { sendInput('\x1b[A'); }, cls: '' },
      { label: '\u2193', action: function () { sendInput('\x1b[B'); }, cls: '' },
      { label: '\u23CE Select', action: function () { sendInput('\r'); }, cls: '' },
      { label: '\u2303C', action: function () { sendInput('\x03'); }, cls: 'cancel' },
    ],
  };

  /**
   * setContext(state)
   * Updates the quick-action buttons to match the given terminal state.
   * Cross-fades old buttons out and new buttons in.
   */
  function setContext(state) {
    if (!QUICK_ACTION_SETS[state]) state = 'idle';
    if (state === currentContext) return;
    currentContext = state;
    renderQuickActions(state, true);
  }

  /**
   * renderQuickActions(state, animate)
   * Builds the quick-action button set for the given state.
   * If animate is true, cross-fades old buttons out (150ms) before replacing.
   */
  function renderQuickActions(state, animate) {
    if (!quickActions) return;
    var buttons = QUICK_ACTION_SETS[state] || QUICK_ACTION_SETS.idle;

    function replaceButtons() {
      quickActions.innerHTML = '';
      for (var j = 0; j < buttons.length; j++) {
        var def = buttons[j];
        var btn = document.createElement('button');
        btn.className = 'quick-btn' + (def.cls ? ' ' + def.cls : '');
        btn.textContent = def.label;
        // Closure for action binding
        (function (actionFn) {
          btn.addEventListener('click', function () {
            haptic('light');
            actionFn();
          });
        })(def.action);
        quickActions.appendChild(btn);
      }
    }

    if (animate) {
      // Fade out old buttons, then replace after 150ms
      var oldButtons = quickActions.querySelectorAll('.quick-btn');
      for (var i = 0; i < oldButtons.length; i++) {
        oldButtons[i].style.opacity = '0';
      }
      setTimeout(replaceButtons, 150);
    } else {
      // Immediate replace (first render)
      replaceButtons();
    }
  }

  // =====================================================================
  // Context Detection
  // =====================================================================

  /**
   * detectContext(text)
   * Examines terminal output text (typically the last line) and returns
   * the appropriate context state: 'idle', 'approval', 'picker', or 'running'.
   */
  function detectContext(text) {
    if (!text) return 'running';

    // Check for approval prompts
    if (/\[Y\/n\]|\(y\/N\)|\? \(Y\/n\)|Allow|Approve|Confirm.*\?/i.test(text)) {
      return 'approval';
    }

    // Check for interactive picker patterns
    if (/[●◯◉].*│|❯.*│/.test(text)) {
      return 'picker';
    }

    // Check for shell prompt (idle)
    if (/[❯$>]\s*$/.test(text)) {
      return 'idle';
    }

    // Default: running
    return 'running';
  }

  // =====================================================================
  // visualViewport Positioning (mobile keyboard)
  // =====================================================================

  function setupViewportHandlers() {
    if (!window.visualViewport) return;

    function adjustPosition() {
      var offset = window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
      // Clamp to non-negative
      if (offset < 0) offset = 0;
      var transform = offset > 0 ? 'translateY(-' + offset + 'px)' : '';
      if (inputBar) inputBar.style.transform = transform;
      if (quickActions) quickActions.style.transform = transform;
    }

    window.visualViewport.addEventListener('resize', adjustPosition);
    window.visualViewport.addEventListener('scroll', adjustPosition);
  }

  // =====================================================================
  // Event Handlers
  // =====================================================================

  function setupEventHandlers() {
    if (!commandInput) return;

    // Keydown handler for Enter, Shift+Enter, Up, Down
    commandInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendCommand();
        return;
      }

      // Up-arrow when textarea is empty: cycle history backward
      if (e.key === 'ArrowUp' && commandInput.value === '') {
        e.preventDefault();
        cycleHistory(-1);
        return;
      }

      // Down-arrow when textarea is empty: cycle history forward
      if (e.key === 'ArrowDown' && commandInput.value === '') {
        e.preventDefault();
        cycleHistory(1);
        return;
      }
    });

    // Input handler for auto-grow and history reset
    commandInput.addEventListener('input', function () {
      autoGrow();
      resetHistoryIndex();
    });

    // Send button
    if (btnSend) {
      btnSend.addEventListener('click', function () {
        haptic('light');
        sendCommand();
      });
    }
  }

  // =====================================================================
  // Initialization
  // =====================================================================

  function init() {
    commandInput = document.getElementById('commandInput');
    btnSend = document.getElementById('btnSend');
    inputBar = document.getElementById('inputBar');
    quickActions = document.getElementById('quickActions');

    loadHistory();
    setupEventHandlers();
    setupViewportHandlers();

    // Render initial quick actions (idle state)
    renderQuickActions('idle');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // --- Attach to window.app ---
  if (!window.app) window.app = {};

  window.app.inputBar = {
    setContext: setContext,
    detectContext: detectContext,
    cycleHistory: cycleHistory,
    addToHistory: addToHistory,
    haptic: haptic,
  };
})();
