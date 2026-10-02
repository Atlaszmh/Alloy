import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { MANA_TYPES, profileStats } from '@alloy/engine';
import { selectDraftApply, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { Glyph, Panel, Screen, Tabs, usePrompts, type Prompt } from '@/features/delve/kit';
import { getDelveRegistry } from '../registry';
import { PaperDoll } from '../PaperDoll';
import { BagPanel } from '../BagPanel';
import { ForgePanel } from '../ForgePanel';
import { CodexPanel } from '../CodexPanel';
import { AbilitiesPanel } from '../AbilitiesPanel';
import { ItemDetailSheet } from '../ItemDetailSheet';
import { RARITY_LABEL, RARITY_TEXT, formatNumber, manaStyle } from '../format';
import { HubHeader } from './HubHeader';
import { HubFooter, TRAINING_BINDING } from './HubFooter';
import { HowTo } from './HowTo';
import { ReactionsGrid } from './codex/ReactionsGrid';
import { SystemMenu } from './SystemMenu';
import type { HubMode, HubTab } from './types';

const TABS: { id: HubTab; label: string }[] = [
  { id: 'loadout', label: 'Loadout' },
  { id: 'skills', label: 'Skills' },
  { id: 'forge', label: 'Forge' },
  { id: 'codex', label: 'Codex' },
  { id: 'quests', label: 'Quests' },
];

/**
 * The Anvil hub: a kit Screen with the steel header (tabs 1–5 or LB/RB), the
 * wood footer (prompts, Training, the start depths, Delve) and the system
 * menu on Esc / B. Phase 1's main area is today's panels in a centred 960 px
 * column; Phase 2 makes each tab its panes, and wires `mode: 'pause'`.
 */
export function AnvilHub({ mode }: { mode: HubMode }) {
  const navigate = useNavigate();
  const profile = useDelveStore((s) => s.profile);
  const newCount = useDelveStore((s) => Object.keys(s.newUids).length);
  const unapplied = Object.keys(useDelveStore(selectDraftApply).changes).length;
  const [tab, setTab] = useState<HubTab>('loadout');
  const [selected, setSelected] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  const go = (to: HubTab) => {
    setTab(to);
    playSound('buttonClick');
  };
  const openItem = (uid: string) => {
    playSound('orbSelect');
    useDelveStore.getState().markSeen([uid]);
    setSelected(uid);
  };
  const onTraining = () => navigate('/delve/training');

  // The footer's prompts; the hub also binds Training (its button draws the glyph) and the digits.
  const prompts: Prompt[] = [
    { id: 'select', label: 'Select', binding: { mouse: 'click', pad: 'a' } },
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
      ...TABS.map((t, i) => ({
        id: `tab-${t.id}`,
        label: t.label,
        binding: { key: [`Digit${i + 1}`, `Numpad${i + 1}`] },
        onPress: () => go(t.id),
      })),
    ],
    mainRef,
  );

  const { equipped, pair } = profile;
  const attunement = useMemo(
    () => profileStats(getDelveRegistry(), { equipped, pair }).attunement,
    [equipped, pair],
  );

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
                onChange={go}
                tabs={TABS.map((t) => ({
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
        footer={<HubFooter prompts={prompts} onTraining={onTraining} />}
      >
        <div ref={mainRef} className="h-full overflow-y-auto px-8 py-6">
          {/* Today's panels until Phase 2's panes, at their own size: the column undoes the UI zoom. */}
          <div className="mx-auto flex w-[960px] max-w-full flex-col gap-4 [zoom:calc(1/var(--ui-scale,1))]">
            {tab === 'loadout' && (
              <>
                {profile.stats.dives === 0 && <HowTo />}
                <PaperDoll onSelect={openItem} />
                <button
                  type="button"
                  className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[14px]"
                  onClick={() => go('skills')}
                  data-testid="mana-strip"
                >
                  {MANA_TYPES.filter((m) => attunement[m] > 0).map((m) => {
                    const style = manaStyle(getDelveRegistry(), m);
                    return (
                      <span key={m} className="flex items-center gap-1" title={style.name}>
                        <Glyph id={m} size={16} color={style.color} /> {attunement[m]}
                      </span>
                    );
                  })}
                  <span className="text-[var(--k-text-2)]">· Skills ›</span>
                </button>
                <BagPanel onSelect={openItem} />
              </>
            )}
            {tab === 'skills' && <AbilitiesPanel />}
            {tab === 'forge' && <ForgePanel onSelect={openItem} />}
            {tab === 'codex' && (
              <>
                <CodexPanel />
                {/* Out of the chain builder; 2C's Codex panes take it in. */}
                <ReactionsGrid reactionsSeen={profile.reactionsSeen} />
                {profile.stats.dives > 0 && <Records />}
              </>
            )}
            {tab === 'quests' && (
              <Panel title="Quests" testId="quests-empty" scroll={false}>
                <p className="text-[16px] text-[var(--k-text-2)]">
                  Quests arrive in a later update. The journal and the HUD tracker are ready for
                  them.
                </p>
              </Panel>
            )}
          </div>
        </div>
      </Screen>
      {selected && (
        <ItemDetailSheet
          uid={selected}
          onClose={() => setSelected(null)}
          onBuild={() => {
            setSelected(null);
            setTab('skills');
          }}
        />
      )}
      {menuOpen && <SystemMenu onClose={() => setMenuOpen(false)} />}
    </>
  );
}

/** The lifetime stats, on the Codex until Phase 2's Records. */
function Records() {
  const stats = useDelveStore((s) => s.profile.stats);
  return (
    <div className="delve-panel grid grid-cols-3 gap-2 p-3 text-center text-[14px] text-[var(--k-text-3)]">
      {(
        [
          [stats.dives, 'dives'],
          [formatNumber(stats.kills), 'kills'],
          [stats.bossKills, 'bosses'],
        ] as const
      ).map(([n, label]) => (
        <div key={label}>
          <div className="text-[18px] text-[var(--k-text)]">{n}</div>
          {label}
        </div>
      ))}
      <div className="col-span-3 flex flex-wrap justify-center gap-x-3 gap-y-1">
        {(['uncommon', 'magic', 'rare', 'epic', 'legendary'] as const).map((r) => (
          <span key={r} style={{ color: RARITY_TEXT[r] }}>
            {stats.itemsFound[r]} {RARITY_LABEL[r]}
          </span>
        ))}
      </div>
    </div>
  );
}
