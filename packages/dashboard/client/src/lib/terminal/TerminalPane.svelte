<script>
  import { onMount, onDestroy } from 'svelte';
  import { Terminal } from 'xterm';
  import { FitAddon } from 'xterm-addon-fit';
  import 'xterm/css/xterm.css';
  import { sendTerminalInput, sendTerminalResize } from '../stores/websocket.js';
  import { terminalInstances, pendingDataBuffers } from '../stores/terminal.js';
  import { fontSize } from '../stores/preferences.js';

  let { sessionId, active = false } = $props();

  let containerEl;
  let term;
  let fitAddon;
  let resizeObserver;

  onMount(() => {
    const currentSize = $fontSize || 14;

    term = new Terminal({
      cursorBlink: true,
      fontSize: currentSize,
      fontFamily: "'SF Mono', 'Cascadia Code', 'JetBrains Mono', monospace",
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        selectionBackground: 'rgba(88,166,255,0.3)',
      },
      scrollback: 5000,
      allowProposedApi: true,
    });

    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerEl);

    // Send keystrokes
    term.onData((data) => {
      if (active) sendTerminalInput(sessionId, data);
    });

    // Send resize
    term.onResize((size) => {
      if (active) sendTerminalResize(sessionId, size.cols, size.rows);
    });

    // Register in global map
    terminalInstances.set(sessionId, { term, fitAddon, name: sessionId });

    // Replay any buffered data that arrived before this component mounted
    const pending = pendingDataBuffers.get(sessionId);
    if (pending && pending.length > 0) {
      for (const chunk of pending) {
        term.write(chunk);
      }
      pendingDataBuffers.delete(sessionId);
    }

    // Fit on container resize
    resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try { fitAddon.fit(); } catch {}
      });
    });
    resizeObserver.observe(containerEl);

    // Initial fit
    requestAnimationFrame(() => {
      try { fitAddon.fit(); } catch {}
    });

    // Mobile: detect voice dictation via compositionstart and redirect to InputBar.
    // Normal keyboard typing doesn't trigger compositionstart, but speech-to-text does.
    // This prevents the duplication issue where xterm sends each progressive
    // speech recognition update as separate input.
    if (window.innerWidth <= 768) {
      const helperTextarea = containerEl.querySelector('.xterm-helper-textarea');
      if (helperTextarea) {
        helperTextarea.addEventListener('compositionstart', () => {
          // Blur xterm so it stops receiving composition updates
          helperTextarea.blur();
          // Focus the InputBar input instead
          const inputBar = document.querySelector('.input-bar input');
          if (inputBar) {
            setTimeout(() => inputBar.focus(), 50);
          }
        });
      }
    }
  });

  onDestroy(() => {
    if (resizeObserver) resizeObserver.disconnect();
    terminalInstances.delete(sessionId);
    if (term) term.dispose();
  });

  // React to fontSize changes
  $effect(() => {
    const size = $fontSize;
    if (term && size && term.options.fontSize !== size) {
      term.options.fontSize = size;
      try { fitAddon.fit(); } catch {}
    }
  });

  // Refit when becoming active
  $effect(() => {
    if (active && fitAddon) {
      requestAnimationFrame(() => {
        try {
          fitAddon.fit();
          if (term) {
            sendTerminalResize(sessionId, term.cols, term.rows);
          }
        } catch {}
      });
    }
  });
</script>

<div class="terminal-pane" class:active bind:this={containerEl}></div>

<style>
  .terminal-pane {
    width: 100%;
    height: 100%;
    display: none;
  }

  .terminal-pane.active {
    display: block;
  }

  .terminal-pane :global(.xterm) {
    height: 100%;
    padding: 2px;
  }

  .terminal-pane :global(.xterm-viewport) {
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    scroll-behavior: smooth;
  }

  .terminal-pane :global(.xterm-viewport::-webkit-scrollbar) {
    width: 3px;
  }

  .terminal-pane :global(.xterm-viewport::-webkit-scrollbar-thumb) {
    background: var(--border);
    border-radius: 2px;
  }
</style>
