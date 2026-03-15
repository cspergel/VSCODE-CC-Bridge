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
  let toolsOpen = $state(false);

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

  // Focus the InputBar input (not xterm) for typing/dictation
  function focusInputBar() {
    haptic('light');
    const input = document.querySelector('.input-bar input');
    if (input) {
      input.focus();
    }
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

<!-- Floating "Type" pill to focus input bar -->
<button class="type-pill" onclick={focusInputBar} title="Type a command">
  &#x2328; Type
</button>

<!-- Scroll buttons (always visible when needed) -->
<div class="scroll-controls">
  {#if showScrollTop}
    <button class="scroll-btn" onclick={scrollToTop} title="Scroll to top">&#x2191;</button>
  {/if}
  {#if showScrollBottom}
    <button class="scroll-btn" onclick={scrollToBottom} title="Scroll to bottom">&#x2193;</button>
  {/if}
</div>

<!-- Tools toggle button + expandable panel -->
<div class="tools-area">
  <button
    class="tools-toggle"
    class:open={toolsOpen}
    onclick={() => { toolsOpen = !toolsOpen; haptic('light'); }}
    title="Terminal tools"
  >
    &#x2699;
  </button>

  {#if toolsOpen}
    <div class="tools-panel">
      <button class="tool-btn" onclick={toggleSelectMode} title="Select text">
        &#x2263; Select
      </button>
      <button class="tool-btn" onclick={() => changeFontSize(-FONT_SIZE_STEP)} title="Smaller font">
        A&#x2212;
      </button>
      <button class="tool-btn" onclick={() => changeFontSize(FONT_SIZE_STEP)} title="Larger font">
        A+
      </button>
      <button class="tool-btn" onclick={toggleKeyboard} title="Toggle keyboard">
        &#x2328; Keys
      </button>
    </div>
  {/if}
</div>

<style>
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
    -webkit-tap-highlight-color: transparent;
    min-height: var(--touch-min);
    min-width: var(--touch-min);
    padding: 0;
  }
  .ctrl-btn:active { background: var(--accent-subtle); }
  .ctrl-btn.accent { background: var(--accent); color: #fff; }

  /* Floating "Type" pill */
  .type-pill {
    position: absolute;
    bottom: var(--s3);
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-controls);
    background: rgba(22, 27, 34, 0.9);
    color: var(--text-secondary);
    border: 1px solid var(--border);
    border-radius: var(--r-full);
    padding: var(--s2) var(--s5);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    font-weight: 500;
    cursor: pointer;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    -webkit-tap-highlight-color: transparent;
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: var(--s2);
  }
  .type-pill:active {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }

  /* Scroll buttons - top-right corner */
  .scroll-controls {
    position: absolute;
    right: var(--s2);
    top: var(--s2);
    display: flex;
    flex-direction: column;
    gap: var(--s2);
    z-index: var(--z-controls);
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
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    -webkit-tap-highlight-color: transparent;
    min-height: var(--touch-min);
    min-width: var(--touch-min);
  }
  .scroll-btn:active { background: var(--accent-subtle); }

  /* Tools toggle + panel - bottom-right corner */
  .tools-area {
    position: absolute;
    right: var(--s2);
    bottom: 60px; /* above Type pill */
    z-index: var(--z-controls);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--s2);
  }

  .tools-toggle {
    width: 40px;
    height: 40px;
    border-radius: var(--r-full);
    background: rgba(22, 27, 34, 0.85);
    color: var(--text-tertiary);
    border: 1px solid var(--border-subtle);
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    -webkit-tap-highlight-color: transparent;
    min-height: var(--touch-min);
    min-width: var(--touch-min);
    transition: transform var(--duration-normal), background var(--duration-fast);
  }
  .tools-toggle.open {
    transform: rotate(90deg);
    background: var(--accent-subtle);
    color: var(--accent);
    border-color: var(--accent);
  }
  .tools-toggle:active { background: var(--accent-subtle); }

  .tools-panel {
    display: flex;
    flex-direction: column;
    gap: var(--s1);
    background: rgba(22, 27, 34, 0.92);
    border-radius: var(--r-md);
    padding: var(--s1);
    border: 1px solid var(--border-subtle);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    animation: toolsSlideUp 150ms var(--ease-out);
  }

  @keyframes toolsSlideUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .tool-btn {
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding: var(--s2) var(--s3);
    background: transparent;
    color: var(--text-secondary);
    border: none;
    border-radius: var(--r-sm);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    min-height: var(--touch-min);
    -webkit-tap-highlight-color: transparent;
  }
  .tool-btn:active { background: var(--accent-subtle); color: var(--accent); }

  /* Only show on mobile-width screens */
  @media (min-width: 769px) {
    .tools-area { display: none; }
    .scroll-controls { display: none; }
    .select-overlay { display: none; }
    .type-pill { display: none; }
  }
</style>
