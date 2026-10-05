import type { ReactElement } from 'react';
import { addHaul, type DiveState, type Haul } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useControlsStore } from '@/stores/controlsStore';
import { Glyph, InputGlyph, Tooltip, TooltipCard, type GlyphId } from '@/features/delve/kit';
import { getDelveRegistry } from '../../registry';
import { haulRows, materialCount, runeCount } from '../../materials/material-style';
import { HaulList } from '../../materials/HaulList';
import { noFocus } from './SkillSlot';

const n = (x: number) => x.toLocaleString('en-US');

/**
 * The dive's top bar (glass): "Purse", then scrap, Links, Mana Dust, materials, runes and the
 * bag, each its glyph (named for screen readers), the amount held at the Anvil and this dive's
 * gain (the floor's haul and what the dive has banked; the bag's, the items found); hovering the
 * materials lists them; "+N banks on extract" (`bounty`); and at the right end (unless `controls`
 * is off: the peek's copy) the Map (`data-pad-peek`, the peek; with `onPeek`), the Labels hint,
 * Journal (`data-pad-journal`; disabled until there is `onJournal`) and Menu ("Dive menu",
 * `data-pad-menu`), which opens the menu.
 */
export function PurseBar({
  dive,
  onMenu,
  onJournal,
  onPeek,
  controls = true,
}: {
  dive: DiveState;
  onMenu?: () => void;
  onJournal?: () => void;
  onPeek?: () => void;
  controls?: boolean;
}) {
  const profile = useDelveStore((s) => s.profile);
  const drops = useDelveStore((s) => s.diveDrops.length);
  const config = useControlsStore((s) => s.config);
  const registry = getDelveRegistry();
  const bagSize = registry.getDelveBalance().loot.bagSize;
  const gain = addHaul(dive.haul, dive.banked);
  const purse: { id: string; glyph: GlyphId; name: string; held: string; gain: number }[] = [
    { id: 'scrap', glyph: 'scrap', name: 'Scrap', held: n(profile.scrap), gain: gain.scrap },
    { id: 'links', glyph: 'link', name: 'Links', held: n(profile.links), gain: gain.links },
    { id: 'dust', glyph: 'dust', name: 'Mana Dust', held: n(profile.manaDust), gain: gain.dust },
    {
      id: 'materials',
      glyph: 'anvil',
      name: 'Materials',
      held: n(materialCount(profile.materials)),
      gain: materialCount(gain),
    },
    {
      id: 'runes',
      glyph: 'rune',
      name: 'Runes',
      held: n(runeCount(profile.runes)),
      gain: runeCount(gain.runes),
    },
    {
      id: 'items',
      glyph: 'chest',
      name: 'Items',
      held: `${profile.bag.length} / ${bagSize}`,
      gain: drops,
    },
  ];
  return (
    <div
      className="k-glass pointer-events-auto flex h-full items-center gap-6 px-4"
      data-testid="purse-bar"
    >
      <span className="k-disp text-[20px] text-[var(--k-hot-hi)]">Purse</span>
      {purse.map((r) => {
        const entry = (
          <span
            key={r.id}
            className="flex items-center gap-2 whitespace-nowrap text-[15px]"
            data-testid={`purse-${r.id}`}
          >
            <Glyph id={r.glyph} size={18} title={r.name} />
            <b className="k-disp text-[19px]">{r.held}</b>
            <b className="k-disp text-[19px] text-[var(--k-ok)]">+{n(r.gain)}</b>
          </span>
        );
        if (r.id !== 'materials') return entry;
        return (
          <Tooltip
            key={r.id}
            placement="bottom"
            portal={false}
            content={() => <MaterialsCard gain={gain} />}
          >
            {entry}
          </Tooltip>
        );
      })}
      <span className="whitespace-nowrap text-[14px] text-[var(--k-text-3)]">
        <b className="text-[var(--k-hot)]" data-testid="bounty">
          +{n(dive.bounty)}
        </b>{' '}
        banks on extract
      </span>
      {controls && (
        <span className="ml-auto flex items-center gap-4 whitespace-nowrap text-[14px] text-[var(--k-text-2)]">
          {onPeek && (
            <button
              type="button"
              className="flex min-h-8 items-center gap-[6px]"
              data-pad-peek
              onMouseDown={noFocus}
              onClick={onPeek}
              data-testid="peek-button"
            >
              <InputGlyph
                binding={{ key: config.keys.peek ?? undefined, pad: config.pad.peek ?? undefined }}
                size="sm"
              />
              Map
            </button>
          )}
          <span className="flex items-center gap-[6px]">
            <InputGlyph
              binding={{
                key: config.keys.labels ?? undefined,
                pad: config.pad.labels ?? undefined,
                whileHeld: true,
              }}
              size="sm"
            />
            Labels
          </span>
          <button
            type="button"
            className="flex min-h-8 items-center gap-[6px] disabled:opacity-60"
            data-pad-journal
            disabled={!onJournal}
            onMouseDown={noFocus}
            onClick={onJournal}
          >
            <InputGlyph
              binding={{
                key: config.keys.journal ?? undefined,
                pad: config.pad.journal ?? undefined,
              }}
              size="sm"
            />
            Journal
          </button>
          <button
            type="button"
            className="flex min-h-8 items-center gap-[6px]"
            aria-label="Dive menu"
            data-pad-menu
            onMouseDown={noFocus}
            onClick={onMenu}
          >
            <InputGlyph
              binding={{ key: config.keys.menu ?? undefined, pad: config.pad.menu ?? undefined }}
              size="sm"
            />
            Menu
          </button>
        </span>
      )}
    </div>
  );
}

/** The materials' tooltip: what this dive has found (its haul and banked) and the Anvil's stock. */
function MaterialsCard({ gain }: { gain: Haul }): ReactElement {
  const registry = getDelveRegistry();
  const materials = useDelveStore((s) => s.profile.materials);
  const found = haulRows(registry, gain).filter(
    (r) => r.group === 'material' || r.group === 'essence',
  );
  const held = haulRows(registry, materials);
  return (
    <TooltipCard title="Materials" material="glass" width={340}>
      <span className="k-label">This dive</span>
      {found.length > 0 ? <HaulList rows={found} /> : <span className="k-caption">None yet</span>}
      <span className="k-label">At the Anvil</span>
      {held.length > 0 ? <HaulList rows={held} /> : <span className="k-caption">None</span>}
    </TooltipCard>
  );
}
