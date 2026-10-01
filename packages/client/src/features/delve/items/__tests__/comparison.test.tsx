import { describe, it, expect, beforeEach } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';
import {
  compareItem,
  generateItem,
  referenceDepth,
  SeededRNG,
  type GearItem,
  type ItemComparison,
} from '@alloy/engine';
import { useItemComparison } from '../useItemComparison';
import { PowerDelta } from '../PowerDelta';
import { getDelveRegistry } from '../../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const item = (uid: string, slot: 'weapon' | 'helm', baseId?: string): GearItem =>
  generateItem(
    registry,
    { uid, ilvl: 3, rarity: 'rare', slot, ...(baseId ? { baseId } : {}), mana: 'fire' },
    new SeededRNG(4),
  );

describe('useItemComparison', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    store().setProfile({
      ...store().profile,
      bag: [item('w1', 'weapon', 'sword'), item('h1', 'helm')],
    });
  });

  it('values a bag weapon, while armed, as a home and as it is, against the worn one', () => {
    const p = store().profile;
    const depth = referenceDepth(p);
    const { result } = renderHook(() => useItemComparison('w1'));
    expect(result.current.item?.uid).toBe('w1');
    expect(result.current.where).toBe('bag');
    expect(result.current.worn).toBe(p.equipped.weapon);
    expect(result.current.cmp).toEqual(compareItem(p.equipped, p.bag[0], registry, depth, p.pair));
    expect(result.current.asIs).toEqual(
      compareItem(p.equipped, p.bag[0], registry, depth, p.pair, 'asIs'),
    );
  });

  it('a bag helm over an empty slot has one comparison and nothing worn', () => {
    const { result } = renderHook(() => useItemComparison('h1'));
    expect(result.current.worn).toBeNull();
    expect(result.current.cmp?.replaced).toBeUndefined();
    expect(result.current.cmp!.powerPct).toBeGreaterThan(0);
    expect(result.current.asIs).toBeNull();
  });

  it('an equipped item has no comparison, and no uid finds nothing', () => {
    const uid = store().profile.equipped.weapon!.uid;
    const { result } = renderHook(() => useItemComparison(uid));
    expect(result.current).toMatchObject({ where: 'equipped', worn: null, cmp: null, asIs: null });
    expect(renderHook(() => useItemComparison(null)).result.current).toEqual({
      item: null,
      worn: null,
      where: null,
      cmp: null,
      asIs: null,
    });
    expect(renderHook(() => useItemComparison('gone')).result.current.item).toBeNull();
  });
});

describe('PowerDelta', () => {
  const cmp = { powerPct: 0.12, dpsPct: -0.04, ehpPct: 0 } as ItemComparison;

  it('shows Power, Damage and Toughness, each with its arrow and colour', () => {
    render(<PowerDelta cmp={cmp} />);
    expect(document.body).toHaveTextContent('Power▲ +12%Damage▼ −4%Toughness ±0%');
    expect(screen.getByText('+12%', { exact: false })).toHaveStyle({ color: '#4ade80' });
    expect(screen.getByText('−4%', { exact: false })).toHaveStyle({ color: '#f87171' });
  });

  it('heads the row with its label, and shows dashes with nothing to compare', () => {
    render(<PowerDelta cmp={null} label="As it is" />);
    expect(document.body).toHaveTextContent('As it isPower—Damage—Toughness—');
  });
});
