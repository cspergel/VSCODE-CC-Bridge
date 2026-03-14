<script>
  import { serviceAction } from '../stores/services.js';
  import { formatDuration } from '../utils/format.js';
  import { haptic } from '../utils/haptics.js';
  import { showToast } from '../stores/toast.js';

  let { name, info } = $props();
  let status = $derived(info?.status || 'stopped');

  async function act(action) {
    haptic('light');
    try {
      await serviceAction(name, action);
      showToast(`${name}: ${action}`);
    } catch {
      showToast(`Failed to ${action} ${name}`);
    }
  }
</script>

<div class="svc-card">
  <div class="svc-header">
    <span class="svc-name">{name.charAt(0).toUpperCase() + name.slice(1)}</span>
    <span class="badge {status}">{status}</span>
  </div>
  <div class="svc-info">
    PID: {info?.pid || '--'} &middot;
    Uptime: {info?.startedAt ? formatDuration(Math.floor((Date.now() - new Date(info.startedAt).getTime()) / 1000)) : '--'}
  </div>
  <div class="svc-actions">
    {#if status === 'running'}
      <button class="svc-btn" onclick={() => act('stop')}>Stop</button>
      <button class="svc-btn" onclick={() => act('restart')}>Restart</button>
    {:else}
      <button class="svc-btn" onclick={() => act('start')}>Start</button>
    {/if}
  </div>
</div>

<style>
  .svc-card {
    background: var(--surface-raised); border: 1px solid var(--border);
    border-radius: var(--r-md); padding: var(--s4); margin-bottom: var(--s2);
  }
  .svc-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--s2); }
  .svc-name { font-weight: 600; font-size: var(--text-base); }
  .badge {
    font-size: var(--text-xs); padding: 2px 8px; border-radius: var(--r-full);
    text-transform: uppercase; font-weight: 600;
  }
  .badge.running { background: var(--green-subtle); color: var(--green); }
  .badge.starting { background: var(--yellow-subtle); color: var(--yellow); }
  .badge.error { background: var(--red-subtle); color: var(--red); }
  .badge.stopped { background: var(--border); color: var(--text-tertiary); }
  .svc-info { font-size: var(--text-xs); color: var(--text-tertiary); margin-bottom: var(--s3); }
  .svc-actions { display: flex; gap: var(--s2); }
  .svc-btn {
    padding: var(--s2) var(--s4); background: var(--border); border: 1px solid var(--border);
    border-radius: var(--r-sm); color: var(--text); font-size: var(--text-sm);
    cursor: pointer; min-height: var(--touch-min); font-family: var(--font-sans);
  }
  .svc-btn:active { background: var(--surface); }
</style>
