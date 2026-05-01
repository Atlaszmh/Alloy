# Balance Simulation Recommendations Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Address all five recommendations from the 2026-05-01 balance simulation, AND wire every remaining compound (Groups A, B, C, D — all ~21 unwired entries). Final state: all 44 wired compounds firing, balance outliers tuned, every compound proc visible in combat log.

**Strategy:** Aggressively re-express "passive" mechanics as triggers with creative use of conditions + approximations. The trigger pipeline already supports the effects we need; what's missing is two new conditions (`on_dodge`, `on_kill`) and a passive damage modifier hook for the few compounds that genuinely need conditional damage calc. Truly bespoke mechanics (counter state, overheal cap) get their own bespoke chunk.

**Architecture:** Six chunks. Chunks 1-2 are quick wins. Chunk 3 is the comprehensive audit + design. Chunk 4 adds new conditions. Chunk 5 wires everything that fits triggers (the bulk of work). Chunk 6 builds the passive damage modifier system + wires Group C. Chunk 7 (optional) handles Group D bespoke. Each chunk re-runs the sim to validate.

**Tech Stack:** TypeScript 5.7, Vitest 3.x, engine in `packages/engine`, balance script in `packages/tools/scripts/run-balance-simulation.ts`, recipes data in `packages/engine/src/data/recipes.json`.

**Reference docs:**
- `docs/superpowers/plans/2026-04-30-compound-ui-and-stack-mutation.md` — prior plan that established the trigger pipeline + 23 wired compounds
- `packages/engine/src/duel/trigger-system.ts` — buildCompoundTriggers + materializeBlueprint
- `packages/engine/src/duel/duel-engine.ts` — fireTriggers + applyTriggerEffect
- `packages/engine/src/data/recipes.json` — ~21 unwired compounds
- `packages/engine/src/data/synergies.json` — synergy definitions (juggernaut investigation)
- `packages/tools/scripts/run-balance-simulation.ts` — sim script

**Verification rule (per `superpowers:verification-before-completion`):** After every chunk, run engine + client tests AND re-run the balance simulation. Don't claim "fix verified" without fresh sim output showing the expected delta.

---

## Chunk 1: Universal `compound_trigger` Event Emission + Juggernaut Investigation

**Why first:** Quick wins. Two small unrelated tasks bundled to ship fast.

### Task 1.1: Emit compound_trigger from fireTriggers for ALL compound effects

**Files:**
- Modify: `packages/engine/src/duel/duel-engine.ts`
- Test: `packages/engine/tests/compound-runtime.test.ts`

- [ ] **Step 1:** Read `fireTriggers` in duel-engine.ts. Currently the `compound_trigger` event is emitted INSIDE the `compound_dot` case of `applyTriggerEffect`. Move it UP to fireTriggers so it fires once per proc regardless of effect kind.

- [ ] **Step 2:** Export `fireTriggers` from duel-engine.ts (mirror what we did for `applyTriggerEffect`).

- [ ] **Step 3:** Add module-level helpers:

```typescript
function compoundDisplayName(affixId: string): string {
  return affixId
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ') + '!';
}

function isCompoundTrigger(affixId: string): boolean {
  return !affixId.startsWith('chance_');
}
```

- [ ] **Step 4:** In fireTriggers, after `if (effects)` and before the per-effect loop, emit one banner:

```typescript
if (effects) {
  if (isCompoundTrigger(trigger.affixId)) {
    log.addEvent(time, {
      type: 'compound_trigger',
      player: owner.playerId,
      compoundId: trigger.affixId,
      displayName: compoundDisplayName(trigger.affixId),
    });
  }
  for (const effect of effects) {
    applyTriggerEffect(effect, owner, _opponent, log, time, damageContext);
    log.addEvent(time, {
      type: 'trigger_proc',
      player: owner.playerId,
      triggerId: trigger.affixId,
      effectDescription: effect.kind,
    });
  }
}
```

- [ ] **Step 5:** Remove the `compound_trigger` emission from `applyTriggerEffect`'s `compound_dot` case (5 lines). Keep the dot_apply event + activeDOTs.push.

