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

  let activeTab = $state('terminal');

  function handleSwitch(tab) {
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
    {#if activeTab === 'terminal'}
      <div class="view">
        <TerminalView />
      </div>
    {:else if activeTab === 'sessions'}
      <div class="view">
        <SessionsView />
      </div>
    {:else if activeTab === 'activity'}
      <div class="view">
        <ActivityView />
      </div>
    {:else if activeTab === 'settings'}
      <div class="view">
        <SettingsView />
      </div>
    {/if}
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
    padding-bottom: var(--tabbar-h);
  }

  .view {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
</style>
