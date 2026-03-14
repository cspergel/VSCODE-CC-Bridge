<script>
  import { filteredLogs, logFilter, clearLogs } from '../stores/logs.js';
  import { formatTime } from '../utils/format.js';
  import { onMount, tick } from 'svelte';

  let scrollEl;
  let autoScroll = $state(true);

  $effect(() => {
    if ($filteredLogs && autoScroll && scrollEl) {
      tick().then(() => { scrollEl.scrollTop = scrollEl.scrollHeight; });
    }
  });
</script>

<div class="log-controls">
  <div class="filter-chips">
    {#each ['all', 'agent', 'bridge'] as f}
      <button
        class="chip" class:active={$logFilter === f}
        onclick={() => logFilter.set(f)}
      >{f}</button>
    {/each}
  </div>
  <button class="clear-btn" onclick={clearLogs}>Clear</button>
</div>

<div class="log-scroll" bind:this={scrollEl} onscroll={() => {
  autoScroll = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 20;
}}>
  {#each $filteredLogs as line}
    <div class="log-line" class:stderr={line.stream === 'stderr'}>
      <span class="ts">{formatTime(line.ts)}</span>
      <span class="svc {line.service || ''}">{line.service || ''}</span>
      <span class="msg">{line.text || ''}</span>
    </div>
  {:else}
    <div class="empty">No logs yet</div>
  {/each}
</div>

<style>
  .log-controls {
    display: flex; justify-content: space-between; align-items: center;
    padding: var(--s2) 0; gap: var(--s2);
  }
  .filter-chips { display: flex; gap: var(--s1); }
  .chip {
    padding: var(--s1) var(--s3); border-radius: var(--r-full);
    background: var(--bg); border: 1px solid var(--border);
    color: var(--text-tertiary); font-size: var(--text-xs);
    cursor: pointer; min-height: 32px; font-family: var(--font-sans);
    text-transform: capitalize;
  }
  .chip.active { border-color: var(--accent); color: var(--accent); }
  .clear-btn {
    background: none; border: 1px solid var(--border); color: var(--text-secondary);
    padding: var(--s1) var(--s3); border-radius: var(--r-sm);
    font-size: var(--text-xs); cursor: pointer; font-family: var(--font-sans);
  }

  .log-scroll {
    background: #010409; border-radius: var(--r-sm);
    padding: var(--s2); max-height: 65vh; overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    font-family: var(--font-mono); font-size: var(--text-xs); line-height: 1.6;
  }
  .log-line { white-space: pre-wrap; word-break: break-all; }
  .ts { color: var(--text-tertiary); margin-right: var(--s2); }
  .svc { font-weight: 600; margin-right: var(--s2); }
  .svc.agent { color: var(--accent); }
  .svc.bridge { color: var(--orange); }
  .log-line.stderr .msg { color: var(--red); }
  .empty { text-align: center; padding: var(--s6); color: var(--text-tertiary); }
</style>
