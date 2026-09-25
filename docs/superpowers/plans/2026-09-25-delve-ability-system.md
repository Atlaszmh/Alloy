# Delve Ability System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Delve's 3-slot spell bar with four abilities (automatic weapon basic, Primary, Defensive, Ultimate) built from parts (form, one or two of six elements, weight, payment) and shipped with an open workshop.

**Architecture:** A pure resolver compiles an `AbilityBuild` into a `ResolvedAbility` (numbers + knobs) from `arpg.json` data and `balance.json` formulas. Casting, forms and one shared `impact()` path read only resolved values, so every element and fusion works on every form. One mana pool replaces per-element pools. The save moves to version 3 with a migration.

**Tech Stack:** TypeScript, Vitest, Zod (engine); React 19, Zustand, PixiJS 8, Playwright (client).

**Spec:** `docs/superpowers/specs/2026-09-25-delve-ability-system-design.md`

**Conventions:** TDD per task (failing test first). Rebuild the engine (`pnpm -F @alloy/engine build`) before client work. Balance numbers live in `balance.json → delve.abilities`. Run `tests/delve-pacing.test.ts` after any combat or balance change. Commit per task with the repo's trailer.

---

## File map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `engine/src/types/mana.ts` | add `nature` to `ManaType`, `MANA_TYPES`, `emptyManaMap` |
| Create | `engine/src/types/ability.ts` | `AbilitySlot`, `FormId`, `AbilityBuild`, `Knobs`, `ResolvedAbility`, `AbilityCast` |
| Modify | `engine/src/types/arpg.ts` | statuses `poison`/`root`, reactions `combust`/`blight`; hero ability state; `ArpgInput.cast`; events; data defs (forms, traits, fusions) |
| Modify | `engine/src/data/arpg.json` | nature mana, `forms`, `elementTraits`, `fusions`, reactions, masteries; remove `skills` |
| Modify | `engine/src/data/balance.json` | `delve.abilities`, `delve.status` (poison/root), `delve.reactions` (combust), mana pool numbers |
| Modify | `engine/src/data/delve.json` | nature affixes, legendary texts, bow base |
| Modify | `engine/src/data/schemas.ts`, `registry.ts` | schemas for the new data; `getForm`, `fusionFor`; drop skill lookups |
| Create | `engine/src/arpg/abilities/resolve.ts` | `resolveAbility`, `mergeKnobs`, `fusionFor` |
| Create | `engine/src/arpg/abilities/impact.ts` | `impact()`, `hitArea()`, chains, zones, pull, execute, spread, scatter, embers |
| Create | `engine/src/arpg/abilities/forms.ts` | one executor per form |
| Create | `engine/src/arpg/abilities/cast.ts` | `tryCast`, `castTick` (wind-up), charge, combos, `abilityReady` |
| Delete | `engine/src/arpg/skills.ts` | targeting helpers move to `abilities/targeting.ts` |
| Create | `engine/src/arpg/abilities/targeting.ts` | `alive`, `nearestMonster`, `bestCluster`, `spawnProjectile`, `aimPoint` |
| Modify | `engine/src/arpg/combat.ts` | poison, root, Combust, Blight, Plaguebearer; ward/armor in `hurtHero`; charge on damage |
| Modify | `engine/src/arpg/step.ts` | single mana pool, wind-up root, buffs, generic projectiles/zones, homing, melee combo, lull charge |
| Modify | `engine/src/arpg/world.ts`, `delve/dive.ts`, `delve/autopilot.ts` | build hero ability state from `profile.abilities` |
| Modify | `engine/src/arpg/bot.ts` | new casting rules |
| Modify | `engine/src/delve/hero-stats.ts` | `manaPool`, element power; remove skill helpers |
| Modify | `engine/src/delve/profile.ts`, `profile-schema.ts` | v3 `abilities`, `setAbility`, `defaultAbilities`, migration |
| Modify | `engine/src/index.ts` | exports |
| Modify | client `stores/delveStore.ts` | `setAbility` |
| Modify | client `features/delve/arena/useArena.ts`, `ArenaHud.tsx`, `ArenaRenderer.ts`, `pixel/floor-engine.ts`, `pages/DelveRun.tsx` | HUD, aim input, VFX |
| Create | client `features/delve/arena/aim-gestures.ts` | drag/hold-to-aim logic (pure, tested) |
| Create | client `features/delve/AbilitiesPanel.tsx` (+ test) | workshop tab; replaces `SpellbookPanel.tsx` |
| Modify | client `pages/DelveCamp.tsx`, `features/delve/ItemDetailSheet.tsx` | Abilities tab; attunement note |
| Modify | client `e2e/delve.spec.ts` | D04 for abilities |

---

## Chunk 1: Data, types and the resolver

### Task 1: Nature, statuses and data types

