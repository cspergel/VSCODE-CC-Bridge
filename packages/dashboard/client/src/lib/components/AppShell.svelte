<script>
  import Header from './Header.svelte';
  import TabBar from './TabBar.svelte';
  import Toast from './Toast.svelte';
  import TerminalView from '../terminal/TerminalView.svelte';
  import SessionsView from '../sessions/SessionsView.svelte';
  import ActivityView from '../activity/ActivityView.svelte';
  import SettingsView from '../settings/SettingsView.svelte';
  import { connect } from '../stores/websocket.js';
  import { pollServices } from '../stores/services.js';
  import { fetchSessions } from '../stores/sessions.js';
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';

  const TAB_ORDER = ['terminal', 'sessions', 'activity', 'settings'];

  let activeTab = $state('terminal');
  let slideDirection = $state(1); // 1 = right, -1 = left

  function handleSwitch(tab) {
    const newIndex = TAB_ORDER.indexOf(tab);
    const oldIndex = TAB_ORDER.indexOf(activeTab);
    slideDirection = newIndex > oldIndex ? 1 : -1;
    activeTab = tab;
  }

  const TAB_TITLES = {
    terminal: '',
    sessions: 'Sessions',
    activity: 'Activity',
    settings: 'Settings',
  };

  onMount(() => {
    connect();
    fetchSessions();
    pollServices();
    // Poll services every 5s as fallback
    const interval = setInterval(pollServices, 5000);
    return () => clearInterval(interval);
  });
</script>

<div class="app-shell">
  <Header title={TAB_TITLES[activeTab]} />

  <main class="app-content">
    {#key activeTab}
      <div
        class="view"
        in:fly={{ x: slideDirection * 80, duration: 180, delay: 30 }}
        out:fly={{ x: slideDirection * -80, duration: 150 }}
      >
        {#if activeTab === 'terminal'}
          <TerminalView />
        {:else if activeTab === 'sessions'}
          <SessionsView />
        {:else if activeTab === 'activity'}
          <ActivityView />
        {:else if activeTab === 'settings'}
          <SettingsView />
        {/if}
      </div>
    {/key}
  </main>

  <TabBar {activeTab} onSwitch={handleSwitch} />
  <Toast />
</div>

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
  }

  .app-content {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }

  .view {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: var(--tabbar-h);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
</style>
