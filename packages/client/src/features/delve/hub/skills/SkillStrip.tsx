import { CHAIN_SKILLS, movesOf, overtakeProgress, type HeroStats } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { Button, Glyph, Tabs } from '@/features/delve/kit';
import { manaStyle } from '../../format';
import { getDelveRegistry } from '../../registry';
import { SKILL_NAME } from '../../chains/chain-text';
import type { ChainEditorModel } from '../../chains/useChainEditor';
import type { AnvilChains } from './useAnvilChains';

/**
 * The Skills tab's strip (the pad-first spec, 5): the four skills as a kit sub tab list (LT/RT,
 * `[` `]`; off the D-pad), each its name and one line, its moves of its slots and its payment, or,
 * dimmed, what carries it; then the mana pair, whose Realign opens the Mana view. No skill shows
 * its fight input: a combat glyph never labels a menu control (the grammar, rule 4).
 */
export function SkillStrip({
  ed,
  anvil,
  onMana,
}: {
  ed: ChainEditorModel;
  anvil: AnvilChains;
  onMana: () => void;
}) {
  const { chains, caps, absentText } = anvil.editor;
  return (
    // One pad group across the tab's width: up from any card reaches its one stop, Realign.
    <div className="flex flex-none items-center gap-6" data-pad-group="" data-testid="skill-strip">
      <Tabs
        aria-label="Skills"
        level="sub"
        glyphs
        value={ed.skill}
        onChange={ed.pick}
        tabs={CHAIN_SKILLS.map((s) => {
          const chain = chains[s];
          return {
            id: s,
            testId: `chain-skill-${s}`,
            tutorial: s === 'primary' ? 'skills.primary' : undefined,
            label: (
              <span className="flex flex-col items-start leading-tight">
                <span>{SKILL_NAME[s]}</span>
                {chain ? (
                  <span className="k-caption">
                    {movesOf(chain).length} of {caps[s]} ·{' '}
                    {s === 'basic' ? 'free' : chains[s]!.payment}
                  </span>
                ) : (
                  <span
                    className="k-note max-w-[220px] whitespace-normal opacity-60"
                    data-absent=""
                  >
                    {absentText?.(s)}
                  </span>
                )}
              </span>
            ),
          };
        })}
      />
      <ManaPair stats={anvil.editor.stats} onMana={onMana} />
    </div>
  );
}

/** The pair's attunement, the overtake line and their reaction, and the way to the Mana view. */
function ManaPair({ stats, onMana }: { stats: HeroStats; onMana: () => void }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const { primary, secondary } = profile.pair;
  if (!primary) return null;
  const style = (m: typeof primary) => manaStyle(registry, m);
  const overtake = overtakeProgress(registry, profile);
  return (
    <div className="ml-auto flex min-w-0 items-center gap-3" data-testid="mana-pair">
      {[primary, secondary].flatMap((m) =>
        m ? (
          <span
            key={m}
            className="k-well flex flex-none items-center gap-2 px-3 py-2 font-semibold"
            style={{ color: style(m).color }}
          >
            <Glyph id={m} size={16} color={style(m).color} /> {style(m).name} ·{' '}
            {stats.attunement[m]}
          </span>
        ) : (
          []
        ),
      )}
      <span className="k-note min-w-0">
        {secondary
          ? `${style(secondary).name} overtakes ${style(primary).name} past ${+overtake.need.toFixed(1)} (now ${overtake.have}). Reaction: ${registry.getReactionFor(primary, secondary).name}.`
          : 'No second element yet: bind one in the Mana view.'}
      </span>
      <Button
        variant="quiet"
        size="sm"
        onClick={onMana}
        data-tutorial="skills.mana"
        testId="mana-realign"
      >
        {secondary ? 'Realign ›' : 'Bind ›'}
      </Button>
    </div>
  );
}
