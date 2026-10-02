import type { ArpgEvent } from '@alloy/engine';

/** A paid cost's colour: the mana bar's, or the charge's. */
const PAY_COLOR = { mana: '#2ce8f5', charge: '#fee761' };
/** Floating costs live at once above one slot (they're cosmetic). */
const PAY_FLOATS = 3;

/**
 * A skill's spend rising from its slot and fading over a second: its mana
 * ("−16"), else its charge ("−78 charge"), rounded; nothing when that rounds to 0.
 * A real element animated in place (just a fade under reduced motion), removed
 * when it ends; the oldest goes first past `PAY_FLOATS`.
 */
export function floatPay(e: Extract<ArpgEvent, { kind: 'pay' }>): void {
  const slot = document.querySelector(`[data-testid="ability-${e.slot}"]`);
  const mana = Math.round(e.mana);
  const amount = mana > 0 ? mana : Math.round(e.charge);
  if (!slot || amount <= 0) return;
  const live = slot.querySelectorAll('[data-pay]');
  if (live.length >= PAY_FLOATS) live[0].remove();
  const el = document.createElement('span');
  el.dataset.pay = '';
  el.setAttribute('aria-hidden', 'true');
  // From the slot's top edge upward, over the arena: the dock's hard shadow keeps it legible.
  el.className =
    'k-disp pointer-events-none absolute left-1/2 -top-2 z-10 -translate-x-1/2 whitespace-nowrap text-[20px]';
  el.style.color = mana > 0 ? PAY_COLOR.mana : PAY_COLOR.charge;
  el.textContent = mana > 0 ? `−${amount}` : `−${amount} charge`;
  slot.append(el);
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const anim = el.animate?.(
    still
      ? [{ opacity: 1 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }]
      : [
          // `transform`, not `translate`: the class's `translate` centres it.
          { opacity: 1, transform: 'translateY(0)' },
          { opacity: 1, offset: 0.4 },
          { opacity: 0, transform: 'translateY(-24px)' },
        ],
    { duration: 1000, easing: 'ease-out', fill: 'forwards' },
  );
  if (anim) anim.onfinish = () => el.remove();
}
