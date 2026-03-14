<script>
  import { haptic } from '../utils/haptics.js';
  import { truncate, folderName } from '../utils/format.js';

  let { session, isActive = false, onSelect, onDelete } = $props();

  // Swipe state
  let offsetX = $state(0);
  let swiped = $state(false);
  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping = false;
  let directionLocked = false;
  const SWIPE_THRESHOLD = 80;
  const DELETE_WIDTH = 80;

  function select() {
    if (swiped) {
      // Tapping anywhere when swiped resets it
      offsetX = 0;
      swiped = false;
      return;
    }
    haptic('light');
    onSelect?.(session);
  }

  function handleDelete(e) {
    e.stopPropagation();
    haptic('medium');
    onDelete?.(session);
    offsetX = 0;
    swiped = false;
  }

  function onTouchStart(e) {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    isSwiping = false;
    directionLocked = false;
  }

  function onTouchMove(e) {
    const touch = e.touches[0];
    if (!touch) return;
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;

    // Lock direction after 10px of movement
    if (!directionLocked && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      directionLocked = true;
      isSwiping = Math.abs(dx) > Math.abs(dy);
    }

    if (!isSwiping) return;

    // Prevent vertical scroll while swiping horizontally
    e.preventDefault();

    if (swiped) {
      // Already swiped open — allow swiping back
      offsetX = Math.min(0, Math.max(-DELETE_WIDTH, -DELETE_WIDTH + dx));
    } else {
      // Only allow left swipe (negative)
      offsetX = Math.min(0, dx);
    }
  }

  function onTouchEnd() {
    if (!isSwiping) return;

    if (swiped) {
      // If swiped back past halfway, close
      if (offsetX > -DELETE_WIDTH / 2) {
        offsetX = 0;
        swiped = false;
      } else {
        offsetX = -DELETE_WIDTH;
      }
    } else {
      // Snap to open or closed
      if (offsetX < -SWIPE_THRESHOLD) {
        offsetX = -DELETE_WIDTH;
        swiped = true;
        haptic('light');
      } else {
        offsetX = 0;
      }
    }
  }
</script>

<div class="card-wrapper">
  <!-- Delete button revealed behind card -->
  <button class="delete-btn" class:visible={offsetX < 0} onclick={handleDelete}>
    Delete
  </button>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="card"
    class:active={isActive}
    class:swiping={offsetX !== 0}
    style="transform: translateX({offsetX}px)"
    role="button"
    tabindex="0"
    onclick={select}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') select(); }}
    ontouchstart={onTouchStart}
    ontouchmove={onTouchMove}
    ontouchend={onTouchEnd}
    ontouchcancel={onTouchEnd}
  >
    <div class="dot-wrap">
      <span class="dot {session.status || 'idle'}"></span>
    </div>
    <div class="info">
      <div class="name">{session.name || session.id}</div>
      <div class="path">{truncate(session.projectPath || '', 50)}</div>
    </div>
    <span class="status-badge {session.status || 'idle'}">{session.status || 'idle'}</span>
    <span class="arrow">&#x203A;</span>
  </div>
</div>

<style>
  .card-wrapper {
    position: relative;
    margin-bottom: var(--s2);
    overflow: hidden;
    border-radius: var(--r-md);
  }

  .delete-btn {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 80px;
    background: var(--red);
    color: #fff;
    border: none;
    font-size: var(--text-sm);
    font-weight: 600;
    font-family: var(--font-sans);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity var(--duration-fast);
  }
  .delete-btn.visible {
    opacity: 1;
  }
  .delete-btn:active {
    background: #d73a3a;
  }

  .card {
    display: flex;
    align-items: center;
    gap: var(--s3);
    padding: var(--s3) var(--s4);
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    cursor: pointer;
    min-height: 68px;
    transition: border-color var(--duration-fast), background var(--duration-fast), transform var(--duration-normal) var(--ease-out);
    -webkit-tap-highlight-color: transparent;
    position: relative;
    z-index: 1;
    will-change: transform;
  }
  .card.swiping {
    transition: none;
  }

  .card:active { background: var(--accent-subtle); }
  .card.active { border-left: 3px solid var(--accent); }

  .dot-wrap { width: 20px; flex-shrink: 0; display: flex; justify-content: center; }
  .dot {
    width: 12px; height: 12px; border-radius: 50%;
    background: var(--text-tertiary);
  }
  .dot.running { background: var(--green); }
  .dot.active { background: var(--green); }
  .dot.error { background: var(--red); }
  .dot.paused { background: var(--yellow); }

  .info { flex: 1; min-width: 0; }
  .name {
    font-size: var(--text-base); font-weight: 500;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .path {
    font-size: var(--text-xs); color: var(--text-tertiary);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    margin-top: 2px;
  }

  .status-badge {
    font-size: var(--text-xs); padding: 2px 8px;
    border-radius: var(--r-full); text-transform: uppercase;
    font-weight: 600; flex-shrink: 0;
  }
  .status-badge.running, .status-badge.active { background: var(--green-subtle); color: var(--green); }
  .status-badge.idle { background: var(--border); color: var(--text-tertiary); }
  .status-badge.error { background: var(--red-subtle); color: var(--red); }

  .arrow { font-size: 22px; color: var(--text-tertiary); flex-shrink: 0; }
</style>
