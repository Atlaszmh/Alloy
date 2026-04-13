import type { GemRarity } from '@alloy/engine';
import { getGemArt } from '@/shared/utils/art-registry';

const ELEMENT_SYMBOLS: Record<string, string> = {
  fire: '\u{1F525}', cold: '\u{2744}', lightning: '\u{26A1}',
  poison: '\u{2620}', shadow: '\u{1F319}', chaos: '\u{1F300}', physical: '\u{2694}',
};

const RARITY_BORDER_COLORS: Record<GemRarity, string> = {
  common: 'var(--color-surface-500)',
  magic: '#3b82f6',
  rare: '#eab308',
  epic: '#a855f7',
  legendary: '#f59e0b',
};

const CHIP_BG: Record<string, string> = {
  fire: 'rgba(232,85,58,0.25)', cold: 'rgba(58,155,232,0.25)',
  lightning: 'rgba(212,192,64,0.25)', poison: 'rgba(45,179,105,0.25)',
  shadow: 'rgba(139,58,232,0.25)', chaos: 'rgba(232,58,139,0.25)',
  physical: 'rgba(192,192,192,0.15)',
};

const CHIP_BORDER: Record<string, string> = {
  fire: 'var(--color-fire)', cold: 'var(--color-cold)',
  lightning: 'var(--color-lightning)', poison: 'var(--color-poison)',
  shadow: 'var(--color-shadow)', chaos: 'var(--color-chaos)',
  physical: '#8a8a8a',
};

interface GemChipProps {
  affixId?: string;
  affixName?: string;
  statLabel?: string;
  tags?: string[];
  rarity?: GemRarity;
  newest?: boolean;
  empty?: boolean;
}

export function GemChip({ affixId, affixName, statLabel, tags, rarity, newest = false, empty = false }: GemChipProps) {
  if (empty) {
    return (
      <div
        style={{
          borderRadius: 'var(--gem-radius-sm)',
          border: '1px dashed var(--color-surface-500)',
          minHeight: 'var(--gem-size-sm)',
          opacity: 0.25,
        }}
      />
    );
  }

  const primaryTag = tags?.find((t) => t in CHIP_BG) ?? 'physical';
  const bg = CHIP_BG[primaryTag] ?? CHIP_BG.physical;
  const border = CHIP_BORDER[primaryTag] ?? CHIP_BORDER.physical;
  const symbol = ELEMENT_SYMBOLS[primaryTag] ?? '\u{2B24}';
  const artUrl = affixId ? getGemArt(affixId) : null;
  const rarityBorder = rarity ? RARITY_BORDER_COLORS[rarity] : undefined;

  return (
    <div
      className="flex items-center gap-[5px]"
      style={{
        padding: 'var(--gap-xs) var(--gap-sm) var(--gap-xs) var(--gap-xs)',
        borderRadius: 'var(--gem-radius-sm)',
        background: 'var(--color-surface-700)',
        border: newest
          ? '1px solid var(--color-danger)'
          : rarityBorder && rarity !== 'common'
            ? `1px solid ${rarityBorder}`
            : '1px solid var(--color-surface-500)',
        animation: newest ? 'pop-in 0.4s ease-out' : undefined,
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 'var(--gem-size-sm)',
          height: 'var(--gem-size-sm)',
          borderRadius: 'var(--gem-radius-sm)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 'var(--text-sm)',
          border: `1.5px solid ${border}`,
          background: bg,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.15), transparent 60%)',
          }}
        />
        {artUrl ? (
          <img src={artUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--gem-radius-sm)', zIndex: 1 }} />
        ) : (
          <span style={{ position: 'relative', zIndex: 1 }}>{symbol}</span>
        )}
      </div>

      {/* Text */}
      <div style={{ minWidth: 0, overflow: 'hidden' }}>
        <div
          style={{
            fontFamily: 'var(--font-family-display)',
            fontSize: 'var(--text-sm)',
            fontWeight: 700,
            color: 'white',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {affixName ?? ''}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-family-display)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: 'var(--color-accent-300)',
            whiteSpace: 'nowrap',
          }}
        >
          {statLabel ?? ''}
        </div>
      </div>
    </div>
  );
}
