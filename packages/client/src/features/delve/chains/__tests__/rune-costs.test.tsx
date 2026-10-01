import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  computeHeroStats,
  defaultChains,
  type AbilityPayment,
  type Chains,
  type HeroStats,
  type ManaType,
  type Move,
  type RunePouch,
} from '@alloy/engine';
import { ChainEditor } from '../ChainEditor';
import { pricedRegistry } from '../../runes/__tests__/priced-registry';

const registry = pricedRegistry();

/** An unarmed hero with this attunement and no other (its pool is 60 + 3 a point). */
const hero = (attunement: Partial<Record<ManaType, number>>) =>
  computeHeroStats({}, registry, { attunement });

/**
 * The builder over a Primary of `primary` paid with `payment` (the other chains the defaults,
 * or `over`'s), for a hero with 15 Fire unless `stats` says, with sockets on every move and a
 * pouch of `pouch`. It is controlled: rerender it with new props.
 */
function editor({
  primary,
  payment = 'mana',
  stats = hero({ fire: 15 }),
  pouch = {},
  over = {},
}: {
  primary: Move[];
  payment?: AbilityPayment;
  stats?: HeroStats;
  pouch?: RunePouch;
  over?: Partial<Chains>;
}) {
  const chains: Chains = {
    ...defaultChains(registry, 'fire', null),
    primary: { moves: primary, payment },
    ...over,
  };
  return (
    <ChainEditor
      chains={chains}
      caps={{ basic: 5, primary: 5, defensive: 5, ultimate: 5 }}
      stats={stats}
      reactionsSeen={[]}
      locked={false}
      onChange={() => {}}
      runes={{
        pouch,
        socketCap: 3,
        socketPrice: () => null,
        weaponBaseId: 'sword',
        pullText: () => 'Pull',
      }}
    />
  );
}

const bolt = (element: ManaType): Move => ({
  kind: 'medium',
  form: 'bolt',
  elements: [element],
  runes: [null],
});
const tapSocket = () =>
  fireEvent.click(
    within(screen.getByTestId('sockets-0')).getByRole('button', { name: 'Socket 1: empty' }),
  );
const picker = () => within(screen.getByTestId('rune-picker'));

describe("the builder's rune picker: prices", () => {
  const pouch: RunePouch = { heavy: [0, 0, 1, 0, 0], pierce: [0, 0, 1, 0, 0] };

  it("prices each candidate in the chain's payment, eased by the move's attunement", () => {
    const { rerender } = render(editor({ primary: [bolt('fire')], pouch }));
    tapSocket();
    // Heavy III's 0.55 and Pierce III's 0.95, eased 45% by 15 Fire.
    expect(picker().getByTestId('rune-pick-heavy')).toHaveTextContent('+30% cost');
    expect(picker().getByTestId('rune-pick-pierce')).toHaveTextContent('+52% cost');
    rerender(editor({ primary: [bolt('fire')], payment: 'charge', pouch }));
    expect(picker().getByTestId('rune-pick-heavy')).toHaveTextContent('+30% charge');
    rerender(editor({ primary: [bolt('fire')], stats: hero({}), pouch }));
    expect(picker().getByTestId('rune-pick-heavy')).toHaveTextContent('+55% cost');
  });

  it('dims a candidate that would do nothing in the socket, with no price: a Pierce on an Earth Bolt', () => {
    render(editor({ primary: [bolt('earth')], stats: hero({ earth: 15 }), pouch }));
    tapSocket();
    expect(picker().getByRole('img', { name: 'Pierce III, dormant' })).toBeInTheDocument();
    expect(picker().getByTestId('rune-pick-pierce')).not.toHaveTextContent('% cost');
    expect(picker().getByTestId('rune-pick-heavy')).toHaveTextContent('+30% cost');
  });

  it("shows no price on a blow's socket: blows are free", () => {
    const basic = defaultChains(registry, 'fire', null).basic.map((b) => ({ ...b, runes: [null] }));
    render(editor({ primary: [bolt('fire')], pouch, over: { basic } }));
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    tapSocket();
    expect(picker().getByTestId('rune-pick-heavy')).not.toHaveTextContent('% cost');
  });
});
