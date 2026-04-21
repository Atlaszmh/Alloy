import type { DataRegistry, EquippedSlot, ForgePlan } from '@alloy/engine';
import { GemCard } from '@/components/GemCard';
import { SocketGrid } from '@/components/SocketGrid';
import { getStatLabel } from '@/shared/utils/stat-label';
import { SocketedAffixList } from './SocketedAffixList';

interface GearWorkspaceProps {
  plan: ForgePlan;
  registry: DataRegistry;
  selectedOrbUid: string | null;
  isDragging: boolean;
  onSocketClick: (card: 'weapon' | 'armor', slotIndex: number) => void;
  onSocketRemove: (card: 'weapon' | 'armor', slotIndex: number) => void;
  onGemPointerDown: (uid: string, e: React.PointerEvent) => void;
}

/**
 * Desktop center stage — weapon panel on the left, armor panel on the right.
 *
 * Each panel wraps itself in `data-item-card="weapon"` / `data-item-card="armor"`
 * so the existing `Forge.tsx` drag-drop logic (which walks up from the
 * `[data-forge-socket]` element via `.closest('[data-item-card]')`) keeps
 * working unchanged. The SocketGrid primitive (Chunk 2) handles the actual
 * grid, and SocketedAffixList renders the per-socket readout below.
 *
 * Layout matches mockup-c-hud-v2-filled.html `.center-stage` — two equal
 * columns side-by-side, each panel filling the full height of the gear area.
 */
export function GearWorkspace({
  plan,
  registry,
  selectedOrbUid,
  isDragging,
  onSocketClick,
  onSocketRemove,
  onGemPointerDown,
}: GearWorkspaceProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 'var(--gap-md)',
        height: '100%',
        minHeight: 0,
      }}
    >
      <GearPanel
        cardId="weapon"
        plan={plan}
        registry={registry}
        selectedOrbUid={selectedOrbUid}
        isDragging={isDragging}
        onSocketClick={onSocketClick}
        onSocketRemove={onSocketRemove}
        onGemPointerDown={onGemPointerDown}
      />
      <GearPanel
        cardId="armor"
        plan={plan}
        registry={registry}
        selectedOrbUid={selectedOrbUid}
        isDragging={isDragging}
        onSocketClick={onSocketClick}
        onSocketRemove={onSocketRemove}
        onGemPointerDown={onGemPointerDown}
      />
    </div>
  );
}

/* ── Single weapon/armor panel ───────────────────────────────── */
function GearPanel({
  cardId,
  plan,
  registry,
  selectedOrbUid,
  isDragging,
  onSocketClick,
  onSocketRemove,
  onGemPointerDown,
}: {
  cardId: 'weapon' | 'armor';
  plan: ForgePlan;
  registry: DataRegistry;
  selectedOrbUid: string | null;
  isDragging: boolean;
  onSocketClick: (card: 'weapon' | 'armor', slotIndex: number) => void;
  onSocketRemove: (card: 'weapon' | 'armor', slotIndex: number) => void;
  onGemPointerDown: (uid: string, e: React.PointerEvent) => void;
}) {
  const item = plan.loadout[cardId];
  const baseItem = registry.getBaseItem(item.baseItemId);
  const filledCount = item.slots.filter((s): s is EquippedSlot => s !== null).length;
  const totalSlots = item.slots.length;
  const isWeapon = cardId === 'weapon';

  const accentGradient = isWeapon
    ? 'linear-gradient(90deg, transparent, #9a9a9a 30%, #e5e5e5 50%, #9a9a9a 70%, transparent)'
    : 'linear-gradient(90deg, transparent, var(--color-teal-500) 30%, var(--color-cold) 50%, var(--color-teal-500) 70%, transparent)';

  return (
    <section
      data-item-card={cardId}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        padding: '12px 18px 14px',
        background:
          'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(212, 168, 52, 0.05), transparent 60%),' +
          'linear-gradient(180deg, rgba(17,17,24,0.88) 0%, rgba(10,10,15,0.92) 100%)',
        border: '1px solid var(--color-surface-600)',
        minHeight: 0,
      }}
    >
      {/* Accent strip at top */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: accentGradient,
          opacity: 0.5,
          pointerEvents: 'none',
        }}
      />

      {/* Header — name + type badge */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          paddingBottom: 6,
          borderBottom: '1px solid var(--color-surface-700)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-family-display)',
            fontWeight: 700,
            fontSize: 'var(--text-lg)',
            color: 'white',
            letterSpacing: '0.06em',
          }}
        >
          {baseItem.name}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-family-display)',
            fontWeight: 600,
            fontSize: 'var(--text-2xs)',
            color: 'var(--color-bronze-500)',
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
          }}
        >
          {'\u25C8'} {cardId}
        </span>
      </header>

      {/* Base stats row */}
      {Object.keys(baseItem.baseStats).length > 0 && (
        <div
          style={{
            padding: '6px 0 4px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px 10px',
          }}
        >
          {Object.entries(baseItem.baseStats).map(([stat, value]) => (
            <span
              key={stat}
              style={{
                fontFamily: 'var(--font-family-body)',
                fontSize: 'var(--text-2xs)',
                color: 'var(--color-bronze-400)',
                letterSpacing: '0.02em',
              }}
            >
              <span style={{ color: 'var(--color-bronze-500)', marginRight: 2 }}>+</span>
              {value}
              <span
                style={{
                  color: 'var(--color-surface-300)',
                  marginLeft: 4,
                  fontSize: '10px',
                }}
              >
                {stat}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Socket region */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6px 0 8px',
          flexShrink: 0,
        }}
      >
        <SocketGrid
          cols={Math.ceil(totalSlots / 2)}
          slots={item.slots}
          isDragging={selectedOrbUid !== null || isDragging}
          onEmptyClick={(slotIndex) => onSocketClick(cardId, slotIndex)}
          renderFilledSocket={(slot, index) => {
            const orb = slot.gem;
            // Non-throwing lookup — matches SocketedAffixList/GemCell pattern.
            // If the affix id is missing from the registry we still render a
            // safe placeholder row instead of crashing the gear panel tree.
            const affix = registry.findAffix(orb.affixId);
            const isLocked = plan.lockedGemUids.has(orb.uid);
            const affixName = affix?.name ?? orb.affixId;
            const category = affix?.category ?? 'offensive';
            const tags = affix?.tags ?? [];
            const statLabel = affix ? getStatLabel(affix, orb, cardId) : '?';
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
                onClick={isLocked ? undefined : () => onSocketRemove(cardId, index)}
                onPointerDown={
                  isLocked ? undefined : (e) => onGemPointerDown(orb.uid, e)
                }
              />
            );
          }}
        />
      </div>

      {/* Per-socket affix readout */}
      <SocketedAffixList slots={item.slots} cardId={cardId} registry={registry} />

      {/* Footer — sockets filled count */}
      <footer
        style={{
          paddingTop: 8,
          borderTop: '1px solid var(--color-surface-700)',
          fontFamily: 'var(--font-family-display)',
          fontWeight: 600,
          fontSize: 'var(--text-2xs)',
          color:
            filledCount === 0
              ? 'var(--color-surface-300)'
              : 'var(--color-teal-500)',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          textAlign: 'center',
          fontStyle: filledCount === 0 ? 'italic' : 'normal',
        }}
      >
        {filledCount === 0 ? (
          <>— no gems socketed —</>
        ) : (
          <>
            <span style={{ color: 'var(--color-accent-300)' }}>
              {filledCount} / {totalSlots}
            </span>{' '}
            Sockets Filled
          </>
        )}
      </footer>
    </section>
  );
}
