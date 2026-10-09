# Delve weapon identity and constructs Implementation Plan — Overview

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every ability is shaped by the weapon that casts it (a class, melee or ranged, that decides which forms a weapon can use; a **cast style** that scales a form's numbers, moves the hero and adds a trait and a look; three new forms, Whirl, Repel and Onslaught, and melee versions of Lance, Burst and Maelstrom), and every move and basic blow becomes a **construct**: an item with a uid, its own rune sockets, a place in a weapon's slot or in the profile's **bag**, free to unsocket, place and move between weapons. The weapon owns its **move slots** by rarity (a start and a ceiling), bought with Links, a skill's first slot with flux (**Open a skill**, Awaken generalised). Ships as client v0.76.0, save v14.

**Architecture:** Phase A lays the contract: the model (constructs with uids, the bag field, the slot table replacing carries and Awaken, dormancy decided in `heroChains`, class gating in `setChains`, uid-based pricing replacing origins, the haul's constructs field, save v14), the data (a `class` on every form and weapon base, three new form rows dispatched to placeholder behaviours, inert `style` rows, the Detonate knob and row with no handler, the signature hook, empty) and the style pipeline in `resolveAbility` wired but inert (every factor 1, every trait empty). Phase A **changes play once**, at the slot-table task (a new save's common sword holds two Primary constructs; class gating refuses Strike on a staff), and re-records the fingerprint there. Phase B fills the engine in two parallel areas: B1 the forms, styles, Detonate and the gate; B2 the construct operations and the economy. Phase C builds the client in two areas: C1 the Skills tab and its bag pane; C2 the Loadout, the Forge, the item header, the arena's look, the Training Grounds and Help. Phase D rewrites the autopilot and the tutorial (D1), then measures, tunes, documents and bumps (D2).

**Tech Stack:** TypeScript 5.7, Zod 3, Vitest 3, React 19, Zustand 5, PixiJS 8, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-delve-weapon-identity-and-constructs-design.md` (authoritative). Section numbers below are the spec's. The design sheet (Google Sheets "Alloy: weapon x form matrix", tab Forms by class) holds the weapon × form catalogue; the spec's §5 table is its copy.

## Phases

| Phase | Area | Plan file | Base | Owns (only this area edits these) |
|---|---|---|---|---|
| A | Contract | `01-contract.md` | `main` | `types/ability.ts`, `types/gear.ts`, `types/delve.ts` (the balance, `DelveProfile`, `GearBaseDef`, `HeroWeapon`), `types/arpg.ts` (`FormDef`, the events' `look`), `types/crafting.ts` (`Haul`, `ForgePreview`), `types/rune.ts`, `data/schemas.ts`, `delve/profile-schema.ts`, `arpg.json` (`class` and the three new rows), `delve.json` (`class`, inert `style` rows), `runes.json` (the Detonate row), `balance.json` (`delve.movesets`, `delve.runes`, `delve.crafting`), `loot/moveset.ts`, `delve/moveset.ts`, `delve/runes.ts` (uid pricing), `delve/profile.ts` (uids, `fitMovesets`, the bag field), `delve/crafting.ts` (Open a skill in Awaken's place), `loot/forge.ts` (`forgedMoveset`), `loot/salvage-yield.ts` (bought slots), `arpg/abilities/resolve.ts` (the style pipeline, inert), `arpg/abilities/signatures.ts` (new, empty), `arpg/abilities/forms.ts` (the hook's dispatch and the placeholder cases only), `src/index.ts`, every test it rewrites |
| B | B1 forms, styles, Detonate, the gate | `02-forms-styles.md` | A merged | `arpg/abilities/forms.ts` (the behaviours), `resolve.ts`'s style numbers and traits, `arpg/abilities/impact.ts` (Detonate), `arpg/defend.ts` (Surge, Blink, Onslaught's protection), `arpg/abilities/cast.ts` (Surge's timers), `arpg/dodge.ts` (Surge's dodge recharge), `arpg/action.ts` / `basic.ts` (style motion), `arpg/dps-sim.ts` and `dps-combos`, `arpg.json`'s numbers and `melee` blocks, `delve.json`'s style values, the three new trait knobs, `delve/hero-stats.ts`'s Power terms for Detonate and the traits, `tests/delve-style-gate.test.ts`, the Lab's `'style'` view (`features/delve/lab/`, dev-only, no C area touches it) |
| B | B2 construct operations and economy | `03-constructs-ops.md` | A merged | `delve/constructs.ts` (new: `applyDraft`, `placeConstruct`, `unsocketConstruct`, `moveAll`, `salvageConstruct`, the bag's helpers), `delve/profile.ts`'s salvage paths (`melt`, `salvageItems`, `salvageCandidates`, `addLootToBag`), `loot/salvage-yield.ts`'s construct yields, `delve/dive.ts` (`settleDive`'s constructs and death loss, `bankWorld`), `delve/stops.ts` (the power-ups in the new model), `delve/pair.ts` (`chooseStartingMana`, realign on constructs), `loot/materials.ts` (`addHaul` summing constructs), `tests/delve-constructs-invariant.test.ts` |
| C | C1 the Skills tab | `04-client-skills.md` | A merged | `features/delve/hub/skills/` (`ChainLane` slots and ceiling, the bag pane, `MoveInspector`, `MoveRows`, `FormPicker`'s class gating, `ApplyBar`, `ApplySheet`), `features/delve/chains/useChainEditor.ts`, `hub/skills/useAnvilChains.ts`, `stores/delveStore.ts`'s `chainDraft` (the draft's bag) and `applyDraft` action |
| C | C2 the Loadout, Forge, header, arena, Training, Help | `05-client-loadout.md` | A merged | `hub/loadout/` (`ComparePane`, `TakeSheet`, `EquippedPane`, `BagPane`'s verdicts), `hub/forge/Temper.tsx` (Open a skill), `hub/forge/ForgeBench.tsx`'s preview (slots and ceiling), `items/ItemHeader.tsx`, `items/MovesetView.tsx`, `arena/fx/` (the look motif), `arena/ArenaRenderer.ts` and its `__tests__/arena-renderer.test.ts` and `arena-hud-snapshot.test.ts`, `arena/hud/` (dormant skipped), `training/` (class rules, Load my build), `hub/help/`, `stores/delveStore.ts`'s `moveAll` and `salvageConstruct` actions (routed through C1's store file at merge: see Integrator notes) |
| D | D1 the autopilot and the tutorial | `06-bot-tutorial.md` | A, B1, B2 merged | `delve/autopilot.ts`, `delve/economy.ts`, `tutorial.json`, `delve/tutorial.ts`, `arpg/tutorial-floor.ts`, `data/tutorial-check.ts`, `tests/delve-tutorial-*.test.ts`, `e2e/delve-tutorial.spec.ts` |
| D | D2 balance, E2E, docs, bump | `07-finish.md` | everything merged | the pacing and gate reads and tuning (numbers only: `balance.json`, `delve.json`'s style values, `arpg.json`'s form numbers, `runes.json`'s Detonate tiers), the E2E fixtures' `withUids` helper (every spec that seeds a hand-built moveset, D1's tutorial spec too), `e2e/*.spec.ts`, `CLAUDE.md`, `packages/client/package.json`'s version, un-skipping C's engine-dependent tests |

B1, B2, C1 and C2 run in parallel worktrees off the merged contract. No two areas edit one file; where an area needs another's file it says so under "Needs routed", and the integrator applies it at merge. D1 starts once B1 and B2 are merged (it plays the new forms and ops); D2 last. A runs before everything and B2 after A on `delve/profile.ts` and `loot/salvage-yield.ts` (sequential, never parallel).

**A also touches, mechanically, every file that imports a symbol it retires**, with the smallest edit that compiles and keeps behaviour, and the later owner rewrites: `delve/pair.ts` (`extraSlots`, `weaponParts` at 3 and 187), `delve/stops.ts` (`carriedByText` at 7, 223, 245), `delve/tutorial.ts` (the `transfer` trigger at 56, 243, 314), `arpg/tutorial-floor.ts` (`DEFAULT_FORMS` at 4 and 179, `socketCap` at 5 and 148), `delve/autopilot.ts` (`transferMoveset`, `awaken`, `socketCap`, `carriedSkills` at 46–49, 330, 454, 642, 1028: `awakenWeapon` calls `openSkill` (real at the switch); `transferBest` and the lesson's `'transfer'` op return the profile unchanged, marked `// D1 rewires to moveAll`, so the bot takes no B2 op before D1 and B2 keeps the fingerprint; the cap `MAX_SOCKETS`), `delve/hero-stats.ts` (`movesetTransfer` at 24 and 890 → `moveAllPreview`), `loot/runes.ts` (`socketCap` at 193, its re-exports at 241), `types/tutorial.ts` (`transfer` → `moveAll` in `TUTORIAL_TRIGGERS` and `TutorialOnlyEvent`, plus `openSkill`), `data/tutorial.json` line 511 (`"type": "moveAll"`, so `tutorialDataProblems` passes; D1 rewrites the script), and in the client `features/delve/StopPanel.tsx`, `items/LegendaryBox.tsx`, `stores/sandboxStore.ts`, `hub/loadout/TakeSheet.tsx`, `hub/loadout/ComparePane.tsx`, `hub/forge/Temper.tsx`, `features/delve/chains/useChainEditor.ts` and `stores/delveStore.ts` (origins removed; the transfer action calls `moveAll`, Awaken's calls `openSkill`), so `constructs/main` typechecks and its suites run after A. C1 owns `useChainEditor.ts`, `ChainEditor.tsx` and the store's draft; C2 owns `StopPanel.tsx`, `LegendaryBox.tsx`, `sandboxStore.ts`, `TakeSheet.tsx`, `ComparePane.tsx` and `Temper.tsx` from then on.

## The contract (Phase A lands exactly these; every later phase builds on them as written)

### Types

`packages/engine/src/types/ability.ts`:

```ts
/** A weapon's class (see the constructs spec §2.1): which forms it can express. */
export type WeaponClass = 'melee' | 'ranged';
/** A form's class: one weapon class, or both. */
export type FormClass = WeaponClass | 'both';

export type FormId =
  | 'bolt' | 'volley' | 'lance' | 'burst' | 'strike' | 'whirl'
  | 'ward' | 'armor' | 'surge' | 'blink' | 'repel'
  | 'nova' | 'barrage' | 'maelstrom' | 'onslaught';

/** One move of an ability chain. A construct (spec §3.1) once it has a `uid`. */
export interface Move {
  /** Its construct id, `c<n>` from `profile.nextUid`; absent in a world drop and in the sandbox. */
  uid?: string;
  kind: MoveKind;
  form: FormId;
  elements: ManaType[];
  runes?: (RuneRef | null)[];
}

export interface Blow {
  uid?: string;
  kind: MoveKind;
  element: ManaType;
  runes?: (RuneRef | null)[];
}

/** A move or a blow: what the bag holds and a slot takes. */
export type Construct = Move | Blow;

/** An ability chain: 0 to its slots' moves (an empty chain plays as an uncarried skill) and a payment. */
export interface Chain { moves: Move[]; payment: AbilityPayment }

export interface Knobs {
  // … as today, plus:
  /** Detonate (spec §2.3): each contact hit sets off a blast of this power around the foe (0: none). */
  detonate: number;
  /** A cast style's trait: crit chance added to the move's hits, 0–1 (the dagger's). Not the hero stat `critChance`. */
  critBonus: number;
  /** A cast style's trait: a single-target hit cleaves a small arc behind its first foe (the axe's; 0: none). */
  cleave: number;
  /** A cast style's trait: shots home toward foes, radians a second (the wand's; 0: none). */
  homing: number;
}
```

`NEUTRAL` holds the four at 0; `mergeKnobs` adds `detonate`, `critBonus`, `cleave` and `homing`; `KnobsSchema` takes them. In A nothing reads them (B1 adds each one's handler).

The arena events `cast`, `hit`, `beam`, `slash`, `explode` and `dash` (`types/arpg.ts`'s `ArpgEvent`) gain `look?: StyleLook`, the casting weapon's style look (spec §4.2). A adds the field and sets it on `cast` (one site, `arpg/abilities/cast.ts`, which B1 otherwise owns); B1 sets it on the other five as it builds the behaviours; C2 draws the motif from it.

`packages/engine/src/types/gear.ts`:

```ts
export interface GearItem {
  // … as today, `awakened` removed.
  moveset?: Moveset;
}

/**
 * A weapon's moveset (spec §3.1–3.2): a chain for each skill with slots, each
 * holding 0 to `slots[skill]` constructs (the Basic at least 1); `slots` the
 * slots it has, `bought` how many of each were bought with Links or Open a skill
 * (free extra slots are not), which a salvage refunds.
 */
export interface Moveset {
  chains: Partial<Chains>;
  slots: Partial<Record<ChainSkill, number>>;
  bought: Partial<Record<ChainSkill, number>>;
}
```

The spec's `GearItem.bought` lives on `Moveset`, beside the slots it counts.

`packages/engine/src/types/arpg.ts`:

```ts
export interface FormDef {
  // … as today, plus:
  class: FormClass;
  /** A shared form's melee version (spec §2.2): what differs when a melee weapon casts it. B1 fills the rows. */
  melee?: { range?: number; radius?: number; motion?: number; speed?: number; text?: string };
}

/** A cast style's numbers: factors on the form's base (1 = unchanged). */
export interface StyleNumbers {
  windup: number; cooldown: number; power: number; range: number; radius: number; speed: number; duration: number;
}
export type StyleMotion = 'none' | 'dart' | 'step' | 'wade' | 'plant' | 'sway' | 'orbit' | 'back';
export type StyleLook = 'blade' | 'crescent' | 'hatchet' | 'stone' | 'orb' | 'spark' | 'arrow';

/** A weapon's cast style (spec §4): how it expresses every ability form. */
export interface CastStyle {
  name: string;
  numbers: StyleNumbers;
  motion: StyleMotion;
  /** Merged first, like a built-in rune that costs nothing. */
  trait: KnobsData;
  look: StyleLook;
}

```

`packages/engine/src/types/delve.ts` (`GearBaseDef` and `HeroWeapon` live here):

```ts
export interface GearBaseDef {
  // … as today, plus (weapons only; the schema requires both on a weapon base):
  class?: WeaponClass;
  style?: CastStyle;
}

export interface HeroWeapon {
  // … as today, plus:
  class: WeaponClass | null;
  style: CastStyle | null;
}

export interface DelveProfile {
  version: 14;
  // … as today, plus:
  /** The move bag (spec §3.1): every construct not in a weapon's slot, each with a uid. */
  constructs: Construct[];
  /** A plain construct (no socket, no rune) displaced into the bag is deleted (spec §3.3). */
  autoSalvagePlain: boolean;
}

// balance (DelveBalance.movesets replaces carries, transferScrap; DelveBalance.runes loses socketCap
// and gains runeChance; DelveBalance.crafting loses awaken and weaponExtras.sockets)
runes: {
  // … as today without socketCap, plus:
  /** Chance a weapon drop's open socket holds a rune (spec §3.5), by rarity. */
  runeChance: Record<Rarity, number>;   // ships 0, 0, 0.05, 0.1, 0.2, 0.35
};
movesets: {
  /** Each rarity's slots by skill: `[start, ceiling]` (the Basic's start is the weapon's string; spec §3.2). */
  slots: Record<Rarity, Record<ChainSkill, [number, number]>>;
  /** Extra slots a weapon drop rolls, least and most, by rarity (free: not bought). */
  extraSlots: Record<Rarity, [number, number]>;
  slotLinks: number[];
  slotScrap: number[];
  /** Open a skill (a skill's first slot), by the weapon's rarity: flux by grade, Links and scrap (× `scrapLevelFactor`). */
  openSkill: Record<Rarity, { flux: Partial<Record<FluxGrade, number>>; links: number; scrap: number }>;
  editDust: number;
  elementDust: number;
  /** Mana Dust salvaging a construct gives (spec §3.3 gives none: 0 as shipped; the key exists for tuning). */
  salvageDust: number;
};
```

`balance.json → delve.movesets.slots` ships the spec's table (§3.2), the Basic's `[0, ceiling]` where 0 means "the weapon's string":

| Rarity | basic | primary | defensive | ultimate |
|---|---|---|---|---|
| common | [0, 3] | [2, 3] | [0, 1] | [0, 0] |
| uncommon | [0, 3] | [2, 3] | [1, 2] | [0, 1] |
| magic | [0, 4] | [3, 4] | [1, 2] | [0, 1] |
| rare | [0, 4] | [3, 4] | [2, 3] | [1, 2] |
| epic | [0, 5] | [4, 5] | [2, 4] | [1, 3] |
| legendary | [0, 5] | [4, 5] | [3, 5] | [2, 5] |

`openSkill` ships (first pass): common `{ flux: { uncommon: 2 }, links: 1, scrap: 40 }`, uncommon `{ flux: { uncommon: 2 }, links: 1, scrap: 60 }`, magic `{ flux: { magic: 1 }, links: 2, scrap: 80 }`, rare `{ flux: { rare: 1 }, links: 2, scrap: 120 }` (Awaken's old price was 1 epic flux, 2 Links, 120 scrap), epic `{ flux: { epic: 1 }, links: 3, scrap: 160 }`, legendary `{ flux: { epic: 1 }, links: 3, scrap: 200 }`. `delve.runes.unsocket` ships `'pay'` (spec §3.3). `MovesetsBalanceSchema` checks each skill's ceiling ≥ its start, ceilings never fall with rarity, and the legendary's ceilings all 5.

`packages/engine/src/types/rune.ts`: `ChainOrigins` is deleted (nothing prices by origin). `RuneTarget` is unchanged.

`packages/engine/src/types/crafting.ts` (`Haul` lives here): `Haul` gains `constructs: Construct[]` (constructs a weapon salvaged mid-dive gave, spec §3.3; lost with the haul); `AwakenPrice` and `CraftingBalance.awaken` deleted; `weaponExtras` is `Record<Rarity, { slots: number }>`; `ForgePreview.weapon` becomes `{ class: WeaponClass; slots: Record<ChainSkill, [slots: number, ceiling: number]>; sockets: number }` (a skill at 0 slots listed with its ceiling, so the bench can show "Defensive 0 / 1"), read by `loot/forge.ts`'s preview and C2's `ForgeBench`.

### Data

- `arpg.json → forms`: every row gains `class` (`strike`, `armor`: `melee`; `bolt`, `volley`, `barrage`: `ranged`; `lance`, `burst`, `ward`, `surge`, `blink`, `nova`, `maelstrom`: `both`); three new rows, `whirl` (primary, melee, `defaultChain` `["medium", "medium", "heavy"]`, power 1.1, radius 2.4, duration 1.5, tick 0.5), `repel` (defensive, ranged, `defaultChain` `["medium"]`, power 0.6, effect 0.5, radius 3) and `onslaught` (ultimate, melee, `defaultChain` `["medium"]`, power 1.2, range 6, radius 3, count 5, duration 1.2), each with its spec text; the `forms` schema is `.length(15)`. In A `forms.ts` dispatches `whirl` to Strike's case, `repel` to Ward's and `onslaught` to Nova's, marked `// B1 replaces`: no saved chain holds them, so play is unchanged.
- `delve.json → bases`: each weapon gains `class` (dagger, sword, axe, maul `melee`; staff, wand, bow `ranged`) and a `style` whose `name` is the spec's (Quick, Balanced, Sweeping, Heavy, Channeled, Seeking, Marksman), every number `1`, `motion` `'none'`, `trait` `{}` and its `look`. B1 fills the numbers, motion and traits. The schema requires `class` and `style` on a weapon base and refuses them elsewhere.
- `runes.json`: a `detonate` row (Shape, `fits.forms` `["strike", "whirl", "volley", "lance", "onslaught"]`, `fits.weapons` `[]`, tiers `detonate` 0.25 / 0.3 / 0.35 / 0.4 / 0.45 with `power` 0.9 at every tier, `load` `[0.3, 0.35, 0.4, 0.45, 0.5]`, effect "Each foe hit sets off a blast of {detonate:%} power around it", tradeoff "{power:±%} power"); the other rows' `fits.forms` gain `whirl` where they list `strike`, `repel` where they list `ward`, `onslaught` where they list `nova` (Widen gains `whirl` and `repel`).
- `DEFAULT_FORMS` becomes `defaultForm(registry, slot, cls: WeaponClass | null): { form, payment }`: the Primary's Strike on a melee weapon, Bolt otherwise; Ward and Nova as today.

### The model's functions (`loot/moveset.ts`, rewritten)

```ts
export function weaponClass(registry, baseId: string | null): WeaponClass | null;   // unarmed: null
export function formAllowed(registry, baseId: string | null, form: FormId): boolean; // both, or the weapon's class; unarmed: false for every form
export function slotRange(registry, owner: MovesetOwner, skill: ChainSkill): [start: number, ceiling: number]; // the Basic's start is the string's length; unarmed: basic [string, string], the rest [0, 0]
export function ceilingOf(registry, owner, skill): number;
export function plainConstruct(registry, owner, skill, index: number, element: ManaType): Construct; // no uid
export function defaultMoveset(registry, owner, element, slots?): Moveset; // each skill at its start (or `slots`), plain-filled, `bought` all 0
export function fillSlots(registry, owner, moveset, element): Moveset;   // empty slots below the skill's start plain-filled (Upgrade, Move all's old weapon)
export function rollMoveset(registry, item, rng): Moveset;              // extra slots as today, within the ceiling, not bought
export function rollSockets(registry, item, moveset, rng): Moveset;     // as today, the cap MAX_SOCKETS
export function rollSocketedRunes(registry, item, moveset, rng): Moveset; // NEW: `runes.runeChance[rarity]`, one socketed rune on a random open socket, by `dropRune`'s tier rules; its own fork, drawn after `rollSockets`
export function constructSkill(registry, c: Construct): ChainSkill;     // a blow: basic; a move: its form's slot
export function isPlain(c: Construct): boolean;                          // no open socket, no rune
export function dormantUids(registry, weapon: GearItem): Set<string>;   // constructs the weapon's class can't express, and blows whose runes don't fit (a blow stays, its runes dormant: not in this set)
export function heroChains(registry, equipped, pair): Partial<Chains>;   // the worn weapon's chains with dormant constructs filtered out and an emptied ability chain dropped; unarmed as today
export function weaponParts(registry, weapon): { links: number; runes: RuneRef[]; constructs: Construct[] }; // links = Σ bought
export function moveAllPreview(registry, worn: GearItem, target: GearItem): { moveset: Moveset; toBag: Construct[]; dormant: string[]; old: Moveset };
// Pure (spec §3.3 Move all): the target's moveset once the worn weapon's constructs sit in its slots
// slot for slot (each chain's payment with them), `toBag` the constructs past its slots and the
// target's own on the chains replaced (a target skill the worn weapon moves nothing into keeps the
// target's own constructs, as Transfer does today), `dormant` the uids its class can't express, `old` the worn weapon's moveset refilled
// plain (`fillSlots`, its constructs without uids). Pure: `compareItem`'s 'home' value, the
// Loadout's verdicts and the autopilot read it and never mint; only B2's `moveAll` mints the
// refill's uids and bumps `nextUid`.
```

Every uid diff (`movesetEditPrice`, `runeChange`, `draftRefusal`, `applyDraft`) takes `movesetOf(weapon).chains` as its saved side, never `heroChains` (which drops dormant constructs: a dormant one would price as removed plus new).

`carriedSkills`, `carriedFrom`, `carriedByText`, `baseSlots`, `extraSlots`, `movesetTransfer`, `MovesetTransfer` and `UNARMED.awakened` are deleted. `movesetOf` stays. A weapon's `slots[skill]` absent or 0 means the skill has no chain; `chains[skill]` exists exactly when `slots[skill] > 0`.

### Operations (`delve/moveset.ts`, `delve/runes.ts`, `delve/crafting.ts`; B2 adds `delve/constructs.ts`)

```ts
// delve/moveset.ts
export function movesetEditPrice(registry, saved: Partial<Chains>, next: Partial<Chains>): number;
// By uid (spec §3.3): a construct in `next` whose uid `saved` lacks is new (editDust); a saved uid
// `next` lacks is removed (editDust); a kept uid whose kind or form changed pays editDust, whose
// elements changed elementDust (a set new to this Apply once); a changed payment editDust.
// Position changes are free. A construct without a uid in `next` is new.
export function setChains(registry, profile, chains: Partial<Chains>, opts?: SetChainsOptions): ProfileActionResult;
// As today, by uid: refuses mid-dive, unarmed, a chain past its slots, an empty Basic, an unknown
// kind, a form of another slot, a form the weapon's class can't express on a new or changed
// construct ("A bow can't express Strike"; a kept dormant construct may stay), bad elements, an
// off-pair set held more times than before, the runes' refusals (`runeChange`, by uid), and unpaid.
// Mints a uid for each new construct from `profile.nextUid`. Emits `openSocket` and `setChains` as today.
export function addSlot(registry, profile, skill): ProfileActionResult;  // up to the ceiling; counts as bought; the new slot plain-filled
export function slotPrice(registry, weapon, skill): { links; scrap } | null; // null at the ceiling or at 0 slots (Open a skill's)
// delve/crafting.ts
export function openSkillPrice(registry, item): { flux: Partial<Record<FluxGrade, number>>; links: number; scrap: number };
export function openSkill(registry, profile, uid: string, skill: AbilitySlot): ProfileActionResult;
// A worn or bag weapon's skill at 0 slots whose ceiling is ≥ 1: slot 1, bought, plain-filled, for
// `openSkillPrice`. Refused mid-dive, on anything but a weapon, with slots already, at a 0 ceiling,
// unpaid. Emits the tutorial's `openSkill` event.
// delve/profile.ts
export function upgradeGear(registry, profile, uid): ...; // as today, plus `fillSlots` to the new rarity's starts (not bought)
// delve/runes.ts
export interface SetChainsOptions { unsocket?: UnsocketMode }  // origins gone
export function runeChange(registry, profile, chains, opts?): RuneChange | { refused }; // by uid: a kept uid's sockets against its saved sockets; a new uid opens all of its; a removed uid refunds its sockets and pulls its runes
export function openSocket(registry, profile, skill, index): ProfileActionResult; // the cap MAX_SOCKETS
```

B2's `delve/constructs.ts` (the contract names the signatures; B2 implements them, with A leaving nothing in their place):

```ts
export interface ConstructDraft { chains: Partial<Chains>; bag: Construct[] }
export function applyDraft(registry, profile, draft: ConstructDraft, opts?: SetChainsOptions): ProfileActionResult;
// `setChains` grown: the chains and the bag together, all or nothing. Every uid in the saved chains and
// bag must be in the draft's chains or bag (a plain one may be gone: deleted at Apply, spec §3.3);
// a uid in both is refused; a bag construct placed into a chain is free, an unsocketed one free, a
// reorder free; `movesetEditPrice` prices the rest. Refuses a placed construct of the wrong skill or
// class. The profile's `constructs` becomes the draft's bag.
export function placeConstruct(registry, profile, uid, skill, index): ProfileActionResult;   // one-op applyDraft
export function unsocketConstruct(registry, profile, skill, index): ProfileActionResult;     // one-op applyDraft
export function moveAll(registry, profile, uid): ProfileActionResult;        // spec §3.3 Move all; commits at once; emits the tutorial's `moveAll` event
export function salvageConstruct(registry, profile, uid, opts?): ProfileActionResult & { runes?: RuneRef[] }; // a bag construct: its runes to the pouch at the pull price, `salvageDust` Dust
export function draftRefusal(registry, profile, draft): string | null;       // the dry run the client's Apply reads
```

### Dormancy, the sim and Power

`heroChains` is the one place (spec §3.1): `dive.ts`'s `beginFloor`, `hero-stats.ts`'s `estimateLoadout`, `pair.ts` and `stops.ts` keep calling it, so the sim, Power, `compareItem` and the HUD agree. The Anvil's views read `movesetOf` (every construct) and `dormantUids` to grey the dormant ones.

### The style pipeline (`resolveAbility`, A wires, B1 fills)

```ts
// in resolveAbility, after `form` and before the knobs:
const style = stats.weapon.style;
const base = applyStyle(form, stats.weapon.class, style);       // the form's numbers × style.numbers; a melee weapon takes form.melee's overrides first
const own = [style?.trait ?? {}, ...move.elements.map(...), fusion, ...legendary, ...stats.boonKnobs];
```

`applyStyle(form, cls, style): FormDef` is exported from `resolve.ts`; with every factor 1 and no `melee` block it returns the form unchanged, which a test pins. `ResolvedAbility` gains `look: StyleLook | null` and `motion` keeps its meaning (B1 adds the style's push beside it). `computeHeroStats` sets `HeroWeapon.class` and `style` from the base.

### The signature hook (`arpg/abilities/signatures.ts`, new)

```ts
import type { SimCtx } from '../combat.js';   // already exported there
import type { FormResult } from './forms.js';  // already exported
export type SignatureKey = `${string}:${FormId}`;
export type SignatureBehaviour = (ctx: SimCtx, ab: ResolvedAbility, aim: Vec | null) => FormResult;
export const SIGNATURES: Partial<Record<SignatureKey, SignatureBehaviour>> = {};
export function signatureFor(baseId: string | null, form: FormId): SignatureBehaviour | undefined;
/** Test only: run `fn` with `key` bound to `behaviour`, restored after. */
export function withSignature<T>(key: SignatureKey, behaviour: SignatureBehaviour, fn: () => T): T;
```

`forms.ts`'s `executeForm(ctx, ab, aim)` asks `signatureFor(ctx.hero.weapon.baseId, ab.form.id)` before its `switch (ab.form.id)` and returns the signature's `FormResult` when one is set. A test fixture proves a bound entry replaces the form's behaviour and the table is empty in production.

### Save and load

- `profile-schema.ts`: `version: z.literal(14)`; `MoveSchema` and `BlowSchema` require `uid` (`z.string().min(1)`) in the save (the sandbox's own schema stays without); `ChainSchema.moves` `.min(0)`; `MovesetSchema` takes `bought` and allows a 0-move ability chain; `HaulSchema.constructs`; `constructs` and `autoSalvagePlain` on the profile; `awakened` gone.
- `fitMovesets` (`profile.ts`): every construct has a uid, uids unique across the worn weapon, the bag weapons, the bag and an open dive's `haul` and `banked` constructs (a settled dive's are skipped: `settleDive` has put them in the bag and leaves them on `banked` for the summary until `closeDive`), each in a slot of its own skill, no chain past its slots, no empty Basic, `bought` ≤ slots; a weapon without a moveset gets `defaultMoveset` with uids minted; sockets past `MAX_SOCKETS` trimmed as today. A class mismatch is dormancy, not an error. Anything else returns `{ reset: true }`.
- Uids: `mintUid(profile): [uid, profile]` gives `c${nextConstructUid}` and moves that counter (`profile.nextConstructUid`, separate from the items' `nextUid`, which `bankWorld` resets; see A's deviations); `addLootToBag`, `forge`, `setChains`' new constructs, `addSlot`, `openSkill`, `upgradeGear`'s fills and `chooseStartingMana` mint. A world drop's constructs have none.

### Selectors and events

- Skills: the bag pane `data-testid="construct-bag"`, each row `data-construct={uid}`; a chain card `data-construct={uid}` and `data-dormant` when dormant; the ceiling `data-testid="chain-ceiling"`.
- Loadout: the take sheet's `data-testid="take-move-all"`; the compare pane's frame line `data-testid="weapon-frame"`.
- Forge: Temper's row `data-testid="temper-open-skill"`.
- Tutorial events: `transfer` renamed `moveAll`; `openSkill` (replacing nothing: Awaken had no step).
- Quest events: unchanged (`openSocket` keeps its meaning).

### `src/index.ts`

Exports every type and function named above (`WeaponClass`, `FormClass`, `Construct`, `CastStyle`, `StyleNumbers`, `StyleMotion`, `StyleLook`, `weaponClass`, `formAllowed`, `slotRange`, `ceilingOf`, `plainConstruct`, `fillSlots`, `rollSocketedRunes`, `constructSkill`, `isPlain`, `dormantUids`, `applyStyle`, `signatureFor`, `withSignature`, `openSkill`, `openSkillPrice`, `mintUid`) and, from B2's `delve/constructs.ts`, `export * from './delve/constructs.js'` (A adds the file with its types and `draftRefusal` only, every op refusing "Not yet", so C builds against the real signatures; B2 fills them).

## Shared conventions

- **Base:** `main` at `2f3871b2` (v0.75.1, the spec). The stage's integration branch is `constructs/main`; each area's worktree is `C:/Projects/alloy-constructs-<area>` on `constructs/<area>`, made with the junction script (it links `node_modules`): `C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/1d6bb288-c64f-43d2-9587-234f3b95983f/scratchpad/mkwt.ps1 -Name alloy-constructs-<area> -Branch constructs/<area> -Base constructs/main` (the script is never committed). Remove a worktree only with `rmdir /s /q` from cmd then `git worktree prune` (never `git worktree remove --force`: it follows the junctions). **Never `git stash` in a worktree** (the stash is shared and crosses).
- One commit a task, ending with the attribution trailer. Never push or merge an area branch yourself.
- Keep line endings (the repo is CRLF in places). Prettier only with `--end-of-line auto`. Never reformat `balance.json`, `dive.ts`, `autopilot.ts`, `hero-stats.ts`, the `delve-pacing*.test.ts` files, `delve-autopilot-crafting.test.ts`, `CLAUDE.md` or the specs.
- Engine tasks run the engine typecheck and the files they touch: `cd packages/engine && npx tsc --noEmit -p . && npx vitest run <files> --reporter=dot`. The whole engine suite (about 13 minutes) runs at each area's last task. **Measured on `main` at `2f3871b2` before any change:** engine 1831 passed, 1 failed, 11 skipped of 1843 tests in 147 files (the one failure is pre-existing: A's Base section names it); client 1413 passed in 152 files (44 s). Rebuild the bundle before any client check: `cd packages/engine && npx tsup`.
- Client tasks: `cd packages/client && npx tsc --noEmit -p . && npx vitest run <files> --reporter=dot`.
- **The fingerprint:** a whole-autopilot hash, as in `docs/superpowers/plans/2026-10-04-delve-room-objects/01-contract.md` "The fingerprint, before", saved under the session's scratchpad and never committed. A keeps it identical through its type, schema, data, style-pipeline and uid tasks: until **the switch task**, the old functions and keys stay alive (`carries`, `awaken`, `transferMoveset`, `socketCap`, `weaponExtras.sockets`, `unsocket: 'destroy'`, `extraSlots`' Links) beside the new ones. The switch task lands every play-changing retirement at once (the slot table, Open a skill, `moveAll` in the bot, `MAX_SOCKETS`, the pull rule `'pay'`, bought-slot Links), **re-records the fingerprint**, and the tasks after it keep the new one identical. B1's tasks re-record it as each behaviour lands (every one changes play); B2's must keep it (the bot takes no new op until D1). D2 re-measures pacing.
- No save migrations: v13 resets.
- Pacing and E2E run in D only (`feedback_test_scope_tokens`).

