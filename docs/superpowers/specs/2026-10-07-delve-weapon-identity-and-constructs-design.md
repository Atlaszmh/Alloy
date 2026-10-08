# Delve: weapon identity and constructs — design

Date: 2026-10-07. Status: approved in brainstorm, awaiting the user's read.
Working sheet: Google Sheet "Alloy: weapon x form matrix", tab **Forms by class** (the Matrix tab is superseded): https://docs.google.com/spreadsheets/d/1NdYiA1v63XWvoCZ8aZgLGF6MXm8F8BPBNlJ6rNGuSgI

## 1. Goal

Two changes ship as one stage, because each needs the other:

1. **Weapon identity for every move.** Today a weapon only changes the basic attack (its `feel` rows) and the beats (`tempo`). After this stage the same Bolt plays differently from a staff and from a bow: every ability is shaped by the weapon that casts it.
2. **Moves become portable constructs.** A move (and a basic blow) becomes an item with an identity that can be unsocketed into a **move bag** and placed on another weapon, in any chain position, with its sockets and runes. Investment in a move survives a weapon swap.

**The lore frame** (the user's, to use in names, Help and Hesta's lines): a move is a *construct* that channels and controls mana in a pattern. Placed in a weapon, the weapon guides how that construct expresses the mana as an ability. So each weapon shapes the constructs put into it, basic blows included.

**Rules that hold throughout:**
- Weapons are **sidegrades**: a player picks a weapon for how it plays, not for power. A Lab gate enforces it (§4.4).
- **The construct is the what, the weapon is the how.** A construct carries its kind, form, elements and sockets; the weapon carries its class, its move slots and its cast style.
- Save-breaking is fine (early development): save version 14, no migration.

**Out of scope (later stages):** signature variants (phases 2–5, §5, catalogued here so the hook fits them), crafting constructs from materials with rolled lines and honing (the next stage), any change to legendary powers, boons or the floor maps.

## 2. Forms and weapon classes

### 2.1 Classes

Each weapon base gains a `class`: **melee** (dagger, sword, axe, maul) or **ranged** (staff, wand, bow). Each form gains a `class`: `melee`, `ranged` or `both`. A weapon can use the forms of its class and the shared ones.

### 2.2 The form list (15 forms)

| Slot | Melee only | Ranged only | Shared |
|---|---|---|---|
| Primary | Strike, **Whirl** (new) | Bolt, Volley | Lance, Burst |
| Defensive | Armor | **Repel** (new) | Ward, Surge, Blink |
| Ultimate | **Onslaught** (new) | Barrage | Nova, Maelstrom |

Each melee-only form has a ranged counterpart: Strike / Bolt, Whirl / Volley, Armor / Repel, Onslaught / Barrage.

**A form is a verb**: what the move does. Shapes (a cleave, a fan of shots, a piercing shot) are runes on a form, not forms of their own.

| Form | What it does (this stage) |
|---|---|
| Strike | As today: a swing in front; the chain's last move slams all around. |
| Whirl (new) | The hero spins for about 1.5 s, hitting everything around, and can keep moving. |
| Bolt | As today: a shot that bursts on the first foe it hits. |
| Volley | As today: homing shots that seek different foes. |
| Lance | Ranged: as today, an instant beam (7.5 units). **Melee (new):** a lunge; the hero drives about 5 units along the line, hitting every foe it passes. No i-frames. |
| Burst | Ranged: as today, a lobbed blast (8 units). **Melee (new):** an eruption; the hero slams and the ground erupts at the aim point, within about 5 units. |
| Armor | As today (35% less damage for 8 s, melee attackers take its element); melee only. |
| Repel (new) | A pulse that knocks nearby foes back and slows them. |
| Ward | As today. |
| Surge (changed) | For 6 s, one multiplier (×1.3) on every timer the hero runs: attack speed, move speed, ability cooldowns, beats and wind-ups, mana regen, charge gain and dodge recharge. Basic hits still apply element stacks. Surge's own cooldown is not sped up. |
| Blink (changed) | A dash toward the aim with brief i-frames and its trail as today, then 0.5 s of invulnerability after landing. |
| Onslaught (new) | The hero darts between foes in the target area, striking several times; untouchable while darting, then 30% less damage taken for 2 s. |
| Barrage | As today; ranged only. |
| Nova | As today. |
| Maelstrom | Ranged: as today, at the target point. **Melee (new):** centred on the hero and moving with it. |