- [ ] **Step 6:** TDD — write 3 failing tests in compound-runtime.test.ts:

```typescript
describe('fireTriggers — compound_trigger emission for non-DOT effects', () => {
  it('emits compound_trigger once per proc for non-compound_dot effects (counter_strike)', () => { /* ... */ });
  it('emits compound_trigger only ONCE for multi-effect compounds (frostbite = DOT + slow)', () => { /* ... */ });
  it('does NOT emit compound_trigger for base trigger affixes (chance_on_hit)', () => { /* ... */ });
});
```

- [ ] **Step 7:** Update the existing `'compound_dot — emits compound_trigger callout AND pushes a DOT'` test. After moving the emission, that test (which calls `applyTriggerEffect` directly) won't see the banner. Either:
  - Reframe it to assert only the DOT push + dot_apply event, OR
  - Update it to call fireTriggers instead of applyTriggerEffect.

- [ ] **Step 8:** Run engine tests — all PASS. Commit:

```bash
git add packages/engine/src/duel/duel-engine.ts packages/engine/tests/compound-runtime.test.ts
git commit -m "feat(engine): emit compound_trigger banner for ALL compound effect kinds"
```

### Task 1.2: Investigate juggernaut synergy (0% win rate)

**Files:**
- Read: `packages/engine/src/data/synergies.json`
- Possibly modify if a real bug

- [ ] **Step 1:** Find juggernaut entry in synergies.json. Note `requiredAffixes`, `bonusEffects.stat` keys. Verify each stat is one the engine actually reads (cross-check against `DerivedStats` in `packages/engine/src/types/derived-stats.ts`).

- [ ] **Step 2:** Create `packages/tools/scripts/debug-synergy.ts` that runs 200 sim matches, filters those where juggernaut activated, prints loadouts + win rate. Run it: `cd packages/tools && npx tsx scripts/debug-synergy.ts`.

- [ ] **Step 3:** Diagnose. Three failure modes:
  - **(a)** Stat key on bonusEffects is deprecated/unread → fix the key
  - **(b)** Bonus magnitude too small to matter → adjust values
  - **(c)** Selection bias (activates for unrelated weak builds) → document, no fix

- [ ] **Step 4:** Apply fix or document finding. If fixing data, update synergies.json. Re-run debug script. Delete the debug script.

- [ ] **Step 5:** Commit (only if data changed):

```bash
git add packages/engine/src/data/synergies.json
git commit -m "fix(engine): juggernaut synergy <bonusEffects | predicate> repair"
```

### Task 1.3: Bump version + re-run sim

- [ ] **Step 1:** Engine rebuild — `cd packages/engine && pnpm build`.
- [ ] **Step 2:** Bump client 0.22.0 → 0.22.1. Commit.
- [ ] **Step 3:** Run sim — `cd packages/tools && npx tsx scripts/run-balance-simulation.ts`. Save output mentally as Baseline-A.

```bash
git add packages/client/package.json
git commit -m "chore(client): bump version to 0.22.1 (universal compound banners + juggernaut fix)"
```

**Chunk 1 done.** Every compound proc visible by name; juggernaut investigated.

---

## Chunk 2: Comprehensive Passive Compound Audit + Trigger Mapping

**Why next:** Foundational. Before wiring 21 compounds we need a single document that lists each one's intended mechanic + proposed trigger blueprint. This becomes the spec for Chunks 3-5.

**Outcome:** `docs/balance/passive-compound-mapping.md` lists every unwired compound with: intended mechanic, proposed trigger blueprint (or explicit "needs new condition X" / "needs passive modifier" / "bespoke"), and approximation notes for ones that lose fidelity.

### Task 2.1: Generate the audit data dump

- [ ] **Step 1:** Run this enumeration:

