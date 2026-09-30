# Delve weapon movesets: chains live on the weapon, with slots you earn

**Status:** approved design, 2026-09-30. It is stage 4a of the skill roadmap and ships as v0.49.0.

The whole of stage 4 is three projects, in this order:
- **4a (this spec):** weapon movesets and slots.
- **4b:** runes, the modifiers (split, multi-shot and so on): rune drops, sockets on moves, salvaging and crafting runes.
- **4c:** component crafting, a general break-down-and-combine across every part of a weapon (slots, modifiers, mana affinities).

Later, beyond these three: mid-run places to adjust a build (anvils, altars and other lore spots inside the Delve).

## Why

The user wants a build to be an investment, not a free menu: "It shouldn't be completely free and easy to change your build out mid-run." Today every chain belongs to the hero. It holds up to 5 moves from the first minute (`chainCaps`, all 5), and is edited for free between dives. Gear, weapons included, swaps freely mid-fight.

## Decisions (the user's)

| Question | Decision |
|---|---|
| Where the moveset lives | **On the weapon.** Each weapon carries its own four chains, with a slot count per chain. |
| Starting slots | Primary, Defensive and Ultimate start at **1 slot**. The basic chain starts at its **weapon's string length** (sword 3, maul 2, dagger 4). Every chain grows to **5**. |
| Drops | **Extra slots by rarity**, spread over the chains, holding default moves. |
| Slot parts | **Links.** Salvaging a weapon gives one Link per extra slot. A slot costs Links at a rising price (1, 2, 3, 4) plus scrap. |
| Off-pair elements | **Nothing changes on its own.** A weapon's move keeps its element even outside the pair: it still casts and reacts, but draws no attunement power. Changing an element is a paid edit. |
| Changes | Edits cost a little Mana Dust per move, and element changes cost more. A transfer to another weapon costs scrap per extra slot. |
| During a dive | **All gear is locked.** Loot goes to the bag, and every equip and build change happens at the Anvil. |
| Balance | Measure pacing before and after. If a rail breaks, stop and bring the numbers to the user rather than tune. |

## Design

### The moveset
- **On the item.** A weapon item (`GearItem` with `slot: 'weapon'`) carries a `moveset: { chains: Chains; slots: Record<ChainSkill, number> }`. Each chain holds 1 to `slots[skill]` moves, and `slots[skill]` runs from its base up to `chains.cap` (5).
- **Base slots.** The base is 1 for `primary`, `defensive` and `ultimate`. For `basic` it is the length of the weapon base's `defaultChain` (unarmed: `hero.defaultChain`). A weapon's **extra slots** are the sum over its chains of `slots − base`.
- **The hero's chains** are the equipped weapon's `moveset.chains`. Unarmed, they are a default moveset at base slots in the hero's primary element (the weapon's mana before the choice). `profile.chains` and `profile.chainCaps` go away. One accessor, `heroChains(registry, profile)`, replaces every reader. Its readers are `profileStats`, `beginFloor`, `heroPower`/`compareItem`, the autopilot, the store, the chain builder, and the Training Grounds' Load my build.
- **Default moves.**
  - **Ability chains.** A default move uses the chain's form: the form's `defaultChain` kind at the move's position, or medium past the end of it. Its element is the move's owner's: the item's `mana` for a drop, the hero's primary for the starting weapon.
  - **Basic chains.** A basic default is the weapon's `defaultChain` blows in that element.
  - **Forms.** The default forms are Bolt, Ward and Nova, as today.
