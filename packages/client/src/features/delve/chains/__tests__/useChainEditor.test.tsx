import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { computeHeroStats, defaultChains, type Chains, type Move } from '@alloy/engine';
import { getDelveRegistry } from '../../registry';
import { useChainEditor, type ChainEditorProps } from '../useChainEditor';

const registry = getDelveRegistry();
const stats = computeHeroStats({}, registry);
const bolt = (kind: Move['kind']): Move => ({ kind, form: 'bolt', elements: ['fire'] });
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

  it('reports each edit with where its moves came from', () => {
    const { result, onChange } = setup();
    act(() => result.current.shift(0, 1));
    expect(onChange).toHaveBeenLastCalledWith(
      'primary',
      { moves: [bolt('medium'), bolt('light'), bolt('heavy')], payment: 'mana' },
      [1, 0, 2],
    );
    expect(result.current.index).toBe(1); // the selection follows the move
    act(() => result.current.remove(2));
    expect(onChange.mock.lastCall![2]).toEqual([0, 1]);
    act(() => result.current.add());
    expect(onChange.mock.lastCall![2]).toEqual([0, 1, 2, null]);
    act(() => result.current.setPayment('charge'));
    expect(onChange.mock.lastCall![1].payment).toBe('charge');
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
});
