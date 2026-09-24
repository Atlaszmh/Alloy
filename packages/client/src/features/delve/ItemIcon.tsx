import { useId } from 'react';
import type { Rarity } from '@alloy/engine';
import { RARITY_COLOR } from './format';

/**
 * Hand-drawn gear silhouettes (64×64 viewBox) filled with a rarity gradient.
 * One shape per gear base so weapons read differently at a glance.
 */
const SHAPES: Record<string, { d: string; rotate?: number }> = {
  sword: {
    d: 'M32 3 L36 9 L36 40 L44 40 L44 45 L35 45 L35 54 L29 54 L29 45 L20 45 L20 40 L28 40 L28 9 Z M32 55 A3.5 3.5 0 1 1 31.99 55 Z',
    rotate: 45,
  },
  dagger: {
    d: 'M32 12 L36.5 19 L36.5 38 L43 38 L43 42.5 L35 42.5 L35 51 L29 51 L29 42.5 L21 42.5 L21 38 L27.5 38 L27.5 19 Z M32 52 A3 3 0 1 1 31.99 52 Z',
    rotate: 45,
  },
  axe: {
    d: 'M30 8 L34 8 L34 60 L30 60 Z M34 11 Q56 11 56 32 Q47 25 34 28 Z M30 13 Q18 14 16 24 Q22 21 30 23 Z',
    rotate: 30,
  },
  maul: {
    d: 'M30 20 L34 20 L34 60 L30 60 Z M14 6 L50 6 Q53 6 53 9 L53 21 Q53 24 50 24 L14 24 Q11 24 11 21 L11 9 Q11 6 14 6 Z',
    rotate: 35,
  },
  staff: {
    d: 'M30 21 L34 21 L34 61 L30 61 Z M32 3 A8.5 8.5 0 1 1 31.99 3 Z M25 20 Q32 25 39 20 L39 23 Q32 28 25 23 Z',
    rotate: 35,
  },
  wand: {
    d: 'M30.5 25 L33.5 25 L33.5 58 L30.5 58 Z M32.0 5.0 L34.5 11.6 L41.5 11.9 L36.0 16.3 L37.9 23.1 L32.0 19.2 L26.1 23.1 L28.0 16.3 L22.5 11.9 L29.5 11.6 Z',
    rotate: 40,
  },
  helm: {
    d: 'M12 38 Q12 8 32 8 Q52 8 52 38 L52 52 L41 52 L41 40 L23 40 L23 52 L12 52 Z M18 30 L46 30 L46 34 L18 34 Z',
  },
  cuirass: {
    d: 'M18 10 L26 8 Q32 15 38 8 L46 10 L55 22 L47 27 L47 54 Q32 61 17 54 L17 27 L9 22 Z',
  },
  gauntlets: {
    d: 'M17 58 L17 31 Q17 26 21.5 26 L21.5 15 Q21.5 10.5 25.5 10.5 Q29 10.5 29 15 L29 24 L29 11 Q29 6.5 32.8 6.5 Q36.5 6.5 36.5 11 L36.5 24 L36.5 13 Q36.5 8.5 40.2 8.5 Q44 8.5 44 13 L44 30 L47.5 25.5 Q51 22 53.5 25 L47 42 L47 58 Z',
  },
  greaves: {
    d: 'M21 6 L39 6 L39 36 L52 42 Q56 44 56 49 L56 58 L19 58 L19 40 Q21 38 21 34 Z',
  },
  amulet: {
    d: 'M32 27 L43 41 L32 58 L21 41 Z',
  },
  ring: {
    d: 'M32 14 L39 21.5 L32 28 L25 21.5 Z',
  },
};

export interface ItemIconProps {
  baseId: string;
  rarity: Rarity;
  size?: number | string;
  /** Render as a dim outline (empty paper-doll slot / unknown codex entry). */
  ghost?: boolean;
}

export function ItemIcon({ baseId, rarity, size = '100%', ghost = false }: ItemIconProps) {
  const gid = useId().replace(/:/g, '');
  const shape = SHAPES[baseId] ?? SHAPES.ring;
  const color = RARITY_COLOR[rarity];
  const transform = shape.rotate ? `rotate(${shape.rotate} 32 32)` : undefined;

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={`g${gid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity={ghost ? 0.08 : 0.95} />
          <stop offset="0.35" stopColor={color} stopOpacity={ghost ? 0.12 : 1} />
          <stop offset="1" stopColor={color} stopOpacity={ghost ? 0.05 : 0.45} />
        </linearGradient>
      </defs>
      <g transform={transform}>
        {baseId === 'amulet' && (
          <path
            d="M15 7 Q32 34 49 7"
            fill="none"
            stroke={ghost ? '#ffffff22' : '#d6d3d1'}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        )}
        {baseId === 'ring' && (
          <circle cx="32" cy="40" r="14" fill="none" stroke={`url(#g${gid})`} strokeWidth="6" />
        )}
        <path
          d={shape.d}
          fill={`url(#g${gid})`}
          fillRule="evenodd"
          stroke={ghost ? '#ffffff30' : 'rgba(0,0,0,0.55)'}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {baseId === 'cuirass' && (
          <path
            d="M32 17 L32 56 M20 34 Q32 39 44 34 M20 44 Q32 49 44 44"
            fill="none"
            stroke={ghost ? 'transparent' : 'rgba(0,0,0,0.45)'}
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}
      </g>
    </svg>
  );
}
