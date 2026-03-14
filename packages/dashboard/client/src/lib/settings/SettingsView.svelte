<script>
  import { fontSize, projectsDir } from '../stores/preferences.js';
  import { haptic } from '../utils/haptics.js';
  import { showToast } from '../stores/toast.js';
  import { onMount } from 'svelte';

  let whatsappPaused = $state(false);
  let telegramPaused = $state(false);

  // --- Folder browser state ---
  let browserPath = $state('');
  let browserEntries = $state([]);
  let browserSegments = $state([]);
  let browserFilter = $state('');
  let browserLoading = $state(false);

  let filteredEntries = $derived(
    browserFilter
      ? browserEntries.filter(e => e.name.toLowerCase().includes(browserFilter.toLowerCase()))
      : browserEntries
  );

  onMount(async () => {
    try {
      const res = await fetch('/api/platforms');
      const data = await res.json();
      whatsappPaused = data.whatsapp || false;
      telegramPaused = data.telegram || false;
    } catch {}

    // Start folder browser at saved dir, or home
    const startPath = $projectsDir || '~';
    browseTo(startPath);
  });

  async function browseTo(path) {
    browserLoading = true;
    browserFilter = '';
    try {
      const res = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      browserPath = data.current || path;
      browserEntries = data.entries || [];
      browserSegments = data.segments || [];
    } catch {
      browserEntries = [];
    }
    browserLoading = false;
  }

  function selectAndSave() {
    if (!browserPath) return;
    projectsDir.set(browserPath);
    haptic('success');
    showToast('Default folder: ' + browserPath.split(/[/\\]/).pop());
  }

  function navToEntry(entry) {
    haptic('light');
    browseTo(entry.path);
  }

  function navUp() {
    if (browserSegments.length > 1) {
      haptic('light');
      browseTo(browserSegments[browserSegments.length - 2].path);
    }
  }

  function navToCrumb(seg) {
    haptic('light');
    browseTo(seg.path);
  }

  async function togglePlatform(name) {
    haptic('light');
    try {
      const res = await fetch(`/api/platforms/${name}/toggle`, { method: 'POST' });
      const data = await res.json();
      if (name === 'whatsapp') whatsappPaused = data.paused;
      if (name === 'telegram') telegramPaused = data.paused;
      showToast(`${name}: ${data.paused ? 'paused' : 'active'}`);
    } catch {
      showToast(`Failed to toggle ${name}`);
    }
  }

  function changeFontSize(delta) {
    haptic('light');
    fontSize.update(s => Math.max(8, Math.min(28, s + delta)));
    showToast(`Font size: ${$fontSize}px`);
  }
</script>

