import { useMemo } from 'react';
import type { DataRegistry, GemInstance, CombinePreview } from '@alloy/engine';
import { HapticButton } from '@/components/HapticButton';
import { GemCard } from '@/components/GemCard';
import { ELEMENT_GRADIENTS } from '@/shared/utils/element-theme';
import { getGemArt } from '@/shared/utils/art-registry';
import { getStatLabel } from '@/shared/utils/stat-label';

const ELEMENT_SYMBOLS: Record<string, string> = {
  fire: '\u{1F525}',
  cold: '\u{2744}\uFE0F',
  lightning: '\u{26A1}',
  poison: '\u{2620}\uFE0F',
  shadow: '\u{1F319}',
  chaos: '\u{1F300}',
  physical: '\u{2694}\uFE0F',
};

const ELEMENT_TAGS = new Set(Object.keys(ELEMENT_SYMBOLS));

interface CombineWorkbenchProps {
  comboSlots: [GemInstance | null, GemInstance | null, GemInstance | null];
  registry: DataRegistry;
  canAfford: boolean;
  preview?: CombinePreview | null;
  isDragging?: boolean;
  onSlotClick: (index: number) => void;
  onCombine: () => void;
  onClearAll: () => void;
  onPointerDown?: (uid: string, e: React.PointerEvent) => void;
}

type GlowSignal = 'none' | 'white' | 'gold';

export function computeGlowSignal(
  slots: [GemInstance | null, GemInstance | null, GemInstance | null],
  registry: DataRegistry,
): GlowSignal {
  // Slot 0 (KEEP) must be filled for a valid combine; check only pairs involving slot 0.
  const keep = slots[0];
  if (!keep) return 'none';
  const others = [slots[1], slots[2]].filter((s): s is GemInstance => s !== null);
  if (others.length === 0) return 'none';

  // If 3 slots filled, check ternary first.
  if (others.length === 2) {
    const ternary = registry.getTernaryCombination(keep.affixId, others[0].affixId, others[1].affixId);
    if (ternary) return 'gold';
  }

  // Fall back to any KEEP-anchored pair hitting a binary recipe.
  for (const other of others) {
    const result = registry.getCombination(keep.affixId, other.affixId);
    if (result) return 'gold';
  }
  return 'white';
}

export function CombineWorkbench({
  comboSlots,
  registry,
  canAfford,
  preview,
  isDragging,
  onSlotClick,
  onCombine,
  onClearAll,
  onPointerDown,
}: CombineWorkbenchProps) {
  const glowSignal = useMemo(
    () => computeGlowSignal(comboSlots, registry),
    [comboSlots, registry],
  );

  const filledCount = comboSlots.filter(Boolean).length;
  const keepFilled = comboSlots[0] !== null;
  const canCombine = keepFilled && filledCount >= 2 && canAfford;

  return (
    <div
      style={{
        padding: 'var(--gap-sm) var(--gap-md)',
        borderTop: '1px solid var(--color-surface-700)',
      }}
    >
      {/* Top row: slots + separators + arrow + result box */}
      <div
        className="flex items-center justify-center"
        style={{ gap: 'var(--gap-sm)' }}
      >
        {comboSlots.map((orb, idx) => (
          <div
            key={idx}
            className="flex items-center"
            style={{ gap: 'var(--gap-sm)' }}
          >
            {idx > 0 && (
              <span
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-surface-300)',
                  fontFamily: 'var(--font-family-display)',
                  fontWeight: 700,
                  alignSelf: 'flex-end',
                  marginBottom: 'calc(var(--gem-size) * 0.5 - var(--text-sm) * 0.5)',
                }}
              >
                +
              </span>
            )}
            <div className="flex flex-col items-center" style={{ gap: '2px' }}>
              {/* Label area — KEEP caption for slot 0, blank spacer for slots 1 & 2 to keep vertical alignment */}
              {idx === 0 ? (
                <div className="flex flex-col items-center leading-none" style={{ gap: '1px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-family-display)',
                      fontSize: 'var(--text-2xs)',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      color: 'var(--color-bronze-light)',
                    }}
                  >
                    KEEP
                  </span>
                  <span
                    style={{
                      fontSize: '9px',
                      color: 'var(--color-surface-400)',
                      fontStyle: 'italic',
                    }}
                  >
                    ↓ upgraded on mismatch
                  </span>
                </div>
              ) : (
                <div aria-hidden="true" style={{ height: 'calc(var(--text-2xs) + 9px + 1px)' }} />
              )}
              <Slot
                index={idx}
                orb={orb}
                registry={registry}
                isDragging={isDragging}
                isKeepSlot={idx === 0}
                onClick={() => onSlotClick(idx)}
                onPointerDown={onPointerDown}
              />
            </div>
          </div>
        ))}

        {/* Arrow */}
        <span
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-surface-300)',
            marginLeft: 'var(--gap-xs)',
            marginRight: 'var(--gap-xs)',
            alignSelf: 'flex-end',
            marginBottom: 'calc(var(--gem-size) * 0.5 - var(--text-sm) * 0.5)',
          }}
        >
          {'\u25B6'}
        </span>

        {/* Result box */}
        <div className="flex flex-col items-center" style={{ gap: '2px' }}>
          <div aria-hidden="true" style={{ height: 'calc(var(--text-2xs) + 9px + 1px)' }} />
          <ResultBox glowSignal={glowSignal} preview={preview ?? null} registry={registry} />
        </div>
      </div>

      {/* Bottom row: buttons centered beneath */}
      <div
        className="flex items-center justify-center"
        style={{ gap: 'var(--gap-sm)', marginTop: 'var(--gap-sm)' }}
      >
        <HapticButton
          variant="primary"
          size="sm"
          disabled={!canCombine}
          onClick={onCombine}
          data-combine-btn
        >
          COMBINE
        </HapticButton>
        <HapticButton
          variant="secondary"
          size="sm"
          disabled={filledCount === 0}
          onClick={onClearAll}
        >
          CLEAR
        </HapticButton>
      </div>
    </div>
  );
}

