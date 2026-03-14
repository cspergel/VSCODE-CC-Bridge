<script>
  import LogStream from './LogStream.svelte';
  import ServiceCard from './ServiceCard.svelte';
  import { services } from '../stores/services.js';
  import { haptic } from '../utils/haptics.js';
  import { onMount } from 'svelte';
  import { formatTime } from '../utils/format.js';

  let segment = $state('logs'); // 'logs' | 'services' | 'audit'
  let auditEvents = $state([]);

  function switchSegment(s) {
    haptic('light');
    segment = s;
    if (s === 'audit' && auditEvents.length === 0) loadAudit();
  }

  async function loadAudit() {
    try {
      const res = await fetch('/api/audit?limit=100');
      auditEvents = await res.json();
    } catch { auditEvents = []; }
  }
</script>

<div class="activity-view">
  <div class="segments">
    {#each ['logs', 'services', 'audit'] as s}
      <button class="seg" class:active={segment === s} onclick={() => switchSegment(s)}>
        {s.charAt(0).toUpperCase() + s.slice(1)}
      </button>
    {/each}
  </div>

  <div class="segment-content">
    {#if segment === 'logs'}
      <LogStream />
    {:else if segment === 'services'}
      {#each Object.entries($services) as [name, info]}
        <ServiceCard {name} {info} />
      {/each}
    {:else}
      {#each auditEvents as ev}
        <div class="audit-item" class:blocked={ev.blocked}>
          <span class="audit-time">{formatTime(ev.timestamp)}</span>
          <span class="audit-event">{ev.event}</span>
          <span class="audit-detail">{ev.detail}</span>
        </div>
      {:else}
        <div class="empty">No audit events</div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .activity-view { padding: var(--s4); }

  .segments {
    display: flex; gap: var(--s1); margin-bottom: var(--s4);
    background: var(--bg); border-radius: var(--r-md); padding: var(--s1);
  }
  .seg {
    flex: 1; padding: var(--s2); border-radius: var(--r-sm);
    background: none; border: none; color: var(--text-tertiary);
    font-size: var(--text-sm); font-weight: 500; cursor: pointer;
    min-height: 36px; font-family: var(--font-sans);
    transition: all var(--duration-fast);
  }
  .seg.active { background: var(--surface-raised); color: var(--text); }

  .audit-item {
    display: flex; gap: var(--s2); padding: var(--s2) 0;
    border-bottom: 1px solid var(--border-subtle); font-size: var(--text-sm);
  }
  .audit-item.blocked { background: var(--red-subtle); }
  .audit-time { color: var(--text-tertiary); font-size: var(--text-xs); flex-shrink: 0; width: 70px; }
  .audit-event { font-weight: 500; flex-shrink: 0; width: 100px; }
  .audit-detail { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { text-align: center; padding: var(--s8); color: var(--text-tertiary); }
</style>
