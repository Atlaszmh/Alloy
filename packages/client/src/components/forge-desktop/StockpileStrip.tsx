import { useMemo } from 'react';
import type { AffixDef, DataRegistry, GemInstance } from '@alloy/engine';
import { GemCard } from '@/components/GemCard';
import { getStatLabel } from '@/shared/utils/stat-label';

/**
 * Bottom HUD stockpile strip — a 5-column grid that is ALWAYS at least 2 rows
 * (10 cells) so the tray shape stays visually stable as gems are socketed or
 * staged, and grows in whole rows of 5 when the stockpile exceeds 10. Sparse
 * states fill the remaining cells with dim hatched placeholders per the
 * filled-state mockup (`.gem-empty`).
 *
 * NOTE — `forge-desktop-all-visible` responsive probe: the 10-cell minimum is
 * what that probe asserts to catch the "5×2 collapses to 5×1 on narrow
 * frames" regression. The cell count may exceed 10 (when the round-1 pool of
 * 20 gems is held and none are socketed), but must never drop below it.
 */

const MIN_GRID_CAPACITY = 10;
const COLS = 5;

interface StockpileStripProps {
  stockpile: GemInstance[];
  registry: DataRegistry;
  selectedOrbUid: string | null;
  equippedUids: Set<string>;
  stagedUids: Set<string>;
  /**
   * Round-aware pool capacity for the "Gems Held X / Y" readout. The draft
   * pool schedule runs 20 → 18 → 16 → 14 → 12 → 10 across rounds, so this
   * must be sourced from the engine (Chunk 4 wires it in). Independent of
   * the fixed 10-cell display grid shape.
   */
  maxCapacity: number;
  onSelectOrb: (uid: string) => void;
  onPointerDown: (uid: string, e: React.PointerEvent) => void;
}

