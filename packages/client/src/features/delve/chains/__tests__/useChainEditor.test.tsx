import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  chainCycle,
  computeHeroStats,
  defaultChains,
  resolveChain,
  type Chains,
  type Move,
} from '@alloy/engine';
import { createDelveProfile, formAllowed, type Blow, type Construct } from '@alloy/engine';
import { armed } from '../../__tests__/armed';
import { getDelveRegistry } from '../../registry';
import { useChainEditor, type ChainEditorProps } from '../useChainEditor';

const registry = getDelveRegistry();
const stats = computeHeroStats({}, registry);
const bolt = (kind: Move['kind'], uid?: string): Move => ({
  uid,
  kind,
  form: 'bolt',
  elements: ['fire'],
});
const chains: Chains = {
  ...defaultChains(registry, 'fire', null),
  primary: { moves: [bolt('light'), bolt('medium'), bolt('heavy')], payment: 'mana' },
};
const caps = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };

/** The hook over `chains`, controlled: each change is applied to the props it reads. */
function setup(over: Partial<ChainEditorProps> = {}) {
  const onChange = vi.fn();
  const props: ChainEditorProps = { chains, caps, stats, locked: false, onChange, ...over };
  const hook = renderHook((p: ChainEditorProps) => useChainEditor(p), { initialProps: props });
  return { ...hook, onChange };
}

