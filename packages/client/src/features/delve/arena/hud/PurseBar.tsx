import type { DiveState } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useControlsStore } from '@/stores/controlsStore';
import { Glyph, InputGlyph, type GlyphId } from '@/features/delve/kit';
import { getDelveRegistry } from '../../registry';
import { noFocus } from './SkillSlot';

const n = (x: number) => x.toLocaleString('en-US');

/**
 * The dive's top bar (glass): "Purse", then scrap, Links, Mana Dust, runes and the bag, each its
 * glyph (named for screen readers), the amount held and this dive's gain (the scrap's is the
 * bounty, in amber); "+N banks on extract"
 * (`bounty`); and at the right end the Labels hint, Journal (`data-pad-journal`; disabled until
 * there is `onJournal`) and Menu ("Dive menu", `data-pad-menu`), which opens the menu.
 */
export function PurseBar({
  dive,
  onMenu,
  onJournal,
}: {
  dive: DiveState;
  onMenu: () => void;
  onJournal?: () => void;
}) {
  const profile = useDelveStore((s) => s.profile);
  const drops = useDelveStore((s) => s.diveDrops.length);
  const config = useControlsStore((s) => s.config);
  const bagSize = getDelveRegistry().getDelveBalance().loot.bagSize;
  const runes = Object.values(profile.runes).reduce(
    (sum, tiers) => sum + tiers.reduce((a, b) => a + b, 0),
    0,
  );
  const purse: { id: string; glyph: GlyphId; name: string; held: string; gain: number }[] = [
    { id: 'scrap', glyph: 'scrap', name: 'Scrap', held: n(profile.scrap), gain: dive.bounty },
    { id: 'links', glyph: 'link', name: 'Links', held: n(profile.links), gain: dive.linksEarned },
    {
      id: 'dust',
      glyph: 'dust',
      name: 'Mana Dust',
      held: n(profile.manaDust),
      gain: dive.dustEarned,
    },
    { id: 'runes', glyph: 'rune', name: 'Runes', held: n(runes), gain: dive.runesEarned },
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
      {purse.map((r) => (
        <span
          key={r.id}
          className="flex items-center gap-2 whitespace-nowrap text-[15px]"
          data-testid={`purse-${r.id}`}
        >
          <Glyph id={r.glyph} size={18} title={r.name} />
          <b className="k-disp text-[19px]">{r.held}</b>
          <b
            className="k-disp text-[19px]"
            style={{ color: r.id === 'scrap' ? 'var(--k-hot)' : 'var(--k-ok)' }}
          >
            +{n(r.gain)}
          </b>
        </span>
      ))}
      <span className="whitespace-nowrap text-[14px] text-[var(--k-text-3)]">
        <b className="text-[var(--k-hot)]" data-testid="bounty">
          +{n(dive.bounty)}
        </b>{' '}
        banks on extract
      </span>
      <span className="ml-auto flex items-center gap-4 whitespace-nowrap text-[14px] text-[var(--k-text-2)]">
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
    </div>
  );
}
