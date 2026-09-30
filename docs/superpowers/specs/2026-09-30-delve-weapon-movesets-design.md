# Delve weapon movesets: chains live on the weapon, with slots you earn

**Status:** approved design, 2026-09-30. It is stage 4a of the skill roadmap, and it ships as v0.49.0.

Stage 4 is three projects, in this order:
- **4a (this spec):** weapon movesets and slots.
- **4b:** runes, the modifiers (split, multi-shot and so on): rune drops, sockets on moves, salvaging and crafting runes.
- **4c:** component crafting, a general break-down-and-combine across every part (slots, modifiers, mana affinities).

Beyond those three: mid-run places to adjust a build (anvils, altars and other lore spots inside the Delve).

## Why

The user wants a build to be an investment, not a free menu: "It shouldn't be completely free and easy to change your build out mid-run." Today:
- every chain belongs to the hero, and holds up to 5 moves from the first minute (`chainCaps`, all 5);
- chains are edited for free between dives;
- gear, weapons included, swaps freely mid-fight.

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
- **On the weapon.** A weapon item carries `moveset: { chains: Chains; slots: Record<ChainSkill, number> }`. Each chain holds 1 to `slots[skill]` moves, and `slots[skill]` runs from its base up to `chains.cap` (5).
- **Base slots.** Base slots are 1 for `primary`, `defensive` and `ultimate`. For `basic` it's the length of the weapon base's `defaultChain`. A weapon's **extra slots** are, summed over its chains, `slots − base`.
- **The hero's chains.** `heroChains(registry, equipped, pair)` gives the equipped weapon's `moveset.chains`. Unarmed, it gives a computed default moveset at base slots, never stored, in the pair's primary, or `'fire'` before the choice. It takes the gear rather than the profile, so `profileStats`, `heroPower` and `compareItem` lose their `chains` parameter.
- **`profile.chains` and `profile.chainCaps` go.** Every reader moves to `heroChains` or the equipped weapon's moveset:
  - Engine:
    - `profileStats`, `profilePower`, `salvageCandidates`, `beginFloor`;
    - `overtakeProgress`, `fixChainsToPair`, `followBasicTo`, `realign`;
    - the autopilot (`bindBest`, `betweenDives`, `visitForge`, `playFloor`).
  - Client:
    - `DelveCamp`, `PaperDoll`, `BagPanel`, `useArena`;
    - `ItemDetailSheet`, `LootTray`, `PickupFeed`;
    - `ManaPanel`, `BindPrompt`;
    - `AbilitiesPanel` (and its `caps`), the store's `setChain`.
  - Tests: the E2E `delve-gamepad.spec.ts`, which reads `.chains.basic` from the save, and `tests/fixtures/arena.ts`.
- **Default moves.**
  - **Ability chains:** each form's `defaultChain` kind at the move's position, or medium past its end. The forms are Bolt, Ward and Nova, with today's payments (mana, mana, charge).
  - **Basic chains:** the weapon's `defaultChain` blows.
  - **Element:** the drop's `mana` for a drop, or the hero's primary for the starting weapon.
- **Off-pair elements.** A move may keep an element outside the pair when it came that way: a drop's element, or a transferred or re-attuned weapon.
  - **What still works:** it casts and reacts in that element, and still gets gear's `<Element> Power` lines and legendary knobs.
  - **What it loses:** attunement power and masteries, since attunement counts only the pair.
  - **The label:** the builder marks it "off-pair: no attunement".
- **Nothing re-colours a weapon's moves on its own.**
  - **Unchanged:** equipping, binding, overtaking, re-attuning a weapon, and bag weapons during a realign all leave moves as they are.
  - **What retires from the Delve:**
    - `followBasic` / `followBasicTo`, with `compareItem`'s use of it;
    - realign's default-basic branch;
    - the autopilot's `betweenDives` call to `fixChainsToPair` without `was`;
    - the bind texts and "Power if bound" preview in `BindPrompt` and `ManaPanel` that promise a default basic's last blow. They now say the chain keeps its blows.

    The Training Grounds keep `followBasic` for their sandbox.
  - **Realign is the exception.** It's a paid choice, and it maps every move of the **equipped** weapon by role (`fixChainsToPair` with `was`).
- **`chooseStartingMana`.** It rewrites the equipped weapon's moveset at base slots with default moves in the chosen mana, as it resets the chains today. So no new hero starts off-pair.
- **Unarmed.** `setChain`, `addSlot` and transfer refuse with "Equip a weapon to build your moves", and the builder shows the unarmed default read-only.

### Drops, fusing and generation
- **Extra slots.** A weapon drop rolls extra slots by rarity (`balance.json → delve.movesets.extraSlots`):

  | Rarity | Extra slots |
  |---|---|
  | common | 0 |
  | uncommon | 0 |
  | magic | 0–1 |
  | rare | 1–2 |
  | epic | 2–3 |
  | legendary | 3–4 |

  They are spread uniformly at random over the four chains, never past 5. Each holds its chain's default move in the item's `mana`.
