import { useRef, useState, useEffect, useMemo } from 'react';
import type { AffixDef, DataRegistry, OrbInstance } from '@alloy/engine';
import { GemCard } from '@/components/GemCard';
import { useGemSize } from '@/hooks/useGemSize';
import { getStatLabel } from '@/shared/utils/stat-label';

interface ForgeGemTrayProps {
  stockpile: OrbInstance[];
  registry: DataRegistry;
  selectedOrbUid: string | null;
  equippedUids: Set<string>;
  stagedUids: Set<string>;
  onSelectOrb: (uid: string) => void;
  initialPoolCount: number;
}

export function ForgeGemTray({
  stockpile,
  registry,
  selectedOrbUid,
  equippedUids,
  stagedUids,
  onSelectOrb,
  initialPoolCount,
}: ForgeGemTrayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { gemSize, columns, emojiSize, statSize, nameSize, catSize } =
    useGemSize(initialPoolCount);

  const affixMap = useMemo(() => {
    const map = new Map<string, AffixDef>();
    for (const a of registry.getAllAffixes()) {
      map.set(a.id, a);
    }
    return map;
  }, [registry]);

  return (
    <div
      ref={containerRef}
      onContextMenu={(e) => e.preventDefault()}
      style={{ minHeight: 120 }}
    >
      {/* Label */}
      <div
        style={{
          fontFamily: 'var(--font-family-display)',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-bronze-light)',
          marginBottom: 6,
        }}
      >
        STOCKPILE &middot; {stockpile.length} ORBS
      </div>

      {/* Empty state */}
      {stockpile.length === 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 100,
            color: 'var(--color-surface-300)',
            fontSize: 12,
            fontFamily: 'var(--font-family-display)',
          }}
        >
          All orbs assigned
        </div>
      ) : (
        /* Grid */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap: 8,
            justifyItems: 'center',
            overflowY: 'auto',
            scrollbarWidth: 'thin',
            scrollbarColor: '#363650 transparent',
          }}
        >
          {stockpile.map((orb) => {
            const isEquipped = equippedUids.has(orb.uid);
            const isStaged = stagedUids.has(orb.uid);
            const dimmed = isEquipped || isStaged;

            let affixName: string;
            let category: 'offensive' | 'defensive' | 'sustain' | 'utility' | 'trigger' | 'combined';
            let tags: string[];
            let statLabel: string;
            let affixId: string;

            if (orb.compoundId) {
              const compound = registry.getCombinationById(orb.compoundId);
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
                style={{
                  position: 'relative',
                  opacity: dimmed ? 0.35 : 1,
                  touchAction: 'none',
                  WebkitTouchCallout: 'none',
                  userSelect: 'none',
                }}
              >
                <GemCard
                  affixId={affixId}
                  affixName={affixName}
                  tier={orb.tier}
                  category={category}
                  tags={tags}
                  statLabel={statLabel}
                  gemSize={gemSize}
                  emojiSize={emojiSize}
                  statSize={statSize}
                  nameSize={nameSize}
                  catSize={catSize}
                  selected={orb.uid === selectedOrbUid}
                  onClick={() => onSelectOrb(orb.uid)}
                />

                {/* State badge */}
                {(isEquipped || isStaged) && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -2,
                      right: -2,
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      backgroundColor: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 8,
                      lineHeight: 1,
                      color: '#1a1a2e',
                      fontWeight: 700,
                      zIndex: 2,
                      pointerEvents: 'none',
                    }}
                  >
                    {isEquipped ? '\u2694' : '\u2692'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
