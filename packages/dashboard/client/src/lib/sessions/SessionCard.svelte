<script>
  import { haptic } from '../utils/haptics.js';
  import { truncate, folderName } from '../utils/format.js';

  let { session, isActive = false, onSelect, onDelete } = $props();
  let swiped = $state(false);

  function select() {
    if (swiped) { swiped = false; return; }
    haptic('light');
    onSelect?.(session);
  }
</script>

<div class="card" class:active={isActive} onclick={select}>
  <div class="dot-wrap">
    <span class="dot {session.status || 'idle'}"></span>
  </div>
  <div class="info">
    <div class="name">{session.name || session.id}</div>
    <div class="path">{truncate(session.projectPath || '', 50)}</div>
  </div>
  <span class="status-badge {session.status || 'idle'}">{session.status || 'idle'}</span>
  <span class="arrow">&#x203A;</span>
</div>

<style>
  .card {
    display: flex;
    align-items: center;
    gap: var(--s3);
    padding: var(--s3) var(--s4);
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    margin-bottom: var(--s2);
    cursor: pointer;
    min-height: 68px;
    transition: border-color var(--duration-fast), background var(--duration-fast);
    -webkit-tap-highlight-color: transparent;
  }

  .card:active { background: var(--accent-subtle); }
  .card.active { border-left: 3px solid var(--accent); }

  .dot-wrap { width: 20px; flex-shrink: 0; display: flex; justify-content: center; }
  .dot {
    width: 12px; height: 12px; border-radius: 50%;
    background: var(--text-tertiary);
  }
  .dot.running { background: var(--green); }
  .dot.active { background: var(--green); }
  .dot.error { background: var(--red); }
  .dot.paused { background: var(--yellow); }

  .info { flex: 1; min-width: 0; }
  .name {
    font-size: var(--text-base); font-weight: 500;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .path {
    font-size: var(--text-xs); color: var(--text-tertiary);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    margin-top: 2px;
  }

  .status-badge {
    font-size: var(--text-xs); padding: 2px 8px;
    border-radius: var(--r-full); text-transform: uppercase;
    font-weight: 600; flex-shrink: 0;
  }
  .status-badge.running, .status-badge.active { background: var(--green-subtle); color: var(--green); }
  .status-badge.idle { background: var(--border); color: var(--text-tertiary); }
  .status-badge.error { background: var(--red-subtle); color: var(--red); }

  .arrow { font-size: 22px; color: var(--text-tertiary); flex-shrink: 0; }
</style>
