/* FAB — Floating Action Button with popup menu (mobile only) */

(function () {
  'use strict';

  // Only activate on mobile
  if (window.innerWidth > 768) return;

  // --- State ---
  var menuOpen = false;
  var commandBarVisible = false;

  // --- Drag state ---
  var dragStartX = 0;
  var dragStartY = 0;
  var dragCurrentX = 0;
  var dragCurrentY = 0;
  var dragMoved = false;
  var isDragging = false;
  var fabStartLeft = 0;
  var fabStartTop = 0;
  var FAB_POSITION_KEY = 'claudeBridge_fabPosition';
  var DRAG_THRESHOLD = 8;

  // --- DOM refs ---
  var fab = document.getElementById('fab');
  var fabMenu = document.getElementById('fabMenu');
  var fabBackdrop = document.getElementById('fabBackdrop');
  var appEl = document.getElementById('app');

  if (!fab || !fabMenu) return;

  // =========================================================================
  // FAB TOGGLE
  // =========================================================================

  function openMenu() {
    menuOpen = true;
    fab.classList.add('open');
    fabMenu.classList.add('open');
    if (fabBackdrop) fabBackdrop.classList.add('open');
    updateMessagingLabel();
    updateMenuPosition();
  }

  function closeMenu() {
    menuOpen = false;
    fab.classList.remove('open');
    fabMenu.classList.remove('open');
    if (fabBackdrop) fabBackdrop.classList.remove('open');
  }

  function toggleMenu() {
    if (menuOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  fab.addEventListener('click', function (e) {
    e.stopPropagation();
    // Skip toggle if we were dragging
    if (dragMoved) {
      dragMoved = false;
      return;
    }
    if (window.app.inputBar && window.app.inputBar.haptic) {
      window.app.inputBar.haptic('light');
    }
    toggleMenu();
  });

  if (fabBackdrop) {
    fabBackdrop.addEventListener('click', function () {
      closeMenu();
    });
  }

  // =========================================================================
  // DRAG HANDLING
  // =========================================================================

  // Restore saved position
  function restoreFabPosition() {
    try {
      var saved = localStorage.getItem(FAB_POSITION_KEY);
      if (saved) {
        var pos = JSON.parse(saved);
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
        fab.style.left = pos.x + 'px';
        fab.style.top = pos.y + 'px';
      }
    } catch (e) { /* ignore */ }
  }

  function saveFabPosition() {
    var rect = fab.getBoundingClientRect();
    try {
      localStorage.setItem(FAB_POSITION_KEY, JSON.stringify({
        x: rect.left,
        y: rect.top
      }));
    } catch (e) { /* ignore */ }
  }

  function snapToEdge(x, y) {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var fabW = fab.offsetWidth;
    var fabH = fab.offsetHeight;
    var margin = 16;

    // Snap horizontally to nearest edge
    var snapX = (x + fabW / 2) < (vw / 2) ? margin : vw - fabW - margin;

    // Clamp Y within viewport
    var snapY = Math.max(margin, Math.min(vh - fabH - margin, y));

    // Avoid overlapping repo pill area (top-left)
    if (snapX < vw / 2 && snapY < 60) {
      snapY = 60;
    }

    fab.classList.remove('dragging');
    fab.classList.add('snapping');

    fab.style.left = snapX + 'px';
    fab.style.top = snapY + 'px';
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';

    // Remove snapping class after transition
    setTimeout(function () {
      fab.classList.remove('snapping');
      saveFabPosition();
    }, 300);
  }

  function updateMenuPosition() {
    if (!fabMenu) return;
    var rect = fab.getBoundingClientRect();
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    // Position menu above or below FAB
    var spaceAbove = rect.top;
    var spaceBelow = vh - rect.bottom;
    var menuHeight = fabMenu.scrollHeight || 250;

    fabMenu.style.position = 'fixed';

    if (spaceAbove > menuHeight || spaceAbove > spaceBelow) {
      // Show above
      fabMenu.style.bottom = (vh - rect.top + 8) + 'px';
      fabMenu.style.top = 'auto';
    } else {
      // Show below
      fabMenu.style.top = (rect.bottom + 8) + 'px';
      fabMenu.style.bottom = 'auto';
    }

    // Position left or right of FAB
    if (rect.left > vw / 2) {
      fabMenu.style.right = (vw - rect.right) + 'px';
      fabMenu.style.left = 'auto';
    } else {
      fabMenu.style.left = rect.left + 'px';
      fabMenu.style.right = 'auto';
    }
  }

  fab.addEventListener('touchstart', function (e) {
    var touch = e.touches[0];
    if (!touch) return;

    dragStartX = touch.clientX;
    dragStartY = touch.clientY;
    dragMoved = false;
    isDragging = false;

    var rect = fab.getBoundingClientRect();
    fabStartLeft = rect.left;
    fabStartTop = rect.top;
  }, { passive: true });

  fab.addEventListener('touchmove', function (e) {
    var touch = e.touches[0];
    if (!touch) return;

    var dx = touch.clientX - dragStartX;
    var dy = touch.clientY - dragStartY;

    if (!isDragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      isDragging = true;
      dragMoved = true;
      fab.classList.add('dragging');
      // Close menu if open
      if (menuOpen) closeMenu();
    }

    if (isDragging) {
      e.preventDefault();
      requestAnimationFrame(function () {
        fab.style.left = (fabStartLeft + dx) + 'px';
        fab.style.top = (fabStartTop + dy) + 'px';
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
      });
    }
  }, { passive: false });

  fab.addEventListener('touchend', function () {
    if (isDragging) {
      isDragging = false;
      var rect = fab.getBoundingClientRect();
      snapToEdge(rect.left, rect.top);
    }
  });

  fab.addEventListener('touchcancel', function () {
    if (isDragging) {
      isDragging = false;
      var rect = fab.getBoundingClientRect();
      snapToEdge(rect.left, rect.top);
    }
  });

  // Restore position on load
  restoreFabPosition();

  // =========================================================================
  // MENU ACTIONS
  // =========================================================================

  var menuItems = fabMenu.querySelectorAll('.fab-menu-item');
  for (var i = 0; i < menuItems.length; i++) {
    (function (item) {
      item.addEventListener('click', function () {
        var action = item.getAttribute('data-action');
        if (window.app.inputBar && window.app.inputBar.haptic) {
          window.app.inputBar.haptic('light');
        }
        handleAction(action);
      });
    })(menuItems[i]);
  }

  function handleAction(action) {
    switch (action) {
      case 'repos':
        closeMenu();
        if (window.app.panels && window.app.panels.open) {
          window.app.panels.open('sessions');
        }
        break;

      case 'command-bar':
        toggleCommandBar();
        closeMenu();
        break;

      case 'stop':
        closeMenu();
        // Single tap sends Ctrl+C immediately on mobile
        if (window.app.terminal) {
          window.app.terminal.sendInput('\x03');
        }
        if (window.app.showToast) {
          window.app.showToast('Sent stop signal (Ctrl+C)');
        }
        if (window.app.inputBar && window.app.inputBar.haptic) {
          window.app.inputBar.haptic('medium');
        }
        break;

      case 'messaging':
        toggleMessaging();
        break;

      case 'settings':
        closeMenu();
        if (window.app.panels && window.app.panels.open) {
          window.app.panels.open('settings');
        }
        break;

      case 'more':
        closeMenu();
        if (window.app.panels && window.app.panels.open) {
          window.app.panels.open('services');
        }
        break;
    }
  }

  // =========================================================================
  // COMMAND BAR TOGGLE
  // =========================================================================

  function toggleCommandBar() {
    commandBarVisible = !commandBarVisible;
    window.app.commandBarVisible = commandBarVisible;

    if (appEl) {
      if (commandBarVisible) {
        appEl.classList.add('command-bar-visible');
      } else {
        appEl.classList.remove('command-bar-visible');
      }
    }

    // Refit terminal after layout change
    setTimeout(function () {
      if (window.app.terminal) window.app.terminal.fitActive();
    }, 50);
  }

  // =========================================================================
  // MESSAGING TOGGLE
  // =========================================================================

  function updateMessagingLabel() {
    var el = document.getElementById('fabMessaging');
    if (!el) return;

    var label = el.querySelector('.fab-menu-label');
    if (!label) return;

    if (window.app.platform && window.app.platform.getState) {
      var state = window.app.platform.getState();
      var anyPaused = state.whatsapp || state.telegram;
      label.textContent = anyPaused ? 'Messaging OFF' : 'Messaging ON';
    }
  }

  function toggleMessaging() {
    if (window.app.platform && window.app.platform.toggleAll) {
      window.app.platform.toggleAll();
      // Update label after a brief delay for API response
      setTimeout(updateMessagingLabel, 500);
    } else {
      // Fallback: toggle both individually
      if (window.app.platform && window.app.platform.toggle) {
        window.app.platform.toggle('whatsapp');
        window.app.platform.toggle('telegram');
        setTimeout(updateMessagingLabel, 500);
      }
    }
    closeMenu();
  }

  // =========================================================================
  // REPO PILL
  // =========================================================================

  var repoPill = document.getElementById('repoPill');
  if (repoPill) {
    repoPill.addEventListener('click', function () {
      if (window.app.inputBar && window.app.inputBar.haptic) {
        window.app.inputBar.haptic('light');
      }
      if (window.app.panels && window.app.panels.open) {
        window.app.panels.open('sessions');
      }
    });
  }

  /**
   * updateRepoPill()
   * Updates the floating repo pill with current session name and status.
   */
  function updateRepoPill() {
    var nameEl = document.getElementById('repoPillName');
    var dotEl = document.getElementById('repoPillDot');
    if (!nameEl) return;

    var sessionId = window.app.activeSessionId;
    if (!sessionId) {
      nameEl.textContent = 'No session';
      if (dotEl) dotEl.className = 'repo-pill-dot stopped';
      return;
    }

    var entry = window.app.terminal ? window.app.terminal.getEntry(sessionId) : null;
    var name = (entry && entry.name) ? entry.name : sessionId;

    // Shorten UUIDs
    if (name.length > 20 && name.indexOf('-') > 0) {
      name = 'Session ' + name.slice(0, 8);
    }

    nameEl.textContent = name;

    // Update dot color from agent service status
    if (dotEl) {
      var agentStatus = window.app.serviceStatuses && window.app.serviceStatuses.agent;
      var status = (agentStatus && agentStatus.status) ? agentStatus.status : 'running';
      dotEl.className = 'repo-pill-dot ' + status;
    }
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  window.app.fab = {
    open: openMenu,
    close: closeMenu,
    toggle: toggleMenu,
    updateRepoPill: updateRepoPill,
    isCommandBarVisible: function () { return commandBarVisible; },
  };

})();