- [x] Add `nature` to `ManaType`/`MANA_TYPES`/`emptyManaMap`; `ManaTypeSchema`; `natureAttune`/`naturePower` stat keys, `ATTUNE_STATS`/`POWER_STATS`; `BASIC_STATUS.nature = 'poison'`.
- [x] Add `StatusId` `poison`, `root`; `ReactionId` `combust`, `blight`; `StatusState` fields `poisonStacks`, `poisonDps`, `poisonUntil`, `poisonTickAt`, `rootUntil`; `emptyStatus()`.
- [x] Create `types/ability.ts` with the spec's types. `Knobs`: `{ power, area, applies, chain, pierce, knockback, lifesteal, zone: {seconds, tickPower} | null, pull, execute, scatter, spread }`.
- [x] Data defs in `types/arpg.ts`: `FormDef { id, slot, name, icon, text, power, range?, radius?, speed?, count?, duration?, combo?: number[], tick? }`, `ElementTraitDef { knobs: Partial<Knobs>, defensive: string }`, `FusionDef { elements: [ManaType, ManaType], id, name, icon, text, knobs: Partial<Knobs> }`.
- [x] `arpg.json`: nature mana entry (`#6fcf57`, 🌿); `weakness.nature = 'fire'`; 12 forms, 6 element traits and 15 fusions per the spec; reactions `combust`, `blight`; mastery `Plaguebearer`. Remove `skills`.
- [x] `balance.json → delve.abilities`: `slots` (cost/cooldown/castTime per slot), `weight` coefficients, `castManaMult` 0.5, `castPowerMult` 1.2, `chargeRatio` 0.35, `lullCharge` 1.5, `lullRadius` 6, `chargeLockout` 1, `comboWindow` 1.2, `pool` {base 60, perAttune 3, regen 4, regenPerAttune 0.2}, `basicGain` 4. `status`: `poisonDps` 0.12, `poisonDuration` 4, `poisonMaxStacks` 5, `rootDuration` 1.5. `reactions.combustMult` 1.6.
- [x] Schemas and registry: validate the new data; `getForm(id)`, `getFusion(a, b)` (order-independent), `getElementTrait(m)`; remove `getSkill`/`findSkill`.
- [x] `delve.json`: nature affixes (mirroring the others), legendary texts per the spec.
- [x] Test (`tests/ability-data.test.ts`): every slot has its forms (5/4/3); every pair of the six elements has exactly one fusion; every fusion knob name is a known knob; registry loads.

### Task 2: The resolver

- [x] Test (`tests/ability-resolve.test.ts`):
  - a Balanced mana Bolt of Fire costs 8, cooldown 0.45, has the form's power, `area` ×1.3 (fire trait), applies `burn`;
  - weight +2 multiplies power by 1.56, cost by 1.6, cooldown by 1.5, speed by 0.76;
  - cast payment: cost ×0.5, power ×1.2, `castTime` = slot base × weight factor; mana payment has `castTime` 0;
  - charge payment: cost 0, `chargeNeed` = 60 × 0.35 for a Balanced Ultimate;
  - Fire + Nature gets Wildfire: area 1.3 × 1.4, power ×1.15, applies burn + poison, `scatter` > 0, and a zone;
  - `mergeKnobs` rules (multiply, add, OR, union, longer zone);
  - element power: the average attunement of its elements × `powerPerAttune`, plus the gear's power affixes;
  - Manaweaver reduces cost.
- [x] Implement `resolve.ts` to pass.

## Chunk 2: Combat and casting

### Task 3: Poison, Root, Combust, Blight

- [x] Tests (`tests/ability-status.test.ts`), using a small world helper that builds a floor with one monster:
  - poison stacks to 5 and ticks;
  - Plaguebearer allows 10;
  - root stops movement but not attacks;
  - fire on a poisoned foe → a `combust` reaction, area damage, poison cleared;
  - shadow on a poisoned foe → `blight` spreads stacks to a neighbour.
- [x] Implement in `combat.ts` (`applyStatus`, reactions) and `step.ts` (poison ticks, root in `monstersTick`).

### Task 4: Targeting, impact and forms

- [x] Move targeting helpers to `abilities/targeting.ts`; add `aimPoint(ctx, ability, aim?)` (clamps to range; auto rules per the spec).
- [x] Tests (`tests/ability-forms.test.ts`), one per form, each on a scripted floor:
  - **Bolt** hits the nearest foe, and its combo sizes step 0.8 → 0.8 → 1.0 → 1.5 within the window, then reset;
  - **Volley** darts hit different foes;
  - **Lance** hits every foe on the line;
  - **Burst** at an aim point hits foes there and not at the hero;
  - **Strike**'s fourth step hits all around;
  - **Ward** absorbs damage then bursts;
  - **Armor** reduces damage taken and retaliates;
  - **Surge** speeds attacks;
  - **Blink** moves the hero and makes it untouchable;
  - **Nova** hits around the hero;
  - **Barrage** lands 7 impacts in the area;
  - **Tempest** zone ticks;
  - knobs: chain, pull, execute, spread and scatter each observed once.
