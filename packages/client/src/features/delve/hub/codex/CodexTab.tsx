import { useEffect, useState } from 'react';
import type { LegendaryDef, ManaType, Rarity } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { Bar, Glyph, Panel, Tabs, type Prompt } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { ItemIcon } from '../../ItemIcon';
import {
  RARITY_COLOR,
  RARITY_LABEL,
  RARITY_TEXT,
  SLOT_LABEL,
  formatNumber,
  manaStyle,
} from '../../format';
import type { HubLink, HubTabProps } from '../types';
import { ReactionsGrid } from './ReactionsGrid';

type Section = 'legendaries' | 'reactions' | 'records';

const PROMPTS: Prompt[] = [
  { id: 'select', label: 'Select', binding: { mouse: 'click', pad: 'a' } },
];

/** The icon a legendary is drawn with: a base of its first slot. */
const SLOT_BASE: Record<string, string> = {
  weapon: 'sword',
  helm: 'helm',
  chest: 'cuirass',
  gloves: 'gauntlets',
  boots: 'greaves',
  amulet: 'amulet',
  ring: 'ring',
};

const FOUND: Rarity[] = ['uncommon', 'magic', 'rare', 'epic', 'legendary'];

/**
 * The Codex tab: the sections (Legendaries n/12, Reactions n/15, Records), the
 * section's cards, and the card hovered or focused in detail (the section's
 * first until one is). `{ tab: 'codex', section }` links open a section.
 */