- **The roll runs after everything else.** `generateItem` rolls the moveset last, from `rng.fork('moveset')`, which never advances the item's RNG. So every item's stats, and every later drop, come out exactly as today.
  - The starting gear and `sandboxWeapon` (common, 0 extra) get base movesets.
  - The DPS Lab, which builds its chains explicitly, stays identical.
- **Fusing.** Fusing three items (`fuseItems`) refunds the inputs' weapon extra slots as Links, exactly as salvaging them would. A fused weapon rolls its own moveset for its rarity.
- **Non-weapon gear** is unchanged.

### Links and slots
- **Links** are a new profile counter, `profile.links`, shown at the Anvil beside scrap and Mana Dust.
- **Getting Links:** salvaging a weapon (manual, auto, or a full bag's melt) adds its extra slots in Links.
  - `BagInsertResult`, `BankResult` and the store's `salvage` return value gain `links`.
  - `DiveState` gains `linksEarned`, defaulting to 0 like `dustEarned`, so the dive summary and the salvage toast can show them.
- **Adding a slot.** `addSlot(registry, profile, skill)` adds one slot to a chain of the equipped weapon and appends its default move.
  - **Cost:** by the new slot's position, `slotLinks` (the 2nd slot 1, the 3rd 2, the 4th 3, the 5th 4) plus `slotScrap` at the same index. A sword's 4th basic slot costs 3 Links.
  - **The new move:** for an ability chain, the default kind at its position, with the chain's last move's form, elements and nothing else. For a basic chain, the weapon's default kind at its position (or medium), in the last blow's element.
  - **Refusals:** mid-dive, when unarmed, at 5 slots, and when it can't be paid for.

### Changes and their price
- **One price function** is shared by the engine's charge and the builder's preview: `movesetEditPrice(registry, old, next)`, a Mana Dust total. Compare the old and new chain position by position:
  - **Kind or form changed:** a position whose kind or form differs costs `editDust` (5). So a reorder swap costs 2 moves.
  - **Elements changed:** a position whose elements differ costs `elementDust` (15).
  - **A new position** (the chain grew) costs `editDust`, plus `elementDust` if any of its elements appears nowhere in the old chain. So removing a move and re-adding it doesn't dodge the element price.
  - **A removed position** costs `editDust`.
  - **A changed payment** costs `editDust`.
  - **Free edits:** every edit costs 0 until the hero's first dive (`stats.dives === 0`).
- **`setChain`** edits the equipped weapon's chain.
  - **It returns a `ProfileActionResult`,** like the other refusing ops, instead of throwing.
  - **It refuses:**
    - mid-dive;
    - when unarmed;
    - when it can't be paid for;
    - past the chain's slots;
    - a position whose elements changed to include any element outside the pair (so an unchanged off-pair position is kept, but neither new nor copied moves can be off-pair);
    - today's other refusals.
  - **The autopilot's `bindBest`** pays for its edit, and skips it when it can't.
- **The Anvil's chain builder** works on a draft. Edits pile up, the price shows (`movesetEditPrice`), and **Apply** (paid) or **Revert** settles them. Off-pair moves show their element chip marked and can't be picked for new moves. The Training Grounds' builder stays instant and free.
- **Transfer.** `transferMoveset(registry, profile, uid)` moves the equipped weapon's moveset onto a weapon in the bag and equips it.
  - **Each chain keeps its extra count on the new weapon:** its slots become the new base plus the source's extra, capped at 5.
    - Any overflow past 5 comes back as Links.
    - Moves past the new slot count (a basic chain onto a lower-base weapon) are dropped from the end.
  - **The target's own extra slots** come back as Links.
  - **The old weapon** returns to the bag at its base slots, with default moves in its own mana.
  - **Price:** `transferScrap` (30) for each of the source's extra slots.
  - **Refusals:** mid-dive, and when it can't be paid for.

### Valuing weapons
A weapon can be valued two ways:
- **As-is:** with its own moveset, as it would fight if equipped now.
- **As a home:** with your equipped moveset moved onto it.

Where each is used:
- **The ▲ upgrade mark, `salvageCandidates` and the autopilot's fusion spares** value weapons as a home, so a good base is never marked junk.
- **The item sheet** shows both, as-is and "with your moveset", the latter with the transfer price.
- **"Equip best" (`equipBest`)** equips non-weapon gear only. A weapon changes through the item sheet's Equip (as-is) or Transfer.

### The item sheet
A weapon's sheet shows its moveset: each chain's slots (e.g. "Primary 2/5") and its moves. For a bag weapon, it also offers **Transfer my moveset here** (with the price). The equipped weapon's sheet links to the chain builder.

### During a dive
Nothing about gear changes.
- **Refused while `isDiveActive`:** `equipItem`, `unequipSlot`, `equipBest`, `setChain`, `addSlot`, `transferMoveset` and `reattuneItem` (salvage and the forge are already between dives). `chooseStartingMana` stays allowed, for a migrated save mid-dive.
- **Loot** still goes to the bag mid-fight, with its ▲ mark.
- **The arena's controls:** Equip and Equip best (`LootTray`, `PickupFeed`), and the item sheet's Equip, Unequip, Transfer and Add slot, give way to "Equip at the Anvil" while a dive runs.
- **The bind prompt** shows only at the Anvil.
- **A dive that ends** by death or extraction unlocks, because `isDiveActive` covers only `fighting` and `choosing`.

### The Training Grounds
Unchanged: their own chains, 5 slots, free and instant. Load my build copies the equipped weapon's moveset.

## Migration (save v6)
- **Item schema.** `moveset` is added to the shared `GearItemSchema` as optional, so v3, v4 and v5 saves still parse.
  - `parseDelveProfile`, which has the registry, fills in any weapon without a moveset at load with base defaults in its own mana.
  - It raises any basic slot count below its weapon's base.
- **v5 → v6:**
  - **The equipped weapon** gets `moveset.chains` equal to the profile's chains, and `slots` equal to each chain's length, raised to at least its base.
  - **Every other weapon** gets base defaults.
  - **The profile** loses `chains` and `chainCaps` and gains `links: 0`.
  - **Nothing is lost,** with one exception: an **unarmed** v5 save with built chains resets them to the unarmed defaults, since no weapon holds them. It's rare, and a toast says so.
- **Older saves.** A frozen `DelveProfileV5Schema` keeps v5 readable, and older saves migrate through v5 as today.

## Engine surface
- **Types:** `Moveset`, `GearItem.moveset?`, `DelveProfile.links` (and no `chains` or `chainCaps`), `DiveState.linksEarned`, and `links` on `BagInsertResult` and `BankResult`.
- **Data:** `balance.json → delve.movesets`, holding `extraSlots` (all six rarities), `slotLinks`, `slotScrap`, `editDust`, `elementDust` and `transferScrap`, with their schemas.
- **Functions:**
  - `generateItem`'s moveset roll;
  - `fuseItems`' refund;
  - `heroChains`, `movesetEditPrice`, `addSlot`, `transferMoveset`, and the `setChain` result;
  - valuing a weapon as-is and as a home;
  - the dive lock;
  - `chooseStartingMana`;
  - realign on the equipped weapon;
  - the retirements listed above.
- **The autopilot:**
  - between dives, `visitForge` first transfers onto the best bag weapon as a home (if affordable), then fuses and salvages as today;
  - it equips non-weapon gear;
  - it spends Links on the Primary, then Basic, Ultimate and Defensive, before its forge upgrades;
  - `bindBest` pays for its edit;
  - `playFloor` no longer equips mid-floor.

## Balance and gates
- **Pacing will drop.** New heroes start with 1-move ability chains, the autopilot no longer gears up mid-dive, and Mana Dust (only from off-pair salvage) now also pays for edits.
  - Capture `runAutopilot` numbers before any change.
  - Every rail in `tests/delve-pacing.test.ts` must hold. If one breaks, stop and report the numbers. The fix is the user's call: slot costs, drop slots, starting slots, dust prices, or a changed rail.
- **The DPS Lab grid** must come out identical.

## Testing
- **Engine:**
  - base slots per weapon;
  - drop slots by rarity (uncommon included), and determinism: every other item stat unchanged against v0.48.0;
  - fusing's Link refund;
  - salvage and a full-bag melt giving Links;
  - `addSlot` (position pricing, the basic chain, refusals);
  - `movesetEditPrice`'s rules, one test per rule, with the first-dive freebie;
  - `setChain` results and refusals (off-pair rules);
  - off-pair moves kept, with no attunement;
  - transfer (extra counts carried, overflow and the target's extras as Links, basic slots across bases, dropped moves, the price);
  - weapons valued as-is and as a home;
  - the dive lock on every op, with `chooseStartingMana` allowed;
  - `chooseStartingMana` rebuilding the weapon;
  - realign mapping only the equipped weapon;
  - bind, overtake and re-attune leaving moves alone;
  - migration v5 → v6, including the unarmed reset;
  - `heroChains` unarmed.
- **Client:**
  - slots ("2/5") with the Add slot price;
  - the builder's draft, price, Apply and Revert (Anvil only);
  - off-pair marks;
  - the weapon sheet's moveset, with both valuations and Transfer;
  - Links shown in the header, the dive summary and the salvage toast;
  - every gear control hidden mid-dive, with the Anvil note;
  - the bind texts.
- **Existing tests** that read `profile.chains`, `chainCaps` or `followBasic`, or equip mid-dive, change; the plan lists them.
- **E2E:** the Delve specs pass. Any that equip mid-dive move to the Anvil, and `delve-gamepad.spec.ts` reads the weapon's moveset.

## Docs and version
- **CLAUDE.md:** the Delve section gets the weapon moveset, Links, the dive lock, valuing, and the migration.
- **Superseded notes:**
  - the chains spec: `chainCaps`, and chains on the profile;
  - the affinity spec: the fixes on bind and equip, and `followBasic`;
  - the loot spec: equipping mid-fight.
- **Version:** `chore(client): bump version to 0.49.0`.