/* ---- Slot ---- */

function Slot({
  index,
  orb,
  registry,
  isDragging,
  isKeepSlot,
  onClick,
  onPointerDown,
}: {
  index: number;
  orb: GemInstance | null;
  registry: DataRegistry;
  isDragging?: boolean;
  isKeepSlot?: boolean;
  onClick: () => void;
  onPointerDown?: (uid: string, e: React.PointerEvent) => void;
}) {
  const keepAttrs = isKeepSlot ? { 'data-combo-slot-keep': 'true' } : {};

  if (!orb) {
    const dropGlow = isDragging
      ? isKeepSlot
        ? '0 0 22px rgba(212,168,52,0.7), 0 0 44px rgba(212,168,52,0.3)'
        : '0 0 12px rgba(212,168,52,0.4)'
      : isKeepSlot
        ? '0 0 16px rgba(212,168,52,0.5), 0 0 32px rgba(212,168,52,0.2)'
        : 'none';
    const dropBorder = isDragging
      ? '2px dashed var(--color-bronze-light)'
      : isKeepSlot
        ? '2px dashed var(--color-bronze-light)'
        : '2px dashed var(--color-surface-500)';
    const bg = isKeepSlot
      ? 'linear-gradient(180deg, rgba(212,168,52,0.14), var(--color-surface-800))'
      : 'var(--color-surface-800)';
    return (
      <button
        data-combo-slot={index}
        {...keepAttrs}
        onClick={onClick}
        className="flex items-center justify-center cursor-pointer"
        style={{
          width: 'var(--gem-size)',
          height: 'var(--gem-size)',
          borderRadius: 'var(--gem-radius)',
          border: dropBorder,
          background: bg,
          color: isKeepSlot ? 'var(--color-bronze-light)' : 'var(--color-surface-300)',
          fontSize: 'var(--icon-md)',
          boxShadow: dropGlow,
          transition: 'box-shadow 0.2s, border-color 0.2s',
        }}
        aria-label={isKeepSlot ? 'KEEP slot (empty) — this gem is the one upgraded' : 'Empty combo slot'}
      >
        ?
      </button>
    );
  }

  const affix = registry.findAffix(orb.affixId);
  const affixName = affix?.name ?? orb.affixId;
  const tags = affix?.tags ?? [];
  const category = affix?.category ?? 'offensive';
  const statLabel = affix ? getStatLabel(affix, orb) : '';

  const filledKeepWrap: React.CSSProperties = isKeepSlot
    ? {
        borderRadius: 'var(--gem-radius)',
        boxShadow: '0 0 18px rgba(212,168,52,0.6), 0 0 36px rgba(212,168,52,0.25)',
        outline: '2px solid var(--color-bronze-light)',
        outlineOffset: '-2px',
      }
    : {};

  return (
    <div
      data-combo-slot={index}
      {...keepAttrs}
      style={{ width: 'var(--gem-size)', height: 'var(--gem-size)', ...filledKeepWrap }}
    >
      <GemCard
        uid={orb.uid}
        affixId={orb.affixId}
        affixName={affixName}
        tier={orb.tier}
        rarity={orb.rarity}
        category={category}
        tags={tags}
        statLabel={statLabel}
        onClick={onClick}
        onPointerDown={(e) => onPointerDown?.(orb.uid, e)}
      />
    </div>
  );
}

