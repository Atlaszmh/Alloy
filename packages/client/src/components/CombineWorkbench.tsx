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

function computeGlowSignal(
  slots: [GemInstance | null, GemInstance | null, GemInstance | null],
  registry: DataRegistry,
): GlowSignal {
  const filled = slots.filter((s): s is GemInstance => s !== null);
  if (filled.length < 2) return 'none';

  // Check all 2-pair permutations from the 3 slots
  const pairs: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];
  for (const [i, j] of pairs) {
    const a = slots[i];
    const b = slots[j];
    if (a && b) {
      const result = registry.getCombination(a.affixId, b.affixId);
      if (result) return 'gold';
    }
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

  return (
    <div
      style={{
        padding: 'var(--gap-sm) var(--gap-md)',
        borderTop: '1px solid var(--color-surface-700)',
      }}
    >
      <div className="flex items-center justify-center gap-1.5">
        {comboSlots.map((orb, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            {idx > 0 && (
              <span
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-surface-300)',
                  fontFamily: 'var(--font-family-display)',
                  fontWeight: 700,
                }}
              >
                +
              </span>
            )}
            <Slot
              index={idx}
              orb={orb}
              registry={registry}
              isDragging={isDragging}
              onClick={() => onSlotClick(idx)}
              onPointerDown={onPointerDown}
            />
          </div>
        ))}

        {/* Arrow */}
        <span
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-surface-300)',
            marginLeft: 'var(--gap-xs)',
            marginRight: 'var(--gap-xs)',
          }}
        >
          {'\u25B6'}
        </span>

        {/* Result box */}
        <ResultBox glowSignal={glowSignal} preview={preview ?? null} registry={registry} />

        {/* Buttons inline */}
        <div className="flex gap-1.5" style={{ marginLeft: 'var(--gap-md)' }}>
          <HapticButton
            variant="primary"
            size="sm"
            disabled={filledCount < 2 || !canAfford}
            onClick={onCombine}
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
    </div>
  );
}

/* ---- Slot ---- */

function Slot({
  index,
  orb,
  registry,
  isDragging,
  onClick,
  onPointerDown,
}: {
  index: number;
  orb: GemInstance | null;
  registry: DataRegistry;
  isDragging?: boolean;
  onClick: () => void;
  onPointerDown?: (uid: string, e: React.PointerEvent) => void;
}) {
  if (!orb) {
    const dropGlow = isDragging
      ? '0 0 12px rgba(212,168,52,0.4)'
      : 'none';
    const dropBorder = isDragging
      ? '2px dashed var(--color-bronze-light)'
      : '2px dashed var(--color-surface-500)';
    return (
      <button
        data-combo-slot={index}
        onClick={onClick}
        className="flex items-center justify-center cursor-pointer"
        style={{
          width: 'var(--gem-size)',
          height: 'var(--gem-size)',
          borderRadius: 'var(--gem-radius)',
          border: dropBorder,
          background: 'var(--color-surface-800)',
          color: 'var(--color-surface-300)',
          fontSize: 'var(--icon-md)',
          boxShadow: dropGlow,
          transition: 'box-shadow 0.2s, border-color 0.2s',
        }}
        aria-label="Empty combo slot"
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

  return (
    <div data-combo-slot={index} style={{ width: 'var(--gem-size)', height: 'var(--gem-size)' }}>
      <GemCard
        uid={orb.uid}
        affixId={orb.affixId}
        affixName={affixName}
        tier={orb.tier}
        rarity={orb.rarity}
        category={category}
        tags={tags}
        statLabel={statLabel}
        compact
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
