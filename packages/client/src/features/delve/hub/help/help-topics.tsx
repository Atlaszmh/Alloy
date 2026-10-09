import { useControlsStore } from '@/stores/controlsStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import type { KeyAction } from '@/features/controls/controls';
import { InputGlyph } from '@/features/delve/kit';
import { getDelveRegistry } from '../../registry';
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
 * bindings (and attacking and the dodge), what a construct is and how a weapon expresses it (the classes, the slots, Move all), the chains,
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
  // What a common weapon holds for your Primary: the slot table's first row (spec §3.2).
  const commonPrimary = registry.getDelveBalance().movesets.slots.common.primary[0];
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
        <div data-testid="howto-constructs" className="flex flex-col gap-2">
          <p>
            A move is a <b className="text-[var(--k-text)]">construct</b>: a pattern that channels
            your mana. Your weapon decides how it's expressed. Daggers, swords, axes and mauls are{' '}
            <b className="text-[var(--k-text)]">melee</b> and staves, wands and bows{' '}
            <b className="text-[var(--k-text)]">ranged</b>: each class has forms of its own (a
            Strike, a Volley) and shares the rest, and each weapon casts in its own style (a sword's
            Balanced, a bow's Marksman).
          </p>
          <p>
            A weapon holds constructs in slots, more by rarity: a common one holds {commonPrimary}{' '}
            for your Primary {g('primary')} and none yet for your Defensive. Links buy slots up to
            its ceiling; a skill with no slot opens on the Forge's Temper bench, for flux.
          </p>
          <p>
            Taking a new weapon, <b className="text-[var(--k-text)]">Move all</b> moves every
            construct onto it, free: what doesn't fit goes to your move bag on the Skills tab, and a
            construct its class can't express sleeps in its slot until a weapon that can holds it.
          </p>
        </div>
      )}
      {topic === 'skills' && (
        <p>
          Each skill is a chain of moves: build them on the{' '}
          <b className="text-[var(--k-text)]">Skills</b> tab, each move a kind (light, medium,
          heavy, or a hold you charge), a form and one or two elements. Each press casts the chain's
          next move, each harder than the last; a pause starts it over. Links buy more slots. A
          construct out of a slot waits in your move bag: place it in any slot of its skill, on any
          weapon, with its sockets and runes. Gear attunes you to its element and powers those
          moves.
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
