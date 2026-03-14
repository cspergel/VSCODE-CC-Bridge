/* Command Palette — searchable overlay with 40+ categorized commands */

/**
 * Palette — searchable command overlay with categorized commands,
 * keyboard navigation, toggle state management, and recent/favorites tracking.
 *
 * Attaches to window.app.palette.
 */
(function () {
  'use strict';

  // --- Constants ---
  var RECENT_KEY = 'claudeBridge_paletteRecent';
  var MAX_RECENT = 10;

  // --- DOM refs (set in init) ---
  var backdrop = null;
  var palette = null;
  var searchInput = null;
  var listEl = null;

  // --- State ---
  var isOpen = false;
  var focusedIndex = -1;
  var visibleItems = [];
  var toggleStates = {};
  var usageCounts = {};  // label -> count

  // =====================================================================
  // Helpers
  // =====================================================================

  function sendCmd(cmd) {
    if (window.app && window.app.terminal && window.app.terminal.sendInput) {
      window.app.terminal.sendInput(cmd + '\r');
    }
  }

  function sendPrompt(prompt) {
    sendCmd(prompt);
  }

  function openNewSession() {
    if (window.app && window.app.panels && window.app.panels.open) {
      window.app.panels.open('sessions');
    }
  }

  function killCurrentSession() {
    var sessionId = window.app && window.app.activeSessionId;
    if (!sessionId) {
      showToast('No active session');
      return;
    }
    if (!confirm('Kill the current session?')) return;
    if (window.app && window.app.terminal && window.app.terminal.close) {
      window.app.terminal.close(sessionId);
    }
    showToast('Session killed');
  }

  function restartService(name) {
    if (window.app && window.app.serviceAction) {
      window.app.serviceAction(name, 'restart');
      showToast('Restarting ' + name + '...');
    }
  }

  function restartAll() {
    if (!confirm('Restart both agent and bridge?')) return;
    restartService('agent');
    restartService('bridge');
  }

  function showToast(msg) {
    if (window.app && window.app.showToast) {
      window.app.showToast(msg);
    }
  }

  function haptic(type) {
    if (window.app && window.app.inputBar && window.app.inputBar.haptic) {
      window.app.inputBar.haptic(type);
    }
  }

  // =====================================================================
  // Command Definitions
  // =====================================================================

  var COMMANDS = [
    // Mode Toggles
    { category: 'Mode Toggles', label: 'Auto-accept tools', type: 'toggle', key: 'autoAccept', icon: '\uD83D\uDD13' },
    { category: 'Mode Toggles', label: 'YOLO mode', type: 'toggle', key: 'yolo', icon: '\uD83D\uDC80', danger: true },
    { category: 'Mode Toggles', label: 'Switch to Sonnet', action: function () { sendCmd('/model sonnet'); }, icon: '\u26A1' },
    { category: 'Mode Toggles', label: 'Switch to Opus', action: function () { sendCmd('/model opus'); }, icon: '\uD83E\uDDE0' },
    { category: 'Mode Toggles', label: 'Switch to Haiku', action: function () { sendCmd('/model haiku'); }, icon: '\uD83E\uDEB6' },

    // Quick Actions
    { category: 'Quick Actions', label: 'Compact context', action: function () { sendCmd('/compact'); }, icon: '\uD83D\uDCE6' },
    { category: 'Quick Actions', label: 'Check cost', action: function () { sendCmd('/cost'); }, icon: '\uD83D\uDCB0' },
    { category: 'Quick Actions', label: 'Clear conversation', action: function () { sendCmd('/clear'); }, icon: '\uD83E\uDDF9' },
    { category: 'Quick Actions', label: 'Init project', action: function () { sendCmd('/init'); }, icon: '\uD83D\uDE80' },
    { category: 'Quick Actions', label: 'Commit changes', action: function () { sendCmd('/commit'); }, icon: '\uD83D\uDCDD' },
    { category: 'Quick Actions', label: 'Create PR', action: function () { sendPrompt('Create a pull request with a descriptive summary'); }, icon: '\uD83D\uDD00' },
    { category: 'Quick Actions', label: 'Review PR', action: function () { sendCmd('/review-pr'); }, icon: '\uD83D\uDC40' },

    // Development
    { category: 'Development', label: 'Fix failing tests', action: function () { sendPrompt('find and fix all failing tests'); }, icon: '\uD83E\uDDEA' },
    { category: 'Development', label: 'Explain last error', action: function () { sendPrompt('explain the last error and suggest a fix'); }, icon: '\u2753' },
    { category: 'Development', label: 'Write tests', action: function () { sendPrompt('write comprehensive tests for the recent changes'); }, icon: '\u2705' },
    { category: 'Development', label: 'Refactor this', action: function () { sendPrompt('refactor the current file for clarity, keep behavior identical'); }, icon: '\u267B\uFE0F' },
    { category: 'Development', label: 'Add types', action: function () { sendPrompt('add TypeScript types to all untyped functions in this file'); }, icon: '\uD83D\uDCD0' },
    { category: 'Development', label: 'Optimize', action: function () { sendPrompt('profile and optimize the slowest parts of this codebase'); }, icon: '\u26A1' },
    { category: 'Development', label: 'Security audit', action: function () { sendPrompt('audit this codebase for OWASP top 10 vulnerabilities'); }, icon: '\uD83D\uDD12' },
    { category: 'Development', label: 'Find dead code', action: function () { sendPrompt('find and remove all unused exports, functions, and variables'); }, icon: '\uD83D\uDC80' },
    { category: 'Development', label: 'Lint & fix', action: function () { sendPrompt('find and fix all linting issues'); }, icon: '\uD83E\uDDF9' },
    { category: 'Development', label: 'Add error handling', action: function () { sendPrompt('add proper error handling to all unhandled async operations'); }, icon: '\uD83D\uDEE1' },

    // Superpowers
    { category: 'Superpowers', label: 'Brainstorm', action: function () { sendCmd('/brainstorm'); }, icon: '\uD83D\uDCA1' },
    { category: 'Superpowers', label: 'Write plan', action: function () { sendCmd('/write-plan'); }, icon: '\uD83D\uDCCB' },
    { category: 'Superpowers', label: 'Execute plan', action: function () { sendCmd('/execute-plan'); }, icon: '\u25B6\uFE0F' },
    { category: 'Superpowers', label: 'TDD mode', action: function () { sendCmd('/tdd'); }, icon: '\uD83D\uDD04' },
    { category: 'Superpowers', label: 'Debug', action: function () { sendCmd('/debug'); }, icon: '\uD83D\uDC1B' },
    { category: 'Superpowers', label: 'Code review', action: function () { sendCmd('/request-code-review'); }, icon: '\uD83D\uDCDD' },
    { category: 'Superpowers', label: 'Parallel agents', action: function () { sendCmd('/dispatch-agents'); }, icon: '\uD83D\uDD00' },

    // Git & Project
    { category: 'Git & Project', label: 'Git status', action: function () { sendPrompt('summarize git status, staged/unstaged changes, and branch state'); }, icon: '\uD83D\uDCCA' },
    { category: 'Git & Project', label: 'Recent commits', action: function () { sendPrompt('show and summarize the last 10 commits'); }, icon: '\uD83D\uDCDC' },
    { category: 'Git & Project', label: 'Diff summary', action: function () { sendPrompt('summarize all changes since the last commit'); }, icon: '\uD83D\uDCDD' },
    { category: 'Git & Project', label: 'Dependency audit', action: function () { sendPrompt('check for outdated or vulnerable dependencies'); }, icon: '\uD83D\uDCE6' },
    { category: 'Git & Project', label: 'Codebase overview', action: function () { sendPrompt('give me a high-level architecture summary of this project'); }, icon: '\uD83C\uDFD7' },
    { category: 'Git & Project', label: 'Find TODOs', action: function () { sendPrompt('find all TODO, FIXME, HACK comments and summarize them'); }, icon: '\uD83D\uDCCC' },
    { category: 'Git & Project', label: 'Bundle size', action: function () { sendPrompt('analyze and report on bundle size, suggest reductions'); }, icon: '\uD83D\uDCCF' },

    // Session Management
    { category: 'Session', label: 'New session', action: function () { openNewSession(); }, icon: '\u2795' },
    { category: 'Session', label: 'Kill session', action: function () { killCurrentSession(); }, icon: '\u2620\uFE0F', danger: true },
    { category: 'Session', label: 'Restart agent', action: function () { restartService('agent'); }, icon: '\uD83D\uDD04' },
    { category: 'Session', label: 'Restart bridge', action: function () { restartService('bridge'); }, icon: '\uD83D\uDD04' },
    { category: 'Session', label: 'Restart all', action: function () { restartAll(); }, icon: '\uD83D\uDD04', danger: true },
  ];

  // =====================================================================
  // Recent / Favorites Tracking
  // =====================================================================

  function loadUsageCounts() {
    try {
      var stored = localStorage.getItem(RECENT_KEY);
      if (stored) {
        usageCounts = JSON.parse(stored);
        if (typeof usageCounts !== 'object' || usageCounts === null) usageCounts = {};
      }
    } catch (e) {
      usageCounts = {};
    }
  }

  function saveUsageCounts() {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(usageCounts));
    } catch (e) { /* quota exceeded */ }
  }

  function trackUsage(label) {
    usageCounts[label] = (usageCounts[label] || 0) + 1;
    saveUsageCounts();
  }

  /**
   * getRecentCommands()
   * Returns the top N most-used commands sorted by usage count (descending).
   */
  function getRecentCommands() {
    var entries = [];
    for (var i = 0; i < COMMANDS.length; i++) {
      var cmd = COMMANDS[i];
      var count = usageCounts[cmd.label] || 0;
      if (count > 0) {
        entries.push({ cmd: cmd, count: count });
      }
    }
    entries.sort(function (a, b) { return b.count - a.count; });
    var result = [];
    for (var j = 0; j < Math.min(entries.length, MAX_RECENT); j++) {
      result.push(entries[j].cmd);
    }
    return result;
  }

  // =====================================================================
  // Rendering
  // =====================================================================

  /**
   * render(commands)
   * Builds the palette list DOM from an array of command objects.
   * Groups by category, with sticky category headers.
   * Prepends a "Recent" category if there are recent commands.
   */
  function render(commands, query) {
    if (!listEl) return;
    listEl.innerHTML = '';
    visibleItems = [];
    focusedIndex = -1;

    // If no search query, prepend recent commands
    var recentCmds = [];
    if (!query) {
      recentCmds = getRecentCommands();
    }

    // Build ordered list: recent first, then all categories
    var orderedItems = [];

    // Add recent category
    if (recentCmds.length > 0) {
      for (var r = 0; r < recentCmds.length; r++) {
        orderedItems.push({ cmd: recentCmds[r], category: 'Recent' });
      }
    }

    // Add regular commands
    for (var i = 0; i < commands.length; i++) {
      orderedItems.push({ cmd: commands[i], category: commands[i].category });
    }

    // Group by category and render
    var lastCategory = '';
    for (var k = 0; k < orderedItems.length; k++) {
      var item = orderedItems[k];
      var cmd = item.cmd;
      var cat = item.category;

      // Category header
      if (cat !== lastCategory) {
        var header = document.createElement('div');
        header.className = 'palette-category';
        header.textContent = cat;
        listEl.appendChild(header);
        lastCategory = cat;
      }

      // Command item
      var el = document.createElement('div');
      el.className = 'palette-item';
      if (cmd.danger) el.classList.add('danger');
      if (cmd.type === 'toggle') el.classList.add('toggle');

      // Data index for keyboard navigation
      var itemIndex = visibleItems.length;
      el.dataset.index = itemIndex;

      // Icon
      var iconSpan = document.createElement('span');
      iconSpan.className = 'palette-icon';
      iconSpan.textContent = cmd.icon || '';
      el.appendChild(iconSpan);

      // Label
      var labelSpan = document.createElement('span');
      labelSpan.className = 'palette-label';
      labelSpan.textContent = cmd.label;
      el.appendChild(labelSpan);

      // Toggle switch or shortcut
      if (cmd.type === 'toggle') {
        var toggle = document.createElement('span');
        toggle.className = 'toggle-switch';
        if (toggleStates[cmd.key]) toggle.classList.add('on');
        el.appendChild(toggle);
      } else if (cmd.shortcut) {
        var shortcutSpan = document.createElement('span');
        shortcutSpan.className = 'palette-shortcut';
        shortcutSpan.textContent = cmd.shortcut;
        el.appendChild(shortcutSpan);
      }

      // Click handler (closure)
      (function (command, element) {
        element.addEventListener('click', function () {
          executeCommand(command);
        });
      })(cmd, el);

      listEl.appendChild(el);
      visibleItems.push({ el: el, cmd: cmd });
    }
  }

  // =====================================================================
  // Command Execution
  // =====================================================================

  function executeCommand(cmd) {
    haptic('light');
    trackUsage(cmd.label);

    if (cmd.type === 'toggle') {
      // Flip toggle state
      toggleStates[cmd.key] = !toggleStates[cmd.key];
      var newState = toggleStates[cmd.key];

      // Update the toggle switch UI in the list
      var items = listEl.querySelectorAll('.palette-item.toggle');
      for (var i = 0; i < items.length; i++) {
        var labelEl = items[i].querySelector('.palette-label');
        if (labelEl && labelEl.textContent === cmd.label) {
          var sw = items[i].querySelector('.toggle-switch');
          if (sw) {
            if (newState) {
              sw.classList.add('on');
            } else {
              sw.classList.remove('on');
            }
          }
          break;
        }
      }

      haptic('double');
      showToast(cmd.label + ': ' + (newState ? 'ON' : 'OFF'));
      // Don't close palette for toggles — user may want to toggle multiple
      return;
    }

    // Action command — execute and close
    if (cmd.action) {
      cmd.action();
    }
    close();
  }

  // =====================================================================
  // Search Filtering
  // =====================================================================

  function filterCommands(query) {
    if (!query) return COMMANDS;

    var q = query.toLowerCase();
    var results = [];
    for (var i = 0; i < COMMANDS.length; i++) {
      if (COMMANDS[i].label.toLowerCase().indexOf(q) !== -1 ||
          COMMANDS[i].category.toLowerCase().indexOf(q) !== -1) {
        results.push(COMMANDS[i]);
      }
    }
    return results;
  }

  function onSearchInput() {
    if (!searchInput) return;
    var query = searchInput.value.trim();
    var filtered = filterCommands(query);
    render(filtered, query);

    // Auto-focus first item if there are results
    if (visibleItems.length > 0) {
      setFocused(0);
    }
  }

  // =====================================================================
  // Keyboard Navigation
  // =====================================================================

  function setFocused(index) {
    // Remove old focus
    if (focusedIndex >= 0 && focusedIndex < visibleItems.length) {
      visibleItems[focusedIndex].el.classList.remove('focused');
    }

    focusedIndex = index;

    // Add new focus
    if (focusedIndex >= 0 && focusedIndex < visibleItems.length) {
      visibleItems[focusedIndex].el.classList.add('focused');
      // Scroll into view
      visibleItems[focusedIndex].el.scrollIntoView({ block: 'nearest' });
    }
  }

  function moveFocus(direction) {
    if (visibleItems.length === 0) return;

    var newIndex;
    if (focusedIndex === -1) {
      // Nothing focused — start at beginning or end
      newIndex = direction === 1 ? 0 : visibleItems.length - 1;
    } else {
      newIndex = focusedIndex + direction;
      // Wrap around
      if (newIndex < 0) newIndex = visibleItems.length - 1;
      if (newIndex >= visibleItems.length) newIndex = 0;
    }

    setFocused(newIndex);
  }

  function executeFocused() {
    if (focusedIndex >= 0 && focusedIndex < visibleItems.length) {
      executeCommand(visibleItems[focusedIndex].cmd);
    }
  }

  // =====================================================================
  // Open / Close
  // =====================================================================

  function open() {
    if (isOpen) return;
    isOpen = true;

    if (backdrop) backdrop.classList.add('visible');
    if (palette) palette.classList.add('open');

    // Clear search and render full list
    if (searchInput) {
      searchInput.value = '';
    }
    render(COMMANDS, '');

    // Focus search input
    if (searchInput) {
      // Delay focus slightly for mobile keyboard to work properly
      setTimeout(function () {
        searchInput.focus();
      }, 50);
    }
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;

    if (backdrop) backdrop.classList.remove('visible');
    if (palette) palette.classList.remove('open');

    // Clear search
    if (searchInput) {
      searchInput.value = '';
    }

    focusedIndex = -1;
    visibleItems = [];
  }

  function toggle() {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }

  // =====================================================================
  // Event Handlers
  // =====================================================================

  function onKeydown(e) {
    if (!isOpen) return;

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        close();
        break;

      case 'ArrowDown':
        e.preventDefault();
        moveFocus(1);
        break;

      case 'ArrowUp':
        e.preventDefault();
        moveFocus(-1);
        break;

      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) {
          moveFocus(-1);
        } else {
          moveFocus(1);
        }
        break;

      case 'Enter':
        e.preventDefault();
        executeFocused();
        break;
    }
  }

  /** Global keyboard shortcut: Ctrl+K / Cmd+K opens palette */
  function onGlobalKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      toggle();
    }
  }

  function setupEventHandlers() {
    // Backdrop click closes
    if (backdrop) {
      backdrop.addEventListener('click', function () {
        close();
      });
    }

    // Search input filtering
    if (searchInput) {
      searchInput.addEventListener('input', onSearchInput);
    }

    // Keyboard navigation within palette
    document.addEventListener('keydown', function (e) {
      if (isOpen) {
        onKeydown(e);
      }
    });

    // Global shortcut Ctrl+K / Cmd+K
    document.addEventListener('keydown', onGlobalKeydown);
  }

  // =====================================================================
  // Initialization
  // =====================================================================

  function init() {
    backdrop = document.getElementById('paletteBackdrop');
    palette = document.getElementById('palette');
    searchInput = document.getElementById('paletteSearch');
    listEl = document.getElementById('paletteList');

    loadUsageCounts();
    setupEventHandlers();
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // --- Attach to window.app ---
  if (!window.app) window.app = {};

  window.app.palette = {
    open: open,
    close: close,
    toggle: toggle,
  };
})();
