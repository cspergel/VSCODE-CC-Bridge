# Mobile-Optimized Dashboard Design

**Date:** 2026-03-13
**Status:** Design Complete — Ready for Implementation Planning

---

## Design Philosophy

**Terminal is the stage, everything else is backstage.**

The terminal owns the viewport. Every other view (sessions, logs, services) exists to support the terminal experience, not compete with it for space. On mobile, "backstage" means slide-up panels. On desktop, it means collapsible sidebars. Same mental model, adapted to screen size.

---

## Decisions Summary

| Decision | Choice |
|---|---|
| Primary workflow | All equally (monitor, command, manage) |
| App feel | PWA, native app experience |
| Input method | Quick-action buttons + chat-style input bar |
| Navigation | Terminal-first, slide-up panels |
| Session switching | Slide-up drawer with status indicator |
| Alerts | In-app badges only (bridges handle push) |
| Terminal rendering | Optimized xterm.js (designed for dual-mode later) |
| Scope | Unified redesign (mobile + desktop) |
| Command palette | 40+ shortcuts, searchable, categorized |
| Platform control | Per-platform pause toggles (WhatsApp/Telegram) |
| Breakpoints | 3-tier (<480px, 480-768px, >768px) |

---

## 1. PWA Foundation

- `manifest.json`: `display: standalone`, `theme_color: #0d1117`, `background_color: #0d1117`
- App icons: 192px + 512px, monochrome terminal icon
- `<meta name="apple-mobile-web-app-capable">` for iOS
- `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">`
- Service worker: caches static assets for instant load (offline shell)
- No light mode — terminals are dark

### CSS Custom Properties

```css
/* Spacing scales with breakpoints */
--space-xs: 4px;   --space-sm: 8px;
--space-md: 16px;  --space-lg: 24px;  --space-xl: 32px;

/* Font sizes */
--font-term: 16px;        /* phone */
--font-term-tablet: 15px; /* small tablet */
--font-term-desktop: 14px;/* desktop */

/* Radii — slightly more rounded on mobile */
--radius: 12px;           /* mobile */
--radius-desktop: 8px;    /* desktop */
```

### Breakpoints (3-tier)

| Tier | Range | Target |
|---|---|---|
| Phone | < 480px | iPhone, small Android |
| Tablet | 480–768px | Large phone, iPad Mini |
| Desktop | > 768px | Tablet landscape, desktop |

---

## 2. Layout Architecture

### Mobile (< 768px)

```
┌──────────────────────────────────┐
│ [● api-srv ▼]  📱 💬  [⛶] [⚡]  │  ← Status bar
├──────────────────────────────────┤
│                                  │
│         xterm.js terminal        │
│         (fills viewport)         │
│                                  │
├──────────────────────────────────┤
│ [y] [n] [⌃C] [↑] [⚡ Cmds]      │  ← Quick actions (context-aware)
├──────────────────────────────────┤
│ [Type command...]           [➤]  │  ← Input bar (above keyboard)
└──────────────────────────────────┘
       ↑ swipe up: panel launcher
```

### Desktop (> 768px)

```
┌────┬───────────────────────────────────────────┐
│ 📋 │ Claude Bridge  [● api-srv ▼]  📱 💬  ● ● │
│ 📊 │                                           │
│ ⚙  │        xterm.js terminal                  │
│ 💬 │        (fills remaining space)            │
│ 📜 │                                           │
│    ├───────────────────────────────────────────┤
│    │ [y] [n] [⌃C] [↑]  [⚡ Cmds]              │
│    │ [Type command...]                    [➤]  │
└────┴───────────────────────────────────────────┘
```

### Layout Rules

- Terminal ALWAYS gets maximum available space
- Input bar ALWAYS pinned to bottom, stays above virtual keyboard (`visualViewport` API)
- Quick-action row sits between terminal and input
- On mobile, swipe up from below input bar → panel launcher
- On desktop, sidebar collapses to icon rail (48px) or expands (280px), toggle via button or `[` key
- Full-screen mode: hides status bar, terminal gets 100vh minus input bar

---

## 3. Terminal Experience

### Mobile Optimizations

