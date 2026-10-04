import {
  CHAIN_SKILLS,
  movesOf,
  overtakeProgress,
  resolveChain,
  type Blow,
  type ChainSkill,
  type HeroStats,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useControlsStore } from '@/stores/controlsStore';
import type { ControlsConfig } from '@/features/controls/controls';
import { Button, Glyph, InputGlyph, type Binding } from '@/features/delve/kit';
import { manaStyle } from '../../format';
import { getDelveRegistry } from '../../registry';
import { SKILL_NAME, blowText, chainText, moveText } from '../../chains/chain-text';
import type { ChainEditorModel } from '../../chains/useChainEditor';
import type { AnvilChains } from './useAnvilChains';

/** The input a skill casts with, from the player's setup (the basic attack: the left button too). */
export function skillBinding(config: ControlsConfig, skill: ChainSkill): Binding {
  const action = skill === 'basic' ? 'attack' : skill;
  return {
    key: config.keys[action] ?? undefined,
    pad: config.pad[action] ?? undefined,
    mouse: skill === 'basic' ? 'lmb' : undefined,
  };
}

/**
 * The Skills tab's left pane: the four skills as a sub tab list (`[` `]`, LT RT), each with its
 * input's glyph, its payment, five slot dots (moves, open slots, slots to buy) and its chain's
 * names, then the mana pair box, whose Realign opens the Mana view.
 */
export function SkillList({
  ed,
  anvil,
  onMana,
}: {
  ed: ChainEditorModel;
  anvil: AnvilChains;
  onMana: () => void;
}) {
  const registry = getDelveRegistry();
  const config = useControlsStore((s) => s.config);
  const { chains, caps, stats, absentText } = anvil.editor;
  const cap = registry.getDelveBalance().chains.cap;
  const weapon = anvil.weapon ? registry.getGearBase(anvil.weapon.baseId).name : 'your fists';

  return (
    <aside className="k-scroll flex min-h-0 flex-col gap-2" aria-label="Skills">
      <span className="k-label pl-1">Skills on {weapon}</span>
      <div
        role="tablist"
        aria-label="Skills"
        aria-orientation="vertical"
        data-pad-tabs="sub"
        className="flex flex-col gap-2"
      >
        {CHAIN_SKILLS.map((s) => {
          const chain = chains[s];
          const moves = chain ? movesOf(chain) : [];
          const on = ed.skill === s;
          const els = moves.map((m) => ('element' in m ? m.element : m.elements[0]));
          const color = els[0] ? manaStyle(registry, els[0]).color : 'var(--k-steel-3)';
          const summary = !chain
            ? (absentText?.(s) ?? '')
            : s === 'basic'
              ? chainText((moves as Blow[]).map((b) => blowText(registry, b)))
              : chainText(resolveChain(registry, stats, s, chains[s]!).moves.map(moveText));
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={on}
              className="k-panel k-plate text-left"
              style={{
                padding: '12px 16px',
                gap: 8,
                borderColor: on ? 'var(--k-hot)' : undefined,
                background: on ? 'var(--k-wood-0)' : undefined,
              }}
              onClick={() => ed.pick(s)}
              data-testid={`chain-skill-${s}`}
              data-tutorial={s === 'primary' ? 'skills.primary' : undefined}
            >
              <span className="flex items-center gap-2.5">
                <InputGlyph binding={skillBinding(config, s)} size="sm" />
                <span className="k-disp text-[19px]">{SKILL_NAME[s]}</span>
                <span className="ml-auto text-[14px] text-[var(--k-text-3)]">
                  {!chain ? 'locked' : s === 'basic' ? 'free' : chains[s]!.payment}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                {Array.from({ length: cap[s] }, (_, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="h-1.5 w-8"
                    style={{
                      background:
                        i < moves.length
                          ? color
                          : i < (caps[s] ?? 0)
                            ? 'var(--k-steel-1)'
                            : 'var(--k-well)',
                    }}
                  />
                ))}
                <span className="ml-auto text-[14px]">
                  {chain ? `${moves.length} of ${caps[s]}` : 'Locked'}
                </span>
              </span>
              <span
                className="text-[14px] text-[var(--k-text-3)]"
                data-testid={on ? 'abilities-summary' : undefined}
              >
                {summary}
              </span>
            </button>
          );
        })}
      </div>
      <ManaPair stats={stats} onMana={onMana} />
    </aside>
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
    <div
      className="k-panel k-plate mt-auto flex-none"
      style={{ padding: 16, gap: 10 }}
      data-testid="mana-pair"
    >
      <div className="flex items-center justify-between">
        <span className="k-disp text-[17px]">Mana pair</span>
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
      <div className="flex gap-2">
        {[primary, secondary].flatMap((m) =>
          m ? (
            <span
              key={m}
              className="k-well flex flex-1 items-center justify-center gap-2 p-2 font-semibold"
              style={{ color: style(m).color }}
            >
              <Glyph id={m} size={16} color={style(m).color} /> {style(m).name} ·{' '}
              {stats.attunement[m]}
            </span>
          ) : (
            []
          ),
        )}
      </div>
      <div className="text-[14px] text-[var(--k-text-3)]">
        {secondary
          ? `${style(secondary).name} overtakes ${style(primary).name} past ${+overtake.need.toFixed(1)} (now ${overtake.have}). Reaction: ${registry.getReactionFor(primary, secondary).name}.`
          : 'No second element yet: bind one in the Mana view.'}
      </div>
    </div>
  );
}