/* ---- Result Box ---- */

function ResultBox({
  glowSignal,
  preview,
  registry,
}: {
  glowSignal: GlowSignal;
  preview: CombinePreview | null;
  registry: DataRegistry;
}) {
  const isGold = glowSignal === 'gold';
  const isWhite = glowSignal === 'white';
  const hasGlow = isGold || isWhite;

  const borderColor = isGold
    ? 'var(--color-compound)'
    : isWhite
      ? 'rgba(255,255,255,0.3)'
      : 'var(--color-surface-500)';

  const borderStyle = hasGlow ? 'solid' : 'dashed';

  const shadow = isGold
    ? '0 0 16px rgba(212,168,52,0.5)'
    : isWhite
      ? '0 0 12px rgba(255,255,255,0.3)'
      : 'none';

  // Known combo with gem preview — show full gem details
  if (preview?.known && preview.gem) {
    const affix = registry.findAffix(preview.gem.affixId);
    const element = affix?.tags.find((t: string) => ELEMENT_TAGS.has(t));
    const gradient = element ? ELEMENT_GRADIENTS[element] : null;
    const artUrl = getGemArt(preview.gem.affixId);

    return (
      <div
        data-combine-result
        data-glow={glowSignal}
        data-combine-result-known="true"
        data-combine-result-layer={preview.layer ?? ''}
        className="flex flex-col items-center justify-center overflow-hidden"
        style={{
          width: 'var(--gem-size)',
          height: 'var(--gem-size)',
          borderRadius: 'var(--gem-radius)',
          border: `2px solid ${borderColor}`,
          background: gradient
            ? `linear-gradient(135deg, ${gradient.bg})`
            : 'var(--color-surface-800)',
          boxShadow: shadow,
          position: 'relative',
          animation: 'pulse-glow 1.5s ease-in-out infinite',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.15), transparent 55%)',
            pointerEvents: 'none',
          }}
        />
        {artUrl ? (
          <img
            src={artUrl}
            alt={preview.gem.affixId}
            style={{ width: '70%', height: '70%', objectFit: 'contain', position: 'relative', zIndex: 1, opacity: 0.8 }}
          />
        ) : (
          <span style={{ fontSize: 'var(--icon-lg)', position: 'relative', zIndex: 1, opacity: 0.8 }}>
            {element ? ELEMENT_SYMBOLS[element] : '\u2726'}
          </span>
        )}
        <span
          style={{
            fontSize: 'calc(var(--gem-size) * 0.1)',
            fontFamily: 'var(--font-family-display)',
            fontWeight: 700,
            color: 'white',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            position: 'relative',
            zIndex: 1,
          }}
        >
          T{preview.gem.tier} {preview.gem.rarity.slice(0, 3)}
        </span>
      </div>
    );
  }

  // Unknown combo or no preview — show mystery "?" with glow hints
  const symbol = isGold ? '\u2726' : '?';
  const symbolColor = isGold
    ? 'var(--color-compound)'
    : isWhite
      ? 'rgba(255,255,255,0.8)'
      : 'var(--color-surface-300)';

  return (
    <div
      data-combine-result
      data-glow={glowSignal}
      data-combine-result-known={preview?.known ? 'true' : 'false'}
      data-combine-result-layer={preview?.layer ?? ''}
      className="flex items-center justify-center"
      style={{
        width: 'var(--gem-size)',
        height: 'var(--gem-size)',
        borderRadius: 'var(--gem-radius)',
        border: `2px ${borderStyle} ${borderColor}`,
        background: 'var(--color-surface-800)',
        boxShadow: shadow,
        fontSize: 'var(--icon-lg)',
        color: symbolColor,
        animation: isGold ? 'pulse-glow 1.5s ease-in-out infinite' : undefined,
      }}
      aria-live="polite"
      aria-label={
        preview && !preview.known
          ? 'Undiscovered combination'
          : isGold
            ? 'Unique compound available'
            : isWhite
              ? 'Basic combination available'
              : 'No combination'
      }
    >
      {symbol}
    </div>
  );
}
