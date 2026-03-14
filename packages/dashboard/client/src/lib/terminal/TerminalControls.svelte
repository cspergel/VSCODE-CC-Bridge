<script>
  import { onMount, onDestroy } from 'svelte';
  import { fontSize } from '../stores/preferences.js';
  import { haptic } from '../utils/haptics.js';
  import { showToast } from '../stores/toast.js';
  import { terminalInstances } from '../stores/terminal.js';
  import { activeSessionId } from '../stores/sessions.js';

  const FONT_SIZE_MIN = 8;
  const FONT_SIZE_MAX = 28;
  const FONT_SIZE_STEP = 2;

  // State
  let selectMode = $state(false);
  let keyboardActive = $state(false);
  let showScrollTop = $state(false);
  let showScrollBottom = $state(false);
  let selectOverlayText = $state('');
  let termAreaEl = $state(null);

  // Pinch-to-zoom state
  let pinchStartDist = 0;
  let pinchStartFontSize = 0;
  let isPinching = false;

  // Scroll polling
  let scrollInterval;

  onMount(() => {
    // Find terminal area for pinch-to-zoom
    termAreaEl = document.querySelector('.terminal-area');
    if (termAreaEl) {
      termAreaEl.addEventListener('touchstart', onPinchTouchStart, { passive: true });
      termAreaEl.addEventListener('touchmove', onPinchTouchMoveTracked, { passive: true });
      termAreaEl.addEventListener('touchend', onPinchTouchEndTracked, { passive: true });
      termAreaEl.addEventListener('touchcancel', onPinchTouchEndTracked, { passive: true });
    }

    // Poll scroll position to show/hide scroll buttons
    scrollInterval = setInterval(updateScrollButtons, 500);
  });

  onDestroy(() => {
    if (termAreaEl) {
      termAreaEl.removeEventListener('touchstart', onPinchTouchStart);
      termAreaEl.removeEventListener('touchmove', onPinchTouchMoveTracked);
      termAreaEl.removeEventListener('touchend', onPinchTouchEndTracked);
      termAreaEl.removeEventListener('touchcancel', onPinchTouchEndTracked);
    }
    if (scrollInterval) clearInterval(scrollInterval);
  });

  function getActiveEntry() {
    const sid = $activeSessionId;
    if (!sid) return null;
    return terminalInstances.get(sid) || null;
  }

  // --- Select mode ---
  function toggleSelectMode() {
    selectMode = !selectMode;
    haptic('light');

    if (selectMode) {
      const entry = getActiveEntry();
      if (!entry) {
        selectMode = false;
        return;
      }
      // Read terminal buffer for selectable text
      const buffer = entry.term.buffer.active;
      const lines = [];
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) lines.push(line.translateToString());
      }
      selectOverlayText = lines.join('\n');
    } else {
      selectOverlayText = '';
    }
  }

  async function copySelection() {
    const sel = window.getSelection();
    if (!sel) return;
    const text = sel.toString();
    if (!text) return;

    haptic('light');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for iOS
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        ta.style.fontSize = '16px';
        ta.style.opacity = '0.01';
        document.body.appendChild(ta);
        ta.focus();
        ta.setSelectionRange(0, ta.value.length);
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast('Copied to clipboard');
      selectMode = false;
      selectOverlayText = '';
    } catch {
      showToast('Copy failed');
    }
  }

  // --- Keyboard toggle ---
  function toggleKeyboard() {
    keyboardActive = !keyboardActive;
    haptic('light');

    const entry = getActiveEntry();
    if (!entry) return;

    if (keyboardActive) {
      entry.term.focus();
    } else {
      entry.term.blur();
    }

    // Refit after keyboard animation
    setTimeout(() => {
      try { entry.fitAddon.fit(); } catch {}
    }, 300);
  }

  // --- Font size ---
  function changeFontSize(delta) {
    haptic('light');
    fontSize.update(current => {
      const newSize = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, current + delta));
      if (newSize !== current) {
        showToast(`Font size: ${newSize}px`);
      }
      return newSize;
    });
  }

  // --- Scroll buttons ---
  function scrollToTop() {
    haptic('light');
    const entry = getActiveEntry();
    if (entry) entry.term.scrollToTop();
  }

  function scrollToBottom() {
    haptic('light');
    const entry = getActiveEntry();
    if (entry) entry.term.scrollToBottom();
  }

  function updateScrollButtons() {
    const entry = getActiveEntry();
    if (!entry) {
      showScrollTop = false;
      showScrollBottom = false;
      return;
    }

    const viewport = entry.term.element?.querySelector('.xterm-viewport');
    if (!viewport) return;

    const { scrollTop, scrollHeight, clientHeight } = viewport;
    const hasScroll = scrollHeight > clientHeight + 20;
    showScrollTop = hasScroll && scrollTop > 10;
    showScrollBottom = hasScroll && (scrollTop + clientHeight < scrollHeight - 10);
  }

  // --- Pinch-to-zoom ---
  function getTouchDistance(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onPinchTouchStart(e) {
    if (e.touches.length < 2) return;
    isPinching = true;
    pinchStartDist = getTouchDistance(e.touches[0], e.touches[1]);
    pinchStartFontSize = $fontSize || 14;
  }

  let lastPinchScale = 1;
  function onPinchTouchMoveTracked(e) {
    if (!isPinching || e.touches.length < 2) return;
    const currentDist = getTouchDistance(e.touches[0], e.touches[1]);
    lastPinchScale = currentDist / pinchStartDist;
    lastPinchScale = Math.max(0.5, Math.min(2.5, lastPinchScale));
  }

  function onPinchTouchEndTracked() {
    if (!isPinching) return;
    isPinching = false;

    if (lastPinchScale === 1) return;

    const newSize = Math.round(pinchStartFontSize * lastPinchScale);
    const clamped = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, newSize));
    if (clamped !== $fontSize) {
      fontSize.set(clamped);
      showToast(`Font size: ${clamped}px`);
    }
    lastPinchScale = 1;
  }