- **Off-pair elements.** A move may hold an element outside the pair when it came that way (a drop's element, a transferred moveset). It casts and reacts in that element, but draws no attunement power (attunement counts only the pair).
  - **Nothing re-colours a weapon's moves on its own.** Equipping, binding and overtaking change no move. `followBasic` and the default-chain following retire from the Delve; the Training Grounds keep them.
  - **Realign is the exception.** It is a paid choice the player makes, and it still maps every move of the equipped weapon by role (`fixChainsToPair` with `was`).
- **The chain builder** marks off-pair moves ("off-pair: unpowered").

### Drops
- **Extra slots.** A weapon drop rolls extra slots by rarity (`balance.json → delve.movesets.extraSlots`): common 0, magic 0–1, rare 1–2, epic 2–3, legendary 3–4.
  - They're spread uniformly at random over the four chains, never past 5.
  - The roll uses the loot RNG, so it's deterministic.
- **The moves.** Each extra slot holds its chain's default move, in the item's `mana`.
- **Non-weapon gear** is unchanged.

### Links and slots
- **Links** are a new profile counter, `profile.links`, shown at the Anvil next to scrap and Mana Dust.
- **Salvage** (manual and auto) of a weapon adds its extra slots in Links, on top of today's scrap and dust. The salvage toast and the dive summary show the Links.
- **Adding a slot.** `addSlot(registry, profile, skill)` adds a slot to a chain of the equipped weapon.
  - **Cost:** `movesets.slotLinks[n]` Links (1, 2, 3 or 4 for the 2nd, 3rd, 4th or 5th slot) plus `movesets.slotScrap[n]` scrap.
  - **The new slot's move:** the default kind at its position, with the chain's last move's form and elements.
  - **Refusals:** mid-dive, at 5 slots, and when unaffordable.
  - An unarmed hero has no weapon to add to.

### Changes and their price
- **Editing.** `setChain` edits the equipped weapon's chain, at a price in Mana Dust:
  - **Kinds, forms and order:** `movesets.editDust` (5) for each move whose kind or form changed, or that moved.
  - **Elements:** `movesets.elementDust` (15) for each move whose elements changed.
  - **Adding or removing a move:** 5 dust, like any edit. A chain can be shorter than its slots, and an empty slot costs nothing and does nothing.
  - **Off-pair elements.** A new element must be one of the pair. An unchanged off-pair element is kept.
  - **The payment.** One edit, possibly of several moves, pays their sum at once. The builder shows the price before the player confirms.
  - **Free edits.** Edits are free until the hero's first dive (`stats.dives === 0`), so a new player learns the builder for free.
  - **Refusals:** mid-dive, and when unaffordable.
- **Transfer.** `transferMoveset(registry, profile, uid)` moves the equipped weapon's whole moveset onto a weapon in the bag, then equips it. The old weapon goes back to the bag at its base slots with default moves in its own mana.
  - **Cost:** `movesets.transferScrap` (30) scrap per extra slot of the moved moveset.
  - **The target's own extra slots** come back as Links, so nothing is lost.
  - **Basic slots across weapon bases.** A basic chain keeps its slot count, but never below the new weapon's base. Its blows carry over.
  - **Refusals:** mid-dive, and when unaffordable.
- **During a dive**, nothing about gear changes:
  - `equipItem`, `unequipSlot`, `equipBest`, `setChain`, `addSlot`, `transferMoveset`, salvage and the forge all refuse while `isDiveActive`. Salvage and the forge are already between dives.
  - Loot still goes to the bag mid-fight, with its ▲ upgrade mark.
  - The arena's Equip and Equip best buttons (`LootTray`, `PickupFeed`) and the item sheet's Equip give way to "Equip at the Anvil".
  - The bind prompt shows only at the Anvil.
- **The Training Grounds** are unchanged: their own chains, 5 slots, free and instant. Load my build copies the equipped weapon's moveset.

## Migration (save v6)
Nothing is lost:
- **The equipped weapon** gets `moveset.chains` = the profile's chains, and `slots` = each chain's length (at least its base).
- **Other weapons** in the bag and equipped slots get their base slots with default moves in their own mana.
- **The profile** loses `chains` and `chainCaps`, and gains `links: 0`.
- **An unarmed save** keeps its chains on the default moveset.

v5 and older saves migrate through v5, as today. The freeze pattern follows v5: a frozen `DelveProfileV5Schema`.

## Engine surface
- **Types:** `Moveset`, `GearItem.moveset?`, `DelveProfile.links`; `chains` and `chainCaps` are removed.
- **Data:** `balance.json → delve.movesets` holds `extraSlots` by rarity, `slotLinks`, `slotScrap`, `editDust`, `elementDust` and `transferScrap`, with their schemas.
- **Loot:** the loot generator rolls a weapon's moveset.
- **Salvage:** `salvageValue`'s callers gain Links.
- **`delve/`:** the profile ops, `heroChains`, pair ops (realign on the weapon), `profileStats`, and the dive lock.
- **The autopilot** plays the new rules between dives:
  - It equips the best weapon, valuing each candidate with its own moveset.
  - When a bag weapon beats the current one and the transfer is affordable, it transfers its moveset instead.
  - It spends Links on the Primary, then the Basic, the Ultimate and the Defensive.
  - `bindBest` pays for its edit.
  - It no longer equips mid-floor.

## Balance and gates
- **Pacing will drop.** New heroes start with 1-move ability chains, and the autopilot no longer gears up mid-dive. Capture `runAutopilot` numbers before any change, then compare. Every rail in `tests/delve-pacing.test.ts` must hold; if one breaks, stop and report the numbers. The fix is the user's call: the slot costs, the drop slots, the starting slots, or a changed rail.
- **The DPS Lab** builds its chains explicitly, so its grid must come out identical.

## Testing
- **Engine:**
  - base slots per weapon;
  - drop slots by rarity and determinism;
  - salvage giving Links;
  - `addSlot` costs and refusals;
  - `setChain` prices (kind, element, the first-dive freebie) and refusals;
  - off-pair moves kept and unpowered;
  - `transferMoveset` (price, the target's slots returned as Links, basic slots across bases);
  - the dive lock on every op;
  - realign mapping the weapon's moves;
  - bind and overtake leaving moves alone;
  - migration v5 to v6 with nothing lost;
  - `heroChains` unarmed.
- **Client:**
  - slots shown ("2/5") with the Add slot price;
  - the edit price before confirming;
  - off-pair marks;
  - a weapon sheet's moveset summary and its Transfer button;
  - Links shown;
  - equip buttons hidden mid-dive with the Anvil note.
- **Existing tests** that read `profile.chains` or equip mid-dive change; the plan lists them.
- **E2E:** the Delve specs pass. Any that equip mid-dive move to the Anvil.

## Docs and version
- **CLAUDE.md:** the Delve section gets the weapon moveset, Links, the dive lock and the migration.
- **Superseded notes:**
  - the chains spec: `chainCaps`, and chains on the profile;
  - the affinity spec: the fixes on bind and equip;
  - the loot spec: equipping mid-fight.
- **Version:** `chore(client): bump version to 0.49.0`.