- **Font size:** 16px phone / 15px tablet / 14px desktop
- **`touch-action: manipulation`** on terminal — allows scroll, prevents zoom conflicts
- **Momentum scrollback** — native-feeling flick-scroll through history
- **Long-press (500ms)** to select text → native copy. "Copy" toast appears.
- **Double-tap to zoom** a region (1.5x scale, tap again to reset)

### Full-Screen Mode

Activated via `⛶` button or double-tap status bar:

```
┌──────────────────────────────────┐
│                                  │
│        xterm.js terminal         │
│        (100% viewport)           │
│                                  │
│                    [api-srv]     │  ← floating pill, auto-fades
├──────────────────────────────────┤
│ [y] [n] [⌃C]        [⚡] [⛶✕]  │
├──────────────────────────────────┤
│ [Type command...]           [➤]  │
└──────────────────────────────────┘
```

- Status bar hidden, terminal gets every pixel
- Quick actions + input bar remain
- Session indicator: semi-transparent floating pill (top-right), auto-fades after 3s, tap to show
- Exit via `⛶✕` button or swipe down on quick-action row

### Input Bar

- Pinned above virtual keyboard via `visualViewport` API (critical for mobile UX)
- Enter sends command (not newline)
- Up-arrow button or swipe-up on input cycles command history
- Auto-grows for multi-line (up to 3 lines, then internal scroll)
- Native paste from clipboard

### Context-Aware Quick Actions

| Terminal State | Buttons Shown |
|---|---|
| Idle / at prompt | `[↑ History]` `[Tab]` `[⚡ Cmds]` |
| Waiting for approval | `[✓ Yes]` `[✗ No]` `[⌃C Cancel]` |
| Running (Claude working) | `[⌃C Stop]` `[⚡ Cmds]` |
| Interactive picker | `[↑]` `[↓]` `[⏎ Select]` `[⌃C]` |

Buttons cross-fade on context change (200ms), no layout shift.

---

## 4. Command Palette (`⚡`)

Opens as slide-up panel (mobile) or centered overlay like VS Code `Cmd+K` (desktop). Searchable — type to filter instantly.

### UX Details

- Search bar pinned at top, auto-focused on open
- Sticky category headers while scrolling
- Large touch targets (48px min height per item)
- Smooth momentum scroll with native rubber-band feel
- Recent/favorites section auto-surfaces most-used commands at top
- Client-side filtering, no debounce needed

### Categories

#### 🔒 Mode Toggles (sticky, toggle switches)

| Command | What it does |
|---|---|
| Auto-accept tools | Skip y/n prompts for this session |
| YOLO mode | `--dangerously-skip-permissions` (red, confirm tap) |
| Switch to Sonnet | Fast model for quick tasks |
| Switch to Opus | Full power for complex work |
| Switch to Haiku | Cheap/fast for simple queries |

#### ⚡ Quick Actions (one-tap)

| Command | Sends |
|---|---|
| Compact context | `/compact` |
| Check cost | `/cost` |
| Clear conversation | `/clear` |
| Init project | `/init` |
| Commit changes | `/commit` |
| Create PR | Generates PR with summary |
| Review PR | `/review-pr` |

#### 🛠 Development (one-tap prompts)

| Command | Sends |
|---|---|
| Fix failing tests | `find and fix all failing tests` |
| Explain last error | `explain the last error and suggest a fix` |
| Write tests | `write comprehensive tests for the recent changes` |
| Refactor this | `refactor the current file for clarity, keep behavior identical` |
| Add types | `add TypeScript types to all untyped functions in this file` |
| Optimize | `profile and optimize the slowest parts of this codebase` |
| Security audit | `audit this codebase for OWASP top 10 vulnerabilities` |
| Find dead code | `find and remove all unused exports, functions, and variables` |
| Lint & fix | `find and fix all linting issues` |
| Add error handling | `add proper error handling to all unhandled async operations` |

#### 🧠 Superpowers (skill workflows)

| Command | Sends |
|---|---|
| Brainstorm | `/brainstorm` |
| Write plan | `/write-plan` |
| Execute plan | `/execute-plan` |
| TDD mode | `/tdd` |
| Debug | `/debug` |
| Code review | `/request-code-review` |
| Parallel agents | `/dispatch-agents` |

