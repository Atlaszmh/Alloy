import { BASIC_STATUS, MANA_TYPES, type ManaType } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { getDelveRegistry } from './registry';
import { manaStyle } from './format';
import { Dialog, Glyph } from './kit';

/** Each element's play style, in a line. */
const PLAY_STYLE: Record<ManaType, string> = {
  fire: 'Fire burns: your hits keep hurting after they land.',
  frost: 'Frost controls: chill foes, then freeze them solid.',
  storm: 'Storm chains: shocks leap from foe to foe.',
  earth: 'Earth staggers: heavy blows that stop foes cold.',
  shadow: 'Shadow hexes: cursed foes take more from everything.',
  nature: 'Nature poisons: stacking venom that rots foes away.',
};

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The one-time "Choose your mana" screen, over the Anvil while the hero has
 * no primary: your starting gear attunes to it and your first abilities use it.
 * A forced kit dialog: no back, no Esc.
 */
export function ManaChoice() {
  const registry = getDelveRegistry();
  const fusions = registry.getArpgData().fusions;
  const choose = (mana: ManaType) => {
    playSound('orbConfirm');
    vibrate('success');
    useDelveStore.getState().chooseMana(mana);
  };
  return (
    <Dialog title="Choose your mana" width={1080} testId="mana-choice">
      <div className="flex flex-col gap-4">
        <p className="text-center text-[18px] text-[var(--k-text-2)]">
          Your gear attunes to it, your blows strike with it, and your first abilities use it.
          Between dives you'll bind a second element, to build into your moves and blows.
        </p>
        <div className="grid grid-cols-3 gap-4">
          {MANA_TYPES.map((m) => {
            const st = manaStyle(registry, m);
            const mixes = fusions.filter((f) => f.elements.includes(m));
            return (
              <button
                key={m}
                type="button"
                className="delve-panel flex flex-col items-start gap-2 p-4 text-left"
                style={{ borderColor: st.color }}
                onClick={() => choose(m)}
                data-testid={`mana-choice-${m}`}
              >
                <span className="flex items-center gap-2 text-[24px] [font-family:var(--k-font-display)]">
                  <Glyph id={m} size={24} color={st.color} /> {st.name}
                </span>
                <span className="text-[16px] text-[var(--k-text)]">{PLAY_STYLE[m]}</span>
                <span className="text-[14px] text-[var(--k-text-2)]">
                  Every blow applies a stack of {st.name}: {title(BASIC_STATUS[m])}
                </span>
                <span className="text-[14px] text-[var(--k-text-3)]">
                  Fusions: {mixes.map((f) => f.name).join(' · ')}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}