```bash
cd C:/Projects/Alloy && node -e "
const r = JSON.parse(require('fs').readFileSync('packages/engine/src/data/recipes.json','utf8'));
const c = JSON.parse(require('fs').readFileSync('packages/engine/src/data/combinations.json','utf8'));
const cById = Object.fromEntries(c.map(x => [x.id, x]));
const unwired = r.filter(x => x.type !== 'category' && (!x.compoundEffects || x.compoundEffects.length === 0));
console.log('Total unwired:', unwired.length);
for (const u of unwired) {
  const combo = cById[u.id];
  const params = u.outputBonusEffects.filter(e => e.stat.startsWith('compound.')).map(e => e.stat.split('.').slice(2).join('.') + '=' + e.value).join(', ');
  console.log('--- ' + u.id + ' (' + u.type + ') ---');
  console.log('  components: ' + u.components.map(c => c.kind + ':' + c.id).join(', '));
  if (combo) console.log('  description: ' + combo.description);
  console.log('  params: ' + params);
  console.log('  weaponEffect: ' + JSON.stringify(combo?.weaponEffect));
  console.log('  armorEffect: ' + JSON.stringify(combo?.armorEffect));
  console.log('');
}
"
```

Paste the output into the audit doc as raw appendix.

### Task 2.2: Categorize and design blueprints

**File:** Create `docs/balance/passive-compound-mapping.md`

For each unwired compound, decide its category and proposed wiring:

- **Group A — Already-passive via combinations.json weaponEffect/armorEffect.** No work needed. Document as "passive stats only — already applied via gemEffects."
- **Group B — Trigger-expressible** (existing conditions: on_hit, on_crit, on_block, on_taking_damage, on_low_hp). Write the JSON blueprint inline.
- **Group C — Needs new condition** (on_dodge, on_kill). Note which condition.
- **Group D — Approximation acceptable.** Write a triggers blueprint that captures the SPIRIT of the compound's mechanic, accepting fidelity loss. Mark with **APPROX** flag + rationale.
- **Group E — Truly bespoke.** Counter state, overheal cap, regen multiplier. Defer to Chunk 7. Mark with **BESPOKE** flag.

Suggested classifications (verify against actual recipe data):

| Compound | Category | Proposed wiring |
|---|---|---|
| **fortress** | A | Always-on stats (combo.weaponEffect already provides flat_hp + armor_rating) |
| **meltdown** | A | Always-on +N% all elemental (combo.weaponEffect already provides element bonuses) |
| **vampiric_fury** | B | condition: on_crit, stat_buff_mul lifestealPercent ×3 dur 4 |
| **warriors_edge** | B | condition: on_crit, stat_buff_mul attackSpeed ×0.92 dur 6 |
| **iron_maiden** | B | condition: on_block, bonus_damage_scaled physical multiplier 2.0 (block reflect) |
| **thermal_shock** | B/D | condition: on_hit, chance: 0.10, stun 0.5s (APPROX — full mechanic needs cold+fire detection) |
| **storm_of_flames** | D | condition: on_hit, chance: 0.25, compound_dot fire (Ignite-lite — APPROX) |
| **void_shock** | D | condition: on_hit, chance: 0.20, bonus_damage shadow (APPROX) |
| **superconductor** | D | condition: on_hit, chance: 0.20, bonus_damage lightning (APPROX — no slow detection) |
| **frostplague** | D | condition: on_hit, chance: 0.20, amplify_dot_element poison stackMul: 1.0 tickMul: 1.3 dur: 4 (APPROX — always tick faster regardless of slow) |
| **necrosis** | D | condition: on_hit, chance: 1.0, reduce_max_hp fraction: 0.005 dur: 30 (APPROX — small per-hit max HP shave) |
| **blight** | D | condition: on_hit, chance: 0.30, apply_dot poison dpsPerTier: 3 duration: 4 (APPROX — extra poison DOT regardless of fire status) |
| **blood_mirror** | D | condition: on_taking_damage, chance: 0.50, heal small (APPROX — thorns→heal mechanic) |
| **thornfrost** | B | condition: on_taking_damage, chance: 0.40, apply_slow multiplier: 1.5 dur: 4 |
| **regenerative_shield** | D | condition: on_taking_damage, chance: 1.0, stat_buff_add hpRegen +5 dur: 6 (APPROX — barrier-conditional needs state read) |
| **riposte** | C | condition: on_dodge (NEW), stat_buff_mul attackSpeed × 0.5 dur: 4 |
| **flicker_strike** | E | bespoke counter state. Defer. (Approx fallback: stat_buff_mul critChance ×1.3 always-on via passive stats) |
| **sanguine_endurance** | E | bespoke overheal cap. Defer. |
| **blood_pact** | E | bespoke overheal-to-HP-cap. Defer. |
| **crystal_aegis** | wait-for-deps | depends on fortress. After Chunk 3 completes, wire as multi-effect (frostbite-like + fortress passives) |
| **worldfire** | wait-for-deps | depends on storm_of_flames + thermal_shock. After Chunk 3, wire as multi-effect Ignite-amplifier |

