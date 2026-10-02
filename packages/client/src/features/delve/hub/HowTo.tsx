import { useControlsStore } from '@/stores/controlsStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import type { KeyAction } from '@/features/controls/controls';
import { InputGlyph, Panel } from '@/features/delve/kit';

/**
 * "How to delve", on a first save: the controls in the glyphs of the device in
 * hand, from the player's own bindings, then the loop.
 */
export function HowTo() {
  const cfg = useControlsStore((s) => s.config);
  const pad = useInputDeviceStore((s) => s.device) === 'gamepad';
  /** An action's glyph on the device in hand; nothing when it is unbound there. */
  const g = (a: KeyAction) => {
    const key = cfg.keys[a];
    const button = a in cfg.pad ? cfg.pad[a as keyof typeof cfg.pad] : null;
    if (pad ? !button : !key) return null;
    return <InputGlyph size="sm" binding={{ key: key ?? undefined, pad: button ?? undefined }} />;
  };
  return (
    <Panel
      title="How to delve"
      testId="delve-howto"
      scroll={false}
      className="text-[16px] leading-relaxed text-[var(--k-text-2)]"
    >
      <div className="flex flex-col gap-2">
        {pad ? (
          <p>
            The left stick moves and the right stick aims. {g('primary')} casts your Primary,{' '}
            {g('defensive')} your Defensive and {g('ultimate')} your Ultimate. The D-pad and{' '}
            <InputGlyph size="sm" binding={{ pad: 'a' }} /> work every menu.
          </p>
        ) : (
          <p>
            {g('up')}
            {g('left')}
            {g('down')}
            {g('right')} move you (or hold the mouse to walk toward it). {g('primary')}{' '}
            {g('defensive')} {g('ultimate')} cast your Primary, Defensive and Ultimate: hold one to
            aim with the mouse.
          </p>
        )}
        <p>
          Your hero attacks whatever is in reach and builds mana (or attack by hand: switch it in
          the dive menu). {g('dodge')} dodges: dodge through a blow just as it lands for a{' '}
          <b className="text-[var(--k-hot-hi)]">PERFECT</b>, and your next hit crits and staggers.
        </p>
        <p>
          Each skill is a chain of moves, carried by your weapon: build them on the{' '}
          <b className="text-[var(--k-text)]">Skills</b> tab, each move a kind (light, medium,
          heavy, or a hold you charge), a form and one or two elements. Each press casts the chain's
          next move, each harder than the last; a pause starts it over. Better weapons carry more
          skills, and Links from salvaged weapons buy more slots. Gear attunes you to its element
          and powers those moves.
        </p>
        <p>
          Loot bursts from monsters: walk over it, and equip it here between dives. A green{' '}
          <b className="text-[var(--k-ok)]">▲</b> means it's an upgrade.
        </p>
        <p>
          Between depths, push deeper or <b className="text-[var(--k-hot)]">extract</b> to bank your
          bounty. Die and you lose the bounty but keep every item.
        </p>
      </div>
    </Panel>
  );
}