export function CodexTab({ setPrompts, link }: HubTabProps) {
  const registry = getDelveRegistry();
  const codex = useDelveStore((s) => s.profile.codex);
  const seenReactions = useDelveStore((s) => s.profile.reactionsSeen);
  const stats = useDelveStore((s) => s.profile.stats);
  const bestDepth = useDelveStore((s) => s.profile.bestDepth);
  const linked = (l?: HubLink) => (l?.tab === 'codex' ? l.section : undefined);
  const [section, setSection] = useState<Section>(linked(link) ?? 'legendaries');
  const [active, setActive] = useState<string | null>(null);
  const [seen, setSeen] = useState(link);
  if (link !== seen) {
    setSeen(link);
    const to = linked(link);
    if (to) {
      setSection(to);
      setActive(null);
    }
  }

  useEffect(() => setPrompts(PROMPTS), [setPrompts]);

  const legendaries = registry.getDelveData().legendaries;
  const reactions = registry.getArpgData().reactions;
  const found = legendaries.filter((l) => codex[l.id]).length;
  const progress = {
    legendaries: [found, legendaries.length],
    reactions: [seenReactions.length, reactions.length],
  } as const;
  const legendary = legendaries.find((l) => l.id === active) ?? legendaries[0];
  const reaction = reactions.find((r) => r.id === active) ?? reactions[0];

  return (
    <div
      className="grid h-full min-h-0 gap-6 px-8 py-6"
      style={{ gridTemplateColumns: '340px minmax(0, 1fr) 470px' }}
      data-testid="codex-panel"
    >
      <Panel title="Codex" testId="codex-sections">
        <div className="[&_.k-tabs]:flex-col [&_.k-tabs]:items-start [&_.k-tabs]:gap-2">
          <Tabs
            aria-label="Codex"
            level="sub"
            size="md"
            value={section}
            onChange={(s) => {
              setSection(s);
              setActive(null);
            }}
            tabs={[
              {
                id: 'legendaries',
                label: 'Legendaries',
                badge: `${found}/${legendaries.length}`,
                testId: 'codex-section-legendaries',
              },
              {
                id: 'reactions',
                label: 'Reactions',
                badge: `${seenReactions.length}/${reactions.length}`,
                testId: 'codex-section-reactions',
              },
              { id: 'records', label: 'Records', testId: 'codex-section-records' },
            ]}
          />
        </div>
        {section !== 'records' && (
          <Bar kind="progress" value={progress[section][0]} max={progress[section][1]} />
        )}
      </Panel>

      <Panel aria-label="Entries" testId="codex-grid">
        {section === 'legendaries' && (
          <section className="flex flex-col gap-4" aria-label="Legendaries">
            <div className="flex items-baseline justify-between">
              <span className="k-section">Legendaries</span>
              <span className="k-caption">
                {found}/{legendaries.length} found
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {legendaries.map((l) => {
                const entry = codex[l.id];
                return (
                  <button
                    key={l.id}
                    type="button"
                    className="k-socket flex items-center gap-3 p-3 text-left"
                    style={{
                      borderColor:
                        active === l.id
                          ? 'var(--k-hot)'
                          : entry
                            ? RARITY_COLOR.legendary
                            : undefined,
                    }}
                    aria-pressed={active === l.id}
                    onMouseEnter={() => setActive(l.id)}
                    onFocus={() => setActive(l.id)}
                    data-testid={entry ? 'codex-found' : 'codex-unknown'}
                  >
                    <span className="h-10 w-10 flex-none">
                      <ItemIcon baseId={SLOT_BASE[l.slots[0]]} rarity="legendary" ghost={!entry} />
                    </span>
                    <span className="flex min-w-0 flex-col gap-1">
                      <span
                        className="k-disp truncate text-[20px]"
                        style={{ color: entry ? RARITY_TEXT.legendary : 'var(--k-text-3)' }}
                      >
                        {entry ? l.name : '???'}
                      </span>
                      <span className="k-caption">
                        {entry ? `Found ×${entry.count}` : dropsOn(l)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {section === 'reactions' && (
          <ReactionsGrid reactionsSeen={seenReactions} active={active} onActive={setActive} />
        )}
        {section === 'records' && (
          <section className="grid grid-cols-3 gap-3" data-testid="codex-records">
            {(
              [
                [stats.dives, 'Dives'],
                [bestDepth, 'Deepest'],
                [stats.extracts, 'Extracts'],
                [formatNumber(stats.kills), 'Kills'],
                [stats.bossKills, 'Bosses'],
                [stats.deaths, 'Deaths'],
                [formatNumber(stats.scrapEarned), 'Scrap earned'],
              ] as const
            ).map(([n, label]) => (
              <div key={label} className="k-well flex flex-col gap-1 p-3">
                <span className="k-disp text-[32px] text-[var(--k-text)]">{n}</span>
                <span className="k-label">{label}</span>
              </div>
            ))}
          </section>
        )}
      </Panel>

      <Panel aria-label="Detail" testId="codex-detail">
        {section === 'legendaries' && (
          <LegendaryDetail def={legendary} count={codex[legendary.id]?.count} />
        )}
        {section === 'reactions' && (
          <ReactionDetail
            name={reaction.name}
            text={reaction.text}
            elements={reaction.elements}
            seen={seenReactions.includes(reaction.id)}
          />
        )}
        {section === 'records' && (
          <div className="flex flex-col gap-3">
            <span className="k-section">Items found</span>
            {FOUND.map((r) => (
              <div key={r} className="flex justify-between text-[18px]">
                <span style={{ color: RARITY_TEXT[r] }}>{RARITY_LABEL[r]}</span>
                <span className="text-[var(--k-text)]">{stats.itemsFound[r]}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function dropsOn(l: LegendaryDef): string {
  return `Drops on: ${l.slots.map((s) => SLOT_LABEL[s]).join(', ')}`;
}

function LegendaryDetail({ def, count }: { def: LegendaryDef; count?: number }) {
  return (
    <div className="flex flex-col gap-4">
      <span className="h-24 w-24">
        <ItemIcon baseId={SLOT_BASE[def.slots[0]]} rarity="legendary" ghost={!count} />
      </span>
      <span
        className="k-heading"
        style={{ color: count ? RARITY_TEXT.legendary : 'var(--k-text-3)' }}
      >
        {count ? def.name : '???'}
      </span>
      {count && <p className="text-[18px]">{def.text.replace('{v}', `${def.min}–${def.max}`)}</p>}
      <p className="k-caption">{count ? `Found ×${count} · ${dropsOn(def)}` : dropsOn(def)}</p>
    </div>
  );
}

function ReactionDetail({
  name,
  text,
  elements,
  seen,
}: {
  name: string;
  text: string;
  elements: [ManaType, ManaType];
  seen: boolean;
}) {
  const registry = getDelveRegistry();
  if (!seen)
    return (
      <div className="flex flex-col gap-4">
        <span className="k-heading text-[var(--k-text-3)]">???</span>
        <p className="k-body-2">
          Stack one element on a foe, then hit it with another, to discover.
        </p>
      </div>
    );
  return (
    <div className="flex flex-col gap-4">
      <span className="flex items-center gap-3 text-[18px]">
        {elements.map((m) => {
          const st = manaStyle(registry, m);
          return (
            <span key={m} className="flex items-center gap-1">
              <Glyph id={m} size={24} color={st.color} /> {st.name}
            </span>
          );
        })}
      </span>
      <span className="k-heading">{name}</span>
      <p className="text-[18px]">{text}</p>
    </div>
  );
}
