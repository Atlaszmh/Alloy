/** Map element names to Tailwind text color classes */
const ELEMENT_COLOR_CLASS: Record<string, string> = {
  ignite: 'text-fire',
  burn: 'text-fire',
  fire: 'text-fire',
  chill: 'text-cold',
  freeze: 'text-cold',
  cold: 'text-cold',
  shock: 'text-lightning',
  lightning: 'text-lightning',
  electrocute: 'text-lightning',
  poison: 'text-poison',
  venom: 'text-poison',
  blight: 'text-poison',
  shadow: 'text-shadow',
  curse: 'text-shadow',
  wither: 'text-shadow',
  chaos: 'text-chaos',
};

/**
 * Translates raw compound stat keys into human-readable descriptions.
 * Examples:
 *   "compound.ignite.chance" + 15    → "15% proc chance"
 *   "compound.ignite.dotMultiplier" + 2 → "2x DOT multiplier"
 */
export function formatCompoundStat(key: string, value: number): string {
  const parts = key.split('.');

  if (parts.length === 3 && parts[0] === 'compound') {
    const suffix = parts[2];

    switch (suffix) {
      case 'chance':
        return `${value}% proc chance`;
      case 'dotMultiplier':
        return `${value}x DOT multiplier`;
      case 'duration':
        return `${value}s duration`;
      case 'chainDamage':
        return `+${value} chain damage`;
      case 'damageMultiplier':
        return `${value}x damage multiplier`;
      case 'radius':
        return `${value} radius`;
      case 'stacks':
        return `${value} max stacks`;
      case 'penetration':
        return `${value}% penetration`;
      case 'slowAmount':
        return `${value}% slow`;
      case 'healAmount':
        return `+${value} heal`;
      case 'drainPercent':
        return `${value}% drain`;
      default:
        return `${value >= 0 ? '+' : ''}${value} ${suffix}`;
    }
  }

  return `${value >= 0 ? '+' : ''}${value} ${key}`;
}

/** Extract the element name from a compound stat key */
function getElementFromKey(key: string): string | null {
  const parts = key.split('.');
  if (parts.length >= 2 && parts[0] === 'compound') {
    return parts[1];
  }
  return null;
}

/** Get the Tailwind color class for a stat key based on its element */
export function getStatColorClass(key: string): string {
  const element = getElementFromKey(key);
  if (element && ELEMENT_COLOR_CLASS[element]) {
    return ELEMENT_COLOR_CLASS[element];
  }
  return 'text-surface-300';
}
