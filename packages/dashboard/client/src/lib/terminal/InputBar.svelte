<script>
  import { sendTerminalInput } from '../stores/websocket.js';
  import { activeSessionId } from '../stores/sessions.js';
  import { cmdHistory } from '../stores/preferences.js';
  import { haptic } from '../utils/haptics.js';
  import { showToast } from '../stores/toast.js';
  import { onMount, onDestroy } from 'svelte';

  let inputEl;
  let text = $state('');
  let historyIndex = $state(-1);
  let draft = $state('');
  let keyboardOffset = $state(0);

  // Keyboard-aware positioning via visualViewport API
  let fullHeight = 0;
  let vpHandler = null;
  let orientationHandler = null;

  onMount(() => {
    fullHeight = window.innerHeight;

    // Update fullHeight on orientation/resize changes
    orientationHandler = () => { fullHeight = window.innerHeight; };
    window.addEventListener('orientationchange', orientationHandler);

    if (window.visualViewport) {
      vpHandler = () => {
        const vp = window.visualViewport;
        const heightDelta = fullHeight - vp.height;
        const tabBarH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tabbar-h')) || 52;

        if (heightDelta > 100) {
          keyboardOffset = heightDelta - tabBarH;
          if (keyboardOffset < 0) keyboardOffset = 0;
        } else {
          keyboardOffset = 0;
          // Update fullHeight when keyboard is closed (captures rotation)
          fullHeight = window.innerHeight;
        }
      };
      window.visualViewport.addEventListener('resize', vpHandler);
      window.visualViewport.addEventListener('scroll', vpHandler);
    }
  });

  onDestroy(() => {
    if (vpHandler && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', vpHandler);
      window.visualViewport.removeEventListener('scroll', vpHandler);
    }
    if (orientationHandler) {
      window.removeEventListener('orientationchange', orientationHandler);
    }
  });

  function send() {
    if (!text.trim()) return;
    const sid = $activeSessionId;
    if (!sid) {
      showToast('No active session');
      return;
    }

    // Add to history
    cmdHistory.update(h => {
      const next = [...h];
      if (next[next.length - 1] !== text) next.push(text);
      return next.slice(-50);
    });

    haptic('light');
    sendTerminalInput(sid, text + '\r');
    text = '';
    historyIndex = -1;

    // Blur on mobile to dismiss keyboard
    if (window.innerWidth <= 768 && inputEl) inputEl.blur();
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
    if (e.key === 'ArrowUp' && !text) {
      e.preventDefault();
      const h = $cmdHistory;
      if (h.length === 0) return;
      if (historyIndex === -1) { draft = text; historyIndex = h.length - 1; }
      else if (historyIndex > 0) historyIndex--;
      text = h[historyIndex] || '';
    }
    if (e.key === 'ArrowDown' && historyIndex >= 0) {
      e.preventDefault();
      const h = $cmdHistory;
      if (historyIndex < h.length - 1) { historyIndex++; text = h[historyIndex]; }
      else { historyIndex = -1; text = draft; }
    }
  }
</script>

<div
  class="input-bar"
  style={keyboardOffset > 0 ? `transform: translateY(-${keyboardOffset}px)` : ''}
>
  <input
    bind:this={inputEl}
    bind:value={text}
    onkeydown={handleKeydown}
    type="text"
    placeholder="Type a command..."
    autocomplete="off"
    autocorrect="off"
    autocapitalize="off"
    spellcheck="false"
  />
  <button class="send-btn" onclick={send} disabled={!text.trim()}>
    &#x27A4;
  </button>
</div>

<style>
  .input-bar {
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: var(--s3) var(--s3);
    background: var(--surface);
    border-top: 2px solid var(--border);
    flex-shrink: 0;
    will-change: transform;
    transition: transform 0.1s ease-out;
  }

  input {
    flex: 1;
    background: var(--bg);
    color: var(--text);
    border: 2px solid var(--border);
    border-radius: var(--r-md);
    padding: var(--s3) var(--s3);
    font-family: var(--font-mono);
    font-size: 16px;
    min-height: 48px;
    outline: none;
    -webkit-appearance: none;
  }

  input:focus {
    border-color: var(--accent);
  }

  input::placeholder {
    color: var(--text-tertiary);
  }

  .send-btn {
    width: 48px;
    height: 48px;
    border-radius: var(--r-md);
    background: var(--accent);
    color: #fff;
    border: none;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: opacity var(--duration-fast);
  }

  .send-btn:disabled {
    opacity: 0.4;
  }

  .send-btn:active {
    transform: scale(0.93);
  }
</style>
