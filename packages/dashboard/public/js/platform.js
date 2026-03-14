/* Platform toggle — per-platform pause/unpause with indicator UI */

(function () {
  'use strict';

  // --- State ---
  var state = { whatsapp: false, telegram: false }; // false = active (not paused), true = paused

  // --- DOM refs ---
  var indicatorsEl = document.getElementById('platformIndicators');

  // --- Platform metadata ---
  var PLATFORMS = {
    whatsapp: { icon: '\uD83D\uDCF1', label: 'WhatsApp' },
    telegram: { icon: '\uD83D\uDCAC', label: 'Telegram' }
  };

  // =========================================================================
  // INIT
  // =========================================================================

  function init() {
    fetch('/api/platforms')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && typeof data === 'object') {
          state = {
            whatsapp: !!data.whatsapp,
            telegram: !!data.telegram
          };
        }
        renderIndicators();
      })
      .catch(function () {
        // API not available yet — render with defaults
        renderIndicators();
      });
  }

  // =========================================================================
  // RENDER INDICATORS (status bar)
  // =========================================================================

  function renderIndicators() {
    if (!indicatorsEl) return;

    var html = '';
    var names = ['whatsapp', 'telegram'];
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      var meta = PLATFORMS[name];
      if (!meta) continue;
      var paused = state[name];
      html += '<span class="platform-indicator' + (paused ? ' paused' : '') + '" ';
      html += 'data-platform="' + name + '" ';
      html += 'title="' + meta.label + (paused ? ' (paused)' : '') + '">';
      html += meta.icon;
      html += '</span>';
    }
    indicatorsEl.innerHTML = html;

    // Bind click handlers
    var indicators = indicatorsEl.querySelectorAll('.platform-indicator');
    for (var j = 0; j < indicators.length; j++) {
      (function (el) {
        el.addEventListener('click', function () {
          var platform = el.getAttribute('data-platform');
          if (platform) toggle(platform);
        });
      })(indicators[j]);
    }
  }

  // =========================================================================
  // TOGGLE
  // =========================================================================

  function toggle(platformName) {
    if (!PLATFORMS[platformName]) return;

    fetch('/api/platforms/' + platformName + '/toggle', { method: 'POST' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.platform) {
          state[data.platform] = data.paused;
        }

        // Update indicator in status bar
        updateIndicator(platformName);

        // Update toggle switch in services panel if open
        updateToggleSwitch(platformName);

        // Toast notification
        var meta = PLATFORMS[platformName];
        var label = meta ? meta.label : platformName;
        var action = state[platformName] ? 'paused' : 'resumed';
        if (window.app.showToast) {
          window.app.showToast(label + ' ' + action);
        }

        // Haptic feedback
        if (window.app.inputBar && window.app.inputBar.haptic) {
          window.app.inputBar.haptic('double');
        }
      })
      .catch(function () {
        if (window.app.showToast) {
          window.app.showToast('Failed to toggle ' + platformName);
        }
      });
  }

  function updateIndicator(platformName) {
    if (!indicatorsEl) return;
    var el = indicatorsEl.querySelector('[data-platform="' + platformName + '"]');
    if (!el) return;

    var paused = state[platformName];
    if (paused) {
      el.classList.add('paused');
    } else {
      el.classList.remove('paused');
    }

    var meta = PLATFORMS[platformName];
    if (meta) {
      el.title = meta.label + (paused ? ' (paused)' : '');
    }
  }

  function updateToggleSwitch(platformName) {
    var toggleEl = document.querySelector('#platformToggles .toggle-switch[data-platform="' + platformName + '"]');
    if (!toggleEl) return;

    // active class means the platform is ACTIVE (not paused)
    if (state[platformName]) {
      toggleEl.classList.remove('active');
    } else {
      toggleEl.classList.add('active');
    }
  }

  // =========================================================================
  // TOGGLE ALL — batch toggle both platforms together
  // =========================================================================

  function toggleAll() {
    // Determine target state: if any are active, pause all; if all paused, resume all
    var anyActive = !state.whatsapp || !state.telegram;
    var names = ['whatsapp', 'telegram'];

    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      var shouldToggle = anyActive ? !state[name] : state[name];
      // Only toggle if current state doesn't match target
      if (shouldToggle) {
        toggle(name);
      }
    }
  }

  // =========================================================================
  // GET STATE
  // =========================================================================

  function getState() {
    // Return pause state: false = active, true = paused
    return {
      whatsapp: state.whatsapp,
      telegram: state.telegram
    };
  }

  // =========================================================================
  // RENDER TOGGLE SWITCHES (for Services panel integration)
  // =========================================================================

  function renderToggleSwitches(container) {
    if (!container) return;

    var html = '';
    var names = ['whatsapp', 'telegram'];

    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      var meta = PLATFORMS[name];
      if (!meta) continue;
      var active = !state[name]; // active = NOT paused

      html += '<div class="platform-toggle-row">';
      html += '<span class="platform-toggle-label">' + meta.icon + ' ' + meta.label + '</span>';
      html += '<div class="toggle-switch' + (active ? ' active' : '') + '" data-platform="' + name + '"></div>';
      html += '</div>';
    }

    container.innerHTML = html;

    // Bind click handlers on the toggle switches
    var switches = container.querySelectorAll('.toggle-switch');
    for (var j = 0; j < switches.length; j++) {
      (function (el) {
        el.addEventListener('click', function () {
          var platform = el.getAttribute('data-platform');
          if (platform) toggle(platform);
        });
      })(switches[j]);
    }
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  window.app.platform = {
    init: init,
    toggle: toggle,
    toggleAll: toggleAll,
    getState: getState,
    renderToggleSwitches: renderToggleSwitches
  };

  // Auto-init on load
  init();

})();