- [ ] **Step 1:** Write the audit doc with the table above (refined per actual recipe data) plus per-compound details (description, current state, proposed JSON blueprint, fidelity notes).

- [ ] **Step 2:** Commit:

```bash
git add docs/balance/passive-compound-mapping.md
git commit -m "docs: comprehensive mapping of ~21 unwired compounds to trigger blueprints"
```

**Chunk 2 done.** Concrete spec for the wiring work.

---

## Chunk 3: Add `on_dodge` Trigger Condition

**Why next:** Riposte needs it. One-time engine work that unblocks riposte + future compounds.

**Outcome:** New `on_dodge` condition. fireTriggers called on dodge events from defender's loadout.

### Task 3.1: Extend TriggerCondition + fire on dodge

**Files:**
- Modify: `packages/engine/src/types/combat.ts` — add `'on_dodge'` to TriggerCondition union
- Modify: `packages/engine/src/duel/trigger-system.ts` — add CONDITION_MAP entry if needed (no — there's no chance_on_dodge affix, so no inference; only explicit condition declaration uses on_dodge)
- Modify: `packages/engine/src/duel/duel-engine.ts` — fireTriggers(triggers[defenderIdx], 'on_dodge', defender, attacker, ...) at the dodge resolution path
- Modify: `packages/engine/src/data/schemas.ts` — add 'on_dodge' to TriggerConditionSchema
- Test: compound-runtime.test.ts — add test asserting on_dodge fires when dodge event resolves

- [ ] **Step 1:** Add `'on_dodge'` to the `TriggerCondition` type union in combat.ts.
- [ ] **Step 2:** Add `'on_dodge'` literal to the `TriggerConditionSchema` in schemas.ts.
- [ ] **Step 3:** In duel-engine.ts, find the `if (isDodged) { ... }` block (around the attack resolution). After the dodge log events, before `attacker.attackTimer = ...`, add:

```typescript
fireTriggers(triggers[defenderIdx], 'on_dodge', defender, attacker, rng, log, time);
```

- [ ] **Step 4:** TDD — add test asserting that when a defender has a riposte-like trigger, dodging an attack fires it. Use `simulate()` with controlled stats (defender 100% dodge chance via `dodgeChance: 100`).

- [ ] **Step 5:** Run engine tests. PASS.

- [ ] **Step 6:** Commit:

```bash
git add packages/engine/src/types/combat.ts packages/engine/src/data/schemas.ts packages/engine/src/duel/duel-engine.ts packages/engine/tests/compound-runtime.test.ts
git commit -m "feat(engine): on_dodge trigger condition (fires on defender's successful dodge)"
```

**Chunk 3 done.** Riposte is wireable.

---

## Chunk 4: Wire All Trigger-Expressible Compounds (Groups B + C + D)

**Why next:** With on_dodge in place, all non-bespoke compounds can be wired data-only via JSON.

**Outcome:** ~17 new compounds wired (everything except Group E bespoke + dependency-blocked capstones). Total wired count: 23 + ~17 = ~40.

### Task 4.1: Wire Group B (clean trigger fits)

For each of vampiric_fury, warriors_edge, iron_maiden, thornfrost (per audit):

- [ ] **Step 1:** Edit the recipe entry in recipes.json. Add `compoundEffects` block per the audit's proposed blueprint. Add `compound.<id>.chance` to `outputBonusEffects` (use 1.0 if always-on, lower if probabilistic).

- [ ] **Step 2:** Run `cd packages/engine && pnpm test`. Parameterized "every wired compound fires" test should auto-extend (+2 tests per compound). Both PASS.

- [ ] **Step 3:** If a test fails because a predicate is missing in the `expectedMutation` map, add the entry.

- [ ] **Step 4:** Commit per compound for bisectability:

```bash
git add packages/engine/src/data/recipes.json packages/engine/tests/compound-runtime.test.ts
git commit -m "feat(engine): wire <compound> as <kind> trigger"
```

### Task 4.2: Wire Group C (needs on_dodge)

- [ ] **Step 1:** Wire riposte:

```json
"compoundEffects": [
  {
    "condition": "on_dodge",
    "effect": {
      "kind": "stat_buff_mul",
      "stat": "attackSpeed",
      "multiplier": 0.5,
      "duration": 4
    }
  }
]
```
With `compound.riposte.chance: 1.0`.

- [ ] **Step 2:** Engine tests PASS. Commit:

```bash
git add packages/engine/src/data/recipes.json
git commit -m "feat(engine): wire riposte as stat_buff_mul attackSpeed on_dodge"
```

### Task 4.3: Wire Group D (approximations)

For each of thermal_shock, storm_of_flames, void_shock, superconductor, frostplague, necrosis, blight, blood_mirror, regenerative_shield (per audit):

- [ ] **Step 1:** Per audit, add the approximation blueprint. Each commit's message should note **APPROX** with the fidelity-loss reason:

```bash
git commit -m "feat(engine): wire <compound> as <kind> trigger (APPROX — <reason>)"
```

For example, blight:
```json
"compoundEffects": [
  {
    "effect": {
      "kind": "apply_dot",
      "element": "poison",
      "dpsPerTier": 3,
      "duration": 4
    }
  }
]
```
With `compound.blight.chance: 0.30`. Commit message: "feat(engine): wire blight as apply_dot poison trigger (APPROX — always-on extra DOT, doesn't conditionally check fire)"

- [ ] **Step 2:** Each compound committed individually, tests pass after each.

### Task 4.4: Wait-for-deps capstones

- [ ] **Step 1:** Now that fortress / storm_of_flames / thermal_shock have something wired (passively or via approximation), wire crystal_aegis and worldfire. These are signature3 capstones with recipe-component inputs (e.g. crystal_aegis = frostbite + fortress + cold).

- [ ] **Step 2:** Wire as multi-effect blueprints combining the parent compounds' mechanics. e.g., crystal_aegis:

```json
"compoundEffects": [
  {
    "effect": {
      "kind": "compound_dot",
      "element": "cold",
      "dpsPerTier": 4,
      "duration": 8,
      "tickInterval": 1.0,
      "dotMultiplier": 1.5
    }
  },
  {
    "effect": {
      "kind": "apply_slow",
      "multiplier": 1.6,
      "duration": 5
    }
  }
]
```
With `compound.crystal_aegis.chance: 0.25`. (Capstone signature3 has no chance_* component — needs explicit `condition: 'on_hit'` on each blueprint OR rely on inference if a chance_* affix component is present in `components`.)

- [ ] **Step 3:** Verify the capstone fires in the parameterized test. Commit.

### Task 4.5: Bump version + re-run sim

- [ ] **Step 1:** Engine rebuild.
- [ ] **Step 2:** Bump client to 0.23.0.
- [ ] **Step 3:** Update memory with new wired count (~40).
- [ ] **Step 4:** Run sim. Compare to Baseline-A. Expect:
  - `compoundRuntime` map shows ~17 new entries with `procs > 0`
  - `compound-heavy` slice shifts as more compounds become viable
  - Some win rates normalize toward 50% as previously-passive compounds now actually do something

- [ ] **Step 5:** Commit version bump.

```bash
git add packages/client/package.json
git commit -m "chore(client): bump version to 0.23.0 (~17 additional compounds wired as triggers)"
```

**Chunk 4 done.** ~40 of 44 compounds firing. Only Group E bespoke + a couple of capstones remain.

---

## Chunk 5: Passive Damage Modifier System (Group C+D Fidelity Pass)

**Why next:** The Group D "APPROX" wirings work but lose the conditional flavor (blight's "+30% poison bonus on burning targets" became "extra poison DOT on hit"). This chunk adds a minimal hook so we can express conditional damage modifiers properly.

**Outcome:** New `passiveDamageModifiers` array on GladiatorRuntime, populated at duel start by walking equipped compounds. damage-calc reads modifiers and applies conditional multipliers. The Group D approximations from Chunk 4 get upgraded to real-fidelity wirings.

### Task 5.1: Design + add PassiveDamageModifier type

**Files:**
- Modify: `packages/engine/src/types/combat.ts`
- Modify: `packages/engine/src/duel/gladiator.ts`

- [ ] **Step 1:** Add `PassiveDamageModifier` interface to combat.ts:

```typescript
/**
 * A passive damage-calc modifier applied while a compound is equipped.
 * Read by damage-calc at hit time to apply conditional bonuses based on
 * attacker/defender state (e.g. "+30% poison damage when target is burning").
 */
export interface PassiveDamageModifier {
  sourceCompoundId: string;
  /** Which damage type this modifies (matches attacker.elementalDamage[element] or 'physical'). */
  damageType: 'physical' | Element;
  /** Multiplier applied to that damage type's contribution. 1.0 = no change. */
  multiplier: number;
  /**
   * Condition predicate evaluated at hit time. If returns true, the multiplier
   * applies. Predicates read attacker/defender runtime state.
   */
  condition: (attacker: GladiatorRuntime, defender: GladiatorRuntime) => boolean;
}
```

- [ ] **Step 2:** Add `passiveDamageModifiers: PassiveDamageModifier[]` to GladiatorRuntime. Initialize in createGladiator as `[]`.

### Task 5.2: Populate modifiers from equipped compounds

**Files:**
- Modify: `packages/engine/src/duel/duel-engine.ts` — populate at duel start
- Modify: `packages/engine/src/duel/trigger-system.ts` — extract modifiers from recipes (analog of extractTriggers)

- [ ] **Step 1:** Add `extractPassiveModifiers(loadout, registry): PassiveDamageModifier[]` to trigger-system.ts. It walks slots, finds compound gems whose recipes declare passive modifiers (new optional field on recipe), and constructs the modifier objects.

- [ ] **Step 2:** Add new optional field to RecipeDefinition: `passiveDamageModifiers?: PassiveDamageModifierBlueprint[]` where blueprint declares the multiplier + a serializable condition (e.g. `{ kind: 'target_has_dot_element', element: 'fire' }`).

- [ ] **Step 3:** materializeBlueprint expands serializable conditions into actual predicate functions:

```typescript
function buildPredicate(cond: PassiveModifierCondition): (a, d) => boolean {
  switch (cond.kind) {
    case 'target_has_dot_element':
      return (_a, d) => d.activeDOTs.some((dot) => dot.element === cond.element);
    case 'target_slowed':
      return (_a, d) => d.slowDebuffMultiplier > 1;
    case 'attacker_has_barrier':
      return (a, _d) => a.barrier > 0 || a.temporaryBarriers.length > 0;
    case 'always':
      return () => true;
  }
}
```

- [ ] **Step 4:** In duel-engine.ts simulate(), after creating gladiators:

```typescript
gladiators[0].passiveDamageModifiers = extractPassiveModifiers(loadouts[0], registry);
gladiators[1].passiveDamageModifiers = extractPassiveModifiers(loadouts[1], registry);
```

### Task 5.3: Read modifiers in damage-calc

**File:** `packages/engine/src/duel/damage-calc.ts`

- [ ] **Step 1:** Modify `calculateAttackBreakdown` signature to accept `attackerModifiers: PassiveDamageModifier[]` and `attacker: GladiatorRuntime`, `defender: GladiatorRuntime` (need both for predicate evaluation).

- [ ] **Step 2:** In the elemental damage loop, for each element, iterate matching modifiers and multiply `rawElem` by `modifier.multiplier` if `modifier.condition(attacker, defender)` returns true.

- [ ] **Step 3:** Update the call site in duel-engine.ts to pass attacker.passiveDamageModifiers + the gladiator references.

- [ ] **Step 4:** TDD — write tests that lock the conditional behavior:

```typescript
describe('PassiveDamageModifier — conditional damage bonus', () => {
  it('blight (target has fire DOT → poison ×1.30) only applies when target has fire DOT', () => {
    // ... two simulate() runs differing only in whether defender has a fire DOT seeded
    // assert poison damage in the with-fire run is 30% higher
  });
});
```

- [ ] **Step 5:** Engine tests PASS. Commit:

```bash
git add packages/engine/src/types/combat.ts packages/engine/src/duel/gladiator.ts packages/engine/src/duel/trigger-system.ts packages/engine/src/duel/damage-calc.ts packages/engine/src/duel/duel-engine.ts packages/engine/tests/compound-runtime.test.ts
git commit -m "feat(engine): passive damage modifier system for conditional compound bonuses"
```

### Task 5.4: Upgrade Group D approximations to real-fidelity passive modifiers

For each Group D compound from Chunk 4 that should use a passive modifier instead of (or in addition to) its trigger:

- [ ] **Step 1:** Add `passiveDamageModifiers` block to the recipe. Example for blight:

```json
"passiveDamageModifiers": [
  {
    "damageType": "poison",
    "multiplier": 1.30,
    "condition": { "kind": "target_has_dot_element", "element": "fire" }
  }
]
```

- [ ] **Step 2:** Decide whether to KEEP the trigger-blueprint approximation alongside the passive modifier (compound has BOTH a triggered effect AND a passive modifier — totally fine, see frostbite pattern). For most Group D, keep both for layered gameplay.

- [ ] **Step 3:** Each commit per compound. Tests pass.

### Task 5.5: Bump + re-run sim

- [ ] **Step 1:** Bump client 0.23.0 → 0.24.0.
- [ ] **Step 2:** Re-run sim. Expect Group D compound win rates to converge toward 50% as their conditional bonuses now actually fire.

```bash
git add packages/client/package.json
git commit -m "chore(client): bump version to 0.24.0 (passive damage modifier system + Group D fidelity)"
```

**Chunk 5 done.** Conditional damage-modifier compounds work properly.

---

## Chunk 6: Bespoke Mechanics (Group E)

**Why next:** Final cleanup. Each compound here gets its own implementation. Optional — can skip if balance work is more pressing than completionism.

**Outcome:** flicker_strike, sanguine_endurance, blood_pact wired with bespoke engine code.

### Task 6.1: flicker_strike — auto-crit after N hits without crit

**Files:**
- Modify: `packages/engine/src/types/combat.ts` — add `hitsSinceCrit: number` to GladiatorRuntime
- Modify: `packages/engine/src/duel/gladiator.ts` — initialize to 0
- Modify: `packages/engine/src/duel/duel-engine.ts` — in attack resolution, on crit reset to 0; on non-crit increment; if >= threshold AND attacker has flicker_strike equipped, force isCrit = true

- [ ] **Step 1:** Detection helper: `function hasCompoundEquipped(loadout, recipeId): boolean` — walk slots, check `gem.affixId === recipeId || gem.sourceRecipe === recipeId`.

- [ ] **Step 2:** In attack resolution, BEFORE computing `isCrit`, if `attacker.hitsSinceCrit >= threshold` AND attacker has flicker_strike equipped, set `isCrit = true` (force the crit). Reset counter to 0 after.

- [ ] **Step 3:** Threshold from compound.flicker_strike.hitInterval recipe param (default 5).

- [ ] **Step 4:** Test: simulate with flicker_strike-equipped attacker vs bare defender; assert crit count is at least floor(totalAttacks / threshold).

- [ ] **Step 5:** Add `compound.flicker_strike.active: 1` semantics doc note. Commit.

### Task 6.2: sanguine_endurance — overheal cap +20%

**Files:**
- Modify: `packages/engine/src/duel/duel-engine.ts` — heal application path

- [ ] **Step 1:** Detection helper from 6.1. In heal application, when `attacker has sanguine_endurance equipped`, allow `currentHP` to exceed `effectiveMaxHP(g)` up to `effectiveMaxHP(g) * 1.20`.

- [ ] **Step 2:** Test + commit.

### Task 6.3: blood_pact — overheal-to-HP-cap

Similar to sanguine_endurance but the overheal becomes permanent maxHP increase.

- [ ] **Step 1:** When heal would overheal AND attacker has blood_pact, increase `attacker.maxHP` by the overheal amount (capped at some sane multiplier of base maxHP, e.g. 1.5x).

- [ ] **Step 2:** Test + commit.

### Task 6.4: Bump + final sim

- [ ] **Step 1:** Bump 0.24.0 → 0.25.0.
- [ ] **Step 2:** Run sim. All 44 compounds should now appear in either `compoundRuntime` (firing triggers) or `compoundUsageRates` (passively contributing).
- [ ] **Step 3:** Capture final baseline as `docs/balance/2026-05-01-final-wired-baseline.md`.

```bash
git add packages/client/package.json
git commit -m "chore(client): bump version to 0.25.0 (all compounds wired — final state)"
```

**Chunk 6 done.** Compound system at 100% wired (44/44).

---

## Chunk 7: Balance Tuning Pass with Full Compound Roster

**Why last:** Now that all compounds fire, the meta will have shifted dramatically. Re-run sim and tune outliers.

**Outcome:** Outliers (>65% / <35% win rate at sample size ≥ 20) tuned. Final baseline captured.

### Task 7.1: Tune outliers iteratively

- [ ] **Step 1:** Read sim output from Chunk 6. Identify outliers. For each:
  - **Too strong:** lower chance, lower multiplier, or lower duration
  - **Too weak:** raise numbers OR investigate (might be a wiring issue)

- [ ] **Step 2:** Make ONE change per commit so we can bisect. After each change: rebuild engine, re-run sim, record new win rate.

- [ ] **Step 3:** Iterate until no compound has win-when-used outside [40%, 60%] at sample size ≥ 20.

### Task 7.2: Final verification + bump

- [ ] **Step 1:** Run all suites: engine, client, tools.
- [ ] **Step 2:** Run sim. Save output to `docs/balance/2026-05-01-tuned-final.md`.
- [ ] **Step 3:** Bump 0.25.0 → 0.26.0. Commit.

```bash
git add packages/client/package.json
git commit -m "chore(client): bump version to 0.26.0 (balance tuning pass with all compounds)"
```

**Chunk 7 done.** Balance normalized; baseline captured.

---

## Final Verification

- [ ] All chunks complete with their commits
- [ ] Engine: 700+ tests PASS (count grows substantially with new tests for on_dodge, passive modifiers, bespoke mechanics)
- [ ] Client: 383+ tests PASS
- [ ] All 3 packages typecheck clean
- [ ] Engine bundle rebuilt
- [ ] Client at 0.26.0
- [ ] Memory `project_feature_status.md` updated
- [ ] All baseline docs exist: `passive-compound-mapping.md`, `2026-05-01-final-wired-baseline.md`, `2026-05-01-tuned-final.md`

**End state:** All 44 compounds wired (23 prior + ~17 trigger-expressible + ~3 bespoke + ~1 dependency-blocked-now-unblocked). Universal compound trigger banners. Juggernaut investigated. Passive damage modifier system live (Group C/D fidelity). Bespoke mechanics (Group E) implemented. Balance outliers tuned. Compound system **100% wired and tuned**.

**Outside scope (intentionally deferred):**
- **Playwright E2E specs for compounds** — `compounds.spec.ts` with fixture helpers (socketCompoundInRun, forceProcSeed, startDuelViaStore, waitForCombatEvent). Separate test-infrastructure session.
- **Tools UI rendering of compoundEffects** — radial-tree-browser / stats-analyzer / workbench-editor still consume legacy `inputs` field rather than new `components` / `compoundEffects` (data is plumbed; rendering is the work). Separate session.
- **Synergy system audit** — sim found juggernaut at 0%; other synergies might have similar issues. Not in scope; separate balance pass.
