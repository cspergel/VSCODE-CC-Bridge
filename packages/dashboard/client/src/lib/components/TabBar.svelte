<script>
  import { haptic } from '../utils/haptics.js';

  let { activeTab = 'terminal', onSwitch } = $props();

  const tabs = [
    { id: 'terminal', label: 'Terminal', icon: '>' },
    { id: 'sessions', label: 'Sessions', icon: '\u2630' },
    { id: 'activity', label: 'Activity', icon: '\u25C9' },
    { id: 'settings', label: 'Settings', icon: '\u2699' },
  ];

  function switchTab(id) {
    if (id === activeTab) return;
    haptic('light');
    onSwitch?.(id);
  }
</script>

<nav class="tabbar">
  {#each tabs as tab}
    <button
      class="tab"
      class:active={activeTab === tab.id}
      onclick={() => switchTab(tab.id)}
    >
      <span class="tab-icon">{tab.icon}</span>
      <span class="tab-label">{tab.label}</span>
    </button>
  {/each}
</nav>

<style>
  .tabbar {
    display: flex;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: var(--tabbar-h);
    background: var(--surface);
    border-top: 1px solid var(--border);
    z-index: var(--z-tabbar);
    padding-bottom: var(--safe-bottom);
    -webkit-tap-highlight-color: transparent;
  }

  .tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    background: none;
    border: none;
    color: var(--text-tertiary);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: color var(--duration-fast);
    padding: var(--s1) 0;
    position: relative;
    min-height: var(--touch-min);
  }

  .tab.active {
    color: var(--accent);
  }

  .tab-icon {
    font-size: 20px;
    line-height: 1;
  }

  .tab-label {
    font-size: var(--text-xs);
    font-weight: 500;
  }

  .tab.active::before {
    content: '';
    position: absolute;
    top: 0;
    left: 25%;
    right: 25%;
    height: 2px;
    background: var(--accent);
    border-radius: 0 0 2px 2px;
  }
</style>
