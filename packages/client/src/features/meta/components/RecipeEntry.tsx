import type { StatModifier } from '@alloy/engine';

interface RecipeEntryProps {
  component1Name: string;
  component2Name: string;
  resultName: string;
  weaponEffects: StatModifier[];
  armorEffects: StatModifier[];
  tags: string[];
  discovered?: boolean;
  /** Optional formatter for compound stat keys → human-readable text */
  formatCompoundStat?: (key: string, value: number) => string;
  /** Optional color class resolver for stat keys */
  getStatColorClass?: (key: string) => string;
}

function formatModifier(mod: StatModifier): string {
  const sign = mod.value >= 0 ? '+' : '';
  if (mod.op === 'percent') return `${sign}${mod.value}% ${mod.stat}`;
  if (mod.op === 'override') return `${mod.stat} = ${mod.value}`;
  return `${sign}${mod.value} ${mod.stat}`;
}

function renderModifier(
  mod: StatModifier,
  formatCompoundStat?: (key: string, value: number) => string,
  getStatColorClass?: (key: string) => string,
  fallbackColor?: string,
): { text: string; colorClass: string } {
  if (formatCompoundStat && mod.stat.startsWith('compound.')) {
    const text = formatCompoundStat(mod.stat, mod.value);
    const colorClass = getStatColorClass ? getStatColorClass(mod.stat) : (fallbackColor ?? 'text-surface-300');
    return { text, colorClass };
  }
  return { text: formatModifier(mod), colorClass: fallbackColor ?? 'text-surface-300' };
}

export function RecipeEntry({
  component1Name,
  component2Name,
  resultName,
  weaponEffects,
  armorEffects,
  tags,
  discovered = true,
  formatCompoundStat,
  getStatColorClass,
}: RecipeEntryProps) {
  if (!discovered) {
    return (
      <div className="rounded-lg border border-surface-700 bg-surface-800/50 p-3 opacity-60">
        <div className="text-sm italic text-surface-300">??? + ??? = ???</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-surface-600 bg-surface-800 p-3 shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-transform hover:translate-x-0.5">
      <div className="mb-2 flex items-center gap-2 text-sm">
        <span className="font-medium text-white">{component1Name}</span>
        <span className="text-surface-300">+</span>
        <span className="font-medium text-white">{component2Name}</span>
        <span className="text-surface-300">=</span>
        <span className="font-semibold text-accent-400">{resultName}</span>
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded bg-surface-700 px-1.5 py-0.5 text-xs text-surface-300"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {weaponEffects.length > 0 && (
          <div>
            <span className="text-surface-300">Weapon:</span>
            {weaponEffects.map((mod, i) => {
              const { text, colorClass } = renderModifier(mod, formatCompoundStat, getStatColorClass, 'text-orange-300');
              return (
                <span key={i} className={`ml-1 font-mono ${colorClass}`}>
                  {text}
                </span>
              );
            })}
          </div>
        )}
        {armorEffects.length > 0 && (
          <div>
            <span className="text-surface-300">Armor:</span>
            {armorEffects.map((mod, i) => {
              const { text, colorClass } = renderModifier(mod, formatCompoundStat, getStatColorClass, 'text-blue-300');
              return (
                <span key={i} className={`ml-1 font-mono ${colorClass}`}>
                  {text}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
