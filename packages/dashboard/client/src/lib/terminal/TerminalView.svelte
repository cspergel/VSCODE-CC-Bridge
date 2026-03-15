<script>
  import TerminalPane from './TerminalPane.svelte';
  import InputBar from './InputBar.svelte';
  import QuickActions from './QuickActions.svelte';
  import TerminalControls from './TerminalControls.svelte';
  import { activeSessionId } from '../stores/sessions.js';
  import { terminalData, terminalInstances } from '../stores/terminal.js';
  import { onMessage } from '../stores/websocket.js';
  import { onMount } from 'svelte';

  let context = $state('idle');
  let choices = $state([]);
  let knownSessions = $state(new Set());

  // Track sessions that have sent terminal data
  $effect(() => {
    const dataMap = $terminalData;
    knownSessions = new Set(dataMap.keys());
  });

  // Parse numbered choices from terminal buffer
  function parseChoicesFromBuffer(sessionId) {
    const entry = terminalInstances.get(sessionId);
    if (!entry) return [];
    const buffer = entry.term.buffer.active;
    const lines = [];
    // Use absolute cursor position (baseY = scrollback offset + cursorY = viewport row)
    const absY = buffer.baseY + buffer.cursorY;
    const start = Math.max(0, absY - 40);
    for (let i = start; i <= absY; i++) {
      const line = buffer.getLine(i);
      if (line) lines.push(line.translateToString().trim());
    }
    const parsed = [];
    const re = /^(\d+)[.):\-]\s+(.+)/;
    for (const line of lines) {
      const m = line.match(re);
      if (m) {
        parsed.push({ num: m[1], label: m[2].slice(0, 50) });
      }
    }
    return parsed;
  }

  // Compare choice arrays to avoid unnecessary re-renders
  let lastChoicesKey = '';
  function choicesChanged(newChoices) {
    const key = newChoices.map(c => c.num).join(',');
    if (key === lastChoicesKey) return false;
    lastChoicesKey = key;
    return true;
  }

  // Context detection — debounced, only runs after output stops for 800ms
  let contextTimer = null;
  let lastContext = '';

  function detectContextFromBuffer(sessionId) {
    const entry = terminalInstances.get(sessionId);
    if (!entry) return;
    const buffer = entry.term.buffer.active;

    // Use absolute cursor position
    const absY = buffer.baseY + buffer.cursorY;

    // Read last 5 lines for context clues
    const recentLines = [];
    for (let i = Math.max(0, absY - 5); i <= absY; i++) {
      const line = buffer.getLine(i);
      if (line) recentLines.push(line.translateToString());
    }
    const recent = recentLines.join('\n');

    let newContext = 'idle'; // Default to idle after debounce (output stopped)
    let newChoices = [];

    if (/\[Y\/n\]|\(y\/N\)|Allow|Approve|Confirm.*\?/i.test(recent)) {
      newContext = 'approval';
    } else if (/[●◯◉].*│|❯.*│/.test(recent)) {
      newContext = 'picker';
    }

    // Always scan for numbered choices when output has settled (debounce ensures this)
    // Skip only if we detected a specific interactive context (approval/picker)
    if (newContext === 'idle') {
      const parsed = parseChoicesFromBuffer(sessionId);
      if (parsed.length >= 2 && parsed.length <= 20) {
        newContext = 'choices';
        newChoices = parsed;
      }
    }

    // Only update state if something actually changed
    if (newContext !== lastContext) {
      lastContext = newContext;
      context = newContext;
    }
    if (newContext === 'choices') {
      if (choicesChanged(newChoices)) {
        choices = newChoices;
      }
    } else if (choices.length > 0) {
      choices = [];
      lastChoicesKey = '';
    }
  }

  onMount(() => {
    return onMessage('terminal_data', (data) => {
      if (data.sessionId !== $activeSessionId) return;
      // Debounce: wait 800ms after last data chunk to detect context
      if (contextTimer) clearTimeout(contextTimer);
      contextTimer = setTimeout(() => {
        detectContextFromBuffer(data.sessionId);
      }, 800);
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

  <QuickActions {context} {choices} />
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