#### 📊 Git & Project Intel (one-tap prompts)

| Command | Sends |
|---|---|
| Git status | `summarize git status, staged/unstaged changes, and branch state` |
| Recent commits | `show and summarize the last 10 commits` |
| Diff summary | `summarize all changes since the last commit` |
| Dependency audit | `check for outdated or vulnerable dependencies` |
| Codebase overview | `give me a high-level architecture summary of this project` |
| Find TODOs | `find all TODO, FIXME, HACK comments and summarize them` |
| Bundle size | `analyze and report on bundle size, suggest reductions` |

#### 🎛 Session Management

| Command | Action |
|---|---|
| New session | Opens new session dialog |
| Kill session | Terminates current session |
| Restart agent | Restarts agent service |
| Restart bridge | Restarts bridge service |
| Restart all | Full restart with confirmation |

#### 📌 Custom Shortcuts

- Empty by default, "Add shortcut" button
- User-defined name + command pairs
- Saved in config.yaml, persists across sessions

---

## 5. Slide-Up Panels

### Panel Mechanics (Mobile)

- **Drag handle** at top of every panel
- **Three snap points:** peek (30%), half (50%), full (85%)
- Swipe down to dismiss, or tap dimmed backdrop
- Panels remember last snap point per session
- One panel at a time — new panel replaces current
- Backdrop dims terminal to 40% opacity

### Panel: Sessions

Opened by tapping `[api-srv ▼]` in status bar.

- Session cards: name, path, status, last activity
- Active session: accent-colored left border
- Tap card → switch to session, panel auto-dismisses
- Swipe card left → red delete button slides in (iOS-style)
- `[+ New]` opens new session flow

### Panel: Logs

- Filter chips: All / Agent / Bridge (tap to toggle)
- Native scrolling div (not xterm) — text selection & copy work naturally
- Stderr lines: red background tint
- Timestamps dimmed, service labels color-coded
- Auto-scroll toggle + Clear button pinned at bottom
- Pull-to-refresh gesture

### Panel: Services

- Compact service cards with status dot, PID, uptime
- Action buttons: Stop, Restart (48px height touch targets)
- Bridge card: extra Re-link QR button
- Platform pause toggles (see section 6)
- Rebuild & Restart All at bottom with confirmation

### Panel: Messages (Bridge History)

- **Chat-bubble style** instead of table — much more readable on mobile
- Session picker dropdown at top
- Messages show source icon (WhatsApp/Telegram/Dashboard)
- Long messages truncated with "tap to expand"
- Native scroll

### Panel: Audit

- Scrollable event list with timestamp, event, source, detail
- Blocked events highlighted in red
- Pull-to-refresh

### Panel Launcher (Mobile)

Swipe up from below input bar reveals mini launcher:

```
┌──────────────────────────────────┐
│   [📋 Sessions] [📊 Logs]       │
│   [⚙ Services] [💬 Messages]    │
│   [📜 Audit]                     │
└──────────────────────────────────┘
```

---

## 6. Platform Pause Toggles

Per-platform "Do Not Disturb" for WhatsApp and Telegram.

### Status Bar (always visible)

```
[● api-srv ▼]   📱 💬   [⛶] [⚡]
                 ↑   ↑
             WhatsApp  Telegram
```

- Green/lit = messages flowing
- Dimmed/strikethrough = paused
- Single tap toggles (instant, reversible)
- Claude keeps running — responses just aren't forwarded to paused platforms

### Services Panel (detailed)

```
Bridge         ● Running

WhatsApp    [● Active ━━━○ ]     ← toggle switch
Telegram    [○ ━━━━━ Paused]     ← greyed out
```

### Message Queuing

Messages sent while paused are **queued**. When un-paused, queued messages flush as a batch. No messages lost.

---

## 7. Desktop Adaptations

### Sidebar

- **Collapsed:** icon rail (48px wide), hover shows tooltip
- **Expanded:** 280px panel renders beside terminal, terminal resizes
- Toggle via click or `[` hotkey
- Same panel content as mobile

