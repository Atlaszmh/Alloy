import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import {
  compareItem,
  defaultMoveset,
  generateItem,
  referenceDepth,
  SeededRNG,
  type GearItem,
  type ManaType,
  type RuneRef,
} from '@alloy/engine';
import { ItemDetailSheet } from '../ItemDetailSheet';
import { ForgePanel } from '../ForgePanel';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';
import { ToastContainer } from '@/components/Toast';
import { UPGRADE_EPSILON, formatDelta } from '../format';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const pal = registry.getDelveBalance().pair;
/** A magic helm with only the lines given as affixes. */
const helm = (mana: ManaType, uid = 'h1', affixes: GearItem['affixes'] = []): GearItem => ({
  ...generateItem(registry, { uid, ilvl: 3, rarity: 'magic', slot: 'helm', mana }, new SeededRNG(4)),
  affixes,
});
const put = (...bag: GearItem[]) => store().setProfile({ ...store().profile, bag });
/** A rare sword (Basic, Primary and Defensive) with `slots` over its base. */
const rareSword = (uid: string, slots = {}): GearItem => {
  const w = generateItem(
    registry,
    { uid, ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(4),
  );
  return { ...w, moveset: defaultMoveset(registry, w, 'fire', slots) };
};

describe('ItemDetailSheet', () => {
  beforeEach(() => {
    localStorage.clear();
    useDelveStore.getState().resetProfile(1234, 'fire');
  });

  it('shows the item mana and the attunement equipping it would add', () => {
    const helm = generateItem(
      registry,
      { uid: 'h1', ilvl: 3, rarity: 'magic', slot: 'helm', mana: 'fire' },
      new SeededRNG(4),
    );
    const s = useDelveStore.getState();
    s.setProfile({ ...s.profile, bag: [helm] });
    render(<ItemDetailSheet uid="h1" onClose={() => {}} />);
    expect(screen.getByTestId('item-mana')).toHaveTextContent('Fire +1');
    expect(screen.getByTestId('attune-delta')).toHaveTextContent('+1 Fire');
    // The seed-4 helm also rolls a shadowAttune line: off the pair, so it attunes nothing.
    expect(screen.getByTestId('attune-delta')).not.toHaveTextContent('Shadow');
    expect(screen.getByTestId('attune-note')).toHaveTextContent('powers abilities');
  });

  it("shows a weapon's tempo, and none on other gear", () => {
    const weapon = (baseId: string) =>
      generateItem(
        registry,
        { uid: baseId, ilvl: 3, rarity: 'magic', slot: 'weapon', baseId, mana: 'fire' },
        new SeededRNG(4),
      );
    put(weapon('maul'), weapon('wand'), weapon('sword'), helm('fire'));
    const tempo = (uid: string) => {
      const { unmount } = render(<ItemDetailSheet uid={uid} onClose={() => {}} />);
      const text = screen.queryByTestId('item-tempo')?.textContent ?? null;
      unmount();
      return text;
    };
    expect(tempo('maul')).toBe('Tempo 1.3×: slower holds and chain beats');
    expect(tempo('wand')).toBe('Tempo 0.8×: quicker holds and chain beats');
    expect(tempo('sword')).toBe('Tempo 1×: standard holds and chain beats');
    expect(tempo('h1')).toBeNull();
  });

  it('greys attunement outside the pair, and shows the Mana Dust salvage gives', () => {
    put(
      helm('frost', 'h1', [
        { stat: 'fireAttune', value: 2, roll: 0.5 },
        { stat: 'frostAttune', value: 2, roll: 0.5 },
      ]),
    );
    render(<ItemDetailSheet uid="h1" onClose={() => {}} />);
    expect(screen.getByTestId('item-mana')).toHaveTextContent('not your element');
    expect(screen.getAllByTestId('not-your-element')).toHaveLength(1); // frost's line; fire's counts
    expect(screen.getByTestId('salvage-button')).toHaveTextContent(`✦ ${pal.salvageDust.magic}`);
  });

  it("re-attunes to the pair's other element for Mana Dust", () => {
    put(helm('frost'));
    store().setProfile({
      ...store().profile,
      pair: { primary: 'fire', secondary: 'storm' },
      manaDust: pal.reattuneDust.magic,
    });
    render(<ItemDetailSheet uid="h1" onClose={() => {}} />);
    expect(screen.getByTestId('reattune-fire')).toHaveTextContent(`✦ ${pal.reattuneDust.magic}`);
    fireEvent.click(screen.getByTestId('reattune-storm'));
    expect(store().profile.bag[0].mana).toBe('storm');
    expect(store().profile.manaDust).toBe(0);
    expect(screen.queryByTestId('reattune-storm')).toBeNull(); // its own element now
  });

  it('mid-dive Upgrade, Reforge and Salvage give way to "Forge and salvage at the Anvil"', () => {
    put(helm('fire', 'h1', [{ stat: 'fireAttune', value: 2, roll: 0.5 }]));
    store().startDive(1);
    render(<ItemDetailSheet uid="h1" onClose={() => {}} />);
    expect(screen.getByTestId('forge-locked')).toHaveTextContent('Forge and salvage at the Anvil');
    expect(screen.queryByTestId('upgrade-button')).toBeNull();
    expect(screen.queryByTestId('salvage-button')).toBeNull();
    expect(screen.queryByText('Reforge…')).toBeNull();
  });

  it('Re-attune waits for the dive to end', () => {
    put(helm('frost'));
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'storm' } });
    store().startDive(1);
    render(<ItemDetailSheet uid="h1" onClose={() => {}} />);
    expect(screen.getByTestId('reattune-fire')).toBeDisabled();
    expect(screen.getByTestId('reattune-locked')).toHaveTextContent('between dives');
  });

  it('Equip takes gear outside the pair as it is: the bind choice lives in the Loadout', () => {
    put(helm('storm'));
    render(<ItemDetailSheet uid="h1" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('equip-button'));
    expect(screen.queryByTestId('bind-prompt')).toBeNull();
    expect(store().profile.equipped.helm?.uid).toBe('h1');
  });

  it('mid-dive Equip, Unequip and Transfer give way to "Equip at the Anvil"', () => {
    put(helm('storm'), rareSword('w1'));
    store().startDive(1);
    const sheet = (uid: string) => render(<ItemDetailSheet uid={uid} onClose={() => {}} />);
    let view = sheet('h1');
    expect(screen.queryByTestId('equip-button')).toBeNull();
    expect(screen.getByTestId('equip-locked')).toHaveTextContent('Equip at the Anvil, between dives');
    view.unmount();
    view = sheet(store().profile.equipped.weapon!.uid);
    expect(screen.queryByText('Unequip')).toBeNull();
    expect(screen.getByTestId('equip-locked')).toBeInTheDocument();
    view.unmount();
    sheet('w1');
    expect(screen.queryByTestId('transfer-button')).toBeNull();
    expect(screen.getByTestId('equip-locked')).toBeInTheDocument();
  });

  it("a weapon's sheet shows its moveset: each chain's slots and moves, and what it can't carry", () => {
    const onBuild = vi.fn();
    render(
      <ItemDetailSheet
        uid={store().profile.equipped.weapon!.uid}
        onClose={() => {}}
        onBuild={onBuild}
      />,
    );
    expect(screen.getByTestId('moveset-basic')).toHaveTextContent(
      'Basic 3/5 · light Fire blow · light Fire blow · heavy Fire blow',
    );
    expect(screen.getByTestId('moveset-primary')).toHaveTextContent(
      'Primary 1/5 · light Fire Bolt',
    );
    expect(screen.getByTestId('moveset-defensive')).toHaveTextContent(
      'Defensive: carried by magic weapons and better',
    );
    expect(screen.getByTestId('moveset-ultimate')).toHaveTextContent(
      'Ultimate: carried by epic weapons and better',
    );
    // The equipped weapon's sheet links to the chain builder.
    fireEvent.click(screen.getByTestId('open-builder'));
    expect(onBuild).toHaveBeenCalled();
  });

  it('names a fused move as the chain builder does: "light Wildfire Burst"', () => {
    const p = store().profile;
    const sword = p.equipped.weapon!;
    const moveset = defaultMoveset(registry, sword, 'fire');
    const burst = { kind: 'light' as const, form: 'burst' as const, elements: ['fire', 'nature'] as ManaType[] };
    const chains = { ...moveset.chains, primary: { moves: [burst], payment: 'mana' as const } };
    store().setProfile({ ...p, equipped: { ...p.equipped, weapon: { ...sword, moveset: { ...moveset, chains } } } });
    render(<ItemDetailSheet uid={sword.uid} onClose={() => {}} />);
    expect(screen.getByTestId('moveset-primary')).toHaveTextContent('Primary 1/5 · light Wildfire Burst');
  });

  it('a bag weapon is valued as it is and with your moveset; Transfer moves your moveset onto it for scrap', () => {
    const p = store().profile;
    const sword = p.equipped.weapon!;
    const mine = { ...sword, moveset: defaultMoveset(registry, sword, 'fire', { primary: 2 }) };
    store().setProfile({
      ...p,
      equipped: { ...p.equipped, weapon: mine },
      bag: [rareSword('w1', { primary: 2 })],
    });
    render(
      <>
        <ItemDetailSheet uid="w1" onClose={() => {}} />
        <ToastContainer />
      </>,
    );
    expect(screen.getByTestId('compare-as-is')).toHaveTextContent('Power');
    expect(screen.getByTestId('compare-home')).toHaveTextContent('Power');
    expect(screen.getByTestId('item-compare')).toHaveTextContent(
      'With your moveset · ⚙ 30 to move it',
    );
    // Your Primary's extra slot moves (30 scrap); the target's own extra Primary slot comes back.
    expect(screen.getByTestId('transfer-button')).toHaveTextContent(
      /Transfer my moveset here · ⚙ 30 · \+1 Link$/,
    );
    expect(screen.queryByTestId('transfer-leaves')).toBeNull(); // a rare sword carries all of yours
    fireEvent.click(screen.getByTestId('transfer-button'));
    expect(screen.getByRole('status')).toHaveTextContent('Not enough scrap');
    act(() => store().setProfile({ ...store().profile, scrap: 30 }));
    fireEvent.click(screen.getByTestId('transfer-button'));
    const now = store().profile;
    expect(now.equipped.weapon!.uid).toBe('w1');
    expect(now.equipped.weapon!.moveset!.chains.primary).toEqual(mine.moveset.chains.primary);
    expect(now.equipped.weapon!.moveset!.slots).toMatchObject({ primary: 2, defensive: 1 });
    expect(now.bag.find((i) => i.uid === sword.uid)!.moveset!.slots.primary).toBe(1);
    expect(now).toMatchObject({ scrap: 0, links: 1 });
    expect(screen.getByText(/Your moveset moved onto .+ · \+1 Link$/)).toBeInTheDocument();
  });

  it('each valuation shows its own delta: Equip is marked as it is, Transfer as a home', () => {
    const p = store().profile;
    const sword = p.equipped.weapon!;
    // A built-up common sword against a plain uncommon one: worse as it is, better as a home.
    const mine = {
      ...sword,
      moveset: defaultMoveset(registry, sword, 'fire', { primary: 5, basic: 5 }),
    };
    const plain = generateItem(
      registry,
      { uid: 'w2', ilvl: 2, rarity: 'uncommon', slot: 'weapon', baseId: 'sword', mana: 'fire' },
      new SeededRNG(4),
    );
    const equipped = { ...p.equipped, weapon: mine };
    store().setProfile({ ...p, equipped, bag: [plain] });
    const depth = referenceDepth(store().profile);
    const asIs = compareItem(equipped, plain, registry, depth, p.pair, 'asIs').powerPct;
    const home = compareItem(equipped, plain, registry, depth, p.pair).powerPct;
    expect(asIs).toBeLessThan(-UPGRADE_EPSILON);
    expect(home).toBeGreaterThan(UPGRADE_EPSILON);
    render(<ItemDetailSheet uid="w2" onClose={() => {}} />);
    expect(screen.getByTestId('compare-as-is')).toHaveTextContent(`Power▼ ${formatDelta(asIs)}`);
    expect(screen.getByTestId('compare-home')).toHaveTextContent(`Power▲ ${formatDelta(home)}`);
    expect(screen.getByTestId('equip-button')).toHaveTextContent(/^Equip$/);
    // Four Primary and two basic extra slots move: 6 × 30 scrap.
    expect(screen.getByTestId('transfer-button')).toHaveTextContent(
      /^▲ Transfer my moveset here · ⚙ 180$/,
    );
    expect(screen.getByTestId('transfer-button')).toHaveClass('delve-btn-green');
  });

  it('Transfer onto a weapon that carries less says which of your chains stay behind', () => {
    const p = store().profile;
    const epic = { ...p.equipped.weapon!, rarity: 'epic' as const };
    const mine = { ...epic, moveset: defaultMoveset(registry, epic, 'fire') };
    const plain = generateItem(
      registry,
      { uid: 'w2', ilvl: 2, rarity: 'common', slot: 'weapon', baseId: 'sword', mana: 'fire' },
      new SeededRNG(4),
    );
    store().setProfile({ ...p, equipped: { ...p.equipped, weapon: mine }, bag: [plain] });
    render(<ItemDetailSheet uid="w2" onClose={() => {}} />);
    expect(screen.getByTestId('transfer-leaves')).toHaveTextContent(
      'Leaves your Defensive and Ultimate behind',
    );
  });

  it('a legendary whose power rides a skill the weapon lacks says it needs it', () => {
    const boots = generateItem(
      registry,
      { uid: 'b1', ilvl: 3, rarity: 'legendary', slot: 'boots', mana: 'fire' },
      new SeededRNG(4),
    );
    put({ ...boots, legendary: { id: 'nightstalker', value: 30, roll: 0.5 } });
    const { unmount } = render(<ItemDetailSheet uid="b1" onClose={() => {}} />);
    expect(screen.getByTestId('legendary-dead')).toHaveTextContent(
      "Needs a Defensive: your weapon doesn't carry one",
    );
    unmount();
    // A rare weapon carries a Defensive.
    const p = store().profile;
    store().setProfile({ ...p, equipped: { ...p.equipped, weapon: rareSword('w1') } });
    render(<ItemDetailSheet uid="b1" onClose={() => {}} />);
    expect(screen.queryByTestId('legendary-dead')).toBeNull();
  });

  it('salvaging a weapon with extra slots says the Links it gave', () => {
    put(rareSword('w1', { primary: 3 }));
    render(
      <>
        <ItemDetailSheet uid="w1" onClose={() => {}} />
        <ToastContainer />
      </>,
    );
    fireEvent.click(screen.getByTestId('salvage-button'));
    fireEvent.click(screen.getByTestId('salvage-button')); // a rare asks twice
    expect(store().profile.links).toBe(2);
    expect(screen.getByText('+2 Links from its extra slots')).toBeInTheDocument();
  });

  it('mid-dive the Forge tab waits for the dive to end', () => {
    store().startDive(1);
    render(<ForgePanel onSelect={() => {}} />);
    expect(screen.getByTestId('forge-locked')).toHaveTextContent('forge and salvage between dives');
    expect(screen.queryByTestId('fuse-button')).toBeNull();
  });
});

