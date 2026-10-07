import { memo, useId, useRef, useState, type ReactElement } from 'react';
import type { BiomeDef, DiveState } from '@alloy/engine';
import { ControlsPanel } from '@/features/controls/ControlsPanel';
import { Button, Dialog, Footer, Glyph, Header, Screen, usePrompts, type Prompt } from '../kit';
import { SkipTutorialConfirm } from '../tutorial/SkipTutorial';
import { boonsLine, wornBoons } from '../boons-text';
import { getDelveRegistry } from '../registry';
import { formatNumber } from '../format';
import { materialCount, runeCount } from '../materials/material-style';
import { useQuests } from '../quests/useQuests';
import { objectiveCount } from '../quests/types';
import { useHubTabs } from './AnvilHub';
import { SettingsPanel } from './SettingsPanel';
import { HelpDialog } from './help/HelpDialog';
import type { HubLink } from './types';

// hub/PauseScreen.tsx — DelveRun renders it while menuOpen
export interface PauseScreenProps {
  dive: DiveState;
  biome: BiomeDef;
  foesLeft: number;
  /** A generated floor's rooms explored, and its rooms (the HUD's map); absent on the open room. */
  roomsExplored?: number;
  roomsTotal?: number;
  /** The Found log's item, or { tab: 'quests' } from the journal: the hub opens on it, not the list. */
  link?: HubLink;
  /** Over the stop: back from the Anvil, the dive is still at the stop (nothing restarts). */
  atStop?: boolean;
  onResume: () => void;
  onAnvil: () => void; // floor restarts (its unbanked haul lost), or back to the stop
  onAbandon: () => void; // counts as a death: the bounty, the floor's haul and a share of the banked
  /**
   * While the guided start runs (see the tutorial spec): Skip tutorial, confirmed, drops it.
   * Mid-floor the Anvil and Abandon restart the depth as it was entered; at a stop Abandon waits.
   */
  onSkipTutorial?: () => void;
  /** "Skip this step", while the engine allows it (the pad's way to it from the fight). */
  onSkipStep?: () => void;
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
 * The pause (the pad-first spec, 3): Menu or Esc in a dive opens a short list over the dimmed
 * arena, a kit dialog that wraps for the pad (`pause-screen`): Resume (the first focus), Build and
 * quests, Controls, Settings, Help (How to delve), the guided start's skips while they apply, then
 * the Anvil and Abandon with their stakes; beside it the dive as it stands (`PauseState`). Its
 * Back, B, Esc and the pad's Menu resume. Build and quests opens the hub's tabs read-only (`pause-hub`; a `link` opens there
 * directly), where B and Esc return to the list and Menu resumes.
 */
export const PauseScreen = memo(function PauseScreen(props: PauseScreenProps) {
  const { link, onSkipTutorial } = props;
  const [view, setView] = useState<'list' | 'hub'>(link ? 'hub' : 'list');
  /** Back from the hub, the list's focus is on Build and quests, the row that opened it. */
  const [fromHub, setFromHub] = useState(false);
  const [dialog, setDialog] = useState<'controls' | 'settings' | 'help' | 'skip' | null>(null);
  return (
    <>
      {view === 'hub' ? (
        <PauseHub
          {...props}
          onBack={() => {
            setFromHub(true);
            setView('list');
          }}
        />
      ) : (
        <PauseList
          {...props}
          first={fromHub ? 'build' : 'resume'}
          onBuild={() => setView('hub')}
          onDialog={setDialog}
        />
      )}
      {dialog === 'controls' && <ControlsPanel onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsPanel onClose={() => setDialog(null)} />}
      {dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}
      {dialog === 'skip' && onSkipTutorial && (
        <SkipTutorialConfirm
          onConfirm={() => {
            setDialog(null);
            onSkipTutorial();
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
});

/** The pause's list: the rows, and the dive's state beside them. */
function PauseList({
  first,
  onBuild,
  onDialog,
  ...props
}: PauseScreenProps & {
  first: 'resume' | 'build';
  onBuild: () => void;
  onDialog: (d: 'controls' | 'settings' | 'help' | 'skip') => void;
}): ReactElement {
  const { atStop = false, onResume, onAnvil, onAbandon, onSkipStep, onSkipTutorial } = props;
  const guided = !!onSkipTutorial;
  const why = useId();
  const held = guided && atStop;
  const lead = (row: 'resume' | 'build') => (first === row ? '' : undefined);
  return (
    <Dialog title="Paused" onClose={onResume} width={960} wrap testId="pause-screen">
      <div className="flex gap-8">
        <div className="flex w-[400px] flex-none flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={onResume}
            data-pad-first={lead('resume')}
            data-primary-action="resume"
            testId="pause-resume"
          >
            Resume
          </Button>
          <Button onClick={onBuild} data-pad-first={lead('build')} testId="pause-build">
            <Glyph id="journal" size={20} /> Build and quests
          </Button>
          <Button onClick={() => onDialog('controls')} testId="open-controls">
            <Glyph id="controls" size={20} /> Controls
          </Button>
          <Button onClick={() => onDialog('settings')} testId="open-settings">
            <Glyph id="settings" size={20} /> Settings
          </Button>
          <Button onClick={() => onDialog('help')} testId="pause-help">
            <Glyph id="journal" size={20} /> Help
          </Button>
          {onSkipStep && (
            <Button onClick={onSkipStep} testId="pause-skip-step">
              Skip this step
            </Button>
          )}
          {guided && (
            <Button onClick={() => onDialog('skip')} testId="pause-skip-tutorial">
              Skip tutorial
            </Button>
          )}
          <Button onClick={onAnvil} testId="pause-anvil">
            {atStop ? (
              'Anvil · back to this stop'
            ) : (
              <span className="flex flex-col items-start">
                Anvil · floor restarts
                <span className="k-note" style={CAPTION}>
                  {guided ? 'The depth restarts as you entered it' : "This floor's unbanked haul is lost"}
                </span>
              </span>
            )}
          </Button>
          <Button
            variant="danger"
            onClick={onAbandon}
            disabled={held}
            aria-describedby={held ? why : undefined}
            testId="pause-abandon"
          >
            {guided ? 'Abandon · the depth restarts' : 'Abandon · counts as a death'}
          </Button>
          {held && (
            <span id={why} className="k-note" style={CAPTION}>
              Not while the guided start runs
            </span>
          )}
        </div>
        <PauseState {...props} />
      </div>
    </Dialog>
  );
}

/**
 * The dive as it stands, beside the list: the depth and biome (cleared, over the stop), a generated
 * floor's rooms explored or the open room's foes left, what the dive has banked and the bounty, the
 * death-loss line, the dive's boons, and the first tracked quest's next objective.
 */
function PauseState({
  dive,
  biome,
  foesLeft,
  roomsExplored,
  roomsTotal,
  atStop = false,
}: PauseScreenProps): ReactElement {
  const registry = getDelveRegistry();
  const { quests } = useQuests();
  const loss = Math.round(registry.getDelveBalance().crafting.deathLoss * 100);
  const some = (k: number, one: string) => `${formatNumber(k)} ${one}${k === 1 ? '' : 's'}`;
  const kept = [
    dive.banked.scrap > 0 && `${formatNumber(dive.banked.scrap)} scrap`,
    materialCount(dive.banked) > 0 && some(materialCount(dive.banked), 'material'),
    runeCount(dive.banked.runes) > 0 && some(runeCount(dive.banked.runes), 'rune'),
  ].filter(Boolean);
  const quest = quests.find((q) => q.tracked && q.status !== 'claimed');
  const goal = quest?.objectives.find((o) => !o.done);
  const boons = wornBoons(registry, dive.diveBuffs);
  return (
    <div
      className="flex min-w-0 flex-1 flex-col gap-3 text-[18px] text-[var(--k-text-2)]"
      data-testid="pause-state"
    >
      <span className="k-disp text-[26px] text-[var(--k-text)]">
        Depth {dive.depth}
        {atStop && ' cleared'} · {biome.name}
      </span>
      {roomsTotal !== undefined ? (
        <span>
          Rooms explored {roomsExplored ?? 0} / {roomsTotal}
        </span>
      ) : (
        !atStop && <span>{some(foesLeft, 'foe')} left</span>
      )}
      <span>
        Banked {kept.length > 0 ? kept.join(' · ') : 'nothing yet'} · +{formatNumber(dive.bounty)}{' '}
        bounty on extract
      </span>
      <span className="text-[var(--k-hot)]">Banked this dive · dying loses {loss}% of it</span>
      {boons.length > 0 && <span data-testid="dive-boons">Boons: {boonsLine(boons)}</span>}
      {quest && (
        <span>
          {quest.name}: {goal ? `${goal.text} ${objectiveCount(goal)}`.trim() : 'Ready to claim'}
        </span>
      )}
    </div>
  );
}

/**
 * The hub's tabs, read-only, over the dimmed arena: the steel band names the floor, the tabs (the
 * Forge locked) and the gear lock; the planks hold the tab's prompts and Tabs, then the way back
 * to the list (B, Esc) and Resume (Menu).
 */
function PauseHub({
  dive,
  biome,
  foesLeft,
  link,
  atStop = false,
  onResume,
  onBack,
}: PauseScreenProps & { onBack: () => void }): ReactElement {
  const mainRef = useRef<HTMLDivElement>(null);
  const hub = useHubTabs('pause', onResume, link);
  const prompts: Prompt[] = [...hub.tabPrompts, TABS_PROMPT];
  usePrompts([...prompts, ...hub.digits], mainRef);
  return (
    // Over the HUD (z-20) and the banners (z-30).
    <div className="absolute inset-0 z-40">
      <Screen
        backdrop="arena-pause"
        headerStyle="band"
        testId="pause-hub"
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
            <Button
              onClick={onBack}
              binding={{ key: 'Escape', pad: 'b' }}
              data-pad-back
              testId="pause-back"
            >
              Pause menu
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={onResume}
              binding={{ pad: 'menu' }}
              data-pad-menu
              data-primary-action="resume"
              testId="pause-hub-resume"
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
    </div>
  );
}
