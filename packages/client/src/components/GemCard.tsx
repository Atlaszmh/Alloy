import type { AffixCategory, AffixTier, GemRarity } from '@alloy/engine';
import { getGemArt } from '@/shared/utils/art-registry';
import { TIER_COLORS } from '@/shared/utils/element-theme';
import { Tooltip } from './Tooltip';
import { GemDetailPanel } from './GemDetailPanel';

const ELEMENT_SYMBOLS: Record<string, string> = {
  fire: '\u{1F525}', cold: '\u{2744}', lightning: '\u{26A1}',
  poison: '\u{2620}', shadow: '\u{1F319}', chaos: '\u{1F300}', physical: '\u{2694}',
};

const RARITY_COLORS: Record<GemRarity, string> = {
  common: '#9ca3af',
  uncommon: '#2dd4bf',
  magic: '#3b82f6',
  rare: '#facc15',
  epic: '#a855f7',
  legendary: '#c2410c',
};

const RARITY_LABELS: Record<GemRarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  magic: 'Magic',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
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
  uid?: string;
  affixId: string;
  affixName: string;
  tier: AffixTier | 5;
  rarity?: GemRarity;
  category: AffixCategory | 'combined';
  tags: string[];
  statLabel: string;       // e.g., "+23", "+5%", "15%"
  description?: string;
  selected?: boolean;
  /** When true, name/category are hidden inside the gem — shown via tooltip instead */
  compact?: boolean;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
}

