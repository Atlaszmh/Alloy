import { useEffect, useState, type ReactNode } from 'react';
import type { GearBaseDef, LegendaryDef, ManaType, Rarity } from '@alloy/engine';
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

type Section = NonNullable<Extract<HubLink, { tab: 'codex' }>['section']>;

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

/** Where an unknown pattern comes from (see the crafting spec's drops and salvage). */
const PATTERN_SOURCE = 'Salvage one, or find its pattern on an elite or a boss';
/** Where essences come from. */
const ESSENCE_SOURCE = 'Bosses drop essences; salvaging a legendary extracts its essence';

/**
 * The Codex tab: the sections (Legendaries n/12, Reactions n/15, Patterns n/13,
 * Essences n/12, Records), the
 * section's cards, and the card hovered or focused in detail (the section's
 * first until one is). `{ tab: 'codex', section }` links open a section.
 */
export function CodexTab({ setPrompts, link }: HubTabProps) {
  const registry = getDelveRegistry();
  const codex = useDelveStore((s) => s.profile.codex);
  const seenReactions = useDelveStore((s) => s.profile.reactionsSeen);
  const stats = useDelveStore((s) => s.profile.stats);
  const bestDepth = useDelveStore((s) => s.profile.bestDepth);
  const patterns = useDelveStore((s) => s.profile.patterns);
  const essencesSeen = useDelveStore((s) => s.profile.essencesSeen);
  const essencesHeld = useDelveStore((s) => s.profile.materials.essences);
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
  const bases = registry.getDelveData().bases;
  const found = legendaries.filter((l) => codex[l.id]).length;
  const learned = bases.filter((b) => patterns.includes(b.id)).length;
  const seenEssences = legendaries.filter((l) => essencesSeen.includes(l.id)).length;
  const progress = {
    legendaries: [found, legendaries.length],
    reactions: [seenReactions.length, reactions.length],
    patterns: [learned, bases.length],
    essences: [seenEssences, legendaries.length],
  } as const;
  // An essence's id is its legendary's (see the crafting spec's S6): one lookup serves both sections.
  const legendary = legendaries.find((l) => l.id === active) ?? legendaries[0];
  const reaction = reactions.find((r) => r.id === active) ?? reactions[0];
  const base = bases.find((b) => b.id === active) ?? bases[0];

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
              {
                id: 'patterns',
                label: 'Patterns',
                badge: `${learned}/${bases.length}`,
                testId: 'codex-section-patterns',
              },
              {
                id: 'essences',
                label: 'Essences',
                badge: `${seenEssences}/${legendaries.length}`,
                testId: 'codex-section-essences',
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
        {section === 'patterns' && (
          <section className="flex flex-col gap-4" aria-label="Patterns">
            <div className="flex items-baseline justify-between">
              <span className="k-section">Patterns</span>
              <span className="k-caption">
                {learned}/{bases.length} learned
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {bases.map((b) => {
                const known = patterns.includes(b.id);
                return (
                  <EntryCard
                    key={b.id}
                    active={active === b.id}
                    onActive={() => setActive(b.id)}
                    icon={<ItemIcon baseId={b.id} rarity="common" ghost={!known} />}
                    name={b.name}
                    color={known ? 'var(--k-text)' : 'var(--k-text-3)'}
                    caption={known ? SLOT_LABEL[b.slot] : PATTERN_SOURCE}
                    testId={known ? 'pattern-learned' : 'pattern-unknown'}
                  />
                );
              })}
            </div>
          </section>
        )}
        {section === 'essences' && (
          <section className="flex flex-col gap-4" aria-label="Essences">
            <div className="flex items-baseline justify-between">
              <span className="k-section">Essences</span>
              <span className="k-caption">
                {seenEssences}/{legendaries.length} seen
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {legendaries.map((l) => {
                const seen = essencesSeen.includes(l.id);
                return (
                  <EntryCard
                    key={l.id}
                    active={active === l.id}
                    onActive={() => setActive(l.id)}
                    icon={
                      <ItemIcon baseId={SLOT_BASE[l.slots[0]]} rarity="legendary" ghost={!seen} />
                    }
                    name={seen ? l.name : '???'}
                    color={seen ? RARITY_TEXT.legendary : 'var(--k-text-3)'}
                    caption={seen ? `Held ×${essencesHeld[l.id] ?? 0}` : forgesOnto(l)}
                    testId={seen ? 'essence-seen' : 'essence-unknown'}
                  />
                );
              })}
            </div>
          </section>
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
        {section === 'patterns' && <PatternDetail def={base} known={patterns.includes(base.id)} />}
        {section === 'essences' && (
          <EssenceDetail
            def={legendary}
            seen={essencesSeen.includes(legendary.id)}
            held={essencesHeld[legendary.id] ?? 0}
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

/** One card of a section's grid; hovered or focused, it is the detail's. */
function EntryCard({
  active,
  onActive,
  icon,
  name,
  color,
  caption,
  testId,
}: {
  active: boolean;
  onActive: () => void;
  icon: ReactNode;
  name: string;
  color: string;
  caption: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      className="k-socket flex items-center gap-3 p-3 text-left"
      style={{ borderColor: active ? 'var(--k-hot)' : undefined }}
      aria-pressed={active}
      onMouseEnter={onActive}
      onFocus={onActive}
      data-testid={testId}
    >
      <span className="h-10 w-10 flex-none">{icon}</span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="k-disp truncate text-[20px]" style={{ color }}>
          {name}
        </span>
        <span className="k-caption">{caption}</span>
      </span>
    </button>
  );
}

function PatternDetail({ def, known }: { def: GearBaseDef; known: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <span className="h-24 w-24">
        <ItemIcon baseId={def.id} rarity="common" ghost={!known} />
      </span>
      <span className="k-heading" style={{ color: known ? 'var(--k-text)' : 'var(--k-text-3)' }}>
        {def.name}
      </span>
      <p className="text-[18px]">
        {SLOT_LABEL[def.slot]} · {known ? 'Learned' : 'Not learned'}
      </p>
      <p className="k-caption">{known ? 'Forge it at the Forge bench' : PATTERN_SOURCE}</p>
    </div>
  );
}

function forgesOnto(l: LegendaryDef): string {
  return `Forges onto: ${l.slots.map((s) => SLOT_LABEL[s]).join(', ')}`;
}

function EssenceDetail({ def, seen, held }: { def: LegendaryDef; seen: boolean; held: number }) {
  return (
    <div className="flex flex-col gap-4">
      <span className="h-24 w-24">
        <ItemIcon baseId={SLOT_BASE[def.slots[0]]} rarity="legendary" ghost={!seen} />
      </span>
      <span
        className="k-heading"
        style={{ color: seen ? RARITY_TEXT.legendary : 'var(--k-text-3)' }}
      >
        {seen ? `${def.name} essence` : '???'}
      </span>
      {seen && <p className="text-[18px]">{def.text.replace('{v}', `${def.min}–${def.max}`)}</p>}
      <p className="k-caption">{seen ? `Held ×${held} · ${forgesOnto(def)}` : forgesOnto(def)}</p>
      <p className="k-caption">{ESSENCE_SOURCE}</p>
    </div>
  );
}
