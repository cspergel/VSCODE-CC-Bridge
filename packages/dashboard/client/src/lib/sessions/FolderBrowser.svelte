<script>
  import { haptic } from '../utils/haptics.js';

  let { onSelect } = $props();
  let currentPath = $state('');
  let entries = $state([]);
  let segments = $state([]);
  let filter = $state('');
  let loading = $state(false);

  let filtered = $derived(
    filter
      ? entries.filter(e => e.name.toLowerCase().includes(filter.toLowerCase()))
      : entries
  );

  export async function browseTo(path) {
    loading = true;
    filter = '';
    try {
      const res = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      currentPath = data.current || path;
      entries = data.entries || [];
      segments = data.segments || [];
    } catch {
      entries = [];
    }
    loading = false;
  }

  function selectFolder(entry) {
    haptic('light');
    browseTo(entry.path);
    onSelect?.(entry.path);
  }

  function goUp() {
    if (segments.length > 1) {
      const parent = segments[segments.length - 2];
      browseTo(parent.path);
      onSelect?.(parent.path);
    }
  }

  function crumbNav(seg) {
    haptic('light');
    browseTo(seg.path);
    onSelect?.(seg.path);
  }

  // Start browsing
  import { onMount } from 'svelte';
  onMount(() => {
    const startPath = navigator.platform?.includes('Win') ? 'C:\\Users' : '/home';
    browseTo(startPath);
  });
</script>

<div class="browser">
  <div class="breadcrumbs">
    {#each segments as seg, i}
      {#if i > 0}<span class="sep">/</span>{/if}
      <button class="crumb" onclick={() => crumbNav(seg)}>{seg.name}</button>
    {/each}
  </div>

  <input
    class="filter"
    type="text"
    bind:value={filter}
    placeholder="Filter folders..."
    autocomplete="off"
  />

  <div class="folder-list">
    {#if segments.length > 1}
      <button class="folder-item" onclick={goUp}>
        <span class="fi-icon">{'\u{1F4C1}'}</span>
        <span class="fi-name">..</span>
        <span class="fi-chevron">&#x203A;</span>
      </button>
    {/if}

    {#each filtered as entry}
      <button class="folder-item" class:git={entry.isGitRepo} onclick={() => selectFolder(entry)}>
        <span class="fi-icon">{entry.isGitRepo ? '\u{1F4E6}' : '\u{1F4C1}'}</span>
        <span class="fi-name">{entry.name}</span>
        <span class="fi-chevron">&#x203A;</span>
      </button>
    {/each}

    {#if filtered.length === 0 && !loading}
      <div class="empty">No folders found</div>
    {/if}
  </div>
</div>

<style>
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

  .filter {
    width: 100%; background: var(--surface);
    color: var(--text); border: none;
    border-bottom: 1px solid var(--border);
    padding: var(--s2) var(--s3);
    font-size: var(--text-sm); outline: none;
    font-family: var(--font-sans);
    min-height: 40px;
  }
  .filter:focus { border-bottom-color: var(--accent); }
  .filter::placeholder { color: var(--text-tertiary); }

  .folder-list {
    max-height: 40vh; overflow-y: auto;
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
  .folder-item.git .fi-name { color: var(--accent); font-weight: 500; }
  .fi-icon { font-size: 18px; flex-shrink: 0; width: 24px; text-align: center; }
  .fi-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fi-chevron { font-size: 20px; color: var(--text-tertiary); flex-shrink: 0; }

  .empty { padding: var(--s6); text-align: center; color: var(--text-tertiary); font-size: var(--text-sm); }
</style>