<div class="settings-view">
  <div class="section">
    <h3 class="section-title">Projects Folder</h3>

    <!-- Current selection banner -->
    <div class="current-dir" class:saved={browserPath === $projectsDir}>
      <div class="current-dir-path">
        {browserPath || 'No folder selected'}
      </div>
      <button
        class="use-btn"
        class:already-set={browserPath === $projectsDir}
        onclick={selectAndSave}
        disabled={!browserPath || browserPath === $projectsDir}
      >
        {browserPath === $projectsDir ? '\u2713 Saved' : 'Use this folder'}
      </button>
    </div>

    <!-- Inline folder browser -->
    <div class="browser">
      <div class="breadcrumbs">
        {#each browserSegments as seg, i}
          {#if i > 0}<span class="sep">/</span>{/if}
          <button class="crumb" onclick={() => navToCrumb(seg)}>{seg.name}</button>
        {/each}
      </div>

      <input
        class="filter-input"
        type="text"
        bind:value={browserFilter}
        placeholder="Filter folders..."
        autocomplete="off"
      />

      <div class="folder-list">
        {#if browserSegments.length > 1}
          <button class="folder-item up-btn" onclick={navUp}>
            <span class="fi-icon">&#x2B06;</span>
            <span class="fi-name">Go up</span>
            <span class="fi-chevron">&#x203A;</span>
          </button>
        {/if}

        {#each filteredEntries as entry}
          <button class="folder-item" class:git={entry.isGitRepo} onclick={() => navToEntry(entry)}>
            <span class="fi-icon">{entry.isGitRepo ? '\u{1F4E6}' : '\u{1F4C1}'}</span>
            <span class="fi-name">{entry.name}</span>
            <span class="fi-chevron">&#x203A;</span>
          </button>
        {/each}

        {#if filteredEntries.length === 0 && !browserLoading}
          <div class="empty">No subfolders here</div>
        {/if}

        {#if browserLoading}
          <div class="empty">Loading...</div>
        {/if}
      </div>
    </div>

    {#if $projectsDir}
      <div class="saved-hint">Currently saved: {$projectsDir}</div>
    {/if}
  </div>

  <div class="section">
    <h3 class="section-title">Terminal</h3>
    <div class="setting-row">
      <span>Font Size</span>
      <div class="font-controls">
        <button class="fc-btn" onclick={() => changeFontSize(-2)}>A-</button>
        <span class="fc-value">{$fontSize}px</span>
        <button class="fc-btn" onclick={() => changeFontSize(2)}>A+</button>
      </div>
    </div>
  </div>

  <div class="section">
    <h3 class="section-title">Messaging</h3>
    <div class="setting-row">
      <span>WhatsApp</span>
      <button class="toggle" class:active={!whatsappPaused} onclick={() => togglePlatform('whatsapp')} aria-label="Toggle WhatsApp">
        <span class="toggle-thumb"></span>
      </button>
    </div>
    <div class="setting-row">
      <span>Telegram</span>
      <button class="toggle" class:active={!telegramPaused} onclick={() => togglePlatform('telegram')} aria-label="Toggle Telegram">
        <span class="toggle-thumb"></span>
      </button>
    </div>
  </div>

  <div class="section">
    <h3 class="section-title">About</h3>
    <div class="about">Claude Code Mobile v0.1.0</div>
  </div>
</div>

<style>
  .settings-view { padding: var(--s4); }
  .section { margin-bottom: var(--s6); }
  .section-title {
    font-size: var(--text-sm); color: var(--text-tertiary);
    text-transform: uppercase; letter-spacing: 0.05em;
    margin-bottom: var(--s3);
  }

  /* --- Current dir banner --- */
  .current-dir {
    display: flex; align-items: center; justify-content: space-between;
    gap: var(--s2); padding: var(--s3) var(--s4);
    background: var(--surface-raised); border: 1px solid var(--border);
    border-radius: var(--r-md); margin-bottom: var(--s2);
  }
  .current-dir.saved { border-color: var(--green); }
  .current-dir-path {
    flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; font-size: var(--text-sm); font-family: var(--font-mono);
    color: var(--text-secondary);
  }
  .use-btn {
    background: var(--accent); color: #fff; border: none;
    border-radius: var(--r-sm); padding: var(--s2) var(--s4);
    font-size: var(--text-sm); font-weight: 600; cursor: pointer;
    white-space: nowrap; font-family: var(--font-sans);
    flex-shrink: 0;
  }
  .use-btn:active { opacity: 0.8; }
  .use-btn:disabled { opacity: 0.5; cursor: default; }
  .use-btn.already-set { background: var(--green); }

  .saved-hint {
    font-size: var(--text-xs); color: var(--text-tertiary);
    margin-top: var(--s2); padding: 0 var(--s2);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  /* --- Inline folder browser --- */
  .browser {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    overflow: hidden;
  }

  .breadcrumbs {
    display: flex; align-items: center; gap: 2px;
    padding: var(--s2) var(--s3);
    border-bottom: 1px solid var(--border);
    overflow-x: auto; scrollbar-width: none;
    font-size: var(--text-sm);
  }
  .breadcrumbs::-webkit-scrollbar { display: none; }
  .crumb {
    background: none; border: none; color: var(--accent);
    padding: var(--s1) var(--s2); border-radius: var(--r-sm);
    cursor: pointer; white-space: nowrap; min-height: 32px;
    display: flex; align-items: center; font-size: var(--text-sm);
    font-family: var(--font-sans);
  }
  .crumb:active { background: var(--accent-subtle); }
  .sep { color: var(--text-tertiary); }

  .filter-input {
    width: 100%; background: var(--surface);
    color: var(--text); border: none;
    border-bottom: 1px solid var(--border);
    padding: var(--s2) var(--s3);
    font-size: var(--text-sm); outline: none;
    font-family: var(--font-sans);
    min-height: 40px; box-sizing: border-box;
  }
  .filter-input:focus { border-bottom-color: var(--accent); }
  .filter-input::placeholder { color: var(--text-tertiary); }

  .folder-list {
    max-height: 50vh; overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .folder-item {
    display: flex; align-items: center; gap: var(--s2);
    width: 100%; padding: var(--s3) var(--s4);
    background: none; border: none;
    border-bottom: 1px solid var(--border-subtle);
    cursor: pointer; min-height: 52px;
    font-size: var(--text-base); color: var(--text);
    font-family: var(--font-sans);
    text-align: left;
  }
  .folder-item:active { background: var(--accent-subtle); }
  .folder-item.up-btn .fi-name { color: var(--accent); font-weight: 500; }
  .folder-item.up-btn .fi-icon { color: var(--accent); }
  .folder-item.git .fi-name { color: var(--accent); font-weight: 500; }
  .fi-icon { font-size: 18px; flex-shrink: 0; width: 24px; text-align: center; }
  .fi-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fi-chevron { font-size: 20px; color: var(--text-tertiary); flex-shrink: 0; }

  .empty { padding: var(--s6); text-align: center; color: var(--text-tertiary); font-size: var(--text-sm); }

  /* --- Other settings --- */
  .setting-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: var(--s3) var(--s4);
    background: var(--surface-raised); border: 1px solid var(--border);
    border-radius: var(--r-md); margin-bottom: var(--s2);
    min-height: 52px; font-size: var(--text-base);
  }

  .font-controls { display: flex; align-items: center; gap: var(--s2); }
  .fc-btn {
    width: 36px; height: 36px; border-radius: var(--r-sm);
    background: var(--bg); border: 1px solid var(--border);
    color: var(--text); font-size: var(--text-sm); font-weight: 600;
    cursor: pointer; font-family: var(--font-sans);
  }
  .fc-btn:active { background: var(--accent-subtle); }
  .fc-value { font-size: var(--text-sm); color: var(--text-secondary); min-width: 40px; text-align: center; }

  .toggle {
    position: relative; width: 48px; height: 28px;
    background: var(--border); border: none; border-radius: 14px;
    cursor: pointer; transition: background var(--duration-fast);
  }
  .toggle.active { background: var(--green); }
  .toggle-thumb {
    position: absolute; top: 3px; left: 3px;
    width: 22px; height: 22px; background: #fff;
    border-radius: 50%; transition: transform var(--duration-fast);
  }
  .toggle.active .toggle-thumb { transform: translateX(20px); }

  .about { font-size: var(--text-sm); color: var(--text-tertiary); padding: var(--s3) var(--s4); }
</style>
