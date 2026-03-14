<script>
  import { activeSessionId, sessions } from '../stores/sessions.js';
  import { services } from '../stores/services.js';
  import { wsConnected } from '../stores/websocket.js';
  import { shortId, folderName } from '../utils/format.js';

  let { title = '' } = $props();

  let sessionName = $derived.by(() => {
    const id = $activeSessionId;
    if (!id) return 'No session';
    const s = $sessions.find(s => s.id === id);
    if (s?.name) return s.name;
    return shortId(id);
  });

  let agentStatus = $derived($services.agent?.status || 'stopped');
  let connected = $derived($wsConnected);
</script>

<header class="header">
  <div class="header-left">
    <span class="status-dot {agentStatus}" class:disconnected={!connected}></span>
    <span class="header-title">{title || sessionName}</span>
  </div>
  <div class="header-right">
    {#if !connected}
      <span class="conn-label">Reconnecting\u2026</span>
    {/if}
  </div>
</header>

<style>
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--header-h);
    padding: 0 var(--s4);
    padding-top: var(--safe-top);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    z-index: var(--z-header);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--s2);
    min-width: 0;
  }

  .header-title {
    font-size: var(--text-base);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--text-tertiary);
    transition: background var(--duration-fast);
  }

  .status-dot.running { background: var(--green); }
  .status-dot.starting { background: var(--yellow); animation: pulse 2s infinite; }
  .status-dot.error { background: var(--red); }
  .status-dot.disconnected { background: var(--red); animation: pulse 1s infinite; }

  .header-right {
    display: flex;
    align-items: center;
    gap: var(--s2);
  }

  .conn-label {
    font-size: var(--text-xs);
    color: var(--red);
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
</style>
