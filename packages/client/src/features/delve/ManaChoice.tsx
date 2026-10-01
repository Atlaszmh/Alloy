import { BASIC_STATUS, MANA_TYPES, type ManaType } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { getDelveRegistry } from './registry';
import { manaStyle } from './format';

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
    <div
      className="absolute inset-0 z-[70] overflow-y-auto bg-black/90"
      role="dialog"
      aria-label="Choose your mana"
      aria-modal="true"
      data-testid="mana-choice"
      data-pad-scope
    >
      <div className="delve-column flex flex-col gap-3 py-6">
        <div className="delve-display text-center text-2xl font-bold text-amber-300">
          Choose your mana
        </div>
        <p className="text-center text-sm text-stone-300">
          Your gear attunes to it, your blows strike with it, and your first abilities use it.
          Between dives you'll bind a second element, to build into your moves and blows.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MANA_TYPES.map((m) => {
            const st = manaStyle(registry, m);
            const mixes = fusions.filter((f) => f.elements.includes(m));
            return (
              <button
                key={m}
                type="button"
                className="delve-panel flex flex-col items-start gap-1 p-3 text-left"
                style={{ borderColor: `${st.color}66` }}
                onClick={() => choose(m)}
                data-testid={`mana-choice-${m}`}
              >
                <span className="delve-display text-lg font-bold" style={{ color: st.color }}>
                  {st.icon} {st.name}
                </span>
                <span className="text-sm text-stone-200">{PLAY_STYLE[m]}</span>
                <span className="text-[11px] text-stone-400">
                  Every blow applies a stack of {st.name}: {title(BASIC_STATUS[m])}
                </span>
                <span className="text-[11px] text-stone-500">
                  Fusions: {mixes.map((f) => `${f.icon} ${f.name}`).join(' · ')}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
