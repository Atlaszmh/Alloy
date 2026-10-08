import { ABILITY_SLOTS, RARITY_ORDER, type ChainSkill, type Rarity } from '@alloy/engine';
import { useControlsStore } from '@/stores/controlsStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import type { KeyAction } from '@/features/controls/controls';
import { InputGlyph } from '@/features/delve/kit';
import { getDelveRegistry } from '../../registry';
import { SKILL_NAME } from '../../chains/chain-text';
import { pct } from '../forge/materials-text';

/** Help's topics (the pad-first spec, 4): How to delve, one topic a page. */
export type HelpTopicId = 'controls' | 'weapons' | 'skills' | 'forge' | 'floor' | 'banking';

/** Help's topics in their order, each with its title (the dialog's tabs, the Codex's cards). */
export const HELP_TOPICS: { id: HelpTopicId; title: string }[] = [
  { id: 'controls', title: 'Controls' },
  { id: 'weapons', title: 'Weapons' },
  { id: 'skills', title: 'Skills' },
  { id: 'forge', title: 'The forge' },
  { id: 'floor', title: 'The floor' },
  { id: 'banking', title: 'Banking' },
];

/**
 * One Help topic's page: the controls in the glyphs of the device in hand from the player's own
 * bindings (and attacking and the dodge), what a weapon carries (the engine's words), the chains,
 * materials and the forge, the floor, and banking with what a death costs (the balance's share).
 */
export function HelpPage({ topic }: { topic: HelpTopicId }) {
  const registry = getDelveRegistry();
  const cfg = useControlsStore((s) => s.config);
  const pad = useInputDeviceStore((s) => s.device) === 'gamepad';
  /** An action's glyph on the device in hand; nothing when it is unbound there. */
  const g = (a: KeyAction) => {
    const key = cfg.keys[a];
    const button = a in cfg.pad ? cfg.pad[a as keyof typeof cfg.pad] : null;
    if (pad ? !button : !key) return null;
    return <InputGlyph size="sm" binding={{ key: key ?? undefined, pad: button ?? undefined }} />;
  };
  // The least rarity whose weapons start with a slot of a skill (the slot table).
  const slots = registry.getDelveBalance().movesets.slots;
  const startsFrom = (s: ChainSkill): Rarity | null =>
    RARITY_ORDER.find((r) => slots[r][s][0] > 0) ?? null;
  const startsText = (s: ChainSkill) => {
    const from = startsFrom(s);
    return from === 'common' ? 'every weapon' : from ? `${from} weapons and better` : 'none';
  };
  const loss = pct(registry.getDelveBalance().crafting.deathLoss);
  return (
    <div
      className="flex flex-col gap-2 text-[18px] leading-relaxed text-[var(--k-text-2)]"
      data-testid="delve-howto"
      data-topic={topic}
    >
      {topic === 'controls' && (
        <>
          {pad ? (
            <p>
              The left stick moves and the right stick aims. {g('primary')} casts your Primary,{' '}
              {g('defensive')} your Defensive and {g('ultimate')} your Ultimate; {g('potion')}{' '}
              drinks a potion. The D-pad and <InputGlyph size="sm" binding={{ pad: 'a' }} /> work
              every menu.
            </p>
          ) : (
            <p>
              {g('up')}
              {g('left')}
              {g('down')}
              {g('right')} move you (or hold the mouse to walk toward it). {g('primary')}{' '}
              {g('defensive')} {g('ultimate')} cast your Primary, Defensive and Ultimate: hold one
              to aim with the mouse. {g('potion')} drinks a potion.
            </p>
          )}
          <p>
            Your hero attacks whatever is in reach and builds mana (or attack by hand: switch it in
            Controls). {g('dodge')} dodges: keep steering as you dash to curve it, and dodge through
            a blow just as it lands for a <b className="text-[var(--k-hot-hi)]">PERFECT</b>, and
            your next hit crits and staggers.
          </p>
        </>
      )}
      {topic === 'weapons' && (
        <div data-testid="howto-carries">
          <p>
            Your weapon holds your skills in slots: every weapon your Basic chain, and its rarity
            sets how many slots each skill starts with and can grow to:
          </p>
          <ul className="flex flex-col gap-1 pl-4">
            {ABILITY_SLOTS.map((s) => (
              <li key={s} data-testid={`howto-carry-${s}`}>
                {g(s)} <b className="text-[var(--k-text)]">{SKILL_NAME[s]}</b>: {startsText(s)}
              </li>
            ))}
          </ul>
          <p>
            A skill your weapon has no slot for opens on the Forge's Temper bench, for flux, Links
            and scrap.
          </p>
          <p>
            Forge your first weapon from your starting kit on the Forge tab: with{' '}
            {startsFrom('defensive')} flux it holds a Defensive {g('defensive')} too.
          </p>
        </div>
      )}
      {topic === 'skills' && (
        <p>
          Each skill is a chain of moves: build them on the{' '}
          <b className="text-[var(--k-text)]">Skills</b> tab, each move a kind (light, medium,
          heavy, or a hold you charge), a form and one or two elements. Each press casts the chain's
          next move, each harder than the last; a pause starts it over. Links buy more slots. Gear
          attunes you to its element and powers those moves.
        </p>
      )}
      {topic === 'forge' && (
        <p>
          Foes burst with materials: bars, flux, shards, Mana Dust and scrap fly to you, and gear
          drops only from elites and bosses (walk over it). Between dives, forge your gear from
          materials on the Forge tab: a pattern, a bar for its level, flux for its rarity and shards
          for its lines. A green <b className="text-[var(--k-ok)]">▲</b> marks an upgrade.
        </p>
      )}
      {topic === 'floor' && (
        <p>
          Each floor is rooms and halls under a fog: find its exit gate and press {g('interact')} at
          it to go on (on a boss floor, once the boss falls). Chests, shrines and alcoves open the
          same way.
        </p>
      )}
      {topic === 'banking' && (
        <p>
          Between depths, push deeper or <b className="text-[var(--k-hot)]">extract</b> to bring the
          dive home: each depth you clear banks its haul. Die and you lose the floor's haul and{' '}
          {loss} of what the dive banked; the gear and patterns you pick up are always yours. Each
          stop offers three boons. Take one: it lasts the dive, and some stack.
        </p>
      )}
    </div>
  );
}
