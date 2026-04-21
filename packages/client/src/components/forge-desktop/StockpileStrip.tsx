import { useMemo } from 'react';
import type { AffixDef, DataRegistry, GemInstance } from '@alloy/engine';
import { GemCard } from '@/components/GemCard';
import { getStatLabel } from '@/shared/utils/stat-label';

/**
 * Bottom HUD stockpile strip — always a 5 × 2 grid (10 cells) so the tray
 * shape stays visually stable as gems are socketed or staged. Sparse states
 * fill the remaining cells with dim hatched placeholders per the filled-state
 * mockup (`.gem-empty`).
 *
 * NOTE — future `forge-desktop-all-visible` responsive probe: the 10-cell
 * invariant is what that probe asserts to catch the "5×2 collapses to 5×1
 * on narrow frames" regression. Keep this grid exactly 10 cells regardless
 * of stockpile size; don't dynamically trim the row.
 */

const GRID_CAPACITY = 10;

interface StockpileStripProps {
  stockpile: GemInstance[];
  registry: DataRegistry;
  selectedOrbUid: string | null;
  equippedUids: Set<string>;
  stagedUids: Set<string>;
  onSelectOrb: (uid: string) => void;
  onPointerDown: (uid: string, e: React.PointerEvent) => void;
}

export function StockpileStrip({
  stockpile,
  registry,
  selectedOrbUid,
  equippedUids,
  stagedUids,
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

  // Always render exactly 10 cells so the grid shape is constant.
  const cells: (GemInstance | null)[] = Array.from({ length: GRID_CAPACITY }, (_, i) =>
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
            {visibleGems.length} / 20
          </span>
        </span>
      </header>

      {/* Grid — always 10 cells (5 × 2) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          gridTemplateRows: 'repeat(2, 1fr)',
          gap: 'var(--gem-gap-tight)',
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
        compact
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