</script>

<!-- Select mode overlay -->
{#if selectMode}
  <div class="select-overlay">
    <pre class="select-text">{selectOverlayText}</pre>
    <div class="select-toolbar">
      <button class="ctrl-btn accent" onclick={copySelection}>Copy</button>
      <button class="ctrl-btn" onclick={toggleSelectMode}>Done</button>
    </div>
  </div>
{/if}

<!-- Control buttons -->
<div class="terminal-controls">
  <!-- Scroll buttons -->
  {#if showScrollTop}
    <button class="scroll-btn top" onclick={scrollToTop} title="Scroll to top">
      &#x2191;
    </button>
  {/if}
  {#if showScrollBottom}
    <button class="scroll-btn bottom" onclick={scrollToBottom} title="Scroll to bottom">
      &#x2193;
    </button>
  {/if}

  <!-- Toolbar row -->
  <div class="controls-row">
    <button
      class="ctrl-btn"
      class:active={selectMode}
      onclick={toggleSelectMode}
      title="Select text"
    >
      &#x2263;
    </button>

    <button
      class="ctrl-btn"
      class:active={keyboardActive}
      onclick={toggleKeyboard}
      title="Toggle keyboard"
    >
      &#x2328;
    </button>

    <button class="ctrl-btn" onclick={() => changeFontSize(-FONT_SIZE_STEP)} title="Decrease font">
      A&#x2212;
    </button>

    <button class="ctrl-btn" onclick={() => changeFontSize(FONT_SIZE_STEP)} title="Increase font">
      A+
    </button>
  </div>
</div>

<style>
  .terminal-controls {
    position: absolute;
    right: var(--s2);
    top: var(--s2);
    bottom: var(--s2);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-end;
    z-index: var(--z-controls);
    pointer-events: none;
  }

  .controls-row {
    display: flex;
    gap: var(--s1);
    pointer-events: auto;
    background: rgba(22, 27, 34, 0.85);
    border-radius: var(--r-md);
    padding: 2px;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--border-subtle);
  }

  .ctrl-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--text-secondary);
    border: none;
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background var(--duration-fast), color var(--duration-fast);
    -webkit-tap-highlight-color: transparent;
    min-height: var(--touch-min);
    min-width: var(--touch-min);
    padding: 0;
  }
  .ctrl-btn:active {
    background: var(--accent-subtle);
  }
  .ctrl-btn.active {
    background: var(--accent);
    color: #fff;
  }
  .ctrl-btn.accent {
    background: var(--accent);
    color: #fff;
  }

  .scroll-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--r-full);
    background: rgba(22, 27, 34, 0.85);
    color: var(--text-secondary);
    border: 1px solid var(--border-subtle);
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    -webkit-tap-highlight-color: transparent;
    min-height: var(--touch-min);
    min-width: var(--touch-min);
  }
  .scroll-btn:active {
    background: var(--accent-subtle);
  }
  .scroll-btn.top {
    margin-bottom: auto;
  }
  .scroll-btn.bottom {
    margin-top: auto;
    margin-bottom: var(--s2);
  }

  /* Select mode overlay */
  .select-overlay {
    position: absolute;
    inset: 0;
    z-index: calc(var(--z-controls) + 1);
    background: rgba(13, 17, 23, 0.95);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    display: flex;
    flex-direction: column;
  }
  .select-text {
    flex: 1;
    padding: var(--s3);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--text);
    white-space: pre-wrap;
    word-break: break-all;
    user-select: text;
    -webkit-user-select: text;
    line-height: 1.4;
  }
  .select-toolbar {
    display: flex;
    gap: var(--s2);
    padding: var(--s3);
    justify-content: flex-end;
    background: var(--surface);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  /* Only show on mobile-width screens */
  @media (min-width: 769px) {
    .terminal-controls {
      display: none;
    }
    .select-overlay {
      display: none;
    }
  }
</style>
