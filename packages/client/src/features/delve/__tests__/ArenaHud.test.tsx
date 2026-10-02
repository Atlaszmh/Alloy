import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { floatPay } from '../arena/hud/floatPay';
import { Vitals } from '../arena/hud/Vitals';
import { BossBar } from '../arena/hud/BossBar';
import { BuffRow, type HudBuff } from '../arena/hud/BuffRow';
import type { ArenaHud } from '../arena/useArena';

/** A HUD snapshot (cast: 3C's snapshot adds `buffs` and `map`). */
function hud(over: Partial<ArenaHud> & { buffs?: HudBuff[] } = {}): ArenaHud {
  return {
    hp: 100,
    maxHp: 100,
    mana: 50,
    manaMax: 60,
    abilities: [],
    busy: false,
    dodgeCharges: 1,
    dodgeMax: 2,
    dodgeRefill: 0.4,
    riposte: false,
    basicChainStep: 1,
    basicChainLength: 3,
    basicNextKind: 'light',
    basicHold: null,
    basicRunes: [],
    potions: 3,
    monstersLeft: 5,
    monstersTotal: 8,
    boss: null,
    cleared: false,
    barrier: null,
    galvanizedAt: null,
    t: 10,
    ...over,
  } as ArenaHud;
}

describe('the life and mana bars', () => {
  it("shows Obsidian's barrier as a pale segment after the life (over its end at full life), and in the label", () => {
    const { rerender } = render(<Vitals hud={hud({ hp: 50, barrier: { hp: 20, max: 30 } })} />);
    const seg = screen.getByTestId('hp-barrier');
    expect(seg.style.left).toBe('50%');
    expect(seg.style.width).toBe('20%');
    expect(screen.getByTestId('hero-hp')).toHaveTextContent('50 / 100 · barrier 20');
    rerender(<Vitals hud={hud({ hp: 100, barrier: { hp: 20, max: 30 } })} />);
    expect(screen.getByTestId('hp-barrier').style.left).toBe('80%');
    rerender(<Vitals hud={hud()} />);
    expect(screen.queryByTestId('hp-barrier')).toBeNull();
    expect(screen.getByTestId('hero-hp')).toHaveTextContent(/^100 \/ 100$/);
  });

  it('writes the mana bar as current / max, whole numbers, keeping its label', () => {
    render(<Vitals hud={hud({ mana: 37.8, manaMax: 60.4 })} />);
    const bar = screen.getByTestId('mana-bar');
    expect(bar).toHaveTextContent('37 / 60');
    expect(bar).toHaveAttribute('aria-label', 'Mana 37 of 60');
  });
});

describe('the boss bar', () => {
  it('shows only while a boss lives, with its life', () => {
    const { rerender } = render(<BossBar hud={hud()} />);
    expect(screen.queryByTestId('boss-bar')).toBeNull();
    rerender(<BossBar hud={hud({ boss: { name: 'Grask', icon: '☠', hp: 40, maxHp: 160 } })} />);
    expect(screen.getByTestId('boss-bar')).toHaveTextContent('Grask');
    expect(screen.getByTestId('boss-bar')).toHaveTextContent('40 / 160');
  });
});

describe('the buff tiles', () => {
  it('draws a tile per buff with its seconds left; none without', () => {
    const { container, rerender } = render(
      <BuffRow
        buffs={[
          { id: 'riposte', left: 0.6, total: 1 },
          { id: 'quick', left: 3.2, total: 4 },
        ]}
      />,
    );
    const tiles = [...container.querySelectorAll('[data-buff]')];
    expect(tiles.map((t) => t.getAttribute('data-buff'))).toEqual(['riposte', 'quick']);
    expect(tiles.map((t) => t.textContent)).toEqual(['1s', '4s']);
    expect(screen.getByRole('img', { name: 'Quick, 4s left' })).toBe(tiles[1]);
    rerender(<BuffRow buffs={[]} />);
    expect(container.querySelector('[data-buff]')).toBeNull();
  });
});

describe('the floating spend', () => {
  it("floats each skill's spend from its own slot: mana, then charge, rounded; nothing for 0", () => {
    const original = Element.prototype.animate;
    const anims: { onfinish: (() => void) | null }[] = [];
    Element.prototype.animate = vi.fn(() => {
      const a = { onfinish: null as (() => void) | null };
      anims.push(a);
      return a as unknown as Animation;
    });
    render(
      <>
        {[0, 1, 2].map((s) => (
          <button key={s} type="button" data-testid={`ability-${s}`} />
        ))}
      </>,
    );
    const floats = (slot: number) =>
      [...screen.getByTestId(`ability-${slot}`).querySelectorAll('[data-pay]')] as HTMLElement[];

    floatPay({ kind: 'pay', slot: 0, mana: 16.4, charge: 0 });
    expect(floats(0).map((f) => f.textContent)).toEqual(['−16']);
    expect(floats(1)).toEqual([]);
    floatPay({ kind: 'pay', slot: 2, mana: 0, charge: 78.2 });
    expect(floats(2).map((f) => f.textContent)).toEqual(['−78 charge']);
    expect(floats(0)[0].style.color).not.toBe(floats(2)[0].style.color);

    floatPay({ kind: 'pay', slot: 1, mana: 0.4, charge: 0 });
    expect(floats(1)).toEqual([]);

    // At most three live per slot; each goes when its animation ends.
    for (let i = 0; i < 3; i++) floatPay({ kind: 'pay', slot: 0, mana: 8, charge: 0 });
    expect(floats(0)).toHaveLength(3);
    anims.forEach((a) => a.onfinish?.());
    expect(floats(0)).toHaveLength(0);
    expect(floats(2)).toHaveLength(0);
    Element.prototype.animate = original;
  });
});
