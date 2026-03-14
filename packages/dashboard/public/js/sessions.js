/* Sessions module — CRUD, folder browser, messages, audit (data layer only) */

(function () {
  'use strict';

  var RECENT_PATHS_KEY = 'claudeBridge_recentPaths';
  var MAX_RECENT_PATHS = 8;

  // =========================================================================
  // SESSION CRUD
  // =========================================================================

  /**
   * Load all sessions.
   * GET /api/sessions
   * @returns {Promise<Array|null>} Array of session objects, or null on error.
   */
  async function loadSessions() {
    try {
      var res = await fetch('/api/sessions');
      if (!res.ok) {
        console.error('loadSessions: HTTP ' + res.status);
        return null;
      }
      return await res.json();
    } catch (err) {
      console.error('loadSessions error:', err);
      return null;
    }
  }

  /**
   * Create a new session.
   * POST /api/sessions  { name, projectPath }
   * @param {string} name - Session display name.
   * @param {string} projectPath - Absolute path to project folder.
   * @returns {Promise<Object|null>} Created session object, or null on error.
   */
  async function createSession(name, projectPath) {
    try {
      var res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, projectPath: projectPath })
      });
      var data = await res.json();
      if (!res.ok) {
        console.error('createSession: HTTP ' + res.status, data.error || '');
        return null;
      }
      return data;
    } catch (err) {
      console.error('createSession error:', err);
      return null;
    }
  }

  /**
   * Delete a session by ID.
   * DELETE /api/sessions/:id
   * @param {string} id - Session ID.
   * @returns {Promise<Object|null>} Result object, or null on error.
   */
  async function deleteSession(id) {
    try {
      var res = await fetch('/api/sessions/' + encodeURIComponent(id), {
        method: 'DELETE'
      });
      var data = await res.json();
      if (!res.ok) {
        console.error('deleteSession: HTTP ' + res.status, data.error || '');
        return null;
      }
      return data;
    } catch (err) {
      console.error('deleteSession error:', err);
      return null;
    }
  }

  /**
   * Activate (open) a session by ID.
   * POST /api/sessions/:id/activate
   * @param {string} id - Session ID.
   * @returns {Promise<Object|null>} Result object, or null on error.
   */
  async function activateSession(id) {
    try {
      var res = await fetch('/api/sessions/' + encodeURIComponent(id) + '/activate', {
        method: 'POST'
      });
      var data = await res.json();
      if (!res.ok) {
        console.error('activateSession: HTTP ' + res.status, data.error || '');
        return null;
      }
      return data;
    } catch (err) {
      console.error('activateSession error:', err);
      return null;
    }
  }

  /**
   * Get live (currently active) sessions.
   * GET /api/sessions/live
   * @returns {Promise<Array|null>} Array of live session objects, or null on error.
   */
  async function getLiveSessions() {
    try {
      var res = await fetch('/api/sessions/live');
      if (!res.ok) {
        console.error('getLiveSessions: HTTP ' + res.status);
        return null;
      }
      return await res.json();
    } catch (err) {
      console.error('getLiveSessions error:', err);
      return null;
    }
  }

  // =========================================================================
  // MESSAGES & AUDIT
  // =========================================================================

  /**
   * Load messages for a session.
   * GET /api/sessions/:id/messages?limit=N
   * @param {string} sessionId - Session ID.
   * @param {number} [limit=50] - Max messages to return.
   * @returns {Promise<Array|null>} Array of message objects, or null on error.
   */
  async function loadMessages(sessionId, limit) {
    if (limit === undefined) limit = 50;
    try {
      var res = await fetch(
        '/api/sessions/' + encodeURIComponent(sessionId) + '/messages?limit=' + limit
      );
      if (!res.ok) {
        console.error('loadMessages: HTTP ' + res.status);
        return null;
      }
      return await res.json();
    } catch (err) {
      console.error('loadMessages error:', err);
      return null;
    }
  }

  /**
   * Load audit log entries.
   * GET /api/audit?limit=N
   * @param {number} [limit=100] - Max entries to return.
   * @returns {Promise<Array|null>} Array of audit entries, or null on error.
   */
  async function loadAudit(limit) {
    if (limit === undefined) limit = 100;
    try {
      var res = await fetch('/api/audit?limit=' + limit);
      if (!res.ok) {
        console.error('loadAudit: HTTP ' + res.status);
        return null;
      }
      return await res.json();
    } catch (err) {
      console.error('loadAudit error:', err);
      return null;
    }
  }

  // =========================================================================
  // FOLDER BROWSER
  // =========================================================================

  /**
   * Browse a directory on the server.
   * GET /api/browse?path=...
   * @param {string} [path] - Directory path to browse. Omit for server default.
   * @returns {Promise<Object|null>} { current, currentIsGitRepo, segments, entries } or null on error.
   */
  async function browseTo(path) {
    try {
      var url = path ? '/api/browse?path=' + encodeURIComponent(path) : '/api/browse';
      var res = await fetch(url);
      if (!res.ok) {
        console.error('browseTo: HTTP ' + res.status);
        return null;
      }
      return await res.json();
    } catch (err) {
      console.error('browseTo error:', err);
      return null;
    }
  }

  // =========================================================================
  // RECENT PATHS (localStorage)
  // =========================================================================

  /**
   * Get recent project paths from localStorage.
   * @returns {Array} Array of path strings (or objects with .path/.name).
   */
  function getRecentPaths() {
    try {
      var stored = localStorage.getItem(RECENT_PATHS_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) { /* ignore parse errors */ }
    return [];
  }

  /**
   * Add a path to the front of the recent paths list.
   * Deduplicates and caps at MAX_RECENT_PATHS.
   * @param {string} path - Absolute project path to add.
   */
  function addRecentPath(path) {
    var paths = getRecentPaths();

    // Deduplicate — handle both string entries and {path, name} objects
    paths = paths.filter(function (item) {
      if (typeof item === 'string') return item !== path;
      return item.path !== path;
    });

    // Add to front
    paths.unshift(path);

    // Cap at max
    if (paths.length > MAX_RECENT_PATHS) {
      paths = paths.slice(0, MAX_RECENT_PATHS);
    }

    try {
      localStorage.setItem(RECENT_PATHS_KEY, JSON.stringify(paths));
    } catch (e) { /* ignore quota errors */ }
  }

  /**
   * Remove a path from the recent paths list.
   * @param {string} path - Path to remove.
   */
  function removeRecentPath(path) {
    var paths = getRecentPaths();
    paths = paths.filter(function (item) {
      if (typeof item === 'string') return item !== path;
      return item.path !== path;
    });
    try {
      localStorage.setItem(RECENT_PATHS_KEY, JSON.stringify(paths));
    } catch (e) { /* ignore quota errors */ }
  }

  // =========================================================================
  // RELINK & RESTART
  // =========================================================================

  /**
   * Trigger WhatsApp re-link (clears session, generates new QR code).
   * POST /api/relink
   * @returns {Promise<Object|null>} Result object, or null on error.
   */
  async function relinkWhatsApp() {
    try {
      var res = await fetch('/api/relink', { method: 'POST' });
      var data = await res.json();
      if (!res.ok) {
        console.error('relinkWhatsApp: HTTP ' + res.status, data.error || '');
        return null;
      }
      return data;
    } catch (err) {
      console.error('relinkWhatsApp error:', err);
      return null;
    }
  }

  /**
   * Restart the dashboard server, then poll /api/health until it comes back
   * and reload the page.
   * POST /api/restart
   * @returns {Promise<void>}
   */
  async function restartDashboard() {
    try {
      await fetch('/api/restart', { method: 'POST' });
    } catch (e) {
      // Expected — server is restarting, connection drops
    }

    // Poll until the server comes back (max 30 seconds)
    return new Promise(function (resolve) {
      var maxWait = 30000;
      var interval = 1000;
      var elapsed = 0;

      var poll = setInterval(async function () {
        elapsed += interval;
        if (elapsed > maxWait) {
          clearInterval(poll);
          console.error('restartDashboard: server did not come back within 30s');
          resolve();
          return;
        }
        try {
          var res = await fetch('/api/health');
          if (res.ok) {
            clearInterval(poll);
            location.reload();
            resolve();
          }
        } catch (e) {
          // Still restarting — keep polling
        }
      }, interval);
    });
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  window.app.sessions = {
    // Session CRUD
    loadSessions: loadSessions,
    createSession: createSession,
    deleteSession: deleteSession,
    activateSession: activateSession,
    getLiveSessions: getLiveSessions,

    // Messages & Audit
    loadMessages: loadMessages,
    loadAudit: loadAudit,

    // Folder Browser
    browseTo: browseTo,

    // Recent Paths
    getRecentPaths: getRecentPaths,
    addRecentPath: addRecentPath,
    removeRecentPath: removeRecentPath,

    // Relink & Restart
    relinkWhatsApp: relinkWhatsApp,
    restartDashboard: restartDashboard
  };

})();
