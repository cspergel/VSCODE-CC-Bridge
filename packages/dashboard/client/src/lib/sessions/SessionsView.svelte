<script>
  import SessionCard from './SessionCard.svelte';
  import FolderBrowser from './FolderBrowser.svelte';
  import { sessions, activeSessionId, activateSession, createSession, fetchSessions, deleteSession } from '../stores/sessions.js';
  import { recentPaths, addRecentPath } from '../stores/preferences.js';
  import { showToast } from '../stores/toast.js';
  import { haptic } from '../utils/haptics.js';
  import { folderName, truncate } from '../utils/format.js';
  import { onMount } from 'svelte';

  let view = $state('list'); // 'list' | 'create'
  let selectedPath = $state('');
  let sessionName = $state('');
  let creating = $state(false);

  onMount(() => { fetchSessions(); });

  async function handleSelect(session) {
    try {
      await activateSession(session.id);
      showToast(`Switched to ${session.name || 'session'}`);
    } catch {
      showToast('Failed to switch session');
    }
  }

  async function handleCreate() {
    if (!selectedPath) { showToast('Select a folder first'); return; }
    creating = true;
    try {
      const s = await createSession(sessionName || folderName(selectedPath), selectedPath);
      addRecentPath(selectedPath, sessionName || s.name);
      showToast('Session created');
      haptic('success');
      view = 'list';
      sessionName = '';
      selectedPath = '';
    } catch (e) {
      showToast(e.message || 'Failed to create session');
      haptic('error');
    }
    creating = false;
  }

  function selectRecent(r) {
    haptic('light');
    selectedPath = r.path;
    sessionName = r.name || folderName(r.path);
    view = 'create';
  }
</script>

<div class="sessions-view">
  {#if view === 'list'}
    <div class="section">
      <div class="section-header">
        <h3>Active Sessions</h3>
        <button class="btn-primary" onclick={() => { view = 'create'; }}>+ New</button>
      </div>

      {#if $sessions.length === 0}
        <div class="empty">
          <p>No sessions yet</p>
          <p class="hint">Tap "+ New" to connect to a repo</p>
        </div>
      {:else}
        {#each $sessions as s (s.id)}
          <SessionCard
            session={s}
            isActive={s.id === $activeSessionId}
            onSelect={handleSelect}
          />
        {/each}
      {/if}
    </div>

    {#if $recentPaths.length > 0}
      <div class="section">
        <h3 class="section-title">Recent Projects</h3>
        {#each $recentPaths.slice(0, 6) as r}
          <button class="recent-item" onclick={() => selectRecent(r)}>
            <span class="ri-icon">{'\u{1F4C1}'}</span>
            <div class="ri-info">
              <div class="ri-name">{r.name || folderName(r.path)}</div>
              <div class="ri-path">{truncate(r.path, 50)}</div>
            </div>
            <span class="ri-arrow">&#x203A;</span>
          </button>
        {/each}
      </div>
    {/if}

  {:else}
    <div class="section">
      <div class="section-header">
        <h3>New Session</h3>
        <button class="btn-ghost" onclick={() => { view = 'list'; }}>Cancel</button>
      </div>

      <FolderBrowser onSelect={(path) => { selectedPath = path; }} />

      <input
        class="field"
        type="text"
        bind:value={sessionName}
        placeholder="Session name (optional)"
      />

      <div class="chosen-path">
        {selectedPath || 'No folder selected'}
      </div>

      <button
        class="btn-primary full"
        onclick={handleCreate}
        disabled={!selectedPath || creating}
      >
        {creating ? 'Creating...' : 'Create Session'}
      </button>
    </div>
  {/if}
</div>

<style>
  .sessions-view { padding: var(--s4); }

  .section { margin-bottom: var(--s6); }
  .section-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: var(--s3);
  }
  .section-title {
    font-size: var(--text-sm); color: var(--text-tertiary);
    text-transform: uppercase; letter-spacing: 0.05em;
    margin-bottom: var(--s2);
  }
  h3 { font-size: var(--text-lg); font-weight: 600; }

  .btn-primary {
    background: var(--accent); color: #fff; border: none;
    padding: var(--s2) var(--s4); border-radius: var(--r-md);
    font-size: var(--text-sm); font-weight: 600; cursor: pointer;
    min-height: var(--touch-min); font-family: var(--font-sans);
  }
  .btn-primary:active { opacity: 0.8; }
  .btn-primary:disabled { opacity: 0.4; }
  .btn-primary.full { width: 100%; margin-top: var(--s3); }

  .btn-ghost {
    background: none; border: 1px solid var(--border); color: var(--text-secondary);
    padding: var(--s2) var(--s4); border-radius: var(--r-md);
    font-size: var(--text-sm); cursor: pointer; min-height: var(--touch-min);
    font-family: var(--font-sans);
  }

  .field {
    width: 100%; background: var(--bg); color: var(--text);
    border: 1px solid var(--border); border-radius: var(--r-md);
    padding: var(--s3); font-size: var(--text-base); outline: none;
    margin-top: var(--s3); min-height: var(--touch-min);
    font-family: var(--font-sans);
  }
  .field:focus { border-color: var(--accent); }

  .chosen-path {
    padding: var(--s2) var(--s3); font-size: var(--text-sm);
    color: var(--text-tertiary); margin-top: var(--s2);
    background: var(--bg); border-radius: var(--r-sm);
    word-break: break-all;
  }

  .empty {
    text-align: center; padding: var(--s8) var(--s4);
    color: var(--text-tertiary);
  }
  .hint { font-size: var(--text-sm); margin-top: var(--s1); }

  .recent-item {
    display: flex; align-items: center; gap: var(--s3);
    width: 100%; padding: var(--s3) var(--s4);
    background: var(--surface-raised); border: 1px solid var(--border);
    border-radius: var(--r-md); cursor: pointer;
    margin-bottom: var(--s2); min-height: 56px;
    text-align: left; font-family: var(--font-sans);
    color: var(--text);
    -webkit-tap-highlight-color: transparent;
  }
  .recent-item:active { background: var(--accent-subtle); }
  .ri-icon { font-size: 20px; flex-shrink: 0; }
  .ri-info { flex: 1; min-width: 0; }
  .ri-name { font-weight: 500; font-size: var(--text-base); }
  .ri-path {
    font-size: var(--text-xs); color: var(--text-tertiary);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px;
  }
  .ri-arrow { font-size: 20px; color: var(--text-tertiary); }
</style>