describe('useChainEditor', () => {
  it('starts on the Primary, its first move, resolved and named', () => {
    const { result } = setup();
    expect(result.current).toMatchObject({ skill: 'primary', slot: 'primary', index: 0 });
    expect(result.current.names).toEqual([
      'light Fire Bolt',
      'medium Fire Bolt',
      'heavy Fire Bolt',
    ]);
    expect(result.current.resolved?.moves).toHaveLength(3);
    expect(result.current.support).not.toBeNull();
    act(() => result.current.pick('basic'));
    expect(result.current).toMatchObject({ skill: 'basic', slot: null, resolved: null });
    expect(result.current.support).toBeNull();
  });

  it('reports each edit as the chain alone: a shift, a remove, an add, a payment', () => {
    const { result, onChange } = setup();
    act(() => result.current.shift(0, 1));
    expect(onChange).toHaveBeenLastCalledWith('primary', {
      moves: [bolt('medium'), bolt('light'), bolt('heavy')],
      payment: 'mana',
    });
    expect(result.current.index).toBe(1); // the selection follows the move
    act(() => result.current.remove(2));
    expect(onChange.mock.lastCall![1].moves).toHaveLength(2);
    act(() => result.current.add());
    expect(onChange.mock.lastCall![1].moves).toHaveLength(4);
    expect(onChange.mock.lastCall![1].moves[3]).toEqual(bolt('medium')); // a copy of the chosen move, no uid
    act(() => result.current.setPayment('charge'));
    expect(onChange.mock.lastCall![1].payment).toBe('charge');
    // No bag: no edit reports one.
    expect(onChange.mock.calls.every((c) => c[2] === undefined)).toBe(true);
  });

  it('the slots and the ceiling: the caps, and the ceilings when given', () => {
    const { result } = setup({ caps: { ...caps, primary: 3 } });
    expect(result.current).toMatchObject({ slots: 3, ceiling: 3 });
    const roomy = setup({ caps: { ...caps, primary: 3 }, ceilings: { primary: 5 } });
    expect(roomy.result.current).toMatchObject({ slots: 3, ceiling: 5 });
    expect(roomy.result.current.weaponBaseId).toBe(stats.weapon.baseId);
  });

  describe('with a bag (the Anvil)', () => {
    const primary = {
      moves: [bolt('light', 'c1'), bolt('medium', 'c2'), bolt('heavy', 'c3')],
      payment: 'mana' as const,
    };
    const spare = bolt('hold', 'c9');
    const blow: Blow = { uid: 'b1', kind: 'heavy', element: 'fire' };
    const bag: Construct[] = [spare, blow];
    const withBag = (over: Partial<ChainEditorProps> = {}) =>
      setup({ chains: { ...chains, primary }, caps: { ...caps, primary: 3 }, bag, ...over });

    it('lists the bag of the chosen skill: the Primary sees its moves, the Basic its blows', () => {
      const { result } = withBag();
      expect(result.current.bag).toEqual(bag);
      expect(result.current.bagHere).toEqual([spare]);
      act(() => result.current.pick('basic'));
      expect(result.current.bagHere).toEqual([blow]);
    });

    it('unsocket sends the construct to the bag and closes the chain up; the selection and the focus stay near', () => {
      const { result, onChange } = withBag();
      act(() => result.current.select(2));
      act(() => result.current.unsocket(1));
      expect(onChange).toHaveBeenLastCalledWith(
        'primary',
        { moves: [bolt('light', 'c1'), bolt('heavy', 'c3')], payment: 'mana' },
        [...bag, bolt('medium', 'c2')],
      );
      expect(result.current.index).toBe(1);
    });

    it('an ability chain may empty; the Basic keeps one blow', () => {
      const one = withBag({
        chains: { ...chains, primary: { ...primary, moves: [primary.moves[0]] } },
      });
      act(() => one.result.current.unsocket(0));
      expect(one.onChange).toHaveBeenLastCalledWith('primary', { moves: [], payment: 'mana' }, [
        ...bag,
        bolt('light', 'c1'),
      ]);
      const basic = withBag({
        chains: { ...chains, basic: [{ uid: 'b0', kind: 'light', element: 'fire' }] },
      });
      act(() => basic.result.current.pick('basic'));
      act(() => basic.result.current.unsocket(0));
      expect(basic.onChange).not.toHaveBeenCalled();
    });

    it('place fills the next empty slot, or the chosen slot in a full chain, its construct to the bag', () => {
      const room = withBag({ caps: { ...caps, primary: 4 } });
      let why: string | null = '';
      act(() => {
        why = room.result.current.place('c9');
      });
      expect(why).toBeNull();
      expect(room.onChange).toHaveBeenLastCalledWith(
        'primary',
        { moves: [...primary.moves, spare], payment: 'mana' },
        [blow],
      );
      // The draft takes the change (the hook is uncontrolled here): the placed construct is chosen.
      const [, placed, left] = room.onChange.mock.lastCall!;
      room.rerender({
        chains: { ...chains, primary: placed },
        caps: { ...caps, primary: 4 },
        bag: left,
        stats,
        locked: false,
        onChange: room.onChange,
      });
      expect(room.result.current.index).toBe(3);
      const full = withBag();
      act(() => full.result.current.select(1));
      expect(full.result.current.place('c9')).toBeNull();
      expect(full.onChange).toHaveBeenLastCalledWith(
        'primary',
        { moves: [bolt('light', 'c1'), spare, bolt('heavy', 'c3')], payment: 'mana' },
        [blow, bolt('medium', 'c2')],
      );
    });

    it("place refuses another skill's construct, a dormant one and a stranger, and does nothing locked", () => {
      const { result, onChange } = withBag({
        dormantText: (c) => ('form' in c ? "A sword can't express Bolt" : null),
      });
      expect(result.current.place('b1')).toMatch(/Basic/);
      expect(result.current.place('c9')).toBe("A sword can't express Bolt");
      expect(result.current.place('nope')).toMatch(/bag/);
      expect(result.current.dormantWhy(0)).toBe("A sword can't express Bolt");
      expect(onChange).not.toHaveBeenCalled();
      const locked = withBag({ locked: true });
      expect(locked.result.current.place('c9')).not.toBeNull();
      act(() => locked.result.current.unsocket(0));
      expect(locked.onChange).not.toHaveBeenCalled();
    });

    it('without a bag, unsocket removes outright (the sandbox)', () => {
      const { result, onChange } = setup();
      act(() => result.current.unsocket(1));
      expect(onChange.mock.lastCall![1].moves).toHaveLength(2);
      expect(onChange.mock.lastCall![2]).toBeUndefined();
    });

    it("add on an empty chain with an empty bag makes a light move of the first form the weapon's class can express", () => {
      const sword = armed(createDelveProfile(registry, 1234, { primary: 'fire' })).equipped;
      const { result, onChange } = setup({
        stats: computeHeroStats(sword, registry),
        chains: { ...chains, primary: { moves: [], payment: 'mana' } },
        bag: [],
      });
      act(() => result.current.add());
      const [made] = onChange.mock.lastCall![1].moves as Move[];
      expect(made).toMatchObject({ kind: 'light', elements: ['fire'] });
      expect(made.uid).toBeUndefined();
      expect(formAllowed(registry, 'sword', made.form)).toBe(true);
      // The sandbox names its own weapon: a bow's class gates instead.
      const bow = setup({ weaponBaseId: 'bow' });
      expect(bow.result.current.weaponBaseId).toBe('bow');
    });
  });

  it('never moves past the ends, removes the last move or edits while locked', () => {
    const { result, onChange } = setup();
    act(() => result.current.shift(0, -1));
    expect(onChange).not.toHaveBeenCalled();
    const locked = setup({ locked: true });
    act(() => {
      locked.result.current.shift(0, 1);
      locked.result.current.remove(0);
      locked.result.current.add();
      locked.result.current.edit(bolt('hold'));
    });
    expect(locked.onChange).not.toHaveBeenCalled();
    expect(locked.result.current.index).toBe(0);
    const one = setup({
      chains: { ...chains, primary: { moves: [bolt('light')], payment: 'mana' } },
    });
    act(() => one.result.current.remove(0));
    expect(one.onChange).not.toHaveBeenCalled();
  });

  it("opens a socket's picker on its move, and choosing another move closes it", () => {
    const runed: Chains = {
      ...chains,
      primary: { moves: [{ ...bolt('light'), runes: [null] }, bolt('medium')], payment: 'mana' },
    };
    const runes = {
      pouch: 'any' as const,
      socketCap: 3,
      socketPrice: () => null,
      weaponBaseId: 'sword',
      pullText: () => 'Pull',
    };
    const { result } = setup({ chains: runed, runes });
    expect(result.current.picker).toBeNull();
    act(() => result.current.openPicker(0, 0));
    expect(result.current.socket).toBe(0);
    expect(result.current.picker).toMatchObject({ tierChoice: true, current: null });
    act(() => result.current.select(1));
    expect(result.current.picker).toBeNull();
  });
  it("dps is the chain's damage over its cycle's seconds, and dpsWith the same with the chosen move replaced", () => {
    const { result } = setup();
    const m = result.current;
    const cycle = chainCycle(
      registry,
      stats,
      resolveChain(registry, stats, 'primary', chains.primary),
    );
    expect(m.dps).toBeCloseTo(cycle.damage / cycle.seconds);
    const heavy = { ...(m.move as Move), kind: 'heavy' as const };
    const next = chainCycle(
      registry,
      stats,
      resolveChain(registry, stats, 'primary', {
        ...chains.primary,
        moves: chains.primary.moves.map((x, j) => (j === m.index ? heavy : x)),
      }),
    );
    expect(m.dpsWith(heavy)).toBeCloseTo(next.damage / next.seconds);
    expect(m.dpsWith(heavy)).not.toBeCloseTo(m.dps!);
  });

  it('the basic chain has no dps (its blows are no cycle)', () => {
    const { result } = setup();
    act(() => result.current.pick('basic'));
    expect(result.current.dps).toBeNull();
    expect(result.current.dpsWith(result.current.move as Move)).toBeNull();
  });
});
