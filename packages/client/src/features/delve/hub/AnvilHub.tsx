import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { isDiveActive, startDepthOptions } from '@alloy/engine';
import { selectDraftApply, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Screen, Tabs, usePrompts, type Prompt } from '@/features/delve/kit';
import { getDelveRegistry } from '../registry';
import { HubHeader } from './HubHeader';
import { HubFooter, TRAINING_BINDING } from './HubFooter';
import { SystemMenu } from './SystemMenu';
import { LoadoutTab } from './loadout/LoadoutTab';
import { SkillsTab } from './skills/SkillsTab';
import { ForgeTab } from './forge/ForgeTab';
import { CodexTab } from './codex/CodexTab';
import { QuestsTab } from './quests/QuestsTab';
import type { HubLink, HubMode, HubTab, HubTabProps } from './types';

const TABS: { id: HubTab; label: string }[] = [
  { id: 'loadout', label: 'Loadout' },
  { id: 'skills', label: 'Skills' },
  { id: 'forge', label: 'Forge' },
  { id: 'codex', label: 'Codex' },
  { id: 'quests', label: 'Quests' },
];

const TAB_VIEWS: Record<HubTab, (props: HubTabProps) => ReactNode> = {
  loadout: LoadoutTab,
  skills: SkillsTab,
  forge: ForgeTab,
  codex: CodexTab,
  quests: QuestsTab,
};

/**
 * The hub's tabs, shared by the Anvil and the pause: the open tab and the link it carries
 * (`initial` at first), the tab's prompts and footer action, the header's Tabs (`nav`), the
 * open tab's view (`view`) and the digit keys (`digits`, for the screen's usePrompts). In
 * `mode: 'pause'` the Forge is disabled ("Forge at the Anvil"): LB/RB and the digits skip it.
 */
export function useHubTabs(mode: HubMode, onDelve: () => void, initial?: HubLink) {
  const newCount = useDelveStore((s) => Object.keys(s.newUids).length);
  const unapplied = Object.keys(useDelveStore(selectDraftApply).changes).length;
  const [tab, setTab] = useState<HubTab>(initial?.tab ?? 'loadout');
  // The link the last go() carried, for the tab it names; a plain tab change carries none.
  const [link, setLink] = useState<HubLink | undefined>(initial);
  const [tabPrompts, setTabPrompts] = useState<Prompt[]>([]);
  const [footerAction, setFooterAction] = useState<ReactNode>(null);
  const tabs = TABS.map((t) => {
    const locked = mode === 'pause' && t.id === 'forge';
    return { ...t, disabled: locked, title: locked ? 'Forge at the Anvil' : undefined };
  });

  const open = (to: HubTab, carried?: HubLink) => {
    if (to !== tab) setTabPrompts([]);
    setTab(to);
    setLink(carried);
    playSound('buttonClick');
  };
  const go = (to: HubLink) => open(to.tab, to);
  const digits: Prompt[] = tabs.map((t, i) => ({
    id: `tab-${t.id}`,
    label: t.label,
    binding: { key: [`Digit${i + 1}`, `Numpad${i + 1}`] },
    onPress: () => open(t.id),
    disabled: t.disabled,
  }));
  const View = TAB_VIEWS[tab];

  const nav = (
    <Tabs
      aria-label="The Anvil"
      level="top"
      digits
      glyphs
      value={tab}
      onChange={(t) => open(t)}
      tabs={tabs.map((t) => ({
        ...t,
        testId: `tab-${t.id}`,
        badge:
          t.id === 'loadout' && newCount > 0 ? (
            <span aria-label={`${newCount} new`}>{newCount}</span>
          ) : t.id === 'skills' && unapplied > 0 ? (
            <span
              aria-label={`${unapplied} unapplied change${unapplied === 1 ? '' : 's'}`}
              data-testid="draft-count"
            >
              {unapplied}
            </span>
          ) : undefined,
      }))}
    />
  );
  const view = (
    <View
      key={tab}
      mode={mode}
      setPrompts={setTabPrompts}
      setFooterAction={setFooterAction}
      go={go}
      link={link?.tab === tab ? link : undefined}
      onDelve={onDelve}
    />
  );
  return { nav, view, tabPrompts, footerAction, digits };
}

/**
 * The Anvil hub: a kit Screen with the steel header (tabs 1–5 or LB/RB), the
 * wood footer (the tab's prompts and Menu, then Training, the start depths and
 * Delve, or the tab's own footer action) and the system menu on Esc / B. Each
 * tab draws its own grid of panes in the main.
 */
export function AnvilHub({ mode }: { mode: HubMode }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  // The start depth the footer's chips pick (the deepest at first), for every Delve button.
  const profile = useDelveStore((s) => s.profile);
  const starts = startDepthOptions(getDelveRegistry(), profile);
  const [start, setStart] = useState(starts[starts.length - 1]);
  const depth = starts.includes(start) ? start : 1;

  const onTraining = () => navigate('/delve/training');
  const onDelve = () => {
    const s = useDelveStore.getState();
    if (!isDiveActive(s.profile) && !s.startDive(depth)) return;
    playSound('phaseTransition');
    vibrate('medium');
    navigate('/delve/run');
  };
  const hub = useHubTabs(mode, onDelve);

  // The footer's prompts: the tab's, then the hub's Menu. The hub also binds Training (its
  // button draws the glyph) and the digits.
  const prompts: Prompt[] = [
    ...hub.tabPrompts,
    {
      id: 'menu',
      label: 'Menu',
      binding: { key: 'Escape', pad: 'b' },
      onPress: () => setMenuOpen(true),
      asButton: true,
      padBack: true,
    },
  ];
  usePrompts(
    [
      ...prompts,
      { id: 'training', label: 'Training', binding: TRAINING_BINDING, onPress: onTraining },
      ...hub.digits,
    ],
    mainRef,
  );

  return (
    <>
      <Screen
        backdrop="wall"
        headerStyle="band"
        testId={`hub-${mode}`}
        header={<HubHeader nav={hub.nav} />}
        footer={
          <HubFooter
            prompts={prompts}
            onTraining={onTraining}
            start={depth}
            onStart={setStart}
            onDelve={onDelve}
            action={hub.footerAction}
          />
        }
      >
        <div ref={mainRef} className="h-full min-h-0">
          {hub.view}
        </div>
      </Screen>
      {menuOpen && <SystemMenu onClose={() => setMenuOpen(false)} />}
    </>
  );
}
