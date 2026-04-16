import { useRef, useState, useEffect, useMemo } from 'react';
import type { AffixDef, DataRegistry, GemInstance } from '@alloy/engine';
import { GemCard } from '@/components/GemCard';
import { getStatLabel } from '@/shared/utils/stat-label';

interface ForgeGemTrayProps {
  stockpile: GemInstance[];
  registry: DataRegistry;
  selectedOrbUid: string | null;
  equippedUids: Set<string>;
  stagedUids: Set<string>;
  onSelectOrb: (uid: string) => void;
  onPointerDown: (uid: string, e: React.PointerEvent) => void;
  dragUid: string | null;
}

/** Compute optimal gem size: max size that allows 5 gems per row */
function computeTrayGemSize(
  containerWidth: number,
  gap: number,
): number | null {
  if (containerWidth === 0) return null;
  // Size so 5 gems fit across with gaps
  const maxForFive = Math.floor((containerWidth - 4 * gap) / 5);
  return Math.max(80, Math.min(maxForFive, 140));
}

export function ForgeGemTray({
  stockpile,
  registry,
  selectedOrbUid,
  equippedUids,
  stagedUids,
  onSelectOrb,
  onPointerDown,
  dragUid,
}: ForgeGemTrayProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const [localGemSize, setLocalGemSize] = useState<number | null>(null);
  const hasAnimatedRef = useRef(false);

  // Measure tray container and compute optimal gem size (5 gems per row)
  useEffect(() => {
    const el = trayRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width } = entry.contentRect;
      const size = computeTrayGemSize(width, 10);
      setLocalGemSize(size);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Gem cascade entry animation (Web Animations API)
  useEffect(() => {
    if (!gridRef.current || hasAnimatedRef.current) return;
    const gems = gridRef.current.querySelectorAll('[data-gem]');
    if (gems.length === 0) return;
    hasAnimatedRef.current = true;
    gems.forEach((el, i) => {
      (el as HTMLElement).animate(
        [
          { opacity: '0', transform: 'scale(0.7)' },
          { opacity: '1', transform: 'scale(1)' },
        ],
        {
          duration: 300,
          easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
          delay: i * 25,
          fill: 'backwards',
        },
      );
    });
  }, [stockpile.length]);

  const affixMap = useMemo(() => {
    const map = new Map<string, AffixDef>();
    for (const a of registry.getAllAffixes()) {
      map.set(a.id, a);
    }
    return map;
  }, [registry]);

  return (
    <div
      ref={trayRef}
      data-gem-tray
      onContextMenu={(e) => e.preventDefault()}
      style={{
        ...(localGemSize ? { '--gem-size': `${localGemSize}px`, '--gem-radius': `${localGemSize * 0.16}px` } as React.CSSProperties : {}),
      }}
    >
      {/* Label */}
      <div
        style={{
          fontFamily: 'var(--font-family-display)',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-bronze-light)',
          marginBottom: 'var(--gap-sm)',
        }}
      >
        STOCKPILE &middot; {stockpile.length} GEMS
      </div>

      {/* Empty state */}
      {stockpile.length === 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 0,
            color: 'var(--color-surface-300)',
            fontSize: 12,
            fontFamily: 'var(--font-family-display)',
          }}
        >
          All gems assigned
        </div>
      ) : (
        /* Grid */
        <div
          ref={gridRef}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(var(--gem-size), 1fr))',
            gap: 'var(--gap-md)',
            justifyItems: 'center',
            alignContent: 'start',
          }}
        >
          {stockpile.map((orb) => {
            // Staged gems are REMOVED from display (not dimmed)
            if (stagedUids.has(orb.uid)) return null;
            const isEquipped = equippedUids.has(orb.uid);
            const dimmed = isEquipped;

            let affixName: string;
            let category: 'offensive' | 'defensive' | 'sustain' | 'utility' | 'trigger' | 'combined';
            let tags: string[];
            let statLabel: string;
            let affixId: string;

            if (orb.sourceRecipe) {
              const compound = registry.getCombinationById(orb.sourceRecipe);
              if (compound) {
                affixId = compound.id;
                affixName = compound.name;
                tags = compound.tags;
                category = 'combined';
                statLabel = compound.name;
              } else {
                // Fallback if compound not found
                const affix = affixMap.get(orb.affixId);
                affixId = orb.affixId;
                affixName = affix?.name ?? orb.affixId;
                tags = affix?.tags ?? [];
                category = affix?.category ?? 'offensive';
                statLabel = affix ? getStatLabel(affix, orb) : '';
              }
            } else {
              const affix = affixMap.get(orb.affixId);
              affixId = orb.affixId;
              affixName = affix?.name ?? orb.affixId;
              tags = affix?.tags ?? [];
              category = affix?.category ?? 'offensive';
              statLabel = affix ? getStatLabel(affix, orb) : '';
            }

            return (
              <div
                key={orb.uid}
                data-gem-uid={orb.uid}
                data-gem-rarity={orb.rarity}
                data-combinable={orb.combinable ? 'true' : 'false'}
                data-gem-source-recipe={orb.sourceRecipe ?? ''}
                style={{
                  opacity: dimmed ? 0.35 : 1,
                  pointerEvents: dragUid && dragUid !== orb.uid ? 'none' : undefined,
                }}
              >
                <div style={{ position: 'relative' }}>
                <GemCard
                  affixId={affixId}
                  affixName={affixName}
                  tier={orb.tier}
                  rarity={orb.rarity}
                  category={category}
                  tags={tags}
                  statLabel={statLabel}
                  selected={orb.uid === selectedOrbUid}
                  onClick={() => onSelectOrb(orb.uid)}
                  onPointerDown={(e) => onPointerDown(orb.uid, e)}
                />
                {/* Equipped badge */}
                {isEquipped && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -2,
                      right: -2,
                      width: 'var(--icon-md)',
                      height: 'var(--icon-md)',
                      borderRadius: '50%',
                      backgroundColor: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 'var(--text-2xs)',
                      lineHeight: 1,
                      color: '#1a1a2e',
                      fontWeight: 700,
                      zIndex: 2,
                      pointerEvents: 'none',
                    }}
                  >
                    {'\u2694'}
                  </div>
                )}
              </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