Numbers marked "about" are first values; the plan sets them and the gate (§4.4) tunes them.

### 2.3 Runes

- **Detonate (new rune):** each foe the move hits by contact sets off a small blast around it. Fits Strike, Whirl, Volley, Lance and Onslaught (the forms that hit directly with no blast of their own). A new knob (`detonate`), added to `Knobs`, `NEUTRAL`, `mergeKnobs` and `KnobsSchema`, one handler, and its term in Power; a `load` row like every rune.
- **Widen** stays as it is: a bigger area on forms that have one (Burst, Nova, Maelstrom, Ward, Whirl, Repel, Strike's slam).
- The other runes' `fits.forms` gain the new forms where they make sense (Whirl like Strike, Repel like Ward, Onslaught like Strike); the plan lists each.

### 2.4 Data

- `arpg.json → forms`: each row gains `class`; a shared form with a different melee version gains a `melee` block of overrides (its behaviour id, range, motion). Three new rows: Whirl, Repel, Onslaught.
- `delve.json → bases`: each weapon gains `class` (and `style`, §4).
- `DEFAULT_FORMS` becomes per class: the Primary's default is Strike on a melee weapon and Bolt on a ranged one; the Defensive's Ward and the Ultimate's Nova for both.
- Drops, forging and `defaultMoveset` pick forms within the weapon's class.

## 3. Constructs, the bag and weapon slots

### 3.1 The model

- **A construct** is a `Move` (kind, form, elements, `runes` sockets) or a `Blow` (kind, element, `runes`), each with a `uid`. A construct belongs to one skill: a blow to the Basic, a move to the slot its form belongs to.
- **Uids** are minted from `profile.nextUid` (the counter items already use) when a construct enters the profile: banked with its weapon, forged, or made in the Skills tab. A construct in a world drop's weapon has none until it banks.
- **The weapon is a frame:** its class, its cast style, and for each skill a number of slots, of which it records how many were **bought** (`GearItem.bought`, per skill; §3.2). A chain is the ordered constructs in a weapon's slots, and may hold fewer constructs than slots.
- **Payment** stays a property of the weapon's chain, as today. A chain that gains its first construct takes its skill's default payment (`DEFAULT_FORMS`: mana, mana, charge) and keeps it after it empties.
- **An empty Primary, Defensive or Ultimate chain** plays as an uncarried skill does today: a null entry in `HeroEntity.chains`, its key and pad button do nothing, the HUD hides its slot. The Basic chain is never empty (§3.3).
- **The move bag**, `profile.constructs` (name to settle in the plan), holds every construct not in a slot: unlimited, grouped by skill. A construct is in exactly one place, a weapon's slot or the bag. Nothing duplicates or loses one but the operations below.
- **Sockets belong to the construct.** Each construct can open up to `MAX_SOCKETS` (3) whatever weapon holds it; the weapon-rarity socket cap (`socketCap`) is retired. The socket prices are unchanged.
- **Dormant:** a construct whose form the weapon's class can't use stays in its slot but is skipped when the chain plays, and its runes do nothing. So does a rune whose `fits.weapons` doesn't include the weapon (blows). Dormancy is decided in **one place**, where `heroChains` builds the chains, so the sim, Power (`valuedChain`, `useInterval`), the HUD and the Lab agree. Dormancy arises only through Move all (§3.3); placing is refused instead.
- **Unarmed** keeps its default Basic, never stored; nothing is placed on it.
- **Load checks** (`fitMovesets`, extended): uids unique, each construct in one place, each in a slot of its own skill; a class mismatch is dormancy, not an error.

### 3.2 Weapon slots

The weapon's rarity sets each skill's **starting** slots and its **ceiling**:

| Rarity | Basic | Primary | Defensive | Ultimate |
|---|---|---|---|---|
| Common | string → 3 | 2 → 3 | 0 → 1 | 0 → 0 |
| Uncommon | string → 3 | 2 → 3 | 1 → 2 | 0 → 1 |
| Magic | string → 4 | 3 → 4 | 1 → 2 | 0 → 1 |
| Rare | string → 4 | 3 → 4 | 2 → 3 | 1 → 2 |
| Epic | string → 5 | 4 → 5 | 2 → 4 | 1 → 3 |
| Legendary | string → 5 | 4 → 5 | 3 → 5 | 2 → 5 |

- The Basic starts at the weapon's own string (maul 2, dagger 4, the rest 3); a string longer than the ceiling keeps its length.
- A slot past the start costs Links and scrap by position (`slotPrice`, as today), up to the ceiling. It counts as **bought** (`GearItem.bought`) and arrives holding a plain construct (the next default kind, the class's default form, as `addSlot` adds a move today).
- A skill's **first** slot (0 → 1) is **Open a skill**: Awaken generalised, paid in flux by rarity plus Links and scrap (`delve.movesets.openSkill`, replacing `crafting.awaken`). It counts as bought and arrives holding a plain construct. It replaces Awaken on the Temper bench.
- **Upgrade** moves the weapon to the next rarity's row: every slot it has stays, and a skill below the new row's start gains plain-filled slots up to it (not bought).
- **Free extra slots:** a drop's `extraSlots` (by rarity, as today) and a forge's `weaponExtras.slots` add slots past the start, up to the ceiling, plain-filled and **not** bought.
- The table replaces carries by rarity (`delve.movesets.carries`, `carriedSkills`, `awakened`). First-pass numbers, tuned against the pacing rails.

### 3.3 Operations

All at the Anvil between dives.

**Drafted or committed.** The worn weapon's chain operations (unsocket, place, reorder, new, change, sockets, runes) are **drafted** in the Skills tab and committed by Apply, as edits are today. The draft (`chainDraft`, keyed on the weapon and the pair) now also holds the bag as the draft sees it: a construct placed from the bag leaves the draft's bag, an unsocketed one joins it, and Apply commits both in one all-or-nothing op (`setChains` grown, or its successor). Two operations **commit at once**, as their Loadout counterparts do today: **Move all** (the Loadout's take sheet) and **salvaging a construct** from the bag (with Undo for `UNDO_MS`). Both, and any equip, are refused while the draft has unapplied changes ("Apply or discard your Skills changes first"), as a new dive is today.

**Free:**
- **Unsocket**: a construct goes to the bag and its chain closes up. The Basic chain must keep at least one blow.
- **Place**: a construct goes from the bag into a slot; in a full chain the construct it replaces goes to the bag. Refused for the wrong skill, the wrong class ("A bow can't express Strike") or no slot.
- **Reorder** within a chain.
- **Move all** (replaces Transfer): every construct on the worn weapon goes onto the target, slot for slot; those past the target's slots go to the bag; the target's own constructs go to the bag; constructs the target's class can't use stay in their slots, dormant. Each chain's **payment travels with its constructs**, as `transferMoveset` moves it today; a chain left holding only dormant constructs keeps the payment it came with. The old weapon goes to the bag holding fresh plain constructs in its starting slots, their chains at their skills' default payments (its bought and extra slots stay, empty), so its Basic is never empty. No scrap.

**Paid**, at today's prices:
- A **new construct** in a slot: `editDust`.
- **Changing** a construct's kind or form: `editDust`; its elements: `elementDust` (an element set new to this Apply once, as today).
- **Opening a socket**: Links + scrap by index. **Socketing** a rune from the pouch: free.
- **Pulling a rune**: see the pull rule below.

The per-origin pricing (`ChainOrigins`, the longest-increasing-run rule) is retired: constructs have identity, so a moved construct is just moved.

**Salvage** (nothing is minted: free things give nothing back):
- **A construct**: its runes back to the pouch at the pull price; nothing else. Its open sockets and the Dust spent on it are not refunded (moving a construct is free, so the investment is kept by moving it, not by melting it). Refused when the scrap for its runes isn't there ("Not enough scrap to pull its runes").
- **A weapon**: its constructs go to the bag; one Link per **bought** slot (`GearItem.bought`); its usual materials (`applySalvage`). Free extra slots (§3.2) give nothing, so forging or finding a weapon and melting it mints no Links. `crafting.weaponExtras.sockets` and `salvageLinks`' "past what a forge grants" rule are retired with it.
- **Auto-salvage of plain constructs**: a plain construct (no open socket, no rune) displaced into the bag is deleted. Inside a draft that happens at Apply, not when it's displaced, so Revert still brings it back. A profile toggle, on by default.
- **`salvageCandidates`** no longer protects a weapon for holding runes, since its constructs go to the bag on salvage; it still never marks a good base junk (`compareItem`'s `'home'` value).

**The pull rule switches to `'pay'`.** With constructs giving their runes back on salvage, the shipped `'destroy'` rule would only push players to salvage constructs instead of pulling runes. So `delve.runes.unsocket` ships as `'pay'`: a pulled rune returns to the pouch for `pullScrap` by tier, and a salvaged construct pays the same per rune. The dev chip stays.

**Mid-dive** every operation is locked, as all gear is. The stops' and alcoves' power-ups keep working in the new model: "equip as it is" equips the bag weapon with its own constructs; "add a slot" stays under the ceiling, can't open a skill and arrives plain-filled; "adjust one move" edits a construct in place; "socket a rune" as today. A weapon salvaged mid-dive (auto-salvage, a full bag) sends its constructs, runes and all, into the **floor's haul** with its other yields (`DiveState.haul` gains a constructs list; `completeFloor` moves them to `banked`; `settleDive` puts them in the bag). So they can be lost: a death or an abandon loses the haul's constructs outright and each banked construct at `crafting.deathLoss` (40%), rolled one by one on the `death:<dive seed>` stream and recorded in `dive.lost`; an extract keeps them all. Plain constructs in the haul are dropped at settle when auto-salvage is on.

### 3.4 Elements and the pair

- **Place** never checks the pair: an off-pair construct casts and reacts but draws no attunement, as a drop's off-pair move does today.
- **Edits** keep `setChains`' rule: an element set outside the pair is refused when held more times than before.
- **Realign** maps the elements of the worn weapon's constructs by role (`fixChainsToPair`, as today); constructs in the bag and on bag weapons are untouched.
- **`chooseStartingMana`** (a new save) replaces the starting weapon's constructs with plain ones in the chosen primary.

### 3.5 Drops and forging

- A weapon arrives with **plain constructs** in its starting slots and its free extra slots: the weapon's string for the Basic, the class default form for the rest, in the weapon's element.
- At a chance by rarity a construct has **open sockets** (`rollSockets`, as today), and more rarely a **socketed rune** (new `runeChance` by rarity, its rune by `dropRune`'s tier rules). These are the "better constructs" a drop can bring.
- A forged weapon follows the same rules plus `weaponExtras.slots` (free, §3.2).
- Every new roll draws on its own fork after every existing one, so other stats roll as before.

## 4. Cast styles

### 4.1 Data

Each weapon base gains `style: { name, numbers, motion, trait, look }`.

| Weapon | Style | Numbers (first values) | Motion on cast | Trait | Look |
|---|---|---|---|---|---|
| Dagger | Quick | wind-up −25%, cooldown −10%, power −10%, range −20%, radius −15% | darts a step toward the aim | casts gain 15% crit chance | steel blades |
| Sword | Balanced | baseline | steps in on release | step bonus +0.05 a chain step | crescent slashes |
| Axe | Sweeping | radius and arc +20%, power −10%, wind-up +10% | wades forward | single-target hits cleave a small arc behind the first foe | hatchets, wide arcs |
| Maul | Heavy | wind-up +30%, cooldown +15%, power +25%, radius +15%, projectile speed −20% | plants during the wind-up, hops forward on release | heavy and hold moves stagger | stone, dust, rings |
| Staff | Channeled | radius +15%, durations +20%, projectile speed −10%, wind-up +10% | sways side to side | impacts leave a brief small zone | orbs and rings |
| Wand | Seeking | wind-up −20%, power −15%, projectile speed +30%, range −10% | circles the target | shots home slightly | sparks and trails |
| Bow | Marksman | range +25%, projectile speed +40%, radius −15%, wind-up +10% | steps back on release | shots pierce one foe | arrows and streaks |

### 4.2 How a style applies (abilities only)

Order at cast time: the form's base → the style's numbers → a signature (§5, none this stage) → the construct's runes → elements, fusions and legendaries, as today.

- **Numbers** scale the form's base wind-up, cooldown, power, range, radius, projectile speed and duration in `resolveAbility`, before the runes.
- **The trait** is a knob partial merged first through `mergeKnobs`, like a built-in rune that costs nothing. Existing knobs: the bow's `pierce` 1, the maul's stagger (`applies`), the staff's zone (Linger's knob with its own small numbers and the per-cast cap), the sword's step bonus (the extra the boons already pass). New knobs, each with one handler and a Power term: the dagger's crit chance, the axe's cleave, the wand's homing.
- **Motion** uses the weapon flow's pushes (`HeroEntity.pushes`): a slice a tick on top of the steering. It **adds** to the form's own motion (its `motion`, `stepIn` and recoil, and the melee Lance's lunge), never replaces it: a bow's Bolt steps back on top of Bolt's small recoil, a sword's melee Lance steps in before its lunge.
- **Look** is client-only: one motif per weapon (blade, crescent, hatchet, stone, orb, spark, arrow) drawn on its casts' shots and impacts, as the infusion motifs are. The hit and cast events carry the weapon's base id.

Basic blows keep their `feel` rows; the style doesn't touch them.

### 4.3 The signature hook

A table keyed by weapon and form (`'maul:blink'`) naming a behaviour that `forms.ts` dispatches to. It ships **empty**, with a test fixture that proves a keyed entry replaces the form's behaviour. Phases 2–5 fill it (§5).

### 4.4 The balance gate

A new DPS Lab view, `'style'`: every weapon × form pair the class allows. Each setup is the form's default chain at its skill's default payment, in Fire, with no runes, at depth 10, full mana, on one dummy and on the pack, averaged over eight combat seeds (`RUNE_SEEDS`). A shared form is measured on both classes' weapons, each against its own class.
- Each pair within **0.85–1.2×** the median of that form across its class's weapons.
- Each weapon's mean over its forms within **0.9–1.1×** the mean of all weapons.

A test runs it, skipped unless `STYLE_GATE` is set. When it fails, tune the style numbers, then the trait; never the band. The pacing rails and the pair sweep run after it passes.

**The existing Lab views and gates** (the plain ability setups, the rune view, `runeComboSetups`, the rune balance gate and the two-build rune-cost gate) measure each form on a **reference weapon** from now on: the sword (Balanced, the baseline style) for melee forms, the staff for ranged forms, and **both** for shared forms, so the ranged beam, lob and target-point Maelstrom stay gated alongside the melee lunge, eruption and hero-centred Maelstrom. Their ceilings and bands stay; their measured values are re-recorded.

**Legendaries** keep matching by form id: Pyroclasm (Bolt, Burst, Barrage) triggers on Burst for both classes and on Bolt and Barrage for ranged weapons only; Bedrock (Armor) is melee-only now. Power and forge value follow as they read the build. Rebalancing legendaries by class is out of scope.

## 5. Signatures: the catalogue and its phases

This stage is phase 1 (the foundation). The signatures follow in phases 2–5, each its own spec and plan. All 29 are listed so the hook fits them; the sheet holds the cast-style entry for every other pair.

| Weapon | Signatures |
|---|---|
| Dagger | Blade Burst (Burst: a thrown knife bursts at the aim point into a ring of knives), Death Blossom (Nova: blades spin out in quick hits, much wider than Blade Burst), Flurry (Strike: three quick cuts in place of one sweep), Evasion (Armor: a share of attacks miss; a miss makes the next hit crit) |
| Sword | Dash Strike (Blink: passes foes untouched, one slash arc at the landing point), Ring of Swords (Maelstrom: spectral swords orbit the hero), Duelist (Onslaught: locks onto the strongest foe and strikes it again and again), Riposte (Ward: a short block window answered with a counter-slash) |
| Axe | Rampage (Onslaught: each dart ends in a full spin), Shoulder Charge (Blink: knocks foes aside along the path), Returning Axe (Burst: thrown to the aim point, erupts, flies back hitting on the return), Whirlwind (Maelstrom: a hold, spin and move until let go or out of resource) |
| Maul | Leap (Blink: jumps over foes, slams on landing), Earthquake (Nova: three pulsing shockwave rings that stagger), Fissure (Lance: the ground cracks along the line and erupts a beat later), Tremor Field (Maelstrom: shaking ground that slows and staggers in pulses), Stone Skin (Armor: immune to knockback and stagger, a little slower) |
| Staff | Gathering Storm (Maelstrom: starts small, grows each second), Orb Swarm (Volley: orbs gather, then seek, mostly the closest foe), Gravity Well (Repel: pulls foes into a slowed knot), Orb Barrier (Ward: orbiting orbs each absorb a share and hit what they touch) |
| Wand | Arc Beam (Lance: bends toward foes and chains to one more), Chain Storm (Barrage: each impact arcs to a nearby foe), Static Ring (Repel: leaves a ring of sparks that shocks and slows), Phase (Blink: leaves a decoy that draws foes) |
| Bow | Disengage (Repel: a kick, a backward leap, arrows into the arc), Arrow Ring (Nova: piercing arrows in every direction), Explosive Arrow (Burst: sticks and detonates after a short fuse), Vault (Blink: a leap that fires a volley at the landing point) |

| Phase | Theme | New systems |
|---|---|---|
| 2 | Reuse what exists: Blade Burst, Dash Strike, Rampage, Leap, Gathering Storm, Arc Beam, Disengage | none |
| 3 | Multi-hit shapes: Death Blossom, Ring of Swords, Shoulder Charge, Earthquake, Orb Swarm, Chain Storm, Arrow Ring | orbiting hitters, pulsed rings, gather-then-seek shots, radial shots |
| 4 | Zones, fuses and control: Flurry, Duelist, Returning Axe, Fissure, Tremor Field, Gravity Well, Static Ring, Explosive Arrow | delayed eruptions and fuses, pulls, lasting rings, a return path, a target lock |
| 5 | New rules: Evasion, Riposte, Whirlwind, Stone Skin, Orb Barrier, Phase, Vault | miss chance, a block window, a payment that spends while held, knockback and stagger immunity, split absorption, a decoy target |

## 6. Client

- **Skills tab:** each `ChainLane` shows filled slots, empty slots and the ceiling (Add slot as today). A **bag pane** beside the move pane, filtered to the selected skill: A places a construct into the selected slot, X salvages it (Undo for `UNDO_MS`, as on the Loadout). X on a chain card unsockets. Dormant constructs are greyed with the reason. The form picker offers only the class's forms. The Apply sheet lists the free moves apart from the priced edits.
- **Loadout:** the compare pane shows a weapon as a frame (class, style, slots against the ceiling). `TakeSheet` offers **Equip as it is** or **Move all here**; `compareItem`'s `'home'` value is the weapon after Move all.
- **Forge:** Temper's Awaken becomes **Open a skill**; Upgrade shows the new ceiling; the forge preview shows the starting slots and ceiling.
- **Item header:** the class and style ("Ranged · Marksman: pierces one foe").
- **Arena:** the per-weapon look motif (§4.2); dormant constructs are skipped and the HUD shows the chain as it plays.
- **Training Grounds:** the class rules apply; Load my build loads constructs. The sandbox's own chains are not constructs (no uids, no bag): changing the sandbox weapon to the other class leaves its class-only moves dormant, shown as at the Anvil, and the Abilities tab's form picker offers the new class's forms. `isDefaultBasic` / `followBasic` keep their job for the sandbox's default basic chain, and the sandbox's default Primary follows the class default form the same way (Strike on a melee weapon, Bolt on a ranged one), so a fresh sandbox sword has a live Primary.
- **Help:** a topic in the constructs frame ("A move is a construct that channels your mana; your weapon decides how it's expressed").
- The pad grammar holds: the bag pane is a pad group, A and X as above, and PN01–PN07's audits and press budgets pass.

## 7. Autopilot, tutorial, quests

- **Autopilot:** places its best constructs by Power, uses Move all when it takes a better weapon, salvages what it doesn't use, buys slots up to the ceiling and Opens a skill when it can pay. The Links order (slots, sockets, later slots) carries over. A new save's common sword now starts with two Primary slots, so the autopilot's reason to forge before dive 1 (getting a Primary) is gone; it forges then only when Power rises by `MIN_FORGE_GAIN`, as at every visit.
- **Tutorial:** the whole script is checked against the slot table, not only the Anvil lessons:
  - **Dive 1:** lines that assume the starting sword carries only the Basic (`s1-equip`'s "that blade carries a Primary", `d1-cast`'s "Your new blade carries {primarySkill}") are rewritten: the starting sword already holds two Primary constructs, and the set uncommon blade adds a Defensive.
  - **Set drops:** `slots` and `sockets` are re-expressed against the table (sockets on constructs; `tutorial-floor.ts` stops reading `socketCap`). Grask's rare keeps its role as the lesson's Move all target.
  - **Lesson 1:** the slot, chain-edit and rune steps use the bag. **Lesson 2:** Transfer becomes Move all; "Your rare carries a Defensive skill" and the farewell's Awaken line become the slot table's terms (Open a skill).
  - `tutorialDataProblems`, `tutorialHolds`, the `transfer` trigger (renamed for Move all) and the bot follow. `delve-tutorial-bot.test.ts` passes for every primary. The Jump in E2E ("Basic alone until its first forge") is rewritten for the new start.
- **Quests:** no quest objective reads transfers or Awaken today; only the tutorial's trigger does (above). `openSocket` keeps its meaning.

## 8. Testing

- Engine unit tests for every operation and refusal (§3.3), the slot table and its ceiling, Open a skill, Upgrade keeping slots, dormancy, the pair rules (§3.4), drops and forging (§3.5), the style merge order, each new form and the melee versions, Surge, Blink, Onslaught and Detonate.
- **An invariant test**: thousands of random operations (place, unsocket, reorder, Move all, equip, salvage a construct or a weapon, forge, a drop banking, add a slot, Open a skill, Upgrade). Constructs appear only from a drop, a forge, a new construct, a bought or upgraded slot, or a plain refill, and disappear only through salvage or a dive's death loss (§3.3). Runes are never created and leave only by a pull or a salvage at the pull price. Links are minted only by a weapon's bought slots on salvage, never more than were paid (like the old Links-minting check).
- The signature hook fixture.
- The style gate (§4.4) and the rune gates, re-run.
- At the close: the pacing rails, the robust and pair sweeps, the maps sweep, the tutorial bot, and the full E2E (the tutorial spec rewritten for the bag and Move all; the pad-navigation audits).

## 9. Release

- Save version 14 (`parseDelveProfile` resets anything else, with the reset toast).
- Client version: the next minor (0.76.0 from 0.75.1).
- CLAUDE.md: the Weapon movesets and Runes sections rewritten (constructs, the bag, slots by rarity, the pull rule `'pay'`), and a section for forms by class and cast styles.

## 10. Build waves

The same pattern as runes and crafting, in parallel worktrees:
1. Data and engine model: classes, form rows, constructs with ids, the bag, the slot table, save v14.
2. In parallel: forms and styles (the new forms, the melee versions, Surge, Blink, Onslaught, Detonate, the style merge, the hook, the gate); operations and economy (§3.3, §3.4, salvage, the pull rule, Open a skill).
3. Client (§6).
4. Autopilot, tutorial and balance (§7, the gate, the pacing rails).

## 11. Risks and open points

- **Early weapons get more slots** than today (a common weapon had the Basic alone). The pacing rails decide whether the table needs trimming.
- **Seven melee-version and new-form behaviours** carry most of the sim work; the gate may need several passes.
- **Ranged weapons are three to melee's four**, so ranged forms see less variety. A fourth ranged weapon is a later content question.
- **The bag can grow without bound**; auto-salvage of plain constructs keeps it in check. A sort and filter may be needed if it doesn't.
- **Legendaries become class-leaning** (Pyroclasm's Bolt and Barrage, Bedrock's Armor). Accepted for now; a content pass can rebalance them.
