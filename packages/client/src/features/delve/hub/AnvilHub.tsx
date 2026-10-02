import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { selectDraftApply, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { Screen, Tabs, usePrompts, type Prompt } from '@/features/delve/kit';
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
 * The Anvil hub: a kit Screen with the steel header (tabs 1–5 or LB/RB), the
 * wood footer (the tab's prompts and Menu, then Training, the start depths and
 * Delve, or the tab's own footer action) and the system menu on Esc / B. Each
 * tab draws its own grid of panes in the main.
 */
export function AnvilHub({ mode }: { mode: HubMode }) {
  const navigate = useNavigate();
  const newCount = useDelveStore((s) => Object.keys(s.newUids).length);
  const unapplied = Object.keys(useDelveStore(selectDraftApply).changes).length;
  const [tab, setTab] = useState<HubTab>('loadout');
  // The link the last go() carried, for the tab it names; a plain tab change carries none.
  const [link, setLink] = useState<HubLink | undefined>();
  const [tabPrompts, setTabPrompts] = useState<Prompt[]>([]);
  const [footerAction, setFooterAction] = useState<ReactNode>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  // Paused mid-dive, the Forge is locked (spec: "Forge at the Anvil").
  const tabs = TABS.map((t) => ({ ...t, disabled: mode === 'pause' && t.id === 'forge' }));

  const open = (to: HubTab, carried?: HubLink) => {
    if (to !== tab) setTabPrompts([]);
    setTab(to);
    setLink(carried);
    playSound('buttonClick');
  };
  const go = (to: HubLink) => open(to.tab, to);
  const onTraining = () => navigate('/delve/training');

  // The footer's prompts: the tab's, then the hub's Menu. The hub also binds Training (its
  // button draws the glyph) and the digits.
  const prompts: Prompt[] = [
    ...tabPrompts,
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
      ...tabs.map((t, i) => ({
        id: `tab-${t.id}`,
        label: t.label,
        binding: { key: [`Digit${i + 1}`, `Numpad${i + 1}`] },
        onPress: () => open(t.id),
        disabled: t.disabled,
      })),
    ],
    mainRef,
  );

  const View = TAB_VIEWS[tab];

  return (
    <>
      <Screen
        backdrop="wall"
        headerStyle="band"
        testId={`hub-${mode}`}
        header={
          <HubHeader
            nav={
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
            }
          />
        }
        footer={<HubFooter prompts={prompts} onTraining={onTraining} action={footerAction} />}
      >
        <div ref={mainRef} className="h-full min-h-0">
          <View
            key={tab}
            mode={mode}
            setPrompts={setTabPrompts}
            setFooterAction={setFooterAction}
            go={go}
            link={link?.tab === tab ? link : undefined}
          />
        </div>
      </Screen>
      {menuOpen && <SystemMenu onClose={() => setMenuOpen(false)} />}
    </>
  );
}
