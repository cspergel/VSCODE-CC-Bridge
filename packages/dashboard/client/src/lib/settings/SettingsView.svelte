<script>
  import { fontSize } from '../stores/preferences.js';
  import { haptic } from '../utils/haptics.js';
  import { showToast } from '../stores/toast.js';

  let whatsappPaused = $state(false);
  let telegramPaused = $state(false);

  import { onMount } from 'svelte';
  onMount(async () => {
    try {
      const res = await fetch('/api/platforms');
      const data = await res.json();
      whatsappPaused = data.whatsapp || false;
      telegramPaused = data.telegram || false;
    } catch {}
  });

  async function togglePlatform(name) {
    haptic('light');
    try {
      const res = await fetch(`/api/platforms/${name}/toggle`, { method: 'POST' });
      const data = await res.json();
      if (name === 'whatsapp') whatsappPaused = data.paused;
      if (name === 'telegram') telegramPaused = data.paused;
      showToast(`${name}: ${data.paused ? 'paused' : 'active'}`);
    } catch {
      showToast(`Failed to toggle ${name}`);
    }
  }

  function changeFontSize(delta) {
    haptic('light');
    fontSize.update(s => Math.max(8, Math.min(28, s + delta)));
    showToast(`Font size: ${$fontSize}px`);
  }
</script>

<div class="settings-view">
  <div class="section">
    <h3 class="section-title">Terminal</h3>
    <div class="setting-row">
      <span>Font Size</span>
      <div class="font-controls">
        <button class="fc-btn" onclick={() => changeFontSize(-2)}>A-</button>
        <span class="fc-value">{$fontSize}px</span>
        <button class="fc-btn" onclick={() => changeFontSize(2)}>A+</button>
      </div>
    </div>
  </div>

  <div class="section">
    <h3 class="section-title">Messaging</h3>
    <div class="setting-row">
      <span>WhatsApp</span>
      <button class="toggle" class:active={!whatsappPaused} onclick={() => togglePlatform('whatsapp')}>
        <span class="toggle-thumb"></span>
      </button>
    </div>
    <div class="setting-row">
      <span>Telegram</span>
      <button class="toggle" class:active={!telegramPaused} onclick={() => togglePlatform('telegram')}>
        <span class="toggle-thumb"></span>
      </button>
    </div>
  </div>

  <div class="section">
    <h3 class="section-title">About</h3>
    <div class="about">Claude Code Mobile v0.1.0</div>
  </div>
</div>

<style>
  .settings-view { padding: var(--s4); }
  .section { margin-bottom: var(--s6); }
  .section-title {
    font-size: var(--text-sm); color: var(--text-tertiary);
    text-transform: uppercase; letter-spacing: 0.05em;
    margin-bottom: var(--s3);
  }

  .setting-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: var(--s3) var(--s4);
    background: var(--surface-raised); border: 1px solid var(--border);
    border-radius: var(--r-md); margin-bottom: var(--s2);
    min-height: 52px; font-size: var(--text-base);
  }

  .font-controls { display: flex; align-items: center; gap: var(--s2); }
  .fc-btn {
    width: 36px; height: 36px; border-radius: var(--r-sm);
    background: var(--bg); border: 1px solid var(--border);
    color: var(--text); font-size: var(--text-sm); font-weight: 600;
    cursor: pointer; font-family: var(--font-sans);
  }
  .fc-btn:active { background: var(--accent-subtle); }
  .fc-value { font-size: var(--text-sm); color: var(--text-secondary); min-width: 40px; text-align: center; }

  .toggle {
    position: relative; width: 48px; height: 28px;
    background: var(--border); border: none; border-radius: 14px;
    cursor: pointer; transition: background var(--duration-fast);
  }
  .toggle.active { background: var(--green); }
  .toggle-thumb {
    position: absolute; top: 3px; left: 3px;
    width: 22px; height: 22px; background: #fff;
    border-radius: 50%; transition: transform var(--duration-fast);
  }
  .toggle.active .toggle-thumb { transform: translateX(20px); }

  .about { font-size: var(--text-sm); color: var(--text-tertiary); padding: var(--s3) var(--s4); }
</style>
