<script>
  import { sendTerminalInput } from '../stores/websocket.js';
  import { activeSessionId } from '../stores/sessions.js';
  import { haptic } from '../utils/haptics.js';

  let { context = 'idle', choices = [] } = $props();

  // Select-then-confirm state for choices
  let selectedChoice = $state(null);

  // Reset selection when choices change
  $effect(() => {
    if (context !== 'choices') {
      selectedChoice = null;
    }
  });

  function act(data) {
    const sid = $activeSessionId;
    if (!sid) return;
    haptic('light');
    sendTerminalInput(sid, data);
  }

  function selectChoice(choice) {
    haptic('light');
    if (selectedChoice?.num === choice.num) {
      // Tap same choice again = deselect
      selectedChoice = null;
    } else {
      selectedChoice = choice;
    }
  }

  function confirmChoice() {
    if (!selectedChoice) return;
    haptic('medium');
    act(selectedChoice.num + '\r');
    selectedChoice = null;
  }

  const ACTIONS = {
    idle: [
      { label: '\u2191 History', action: () => {}, cls: '' },
      { label: 'Tab', action: () => act('\t'), cls: '' },
      { label: 'Clear', action: () => act('clear\r'), cls: '' },
    ],
    approval: [
      { label: '\u2713 Yes', action: () => act('y\r'), cls: 'green' },
      { label: '\u2717 No', action: () => act('n\r'), cls: 'red' },
      { label: '\u2303C', action: () => act('\x03'), cls: 'yellow' },
    ],
    running: [
      { label: '\u23F9 Stop', action: () => act('\x03'), cls: 'red' },
    ],
    picker: [
      { label: '\u2191', action: () => act('\x1b[A'), cls: '' },
      { label: '\u2193', action: () => act('\x1b[B'), cls: '' },
      { label: 'Select', action: () => act('\r'), cls: 'green' },
      { label: 'Cancel', action: () => act('\x03'), cls: 'red' },
    ],
  };

  let buttons = $derived(ACTIONS[context] || ACTIONS.idle);
</script>

{#if context === 'choices' && choices.length > 0}
  <!-- Select-then-confirm choice list -->
  <div class="choices-panel">
    <div class="choices-header">
      <span class="choices-label">Select an option</span>
      {#if selectedChoice}
        <button class="confirm-btn" onclick={confirmChoice}>
          Send #{selectedChoice.num} &#x27A4;
        </button>
      {/if}
    </div>
    <div class="choices-list">
      {#each choices as choice}
        <button
          class="choice-row"
          class:selected={selectedChoice?.num === choice.num}
          onclick={() => selectChoice(choice)}
        >
          <span class="choice-num">{choice.num}</span>
          <span class="choice-label">{choice.label}</span>
          {#if selectedChoice?.num === choice.num}
            <span class="choice-check">&#x2713;</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
{:else}
  <!-- Standard quick action chips -->
  <div class="quick-actions">
    {#each buttons as btn}
      <button class="chip {btn.cls}" onclick={btn.action}>{btn.label}</button>
    {/each}
  </div>
{/if}

<style>
  /* === Standard quick action chips === */
  .quick-actions {
    display: flex;
    gap: var(--s1);
    padding: var(--s1) var(--s3);
    overflow-x: auto;
    scrollbar-width: none;
    flex-shrink: 0;
  }
  .quick-actions::-webkit-scrollbar { display: none; }

  .chip {
    padding: var(--s1) var(--s3);
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--r-full);
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    min-height: 30px;
    display: flex;
    align-items: center;
    transition: transform 50ms;
    -webkit-tap-highlight-color: transparent;
  }

  .chip:active { transform: scale(0.93); }
  .chip.green { color: var(--green); border-color: var(--green-subtle); }
  .chip.red { color: var(--red); border-color: var(--red-subtle); }
  .chip.yellow { color: var(--yellow); border-color: var(--yellow-subtle); }

  /* === Choices panel (select-then-confirm) === */
  .choices-panel {
    flex-shrink: 0;
    background: var(--surface);
    border-top: 1px solid var(--border);
    max-height: 40vh;
    display: flex;
    flex-direction: column;
  }

  .choices-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--s2) var(--s3);
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .choices-label {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .confirm-btn {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: var(--r-full);
    padding: var(--s2) var(--s4);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    font-weight: 600;
    cursor: pointer;
    min-height: var(--touch-min);
    display: flex;
    align-items: center;
    gap: var(--s1);
    animation: confirmAppear 150ms var(--ease-spring);
    -webkit-tap-highlight-color: transparent;
  }
  .confirm-btn:active {
    transform: scale(0.95);
  }

  @keyframes confirmAppear {
    from { opacity: 0; transform: scale(0.85); }
    to { opacity: 1; transform: scale(1); }
  }

  .choices-list {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: var(--s1) var(--s2);
    display: flex;
    flex-direction: column;
    gap: var(--s1);
  }
  .choices-list::-webkit-scrollbar { width: 3px; }
  .choices-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .choice-row {
    display: flex;
    align-items: center;
    gap: var(--s3);
    padding: var(--s3) var(--s3);
    background: var(--surface-raised);
    border: 2px solid transparent;
    border-radius: var(--r-md);
    cursor: pointer;
    min-height: var(--touch-min);
    transition: border-color var(--duration-fast), background var(--duration-fast);
    -webkit-tap-highlight-color: transparent;
    text-align: left;
    width: 100%;
    font-family: var(--font-sans);
  }
  .choice-row:active {
    background: var(--accent-subtle);
  }
  .choice-row.selected {
    border-color: var(--accent);
    background: var(--accent-subtle);
  }

  .choice-num {
    width: 28px;
    height: 28px;
    border-radius: var(--r-full);
    background: var(--border);
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background var(--duration-fast), color var(--duration-fast);
  }
  .choice-row.selected .choice-num {
    background: var(--accent);
    color: #fff;
  }

  .choice-label {
    flex: 1;
    font-size: var(--text-sm);
    color: var(--text);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .choice-check {
    color: var(--accent);
    font-size: var(--text-lg);
    font-weight: 700;
    flex-shrink: 0;
    animation: checkPop 200ms var(--ease-spring);
  }

  @keyframes checkPop {
    from { opacity: 0; transform: scale(0.5); }
    to { opacity: 1; transform: scale(1); }
  }

  /* Desktop: 2-column layout for choices */
  @media (min-width: 769px) {
    .choices-list {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--s1);
    }
    .choices-panel {
      max-height: 30vh;
    }
  }
</style>
