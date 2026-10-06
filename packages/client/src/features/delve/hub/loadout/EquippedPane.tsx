import { useMemo, type ReactElement } from 'react';
import {
  CHAIN_SKILLS,
  carriedSkills,
  estimateCombat,
  heroChains,
  manaPool,
  movesetOf,
  pairElements,
  profileStats,
  referenceDepth,
  strikeInterval,
  type GearSlot,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { Glyph, Panel, PixelSprite } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { ItemTile } from '../../ItemTile';
import { ItemTooltip } from '../../items/ItemTooltip';
import { AttunementBars } from '../../items/AttunementBars';
import { SKILL_NAME } from '../../chains/chain-text';
import { SLOT_LABEL, formatNumber, manaStyle } from '../../format';
import type { HubLink } from '../types';

/** The paper doll's slots: three down the left, four down the right, by grid column and row. */
const DOLL: [GearSlot, 1 | 3, number][] = [
  ['weapon', 1, 1],
  ['gloves', 1, 2],
  ['ring', 1, 3],
  ['helm', 3, 1],
  ['amulet', 3, 2],
  ['chest', 3, 3],
  ['boots', 3, 4],
];

/** The stepped cyan glow under the hero on the anvil. */
const GLOW =
  'radial-gradient(ellipse at 50% 78%, rgba(44, 232, 245, 0.22) 0 22%, rgba(44, 232, 245, 0.08) 22% 38%, transparent 38%)';

/**
 * The Loadout's left pane: the paper doll round the hero on the anvil (each worn item's card on
 * hover or focus, a click shows it in the compare pane; under the pad focus selects it and no card
 * shows), the hero's stats, the pair's attunement (to the Mana view on Skills) and the weapon's
 * moveset (slots used of each skill's cap). The attunement strip and the moveset's "Skills ›" are
 * the mouse's (`data-pad-skip`): LB/RB reach Skills.
 */
export function EquippedPane({
  selected,
  onSelect,
  go,
}: {
  selected: string | null;
  onSelect: (uid: string) => void;
  go: (to: HubLink) => void;
}): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const newUids = useDelveStore((s) => s.newUids);
  const pad = useInputDeviceStore((s) => s.device === 'gamepad');
  const { equipped, pair } = profile;
  const stats = useMemo(
    () => profileStats(registry, { equipped, pair }),
    [registry, equipped, pair],
  );
  const chains = useMemo(() => heroChains(registry, equipped, pair), [registry, equipped, pair]);
  const dps = useMemo(
    () => estimateCombat(stats, registry, referenceDepth(profile), chains).dps,
    [stats, registry, profile, chains],
  );
  const pool = manaPool(stats, registry);
  const speed = 1 / strikeInterval(stats);
  const elements = pairElements(pair);
  const weapon = equipped.weapon;
  const cap = registry.getDelveBalance().chains.cap;
  const slots = weapon ? movesetOf(registry, weapon).slots : null;
  const carried = weapon ? carriedSkills(registry, weapon) : [];

  const rows: [string, string, boolean?][] = [
    ['Damage', formatNumber(dps)],
    ['Life', formatNumber(stats.maxHp)],
    ['Attack speed', `${speed.toFixed(2)}/s`],
    ['Armor', formatNumber(stats.armor)],
    ['Mana', formatNumber(pool.max), true],
    ['Regen', `${pool.regen.toFixed(1)}/s`, true],
  ];

  return (
    <Panel
      title="Equipped"
      aside={
        <span className="k-caption">
          {elements.map((m) => manaStyle(registry, m).name).join(' · ')}
        </span>
      }
      testId="paper-doll"
    >
      <div
        className="grid justify-center gap-x-[18px] gap-y-1"
        style={{ gridTemplateColumns: '84px minmax(0, 200px) 84px' }}
      >
        <div
          className="flex flex-col items-center justify-end pb-1.5"
          style={{ gridColumn: 2, gridRow: '1 / 5', background: GLOW }}
        >
          <PixelSprite id="hero" scale={10} context="ui" label="Your hero" />
          <span aria-hidden className="-mt-1.5">
            <Glyph id="anvil" size={160} />
          </span>
        </div>
        {DOLL.map(([slot, col, row]) => {
          const item = equipped[slot] ?? null;
          const tile = (
            <ItemTile
              item={item}
              slot={slot}
              size={84}
              isNew={item ? newUids[item.uid] : false}
              selected={!!item && selected === item.uid}
              onClick={item ? () => onSelect(item.uid) : undefined}
              onFocus={item && pad ? () => onSelect(item.uid) : undefined}
              testId={`slot-${slot}`}
            />
          );
          return (
            <div
              key={slot}
              className="flex flex-col items-center gap-1"
              style={{ gridColumn: col, gridRow: row }}
            >
              {item && !pad ? <ItemTooltip uid={item.uid}>{tile}</ItemTooltip> : tile}
              <span className="k-label">{SLOT_LABEL[slot]}</span>
            </div>
          );
        })}
      </div>

      <dl className="grid grid-cols-2 gap-x-[22px] text-[16px]" data-testid="loadout-stats">
        {rows.map(([label, value, mana]) => (
          <div
            key={label}
            className="flex justify-between border-b-2 border-[var(--k-steel-1)] py-0.5"
          >
            <dt className="text-[var(--k-text-3)]">{label}</dt>
            <dd className="font-bold" style={mana ? { color: 'var(--k-mana)' } : undefined}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <button
        type="button"
        className="flex flex-col gap-2 text-left"
        onClick={() => go({ tab: 'skills', view: 'mana' })}
        data-testid="mana-strip"
        data-pad-skip
      >
        <span className="flex w-full items-baseline justify-between">
          <span className="k-label">Attunement</span>
          <span className="k-caption">Skills ›</span>
        </span>
        <AttunementBars stats={stats} elements={elements} compact />
      </button>

      {weapon && slots && (
        <div className="k-well mt-auto flex flex-col gap-1 p-3" data-testid="loadout-moveset">
          <div className="flex items-baseline justify-between gap-3">
            <span className="k-disp truncate text-[18px]">Moveset · {weapon.name}</span>
            <button
              type="button"
              className="k-caption -my-1.5 inline-flex min-h-8 items-center"
              onClick={() => go({ tab: 'skills' })}
              data-pad-skip
            >
              Skills ›
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 whitespace-nowrap text-[16px] text-[var(--k-text-2)]">
            {CHAIN_SKILLS.map((s) => (
              <span key={s} data-testid={`loadout-moveset-${s}`}>
                {SKILL_NAME[s]} {carried.includes(s) ? `${slots[s]}/${cap[s]}` : '—'}
              </span>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