## Integrator notes

(Filled as each area's plan is drafted and executed.)

- **A (contract): drafted and checked on a scratch copy** of `2f3871b2` (`C:/Projects/alloy-constructs-draft-a`, branch `constructs/draft-a`, commits 31ea85d6 → 7b8d2c5b; 6 tasks, 21 chunks). Engine before 1831 / 1 / 11; after the switch 1828 passed with **40 `delve-tutorial-bot` failures** (the lesson's Move all is B2's op; D1 fixes them: `constructs/main` carries them between A and D1) and the base's one pacing-robust failure; client 1413 before and after; fingerprint identical after T1–T3, re-recorded at T4 (the switch), identical after T5. **Deviations every later area must read:** (1) construct uids mint from a separate **`profile.nextConstructUid`** (`c<n>`), not `nextUid` (items' counter, reset by `bankWorld`); a chosen-primary new save starts it at 10; `withUids`-style helpers (D2) and `mintMoveset` (B2) use it. (2) The Detonate row, the socketed-rune roll and all uid minting land at the switch task. (3) **`upgradeGear` keeps rarity in this codebase** (it raises `upgrade`), so `fillSlots` on Upgrade is a no-op until something raises rarity, and **C2's Task 6 "Ceilings become …" row is dropped** (spec §3.2's Upgrade line was wrong; the spec is corrected to "an op that raises rarity fills the new starts"). (4) Free extra slots never open a skill at a start of 0. (5) `addSlot` keeps today's filling rule, counts bought, mints. (6) **The bot wears its best bag weapon as it is** (`transferBest` → `equipItem`, `// D1 rewires to moveAll`): a no-op left forged weapons in the bag and failed the rails; B2's fingerprint rule still holds (an old op). (7) `heroChains` drops an ability chain left only dormant. (8) `chainRefusal`: at least 0 moves for abilities, 1 for the Basic; 0 slots refuses with `OPEN_SKILL_TEXT`. (9) `MovesetOwner` nulls mean `UNARMED`. (10) Temper names the first closed skill ("Open Defensive"). (11) `Knobs.stepBonus` and `CastStyle.text` land in Task 4's commit (the switch), not Task 1's. Routed: D2 — E2E D02's seed is 8, `withUids` in every E2E seed; B1 — `TARGETS` reaches, the Lab's rune view has 197 rows; C1/C2 — rewrite T6's minimal client edits.
- **D2 (finish):** drafted (13 tasks). Save v14 requires a uid on every construct, so every E2E that seeds a hand-built moveset (`armed`, the gamepad `setup`, pad-nav's `bagOf`, the runes spec's `heroWith`, D1's TU04) resets at load without `withUids` (Task 6, routed through `seedProfile`); D1's tutorial spec uses it too. The pacing tests' `opened: true` pin (the pre-dive-1 forge) changes only if a rail fails for that reason alone and D1 didn't already. Style numbers are tuned in `delve.json` / `arpg.json`, not `balance.json`.
- **C2 (Loadout, Forge, arena, Training, Help):** drafted (17 tasks). Shared formatter `items/weapon-frame.ts` ("Melee · Balanced", "Primary 2 / 3", "Ultimate —"). The store's `moveAll` / `salvageConstruct` (Undo via a lifted `offerUndo`) / `openSkill` and `draftPending` live in a block of their own in `delveStore.ts`; **at merge** the integrator joins it with C1's draft edits (`draftPending` reads C1's `draftChanges`). **C1:** add `ChainEditorProps.weaponBaseId` (the sandbox's class gating and dormant marks) and use `salvageConstruct` + `undoSalvage` in the bag pane. **A:** `GLYPH_ART` rows for `whirl`, `repel`, `onslaught` (`kit/glyph-art.ts`); `look` on the five events (B1 sets it on beam/slash/explode/dash; C2 skips a `hit`'s look). **Decided:** the tutorial target id stays `loadout.transfer` (and the step id `l2-transfer`): C2 keeps `data-tutorial="loadout.transfer"` on `take-move-all` and the footer's A prompt; only the event token is `moveAll`. **D2:** E2E selectors `move-all-button`, `take-move-all`, `temper-open-skill`, the `forge-weapon` text; un-skip the four marked tests. - **D1 (bot and tutorial):** drafted (6 tasks). `tutorial.json` against the slot table (the set blade's `slots` dropped); `lessonBuilt` holds lesson 1 on a non-plain or off-primary Primary construct on the worn rare; the bot's `moveAllBest`, `openSkills`, `placeBag`, `fillEmpty`, `salvageBag`; `EconomyDive.constructs { placed, salvaged }`; TU02/TU04 rewritten. **Routed to B2:** `placeConstruct` deletes a displaced plain construct at once (auto-salvage on); `salvageConstruct` refuses (never throws) short of scrap; `moveAll` emits its event after committing; Move all keeps a target skill's own constructs where the worn weapon moves none (the contract's `moveAllPreview` says so now). **Routed to A:** `addLootToBag` mints the banked weapon's uids; `withChains` keeps uids; `slotRange`, `isPlain`, `plainConstruct`, `constructSkill` exported (all in the contract). **Routed to D2:** the pacing kit rail's `opened` pin; `armed` minting uids; "Basic alone" expectations in `delve.spec.ts:337`, `delve-gamepad.spec.ts:47`, `delve-training.spec.ts:143`; the Lab's economy fixtures gain `constructs`; CLAUDE.md's autopilot, guided-start and economySim sentences. **Routed to C1:** TU01's lesson-1 selectors survive (`add-slot`, `move-0/2`, `move-elements`, `move-editor-back`, `socket-open`, `inspect-socket-0`, `rune-picker`, `rune-pick-*`, `chain-apply`, `apply-sheet-confirm`). Open: `d1-aim` with a melee Strike (the starting sword's Primary is now a Strike, not a Bolt: the aimed-cast step's wording), a ceiling check on set-drop `slots`, Power valuing a one-move Ultimate.
- **B2 (construct operations):** drafted (11 tasks, 5 chunks). `intoBag` is the one door into the bag (plain auto-salvage there); `mintMoveset`; `applyDraft` = a free rearrangement by uid then A's `setChains`; the stop's `move` power-up keeps the construct's uid; `chooseStartingMana` refills every slot plain in the primary (slots and bought kept); the invariant test is 5 seeds × 700 random ops. **Routed to A:** `types/crafting.ts` gains `constructs: Construct[]` on `SalvageYield` and `SalvageResult`. **Routed to D1:** drop `salvageCandidates`' rune guard when the bot learns the bag (kept in B2 to hold the fingerprint) and re-record then; `tutorial.ts`'s `transfer` → `moveAll` hold and skip cases (A renames the token; D1 the rule). **Routed to C2:** a weapon salvage's `runes` / `destroyed` are `[]` now (its constructs carry them), `constructs` on the results for labels and toasts. **Routed to C1:** `applyDraft` / `draftRefusal` take an optional `opts`; bag entries read by uid; `applyDraft` deletes a plain construct the draft leaves out whatever the toggle says, so the Skills tab's Remove must unsocket into the draft's bag (never drop) when `autoSalvagePlain` is off. **Routed to D2:** the unused `unsocket` option on the salvage paths; CLAUDE.md's parts-rule sentence (constructs carry their sockets into the bag).
- **C1 (Skills tab):** drafted (9 tasks, 5 chunks). `useChainEditor` takes the bag (`unsocket`, `place`, `slots` / `ceiling`, `dormantWhy`, `weaponBaseId`); the store's `ChainDraft.bag`, `draftOf`, `draftApply` through `draftRefusal` plus a dry run of `applyDraft` for the price (`priceFromDry`, marked ponytail until B2 gives a bag-aware `draftPrice`); `useAnvilChains` on `slotRange` / `ceilingOf` / `formAllowed` / `MAX_SOCKETS` with `cantExpress` and `absentText` exported (C2's `MovesetView`, compare pane and Training read them); `ConstructBag` pane (`construct-bag`, rows `data-construct`, A places, X salvages through C2's `salvageConstruct` (Task 2 declares a thin member so the branch typechecks; **C2's body wins at merge**)); `move-remove` → `move-unsocket`. **Routed to A:** a `ConstructDraft` whose `chains` leaves a skill out reads it as unchanged; `draftRefusal` is real in A; `sameChain` compares by uid; `MovesetOwner` accepts a `GearItem` or null. **Routed to B2:** a bag-aware `draftPrice(registry, profile, draft)`. **Routed to D1:** TU01's selectors survive but `move-remove` → `move-unsocket`; the two trail-walking tests are skipped for D1 to rewrite. **Routed to D2:** the un-skip list (store, SkillsTab.chains, ApplySheet, ApplyBar's price line); the pad audit's `CEILING.skills` by the audit save's bag rows and "+ Move"; CLAUDE.md's Skills paragraph.
- **B1 (forms, styles, Detonate, the gate):** drafted (12 tasks, 3 chunks). Every task re-records the fingerprint. `look` set on `beam`, `slash`, `explode`, `dash` (never `hit`); each style row gets a `text` (the item header reads it). **Decided:** A adds `Knobs.stepBonus` (the sword's trait) beside `critBonus`, `cleave`, `homing`, and `CastStyle.text: string` on every style row; B1 adds, in its own phase (no parallel area edits them), `HeroEntity.perform?`, `HeroEntity.onslaughtGuard?`, `Zone.follow?` (`types/arpg.ts`), `abilities.defend.onslaughtGuard` in place of `surgeMove`, `feel.styleMove: Record<StyleMotion, number>` (`types/delve.ts`, `data/schemas.ts`, `balance.json`), `HitOpts.critBonus` and its roll and Onslaught's guard in `combat.ts`, `performTick`, follow zones, Surge's regen, pace and `surgeTick`, `homingTick` in `step.ts`, `PLACED` + onslaught in `targeting.ts`, and exports `referenceWeapons` and `surgeMult` from `src/index.ts`. **Routed to C2:** the item header reads `style.text`; any client "+20% move speed" Surge text becomes the one multiplier; one line in `pages/DelveLab.tsx` adds the `'style'` view to its tabs (`View` already admits it). A spinning hero (Whirl) walks at `actionMove`; an Echo's Onslaught is one dart that still moves to the foe's gap, with no invulnerability or guard. **Routed to D1:** start from B1's last fingerprint. **Routed to D2:** CLAUDE.md names (`sweep`, `performTick`, `detonate`, `cleaveBehind`, `homingTick`, `surgeMult` / `surgeTick`, `styleMotion`, `referenceWeapons`, `STYLE_GATE`). Open: the maul staggering on every kind (B1's trait says heavy and hold only: keep that), the Lab grid growing 1.75× (accepted, dev-only), Multi-shot on the melee Lance.
- **B1 Task 12 (the style gate), decided with the user:** style numbers and traits alone couldn't reach the bands (54 checks out on the first read), so three changes land with the gate. (1) **Abilities read each base's damage against the sword's** (`baseDamageScale` in `resolve.ts`: an ability's power × the sword's flat damage ÷ the base's own, folded into `ResolvedAbility.power`, so the hit, `moveNumbers` and Power follow; sword and staff, both 7, are unchanged, so are the reference-weapon gates), and **charge's unit is one sword swing's worth of damage** (`chargeUnit`, read by `addCharge` and Power's estimate), so a fast and a slow weapon at the same damage a second charge alike. §4.1's power directions hold (Quick weaker, Heavy harder). (2) **The gate reads a charge-paid Ultimate per cast** (its damage ÷ its casts), since its cast rate is set by the basics' charge and the charge lockout, which no style scales. (3) **The bow's pierce trait carries a power trade-off** (`trait.power`, as the Pierce rune's tiers do), tuned with the rest. The checks still out of band after one tuning pass are waived by name in the gate (`WAIVED`, each with its reason) and listed in the task's commit. **Routed to C2:** the bow's header text still reads "Shots pierce one foe" (A's data test pins it); the trade-off isn't in it. `arena/hud/__tests__/FoundLog.test.tsx`'s potential-upgrade dagger loses its `upgrade: 1` (B1 made the edit so the merge gate passes: an upgraded one now wins as it is). **Routed to D2:** CLAUDE.md names `baseDamageScale`, `chargeUnit`, the per-cast read and `WAIVED`; re-read the pacing rails and the pair sweep on them. **Known regression, routed to D2:** `delve-pacing.test.ts`'s "legendaries arrive" rail passes before Task 12 and fails after it: 2 of its 4 seeds own a legendary at dive 12 (it asks 3; seed 4 lost its, seeds 1 and 2 keep theirs, seed 3 had none before either). Read over 16 seeds (Fire, 12 dives) the rate is the same either side, 14 of 16 (before: seeds 3 and 11 miss; after: seeds 3 and 4), legendaries owned at dive 12 1.81 → 1.88, but the mean depth at dive 12 falls 43.6 → 40.6 (the depth rails still pass). B1 doesn't tune against two flipped seeds; the rail's thresholds are untouched. The other engine-suite failures after Task 12 predate it: the tutorial bot's 40 (A's, for D1), `delve-chain-feel`'s "a swing that strikes by the press's tick…" and `delve-constructs-a-data`'s "a Repel plays as a Ward…".
- Open from C2: trait text on `CastStyle` for the header (settled: `CastStyle.text`) (none in the contract: the header shows the style's name only until B1 adds `text` to each style row, routed to B1), the equip guard is client-side and weapons only, the sandbox strips uids, the 0-ceiling wording ("Ultimate —").