export function StockpileStrip({
  stockpile,
  registry,
  selectedOrbUid,
  equippedUids,
  stagedUids,
  maxCapacity,
  onSelectOrb,
  onPointerDown,
}: StockpileStripProps) {
  // Filter out staged gems (same rule as ForgeGemTray).
  const visibleGems = useMemo(
    () => stockpile.filter((g) => !stagedUids.has(g.uid)),
    [stockpile, stagedUids],
  );

  const affixMap = useMemo(() => {
    const map = new Map<string, AffixDef>();
    for (const a of registry.getAllAffixes()) {
      map.set(a.id, a);
    }
    return map;
  }, [registry]);

  // At least MIN_GRID_CAPACITY (10, the 5×2 invariant) cells; grow in whole
  // rows of COLS (5) so every gem stays addressable when the inventory spills
  // past 10. Round 1's pool cap is 20 so 4 rows is the practical ceiling.
  const cellCount = Math.max(
    MIN_GRID_CAPACITY,
    Math.ceil(visibleGems.length / COLS) * COLS,
  );
  const cells: (GemInstance | null)[] = Array.from({ length: cellCount }, (_, i) =>
    visibleGems[i] ?? null,
  );

  return (
    <section
      data-gem-tray
      aria-label="Gem stockpile"
      style={{
        position: 'relative',
        height: 'var(--hud-stockpile-h)',
        padding: '14px 20px 16px',
        background:
          'linear-gradient(180deg, rgba(6,6,8,0.3) 0%, var(--color-surface-900) 12%, var(--color-surface-950) 100%)',
        borderTop: '1px solid var(--color-surface-600)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Bronze accent on top edge */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -1,
          left: 0,
          right: 0,
          height: 1,
          background:
            'linear-gradient(90deg, transparent, var(--color-bronze-500) 15%, var(--color-bronze-500) 85%, transparent)',
          opacity: 0.5,
          pointerEvents: 'none',
        }}
      />

      {/* Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10 }}>
          <span
            style={{
              fontFamily: 'var(--font-family-display)',
              fontWeight: 700,
              fontSize: 'var(--text-2xs)',
              color: 'var(--color-bronze-500)',
              letterSpacing: '0.26em',
              textTransform: 'uppercase',
            }}
          >
            {'\u25C8'} Stockpile
          </span>
          <span
            style={{
              fontFamily: 'var(--font-family-display)',
              fontWeight: 600,
              fontSize: 'var(--text-2xs)',
              color: 'var(--color-surface-300)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              padding: '2px 8px',
              border: '1px solid var(--color-surface-600)',
              background: 'var(--color-surface-900)',
            }}
          >
            5 × 2
          </span>
        </span>
        <span
          style={{
            fontFamily: 'var(--font-family-display)',
            fontWeight: 600,
            fontSize: 'var(--text-2xs)',
            color: 'var(--color-surface-300)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          Gems Held{' '}
          <span style={{ color: 'var(--color-bronze-300)' }}>
            {visibleGems.length} / {maxCapacity}
          </span>
        </span>
      </header>

      {/* Grid — 5 columns sized to --gem-size (not the wide 1fr cells that
          left ~250px of dead space per cell at 1920 width); at least 2 rows,
          grows in whole rows when the stockpile holds more than 10 gems
          (round-1 pool caps at 20). Centered horizontally so the tight pack
          sits in the middle of the tray regardless of viewport width. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, var(--gem-size))`,
          gridAutoRows: 'var(--gem-size)',
          gap: 'var(--gem-gap-tight)',
          justifyContent: 'center',
          flex: 1,
          minHeight: 0,
        }}
      >
        {cells.map((gem, index) => {
          if (!gem) {
            return <EmptyCell key={`empty-${index}`} />;
          }
          return (
            <GemCell
              key={gem.uid}
              gem={gem}
              registry={registry}
              affixMap={affixMap}
              selected={gem.uid === selectedOrbUid}
              dimmed={equippedUids.has(gem.uid)}
              onSelect={() => onSelectOrb(gem.uid)}
              onPointerDown={(e) => onPointerDown(gem.uid, e)}
            />
          );
        })}
      </div>
    </section>
  );
}

/* ── Single populated cell ────────────────────────────────────── */
function GemCell({
  gem,
  registry,
  affixMap,
  selected,
  dimmed,
  onSelect,
  onPointerDown,
}: {
  gem: GemInstance;
  registry: DataRegistry;
  affixMap: Map<string, AffixDef>;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  let affixName: string;
  let affixId: string;
  let tags: string[];
  let category: 'offensive' | 'defensive' | 'sustain' | 'utility' | 'trigger' | 'combined';
  let statLabel: string;

  if (gem.sourceRecipe) {
    const compound = registry.getCombinationById(gem.sourceRecipe);
    if (compound) {
      affixId = compound.id;
      affixName = compound.name;
      tags = compound.tags;
      category = 'combined';
      statLabel = compound.name;
    } else {
      const affix = affixMap.get(gem.affixId);
      affixId = gem.affixId;
      affixName = affix?.name ?? gem.affixId;
      tags = affix?.tags ?? [];
      category = affix?.category ?? 'offensive';
      statLabel = affix ? getStatLabel(affix, gem) : '';
    }
  } else {
    const affix = affixMap.get(gem.affixId);
    affixId = gem.affixId;
    affixName = affix?.name ?? gem.affixId;
    tags = affix?.tags ?? [];
    category = affix?.category ?? 'offensive';
    statLabel = affix ? getStatLabel(affix, gem) : '';
  }

  return (
    <div
      data-stockpile-cell
      data-gem-uid={gem.uid}
      data-gem-rarity={gem.rarity}
      data-combinable={gem.combinable ? 'true' : 'false'}
      data-gem-source-recipe={gem.sourceRecipe ?? ''}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 0,
        opacity: dimmed ? 0.35 : 1,
      }}
    >
      <GemCard
        uid={gem.uid}
        affixId={affixId}
        affixName={affixName}
        tier={gem.tier}
        rarity={gem.rarity}
        category={category}
        tags={tags}
        statLabel={statLabel}
        selected={selected}
        onClick={onSelect}
        onPointerDown={onPointerDown}
      />
    </div>
  );
}

/* ── Dim placeholder cell for sparse grids ─────────────────── */
function EmptyCell() {
  return (
    <div
      data-stockpile-cell
      data-empty="true"
      aria-hidden="true"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.15,
        minWidth: 0,
        border: '1px dashed var(--color-surface-700)',
        background:
          'repeating-linear-gradient(135deg, rgba(37,37,54,0.22) 0 4px, transparent 4px 10px),' +
          'linear-gradient(180deg, rgba(10,10,15,0.5), rgba(6,6,8,0.5))',
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          clipPath:
            'polygon(50% 0%, 100% 30%, 85% 90%, 15% 90%, 0% 30%)',
          background: 'var(--color-surface-700)',
          opacity: 0.5,
        }}
      />
    </div>
  );
}