describe('ItemDetailSheet and the Forge: runes', () => {
  const split = { id: 'split', tier: 3 } as const;
  const quick = { id: 'quick', tier: 1 } as const;
  beforeEach(() => {
    localStorage.clear();
    useDelveStore.getState().resetProfile(1234, 'fire');
    useDelveStore.setState({ unsocket: null });
  });

  /** `w` with its Primary's first move holding `runes`. */
  const withRunes = (w: GearItem, runes: (RuneRef | null)[]): GearItem => {
    const moveset = w.moveset!;
    const primary = moveset.chains.primary!;
    const moves = [{ ...primary.moves[0], runes }, ...primary.moves.slice(1)];
    return { ...w, moveset: { ...moveset, chains: { ...moveset.chains, primary: { ...primary, moves } } } };
  };

  it("a weapon's sheet lists each move's open sockets and their runes, read-only", () => {
    const p = store().profile;
    const sword = withRunes(p.equipped.weapon!, [split]);
    store().setProfile({ ...p, equipped: { ...p.equipped, weapon: sword } });
    render(<ItemDetailSheet uid={sword.uid} onClose={() => {}} />);
    expect(screen.getByTestId('item-sockets')).toHaveTextContent('Sockets · up to 1 a move');
    expect(screen.getByTestId('item-sockets-primary-0')).toHaveTextContent('Primary 1');
    expect(screen.getByRole('img', { name: 'Socket 1: Split III' })).toBeInTheDocument();
    expect(within(screen.getByTestId('item-sockets')).queryAllByRole('button')).toHaveLength(0);
  });

  it("a transfer counts the sockets it moves and names the runes that leave, by the pull rule", () => {
    const p = store().profile;
    // A rare sword's two sockets onto a common one (one a move): Quick has no socket there.
    const worn = withRunes(rareSword('w1'), [split, quick]);
    const common = { ...p.equipped.weapon!, uid: 'w2' };
    store().setProfile({ ...p, scrap: 999, equipped: { ...p.equipped, weapon: worn }, bag: [common] });
    render(
      <>
        <ItemDetailSheet uid="w2" onClose={() => {}} />
        <ToastContainer />
      </>,
    );
    expect(screen.getByTestId('item-compare')).toHaveTextContent('to move it, its 1 socket included');
    expect(screen.getByTestId('transfer-runes')).toHaveTextContent('Destroys Quick I: no socket for it there');
    act(() => store().setUnsocket('pay'));
    expect(screen.getByTestId('transfer-runes')).toHaveTextContent('Quick I back to your pouch');
    act(() => store().setUnsocket('destroy'));
    fireEvent.click(screen.getByTestId('transfer-button'));
    expect(screen.getByText(/Your moveset moved onto .+ · \+1 Link · destroys Quick I$/)).toBeInTheDocument();
    expect(store().profile.equipped.weapon!.uid).toBe('w2');
  });

  it('Salvage asks first for any weapon holding runes, naming what becomes of them by the pull rule', () => {
    const p = store().profile;
    const held = { ...withRunes(p.equipped.weapon!, [split]), uid: 'w2' };
    expect(held.rarity).toBe('common');
    store().setProfile({ ...p, bag: [held] });
    render(<ItemDetailSheet uid="w2" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('salvage-button'));
    expect(store().profile.bag).toHaveLength(1);
    expect(screen.getByTestId('salvage-button')).toHaveTextContent('Tap again to melt · destroys Split III');
    act(() => store().setUnsocket('pay'));
    expect(screen.getByTestId('salvage-button')).toHaveTextContent('Tap again to melt · Split III back to your pouch');
    fireEvent.click(screen.getByTestId('salvage-button'));
    expect(store().profile.bag).toHaveLength(0);
    expect(store().profile.runes).toEqual({ split: [0, 0, 1, 0, 0] });
  });

  it("the Forge's Fuse asks first when an input holds runes, naming what becomes of them", async () => {
    const animate = vi.fn(() => ({ finished: Promise.resolve() }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true });
    const three = [withRunes(rareSword('a'), [split]), rareSword('b'), rareSword('c')];
    store().setProfile({ ...store().profile, scrap: 9999, bag: three });
    render(<ForgePanel onSelect={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^Rare/ }));
    fireEvent.click(screen.getByText('Auto-pick'));
    fireEvent.click(screen.getByTestId('fuse-button'));
    expect(store().profile.bag).toHaveLength(3);
    expect(screen.getByTestId('fuse-button')).toHaveTextContent('Tap again to fuse · destroys Split III');
    await act(async () => fireEvent.click(screen.getByTestId('fuse-button')));
    expect(store().profile.bag.map((i) => i.rarity)).toEqual(['epic']);
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
  });

  it('the Forge tab holds the pouch: three of a rune fuse into one of the next tier, for scrap', () => {
    store().setProfile({ ...store().profile, scrap: 20, runes: { split: [3, 0, 0, 0, 0] } });
    render(
      <>
        <ForgePanel onSelect={() => {}} />
        <ToastContainer />
      </>,
    );
    fireEvent.click(within(screen.getByTestId('forge-runes')).getByTestId('rune-fuse-split-1'));
    expect(store().profile).toMatchObject({ scrap: 0, runes: { split: [0, 1, 0, 0, 0] } });
    expect(screen.getByText('Fused 3 Split I into Split II')).toBeInTheDocument();
    expect(screen.getByTestId('pouch-split-2')).toHaveTextContent('Split II ×1');
  });
});
