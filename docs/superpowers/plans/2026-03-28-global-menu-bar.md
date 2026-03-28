# Global Menu Bar & Dev Tools Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent bottom tab bar with Settings drawer, confirm-leave dialog, dev tools drawer, and dev mode toggle across all app phases.

**Architecture:** An `AppShell` layout route wraps all pages, providing the TabBar, drawers, and confirm dialog. Settings state is promoted to uiStore. The existing `app-shell`/`app-frame` CSS classes remain but are moved into AppShell's JSX.

**Tech Stack:** React 18, React Router v7 (layout routes), Zustand, Tailwind CSS, Vitest + React Testing Library

**Spec:** `docs/superpowers/specs/2026-03-28-global-menu-bar-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/stores/uiStore.ts` | Modify | Add `devMode`, `colorblindMode`, `hapticEnabled` state + toggles with localStorage persistence |
| `src/components/ConfirmLeaveDialog.tsx` | Create | Modal dialog for confirming navigation away from active game/queue |
| `src/components/SettingsContent.tsx` | Create | Extracted settings form sections (shared by drawer and page) |
| `src/components/SettingsDrawer.tsx` | Create | Slide-up drawer that renders SettingsContent |
| `src/components/DevDrawer.tsx` | Create | Slide-up drawer with phase jump, animation triggers, debug tools |
| `src/components/TabBar.tsx` | Create | Bottom tab bar with 4 tabs, active-game detection, drawer triggers |
| `src/components/AppShell.tsx` | Create | Layout route wrapper: Outlet + TabBar + drawers + confirm dialog |
| `src/pages/Settings.tsx` | Modify | Use SettingsContent, remove Back button |
| `src/pages/MainMenu.tsx` | Modify | Add Dev Mode button, remove Settings button |
| `src/App.tsx` | Modify | Wrap routes in AppShell layout route, move app-shell/app-frame into AppShell |
| `src/pages/Leaderboard.tsx` | Modify | Remove Back button/header |
| `src/pages/Profile.tsx` | Modify | Remove Back button/header |
| `src/pages/RecipeBook.tsx` | Modify | Remove Back button/header |
| `src/pages/Collection.tsx` | Modify | Remove Back button/header |

---

## Chunk 1: Foundation (uiStore + ConfirmLeaveDialog)

### Task 1: Extend uiStore with devMode, colorblindMode, hapticEnabled

**Files:**
- Modify: `packages/client/src/stores/uiStore.ts`

- [ ] **Step 1: Add new state fields and methods to UIStore interface**

Add after `uiVolume: number;` (line 23):

```typescript
devMode: boolean;
colorblindMode: 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia';
hapticEnabled: boolean;
```

Add after `setVolume` in the interface (line 31):

```typescript
toggleDevMode: () => void;
setColorblindMode: (mode: 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia') => void;
setHapticEnabled: (enabled: boolean) => void;
```

- [ ] **Step 2: Add initial state and method implementations**

Add after `uiVolume` initial value (line 42):

```typescript
devMode: (() => { try { return localStorage.getItem('alloy:devMode') === 'true'; } catch { return false; } })(),
colorblindMode: (() => { try { return (localStorage.getItem('alloy:colorblindMode') as UIStore['colorblindMode']) ?? 'none'; } catch { return 'none' as const; } })(),
hapticEnabled: (() => { try { return localStorage.getItem('alloy:hapticEnabled') !== 'false'; } catch { return true; } })(),
```

Add after `setVolume` implementation (after line 68):

