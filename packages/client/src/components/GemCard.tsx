import type { AffixCategory, AffixTier } from '@alloy/engine';
import { getGemArt } from '@/shared/utils/art-registry';
import { TIER_COLORS } from '@/shared/utils/element-theme';

const ELEMENT_SYMBOLS: Record<string, string> = {
  fire: '\u{1F525}', cold: '\u{2744}', lightning: '\u{26A1}',
  poison: '\u{2620}', shadow: '\u{1F319}', chaos: '\u{1F300}', physical: '\u{2694}',
};

const ELEMENT_GRADIENTS: Record<string, { bg: string; border: string; glow: string }> = {
  fire:      { bg: 'rgba(232,85,58,0.4),rgba(232,85,58,0.12)',   border: 'var(--color-fire)',      glow: 'var(--color-fire)' },
  cold:      { bg: 'rgba(58,155,232,0.4),rgba(58,155,232,0.12)', border: 'var(--color-cold)',      glow: 'var(--color-cold)' },
  lightning: { bg: 'rgba(212,192,64,0.4),rgba(212,192,64,0.12)', border: 'var(--color-lightning)', glow: 'var(--color-lightning)' },
  poison:    { bg: 'rgba(45,179,105,0.4),rgba(45,179,105,0.12)', border: 'var(--color-poison)',    glow: 'var(--color-poison)' },
  shadow:    { bg: 'rgba(139,58,232,0.4),rgba(139,58,232,0.12)', border: 'var(--color-shadow)',    glow: 'var(--color-shadow)' },
  chaos:     { bg: 'rgba(232,58,139,0.4),rgba(232,58,139,0.12)', border: 'var(--color-chaos)',     glow: 'var(--color-chaos)' },
  physical:  { bg: 'rgba(192,192,192,0.3),rgba(120,120,120,0.1)', border: '#9a9a9a',               glow: '#c0c0c0' },
};

const CATEGORY_LABELS: Record<string, string> = {
  offensive: 'Offensive', defensive: 'Defense', sustain: 'Sustain', utility: 'Utility', trigger: 'Trigger',
  combined: 'Combined',
};

interface GemCardProps {
  affixId: string;
  affixName: string;
  tier: AffixTier;
  category: AffixCategory | 'combined';
  tags: string[];
  statLabel: string;       // e.g., "+23", "+5%", "15%"
  gemSize: number;         // px
  emojiSize: number;       // px
  statSize: number;        // px — stat value inside gem
  nameSize: number;        // px — name below gem
  catSize: number;         // px — category below name
  selected?: boolean;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
}

export function GemCard({
  affixId,
  affixName,
  tier,
  category,
  tags,
  statLabel,
  gemSize,
  emojiSize,
  statSize,
  nameSize,
  catSize,
  selected = false,
  onClick,
  onPointerDown,
}: GemCardProps) {
  const primaryTag = tags.find((t) => t in ELEMENT_GRADIENTS) ?? 'physical';
  const colors = ELEMENT_GRADIENTS[primaryTag] ?? ELEMENT_GRADIENTS.physical;
  const symbol = ELEMENT_SYMBOLS[primaryTag] ?? '\u{2B24}';
  const artUrl = getGemArt(affixId);
  const categoryLabel = CATEGORY_LABELS[category];
  const tierColor = TIER_COLORS[tier] ?? TIER_COLORS[1];

  return (
    <div
      data-gem={affixId}
      className="flex flex-col items-center cursor-pointer transition-all duration-150 hover:scale-[1.08] hover:brightness-110 active:scale-[0.93]"
      style={{
        touchAction: 'none',
        filter: selected ? `drop-shadow(0 0 14px ${colors.glow})` : undefined,
      }}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      {/* Gem shape with stat inside */}
      <div
        style={{
          width: gemSize,
          height: gemSize,
          borderRadius: gemSize * 0.16,
          border: `2.5px solid ${colors.border}`,
          background: `linear-gradient(135deg, ${colors.bg})`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          position: 'relative',
          overflow: 'hidden',
          boxShadow: tier >= 3 ? `0 0 ${4 + tier * 2}px ${tierColor}` : undefined,
        }}
      >
        {/* Specular highlight */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.2), transparent 55%)',
            pointerEvents: 'none',
          }}
        />

        {/* Emoji or custom art */}
        {artUrl ? (
          <img
            src={artUrl}
            alt={affixName}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              zIndex: 1,
            }}
          />
        ) : (
          <span style={{ fontSize: emojiSize, position: 'relative', zIndex: 1 }}>{symbol}</span>
        )}

        {/* Stat value inside gem */}
        <span
          style={{
            fontFamily: 'var(--font-family-display)',
            fontWeight: 700,
            fontSize: statSize,
            color: 'rgba(255,255,255,0.92)',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {statLabel}
        </span>

        {/* Tier dots */}
        <div
          style={{
            display: 'flex',
            gap: Math.max(2, gemSize * 0.03),
            position: 'relative',
            zIndex: 1,
          }}
        >
          {Array.from({ length: tier }, (_, i) => (
            <span
              key={i}
              style={{
                display: 'block',
                width: Math.max(3, gemSize * 0.07),
                height: Math.max(3, gemSize * 0.07),
                borderRadius: '50%',
                backgroundColor: tierColor,
                boxShadow: tier >= 3 ? `0 0 3px ${tierColor}` : undefined,
              }}
            />
          ))}
        </div>
      </div>

      {/* Name below gem */}
      <span
        style={{
          fontFamily: 'var(--font-family-display)',
          fontWeight: 700,
          fontSize: nameSize,
          color: 'white',
          textAlign: 'center',
          marginTop: 2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: gemSize + 16,
        }}
      >
        {affixName}
      </span>

      {/* Category below name */}
      <span
        style={{
          fontFamily: 'var(--font-family-display)',
          fontWeight: 600,
          fontSize: catSize,
          color: 'var(--color-accent-300)',
          textAlign: 'center',
        }}
      >
        {categoryLabel}
      </span>
    </div>
  );
}
