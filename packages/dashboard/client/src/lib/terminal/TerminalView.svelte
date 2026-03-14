<script>
  import TerminalPane from './TerminalPane.svelte';
  import InputBar from './InputBar.svelte';
  import QuickActions from './QuickActions.svelte';
  import TerminalControls from './TerminalControls.svelte';
  import { activeSessionId } from '../stores/sessions.js';
  import { terminalData } from '../stores/terminal.js';
  import { onMessage } from '../stores/websocket.js';
  import { onMount } from 'svelte';

  let context = $state('idle');
  let knownSessions = $state(new Set());

  // Track sessions that have sent terminal data
  $effect(() => {
    const dataMap = $terminalData;
    knownSessions = new Set(dataMap.keys());
  });

  // Context detection from terminal output
  onMount(() => {
    return onMessage('terminal_data', (data) => {
      if (data.sessionId !== $activeSessionId) return;
      const text = data.data;
      if (/\[Y\/n\]|\(y\/N\)|Allow|Approve|Confirm.*\?/i.test(text)) {
        context = 'approval';
      } else if (/[●◯◉].*│|❯.*│/.test(text)) {
        context = 'picker';
      } else if (/[❯$>]\s*$/.test(text)) {
        context = 'idle';
      } else {
        context = 'running';
      }
    });
  });
</script>

<div class="terminal-view">
  <div class="terminal-area">
    {#each [...knownSessions] as sid (sid)}
      <TerminalPane sessionId={sid} active={sid === $activeSessionId} />
    {/each}

    {#if knownSessions.size === 0}
      <div class="empty-state">
        <div class="empty-icon">&#x276F;_</div>
        <p>No active terminal</p>
        <p class="empty-hint">Switch to Sessions tab to connect to a repo</p>
      </div>
    {/if}

    <TerminalControls />
  </div>

  <QuickActions {context} />
  <InputBar />
</div>

<style>
  .terminal-view {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .terminal-area {
    flex: 1;
    min-height: 0;
    position: relative;
    background: #0d1117;
  }

  .empty-state {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--s2);
    color: var(--text-tertiary);
  }

  .empty-icon {
    font-size: 48px;
    font-family: var(--font-mono);
    opacity: 0.3;
  }

  .empty-hint {
    font-size: var(--text-sm);
  }
</style>