```typescript
toggleDevMode: () => set((s) => {
  const next = !s.devMode;
  try { localStorage.setItem('alloy:devMode', String(next)); } catch { /* noop */ }
  return { devMode: next };
}),
setColorblindMode: (mode) => {
  try { localStorage.setItem('alloy:colorblindMode', mode); } catch { /* noop */ }
  set({ colorblindMode: mode });
},
setHapticEnabled: (enabled) => {
  try { localStorage.setItem('alloy:hapticEnabled', String(enabled)); } catch { /* noop */ }
  set({ hapticEnabled: enabled });
},
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project packages/client/tsconfig.json 2>&1 | grep uiStore`
Expected: No new errors related to uiStore

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/stores/uiStore.ts
git commit -m "feat(ui): add devMode, colorblindMode, hapticEnabled to uiStore with localStorage persistence"
```

---

### Task 2: Create ConfirmLeaveDialog

**Files:**
- Create: `packages/client/src/components/ConfirmLeaveDialog.tsx`
- Create: `packages/client/src/components/__tests__/ConfirmLeaveDialog.test.tsx`

- [ ] **Step 1: Write the test file**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmLeaveDialog } from '../ConfirmLeaveDialog';

describe('ConfirmLeaveDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmLeaveDialog open={false} onClose={vi.fn()} onConfirm={vi.fn()} />,
    );
    // dialog exists in DOM but is not visible (native dialog behavior)
    expect(container.querySelector('dialog')).toBeTruthy();
  });

  it('shows leave confirmation text when open', () => {
    render(
      <ConfirmLeaveDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(screen.getByText('Leave match?')).toBeTruthy();
    expect(screen.getByText(/Leaving will forfeit/)).toBeTruthy();
  });

  it('calls onClose when Stay is clicked', async () => {
    const onClose = vi.fn();
    render(
      <ConfirmLeaveDialog open={true} onClose={onClose} onConfirm={vi.fn()} />,
    );
    await userEvent.click(screen.getByText('Stay'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onConfirm when Leave is clicked', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmLeaveDialog open={true} onClose={vi.fn()} onConfirm={onConfirm} />,
    );
    await userEvent.click(screen.getByText('Leave'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('shows queue-specific message when variant is queue', () => {
    render(
      <ConfirmLeaveDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} variant="queue" />,
    );
    expect(screen.getByText(/cancel matchmaking/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/client/src/components/__tests__/ConfirmLeaveDialog.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the ConfirmLeaveDialog component**

```tsx
import { Modal } from './Modal';

interface ConfirmLeaveDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  variant?: 'match' | 'queue';
}