### Keyboard Shortcuts

| Key | Action |
|---|---|
| `1`–`5` | Open sidebar panel 1–5 |
| `Esc` | Close panel / exit fullscreen |
| `Ctrl+K` / `Cmd+K` | Command palette |
| `F11` / `Cmd+Enter` | Toggle fullscreen |
| `[` | Toggle sidebar |

### Command Palette

Opens as centered overlay (VS Code style) instead of slide-up.

### Platform Toggles

Visible in header bar alongside service status dots.

---

## 8. New Session Flow (Mobile)

Panel slides up to 85% (full snap):

- **Recent projects:** 2-column grid of tappable cards (most-used first, localStorage)
- Tap recent → auto-fills path + name, one more tap to create
- **Folder browser:** breadcrumb navigation with large tap targets
- Git repos badged and sorted to top
- **Session name:** auto-fills from folder name, editable
- Two large buttons: Cancel + Create

---

## 9. Animations & Polish

### Panel Transitions

- Spring animation (not linear) — quick overshoot then settle
- Open: 300ms, Close: 200ms (snappier)
- Backdrop fades in sync with panel position
- Panel follows finger during drag — `requestAnimationFrame` driven
- Snap points have magnetic pull (velocity + position based)

### Quick-Action Buttons

- Context change: cross-fade 200ms
- New buttons scale up 0.8 → 1.0 with slight bounce
- Fixed row height — no layout shift

### Terminal

- No animations on terminal content (must feel instant)
- Fullscreen toggle: 250ms ease-out scale
- Session switch: 150ms fade-through

### Haptic Feedback

Uses `navigator.vibrate()` (graceful no-op on unsupported devices):
- Light tap: quick-action buttons
- Medium tap: panel snap points
- Double-pulse: mode toggles (YOLO, platform pause)

### Micro-Interactions

- Status badge pulses when session needs attention (CSS animation)
- Command palette items: subtle press-down scale (0.97) on touch
- Swipe-to-delete: spring-animated red reveal
- Pull-to-refresh on logs panel
- Toast notifications: slide down from top, auto-dismiss 3s

### Loading States

- Skeleton screens with shimmer (not spinners)
- Terminal connecting: pulsing cursor
- Command palette: instant open, real-time filter

---

## 10. Architecture Notes (for implementation)

### File Structure (proposed)

```
packages/dashboard/public/
├── index.html          → Minimal shell, loads app
├── manifest.json       → PWA manifest (NEW)
├── sw.js               → Service worker (NEW)
├── icons/              → PWA icons (NEW)
├── css/
│   ├── variables.css   → Design tokens, breakpoints
│   ├── layout.css      → Grid, panels, status bar
│   ├── terminal.css    → xterm overrides, fullscreen
│   ├── panels.css      → Slide-up panels, drawer
│   ├── palette.css     → Command palette styles
│   └── animations.css  → Transitions, haptics
├── js/
│   ├── app.js          → Main entry, router, state
│   ├── terminal.js     → xterm.js wrapper, touch handling
│   ├── panels.js       → Panel system, gestures, snap points
│   ├── palette.js      → Command palette, search, categories
│   ├── sessions.js     → Session management, drawer
│   ├── input-bar.js    → Input, command history, keyboard handling
│   └── platform.js     → Platform toggles, pause/queue
```

### Dual-Mode Future-Proofing

The terminal view should be abstracted behind a simple interface:

```typescript
interface TerminalView {
  write(data: string): void;
  clear(): void;
  focus(): void;
  resize(cols: number, rows: number): void;
  onInput(callback: (data: string) => void): void;
  getElement(): HTMLElement;
}
```

xterm.js implements this now. A future formatted/chat view can implement the same interface and be swapped in via the toggle without touching any other code.

### Context Detection (for quick-action buttons)

PTY output parsed for patterns:
- `[Y/n]` or `(y/N)` → approval state
- `❯` or `>` prompt character → idle state
- `●` bullets / `⧉` tabs → interactive picker state
- No prompt detected + output streaming → running state

Reuses patterns from the existing state machine classifier work.
