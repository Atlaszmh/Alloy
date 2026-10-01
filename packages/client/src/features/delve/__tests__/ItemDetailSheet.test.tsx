import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import {
  compareItem,
  defaultMoveset,
  generateItem,
  heroChains,
  referenceDepth,
  SeededRNG,
  type GearItem,
  type ManaType,
} from '@alloy/engine';
import { ItemDetailSheet } from '../ItemDetailSheet';
import { BagPanel } from '../BagPanel';
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

  it('equipping gear outside the pair asks to bind it, with the Power either way; Bind binds, then equips', () => {
    put(helm('storm'));
    const onClose = vi.fn();
    render(<ItemDetailSheet uid="h1" onClose={onClose} />);
    fireEvent.click(screen.getByTestId('equip-button'));
    const prompt = screen.getByTestId('bind-prompt');
    expect(prompt).toHaveAttribute('data-pad-scope');
    expect(prompt).toHaveTextContent('Bind Storm as your second element?');
    expect(screen.getByTestId('bind-prompt-bound')).toHaveTextContent('Power');
    expect(screen.getByTestId('bind-prompt-unbound')).toHaveTextContent('Power');
    expect(screen.getByTestId('bind-prompt-not-now')).toHaveAttribute('data-pad-back');
    expect(screen.getByTestId('bind-prompt-confirm')).toHaveFocus();
    // It holds the keyboard: the sheet behind it takes no focus or clicks.
    expect(screen.getByRole('dialog', { name: 'Bind Storm' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('equip-button').closest('[inert]')).not.toBeNull();
    fireEvent.click(screen.getByTestId('bind-prompt-confirm'));
    expect(store().profile.pair).toEqual({ primary: 'fire', secondary: 'storm' });
    expect(store().profile.equipped.helm?.uid).toBe('h1');
    expect(onClose).toHaveBeenCalled();
  });

  it('the bind prompt says the chains keep their moves, and binding leaves them alone', () => {
    put(helm('storm'));
    const before = heroChains(registry, store().profile.equipped, store().profile.pair);
    render(<ItemDetailSheet uid="h1" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('equip-button'));
    expect(screen.getByTestId('bind-prompt')).toHaveTextContent(
      'Your moves and blows can use Storm and its gear will attune you; your chains keep the ones they have',
    );
    expect(screen.getByTestId('bind-prompt')).not.toHaveTextContent('last blow');
    fireEvent.click(screen.getByTestId('bind-prompt-confirm'));
    expect(heroChains(registry, store().profile.equipped, store().profile.pair)).toEqual(before);
  });

  it('Not now equips for its stats only, and the prompt stays away this session', () => {
    put(helm('storm'), helm('storm', 'h2'));
    const { unmount } = render(<ItemDetailSheet uid="h1" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('equip-button'));
    fireEvent.click(screen.getByTestId('bind-prompt-not-now'));
    expect(store().profile.pair.secondary).toBeNull();
    expect(store().profile.equipped.helm?.uid).toBe('h1');
    unmount();
    render(<ItemDetailSheet uid="h2" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('equip-button'));
    expect(screen.queryByTestId('bind-prompt')).toBeNull();
    expect(store().profile.equipped.helm?.uid).toBe('h2');
  });

  it('Not now is remembered per element: Nature still asks after Storm', () => {
    put(helm('storm'), helm('nature', 'h2'));
    const { unmount } = render(<ItemDetailSheet uid="h1" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('equip-button'));
    fireEvent.click(screen.getByTestId('bind-prompt-not-now'));
    unmount();
    render(<ItemDetailSheet uid="h2" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('equip-button'));
    expect(screen.getByTestId('bind-prompt')).toHaveTextContent('Bind Nature as your second element?');
    expect(store().profile.equipped.helm?.uid).toBe('h1');
  });

  it('a refused bind says why and equips nothing', () => {
    put(helm('storm'));
    const onClose = vi.fn();
    render(
      <>
        <ItemDetailSheet uid="h1" onClose={onClose} />
        <ToastContainer />
      </>,
    );
    fireEvent.click(screen.getByTestId('equip-button'));
    // Bound elsewhere while the prompt was open: the engine refuses a second bind.
    act(() =>
      store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'nature' } }),
    );
    fireEvent.click(screen.getByTestId('bind-prompt-confirm'));
    expect(screen.getByText('Your second element is already bound')).toBeInTheDocument();
    expect(store().profile.equipped.helm).toBeUndefined();
    expect(store().profile.pair.secondary).toBe('nature');
    expect(onClose).toHaveBeenCalled();
  });

  it('mid-dive Equip, Unequip and Transfer give way to "Equip at the Anvil"', () => {
    put(helm('storm'), rareSword('w1'));
    store().startDive(1);
    const sheet = (uid: string) => render(<ItemDetailSheet uid={uid} onClose={() => {}} />);
    let view = sheet('h1');
    expect(screen.queryByTestId('equip-button')).toBeNull();
    expect(screen.getByTestId('equip-locked')).toHaveTextContent('Equip at the Anvil');
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

  it('Equip best never asks, and leaves weapons alone', () => {
    put(helm('storm'), rareSword('w1', { primary: 5 })); // an empty helm slot: an upgrade
    // The sword is an upgrade too, which Equip best still leaves to its sheet.
    const { equipped, pair } = store().profile;
    expect(
      compareItem(equipped, store().profile.bag[1], registry, 1, pair).powerPct,
    ).toBeGreaterThan(UPGRADE_EPSILON);
    render(<BagPanel onSelect={() => {}} />);
    expect(screen.getByTestId('equip-best')).toHaveTextContent('▲ Equip best (1)');
    fireEvent.click(screen.getByTestId('equip-best'));
    expect(screen.queryByTestId('bind-prompt')).toBeNull();
    expect(store().profile.equipped.helm?.uid).toBe('h1');
    expect(store().profile.equipped.weapon?.uid).not.toBe('w1');
    expect(store().profile.pair.secondary).toBeNull();
  });

  it("mid-dive the bag's Equip best and Salvage junk wait for the dive to end", () => {
    put(helm('storm'));
    store().startDive(1);
    render(<BagPanel onSelect={() => {}} />);
    expect(screen.getByTestId('equip-best')).toBeDisabled();
    expect(screen.getByTestId('equip-best')).toHaveTextContent('Equip between dives');
    expect(screen.getByTestId('salvage-junk')).toBeDisabled();
    expect(screen.getByTestId('salvage-junk')).toHaveTextContent('Salvage between dives');
  });

  it('mid-dive the Forge tab waits for the dive to end', () => {
    store().startDive(1);
    render(<ForgePanel onSelect={() => {}} />);
    expect(screen.getByTestId('forge-locked')).toHaveTextContent('forge and salvage between dives');
    expect(screen.queryByTestId('fuse-button')).toBeNull();
  });
});