export function ConfirmLeaveDialog({ open, onClose, onConfirm, variant = 'match' }: ConfirmLeaveDialogProps) {
  const body = variant === 'queue'
    ? "You're searching for an opponent. Leaving will cancel matchmaking."
    : "You're in an active game. Leaving will forfeit the match.";

  return (
    <Modal open={open} onClose={onClose} title="Leave match?">
      <p className="mb-4 text-sm text-surface-300">{body}</p>
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 rounded-lg border border-surface-500 bg-surface-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-surface-500"
        >
          Stay
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500"
        >
          Leave
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/client/src/components/__tests__/ConfirmLeaveDialog.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/ConfirmLeaveDialog.tsx packages/client/src/components/__tests__/ConfirmLeaveDialog.test.tsx
git commit -m "feat(ui): add ConfirmLeaveDialog component with tests"
```

---

## Chunk 2: Settings Extraction + Drawers

### Task 3: Extract SettingsContent from Settings page

**Files:**
- Create: `packages/client/src/components/SettingsContent.tsx`
- Modify: `packages/client/src/pages/Settings.tsx`

- [ ] **Step 1: Create SettingsContent component**

Extract the form sections from `Settings.tsx` into a standalone component. This component uses `uiStore` for all state (including the newly promoted `colorblindMode` and `hapticEnabled`). Copy the `VolumeSlider` and `ToggleRow` helper components into `SettingsContent.tsx` as module-private functions.

```tsx
import { useUIStore } from '@/stores/uiStore';
import { playSound } from '@/shared/utils/sound-manager';

export function SettingsContent() {
  const {
    isMuted, showDebug, toggleMute, toggleDebug,
    masterVolume, sfxVolume, uiVolume, setVolume,
    colorblindMode, setColorblindMode,
    hapticEnabled, setHapticEnabled,
  } = useUIStore();

  return (
    <div className="flex flex-col gap-6">
      {/* Colorblind Mode */}
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-surface-300">
          Accessibility
        </h3>
        <div className="rounded-lg border border-surface-600 bg-surface-800 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
          <label className="mb-2 block text-sm font-medium text-white">
            Colorblind Mode
          </label>
          <select
            value={colorblindMode}
            onChange={(e) => setColorblindMode(e.target.value as typeof colorblindMode)}
            className="w-full rounded-lg border border-surface-600 bg-surface-700 px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none"
          >
            <option value="none">None</option>
            <option value="deuteranopia">Deuteranopia (Red-Green)</option>
            <option value="protanopia">Protanopia (Red-Green)</option>
            <option value="tritanopia">Tritanopia (Blue-Yellow)</option>
          </select>
        </div>
      </section>

      {/* Haptic Feedback */}
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-surface-300">
          Feedback
        </h3>
        <div className="rounded-lg border border-surface-600 bg-surface-800 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
          <ToggleRow
            label="Haptic Feedback"
            description="Vibration on interactions"
            enabled={hapticEnabled}
            onToggle={() => setHapticEnabled(!hapticEnabled)}
          />
        </div>
      </section>

      {/* Audio */}
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-surface-300">
          Audio
        </h3>
        <div className="flex flex-col gap-4 rounded-lg border border-surface-600 bg-surface-800 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
          <VolumeSlider label="Master Volume" value={masterVolume} onChange={(v) => { setVolume('master', v / 100); playSound('buttonClick'); }} />
          <VolumeSlider label="SFX Volume" value={sfxVolume} onChange={(v) => { setVolume('sfx', v / 100); playSound('orbPlace'); }} />
          <VolumeSlider label="UI Sounds" value={uiVolume} onChange={(v) => { setVolume('ui', v / 100); playSound('buttonClick'); }} />
          <div className="border-t border-surface-600 pt-4">
            <ToggleRow label="Mute Sound" description="Disable all game audio" enabled={isMuted} onToggle={toggleMute} />
          </div>
        </div>
      </section>

      {/* Developer */}
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-surface-300">
          Developer
        </h3>
        <div className="rounded-lg border border-surface-600 bg-surface-800 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
          <ToggleRow label="Debug Mode" description="Show debug overlays and logging" enabled={showDebug} onToggle={toggleDebug} />
        </div>
      </section>
    </div>
  );
}

function VolumeSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white">{label}</span>
        <span className="text-xs tabular-nums text-surface-300">{pct}%</span>
      </div>
      <input
        type="range" min={0} max={100} value={pct}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-600
          [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-accent-400 [&::-webkit-slider-thumb]:shadow-[0_0_4px_rgba(0,0,0,0.4)]
          [&::-webkit-slider-thumb]:hover:bg-accent-300
          [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4
          [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0
          [&::-moz-range-thumb]:bg-accent-400 [&::-moz-range-thumb]:shadow-[0_0_4px_rgba(0,0,0,0.4)]
          [&::-moz-range-thumb]:hover:bg-accent-300
          [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-surface-700"
      />
    </div>
  );
}

function ToggleRow({ label, description, enabled, onToggle }: { label: string; description: string; enabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="text-xs text-surface-300">{description}</div>
      </div>
      <button
        onClick={onToggle}
        className={`relative h-6 w-11 rounded-full transition-colors ${enabled ? 'bg-accent-500' : 'bg-surface-600'}`}
      >
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Simplify Settings.tsx to use SettingsContent**

Replace entire Settings.tsx content with:

```tsx
import { SettingsContent } from '@/components/SettingsContent';

export function Settings() {
  return (
    <div className="page-enter flex h-full flex-col overflow-y-auto p-4">
      <header className="mb-6">
        <h2 className="text-lg font-bold text-accent-400">Settings</h2>
      </header>
      <SettingsContent />
    </div>
  );
}
```

Note: Back button removed — tab bar handles navigation. `useNavigate` import removed.

- [ ] **Step 3: Verify TypeScript compiles and app renders**

Run: `npx tsc --noEmit --project packages/client/tsconfig.json 2>&1 | grep -E "(SettingsContent|Settings\.tsx)"`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/SettingsContent.tsx packages/client/src/pages/Settings.tsx
git commit -m "refactor(settings): extract SettingsContent, use uiStore for all settings state"
```

---

### Task 4: Create SettingsDrawer

**Files:**
- Create: `packages/client/src/components/SettingsDrawer.tsx`

- [ ] **Step 1: Write the SettingsDrawer component**

Important: Drawers must use `absolute` positioning (not `fixed`) so they stay within the `app-frame` container. `fixed` would escape the 9:16 frame on desktop viewports.

```tsx
import { SettingsContent } from './SettingsContent';

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDrawer({ open, onClose }: SettingsDrawerProps) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-40 bg-black/50"
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        className="absolute inset-x-0 bottom-[46px] z-50 flex flex-col rounded-t-2xl border-t border-surface-500 bg-surface-800"
        style={{
          maxHeight: '60%',
          animation: 'drawer-up 0.25s ease-out',
        }}
      >
        {/* Handle bar */}
        <div className="flex justify-center py-2">
          <div className="h-1 w-10 rounded-full bg-surface-500" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2">
          <h2
            className="text-base font-bold text-accent-400"
            style={{ fontFamily: 'var(--font-family-display)' }}
          >
            Settings
          </h2>
          <button
            onClick={onClose}
            className="text-sm text-surface-300 hover:text-white"
          >
            Done
          </button>
        </div>
        {/* Content */}
        <div className="overflow-y-auto px-4 pb-4">
          <SettingsContent />
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Add drawer-up keyframe to index.css**

Add after the existing `@keyframes fade-in` block (around line 93 of `packages/client/src/index.css`). Note: `slide-up` already exists (line 85) for small element animations. This is a different full-panel animation so it gets a distinct name.

```css
@keyframes drawer-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project packages/client/tsconfig.json 2>&1 | grep SettingsDrawer`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/SettingsDrawer.tsx packages/client/src/index.css
git commit -m "feat(ui): add SettingsDrawer with slide-up animation"
```

---

### Task 5: Create DevDrawer

**Files:**
- Create: `packages/client/src/components/DevDrawer.tsx`

- [ ] **Step 1: Write the DevDrawer component**

```tsx
import { useNavigate } from 'react-router';
import { useMatchStore } from '@/stores/matchStore';
import { useUIStore } from '@/stores/uiStore';

interface DevDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function DevDrawer({ open, onClose }: DevDrawerProps) {
  const navigate = useNavigate();
  const { startLocalMatch } = useMatchStore();
  const { showDebug, toggleDebug } = useUIStore();

  if (!open) return null;

  // TODO: Currently all phase jumps start at draft — skipping to a specific
  // phase requires engine support to fast-forward match state. For now this
  // is still useful: it creates a fresh match quickly without going through
  // the matchmaking flow.
  const jumpToPhase = (_phase: string) => {
    try {
      const seed = 42; // Fixed seed for reproducibility
      startLocalMatch(seed, 'ranked', 3);
      const code = 'ai-' + Math.random().toString(36).substring(2, 8);
      navigate(`/match/${code}`);
      onClose();
    } catch (err) {
      console.error('Dev jump failed:', err);
    }
  };

  const handleReset = () => {
    navigate('/');
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="absolute inset-0 z-40 bg-black/50" onClick={onClose} />
      {/* Drawer */}
      <div
        className="absolute inset-x-0 bottom-[46px] z-50 flex flex-col rounded-t-2xl border-t border-surface-500 bg-surface-800"
        style={{ maxHeight: '60%', animation: 'drawer-up 0.25s ease-out' }}
      >
        {/* Handle bar */}
        <div className="flex justify-center py-2">
          <div className="h-1 w-10 rounded-full bg-surface-500" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2">
          <h2
            className="text-base font-bold text-green-400"
            style={{ fontFamily: 'var(--font-family-display)' }}
          >
            Dev Tools
          </h2>
          <button onClick={onClose} className="text-sm text-surface-300 hover:text-white">
            Done
          </button>
        </div>
        {/* Content */}
        <div className="overflow-y-auto px-4 pb-4">
          <div className="flex flex-col gap-4">
            {/* Jump to Phase */}
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-surface-300">
                Jump to Phase
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {['draft', 'forge', 'duel', 'adapt', 'postmatch'].map((phase) => (
                  <button
                    key={phase}
                    onClick={() => jumpToPhase(phase)}
                    className="rounded-lg border border-surface-500 bg-surface-700 px-3 py-2 text-xs font-semibold capitalize text-white transition-colors hover:border-green-500 hover:bg-surface-600"
                  >
                    {phase}
                  </button>
                ))}
              </div>
            </section>

            {/* Animations */}
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-surface-300">
                Animations
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {['Swoop', 'Phase Transition', 'Celebration'].map((name) => (
                  <button
                    key={name}
                    onClick={() => console.log(`[Dev] Trigger: ${name}`)}
                    className="rounded-lg border border-surface-500 bg-surface-700 px-3 py-2 text-xs font-semibold text-white transition-colors hover:border-green-500 hover:bg-surface-600"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </section>

            {/* Debug */}
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-surface-300">
                Debug
              </h3>
              <div className="rounded-lg border border-surface-600 bg-surface-800 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">Debug Overlays</div>
                    <div className="text-xs text-surface-300">Show debug info on screen</div>
                  </div>
                  <button
                    onClick={toggleDebug}
                    className={`relative h-6 w-11 rounded-full transition-colors ${showDebug ? 'bg-green-500' : 'bg-surface-600'}`}
                  >
                    <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${showDebug ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            </section>

            {/* Reset */}
            <section>
              <button
                onClick={handleReset}
                className="w-full rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/20"
              >
                Reset & Return Home
              </button>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
```

Note: Animation triggers are placeholder `console.log` for now — they'll be wired up once we know which animation hooks are accessible from outside phase components. The jump-to-phase creates a real AI match and navigates; skipping to a specific phase would require engine support to fast-forward state, so for now it starts at draft.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project packages/client/tsconfig.json 2>&1 | grep DevDrawer`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/DevDrawer.tsx
git commit -m "feat(dev): add DevDrawer with phase jump, animation triggers, debug tools"
```

---

## Chunk 3: TabBar + AppShell + Wiring

### Task 6: Create TabBar

**Files:**
- Create: `packages/client/src/components/TabBar.tsx`
- Create: `packages/client/src/components/__tests__/TabBar.test.tsx`

- [ ] **Step 1: Write the test file**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { TabBar } from '../TabBar';

// Mock uiStore
vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn(() => ({ devMode: false })),
}));

const defaultProps = {
  onSettingsOpen: vi.fn(),
  onDevOpen: vi.fn(),
  onConfirmLeave: vi.fn(),
  isInActiveGame: false,
  isInQueue: false,
};

function renderTabBar(props = {}) {
  return render(
    <MemoryRouter>
      <TabBar {...defaultProps} {...props} />
    </MemoryRouter>,
  );
}

describe('TabBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Home, Ranks, and Settings tabs', () => {
    renderTabBar();
    expect(screen.getByLabelText('Home')).toBeTruthy();
    expect(screen.getByLabelText('Ranks')).toBeTruthy();
    expect(screen.getByLabelText('Settings')).toBeTruthy();
  });

  it('hides Dev tab when devMode is false', () => {
    renderTabBar();
    expect(screen.queryByLabelText('Dev')).toBeNull();
  });

  it('shows Dev tab when devMode is true', async () => {
    const { useUIStore } = await import('@/stores/uiStore');
    (useUIStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ devMode: true });
    renderTabBar();
    expect(screen.getByLabelText('Dev')).toBeTruthy();
  });

  it('calls onSettingsOpen when Settings tab is clicked', async () => {
    const onSettingsOpen = vi.fn();
    renderTabBar({ onSettingsOpen });
    await userEvent.click(screen.getByLabelText('Settings'));
    expect(onSettingsOpen).toHaveBeenCalledOnce();
  });

  it('calls onConfirmLeave instead of navigating when in active game', async () => {
    const onConfirmLeave = vi.fn();
    renderTabBar({ isInActiveGame: true, onConfirmLeave });
    await userEvent.click(screen.getByLabelText('Home'));
    expect(onConfirmLeave).toHaveBeenCalledWith('/');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/client/src/components/__tests__/TabBar.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the TabBar component**

```tsx
import { useNavigate, useLocation } from 'react-router';
import { useUIStore } from '@/stores/uiStore';

interface TabBarProps {
  onSettingsOpen: () => void;
  onDevOpen: () => void;
  onConfirmLeave: (destination: string) => void;
  isInActiveGame: boolean;
  isInQueue: boolean;
}

export function TabBar({ onSettingsOpen, onDevOpen, onConfirmLeave, isInActiveGame, isInQueue }: TabBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { devMode } = useUIStore();
  const showDev = devMode || import.meta.env.DEV;

  const handleNavTab = (path: string) => {
    if (isInActiveGame || isInQueue) {
      onConfirmLeave(path);
    } else {
      navigate(path);
    }
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <div
      style={{
        height: 46,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        background: 'linear-gradient(180deg, #1a1d25, #12141a)',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.5)',
        position: 'relative',
        zIndex: 30,
      }}
    >
      {/* Gold top edge */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(212,168,52,0.4), transparent)',
        }}
      />

      <TabButton
        label="Home"
        icon={<HomeIcon />}
        active={isActive('/')}
        onClick={() => handleNavTab('/')}
        color="#d4a834"
      />
      <TabButton
        label="Ranks"
        icon={<RanksIcon />}
        active={isActive('/leaderboard')}
        onClick={() => handleNavTab('/leaderboard')}
        color="#d4a834"
      />
      <TabButton
        label="Settings"
        icon={<SettingsIcon />}
        active={false}
        onClick={onSettingsOpen}
        color="#d4a834"
      />
      {showDev && (
        <TabButton
          label="Dev"
          icon={<DevIcon />}
          active={false}
          onClick={onDevOpen}
          color="#22c55e"
        />
      )}
    </div>
  );
}

function TabButton({ label, icon, active, onClick, color }: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  color: string;
}) {
  const strokeColor = active ? color : '#6b7280';
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="flex flex-col items-center gap-[2px] border-0 bg-transparent"
      style={{ padding: '6px 12px', position: 'relative', cursor: 'pointer' }}
    >
      {active && (
        <div
          style={{
            position: 'absolute',
            top: -1,
            width: 24,
            height: 2,
            borderRadius: 1,
            background: color,
            boxShadow: `0 0 8px ${color}60`,
          }}
        />
      )}
      <div style={{ color: strokeColor, display: 'flex' }}>{icon}</div>
      {active && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: strokeColor,
            letterSpacing: '0.05em',
            fontFamily: 'var(--font-family-display)',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
      )}
    </button>
  );
}

// --- SVG Icons (18px, stroke-based) ---

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function RanksIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 21h8M12 17v4M17 5H7a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function DevIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/client/src/components/__tests__/TabBar.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/TabBar.tsx packages/client/src/components/__tests__/TabBar.test.tsx
git commit -m "feat(ui): add TabBar component with active-game guard and dev tab"
```

---

### Task 7: Create AppShell and wire everything together

**Files:**
- Create: `packages/client/src/components/AppShell.tsx`
- Modify: `packages/client/src/App.tsx`

- [ ] **Step 1: Write the AppShell component**

Note: `app-frame` has `overflow: hidden` and `position: relative`, so drawers use `absolute` positioning to stay within the frame. The TabBar is in-flow (flex child), so no `paddingBottom` is needed on `<main>` — the flex layout handles it. Pages that need scrolling already set `overflow-y-auto` on their own root div.

```tsx
import { useState, useCallback, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { TabBar } from './TabBar';
import { SettingsDrawer } from './SettingsDrawer';
import { DevDrawer } from './DevDrawer';
import { ConfirmLeaveDialog } from './ConfirmLeaveDialog';

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDestination, setPendingDestination] = useState('/');

  // Active game: on /match/:code route (PhaseRouter handles phase detection)
  // We treat any /match/ route where phase !== 'complete' as active.
  // Since we can't easily read phase from here without gateway context,
  // we use a simpler heuristic: /match/ route = active game.
  // PostMatch will still show the confirm — acceptable trade-off for simplicity.
  const isInMatch = location.pathname.startsWith('/match/');
  const isInQueue = location.pathname === '/queue';
  const isInActiveGame = isInMatch;

  const confirmVariant = isInQueue ? 'queue' : 'match';

  // Close drawers on route change
  useEffect(() => {
    setSettingsOpen(false);
    setDevOpen(false);
  }, [location.pathname]);

  const handleConfirmLeave = useCallback((destination: string) => {
    setPendingDestination(destination);
    setConfirmOpen(true);
  }, []);

  const handleConfirmAccept = useCallback(() => {
    setConfirmOpen(false);
    navigate(pendingDestination);
  }, [navigate, pendingDestination]);

  return (
    <div className="app-shell">
      <div className="app-frame">
        <main className="flex-1">
          <Outlet />
        </main>

        <TabBar
          onSettingsOpen={() => { setDevOpen(false); setSettingsOpen(true); }}
          onDevOpen={() => { setSettingsOpen(false); setDevOpen(true); }}
          onConfirmLeave={handleConfirmLeave}
          isInActiveGame={isInActiveGame}
          isInQueue={isInQueue}
        />

        <SettingsDrawer
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />

        <DevDrawer
          open={devOpen}
          onClose={() => setDevOpen(false)}
        />

        <ConfirmLeaveDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={handleConfirmAccept}
          variant={confirmVariant}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update App.tsx to use AppShell as layout route**

Replace `App.tsx` content with:

```tsx
import { Routes, Route, Navigate, useParams } from 'react-router';
import { AppShell } from './components/AppShell';
import { MainMenu } from './pages/MainMenu';
import { Matchmaking } from './pages/Matchmaking';
import { PhaseRouter } from './pages/PhaseRouter';
import { Profile } from './pages/Profile';
import { RecipeBook } from './pages/RecipeBook';
import { Collection } from './pages/Collection';
import { Leaderboard } from './pages/Leaderboard';
import { Settings } from './pages/Settings';
import { useAudioUnlock } from './hooks/useAudioUnlock';
import { useRouteSound } from './hooks/useRouteSound';

function MatchRedirect() {
  const { code } = useParams<{ code: string }>();
  return <Navigate to={`/match/${code}`} replace />;
}

export function App() {
  useAudioUnlock();
  useRouteSound();

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<MainMenu />} />
        <Route path="/queue" element={<Matchmaking />} />
        <Route path="/match/:code" element={<PhaseRouter />} />
        <Route path="/match/:code/*" element={<MatchRedirect />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/recipes" element={<RecipeBook />} />
        <Route path="/collection" element={<Collection />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
```

Key changes:
- Removed `app-shell`/`app-frame` divs (moved into AppShell)
- All routes wrapped in `<Route element={<AppShell />}>` layout route
- Same route paths, just nested under AppShell

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project packages/client/tsconfig.json 2>&1 | grep -E "(AppShell|App\.tsx)"`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/AppShell.tsx packages/client/src/App.tsx
git commit -m "feat(ui): add AppShell layout route with TabBar, drawers, and confirm dialog"
```

---

### Task 8: Update MainMenu — add Dev Mode button, remove Settings button

**Files:**
- Modify: `packages/client/src/pages/MainMenu.tsx`

- [ ] **Step 1: Update MainMenu**

Replace `MainMenu.tsx` content with:

```tsx
import { useNavigate } from 'react-router';
import { useUIStore } from '@/stores/uiStore';

export function MainMenu() {
  const navigate = useNavigate();
  const { devMode, toggleDevMode } = useUIStore();

  return (
    <div className="page-enter flex h-full flex-col items-center justify-center gap-10 p-6">
      {/* Title with atmospheric glow */}
      <div className="relative text-center">
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-30 blur-3xl"
          style={{
            width: 300,
            height: 200,
            background: 'radial-gradient(ellipse, rgba(212, 168, 52, 0.4), transparent 70%)',
          }}
        />
        <h1
          className="relative text-6xl font-bold tracking-[0.08em]"
          style={{
            fontFamily: 'var(--font-family-display)',
            color: 'var(--color-accent-400)',
            textShadow: '0 0 40px rgba(212, 168, 52, 0.3), 0 2px 4px rgba(0, 0, 0, 0.5)',
          }}
        >
          ALLOY
        </h1>
        <p
          className="relative mt-2 text-sm tracking-widest"
          style={{ color: 'var(--color-bronze-400)', fontFamily: 'var(--font-family-body)' }}
        >
          Forge. Fight. Prevail.
        </p>
      </div>

      {/* Buttons — vertical stack */}
      <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          onClick={() => navigate('/queue')}
          className="rounded-lg bg-gradient-to-b from-accent-400 to-accent-500 px-6 py-4 text-lg font-bold tracking-wide text-surface-900 active:translate-y-px active:scale-[0.98]"
          style={{
            fontFamily: 'var(--font-family-display)',
            boxShadow: '0 4px 16px rgba(212, 168, 52, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
            letterSpacing: '0.06em',
          }}
        >
          PLAY
        </button>

        {[
          { label: 'Recipe Book', path: '/recipes' },
          { label: 'Collection', path: '/collection' },
          { label: 'Leaderboard', path: '/leaderboard' },
          { label: 'Profile', path: '/profile' },
        ].map(({ label, path }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="rounded-lg border border-surface-500 bg-surface-700 px-5 py-3 font-semibold text-white transition-all hover:border-surface-400 hover:bg-surface-600 active:translate-y-px active:scale-[0.98]"
            style={{
              fontFamily: 'var(--font-family-display)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              letterSpacing: '0.03em',
            }}
          >
            {label}
          </button>
        ))}

        {/* Dev Mode toggle */}
        <button
          onClick={toggleDevMode}
          className={`rounded-lg border px-5 py-2 text-sm font-medium transition-all active:translate-y-px ${
            devMode
              ? 'border-green-500/40 bg-green-500/10 text-green-400'
              : 'border-surface-600 bg-surface-800 text-surface-400 hover:border-surface-500 hover:bg-surface-700'
          }`}
          style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '0.03em' }}
        >
          {devMode ? '● Dev Mode On' : 'Dev Mode'}
        </button>
      </div>
    </div>
  );
}
```

Changes from original:
- Removed Settings button (tab bar handles it)
- Added Dev Mode toggle button at bottom
- Added `useUIStore` import for `devMode` / `toggleDevMode`

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project packages/client/tsconfig.json 2>&1 | grep MainMenu`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/MainMenu.tsx
git commit -m "feat(ui): add Dev Mode toggle to MainMenu, remove Settings button"
```

---

### Task 9: Remove Back buttons from secondary pages

**Files:**
- Modify: `packages/client/src/pages/Leaderboard.tsx`
- Modify: `packages/client/src/pages/Profile.tsx`
- Modify: `packages/client/src/pages/RecipeBook.tsx`
- Modify: `packages/client/src/pages/Collection.tsx`

- [ ] **Step 1: Read each file to identify Back button patterns**

Read the header/back-button sections of each file. They likely follow the same pattern as Settings.tsx:
```tsx
<header className="mb-6 flex items-center justify-between">
  <h2>...</h2>
  <button onClick={() => navigate('/')}>Back</button>
</header>
```

- [ ] **Step 2: Remove Back buttons from each page**

For each file, remove the Back button from the header. Keep the `<h2>` title. Remove the `useNavigate` import if it's no longer used by anything else in the file.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project packages/client/tsconfig.json 2>&1 | grep -E "(Leaderboard|Profile|RecipeBook|Collection)\.tsx"`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/pages/Leaderboard.tsx packages/client/src/pages/Profile.tsx packages/client/src/pages/RecipeBook.tsx packages/client/src/pages/Collection.tsx
git commit -m "refactor(ui): remove per-page Back buttons — tab bar handles navigation"
```

---

## Chunk 4: Manual Testing & Polish

### Task 10: Manual verification and polish

- [ ] **Step 1: Start dev server and verify**

Run: `cd packages/client && npx vite dev`

Verify each scenario:
1. Tab bar visible on all pages
2. Home/Ranks navigation works from main menu
3. Settings drawer opens and closes via tab bar
4. Dev mode toggle on main menu shows/hides Dev tab
5. Dev drawer opens with phase jump buttons
6. During a match, Home/Ranks taps show confirm dialog
7. "Stay" closes dialog, "Leave" navigates away
8. Settings drawer works during active game without losing game state
9. Tab bar gold accent and active indicator render correctly
10. Content not obscured by tab bar (46px bottom padding)

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run --project client`
Expected: All tests pass (including new ConfirmLeaveDialog and TabBar tests)

- [ ] **Step 3: Fix any issues found**

Address any rendering glitches, z-index conflicts, or test failures.

- [ ] **Step 4: Final commit if any polish changes were made**

```bash
git add -A
git commit -m "fix(ui): polish tab bar and drawers after manual testing"
```