- [x] Implement `impact.ts` and `forms.ts`.

### Task 5: Casting: payment, wind-up, charge, combos

- [x] Tests (`tests/ability-cast.test.ts`):
  - mana payment spends and starts the cooldown;
  - no mana → `noMana` event and nothing spent;
  - a cast payment roots the hero for its wind-up, lands after it, and blocks other casts meanwhile;
  - charge fills from damage dealt and in lulls, can't fire until full, and empties on use;
  - the combo step resets after `comboWindow`;
  - a basic hit adds `basicGain` mana.
- [x] Implement `cast.ts`. In `step.ts`:
  - input `{slot, aim}` queued;
  - single mana pool regen;
  - buffs expire;
  - generic projectiles (explode by `area`, pierce, chain on hit, homing for volley);
  - zones by knobs;
  - the melee 3-hit combo;
  - bow `pierce`;
  - lull charge.
- [x] Delete `skills.ts`; fix imports; `pnpm -F @alloy/engine typecheck`.

## Chunk 3: Save, wiring and balance

### Task 6: Profile v3

- [x] Tests (`tests/delve-profile-abilities.test.ts`):
  - a new profile has default abilities (the highest-attunement element);
  - `setAbility` accepts valid builds and rejects wrong-slot forms, 3 elements and duplicate elements;
  - a v2 save (with `skillSlots`) parses into v3 with defaults and keeps its gear and scrap;
  - `reactionsSeen` accepts `combust`.
- [x] Implement the schema (version 3, v2 accepted then migrated), `defaultAbilities`, `setAbility`, and `parseDelveProfile` migration. Remove `autoSlotSkills`/`setSkillSlot`/`SKILL_SLOT_COUNT`.

### Task 7: Wire the floor, dive, autopilot and bot

- [x] `FloorOptions.abilities` replaces `skillSlots`; hero state is built with `resolveAbility` for each slot; `refreshWorldHero` re-resolves on gear change; `manaPool(stats)` sizes the one pool; motes add to it.
- [x] Update `dive.ts`, `autopilot.ts` and the bot rules (spec).
- [x] Update the existing tests (`arpg-sim`, `delve-dive`, `delve-hero-smithing`) that referenced spells or per-element mana.

### Task 8: Balance pass

- [x] Run `tests/delve-pacing.test.ts` and the pacing report; tune `delve.abilities` numbers (not the thresholds) until the guard rails pass with a curve close to v0.32 (first dive about depth 5, dive 12 about depth 24).
- [x] Commit the engine.

## Chunk 4: Client

### Task 9: Store and arena input

- [x] `delveStore.setAbility(slot, build)` (+ `delveStore.test.ts`).
- [x] `aim-gestures.ts`: pure helpers. `classifyPress(durationMs, dragDistPx)` → `'tap' | 'aim'`; `screenToWorld`; `aimMarkerFor(form)` → circle or line. Tested.
- [x] `useArena.ts`: HUD snapshot for 3 abilities (cooldown, charge %, combo step, wind-up %, affordable) and one mana bar; `cast(slot, aim?)`; Q/E/R tap vs hold with mouse aim.

### Task 10: HUD and renderer

- [x] `ArenaHud.tsx`:
  - one mana bar;
  - three ability buttons (icon from the form, element colour ring, cooldown sweep, charge ring, combo pips, wind-up bar);
  - drag-to-aim on buttons.
- [x] `ArenaRenderer.ts`:
  - projectile and zone styles by element and form;
  - Ward, Armor and Surge auras;
  - the wind-up circle and the aim marker.
- [x] `floor-engine.ts`: earth pierce → furrow; zones with fire → lava burst; frost → frost patches.
- [x] `DelveRun.tsx`: floating cast labels from the resolved ability's name.

### Task 11: Abilities workshop

- [x] `AbilitiesPanel.tsx` (+ test): per slot, form chips; element toggles (max 2) showing the fusion; the weight slider; payment radio; the live read-out; a summary line. It replaces the Spells tab in `DelveCamp.tsx`; delete `SpellbookPanel.tsx` and its test.
- [x] `ItemDetailSheet.tsx`: replace "Unlocks/Loses" spell lines with the attunement effect.

### Task 12: E2E, docs, version

- [x] `e2e/delve.spec.ts` D04: open Abilities, set the Primary to Fire + Nature, see "Wildfire"; in the arena three ability buttons exist.
- [x] Run all engine, client and pixel-forge tests plus the Delve E2E on 4 devices.
- [x] Update `CLAUDE.md` (Delve section), the Delve spec's Mana section, and the ability spec's status; bump the client to 0.33.0; commit and push.
