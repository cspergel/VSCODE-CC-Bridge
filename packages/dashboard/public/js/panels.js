/* Panel system — gesture-driven slide-up sheets (mobile), sidebar content (desktop) */

(function () {
  'use strict';

  // --- State ---
  var currentPanel = null;
  var isMaximized = false;
  var logBuffer = [];
  var LOG_BUFFER_MAX = 1000;
  var logFilter = 'all'; // 'all' | 'agent' | 'bridge'

  // --- DOM refs ---
  var backdrop = document.getElementById('panelBackdrop');
  var container = document.getElementById('panelContainer');
  var content = document.getElementById('panelContent');
  var sidebar = document.getElementById('sidebar');
  var sidebarPanel = document.getElementById('sidebarPanel');

  // --- Helpers ---
  var esc = function (s) { return window.app.escapeHtml(s); };
  var trunc = function (s, n) { return window.app.truncate(s, n); };

  function isMobile() {
    return window.innerWidth <= 768;
  }

  function formatTime(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    var h = d.getHours().toString();
    var m = d.getMinutes().toString().padStart(2, '0');
    var s = d.getSeconds().toString().padStart(2, '0');
    return h + ':' + m + ':' + s;
  }

  function formatDuration(seconds) {
    if (window.app.formatDuration) return window.app.formatDuration(seconds);
    if (seconds < 60) return seconds + 's';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
    return Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
  }

  // =========================================================================
  // PANEL OPEN / CLOSE / TOGGLE
  // =========================================================================

  function open(panelName) {
    if (isMobile()) {
      openMobile(panelName);
    } else {
      openDesktop(panelName);
    }
    currentPanel = panelName;
  }

  function openMobile(panelName) {
    var html = renderPanel(panelName);
    content.innerHTML = html;
    bindPanelEvents(panelName);

    // Prevent background scrolling
    document.body.style.overflow = 'hidden';

    // Show backdrop
    backdrop.style.display = 'block';
    // Force reflow for transition
    void backdrop.offsetHeight;
    backdrop.classList.add('visible');

    // Slide up panel — sessions/newSession open at 85% (near fullscreen) for easier browsing
    container.classList.add('open');
    var snapHeight = (panelName === 'sessions' || panelName === 'newSession' || panelName === 'settings') ? '85vh' : '50vh';
    container.style.transform = 'translateY(calc(100% - ' + snapHeight + '))';
  }

  function openDesktop(panelName) {
    var html = renderPanel(panelName);
    sidebarPanel.innerHTML = html;
    sidebarPanel.classList.add('active');
    if (isMaximized) {
      sidebar.classList.remove('expanded');
      sidebar.classList.add('maximized');
    } else {
      sidebar.classList.remove('maximized');
      sidebar.classList.add('expanded');
    }
    bindPanelEvents(panelName);

    // Update sidebar button active state
    var btns = sidebar.querySelectorAll('.sidebar-btn');
    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      if (btn.getAttribute('data-panel') === panelName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }

    // Refit terminal after sidebar width change
    if (window.app.terminal) {
      setTimeout(function () { window.app.terminal.fitActive(); }, 50);
    }
  }

  function toggleMaximize() {
    isMaximized = !isMaximized;
    if (!sidebar) return;
    if (isMaximized) {
      sidebar.classList.remove('expanded');
      sidebar.classList.add('maximized');
    } else {
      sidebar.classList.remove('maximized');
      sidebar.classList.add('expanded');
    }
    // Update maximize button state
    var maxBtn = document.getElementById('panelMaximizeBtn');
    if (maxBtn) {
      if (isMaximized) {
        maxBtn.classList.add('active');
        maxBtn.title = 'Restore panel size';
      } else {
        maxBtn.classList.remove('active');
        maxBtn.title = 'Maximize panel';
      }
    }
    // Refit terminal
    if (window.app.terminal) {
      setTimeout(function () { window.app.terminal.fitActive(); }, 50);
    }
  }

  function close() {
    if (isMobile()) {
      closeMobile();
    } else {
      closeDesktop();
    }
    currentPanel = null;
    updateMobileNavActive(null);
  }

  function closeMobile() {
    backdrop.classList.remove('visible');
    container.classList.remove('open');
    container.style.transform = 'translateY(100%)';

    // Restore body scrolling
    document.body.style.overflow = '';

    // Hide backdrop after transition
    setTimeout(function () {
      if (!currentPanel) {
        backdrop.style.display = 'none';
      }
    }, 300);
  }

  function closeDesktop() {
    sidebar.classList.remove('expanded');
    sidebar.classList.remove('maximized');
    isMaximized = false;
    sidebarPanel.classList.remove('active');
    sidebarPanel.innerHTML = '';

    // Clear active sidebar buttons
    var btns = sidebar.querySelectorAll('.sidebar-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.remove('active');
    }

    // Refit terminal after sidebar collapse
    if (window.app.terminal) {
      setTimeout(function () { window.app.terminal.fitActive(); }, 50);
    }
  }

  function toggle(panelName) {
    if (currentPanel === panelName) {
      close();
    } else if (currentPanel) {
      // Switch to different panel
      currentPanel = panelName;
      if (isMobile()) {
        var html = renderPanel(panelName);
        content.innerHTML = html;
        bindPanelEvents(panelName);
      } else {
        openDesktop(panelName);
      }
    } else {
      open(panelName);
    }
  }

  function isOpen() {
    return currentPanel;
  }

  // =========================================================================
  // GESTURE HANDLING (mobile only)
  // =========================================================================

  var dragState = {
    active: false,
    startY: 0,
    startTime: 0,
    currentY: 0,
    startTranslateY: 0,
    rafId: null
  };

  var SNAP_POINTS = [0.30, 0.50, 0.85]; // fraction of viewport height
  var VELOCITY_THRESHOLD = 0.5; // px per ms
  var DISMISS_VELOCITY = 0.3;

  function getContainerTranslateY() {
    var style = container.style.transform;
    // Parse translateY from e.g. "translateY(calc(100% - 50vh))" or "translateY(123px)"
    var match = style.match(/translateY\(([^)]+)\)/);
    if (!match) return window.innerHeight;
    var val = match[1];
    // If calc format: "calc(100% - Xvh)"
    var calcMatch = val.match(/calc\(100%\s*-\s*([\d.]+)vh\)/);
    if (calcMatch) {
      var vh = parseFloat(calcMatch[1]);
      return window.innerHeight - (vh / 100 * window.innerHeight);
    }
    // If plain px
    var pxMatch = val.match(/([\d.-]+)px/);
    if (pxMatch) return parseFloat(pxMatch[1]);
    return window.innerHeight;
  }

  function onTouchStart(e) {
    if (!currentPanel || !isMobile()) return;
    // ONLY allow panel drag from drag handle or panel header — never from content
    var target = e.target;
    var isDragHandle = target.closest('.panel-drag-handle');
    var isPanelHeader = target.closest('.panel-header');

    if (!isDragHandle && !isPanelHeader) return;

    var touch = e.touches[0];
    dragState.active = true;
    dragState.startY = touch.clientY;
    dragState.startTime = Date.now();
    dragState.currentY = touch.clientY;
    dragState.startTranslateY = getContainerTranslateY();
    dragState.moved = false;
    container.classList.add('dragging');
  }

  function onTouchMove(e) {
    if (!dragState.active) return;
    var touch = e.touches[0];
    dragState.currentY = touch.clientY;

    var deltaY = dragState.currentY - dragState.startY;

    // Only start dragging after 8px movement (prevents accidental drags)
    if (!dragState.moved && Math.abs(deltaY) < 8) return;
    dragState.moved = true;

    // Prevent scrolling while dragging the panel
    e.preventDefault();

    if (dragState.rafId) cancelAnimationFrame(dragState.rafId);
    dragState.rafId = requestAnimationFrame(function () {
      var newTranslateY = dragState.startTranslateY + deltaY;
      // Clamp: don't let panel go above 85vh or below screen bottom
      var minY = window.innerHeight * (1 - 0.85);
      var maxY = window.innerHeight;
      newTranslateY = Math.max(minY, Math.min(maxY, newTranslateY));
      container.style.transform = 'translateY(' + newTranslateY + 'px)';
    });
  }

  function onTouchEnd() {
    if (!dragState.active) return;
    dragState.active = false;
    container.classList.remove('dragging');

    // If we didn't actually move, don't snap
    if (!dragState.moved) return;

    if (dragState.rafId) {
      cancelAnimationFrame(dragState.rafId);
      dragState.rafId = null;
    }

    var deltaY = dragState.currentY - dragState.startY;
    var elapsed = Date.now() - dragState.startTime;
    var velocity = elapsed > 0 ? deltaY / elapsed : 0; // positive = downward

    var currentTranslateY = dragState.startTranslateY + deltaY;
    var vp = window.innerHeight;
    var currentHeight = vp - currentTranslateY; // how tall the panel appears
    var currentFraction = currentHeight / vp;

    // Velocity-based snap
    if (velocity > DISMISS_VELOCITY) {
      // Flick down → dismiss
      close();
      return;
    }

    if (velocity < -VELOCITY_THRESHOLD) {
      // Flick up → snap to next higher point
      var nextUp = null;
      for (var i = 0; i < SNAP_POINTS.length; i++) {
        if (SNAP_POINTS[i] > currentFraction + 0.05) {
          nextUp = SNAP_POINTS[i];
          break;
        }
      }
      if (!nextUp) nextUp = SNAP_POINTS[SNAP_POINTS.length - 1];
      snapTo(nextUp);
      return;
    }

    // Position-based: snap to nearest
    var nearest = SNAP_POINTS[0];
    var nearestDist = Math.abs(currentFraction - nearest);
    for (var j = 1; j < SNAP_POINTS.length; j++) {
      var dist = Math.abs(currentFraction - SNAP_POINTS[j]);
      if (dist < nearestDist) {
        nearest = SNAP_POINTS[j];
        nearestDist = dist;
      }
    }

    // If below lowest snap point significantly, dismiss
    if (currentFraction < SNAP_POINTS[0] * 0.5) {
      close();
      return;
    }

    snapTo(nearest);
  }

  function snapTo(fraction) {
    container.style.transform = 'translateY(calc(100% - ' + (fraction * 100) + 'vh))';
  }

  // Attach gesture listeners — touchstart on whole container, touchmove non-passive to allow preventDefault
  if (container) {
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
  }

  // Backdrop tap → close
  if (backdrop) {
    backdrop.addEventListener('click', function () {
      close();
    });
  }

  // =========================================================================
  // PANEL CONTENT RENDERERS
  // =========================================================================

  function renderPanel(name) {
    switch (name) {
      case 'sessions':  return renderSessionsPanel();
      case 'logs':      return renderLogsPanel();
      case 'services':  return renderServicesPanel();
      case 'messages':  return renderMessagesPanel();
      case 'audit':     return renderAuditPanel();
      case 'newSession': return renderNewSessionPanel();
      case 'settings':  return renderSettingsPanel();
      default:          return '<div class="panel-empty"><div class="empty-icon">?</div>Unknown panel</div>';
    }
  }

  // --- Panel header helper (includes maximize button on desktop) ---
  function renderPanelHeader(title, extraButtons) {
    var html = '<div class="panel-header">';
    html += '<h2>' + title + '</h2>';
    html += '<div class="panel-header-actions">';
    if (extraButtons) html += extraButtons;
    if (!isMobile()) {
      html += '<button class="panel-maximize-btn' + (isMaximized ? ' active' : '') + '" id="panelMaximizeBtn" title="' + (isMaximized ? 'Restore panel size' : 'Maximize panel') + '">&#x2922;</button>';
    }
    html += '</div></div>';
    return html;
  }

  // --- Sessions Panel ---
  function renderSessionsPanel() {
    var html = renderPanelHeader('Sessions', '<button class="panel-btn primary" id="panelNewSessionBtn">+ New</button>');
    html += '<div id="sessionsList"><div class="panel-empty"><div class="empty-icon">...</div>Loading sessions...</div></div>';

    // Fetch sessions async
    setTimeout(loadSessionsList, 0);

    return html;
  }

  function loadSessionsList() {
    fetch('/api/sessions')
      .then(function (res) { return res.json(); })
      .then(function (sessions) {
        var list = document.getElementById('sessionsList');
        if (!list) return;

        if (!sessions || sessions.length === 0) {
          list.innerHTML = '<div class="panel-empty"><div class="empty-icon">&#x1F4CB;</div>No sessions yet.<br>Create one to get started.</div>';
          return;
        }

        var html = '';
        for (var i = 0; i < sessions.length; i++) {
          var s = sessions[i];
          var isActive = s.id === window.app.activeSessionId;
          var statusClass = s.status || 'idle';
          html += '<div class="session-card' + (isActive ? ' active' : '') + '" data-session-id="' + esc(s.id) + '">';
          html += '<div class="session-dot-wrap"><span class="dot ' + esc(statusClass) + '"></span></div>';
          html += '<div class="session-card-info">';
          html += '<div class="session-card-name">' + esc(s.name || s.id) + '</div>';
          html += '<div class="session-card-path">' + esc(s.projectPath || '') + '</div>';
          html += '</div>';
          html += '<span class="session-status-label ' + esc(statusClass) + '">' + esc(statusClass) + '</span>';
          html += '<span class="session-card-arrow">&#x203A;</span>';
          html += '<div class="delete-reveal">Delete</div>';
          html += '</div>';
        }
        list.innerHTML = html;
      })
      .catch(function () {
        var list = document.getElementById('sessionsList');
        if (list) {
          list.innerHTML = '<div class="panel-empty"><div class="empty-icon">!</div>Failed to load sessions</div>';
        }
      });
  }

  // --- Logs Panel ---
  function renderLogsPanel() {
    var html = renderPanelHeader('Logs', '<button class="panel-btn" id="panelClearLogsBtn">Clear</button>');

    // Filter chips
    html += '<div class="log-filter-chips">';
    html += '<button class="filter-chip' + (logFilter === 'all' ? ' active' : '') + '" data-filter="all">All</button>';
    html += '<button class="filter-chip' + (logFilter === 'agent' ? ' active' : '') + '" data-filter="agent">Agent</button>';
    html += '<button class="filter-chip' + (logFilter === 'bridge' ? ' active' : '') + '" data-filter="bridge">Bridge</button>';
    html += '</div>';

    // Log scroll
    html += '<div class="log-scroll" id="logScroll">';
    html += renderLogLines();
    html += '</div>';

    return html;
  }

  function renderLogLines() {
    var html = '';
    for (var i = 0; i < logBuffer.length; i++) {
      var line = logBuffer[i];
      if (logFilter !== 'all') {
        var svc = parseLogService(line);
        if (svc !== logFilter) continue;
      }
      html += renderLogLine(line);
    }
    if (html === '') {
      html = '<div class="panel-empty">No logs yet</div>';
    }
    return html;
  }

  function renderLogLine(line) {
    // Parse log line: could be a string or object with {timestamp, service, message, stream}
    if (typeof line === 'object' && line !== null) {
      var ts = formatTime(line.timestamp || line.ts);
      var svc = line.service || line.svc || '';
      var msg = line.message || line.msg || line.text || line.data || '';
      var isStderr = line.stream === 'stderr';
      return '<div class="log-line' + (isStderr ? ' stderr' : '') + '">'
        + '<span class="ts">' + esc(ts) + '</span>'
        + '<span class="svc ' + esc(svc) + '">' + esc(svc) + '</span>'
        + '<span class="msg">' + esc(String(msg)) + '</span>'
        + '</div>';
    }
    // Plain string
    return '<div class="log-line"><span class="msg">' + esc(String(line)) + '</span></div>';
  }

  function parseLogService(line) {
    if (typeof line === 'object' && line !== null) {
      return (line.service || line.svc || '').toLowerCase();
    }
    // Try to extract from string: "[agent]" or "[bridge]"
    var str = String(line);
    if (str.indexOf('[agent]') !== -1 || str.indexOf('agent') !== -1) return 'agent';
    if (str.indexOf('[bridge]') !== -1 || str.indexOf('bridge') !== -1) return 'bridge';
    return '';
  }

  // --- Services Panel ---
  function renderServicesPanel() {
    var statuses = window.app.serviceStatuses || {};
    var html = renderPanelHeader('Services');

    // Agent card
    html += renderServiceCard('agent', statuses.agent || {});

    // Bridge card
    html += renderServiceCard('bridge', statuses.bridge || {});

    // Tunnel card
    html += renderServiceCard('tunnel', statuses.tunnel || {});

    // Platform toggles
    html += '<div id="platformToggles">';
    html += renderPlatformToggles();
    html += '</div>';

    // Rebuild all button
    html += '<div style="margin-top: var(--space-md);">';
    html += '<button class="service-btn danger" id="panelRebuildAllBtn" style="width:100%;">Rebuild &amp; Restart All</button>';
    html += '</div>';

    return html;
  }

  function renderServiceCard(name, info) {
    var status = info.status || 'stopped';
    var pid = info.pid || '--';
    var uptime = info.uptime ? formatDuration(info.uptime) : '--';

    var html = '<div class="service-card" id="serviceCard_' + esc(name) + '">';
    html += '<div class="service-card-header">';
    html += '<span class="service-card-name">' + esc(name.charAt(0).toUpperCase() + name.slice(1)) + '</span>';
    html += '<span class="service-status-badge ' + esc(status) + '">' + esc(status) + '</span>';
    html += '</div>';
    html += '<div class="service-card-info">PID: ' + esc(String(pid)) + ' &middot; Uptime: ' + esc(uptime) + '</div>';
    html += '<div class="service-card-actions">';

    if (status === 'running') {
      html += '<button class="service-btn" onclick="window.app.serviceAction(\'' + esc(name) + '\', \'stop\')">Stop</button>';
      html += '<button class="service-btn" onclick="window.app.serviceAction(\'' + esc(name) + '\', \'restart\')">Restart</button>';
    } else {
      html += '<button class="service-btn" onclick="window.app.serviceAction(\'' + esc(name) + '\', \'start\')">Start</button>';
    }

    if (name === 'bridge') {
      html += '<button class="service-btn" onclick="window.app.serviceAction(\'bridge\', \'relink\')">Re-link</button>';
    }

    html += '</div></div>';
    return html;
  }

  function renderPlatformToggles() {
    // Only render if platform module provides state
    var platform = window.app.platform;
    if (!platform || !platform.getState) return '';

    var state = platform.getState();
    var html = '';

    if (state.whatsapp !== undefined) {
      html += '<div class="platform-toggle-row">';
      html += '<span class="platform-toggle-label">WhatsApp</span>';
      html += '<div class="toggle-switch' + (state.whatsapp ? ' active' : '') + '" data-platform="whatsapp"></div>';
      html += '</div>';
    }

    if (state.telegram !== undefined) {
      html += '<div class="platform-toggle-row">';
      html += '<span class="platform-toggle-label">Telegram</span>';
      html += '<div class="toggle-switch' + (state.telegram ? ' active' : '') + '" data-platform="telegram"></div>';
      html += '</div>';
    }

    return html;
  }

  // --- Settings Panel ---
  function renderSettingsPanel() {
    var currentDir = getProjectsDir();
    var html = renderPanelHeader('Settings');

    html += '<div style="padding:var(--space-md);">';

    // Projects directory setting
    html += '<div style="margin-bottom:var(--space-lg);">';
    html += '<label style="display:block;font-size:var(--font-ui-sm);color:var(--text-dim);margin-bottom:var(--space-xs);">Default Projects Folder</label>';
    html += '<div style="display:flex;gap:var(--space-xs);">';
    html += '<input class="panel-input" id="settingsProjectsDir" type="text" placeholder="e.g. C:\\Users\\you\\Projects" value="' + esc(currentDir) + '" style="flex:1;">';
    html += '<button class="panel-btn primary" id="settingsSaveDir" style="white-space:nowrap;">Save</button>';
    html += '</div>';
    html += '<div style="font-size:0.8em;color:var(--text-dim);margin-top:var(--space-xs);">The folder browser will start here when creating new sessions.</div>';
    html += '</div>';

    // Quick-pick common paths
    html += '<div style="margin-bottom:var(--space-lg);">';
    html += '<label style="display:block;font-size:var(--font-ui-sm);color:var(--text-dim);margin-bottom:var(--space-xs);">Quick Pick</label>';
    html += '<div id="settingsQuickPicks" style="display:flex;flex-wrap:wrap;gap:var(--space-xs);"></div>';
    html += '</div>';

    html += '</div>';

    // Load quick-pick suggestions from the home directory
    setTimeout(function () {
      var input = document.getElementById('settingsProjectsDir');
      var saveBtn = document.getElementById('settingsSaveDir');
      var quickPicks = document.getElementById('settingsQuickPicks');

      if (saveBtn) {
        saveBtn.addEventListener('click', function () {
          var val = input ? input.value.trim() : '';
          if (!val) {
            if (window.app.showToast) window.app.showToast('Enter a folder path');
            return;
          }
          // Validate via API
          fetch('/api/browse?path=' + encodeURIComponent(val))
            .then(function (r) { return r.json(); })
            .then(function (data) {
              if (data.error) {
                if (window.app.showToast) window.app.showToast('Invalid path: ' + data.error);
                return;
              }
              var resolved = data.current || val;
              setProjectsDir(resolved);
              if (input) input.value = resolved;
              if (window.app.showToast) window.app.showToast('Default folder saved!');
            })
            .catch(function () {
              if (window.app.showToast) window.app.showToast('Could not validate path');
            });
        });
      }

      // Fetch home directory contents for quick picks
      if (quickPicks) {
        fetch('/api/browse?path=~')
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (!data.entries) return;
            var picks = data.entries.filter(function (e) {
              var n = e.name.toLowerCase();
              return n.indexOf('project') !== -1 || n.indexOf('code') !== -1 ||
                     n.indexOf('coding') !== -1 || n.indexOf('repos') !== -1 ||
                     n.indexOf('dev') !== -1 || n.indexOf('src') !== -1 ||
                     n.indexOf('workspace') !== -1 || n.indexOf('github') !== -1 ||
                     n === 'documents' || n === 'desktop';
            });
            if (picks.length === 0) picks = data.entries.slice(0, 6);

            var html2 = '';
            for (var i = 0; i < picks.length; i++) {
              html2 += '<button class="panel-btn" data-path="' + esc(picks[i].path) + '" style="font-size:0.85em;">';
              html2 += (picks[i].isGitRepo ? '&#x1F4E6; ' : '&#x1F4C1; ') + esc(picks[i].name);
              html2 += '</button>';
            }
            quickPicks.innerHTML = html2;

            // Bind quick pick clicks
            quickPicks.addEventListener('click', function (ev) {
              var btn = ev.target.closest('[data-path]');
              if (!btn) return;
              var path = btn.getAttribute('data-path');
              if (input) input.value = path;
            });
          })
          .catch(function () { /* ignore */ });
      }
    }, 0);

    return html;
  }

  // --- Messages Panel ---
  function renderMessagesPanel() {
    var html = renderPanelHeader('Messages');

    // Session picker
    html += '<select class="session-picker" id="panelMessageSessionPicker">';
    html += '<option value="">Select session...</option>';
    html += '</select>';

    // Messages container
    html += '<div class="messages-container" id="panelMessagesContainer">';
    html += '<div class="panel-empty"><div class="empty-icon">&#x1F4AC;</div>Select a session to view messages</div>';
    html += '</div>';

    // Load sessions for the picker
    setTimeout(loadMessageSessionPicker, 0);

    return html;
  }

  function loadMessageSessionPicker() {
    fetch('/api/sessions')
      .then(function (res) { return res.json(); })
      .then(function (sessions) {
        var picker = document.getElementById('panelMessageSessionPicker');
        if (!picker) return;

        for (var i = 0; i < sessions.length; i++) {
          var s = sessions[i];
          var opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = s.name || s.id;
          if (s.id === window.app.activeSessionId) {
            opt.selected = true;
          }
          picker.appendChild(opt);
        }

        // Auto-load messages for active session
        if (window.app.activeSessionId) {
          loadMessages(window.app.activeSessionId);
        }
      })
      .catch(function () { /* fail silently */ });
  }

  function loadMessages(sessionId) {
    if (!sessionId) return;
    var container = document.getElementById('panelMessagesContainer');
    if (!container) return;
    container.innerHTML = '<div class="panel-empty">Loading messages...</div>';

    fetch('/api/sessions/' + encodeURIComponent(sessionId) + '/messages?limit=50')
      .then(function (res) { return res.json(); })
      .then(function (messages) {
        var el = document.getElementById('panelMessagesContainer');
        if (!el) return;

        if (!messages || messages.length === 0) {
          el.innerHTML = '<div class="panel-empty"><div class="empty-icon">&#x1F4AC;</div>No messages yet</div>';
          return;
        }

        var html = '';
        for (var i = 0; i < messages.length; i++) {
          var m = messages[i];
          var direction = m.direction || (m.role === 'assistant' ? 'outgoing' : 'incoming');
          var text = m.text || m.content || m.message || '';
          var isTruncated = text.length > 300;
          var displayText = isTruncated ? text.slice(0, 300) + '...' : text;
          var source = m.source || m.platform || '';
          var time = formatTime(m.timestamp || m.createdAt || m.ts);

          html += '<div class="message-bubble ' + esc(direction) + (isTruncated ? ' truncated' : '') + '" data-full-text="' + esc(text) + '">';
          if (source) {
            html += '<div class="msg-source">' + esc(source) + '</div>';
          }
          html += '<div class="msg-text">' + esc(displayText) + '</div>';
          html += '<div class="msg-time">' + esc(time) + '</div>';
          html += '</div>';
        }
        el.innerHTML = html;
      })
      .catch(function () {
        var el = document.getElementById('panelMessagesContainer');
        if (el) {
          el.innerHTML = '<div class="panel-empty"><div class="empty-icon">!</div>Failed to load messages</div>';
        }
      });
  }

  // --- Audit Panel ---
  function renderAuditPanel() {
    var html = renderPanelHeader('Audit');

    html += '<div id="panelAuditList"><div class="panel-empty">Loading audit events...</div></div>';

    setTimeout(loadAuditList, 0);

    return html;
  }

  function loadAuditList() {
    fetch('/api/audit?limit=100')
      .then(function (res) { return res.json(); })
      .then(function (events) {
        var list = document.getElementById('panelAuditList');
        if (!list) return;

        if (!events || events.length === 0) {
          list.innerHTML = '<div class="panel-empty"><div class="empty-icon">&#x1F4DC;</div>No audit events</div>';
          return;
        }

        var html = '';
        for (var i = 0; i < events.length; i++) {
          var ev = events[i];
          var isBlocked = ev.blocked || ev.event === 'blocked';
          var time = formatTime(ev.timestamp || ev.ts || ev.createdAt);
          var eventName = ev.event || ev.type || '';
          var detail = ev.detail || ev.message || ev.description || '';
          var source = ev.source || '';

          html += '<div class="audit-item' + (isBlocked ? ' blocked' : '') + '">';
          html += '<span class="audit-time">' + esc(time) + '</span>';
          html += '<span class="audit-event">' + esc(eventName) + '</span>';
          html += '<span class="audit-detail">' + esc(source ? source + ': ' : '') + esc(detail) + '</span>';
          html += '</div>';
        }
        list.innerHTML = html;
      })
      .catch(function () {
        var list = document.getElementById('panelAuditList');
        if (list) {
          list.innerHTML = '<div class="panel-empty"><div class="empty-icon">!</div>Failed to load audit events</div>';
        }
      });
  }

  // --- New Session Panel ---
  function renderNewSessionPanel() {
    var html = '<div class="panel-header">';
    html += '<button class="panel-btn" id="panelCancelNewSession" style="margin-right:auto;">&#x2190; Back</button>';
    html += '<h2>New Session</h2>';
    html += '</div>';

    // Recent projects (shown as quick-launch cards)
    var recent = getRecentProjects();
    if (recent.length > 0) {
      html += '<h3 style="font-size:var(--font-ui-sm);color:var(--text-dim);margin:var(--space-sm) var(--space-md) var(--space-xs);">Recent Projects</h3>';
      html += '<div class="new-session-panel"><div class="recent-grid">';
      for (var i = 0; i < recent.length && i < 6; i++) {
        var r = recent[i];
        var name = r.name || r.path.split('/').pop() || r.path.split('\\').pop() || 'Project';
        html += '<div class="recent-project-card" data-path="' + esc(r.path) + '">';
        html += '<span class="recent-project-icon">&#x1F4C1;</span>';
        html += '<div class="recent-project-info">';
        html += '<div class="project-name">' + esc(name) + '</div>';
        html += '<div class="project-path">' + esc(trunc(r.path, 50)) + '</div>';
        html += '</div>';
        html += '<span class="recent-project-chevron">&#x203A;</span>';
        html += '</div>';
      }
      html += '</div></div>';
    }

    // Folder browser
    html += '<h3 style="font-size:var(--font-ui-sm);color:var(--text-dim);margin:var(--space-sm) var(--space-md) var(--space-xs);">Browse Folder</h3>';
    html += '<div class="panel-folder-browser" id="panelFolderBrowser">';
    html += '<div class="panel-breadcrumbs" id="panelBreadcrumbs"></div>';
    html += '<input class="panel-folder-search" id="panelFolderSearch" type="text" placeholder="Filter folders...">';
    html += '<div class="panel-folder-list" id="panelFolderList">';
    html += '<div class="panel-empty">Loading...</div>';
    html += '</div>';
    html += '</div>';

    // Sticky footer: selected path + create button
    html += '<div class="panel-new-session-footer" id="panelNewSessionFooter">';
    html += '<input class="panel-input" id="panelSessionName" type="text" placeholder="Session name (optional)">';
    html += '<div class="panel-selected-path">';
    html += '<span class="selected-path-label">Path:</span>';
    html += '<input class="panel-input" id="panelSessionPath" type="text" placeholder="Select a folder above" readonly>';
    html += '</div>';
    html += '<button class="panel-btn primary panel-create-btn" id="panelCreateSession">Create Session</button>';
    html += '</div>';

    // Load initial folder listing
    setTimeout(function () { browseTo(getDefaultBrowsePath()); }, 0);

    return html;
  }

  var currentBrowsePath = '';
  var cachedFolderEntries = [];

  /**
   * createSessionFromPath(path, name)
   * Quick-creates a session from a given path. Used by recent project cards.
   */
  function createSessionFromPath(path, name) {
    var body = { projectPath: path };
    if (name) body.name = name;

    fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (res) { return res.json(); })
      .then(function (session) {
        addRecentProject(path, name || session.name);
        window.app.activeSessionId = session.id;
        window.app.showToast('Session created: ' + (session.name || name || path));
        if (window.app.terminal) {
          window.app.terminal.getOrCreate(session.id, session.name || name || session.id);
        }
        close();
        if (window.app.terminal) {
          window.app.terminal.switchTo(session.id);
        }
        setTimeout(function () {
          if (window.app.terminal) window.app.terminal.fitActive();
        }, 100);
      })
      .catch(function () {
        window.app.showToast('Failed to create session');
      });
  }

  function browseTo(path) {
    currentBrowsePath = path;

    // Clear search filter on navigation
    var searchInput = document.getElementById('panelFolderSearch');
    if (searchInput) searchInput.value = '';

    fetch('/api/browse?path=' + encodeURIComponent(path))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        renderBreadcrumbs(data.path || path);
        cachedFolderEntries = data.entries || data.folders || data.items || [];
        renderFolderList(cachedFolderEntries);

        // Update path input
        var pathInput = document.getElementById('panelSessionPath');
        if (pathInput) pathInput.value = data.path || path;
      })
      .catch(function () {
        var list = document.getElementById('panelFolderList');
        if (list) {
          list.innerHTML = '<div class="panel-empty">Failed to browse directory</div>';
        }
      });
  }

  function renderBreadcrumbs(path) {
    var el = document.getElementById('panelBreadcrumbs');
    if (!el) return;

    // Split path into parts
    var separator = path.indexOf('\\') !== -1 ? '\\' : '/';
    var parts = path.split(/[/\\]/).filter(function (p) { return p; });
    var html = '';

    // Root
    html += '<span class="crumb" data-path="' + (separator === '\\' ? 'C:\\' : '/') + '">' + (separator === '\\' ? 'C:\\' : '/') + '</span>';

    var accumulated = separator === '\\' ? '' : '';
    for (var i = 0; i < parts.length; i++) {
      accumulated += (i === 0 && separator === '\\' ? '' : separator) + parts[i];
      var fullPath = separator === '\\' ? parts[0] + '\\' : '/';
      if (separator === '\\') {
        fullPath = parts.slice(0, i + 1).join('\\');
      } else {
        fullPath = '/' + parts.slice(0, i + 1).join('/');
      }
      html += '<span class="sep">' + separator + '</span>';
      html += '<span class="crumb" data-path="' + esc(fullPath) + '">' + esc(parts[i]) + '</span>';
    }

    el.innerHTML = html;
  }

  function renderFolderList(entries) {
    var el = document.getElementById('panelFolderList');
    if (!el) return;

    if (!entries || entries.length === 0) {
      // Still show "Use this folder" and parent nav even when empty
      var emptyHtml = '';
      emptyHtml += '<div class="panel-folder-item use-folder" data-action="use-current">';
      emptyHtml += '<span class="folder-icon" style="color:var(--accent);">&#x2713;</span>';
      emptyHtml += '<span class="folder-name" style="color:var(--accent);font-weight:600;">Use this folder</span>';
      emptyHtml += '</div>';
      emptyHtml += '<div class="panel-folder-item" data-path="..">';
      emptyHtml += '<span class="folder-icon">&#x1F4C1;</span>';
      emptyHtml += '<span class="folder-name">..</span>';
      emptyHtml += '<span class="folder-chevron">&#x203A;</span>';
      emptyHtml += '</div>';
      emptyHtml += '<div class="panel-empty">No subfolders</div>';
      el.innerHTML = emptyHtml;
      return;
    }

    var html = '';
    // "Use this folder" button — lets user pick the current directory
    html += '<div class="panel-folder-item use-folder" data-action="use-current">';
    html += '<span class="folder-icon" style="color:var(--accent);">&#x2713;</span>';
    html += '<span class="folder-name" style="color:var(--accent);font-weight:600;">Use this folder</span>';
    html += '</div>';

    // "Set as default" button — pin this directory as the default browse root
    var isDefault = currentBrowsePath === getProjectsDir();
    html += '<div class="panel-folder-item" data-action="set-default" style="opacity:' + (isDefault ? '0.5' : '1') + ';">';
    html += '<span class="folder-icon" style="color:var(--warning);">&#x2606;</span>';
    html += '<span class="folder-name" style="color:var(--text-dim);font-size:0.85em;">' + (isDefault ? 'Default folder &#x2713;' : 'Set as default folder') + '</span>';
    html += '</div>';

    // Parent directory link
    html += '<div class="panel-folder-item" data-path="..">';
    html += '<span class="folder-icon">&#x1F4C1;</span>';
    html += '<span class="folder-name">..</span>';
    html += '<span class="folder-chevron">&#x203A;</span>';
    html += '</div>';

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var name = entry.name || entry;
      var isDir = entry.isDirectory !== undefined ? entry.isDirectory : true;
      var icon = isDir ? '&#x1F4C1;' : '&#x1F4C4;';
      var entryPath = entry.path || (currentBrowsePath + '/' + name);

      if (isDir) {
        html += '<div class="panel-folder-item" data-path="' + esc(entryPath) + '">';
        html += '<span class="folder-icon">' + icon + '</span>';
        html += '<span class="folder-name">' + esc(name) + '</span>';
        html += '<span class="folder-chevron">&#x203A;</span>';
        html += '</div>';
      }
    }

    el.innerHTML = html;
  }

  function getRecentProjects() {
    try {
      var stored = localStorage.getItem('claudeBridge_recentPaths');
      if (stored) return JSON.parse(stored);
    } catch (e) { /* ignore */ }
    return [];
  }

  function addRecentProject(path, name) {
    var recent = getRecentProjects();
    // Remove if exists
    recent = recent.filter(function (r) { return r.path !== path; });
    // Add to front
    recent.unshift({ path: path, name: name || '' });
    // Limit to 10
    if (recent.length > 10) recent = recent.slice(0, 10);
    try {
      localStorage.setItem('claudeBridge_recentPaths', JSON.stringify(recent));
    } catch (e) { /* ignore */ }
  }

  function getDefaultBrowsePath() {
    // 1. User-configured projects directory (set during onboarding or settings)
    var configured = localStorage.getItem('claudeBridge_projectsDir');
    if (configured) return configured;

    // 2. Parent of most recent project
    var recent = getRecentProjects();
    if (recent.length > 0) {
      var last = recent[0].path;
      var sep = last.indexOf('\\') !== -1 ? '\\' : '/';
      var parts = last.split(sep);
      parts.pop();
      return parts.join(sep) || (sep === '\\' ? 'C:\\' : '/');
    }

    // 3. Fall back to user's home directory (API resolves ~ or homedir)
    return '~';
  }

  function setProjectsDir(path) {
    localStorage.setItem('claudeBridge_projectsDir', path);
  }

  function getProjectsDir() {
    return localStorage.getItem('claudeBridge_projectsDir') || '';
  }

  // =========================================================================
  // PANEL EVENT BINDING
  // =========================================================================

  function bindPanelEvents(panelName) {
    // Maximize button (desktop only)
    var maxBtn = document.getElementById('panelMaximizeBtn');
    if (maxBtn) {
      maxBtn.addEventListener('click', toggleMaximize);
    }

    switch (panelName) {
      case 'sessions':
        bindSessionsPanelEvents();
        break;
      case 'logs':
        bindLogsPanelEvents();
        break;
      case 'services':
        bindServicesPanelEvents();
        break;
      case 'messages':
        bindMessagesPanelEvents();
        break;
      case 'audit':
        // No interactive events needed
        break;
      case 'newSession':
        bindNewSessionPanelEvents();
        break;
    }
  }

  function bindSessionsPanelEvents() {
    // New session button
    var newBtn = document.getElementById('panelNewSessionBtn');
    if (newBtn) {
      newBtn.addEventListener('click', function () {
        currentPanel = 'newSession';
        var target = isMobile() ? content : sidebarPanel;
        target.innerHTML = renderPanel('newSession');
        bindPanelEvents('newSession');
      });
    }

    // Session card clicks (delegated)
    var target = isMobile() ? content : sidebarPanel;
    target.addEventListener('click', function (e) {
      var card = e.target.closest('.session-card');
      if (!card) return;

      // Check if clicking delete reveal
      if (e.target.closest('.delete-reveal')) {
        var deleteId = card.getAttribute('data-session-id');
        if (deleteId) {
          fetch('/api/sessions/' + encodeURIComponent(deleteId), { method: 'DELETE' })
            .then(function () { loadSessionsList(); })
            .catch(function () { window.app.showToast('Failed to delete session'); });
        }
        return;
      }

      var sessionId = card.getAttribute('data-session-id');
      if (sessionId) {
        // Activate session
        var sessionName = card.querySelector('.session-card-name');
        var nameText = sessionName ? sessionName.textContent : sessionId;
        fetch('/api/sessions/' + encodeURIComponent(sessionId) + '/activate', { method: 'POST' })
          .then(function (res) { return res.json(); })
          .then(function () {
            window.app.activeSessionId = sessionId;
            // Create terminal immediately (before closing panel)
            if (window.app.terminal) {
              window.app.terminal.getOrCreate(sessionId, nameText);
            }
            // Close panel
            close();
            // Switch terminal immediately
            if (window.app.terminal) {
              window.app.terminal.switchTo(sessionId);
            }
            // Refit after panel animation completes (layout changes)
            setTimeout(function () {
              if (window.app.terminal) window.app.terminal.fitActive();
            }, 100);
            setTimeout(function () {
              if (window.app.terminal) window.app.terminal.fitActive();
            }, 350);
          })
          .catch(function () {
            window.app.showToast('Failed to activate session');
          });
      }
    });
  }

  function bindLogsPanelEvents() {
    // Clear button
    var clearBtn = document.getElementById('panelClearLogsBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        clearLogs();
      });
    }

    // Filter chips (delegated)
    var target = isMobile() ? content : sidebarPanel;
    target.addEventListener('click', function (e) {
      var chip = e.target.closest('.filter-chip');
      if (!chip) return;

      var filter = chip.getAttribute('data-filter');
      if (!filter) return;

      logFilter = filter;

      // Update active state on chips
      var chips = target.querySelectorAll('.filter-chip');
      for (var i = 0; i < chips.length; i++) {
        chips[i].classList.toggle('active', chips[i].getAttribute('data-filter') === filter);
      }

      // Re-render log lines
      var logScroll = document.getElementById('logScroll');
      if (logScroll) {
        logScroll.innerHTML = renderLogLines();
        logScroll.scrollTop = logScroll.scrollHeight;
      }
    });
  }

  function bindServicesPanelEvents() {
    // Rebuild all button
    var rebuildBtn = document.getElementById('panelRebuildAllBtn');
    if (rebuildBtn) {
      rebuildBtn.addEventListener('click', function () {
        if (confirm('Rebuild and restart all services?')) {
          window.app.serviceAction('agent', 'restart');
          window.app.serviceAction('bridge', 'restart');
          window.app.showToast('Restarting all services...');
        }
      });
    }

    // Platform toggle switches (delegated)
    var target = isMobile() ? content : sidebarPanel;
    target.addEventListener('click', function (e) {
      var toggle = e.target.closest('.toggle-switch');
      if (!toggle) return;

      var platform = toggle.getAttribute('data-platform');
      if (!platform) return;

      if (window.app.platform && window.app.platform.toggle) {
        window.app.platform.toggle(platform);
        toggle.classList.toggle('active');
      }
    });
  }

  function bindMessagesPanelEvents() {
    // Session picker change
    var picker = document.getElementById('panelMessageSessionPicker');
    if (picker) {
      picker.addEventListener('change', function () {
        loadMessages(picker.value);
      });
    }

    // Message bubble expand on click (delegated)
    var target = isMobile() ? content : sidebarPanel;
    target.addEventListener('click', function (e) {
      var bubble = e.target.closest('.message-bubble.truncated');
      if (!bubble) return;

      var fullText = bubble.getAttribute('data-full-text');
      if (fullText) {
        var textEl = bubble.querySelector('.msg-text');
        if (textEl) {
          textEl.textContent = fullText;
          bubble.classList.remove('truncated');
        }
      }
    });
  }

  function bindNewSessionPanelEvents() {
    // Cancel button
    var cancelBtn = document.getElementById('panelCancelNewSession');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        // Go back to sessions panel
        currentPanel = 'sessions';
        var target = isMobile() ? content : sidebarPanel;
        target.innerHTML = renderPanel('sessions');
        bindPanelEvents('sessions');
      });
    }

    // Create button
    var createBtn = document.getElementById('panelCreateSession');
    if (createBtn) {
      createBtn.addEventListener('click', function () {
        var nameInput = document.getElementById('panelSessionName');
        var pathInput = document.getElementById('panelSessionPath');
        var name = nameInput ? nameInput.value.trim() : '';
        var path = pathInput ? pathInput.value.trim() : '';

        if (!path) {
          window.app.showToast('Please select a project folder');
          return;
        }

        var body = { projectPath: path };
        if (name) body.name = name;

        fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
          .then(function (res) { return res.json(); })
          .then(function (session) {
            addRecentProject(path, name || session.name);
            window.app.activeSessionId = session.id;
            window.app.showToast('Session created');
            if (window.app.terminal) {
              window.app.terminal.getOrCreate(session.id, session.name || name || session.id);
            }
            close();
            if (window.app.terminal) {
              window.app.terminal.switchTo(session.id);
            }
            setTimeout(function () {
              if (window.app.terminal) window.app.terminal.fitActive();
            }, 100);
            setTimeout(function () {
              if (window.app.terminal) window.app.terminal.fitActive();
            }, 350);
          })
          .catch(function () {
            window.app.showToast('Failed to create session');
          });
      });
    }

    // Folder search/filter
    var folderSearch = document.getElementById('panelFolderSearch');
    if (folderSearch) {
      folderSearch.addEventListener('input', function () {
        var query = folderSearch.value.trim().toLowerCase();
        if (!query) {
          renderFolderList(cachedFolderEntries);
          return;
        }
        var filtered = cachedFolderEntries.filter(function (entry) {
          var name = (entry.name || entry).toLowerCase();
          return name.indexOf(query) !== -1;
        });
        renderFolderList(filtered);
      });
    }

    // Recent project cards — single tap creates session immediately
    var target = isMobile() ? content : sidebarPanel;
    target.addEventListener('click', function (e) {
      var card = e.target.closest('.recent-project-card');
      if (card) {
        var path = card.getAttribute('data-path');
        if (path) {
          // Extract name from the card
          var nameEl = card.querySelector('.project-name');
          var name = nameEl ? nameEl.textContent : '';
          // Create session immediately
          createSessionFromPath(path, name);
        }
        return;
      }

      // Breadcrumb clicks
      var crumb = e.target.closest('.crumb');
      if (crumb) {
        var crumbPath = crumb.getAttribute('data-path');
        if (crumbPath) browseTo(crumbPath);
        return;
      }

      // "Set as default folder" action
      var setDefault = e.target.closest('[data-action="set-default"]');
      if (setDefault) {
        setProjectsDir(currentBrowsePath);
        if (window.app.showToast) window.app.showToast('Default folder: ' + currentBrowsePath);
        // Re-render to update the button state
        renderFolderList(cachedFolderEntries);
        return;
      }

      // "Use this folder" action
      var useCurrent = e.target.closest('[data-action="use-current"]');
      if (useCurrent) {
        var pathInput = document.getElementById('panelSessionPath');
        if (pathInput) pathInput.value = currentBrowsePath;
        // Auto-fill session name from folder name
        var nameInput = document.getElementById('panelSessionName');
        if (nameInput && !nameInput.value) {
          var sep = currentBrowsePath.indexOf('\\') !== -1 ? '\\' : '/';
          var folderName = currentBrowsePath.split(sep).pop();
          if (folderName) nameInput.value = folderName;
        }
        if (window.app.showToast) window.app.showToast('Selected: ' + currentBrowsePath);
        return;
      }

      // Folder item clicks
      var folderItem = e.target.closest('.panel-folder-item');
      if (folderItem) {
        var folderPath = folderItem.getAttribute('data-path');
        if (folderPath === '..') {
          // Go up
          var sep2 = currentBrowsePath.indexOf('\\') !== -1 ? '\\' : '/';
          var parts = currentBrowsePath.split(sep2);
          parts.pop();
          var parentPath = parts.join(sep2) || (sep2 === '\\' ? 'C:\\' : '/');
          browseTo(parentPath);
        } else if (folderPath) {
          browseTo(folderPath);
          // Auto-select this as the project path
          var pathInput2 = document.getElementById('panelSessionPath');
          if (pathInput2) pathInput2.value = folderPath;
        }
        return;
      }
    });
  }

  // =========================================================================
  // LOG MANAGEMENT
  // =========================================================================

  function appendLog(line) {
    logBuffer.push(line);
    if (logBuffer.length > LOG_BUFFER_MAX) {
      logBuffer.shift();
    }

    // If logs panel is open, append the line to the DOM
    if (currentPanel === 'logs') {
      var logScroll = document.getElementById('logScroll');
      if (!logScroll) return;

      // Check filter
      if (logFilter !== 'all') {
        var svc = parseLogService(line);
        if (svc !== logFilter) return;
      }

      // Remove empty state if present
      var empty = logScroll.querySelector('.panel-empty');
      if (empty) empty.remove();

      var lineHtml = renderLogLine(line);
      var div = document.createElement('div');
      div.innerHTML = lineHtml;
      var lineEl = div.firstChild;
      logScroll.appendChild(lineEl);

      // Auto-scroll to bottom
      logScroll.scrollTop = logScroll.scrollHeight;
    }
  }

  function clearLogs() {
    logBuffer = [];

    var logScroll = document.getElementById('logScroll');
    if (logScroll) {
      logScroll.innerHTML = '<div class="panel-empty">No logs yet</div>';
    }
  }

  // =========================================================================
  // SERVICE UPDATES
  // =========================================================================

  function updateService(name, info) {
    if (currentPanel !== 'services') return;

    var card = document.getElementById('serviceCard_' + name);
    if (!card) return;

    // Re-render just this service card
    card.outerHTML = renderServiceCard(name, info);
  }

  // =========================================================================
  // DESKTOP SIDEBAR
  // =========================================================================

  // Sidebar button clicks
  if (sidebar) {
    var sidebarBtns = sidebar.querySelectorAll('.sidebar-btn[data-panel]');
    for (var i = 0; i < sidebarBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var panelName = btn.getAttribute('data-panel');
          if (panelName) toggle(panelName);
        });
      })(sidebarBtns[i]);
    }
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', function (e) {
    // Don't capture if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      if (e.key === 'Escape' && currentPanel) {
        close();
        e.preventDefault();
      }
      return;
    }

    // `[` toggles sidebar
    if (e.key === '[') {
      if (currentPanel) {
        close();
      } else {
        open('sessions');
      }
      e.preventDefault();
      return;
    }

    // `Escape` closes panel
    if (e.key === 'Escape' && currentPanel) {
      close();
      e.preventDefault();
      return;
    }

    // `1`-`5` open panels by index
    var PANEL_KEYS = { '1': 'sessions', '2': 'logs', '3': 'services', '4': 'messages', '5': 'audit' };
    if (PANEL_KEYS[e.key]) {
      toggle(PANEL_KEYS[e.key]);
      e.preventDefault();
      return;
    }
  });

  // =========================================================================
  // MOBILE BOTTOM NAV
  // =========================================================================

  var mobileNav = document.getElementById('mobileNav');
  if (mobileNav) {
    var navBtns = mobileNav.querySelectorAll('.mobile-nav-btn[data-panel]');
    for (var j = 0; j < navBtns.length; j++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var panelName = btn.getAttribute('data-panel');
          if (panelName) {
            toggle(panelName);
            // Update active state on nav buttons
            updateMobileNavActive(panelName);
          }
        });
      })(navBtns[j]);
    }
  }

  function updateMobileNavActive(activePanelName) {
    if (!mobileNav) return;
    var btns = mobileNav.querySelectorAll('.mobile-nav-btn');
    for (var k = 0; k < btns.length; k++) {
      if (btns[k].getAttribute('data-panel') === activePanelName && currentPanel === activePanelName) {
        btns[k].classList.add('active');
      } else {
        btns[k].classList.remove('active');
      }
    }
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  window.app.panels = {
    open: open,
    close: close,
    toggle: toggle,
    isOpen: isOpen,
    toggleMaximize: toggleMaximize,
    appendLog: appendLog,
    clearLogs: clearLogs,
    updateService: updateService,
    renderSessionsPanel: renderSessionsPanel,
    renderLogsPanel: renderLogsPanel,
    renderServicesPanel: renderServicesPanel,
    renderMessagesPanel: renderMessagesPanel,
    renderAuditPanel: renderAuditPanel,
    renderNewSessionPanel: renderNewSessionPanel,
    setProjectsDir: setProjectsDir,
    getProjectsDir: getProjectsDir
  };

})();
