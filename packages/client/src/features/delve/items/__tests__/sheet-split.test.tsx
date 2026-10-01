import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { defaultMoveset, generateItem, SeededRNG, type GearItem } from '@alloy/engine';
import { ItemDetailSheet } from '../../ItemDetailSheet';
import { getDelveRegistry } from '../../registry';
import { useDelveStore } from '@/stores/delveStore';

// The sheet before and after its split into items/*: Task 1 records it, Tasks 2-6 keep it,
// and Task 7 deletes this file (1A's colours and icons change the markup when they merge).
const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
/** The markup, with `useId`'s ids (which count every render in the file) blanked. */
const html = (el: Element) => el.innerHTML.replace(/_r_[0-9a-z]+_/g, '_r_');

/** A rare Fire sword with an extra Primary slot. */
const sword = (): GearItem => {
  const w = generateItem(
    registry,
    { uid: 'w1', ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(4),
  );
  return { ...w, moveset: defaultMoveset(registry, w, 'fire', { primary: 2 }) };
};
/** A magic Frost helm (off the pair) with a perfect Fire line and a Frost one. */
const helm = (): GearItem => ({
  ...generateItem(
    registry,
    { uid: 'h1', ilvl: 3, rarity: 'magic', slot: 'helm', mana: 'frost' },
    new SeededRNG(4),
  ),
  affixes: [
    { stat: 'fireAttune', value: 2, roll: 0.95 },
    { stat: 'frostAttune', value: 2, roll: 0.4 },
  ],
});
/** Legendary boots whose power needs a Defensive the starting sword doesn't carry. */
const boots = (): GearItem => ({
  ...generateItem(
    registry,
    { uid: 'b1', ilvl: 3, rarity: 'legendary', slot: 'boots', mana: 'fire' },
    new SeededRNG(4),
  ),
  legendary: { id: 'nightstalker', value: 30, roll: 0.5 },
});

describe('ItemDetailSheet, before and after the split', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    store().setProfile({ ...store().profile, bag: [helm(), sword(), boots()] });
  });

  it.each([
    ['a bag helm', 'h1'],
    ['a bag weapon', 'w1'],
    ['a legendary', 'b1'],
    ['the equipped weapon', 'equipped'],
  ])('%s keeps its text and markup', (_name, uid) => {
    const id = uid === 'equipped' ? store().profile.equipped.weapon!.uid : uid;
    const { container } = render(
      <ItemDetailSheet uid={id} onClose={() => {}} onBuild={() => {}} />,
    );
    expect(container.textContent).toMatchSnapshot('text');
    expect(html(container)).toMatchSnapshot('html');
  });
});
