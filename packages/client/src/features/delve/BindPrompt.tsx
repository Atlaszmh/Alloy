import { bindSecondary, equipItem, profilePower, type GearItem } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { showToast } from '@/components/Toast';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { getDelveRegistry } from './registry';
import { formatNumber, manaStyle } from './format';

/**
 * Equipping gear outside the pair while no second element is bound (between
 * dives): bind its element and equip, or equip it for its stats only and not
 * be asked about that element again this session ("Not now" is remembered per
 * element: a "Not now" on Storm still asks about Nature). Shows the Power
 * either way. Bind has the focus, for the controller.
 */
export function BindPrompt({ item, onDone }: { item: GearItem; onDone: () => void }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const st = manaStyle(registry, item.mana);
  const worn = equipItem(registry, profile, item.uid);
  const statsOnly = profilePower(registry, worn);
  const bound = profilePower(registry, bindSecondary(registry, worn, item.mana).profile);

  const finish = (bind: boolean) => {
    const store = useDelveStore.getState();
    if (bind) {
      const res = store.bindSecondary(item.mana);
      // Refused: say why, and equip nothing.
      if (!res.ok) {
        playSound('combineFail');
        showToast(res.reason ?? 'Cannot bind');
        onDone();
        return;
      }
    } else store.declineBind(item.mana);
    store.equip(item.uid);
    playSound('orbPlace');
    vibrate('medium');
    onDone();
  };

  return (
    <div
      className="delve-sheet-backdrop"
      style={{ alignItems: 'center' }}
      onClick={(e) => e.stopPropagation()}
      data-testid="bind-prompt"
      data-pad-scope
    >
      <div
        className="delve-panel m-4 flex max-w-sm flex-col gap-3 p-4"
        role="dialog"
        aria-label={`Bind ${st.name}`}
        aria-modal="true"
      >
        <div className="delve-display text-lg font-bold" style={{ color: st.color }}>
          {st.icon} Bind {st.name} as your second element?
        </div>
        <p className="text-sm text-stone-300">
          Your basic chain's last blow will strike with {st.name}, your abilities can use it, and
          its gear will attune you. After that, only a Realign changes it.
        </p>
        <div className="flex text-center text-xs text-stone-400">
          <div className="flex-1" data-testid="bind-prompt-bound">
            Bound
            <div className="delve-display text-base font-bold text-green-300">
              {formatNumber(bound)} Power
            </div>
          </div>
          <div className="flex-1" data-testid="bind-prompt-unbound">
            Stats only
            <div className="delve-display text-base font-bold text-stone-200">
              {formatNumber(statsOnly)} Power
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="delve-btn delve-btn-gold"
            onClick={() => finish(true)}
            autoFocus
            data-testid="bind-prompt-confirm"
          >
            Bind
          </button>
          <button
            type="button"
            className="delve-btn"
            onClick={() => finish(false)}
            data-pad-back
            data-testid="bind-prompt-not-now"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
