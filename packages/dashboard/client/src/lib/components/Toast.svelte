<script>
  import { toasts } from '../stores/toast.js';
</script>

{#if $toasts.length > 0}
  <div class="toast-container">
    {#each $toasts as toast (toast.id)}
      <div class="toast" transition:fly={{ y: -20, duration: 200 }}>
        {toast.message}
      </div>
    {/each}
  </div>
{/if}

<script context="module">
  import { fly } from 'svelte/transition';
</script>

<style>
  .toast-container {
    position: fixed;
    top: calc(var(--s4) + var(--safe-top));
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-toast);
    display: flex;
    flex-direction: column;
    gap: var(--s2);
    pointer-events: none;
  }

  .toast {
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: var(--s2) var(--s4);
    font-size: var(--text-sm);
    color: var(--text);
    box-shadow: var(--shadow-md);
    pointer-events: auto;
    white-space: nowrap;
  }
</style>
