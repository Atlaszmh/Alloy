import { useEffect, useRef, type ReactElement } from 'react';
import {
  bindSecondary,
  equipItem,
  profilePower,
  type DelveProfile,
  type GearItem,
  type ManaType,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { showToast } from '@/components/Toast';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Button, Glyph } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { formatNumber, manaStyle } from '../../format';

/**
 * Equipping `item` asks to bind its element first: it is outside the pair, no second element is
 * bound, and "Not now" hasn't been said to that element this session.
 */
export function needsBind(
  profile: DelveProfile,
  declined: readonly ManaType[],
  item: GearItem,
): boolean {
  const { primary, secondary } = profile.pair;
  return !!primary && !secondary && item.mana !== primary && !declined.includes(item.mana);
}

/**
 * The bind choice, inline in the compare pane (it was the BindPrompt modal): bind the item's
 * element and equip it, or equip it for its stats only and not be asked about that element again
 * this session. Shows the Power either way. Off the D-pad until an Equip asks (`ask`): then Bind
 * takes the focus.
 */
export function BindChoice({ item, ask }: { item: GearItem; ask: boolean }): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const root = useRef<HTMLDivElement>(null);
  const st = manaStyle(registry, item.mana);
  const worn = equipItem(registry, profile, item.uid);
  const statsOnly = profilePower(registry, worn);
  const bound = profilePower(registry, bindSecondary(registry, worn, item.mana).profile);

  useEffect(() => {
    if (ask)
      root.current?.querySelector<HTMLElement>('[data-testid="bind-prompt-confirm"]')?.focus();
  }, [ask]);

  const finish = (bind: boolean) => {
    const store = useDelveStore.getState();
    if (bind) {
      const res = store.bindSecondary(item.mana);
      // Refused: say why, and equip nothing.
      if (!res.ok) {
        playSound('combineFail');
        showToast(res.reason ?? 'Cannot bind');
        return;
      }
    } else store.declineBind(item.mana);
    store.equip(item.uid);
    playSound('orbPlace');
    vibrate('medium');
  };

  return (
    <div
      ref={root}
      role="group"
      aria-label={`Bind ${st.name}`}
      className="k-well flex flex-col gap-3 p-3.5"
      data-testid="bind-prompt"
      data-pad-skip={ask ? undefined : ''}
    >
      <div className="k-disp flex items-center gap-2 text-[22px]">
        <Glyph id={item.mana} size={22} color={st.color} /> Bind {st.name} as your second element?
      </div>
      <p className="k-body-2">
        Your moves and blows can use {st.name} and its gear will attune you; your chains keep the
        ones they have (add {st.name} in the chain builder). After that, only a Realign changes it.
      </p>
      <div className="grid grid-cols-2 text-center">
        <div data-testid="bind-prompt-bound">
          <span className="k-label">Bound</span>
          <div className="k-disp text-[22px] text-[var(--k-ok)]">{formatNumber(bound)} Power</div>
        </div>
        <div data-testid="bind-prompt-unbound">
          <span className="k-label">Stats only</span>
          <div className="k-disp text-[22px]">{formatNumber(statsOnly)} Power</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="primary" testId="bind-prompt-confirm" onClick={() => finish(true)}>
          Bind
        </Button>
        <Button testId="bind-prompt-not-now" onClick={() => finish(false)}>
          Not now
        </Button>
      </div>
    </div>
  );
}
