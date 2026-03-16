import type { AffixCategory, AffixTier } from '@alloy/engine';

const ELEMENT_COLORS: Record<string, string> = {
  fire: 'var(--color-fire)',
  cold: 'var(--color-cold)',
  lightning: 'var(--color-lightning)',
  poison: 'var(--color-poison)',
  shadow: 'var(--color-shadow)',
  chaos: 'var(--color-chaos)',
  physical: '#c0c0c0',
};

// Inner gradient colors for element identity (center → edge)
const ELEMENT_GRADIENTS: Record<string, [string, string]> = {
  fire: ['#e8553a', '#8a2010'],
  cold: ['#3a9be8', '#1a4a8a'],
  lightning: ['#d4c040', '#8a7a10'],
  poison: ['#2db369', '#105a30'],
  shadow: ['#8b3ae8', '#3a1070'],
  chaos: ['#e83a8b', '#7a1050'],
  physical: ['#c0c0c0', '#606060'],
};

const TIER_BORDERS: Record<AffixTier, string> = {
  1: 'var(--color-tier-1)',
  2: 'var(--color-tier-2)',
  3: 'var(--color-tier-3)',
  4: 'var(--color-tier-4)',
};

// Tier halo intensity
const TIER_GLOW: Record<AffixTier, number> = {
  1: 0,
  2: 0.15,
  3: 0.25,
  4: 0.4,
};

const CATEGORY_SHAPES: Record<AffixCategory, string> = {
  offensive: 'M12 2l3 9h9l-7 5 3 9-8-6-8 6 3-9-7-5h9z',
  defensive: 'M12 3L3 21h18z',
  sustain: 'M12 4a8 8 0 100 16 8 8 0 000-16z',
  utility: 'M4 4h16v16H4z',
  trigger: 'M12 2l4 8 8 2-6 5 2 9-8-5-8 5 2-9-6-5 8-2z',
};

const ELEMENT_SYMBOLS: Record<string, string> = {
  fire: '\u{1F525}',
  cold: '\u{2744}',
  lightning: '\u{26A1}',
  poison: '\u{2620}',
  shadow: '\u{1F319}',
  chaos: '\u{1F300}',
  physical: '\u{2694}',
};

interface OrbIconProps {
  affixId: string;
  affixName: string;
  tier: AffixTier;
  category: AffixCategory;
  tags: string[];
  size?: 'sm' | 'md' | 'lg';
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

const SIZE_MAP = { sm: 32, md: 48, lg: 60 };

export function OrbIcon({
  affixName,
  tier,
  category,
  tags,
  size = 'md',
  selected = false,
  disabled = false,
  onClick,
}: OrbIconProps) {
  const px = SIZE_MAP[size];
  const primaryTag = tags.find((t) => t in ELEMENT_COLORS) ?? 'physical';
  const color = ELEMENT_COLORS[primaryTag] ?? ELEMENT_COLORS.physical;
  const gradient = ELEMENT_GRADIENTS[primaryTag] ?? ELEMENT_GRADIENTS.physical;
  const borderColor = TIER_BORDERS[tier];
  const glowIntensity = TIER_GLOW[tier];
  const symbol = ELEMENT_SYMBOLS[primaryTag] ?? '\u{2B24}';
  const gradientId = `grad-${primaryTag}-${tier}`;

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={`${affixName} (T${tier})`}
      className="relative flex items-center justify-center transition-all duration-150 hover:scale-[1.08] hover:brightness-110 active:scale-95"
      style={{
        width: px,
        height: px,
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? 'default' : 'pointer',
        filter: selected ? `drop-shadow(0 0 8px ${color})` : glowIntensity > 0 ? `drop-shadow(0 0 ${4 + glowIntensity * 8}px ${color})` : undefined,
        animation: selected ? 'orb-glow 1.5s ease-in-out infinite' : undefined,
      }}
    >
      {/* SVG shape with element gradient fill */}
      <svg
        viewBox="0 0 24 24"
        width={px}
        height={px}
        className="absolute inset-0"
      >
        <defs>
          <radialGradient id={gradientId} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor={gradient[0]} stopOpacity={0.5} />
            <stop offset="100%" stopColor={gradient[1]} stopOpacity={0.15} />
          </radialGradient>
        </defs>
        <path
          d={CATEGORY_SHAPES[category]}
          fill={`url(#${gradientId})`}
          stroke={borderColor}
          strokeWidth={selected ? 2.5 : 1.5}
        />
      </svg>

      {/* Element symbol */}
      <span
        className="relative z-10 select-none"
        style={{ fontSize: px * 0.32 }}
        role="img"
        aria-label={primaryTag}
      >
        {symbol}
      </span>

      {/* Tier dots */}
      <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 gap-0.5">
        {Array.from({ length: tier }, (_, i) => (
          <span
            key={i}
            className="block rounded-full"
            style={{
              width: Math.max(3, px * 0.07),
              height: Math.max(3, px * 0.07),
              backgroundColor: borderColor,
              boxShadow: tier >= 3 ? `0 0 3px ${borderColor}` : undefined,
            }}
          />
        ))}
      </div>

      {/* Selection ring */}
      {selected && (
        <div
          className="absolute inset-0 rounded-full"
          style={{ boxShadow: `0 0 12px 3px ${color}, inset 0 0 4px ${color}` }}
        />
      )}
    </button>
  );
}
