import { useMemo } from 'react';
import type { DataRegistry, OrbInstance } from '@alloy/engine';
import { HapticButton } from '@/components/HapticButton';
import { ELEMENT_GRADIENTS } from '@/shared/utils/element-theme';
import { getStatLabel, getStatAbbreviation } from '@/shared/utils/stat-label';
import { getGemArt } from '@/shared/utils/art-registry';

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
  comboSlots: [OrbInstance | null, OrbInstance | null, OrbInstance | null];
  registry: DataRegistry;
  canAfford: boolean;
  isDragging?: boolean;
  onSlotClick: (index: number) => void;
  onCombine: () => void;
  onClearAll: () => void;
}

function getOrbElement(orb: OrbInstance, registry: DataRegistry) {
  const affix = registry.getAffix(orb.affixId);
  if (!affix) return null;
  const elementTag = affix.tags.find((t: string) => ELEMENT_TAGS.has(t));
  return elementTag ?? null;
}

function getOrbStatText(orb: OrbInstance, registry: DataRegistry) {
  const affix = registry.getAffix(orb.affixId);
  if (!affix) return '';
  return getStatLabel(affix, orb);
}

type GlowSignal = 'none' | 'white' | 'gold';

function computeGlowSignal(
  slots: [OrbInstance | null, OrbInstance | null, OrbInstance | null],
  registry: DataRegistry,
): GlowSignal {
  const filled = slots.filter((s): s is OrbInstance => s !== null);
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
  isDragging,
  onSlotClick,
  onCombine,
  onClearAll,
}: CombineWorkbenchProps) {
  const glowSignal = useMemo(
    () => computeGlowSignal(comboSlots, registry),
    [comboSlots, registry],
  );

  const filledCount = comboSlots.filter(Boolean).length;

  return (
    <section
      className="rounded-lg p-3"
      style={{
        border: '1px solid var(--color-surface-600)',
        boxShadow: 'inset 0 0 30px rgba(212,168,52,0.04)',
      }}
    >
      {/* Header */}
      <h3
        className="text-center uppercase mb-2"
        style={{
          fontSize: '10px',
          color: 'var(--color-bronze-light)',
          fontFamily: 'var(--font-family-display)',
          letterSpacing: '0.06em',
        }}
      >
        {'\u2692'} COMBINATION WORKBENCH
      </h3>

      {/* Slots row */}
      <div className="flex items-center justify-center gap-1.5 mb-3">
        {comboSlots.map((orb, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            {idx > 0 && (
              <span
                style={{
                  fontSize: '16px',
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
              glowSignal={glowSignal}
              isDragging={isDragging}
              onClick={() => onSlotClick(idx)}
            />
          </div>
        ))}

        {/* Arrow */}
        <span
          style={{
            fontSize: '16px',
            color: 'var(--color-surface-300)',
            marginLeft: '4px',
            marginRight: '4px',
          }}
        >
          {'\u25B6'}
        </span>

        {/* Result box */}
        <ResultBox glowSignal={glowSignal} />
      </div>

      {/* Buttons row */}
      <div className="flex justify-center gap-2">
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
    </section>
  );
}

/* ---- Slot ---- */

function Slot({
  index,
  orb,
  registry,
  glowSignal,
  isDragging,
  onClick,
}: {
  index: number;
  orb: OrbInstance | null;
  registry: DataRegistry;
  glowSignal: GlowSignal;
  isDragging?: boolean;
  onClick: () => void;
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
          width: '52px',
          height: '52px',
          borderRadius: '8px',
          border: dropBorder,
          background: 'var(--color-surface-800)',
          color: 'var(--color-surface-300)',
          fontSize: '16px',
          boxShadow: dropGlow,
          transition: 'box-shadow 0.2s, border-color 0.2s',
        }}
        aria-label="Empty combo slot"
      >
        ?
      </button>
    );
  }

  const element = getOrbElement(orb, registry);
  const emoji = element ? ELEMENT_SYMBOLS[element] : '?';
  const statText = getOrbStatText(orb, registry);
  const gradient = element ? ELEMENT_GRADIENTS[element] : null;
  const borderColor = gradient?.border ?? 'var(--color-surface-500)';

  const filledShadow =
    glowSignal === 'gold'
      ? '0 0 16px rgba(212,168,52,0.5)'
      : glowSignal === 'white'
        ? '0 0 12px rgba(255,255,255,0.3)'
        : 'none';

  const filledBorder =
    glowSignal === 'gold' ? 'var(--color-compound)' : borderColor;

  const artUrl = getGemArt(orb.affixId);
  const bgGradient = gradient
    ? `linear-gradient(135deg, ${gradient.bg})`
    : 'var(--color-surface-800)';

  return (
    <button
      data-combo-slot={index}
      onClick={onClick}
      className="flex flex-col items-center justify-center cursor-pointer overflow-hidden"
      style={{
        width: '52px',
        height: '52px',
        borderRadius: '8px',
        border: `2px solid ${filledBorder}`,
        background: bgGradient,
        boxShadow: filledShadow,
        position: 'relative',
      }}
      aria-label={`Combo slot: ${element ?? 'unknown'} orb`}
    >
      {/* Specular highlight */}
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
          alt={orb.affixId}
          style={{ width: 36, height: 36, objectFit: 'contain', position: 'relative', zIndex: 1 }}
        />
      ) : (
        <span style={{ fontSize: '20px', lineHeight: 1, position: 'relative', zIndex: 1 }}>{emoji}</span>
      )}
    </button>
  );
}

/* ---- Result Box ---- */

function ResultBox({ glowSignal }: { glowSignal: GlowSignal }) {
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
        width: '52px',
        height: '52px',
        borderRadius: '8px',
        border: `2px ${borderStyle} ${borderColor}`,
        background: 'var(--color-surface-800)',
        boxShadow: shadow,
        fontSize: '16px',
        color: symbolColor,
        animation: isGold ? 'pulse-glow 1.5s ease-in-out infinite' : undefined,
      }}
      aria-live="polite"
      aria-label={
        isGold
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
