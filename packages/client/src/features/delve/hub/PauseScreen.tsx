import { memo, useRef, useState } from 'react';
import type { BiomeDef, DiveState } from '@alloy/engine';
import { ControlsPanel } from '@/features/controls/ControlsPanel';
import { Button, Footer, Glyph, Header, Screen, usePrompts, type Prompt } from '../kit';
import { useHubTabs } from './AnvilHub';
import { SettingsPanel } from './SettingsPanel';
import type { HubLink } from './types';

// hub/PauseScreen.tsx (3D) — 3E renders it from DelveRun while menuOpen
export interface PauseScreenProps {
  dive: DiveState;
  biome: BiomeDef;
  foesLeft: number;
  link?: HubLink; // the Found log's item, or { tab: 'quests' } from the journal
  /** Over the stop: back from the Anvil, the dive is still at the stop (nothing restarts). */
  atStop?: boolean;
  onResume: () => void;
  onAnvil: () => void; // floor restarts (its unbanked haul lost), or back to the stop
  onAbandon: () => void; // counts as a death: the bounty, the floor's haul and a share of the banked
}

/** A caption inside a kit button: body text, as the hub writes it, not the button's display caps. */
const CAPTION = {
  fontFamily: 'var(--k-font-body)',
  textTransform: 'none',
  letterSpacing: 0,
} as const;

/** The footer's Tabs prompt, drawn only: the header's Tabs and the digit keys do the stepping. */
const TABS_PROMPT: Prompt = { id: 'tabs', label: 'Tabs', binding: { key: '1 – 5', pad: 'rb' } };

/**
 * The pause (Esc / Menu mid-dive): the hub's tabs, read-only, over the dimmed arena. The steel
 * band names the floor, the tabs (the Forge locked) and the gear lock; the planks hold the tab's
 * prompts and Tabs, then Controls, Settings, Anvil, Abandon and Resume, which Esc, B and Menu
 * press and the pad focuses first.
 */
export const PauseScreen = memo(function PauseScreen({
  dive,
  biome,
  foesLeft,
  link,
  atStop = false,
  onResume,
  onAnvil,
  onAbandon,
}: PauseScreenProps) {
  const [dialog, setDialog] = useState<'controls' | 'settings' | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const hub = useHubTabs('pause', onResume, link);
  const prompts = [...hub.tabPrompts, TABS_PROMPT];
  usePrompts([...prompts, ...hub.digits], mainRef);

  return (
    // Over the HUD (z-20) and the banners (z-30).
    <div className="absolute inset-0 z-40">
      <Screen
        backdrop="arena-pause"
        headerStyle="band"
        testId="pause-screen"
        header={
          <Header
            title="Paused"
            subtitle={
              atStop
                ? `${biome.name} · Depth ${dive.depth} cleared`
                : `Depth ${dive.depth} · ${biome.name} · ${foesLeft} ${foesLeft === 1 ? 'foe' : 'foes'} left`
            }
            nav={hub.nav}
            aside={
              <span
                className="flex items-center gap-3 border-[3px] border-[var(--k-wood-1)] bg-[var(--k-wood-0)] px-3.5 py-2 text-[var(--k-wood-text)]"
                data-testid="pause-note"
              >
                <Glyph id="lock" size={20} /> Gear is locked until you are back at the Anvil
              </span>
            }
          />
        }
        footer={
          <Footer prompts={prompts}>
            <Button onClick={() => setDialog('controls')} testId="open-controls">
              <Glyph id="controls" size={20} /> Controls
            </Button>
            <Button onClick={() => setDialog('settings')} testId="open-settings">
              <Glyph id="settings" size={20} /> Settings
            </Button>
            <Button onClick={onAnvil} testId="pause-anvil">
              {atStop ? (
                'Anvil · back to this stop'
              ) : (
                <span className="flex flex-col items-start">
                  Anvil · floor restarts
                  <span className="k-caption" style={CAPTION}>
                    This floor's unbanked haul is lost
                  </span>
                </span>
              )}
            </Button>
            <Button variant="danger" onClick={onAbandon} testId="pause-abandon">
              Abandon · counts as a death
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={onResume}
              binding={{ key: 'Escape', pad: 'menu' }}
              data-pad-back
              data-pad-menu
              data-pad-first
              data-primary-action="resume"
              testId="pause-resume"
            >
              Resume
            </Button>
          </Footer>
        }
      >
        <div ref={mainRef} className="h-full min-h-0">
          {hub.view}
        </div>
      </Screen>
      {dialog === 'controls' && <ControlsPanel onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsPanel onClose={() => setDialog(null)} />}
    </div>
  );
});