export function GemCard({
  uid,
  affixId,
  affixName,
  tier,
  rarity,
  category,
  tags,
  statLabel,
  description,
  selected = false,
  compact = false,
  onClick,
  onPointerDown,
}: GemCardProps) {
  const primaryTag = tags.find((t) => t in ELEMENT_GRADIENTS) ?? 'physical';
  const colors = ELEMENT_GRADIENTS[primaryTag] ?? ELEMENT_GRADIENTS.physical;
  const symbol = ELEMENT_SYMBOLS[primaryTag] ?? '\u{2B24}';
  const artUrl = getGemArt(affixId);
  const categoryLabel = CATEGORY_LABELS[category];
  const tierColor = TIER_COLORS[tier] ?? TIER_COLORS[1];
  const rarityColor = rarity ? RARITY_COLORS[rarity] : undefined;
  const rarityLabel = rarity ? RARITY_LABELS[rarity] : undefined;

  const rarityAnimation: Record<GemRarity, string | undefined> = {
    common: undefined,
    uncommon: 'shimmer-magic 4s ease-in-out infinite',
    magic: 'shimmer-magic 3s ease-in-out infinite',
    rare: 'shimmer-rare 2.5s ease-in-out infinite',
    epic: 'pulse-epic 2s ease-in-out infinite',
    legendary: 'legendary-aura 2.5s ease-in-out infinite',
  };

  const card = (
    <div
      data-gem={affixId}
      data-gem-uid={uid}
      data-gem-rarity={rarity}
      data-gem-tier={tier}
      className="flex flex-col items-center cursor-pointer transition-all duration-150 hover:scale-[1.08] hover:brightness-110 active:scale-[0.93]"
      style={{
        touchAction: 'none',
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        filter: selected ? `drop-shadow(0 0 14px ${colors.glow})` : undefined,
      }}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      {/* Gem shape — all info inside the gem frame */}
      <div
        style={{
          width: 'var(--gem-size)',
          height: 'var(--gem-size)',
          borderRadius: 'var(--gem-radius)',
          border: rarity === 'legendary'
            ? `3px solid ${rarityColor}`
            : rarityColor
              ? `2.5px solid ${rarityColor}`
              : `2.5px solid ${colors.border}`,
          background: `linear-gradient(135deg, ${colors.bg})`,
          position: 'relative',
          // NOTE: overflow:hidden + border-radius clips box-shadow in Chrome.
          // Children use borderRadius:'inherit' instead to self-clip.
          boxShadow: rarity && rarity !== 'common'
            ? undefined  // animation controls box-shadow
            : tier >= 3 ? `0 0 ${4 + tier * 2}px ${tierColor}` : undefined,
          animation: rarity ? rarityAnimation[rarity] : undefined,
        }}
      >
        {/* Specular highlight */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
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
              borderRadius: 'inherit',
              zIndex: 1,
            }}
          />
        ) : (
          <span style={{
            fontSize: 'var(--icon-md)',
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1,
          }}>{symbol}</span>
        )}

        {/* Stat value — top left */}
        <span
          style={{
            position: 'absolute',
            top: 'calc(var(--gem-size) * 0.05)',
            left: 'calc(var(--gem-size) * 0.06)',
            fontFamily: 'var(--font-family-display)',
            fontWeight: 700,
            fontSize: 'var(--text-sm)',
            color: 'rgba(255,255,255,0.95)',
            textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)',
            zIndex: 3,
          }}
        >
          {statLabel}
        </span>

        {/* Category dot — top right */}
        <div
          style={{
            position: 'absolute',
            top: 'calc(var(--gem-size) * 0.06)',
            right: 'calc(var(--gem-size) * 0.06)',
            width: 'calc(var(--gem-size) * 0.08)',
            height: 'calc(var(--gem-size) * 0.08)',
            borderRadius: '50%',
            background: colors.border,
            border: '1.5px solid rgba(255,255,255,0.3)',
            zIndex: 3,
          }}
        />

        {/* Tier dots — above the name band */}
        {tier > 1 && (
          <div
            style={{
              position: 'absolute',
              bottom: compact ? 'calc(var(--gem-size) * 0.06)' : 'calc(var(--gem-size) * 0.22)',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 'var(--gap-xs)',
              zIndex: 3,
            }}
          >
            {Array.from({ length: tier }, (_, i) => (
              <span
                key={i}
                style={{
                  display: 'block',
                  width: 'calc(var(--gem-size) * 0.06)',
                  height: 'calc(var(--gem-size) * 0.06)',
                  borderRadius: '50%',
                  backgroundColor: tierColor,
                  boxShadow: tier >= 3 ? `0 0 3px ${tierColor}` : undefined,
                }}
              />
            ))}
          </div>
        )}

        {/* Bottom gradient band with name — hidden in compact mode */}
        {!compact && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              borderRadius: 'inherit',
              background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.55) 55%, transparent 100%)',
              padding: 'calc(var(--gem-size) * 0.04) calc(var(--gem-size) * 0.06) calc(var(--gem-size) * 0.04)',
              textAlign: 'center',
              zIndex: 3,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-family-display)',
                fontWeight: 700,
                fontSize: 'var(--text-xs)',
                color: 'white',
                lineHeight: 1.15,
                textShadow: '0 1px 4px rgba(0,0,0,0.95)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {affixName}
            </div>
            {rarityLabel && rarity !== 'common' && (
              <div
                style={{
                  fontFamily: 'var(--font-family-display)',
                  fontWeight: 600,
                  fontSize: 'var(--text-2xs)',
                  color: rarityColor,
                  lineHeight: 1.1,
                  textShadow: '0 1px 3px rgba(0,0,0,0.95)',
                }}
              >
                {rarityLabel}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // Compact mode: always show tooltip with name + category + stat
  // Normal mode: show tooltip only if description exists
  const tooltipContent = compact ? (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontWeight: 700, color: 'white', fontFamily: 'var(--font-family-display)' }}>{affixName}</div>
      {rarityLabel && <div style={{ fontSize: '0.85em', color: rarityColor }}>{rarityLabel}</div>}
      <div style={{ fontSize: '0.85em', color: colors.border }}>{categoryLabel}</div>
      {statLabel && <div style={{ fontSize: '0.85em', color: 'var(--color-surface-300)' }}>{statLabel}</div>}
    </div>
  ) : description ? (
    <GemDetailPanel
      affixName={affixName}
      description={description}
      category={CATEGORY_LABELS[category] ?? category}
      tags={tags}
      statLabel={statLabel}
      tier={tier}
    />
  ) : null;

  return tooltipContent ? (
    <Tooltip content={tooltipContent}>
      {card}
    </Tooltip>
  ) : card;
}
