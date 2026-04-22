import type { DataRegistry, EquippedSlot, ForgedItem, ForgePlan, GemInstance } from '@alloy/engine';
import { ELEMENT_EMOJIS } from '@/shared/utils/element-theme';
import { GemCard } from '@/components/GemCard';
import { SocketGrid } from '@/components/SocketGrid';
import { getStatLabel } from '@/shared/utils/stat-label';

/**
 * Returns the display name for a gem's affix. For recipe-output gems whose
 * affixId is not in affixes.json, falls back to the recipe name (via
 * getRecipeByOutputAffix) or a titlecased version of the affixId.
 */
function getAffixDisplayName(gem: GemInstance, registry: DataRegistry): string {
  const affix = registry.findAffix(gem.affixId);
  if (affix) return affix.name;
  const recipe = registry.getRecipeByOutputAffix(gem.affixId);
  if (recipe?.name) return recipe.name;
  return gem.affixId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ItemSocketViewProps {
  item: ForgedItem;
  cardId: 'weapon' | 'armor';
  registry: DataRegistry;
  plan: ForgePlan;
  selectedOrbUid: string | null;
  isDragging?: boolean;
  onSocketClick: (slotIndex: number) => void;
  onSocketRemove: (slotIndex: number) => void;
  onGemPointerDown?: (uid: string, e: React.PointerEvent) => void;
}

const ELEMENTS = ['fire', 'cold', 'lightning', 'poison', 'shadow', 'chaos'] as const;


function getSlotGem(slot: EquippedSlot): GemInstance {
  return slot.gem;
}

export function ItemSocketView({
  item,
  cardId,
  registry,
  plan,
  selectedOrbUid,
  isDragging,
  onSocketClick,
  onSocketRemove,
  onGemPointerDown,
}: ItemSocketViewProps) {
  const baseItem = registry.getBaseItem(item.baseItemId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
      {/* Item info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-xs)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)' }}>
          <span
            style={{
              fontFamily: 'var(--font-family-display)',
              fontWeight: 700,
              fontSize: 'var(--text-md)',
              color: 'white',
            }}
          >
            {baseItem.name}
          </span>
          <span
            style={{
              fontSize: 'var(--text-2xs)',
              fontFamily: 'var(--font-family-display)',
              fontWeight: 700,
              textTransform: 'uppercase',
              background: 'var(--color-surface-600)',
              color: 'var(--color-bronze-light)',
              borderRadius: 4,
              padding: '2px 6px',
              letterSpacing: '0.05em',
            }}
          >
            {cardId}
          </span>
        </div>

        {/* Base item stats */}
        {Object.keys(baseItem.baseStats).length > 0 && (
          <div style={{ display: 'flex', gap: 'var(--gap-sm)', flexWrap: 'wrap' }}>
            {Object.entries(baseItem.baseStats).map(([stat, value]) => {
              const isPositive = value >= 0;
              const sign = isPositive ? '+' : '';
              const label = `${sign}${value} ${stat}`;
              return (
                <span
                  key={stat}
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-family-display)',
                    color: isPositive ? 'var(--color-inherent)' : 'var(--color-danger)',
                  }}
                >
                  {label}
                </span>
              );
            })}
          </div>
        )}

        {/* Base stats */}
        {item.baseStats && (
          <div
            style={{
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-family-display)',
              color: 'var(--color-base-stat)',
              display: 'flex',
              gap: 12,
            }}
          >
            <span>{item.baseStats.stat1}</span>
            <span>{item.baseStats.stat2}</span>
          </div>
        )}
      </div>

      {/* Socket grid — rendered by the SocketGrid primitive so portrait and
          desktop variants share the same adaptive col-count + --gem-size
          sizing. Locked gems render without the click/pointerDown handlers. */}
      <SocketGrid
        cols={Math.ceil(item.slots.length / 2)}
        slots={item.slots}
        isDragging={selectedOrbUid !== null || isDragging}
        onEmptyClick={onSocketClick}
        renderFilledSocket={(slot, index) => {
          const orb = getSlotGem(slot);
          const affix = registry.findAffix(orb.affixId);
          const affixName = affix ? affix.name : getAffixDisplayName(orb, registry);
          const category = affix?.category ?? 'utility';
          const tags = affix?.tags ?? orb.tags ?? [];
          const isLocked = plan.lockedGemUids.has(orb.uid);
          const statLabel = affix ? getStatLabel(affix, orb, cardId) : '';
          return (
            <GemCard
              uid={orb.uid}
              affixId={orb.affixId}
              affixName={affixName}
              tier={orb.tier}
              rarity={orb.rarity}
              category={category}
              tags={tags}
              statLabel={statLabel}
              onClick={isLocked ? undefined : () => onSocketRemove(index)}
              onPointerDown={isLocked ? undefined : (e) => onGemPointerDown?.(orb.uid, e)}
            />
          );
        }}
      />

      {/* Equipped affixes list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)' }}>
        {item.slots.map((slot, index) => {
          if (!slot) return null;
          const orb = getSlotGem(slot);
          const affix = registry.findAffix(orb.affixId);
          const affixDisplayName = affix ? affix.name : getAffixDisplayName(orb, registry);
          const affixTags: string[] = affix?.tags ?? orb.tags ?? [];
          const tag = affixTags.find(t => (ELEMENTS as readonly string[]).includes(t)) ?? 'physical';
          const emoji = ELEMENT_EMOJIS[tag] ?? '\u2694';
          const isLocked = plan.lockedGemUids.has(orb.uid);
          const statValue = affix ? getStatLabel(affix, orb, cardId) : '';

          return (
            <div
              key={index}
              style={{
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-family-display)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--gap-sm)',
              }}
            >
              <span>{emoji}</span>
              <span style={{ fontWeight: 600 }}>{affixDisplayName}</span>
              {statValue && (
                <span style={{ color: 'var(--color-surface-300)', fontSize: 'var(--text-xs)' }}>{statValue}</span>
              )}
              {isLocked && <span>{'\uD83D\uDD12'}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
