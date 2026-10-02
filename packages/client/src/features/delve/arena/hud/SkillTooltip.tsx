import type { ArpgWorld } from '@alloy/engine';
import { TooltipCard } from '@/features/delve/kit';
import { getDelveRegistry } from '../../registry';
import { NumberTable, moveRows } from '../../chains/MoveEditor';
import { runeName } from '../../runes/rune-style';
import type { AbilityHud } from '../useArena';

/** The rows of `moveRows` the HUD's card shows: Hit, Cost (with the runes' load) and Beat after. */
const SHOWN = new Set(['hit', 'cost', 'beat']);

/**
 * The glass card beside a skill's row: the next move's name, "move n of m · kind", then its Hit,
 * Cost and Beat after from the hero's resolved chain (`moveNumbers`, `moveBeat`, through
 * `moveRows`), and its runes. Without the world (none yet) it shows the name line alone.
 */
export function SkillTooltip({
  slot,
  ab,
  world,
}: {
  slot: 0 | 1 | 2;
  ab: AbilityHud;
  world: ArpgWorld | null;
}) {
  const registry = getDelveRegistry();
  const hero = world?.hero;
  const move = hero?.chains[slot]?.moves[ab.chainStep];
  const rows =
    hero && move
      ? moveRows(move, null, hero.stats, hero.manaMax).rows.filter((r) => SHOWN.has(r.id))
      : [];
  return (
    <div className="[text-shadow:none]" data-testid={`skill-tooltip-${slot}`}>
      <TooltipCard
        material="glass"
        width={320}
        title={ab.name}
        subtitle={`move ${ab.chainStep + 1} of ${ab.chainLength} · ${ab.nextKind}`}
      >
        {rows.length > 0 && <NumberTable rows={rows} />}
        {ab.runes.length > 0 && (
          <div className="text-[14px] text-[var(--k-mana)]">
            {ab.runes.map((r) => runeName(registry, r)).join(' · ')}
          </div>
        )}
      </TooltipCard>
    </div>
  );
}
