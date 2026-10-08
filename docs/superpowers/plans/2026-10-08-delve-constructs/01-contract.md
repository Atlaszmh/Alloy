## Chunk 1: Base, files and conventions

# Delve weapon identity and constructs · Phase A: the contract — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the overview's contract so B1, B2, C1, C2 and D work in parallel without editing each other's files: every move and blow a **construct** with a uid (`Move.uid`, `Blow.uid`, `Construct`, `profile.constructs`, `profile.nextConstructUid`, `Haul.constructs`); the **slot table** (`balance.json → delve.movesets.slots`, a start and a ceiling per rarity and skill; `Moveset.bought`) in place of carries, Awaken and the extra-slot Links; **Open a skill** (`openSkill`, `openSkillPrice`) in Awaken's place; a **class** on every weapon base and form (melee, ranged, both), three new form rows (Whirl, Repel, Onslaught) dispatched to placeholder behaviours; inert **cast style** rows on every weapon base and the style pipeline wired through `resolveAbility` (every factor 1, every trait empty, the cast event's `look`); the **signature hook** (empty); the **Detonate** rune row and the four trait knobs (neutral); **dormancy** decided in `heroChains`, **class gating** in `setChains`, **uid-based pricing** in place of origins; `moveAllPreview` as `compareItem`'s home value; runes on any weapon up to `MAX_SOCKETS`, a weapon drop's socketed rune, the pull rule `'pay'`; `delve/constructs.ts` with a real `draftRefusal` and the B2 ops refusing "Not yet"; **save v14**; the client compiling and green on the new bundle. The suites stay green (minus the failures named below) and a whole-autopilot fingerprint is identical through every task but the switch, which re-records it.

**Architecture:** Tasks 1–3 add beside the old rules (types, data rows, schema fields, helpers nothing reads) and keep play identical. **Task 4, the switch,** retires every play-changing old rule at once (carries, Awaken, `transferMoveset`, `socketCap`, `weaponExtras.sockets`, `unsocket: 'destroy'`, the extra-slot Links, `ChainOrigins`), mints uids everywhere a construct is born, and re-records the fingerprint. Task 5 is the save version; Task 6 the client. A new save's common sword holds its Basic and a two-slot Primary (two Strikes), so the bot forges before dive 1 only when Power rises; the bot wears the bag weapon that raises Power as it is (its Move all is B2's op, which D1 rewires), so the pacing rails hold at the switch.

**Tech Stack:** TypeScript 5.7, Zod 3, Vitest 3, React 19, Zustand 5.

**Spec:** `docs/superpowers/specs/2026-10-07-delve-weapon-identity-and-constructs-design.md` (authoritative), §2 (classes, styles, forms), §3 (constructs, the slot table, Open a skill, Move all, runes), §5 (the catalogue). The overview is `00-overview.md` in this folder; its "The contract" is what this file lands, with the coordinator's additions (listed under "Where the code moved the contract").

---

## Base

- **Starts from:** `main` at `2f3871b2` (v0.75.1, the spec), in this area's worktree `C:/Projects/alloy-constructs-a` on branch `constructs/a`, its `node_modules` junctioned to the main checkout's by the junction script (a copy sits at `C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/1d6bb288-c64f-43d2-9587-234f3b95983f/scratchpad/mkwt.ps1`):

```powershell
powershell -File "C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/1d6bb288-c64f-43d2-9587-234f3b95983f/scratchpad/mkwt.ps1" -Name alloy-constructs-a -Branch constructs/a -Base 2f3871b2
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-constructs-a` in Git Bash. Remove it at the end with `rmdir /s /q` from cmd then `git worktree prune` (never `git worktree remove --force`: it follows the junctions). **Never `git stash` there.**
- **Before Task 1:** build the engine once for the client's junction, and measure both suites:

```bash
cd /c/Projects/alloy-constructs-a
(cd packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run --reporter=dot)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run --reporter=dot)
```

  Expected: tsup's "Build success" lines (ESM, CJS and DTS); no type errors; the engine suite **Test Files 1 failed | 144 passed | 2 skipped (147); Tests 1 failed | 1831 passed | 11 skipped (1843)**, about 12½ minutes (754 s on the scratch copy). The one failure is at the base already: `delve-pacing-robust.test.ts > the pacing targets with undefined × 0.8 > the first legendary follows the first essence within two visits, and three seeds in four forge an epic by dive 8` (seed 3: `expected false to be true`). It is pacing, not Phase A's (D2 re-measures); the overview's brief names two such failures, the base shows this one. The client suite **152 passed (152) files, 1413 passed (1413) tests** (33 s); both typechecks clean. Run nothing else heavy while the engine suite runs.
- **The fingerprint, before:** save this probe outside the worktree, as `C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/1d6bb288-c64f-43d2-9587-234f3b95983f/scratchpad/constructs-a-probe.test.ts` (never committed; Tasks 1, 2, 3, 4 and 5 run it). It is the room objects' probe with `norm`, which reads the constructs' shapes back as the old ones (a move's or a blow's `uid` dropped, a moveset's `bought`, the profile's `constructs`, `autoSalvagePlain`, `nextUid` and `nextConstructUid`, a haul's `constructs`), so the hash moves only if play does; the depth/kills/seconds after each hash never lie:

```ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { runAutopilot, type AutopilotOptions } from '../src/delve/autopilot.js';

// Scratch parity probe: a fingerprint of whole autopilot runs (every floor's sim), the save's
// version left out. `norm` reads the constructs' shapes as the old ones (a move's or a blow's
// `uid` dropped, a moveset's `bought`, the profile's `constructs` and `autoSalvagePlain`, a
// haul's `constructs`, and `nextUid`, which construct mints move), so the hash is the same
// before and after a task only if play is; the depth/kills/seconds after each hash never lie.
const norm = (_k: string, v: unknown) => {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if ('kind' in o && ('form' in o || 'element' in o) && typeof o.uid === 'string') {
      const { uid: _u, ...rest } = o;
      return rest;
    }
    if ('chains' in o && 'slots' in o && 'bought' in o) {
      const { bought: _b, ...rest } = o;
      return rest;
    }
    if ('nextUid' in o && 'equipped' in o) {
      const { constructs: _c, autoSalvagePlain: _a, nextUid: _n, nextConstructUid: _m, ...rest } = o;
      return rest;
    }
    if ('scrap' in o && 'dust' in o && 'links' in o && 'runes' in o && 'constructs' in o) {
      const { constructs: _c, ...rest } = o;
      return rest;
    }
  }
  return v;
};
it('probe', () => {
  const registry = createDefaultRegistry();
  const runs: Record<string, AutopilotOptions> = {};
  for (const primary of ['fire', 'frost', 'earth'] as const)
    for (const seed of [1, 2]) runs[`${primary}:${seed}`] = { seed, dives: 4, primary };
  runs['beeline:3'] = { seed: 3, dives: 4, primary: 'storm', policy: 'beeline' };
  runs['tutorial:1'] = { seed: 1, dives: 3, primary: 'fire', tutorial: true };
  const out: Record<string, string> = {};
  for (const [k, opts] of Object.entries(runs)) {
    const r = runAutopilot(registry, opts);
    const { version: _v, ...rest } = r.profile as unknown as Record<string, unknown>;
    out[k] =
      createHash('sha1').update(JSON.stringify(r.reports, norm) + JSON.stringify(r.economy, norm) + JSON.stringify(rest, norm)).digest('hex') +
      ' ' + r.reports.map((x) => `${x.endDepth}/${x.kills}/${x.floorSeconds.toFixed(3)}`).join(',');
  }
  writeFileSync(process.env.PROBE_OUT!, JSON.stringify(out, null, 1));
}, 900000);
```

```bash
cd /c/Projects/alloy-constructs-a
P=C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/1d6bb288-c64f-43d2-9587-234f3b95983f/scratchpad
cp $P/constructs-a-probe.test.ts packages/engine/tests/zz-probe.test.ts
(cd packages/engine && PROBE_OUT=$P/constructs-a-before.json npx vitest run tests/zz-probe.test.ts --reporter=dot)
rm packages/engine/tests/zz-probe.test.ts
cat $P/constructs-a-before.json
```

  Expected (`constructs-a-before.json`, about 3 minutes; the probe must never sit in `tests/` while the whole suite runs, or it joins it and fails on the missing `PROBE_OUT`):

```json
{
 "fire:1": "853f1e4049b9db9ad8c8242d7301989d9d13ebfe 5/96/290.000,5/83/212.000,11/131/329.000,24/341/829.000",
 "fire:2": "5c28d04ed811f6531fa707bcca3b5ce2a053f266 5/92/248.000,5/91/224.000,12/126/290.000,18/188/517.000",
 "frost:1": "cadaac6d0f4bfdd7e8da6f6a34a9a1b54789f40f 5/99/290.000,5/87/203.000,12/142/410.000,23/343/886.000",
 "frost:2": "a8174ebb54dda98e24f887100015ecadaf5fc6de 5/90/239.000,5/93/201.000,13/172/415.000,19/227/554.000",
 "earth:1": "7ca2765d5bfc98f5038cfab6bfea16d4ac41d08e 5/101/280.000,5/91/224.000,11/125/401.000,20/223/906.000",
 "earth:2": "8b621b2fa66e19a61825fe0aedc4afaa0f5a268c 5/90/249.000,5/89/223.000,14/202/470.000,21/282/774.000",
 "beeline:3": "09fb2baaf3b4425ea804416e67e21e5a594a35cc 5/38/165.000,5/51/135.000,10/70/194.000,14/126/254.000",
 "tutorial:1": "d71dec8b23ec8da7497135edd7522e4a7717ee8b 3/9/35.000,5/22/66.000,11/84/276.000"
}
```

  **The comparison**, run after each task (`$P/cmp.cjs`; it prints `FINGERPRINT_SAME` or each run that moved):

```js
const fs = require('fs');
const [a, b] = process.argv.slice(2).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
let same = true;
for (const k of Object.keys(a))
  if (a[k] !== b[k]) {
    same = false;
    console.log(k + '\n  was ' + a[k] + '\n  now ' + b[k]);
  }
console.log(same ? 'FINGERPRINT_SAME' : 'FINGERPRINT_CHANGED');
```

```bash
# after a task: record, then compare with the baseline (before Task 4: constructs-a-before.json; from Task 4 on: constructs-a-task4.json)
cd /c/Projects/alloy-constructs-a
P=C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/1d6bb288-c64f-43d2-9587-234f3b95983f/scratchpad
cp $P/constructs-a-probe.test.ts packages/engine/tests/zz-probe.test.ts
(cd packages/engine && PROBE_OUT=$P/constructs-a-taskN.json npx vitest run tests/zz-probe.test.ts --reporter=dot)
rm packages/engine/tests/zz-probe.test.ts
node $P/cmp.cjs $P/constructs-a-before.json $P/constructs-a-taskN.json
```

## Files

| File | Change |
|---|---|
| `packages/engine/src/types/ability.ts` | `WeaponClass`, `FormClass`, the three forms in `FormId`, `Move.uid`, `Blow.uid`, `Construct`, the knobs `detonate`, `critBonus`, `cleave`, `homing`, `stepBonus` (Task 1); `ResolvedAbility.look` (Task 2); `Chain`'s doc (Task 4) |
| `packages/engine/src/types/arpg.ts` | `FormDef.class`, `FormDef.melee`, `StyleNumbers`, `StyleMotion`, `StyleLook`, `CastStyle` (Task 1); `look?` on the `hit`, `cast`, `beam`, `slash`, `explode` and `dash` events (Task 2) |
| `packages/engine/src/types/delve.ts` | `GearBaseDef.class` and `style` (Task 1); `HeroWeapon.class` and `style` (Task 2); `MovesetsBalance.slots`, `openSkill`, `salvageDust`, `RunesBalance.runeChance` (Task 3); `carries`, `transferScrap`, `socketCap` gone, `DelveProfile.constructs`, `autoSalvagePlain`, `nextConstructUid` (Task 4); `version: 14` (Task 5) |
| `packages/engine/src/types/gear.ts`, `types/rune.ts`, `types/crafting.ts`, `types/tutorial.ts` | `awakened` gone, `Moveset.bought`; `ChainOrigins` gone; `Haul.constructs`, `ForgePreview.weapon` as class, slots and ceilings, `SalvageYield.constructs`, `SalvageResult.constructs`, `weaponExtras` without sockets, `AwakenPrice` gone; the `moveAll` and `openSkill` triggers and events (Task 4) |
| `packages/engine/src/data/schemas.ts` | the knobs, the forms' `class` and `melee`, `.length(15)`, the bases' `class` and `style` (Task 1); `SlotRangeSchema`, `slots`, `openSkill`, `salvageDust`, `runeChance` (Task 3); `carries`, `transferScrap`, `socketCap`, `awaken`, `weaponExtras.sockets` gone, `unsocket` (Task 4) |
| `packages/engine/src/data/arpg.json`, `delve.json`, `runes.json` | `class` on every form, the three new rows; `class` and an inert `style` on every weapon base; the runes' fits grown to the kin forms (Task 1); the Detonate row first (Task 4) |
| `packages/engine/src/data/balance.json` | `movesets.slots`, `openSkill`, `pair.salvageDust`, `runes.runeChance` beside the old keys (Task 3); `carries`, `transferScrap`, `socketCap`, `crafting.awaken`, `weaponExtras.*.sockets` gone, `unsocket: 'pay'` (Task 4) |
| `packages/engine/src/data/tutorial.json` | the `l2-transfer` step's trigger `moveAll` (Task 4) |
| `packages/engine/src/arpg/abilities/forms.ts` | the placeholder cases (Task 1); the signature hook's dispatch (Task 2) |
| `packages/engine/src/arpg/abilities/resolve.ts` | `NEUTRAL` and `mergeKnobs` with the new knobs (Task 1); `applyStyle`, the style's trait and look in `resolveAbility` (Task 2); `defaultChains` by class (Task 4) |
| `packages/engine/src/arpg/abilities/signatures.ts` (new), `arpg/abilities/cast.ts` | `SIGNATURES`, `signatureFor`, `withSignature`; the cast event's `look` (Task 2) |
| `packages/engine/src/delve/hero-stats.ts` | `HeroWeapon.class` and `style` (Task 2); `compareItem` on `moveAllPreview`, the new forms in `TARGETS` (Task 4) |
| `packages/engine/src/delve/profile-schema.ts` | the three forms in `FormIdSchema` and `SLOT_FORMS` (Task 1); `UidSchema`, `ConstructSchema`, `HaulSchema.constructs`, `ChainSchema.min(0)`, `MovesetSchema.bought`, `awakened` gone, the profile's new fields (Task 4); `SavedMoveSchema`, `SavedBlowSchema`, `version: 14` (Task 5) |
| `packages/engine/src/loot/moveset.ts` | `defaultForm`, `weaponClass`, `formAllowed`, `slotRange`, `ceilingOf`, `plainConstruct`, `constructSkill`, `isPlain`, `dormantUids`, `fillSlots`, `emptyChain` (Task 3); rewritten on the slot table: `defaultMoveset`, `rollMoveset`, `rollSockets`, `rollSocketedRunes`, `weaponParts`, `heroChains` (dormancy), `moveAllPreview`; `carriedSkills`, `carriedFrom`, `carriedByText`, `baseSlots`, `extraSlots`, `movesetTransfer` gone (Task 4) |
| `packages/engine/src/delve/moveset.ts`, `delve/runes.ts`, `delve/crafting.ts`, `delve/profile.ts`, `delve/constructs.ts` (new), `loot/forge.ts`, `loot/salvage-yield.ts`, `loot/runes.ts`, `loot/item-generator.ts`, `loot/materials.ts`, `delve/pair.ts`, `delve/stops.ts`, `delve/tutorial.ts`, `delve/dive.ts`, `delve/economy.ts`, `delve/autopilot.ts`, `arpg/tutorial-floor.ts`, `src/index.ts` | the switch (Task 4): see its file list |
| `packages/engine/tests/delve-constructs-a-{data,style,model,switch,save}.test.ts` (new) | each task's tests |
| `packages/engine/tests/ability-data.test.ts`, `delve-chains.test.ts`, `delve-dps-sim.test.ts` | the forms' count and the new rows (Task 1) |
| `packages/engine/tests/ability-resolve.test.ts` | the knobs in the neutral literal (Tasks 2 and 4) |
| `packages/engine/tests/delve-runes-contract.test.ts` | `runeChance` in the balance literal (Task 3); the Detonate row, `MAX_SOCKETS`, the pull rule, the load-time trims (Task 4); version 14 (Task 5) |
| `packages/engine/tests/delve-{awaken-op,awaken-bot,tutorial-carries}.test.ts` → `delve-{open-skill-op,open-skill-bot,tutorial-slots}.test.ts` | rewritten for Open a skill and the slot table (Task 4) |
| `packages/engine/tests/delve-{movesets,runes,pair,stops,forge,salvage-yield,crafting-data,dive,chains,banking,rune-power,rune-costs,materials,profile-abilities,tutorial-balance,autopilot-crafting,tutorial-runner-rule,tutorial-runner-script,tutorial-review,tutorial-floors-play,tutorial-floors-drops,tutorial-contract}.test.ts`, `tests/fixtures/{arena,carries}.ts` | every test of a retired rule rewritten for the new one; the fixtures mint uids (Task 4) |
| `packages/engine/tests/delve-{boons-a-save,dive,maps-save,pair,profile-abilities,quests-save,room-save,runes-contract,save-v8,tutorial-save,movesets,constructs-a-switch}.test.ts` | version 14, minted fixtures (Task 5) |
| `packages/client/src/stores/delveStore.ts`, `features/delve/kit/glyph-art.ts`, `hub/loadout/{ComparePane,TakeSheet,EquippedPane}.tsx`, `items/{LegendaryBox,MovesetView}.tsx`, `StopPanel.tsx`, `hub/skills/useAnvilChains.ts`, `hub/help/help-topics.tsx`, `hub/forge/{ForgeBench,Temper}.tsx`; `features/delve/__tests__/armed.ts` and 32 test files | the client on the new bundle (Task 6) |

## What Phase A implements, and what it leaves

**Implemented (and tested):** everything in the overview's contract, each name and shape as written there, with the coordinator's additions: `moveAllPreview` keeps a target skill's own constructs where the worn weapon moves none; `GLYPH_ART` rows for the three forms; `addLootToBag` mints the banked weapon's uids while `withChains` and `withMoveset` keep uids as they are; the tutorial target id stays `loadout.transfer` (only the event token is `moveAll`); `SalvageYield.constructs` and `SalvageResult.constructs` (empty); `sameChain` by uid; `draftRefusal` real, the other `delve/constructs.ts` ops refusing "Not yet"; a `ConstructDraft` that leaves a skill out reads it as unchanged; `MovesetOwner` any `{ baseId, rarity }` pick (a `GearItem` too), `UNARMED` the nulls; `fitMovesets`' uid uniqueness over the worn weapon, the bag, the move bag and an open dive's haul and banked constructs; `Knobs.stepBonus` (neutral 0, additive, in `KnobsSchema`); `CastStyle.text` on every style row (the seven spec texts), required by the schema.

**Left for the areas (each inert or absent in A):**

| What | Where | Area | In A |
|---|---|---|---|
| the forms' behaviours (Whirl, Repel, Onslaught, the melee Lance, Burst and Maelstrom), the styles' numbers, motion and traits, Detonate's handler, the gate | `forms.ts`, `resolve.ts`, `impact.ts`, `defend.ts`, `arpg.json`, `delve.json` | B1 | Whirl plays as a Strike, Repel as a Ward, Onslaught as a Nova (`// B1 replaces`); every style factor 1, motion `none`, trait `{}`; the Detonate knob merges and parses, nothing reads it; `SIGNATURES` empty; `TARGETS` holds the three forms at Strike's, Ward's and Nova's reaches (`// B1 tunes`) |
| `applyDraft`, `placeConstruct`, `unsocketConstruct`, `moveAll`, `salvageConstruct`, the bag's door, the haul's constructs on settle and death | `delve/constructs.ts`, `profile.ts`, `dive.ts`, `salvage-yield.ts` | B2 | the five stubs refuse "Not yet"; `Haul.constructs` is `[]` everywhere it is born, summed by `addHaul`, stocked by `stockHaul`; a salvage's `constructs` is `[]` |
| the Skills tab's bag pane, the draft's bag, `FormPicker`'s class gating | `hub/skills/`, `chains/`, the store's draft | C1 | the draft holds chains alone, priced by uid; the editor's `socketCap` is `MAX_SOCKETS`; `absentText` is `OPEN_SKILL_TEXT` |
| the weapon frame, Move all's take sheet, the Temper bench's Open a skill, the item header's style, Help | `hub/loadout/`, `hub/forge/Temper.tsx`, `items/`, `hub/help/` | C2 | the compare pane and the take sheet offer "Move all my constructs here" (free) on the preview, through the store's `transfer`, which refuses until B2; the Temper bench's "Open <skill>" row works on the engine's op; the forge preview says "Melee · slots: Basic 3/3, Primary 2/3" |
| the bot's `moveAll`, `openSkills`, the bag ops; the tutorial's Move all step and its text | `autopilot.ts`, `tutorial.json`, `delve/tutorial.ts` | D1 | the bot wears its best bag weapon as it is (`transferBest`, `// D1 rewires to moveAll`), opens skills when it can pay and Power rises (`awakenWeapon`), and skips the lesson's `moveAll` step (so `delve-tutorial-bot.test.ts` fails in A: see Verification) |
| the E2E fixtures' `withUids`, the pacing re-measure, CLAUDE.md, the version bump | `e2e/`, `CLAUDE.md`, `package.json` | D2 | untouched |

## Where the code moved the contract (deviations from the overview; nothing in the overview's shapes changed)

1. **A separate construct counter, `profile.nextConstructUid`.** The contract minted construct uids from `nextUid`. The floor keys its drops and its RNG forks on the items' `nextUid`, and `bankWorld` resets `nextUid` from `world.loot.nextUid` on every bank, so uids minted from it collided across banks and made the bank order matter. Constructs count on their own field (`mintUid` reads and bumps it); `nextUid` is the items' alone. The save schema holds it (`default 0`); the probe's `norm` drops both.
2. **The Detonate row and the socketed-rune roll land at the switch (Task 4), not before.** Both change play (a drop's rune roll draws a fork; the Lab's rune rows grow by five), so they could not sit in the fingerprint-identical tasks. Task 3 adds `runeChance` to the balance unread; Task 4 reads it.
3. **Uid minting lands at the switch too,** everywhere a construct is born (a new save, the mana choice, a bank, a forge, an Apply, `addSlot`, Open a skill, `fitMovesets`' plain refills), since the old pricing by origins and the new by uid cannot share one `setChains`.
4. **An Upgrade keeps the weapon's rarity** in this codebase (`applyUpgrade` raises its forge level only), so `upgradeGear`'s `fillSlots` to the rarity's starts is a no-op on a weapon whose skills sit at or above them; the contract's "an upgrade fills the new starts" has nothing to fill until a rarity rises.
5. **A free extra slot never opens a skill.** `rollMoveset`'s and `forgedMoveset`'s extra slots go only to skills whose start is above 0 (the Primary first, then Basic, Ultimate, Defensive); a skill at a start of 0 opens only through Open a skill.
6. **`addSlot` keeps today's filling rule:** the new slot takes the chain's next default kind, the last construct's form and elements while in the pair (else the primary); on an empty chain, the class default form. It counts the slot as bought and mints the construct.
7. **The bot wears its best bag weapon as it is** (`transferBest` on `compareItem(..., 'asIs')` → `equipItem`) rather than keeping the weapon it wields: with `transferBest` a no-op the forged weapons stayed in the bag, dive 4's depths fell by a third and the pacing rails failed. The old weapon's bought slots and runes stay on it in the bag (the junk rule melts a plain one).
8. **`heroChains` drops an ability chain left with only dormant constructs** (a null entry in `HeroEntity.chains`); the chain and its payment stay on the weapon.
9. **`chainRefusal`'s least is 0 for an ability chain and 1 for the Basic**; a chain at 0 slots refuses with `OPEN_SKILL_TEXT` ("Open this skill on the Temper bench").
10. **`Knobs.stepBonus` and `CastStyle.text`** were added after Task 1's commit on the scratch copy (the coordinator's later addition) and landed in Task 4's commit, where this plan keeps them (Task 1's intro says which diffs); `ability-resolve.test.ts`'s neutral literal gains the first four knobs in Task 2's commit and `stepBonus` in Task 4's.
11. **`MovesetOwner` is `{ baseId: string | null; rarity: Rarity | null }`** and `UNARMED` the nulls; `slotRange(registry, UNARMED, 'basic')` is the bare hands' string.
12. **A new save with a primary chosen starts `nextConstructUid` at 10:** the kit's sword is minted at creation, then rebuilt plain and minted again by the mana choice.
13. **The client's `Temper` names the first closed skill with a ceiling** ("Open Defensive", "Open Ultimate"), one row, where the overview said only that Awaken's row calls `openSkill`.

## Needs routed

- **D1:** `delve-tutorial-bot.test.ts` fails in A (every run skips `l2-transfer`: the lesson's Move all is B2's op and the bot's `'moveAll'` lesson op returns the profile); the tutorial's `d1-aim` wording (the starting sword's Primary is a Strike now, not a Bolt); `lessonOp`'s `moveAll` case.
- **D2:** `delve-banking.test.ts`'s pinned E2E floor is seed 8 (seed 5 until the switch), so `delve.spec.ts` D02 moves to seed 8 (seeds 8, 12, 14 and 15 drop gear on the first floor with the armed hero); `e2e/delve-tutorial.spec.ts`, `delve.spec.ts:337`, `delve-gamepad.spec.ts:47`, `delve-training.spec.ts:143` ("Basic alone"), every E2E seed of a hand-built moveset (`withUids`); CLAUDE.md's sentences on carries, Awaken, transfer, the socket cap, the pull rule and save v13 → v14.
- **B2:** the five ops of `delve/constructs.ts`; `SalvageYield.constructs` and `SalvageResult.constructs` are `[]` until it fills them.
- **B1:** `TARGETS`' reaches for the three forms (`hero-stats.ts`, `// B1 tunes`); the Lab's rune view reads 197 socketed rows (Detonate's five) and 34 baselines.
- **C1 / C2:** the client edits of Task 6 are the smallest that compile; each owner rewrites its files from there (the store's `transfer` on `moveAll`, `openSkill(uid, skill)`, `editDraft`'s ignored `map`).

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `constructs/a`, staged by path (`git add packages/engine` for Tasks 1–5, `git add packages/client` for Task 6), never `git add -A`; the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` closes every message. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-constructs-a`.
- **Line endings:** the repo is CRLF in places; the diffs below carry no line-ending changes (git's autocrlf normalises on commit: the "LF will be replaced by CRLF" warnings are expected). Prettier only with `--end-of-line auto`, and **never** on `balance.json`, `delve/dive.ts`, `delve/autopilot.ts`, `delve/hero-stats.ts`, the `delve-pacing*.test.ts` files, `delve-autopilot-crafting.test.ts`, `CLAUDE.md` or the specs. The code below is already formatted as the files want it; apply it as written.
- **How the edits read:** each task's edits are the scratch commit's diffs, per file, replayed against that commit's parent in the order listed. "Apply to `f`:" (a `diff` block) is the unified diff of that file; "Create `f`:" (a code block) is a new file in full; "Delete `f`" removes it. Within a task, apply the files top to bottom; the new tests come first (they fail), the sources after (they pass).
- **Parity is the rule until the switch:** nothing in Tasks 1–3 changes a number in play, and the fingerprint is identical after each; Task 4 re-records it (`constructs-a-task4.json`), and Task 5 keeps the new one identical.
- **Tests aren't typechecked:** the engine's `tsconfig.json` covers `src/` only, so a test literal in an old shape fails when it runs, not in `tsc`; each task lists the test files it rewrites.
- **The client follows the bundle.** Tasks 1–5 never rebuild `packages/engine/dist`, so the client stays green on the base bundle through them. Task 6 rebuilds it: against the new bundle the client's typecheck fails in 24 files (55 errors) until Task 6's edits.
- **Checked on a scratch copy:** a worktree at `2f3871b2` (`C:/Projects/alloy-constructs-draft-a` on `constructs/draft-a`, left in place), every task applied in order and committed; every FAIL, PASS, count, typecheck and fingerprint below is what it printed.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| Some engine test files | `(cd packages/engine && npx vitest run tests/<file>.test.ts … --reporter=dot)` |
| All engine tests | `(cd packages/engine && npx vitest run --reporter=dot)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| Engine bundle (the client's) | `(cd packages/engine && npx tsup)` |
| Client typecheck / tests | `(cd packages/client && npx tsc --noEmit -p .)` / `(cd packages/client && npx vitest run --reporter=dot)` |
| The fingerprint | the Base section's record-and-compare block |

---

## Chunk 2: Task 1 — Weapon classes, cast styles and three forms as inert data; the Detonate and trait knobs

### Task 1: Weapon classes, cast styles and three forms as inert data; the Detonate and trait knobs

A `class` on every form (`melee`, `ranged`, `both`, with the melee overrides block `melee` on the shared forms) and on every weapon base, with an inert `style` row on each base (`name`, every number 1, `motion: 'none'`, `trait: {}`, a `look`); three new form rows, Whirl, Repel and Onslaught (after Strike, Ward and Nova in `arpg.json`, so `SLOT_FORMS` keeps the data's order), each dispatched in `forms.ts` to its kin's behaviour (`// B1 replaces`); the runes' `fits.forms` grown to the new forms where they fit the kin; the four knobs `detonate`, `critBonus`, `cleave` and `homing` in `Knobs`, `NEUTRAL`, `mergeKnobs` and `KnobsSchema` (neutral 0, additive, nothing reads them); `Move.uid`, `Blow.uid` and `Construct` as types only. Nothing reads any of it in play: the fingerprint is identical.

Two of the contract's fields came later on the scratch copy (the coordinator's addition after this commit) and landed in Task 4's diffs, where this plan keeps them: `Knobs.stepBonus` (`types/ability.ts`, `resolve.ts`'s `NEUTRAL` and `mergeKnobs`, `KnobsSchema`, `ability-resolve.test.ts`'s literal) and `CastStyle.text` (`types/arpg.ts`, the style schema, `delve.json`'s seven texts, `delve-constructs-a-data.test.ts`'s `STYLE_TEXT`). Until Task 4 the style rows have no `text` and the knobs are four.

**Files:**
- Modify: `packages/engine/src/arpg/abilities/forms.ts`
- Modify: `packages/engine/src/arpg/abilities/resolve.ts`
- Modify: `packages/engine/src/data/arpg.json`
- Modify: `packages/engine/src/data/delve.json`
- Modify: `packages/engine/src/data/runes.json`
- Modify: `packages/engine/src/data/schemas.ts`
- Modify: `packages/engine/src/delve/profile-schema.ts`
- Modify: `packages/engine/src/types/ability.ts`
- Modify: `packages/engine/src/types/arpg.ts`
- Modify: `packages/engine/src/types/delve.ts`
- Modify: `packages/engine/tests/ability-data.test.ts`
- Modify: `packages/engine/tests/delve-chains.test.ts`
- Create: `packages/engine/tests/delve-constructs-a-data.test.ts`
- Modify: `packages/engine/tests/delve-dps-sim.test.ts`

- [ ] **Step 1: The failing tests** — the new test files in full, and the rewritten ones as diffs (4 files)

Apply to `packages/engine/tests/ability-data.test.ts`:

```diff
@@ -6,9 +6,9 @@ const registry = createDefaultRegistry();
 const data = registry.getArpgData();
 
 describe('ability data', () => {
-  it('has 5 Primary, 4 Defensive and 3 Ultimate forms', () => {
+  it('has 6 Primary, 5 Defensive and 4 Ultimate forms (the constructs spec §2.2)', () => {
     const count = (slot: string) => data.forms.filter((f) => f.slot === slot).length;
-    expect([count('primary'), count('defensive'), count('ultimate')]).toEqual([5, 4, 3]);
+    expect([count('primary'), count('defensive'), count('ultimate')]).toEqual([6, 5, 4]);
   });
 
   it('has one fusion for every pair of the six elements, in either order', () => {

```

Apply to `packages/engine/tests/delve-chains.test.ts`:

```diff
@@ -275,6 +275,8 @@ describe('data: feel tables and default chains', () => {
       lance: [M, M, H],
       burst: [M, M, H],
       strike: [M, M, H, H],
+      // The constructs spec §2.2: a Whirl spins as a Lance strikes.
+      whirl: [M, M, H],
     };
     for (const form of registry.getArpgData().forms)
       expect(form.defaultChain, form.id).toEqual(want[form.id] ?? [M]);

```

Create `packages/engine/tests/delve-constructs-a-data.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ArpgDataSchema, DelveDataSchema, KnobsSchema } from '../src/data/schemas.js';
import arpgData from '../src/data/arpg.json';
import delveData from '../src/data/delve.json';
import { NEUTRAL, mergeKnobs } from '../src/arpg/abilities/resolve.js';
import { SLOT_FORMS } from '../src/delve/profile-schema.js';
import { stepWorld } from '../src/arpg/step.js';
import { fillCharge } from '../src/arpg/sandbox.js';
import type { FormId } from '../src/types/ability.js';
import type { WeaponClass } from '../src/types/ability.js';
import { STEP, arena, dummy, press, registry } from './fixtures/arena.js';

// See the constructs spec, §2 (forms and weapon classes), §2.3 (Detonate's knob) and §4.1 (the
// cast styles' data): in Phase A every class, style and new form is data the sim doesn't read.

const ok = (schema: { safeParse: (x: unknown) => { success: boolean } }, x: unknown) =>
  schema.safeParse(x).success;

describe('forms by class', () => {
  it('holds 15 forms, each with its class: the melee-only, the ranged-only and the shared', () => {
    const forms = registry.getArpgData().forms;
    expect(forms).toHaveLength(15);
    const byClass = (cls: string) => forms.filter((f) => f.class === cls).map((f) => f.id);
    expect(byClass('melee')).toEqual(['strike', 'whirl', 'armor', 'onslaught']);
    expect(byClass('ranged')).toEqual(['bolt', 'volley', 'repel', 'barrage']);
    expect(byClass('both')).toEqual(['lance', 'burst', 'ward', 'surge', 'blink', 'nova', 'maelstrom']);
  });

  it('the three new rows carry their first numbers and sit in their slots', () => {
    expect(registry.getForm('whirl')).toMatchObject({
      slot: 'primary',
      class: 'melee',
      defaultChain: ['medium', 'medium', 'heavy'],
      power: 1.1,
      radius: 2.4,
      duration: 1.5,
      tick: 0.5,
    });
    expect(registry.getForm('repel')).toMatchObject({
      slot: 'defensive',
      class: 'ranged',
      defaultChain: ['medium'],
      power: 0.6,
      effect: 0.5,
      radius: 3,
    });
    expect(registry.getForm('onslaught')).toMatchObject({
      slot: 'ultimate',
      class: 'melee',
      defaultChain: ['medium'],
      power: 1.2,
      range: 6,
      radius: 3,
      count: 5,
      duration: 1.2,
    });
    for (const slot of ['primary', 'defensive', 'ultimate'] as const)
      expect(SLOT_FORMS[slot].sort()).toEqual(
        registry
          .getArpgData()
          .forms.filter((f) => f.slot === slot)
          .map((f) => f.id)
          .sort(),
      );
  });

  it('the schema requires a class on every form and exactly 15 rows', () => {
    expect(ok(ArpgDataSchema, arpgData)).toBe(true);
    const forms = arpgData.forms.map((f, i) => (i === 0 ? { ...f, class: undefined } : f));
    expect(ok(ArpgDataSchema, { ...arpgData, forms })).toBe(false);
    expect(ok(ArpgDataSchema, { ...arpgData, forms: arpgData.forms.slice(0, 14) })).toBe(false);
    const hybrid = arpgData.forms.map((f, i) => (i === 0 ? { ...f, class: 'hybrid' } : f));
    expect(ok(ArpgDataSchema, { ...arpgData, forms: hybrid })).toBe(false);
  });
});

describe('weapon classes and cast styles (inert)', () => {
  const STYLES: Record<string, [WeaponClass, string, string]> = {
    dagger: ['melee', 'Quick', 'blade'],
    sword: ['melee', 'Balanced', 'crescent'],
    axe: ['melee', 'Sweeping', 'hatchet'],
    maul: ['melee', 'Heavy', 'stone'],
    staff: ['ranged', 'Channeled', 'orb'],
    wand: ['ranged', 'Seeking', 'spark'],
    bow: ['ranged', 'Marksman', 'arrow'],
  };

  it('every weapon base has its class and a style of every factor 1, no motion, no trait', () => {
    const weapons = registry.getGearBasesForSlot('weapon');
    expect(weapons.map((w) => w.id).sort()).toEqual(Object.keys(STYLES).sort());
    for (const w of weapons) {
      const [cls, name, look] = STYLES[w.id];
      expect(w.class, w.id).toBe(cls);
      expect(w.style, w.id).toEqual({
        name,
        numbers: { windup: 1, cooldown: 1, power: 1, range: 1, radius: 1, speed: 1, duration: 1 },
        motion: 'none',
        trait: {},
        look,
      });
    }
    for (const b of registry.getDelveData().bases)
      if (b.slot !== 'weapon') expect([b.class, b.style]).toEqual([undefined, undefined]);
  });

  it('the schema requires both on a weapon base and refuses them elsewhere', () => {
    expect(ok(DelveDataSchema, delveData)).toBe(true);
    const bases = delveData.bases;
    const sword = bases.findIndex((b) => b.id === 'sword');
    const helm = bases.findIndex((b) => b.slot !== 'weapon');
    const with_ = (i: number, patch: object) => ({
      ...delveData,
      bases: bases.map((b, j) => (j === i ? { ...b, ...patch } : b)),
    });
    expect(ok(DelveDataSchema, with_(sword, { class: undefined }))).toBe(false);
    expect(ok(DelveDataSchema, with_(sword, { style: undefined }))).toBe(false);
    expect(ok(DelveDataSchema, with_(sword, { class: 'magic' }))).toBe(false);
    expect(ok(DelveDataSchema, with_(helm, { class: 'melee' }))).toBe(false);
    expect(ok(DelveDataSchema, with_(helm, { style: bases[sword].style }))).toBe(false);
    const style = bases[sword].style!;
    expect(ok(DelveDataSchema, with_(sword, { style: { ...style, motion: 'leap' } }))).toBe(false);
    expect(ok(DelveDataSchema, with_(sword, { style: { ...style, look: 'fist' } }))).toBe(false);
    expect(ok(DelveDataSchema, with_(sword, { style: { ...style, trait: { haste: 1 } } }))).toBe(
      false,
    );
    expect(
      ok(DelveDataSchema, with_(sword, { style: { ...style, numbers: { ...style.numbers, power: 0 } } })),
    ).toBe(false);
  });
});

describe('the new knobs: detonate, critBonus, cleave, homing', () => {
  it('are neutral at 0, add on merge, and parse', () => {
    expect(NEUTRAL).toMatchObject({ detonate: 0, critBonus: 0, cleave: 0, homing: 0 });
    const k = mergeKnobs({ detonate: 0.25, critBonus: 0.15 }, { detonate: 0.3, cleave: 1, homing: 2 });
    expect(k).toMatchObject({ detonate: 0.55, critBonus: 0.15, cleave: 1, homing: 2 });
    expect(ok(KnobsSchema, { detonate: 0.25, critBonus: 0.15, cleave: 1, homing: 2 })).toBe(true);
    expect(ok(KnobsSchema, { detonate: -1 })).toBe(false);
    expect(ok(KnobsSchema, { critBonus: 2 })).toBe(false);
  });
});

describe('the runes fit the new forms as their kin', () => {
  it('whirl where strike, repel where ward, onslaught where nova', () => {
    for (const r of registry.getRunes()) {
      const f = r.fits.forms;
      expect(f.includes('whirl'), `${r.id} whirl`).toBe(f.includes('strike'));
      expect(f.includes('repel'), `${r.id} repel`).toBe(f.includes('ward'));
      expect(f.includes('onslaught'), `${r.id} onslaught`).toBe(f.includes('nova'));
    }
  });
});

describe('the placeholder behaviours (B1 replaces)', () => {
  const chainOf = (form: FormId, slot: 'primary' | 'defensive' | 'ultimate') =>
    ({
      [slot]: {
        moves: [{ kind: 'medium', form, elements: ['fire'] }],
        payment: slot === 'ultimate' ? 'charge' : 'mana',
      },
    }) as const;

  it('a Whirl plays as a Strike: a slash', () => {
    const w = arena([dummy(11.5, 10)], { chains: { ...chainOf('whirl', 'primary') } as never });
    const events = press(w, 0);
    expect(events.some((e) => e.kind === 'slash')).toBe(true);
  });

  it('a Repel plays as a Ward, an Onslaught as a Nova', () => {
    const w = arena([dummy(11.5, 10)], {
      chains: { ...chainOf('repel', 'defensive'), ...chainOf('onslaught', 'ultimate') } as never,
    });
    const buffs = press(w, 1).filter((e) => e.kind === 'buff');
    expect(buffs).toEqual([expect.objectContaining({ kind: 'buff', form: 'ward' })]);
    fillCharge(w);
    // The dummy beside the hero: a Nova's blast reaches it.
    Object.assign(w.monsters[0], { x: w.hero.x + 1.5, y: w.hero.y });
    const before = w.monsters[0].hp;
    press(w, 2);
    for (let i = 0; i < 30; i++) stepWorld(registry, w, { move: { x: 0, y: 0 } }, STEP);
    expect(w.monsters[0].hp).toBeLessThan(before);
  });
});

```

Apply to `packages/engine/tests/delve-dps-sim.test.ts`:

```diff
@@ -189,11 +189,11 @@ function windowDps(series: number[], from: number, to: number): number {
 }
 
 describe('dpsCombos', () => {
-  it('252 basic combos, 3,456 one-move chains and 864 default chains, each with its own key', () => {
+  it('252 basic combos, 4,320 one-move chains and 1,080 default chains, each with its own key', () => {
     expect(grid.filter((s) => s.view === 'basic')).toHaveLength(252);
     const abilities = grid.filter((s) => s.view === 'ability');
-    expect(abilities.filter((s) => s.dims.kind !== 'default')).toHaveLength(3456);
-    expect(abilities.filter((s) => s.dims.kind === 'default')).toHaveLength(864);
+    expect(abilities.filter((s) => s.dims.kind !== 'default')).toHaveLength(4320);
+    expect(abilities.filter((s) => s.dims.kind === 'default')).toHaveLength(1080);
     // Primary and Ultimate forms only.
     expect([...new Set(abilities.map((s) => s.dims.form))]).toEqual([
       'bolt',
@@ -201,7 +201,9 @@ describe('dpsCombos', () => {
       'lance',
       'burst',
       'strike',
+      'whirl',
       'nova',
+      'onslaught',
       'barrage',
       'maelstrom',
     ]);
@@ -384,9 +386,9 @@ describe('the rune view (see the runes spec)', () => {
   const socketed = runeRows.filter((s) => s.dims.rune !== 'none');
   const echo = [{ id: 'echo', tier: 3 }];
 
-  it('170 rune rows, each rune on every attack form and weapon it fits, and 30 baselines', () => {
-    expect(socketed).toHaveLength(170);
-    expect(runeRows.filter((s) => s.dims.rune === 'none')).toHaveLength(30);
+  it('192 rune rows, each rune on every attack form and weapon it fits, and 34 baselines', () => {
+    expect(socketed).toHaveLength(192);
+    expect(runeRows.filter((s) => s.dims.rune === 'none')).toHaveLength(34);
     expect(socketed.filter((s) => s.dims.rune === 'split').map((s) => s.dims.on)).toEqual([
       'bolt',
       'volley',

```

- [ ] **Step 2: Run them: red**

```bash
cd /c/Projects/alloy-constructs-a
(cd packages/engine && npx vitest run tests/delve-constructs-a-data.test.ts tests/ability-data.test.ts tests/delve-chains.test.ts tests/delve-dps-sim.test.ts --reporter=dot)
```

Expected: red. `delve-constructs-a-data.test.ts` fails to collect (`whirl` is no `FormId`, `KnobsSchema` has no `detonate`, the bases have no `class`), and the three updated files fail on their new literals (`ability-data`: the forms' count 12 → 15; `delve-chains`: no Whirl row; `delve-dps-sim`: 4,320 one-move chains, 1,080 defaults).

- [ ] **Step 3: The edits** (10 files, in this order)

Apply to `packages/engine/src/arpg/abilities/forms.ts`:

```diff
@@ -186,6 +186,8 @@ export function executeForm(ctx: SimCtx, ab: ResolvedAbility, aim: Vec | null):
       return done(p.x, p.y);
     }
 
+    // B1 replaces: in Phase A a Whirl plays as a Strike (the constructs spec §2.2).
+    case 'whirl':
     case 'strike': {
       h.facing = dir;
       // The last move of a chain slams all around.
@@ -225,6 +227,8 @@ export function executeForm(ctx: SimCtx, ab: ResolvedAbility, aim: Vec | null):
       return done(h.x + dir.x * reach, h.y + dir.y * reach);
     }
 
+    // B1 replaces: in Phase A a Repel plays as a Ward.
+    case 'repel':
     case 'ward':
       buff('ward', ab.duration);
       h.ward = { hp: h.stats.maxHp * ab.effect, max: h.stats.maxHp * ab.effect };
@@ -274,6 +278,8 @@ export function executeForm(ctx: SimCtx, ab: ResolvedAbility, aim: Vec | null):
       return done(h.x, h.y);
     }
 
+    // B1 replaces: in Phase A an Onslaught plays as a Nova.
+    case 'onslaught':
     case 'nova':
       impact(ctx, ab, h.x, h.y, ab.radius, hit, { noScatter: true, heft });
       return done(h.x, h.y);

```

Apply to `packages/engine/src/arpg/abilities/resolve.ts`:

```diff
@@ -48,6 +48,10 @@ export const NEUTRAL: Knobs = Object.freeze({
   manaOnHit: 0,
   guardOnLand: 0,
   stackTime: 0,
+  detonate: 0,
+  critBonus: 0,
+  cleave: 0,
+  homing: 0,
 });
 
 /**
@@ -55,7 +59,8 @@ export const NEUTRAL: Knobs = Object.freeze({
  * counts add (`pierce` true adds Infinity), flags OR, statuses union, a zone
  * takes the longer seconds and the larger tick power, `split` the larger count
  * with its power, `extraShots` adds counts and multiplies powers, `echo` the
- * largest, each part of `quick` multiplies, and `stackTime` adds.
+ * largest, each part of `quick` multiplies, and `stackTime`, `detonate`, `critBonus`, `cleave`
+ * and `homing` add.
  */
 export function mergeKnobs(...parts: KnobsData[]): Knobs {
   const k: Knobs = { ...NEUTRAL, applies: [], quick: { ...NEUTRAL.quick } };
@@ -100,6 +105,10 @@ export function mergeKnobs(...parts: KnobsData[]): Knobs {
     k.manaOnHit += p.manaOnHit ?? 0;
     k.guardOnLand += p.guardOnLand ?? 0;
     k.stackTime += p.stackTime ?? 0;
+    k.detonate += p.detonate ?? 0;
+    k.critBonus += p.critBonus ?? 0;
+    k.cleave += p.cleave ?? 0;
+    k.homing += p.homing ?? 0;
   }
   return k;
 }

```

Apply to `packages/engine/src/data/arpg.json`:

```diff
@@ -10,68 +10,84 @@
   "weakness": { "fire": "frost", "frost": "fire", "storm": "earth", "earth": "storm", "shadow": "storm", "nature": "fire" },
   "forms": [
     {
-      "id": "bolt", "slot": "primary", "name": "Bolt", "icon": "☄️",
+      "id": "bolt", "slot": "primary", "class": "ranged", "name": "Bolt", "icon": "☄️",
       "power": 1.45, "range": 9, "radius": 0.9, "speed": 13, "motion": -0.15,
       "defaultChain": ["light", "medium", "medium", "heavy"],
       "text": "A bolt that bursts on the first foe it hits. Each later move of a chain hits harder and bursts wider."
     },
     {
-      "id": "volley", "slot": "primary", "name": "Volley", "icon": "🎯",
+      "id": "volley", "slot": "primary", "class": "ranged", "name": "Volley", "icon": "🎯",
       "power": 0.6, "range": 9, "radius": 0.35, "speed": 11, "count": 3, "motion": -0.1,
       "defaultChain": ["medium", "medium", "medium"], "countByKind": { "light": 3, "medium": 3, "heavy": 5, "hold": 5 },
       "text": "Homing darts that seek out different foes: three, or five from a heavy move or a hold charged past its first stage."
     },
     {
-      "id": "lance", "slot": "primary", "name": "Lance", "icon": "🗡️",
+      "id": "lance", "slot": "primary", "class": "both", "name": "Lance", "icon": "🗡️",
       "power": 1.55, "range": 7.5, "radius": 0.55, "motion": -0.3,
       "defaultChain": ["medium", "medium", "heavy"],
       "text": "An instant line that hits every foe along it. Each later move of a chain reaches further and hits harder."
     },
     {
-      "id": "burst", "slot": "primary", "name": "Burst", "icon": "💥",
+      "id": "burst", "slot": "primary", "class": "both", "name": "Burst", "icon": "💥",
       "power": 1.7, "range": 8, "radius": 1.6, "motion": 0.2, "speed": 30,
       "defaultChain": ["medium", "medium", "heavy"],
       "text": "An explosion where you aim. Each later move of a chain is bigger."
     },
     {
-      "id": "strike", "slot": "primary", "name": "Strike", "icon": "⚔️",
+      "id": "strike", "slot": "primary", "class": "melee", "name": "Strike", "icon": "⚔️",
       "power": 1.4, "range": 2.4, "radius": 2.4, "arc": 150, "motion": 0.5,
       "defaultChain": ["medium", "medium", "heavy", "heavy"],
       "text": "An element-infused sweep in front of you. The last move of a chain slams everything around you."
     },
     {
-      "id": "ward", "slot": "defensive", "name": "Ward", "icon": "🛡️",
+      "id": "whirl", "slot": "primary", "class": "melee", "name": "Whirl", "icon": "🌀",
+      "power": 1.1, "radius": 2.4, "duration": 1.5, "tick": 0.5,
+      "defaultChain": ["medium", "medium", "heavy"],
+      "text": "A spin that hits everything around you for 1.5 s while you keep moving."
+    },
+    {
+      "id": "ward", "slot": "defensive", "class": "both", "name": "Ward", "icon": "🛡️",
       "power": 1.35, "effect": 0.25, "duration": 6, "radius": 2.6, "defaultChain": ["medium"],
       "text": "A bubble that absorbs 25% of your max life for 6 s, then bursts with its element."
     },
     {
-      "id": "armor", "slot": "defensive", "name": "Armor", "icon": "🦺",
+      "id": "repel", "slot": "defensive", "class": "ranged", "name": "Repel", "icon": "💢",
+      "power": 0.6, "effect": 0.5, "radius": 3, "defaultChain": ["medium"],
+      "text": "A pulse that knocks nearby foes back and slows them."
+    },
+    {
+      "id": "armor", "slot": "defensive", "class": "melee", "name": "Armor", "icon": "🦺",
       "power": 0.65, "effect": 0.35, "duration": 8, "defaultChain": ["medium"],
       "text": "Take 35% less damage for 8 s. Melee attackers take element damage and its status."
     },
     {
-      "id": "surge", "slot": "defensive", "name": "Surge", "icon": "⚡",
+      "id": "surge", "slot": "defensive", "class": "both", "name": "Surge", "icon": "⚡",
       "power": 0, "effect": 0.3, "duration": 6, "defaultChain": ["medium"],
       "text": "For 6 s: +30% attack speed, +20% move speed, and basic hits also apply the element's stacks."
     },
     {
-      "id": "blink", "slot": "defensive", "name": "Blink", "icon": "💨",
+      "id": "blink", "slot": "defensive", "class": "both", "name": "Blink", "icon": "💨",
       "power": 0.9, "effect": 0.4, "range": 5, "radius": 0.9, "defaultChain": ["medium"],
       "text": "Dash 5 units, untouchable for a moment, leaving a trail that hits foes."
     },
     {
-      "id": "nova", "slot": "ultimate", "name": "Nova", "icon": "✴️",
+      "id": "nova", "slot": "ultimate", "class": "both", "name": "Nova", "icon": "✴️",
       "power": 3.4, "radius": 5, "defaultChain": ["medium"],
       "text": "A huge blast all around you."
     },
     {
-      "id": "barrage", "slot": "ultimate", "name": "Barrage", "icon": "🌠",
+      "id": "onslaught", "slot": "ultimate", "class": "melee", "name": "Onslaught", "icon": "⚡",
+      "power": 1.2, "range": 6, "radius": 3, "count": 5, "duration": 1.2, "defaultChain": ["medium"],
+      "text": "Dart between foes in the target area, striking several times; untouchable while darting, then 30% less damage taken for 2 s."
+    },
+    {
+      "id": "barrage", "slot": "ultimate", "class": "ranged", "name": "Barrage", "icon": "🌠",
       "power": 1.55, "range": 9, "radius": 1.5, "count": 7, "duration": 1.2, "motion": 0.15,
       "defaultChain": ["medium"],
       "text": "Seven impacts rain over the target area."
     },
     {
-      "id": "maelstrom", "slot": "ultimate", "name": "Maelstrom", "icon": "🌪️",
+      "id": "maelstrom", "slot": "ultimate", "class": "both", "name": "Maelstrom", "icon": "🌪️",
       "power": 0.5, "range": 9, "radius": 3.5, "duration": 6, "tick": 0.5, "motion": 0.2,
       "defaultChain": ["medium"],
       "text": "A lingering storm at the target that hits everything inside for 6 s."

```

Apply to `packages/engine/src/data/delve.json`:

```diff
@@ -15,6 +15,14 @@
       "name": "Dagger",
       "attackInterval": 0.55,
       "tempo": 0.85,
+      "class": "melee",
+      "style": {
+        "name": "Quick",
+        "numbers": { "windup": 1, "cooldown": 1, "power": 1, "range": 1, "radius": 1, "speed": 1, "duration": 1 },
+        "motion": "none",
+        "trait": {},
+        "look": "blade"
+      },
       "attack": {
         "kind": "melee",
         "range": 1.6,
@@ -47,6 +55,14 @@
       "name": "Sword",
       "attackInterval": 0.8,
       "tempo": 1.0,
+      "class": "melee",
+      "style": {
+        "name": "Balanced",
+        "numbers": { "windup": 1, "cooldown": 1, "power": 1, "range": 1, "radius": 1, "speed": 1, "duration": 1 },
+        "motion": "none",
+        "trait": {},
+        "look": "crescent"
+      },
       "attack": {
         "kind": "melee",
         "range": 1.9,
@@ -74,6 +90,14 @@
       "name": "Axe",
       "attackInterval": 1.05,
       "tempo": 1.15,
+      "class": "melee",
+      "style": {
+        "name": "Sweeping",
+        "numbers": { "windup": 1, "cooldown": 1, "power": 1, "range": 1, "radius": 1, "speed": 1, "duration": 1 },
+        "motion": "none",
+        "trait": {},
+        "look": "hatchet"
+      },
       "attack": {
         "kind": "melee",
         "range": 2.0,
@@ -106,6 +130,14 @@
       "name": "Maul",
       "attackInterval": 1.4,
       "tempo": 1.3,
+      "class": "melee",
+      "style": {
+        "name": "Heavy",
+        "numbers": { "windup": 1, "cooldown": 1, "power": 1, "range": 1, "radius": 1, "speed": 1, "duration": 1 },
+        "motion": "none",
+        "trait": {},
+        "look": "stone"
+      },
       "attack": {
         "kind": "melee",
         "range": 2.3,
@@ -133,6 +165,14 @@
       "name": "Staff",
       "attackInterval": 0.9,
       "tempo": 1.05,
+      "class": "ranged",
+      "style": {
+        "name": "Channeled",
+        "numbers": { "windup": 1, "cooldown": 1, "power": 1, "range": 1, "radius": 1, "speed": 1, "duration": 1 },
+        "motion": "none",
+        "trait": {},
+        "look": "orb"
+      },
       "sway": "alternate",
       "attack": {
         "kind": "bolt",
@@ -166,6 +206,14 @@
       "name": "Wand",
       "attackInterval": 0.5,
       "tempo": 0.8,
+      "class": "ranged",
+      "style": {
+        "name": "Seeking",
+        "numbers": { "windup": 1, "cooldown": 1, "power": 1, "range": 1, "radius": 1, "speed": 1, "duration": 1 },
+        "motion": "none",
+        "trait": {},
+        "look": "spark"
+      },
       "sway": "orbit",
       "attack": {
         "kind": "bolt",
@@ -199,6 +247,14 @@
       "name": "Bow",
       "attackInterval": 0.75,
       "tempo": 0.95,
+      "class": "ranged",
+      "style": {
+        "name": "Marksman",
+        "numbers": { "windup": 1, "cooldown": 1, "power": 1, "range": 1, "radius": 1, "speed": 1, "duration": 1 },
+        "motion": "none",
+        "trait": {},
+        "look": "arrow"
+      },
       "attack": {
         "kind": "bolt",
         "range": 9.5,

```

Apply to `packages/engine/src/data/runes.json`:

```diff
@@ -62,8 +62,11 @@
         "lance",
         "burst",
         "strike",
+        "whirl",
         "ward",
+        "repel",
         "nova",
+        "onslaught",
         "barrage",
         "maelstrom"
       ],
@@ -80,7 +83,7 @@
     "icon": "⭕",
     "family": "shape",
     "fits": {
-      "forms": ["burst", "nova", "maelstrom", "strike", "ward"],
+      "forms": ["burst", "nova", "onslaught", "maelstrom", "strike", "whirl", "ward", "repel"],
       "weapons": ["dagger", "sword", "axe", "maul"]
     },
     "tiers": [
@@ -106,11 +109,14 @@
         "lance",
         "burst",
         "strike",
+        "whirl",
         "ward",
+        "repel",
         "armor",
         "surge",
         "blink",
         "nova",
+        "onslaught",
         "barrage",
         "maelstrom"
       ],
@@ -133,7 +139,7 @@
     "icon": "🔁",
     "family": "tempo",
     "fits": {
-      "forms": ["bolt", "volley", "lance", "burst", "strike", "nova", "barrage", "maelstrom"],
+      "forms": ["bolt", "volley", "lance", "burst", "strike", "whirl", "nova", "onslaught", "barrage", "maelstrom"],
       "weapons": ["dagger", "sword", "axe", "maul", "staff", "wand", "bow"]
     },
     "tiers": [
@@ -153,7 +159,7 @@
     "icon": "🔨",
     "family": "tempo",
     "fits": {
-      "forms": ["bolt", "volley", "lance", "burst", "strike", "nova", "barrage", "maelstrom"],
+      "forms": ["bolt", "volley", "lance", "burst", "strike", "whirl", "nova", "onslaught", "barrage", "maelstrom"],
       "weapons": ["dagger", "sword", "axe", "maul", "staff", "wand", "bow"]
     },
     "tiers": [
@@ -179,9 +185,12 @@
         "lance",
         "burst",
         "strike",
+        "whirl",
         "ward",
+        "repel",
         "blink",
         "nova",
+        "onslaught",
         "barrage",
         "maelstrom"
       ],
@@ -204,7 +213,7 @@
     "icon": "☁️",
     "family": "elemental",
     "fits": {
-      "forms": ["bolt", "lance", "burst", "strike", "nova"],
+      "forms": ["bolt", "lance", "burst", "strike", "whirl", "nova", "onslaught"],
       "weapons": ["dagger", "sword", "axe", "maul", "staff", "wand", "bow"],
       "kinds": ["heavy", "hold"]
     },
@@ -231,10 +240,13 @@
         "lance",
         "burst",
         "strike",
+        "whirl",
         "ward",
+        "repel",
         "armor",
         "blink",
         "nova",
+        "onslaught",
         "barrage",
         "maelstrom"
       ],
@@ -263,10 +275,13 @@
         "lance",
         "burst",
         "strike",
+        "whirl",
         "ward",
+        "repel",
         "armor",
         "blink",
         "nova",
+        "onslaught",
         "barrage",
         "maelstrom"
       ],
@@ -295,10 +310,13 @@
         "lance",
         "burst",
         "strike",
+        "whirl",
         "ward",
+        "repel",
         "armor",
         "blink",
         "nova",
+        "onslaught",
         "barrage",
         "maelstrom"
       ],
@@ -327,11 +345,14 @@
         "lance",
         "burst",
         "strike",
+        "whirl",
         "ward",
+        "repel",
         "armor",
         "surge",
         "blink",
         "nova",
+        "onslaught",
         "barrage",
         "maelstrom"
       ],

```

Apply to `packages/engine/src/data/schemas.ts`:

```diff
@@ -186,6 +186,29 @@ export const DelveDataSchema = z.object({
         defaultChain: z.array(MoveKindSchema).min(1).max(MAX_CHAIN).optional(),
         tempo: z.number().positive().optional(),
         sway: z.enum(['alternate', 'orbit']).optional(),
+        // Weapons only (every weapon has both): its class and its cast style (the constructs spec §2.1, §4.1).
+        class: z.enum(['melee', 'ranged']).optional(),
+        style: z
+          .object({
+            name: z.string().min(1),
+            numbers: z
+              .object({
+                windup: z.number().positive(),
+                cooldown: z.number().positive(),
+                power: z.number().positive(),
+                range: z.number().positive(),
+                radius: z.number().positive(),
+                speed: z.number().positive(),
+                duration: z.number().positive(),
+              })
+              .strict(),
+            motion: z.enum(['none', 'dart', 'step', 'wade', 'plant', 'sway', 'orbit', 'back']),
+            // `KnobsSchema` is declared below: lazy, so the file keeps its order.
+            trait: z.lazy(() => KnobsSchema),
+            look: z.enum(['blade', 'crescent', 'hatchet', 'stone', 'orb', 'spark', 'arrow']),
+          })
+          .strict()
+          .optional(),
         weight: z.number().positive(),
         implicits: z.array(
           z.object({
@@ -205,6 +228,13 @@ export const DelveDataSchema = z.object({
             path: [i, 'tempo'],
             message: `${b.id}: ${b.slot === 'weapon' ? 'a weapon base needs a tempo' : 'only a weapon base has a tempo'}`,
           });
+        for (const key of ['class', 'style'] as const)
+          if ((b.slot === 'weapon') !== (b[key] !== undefined))
+            ctx.addIssue({
+              code: z.ZodIssueCode.custom,
+              path: [i, key],
+              message: `${b.id}: ${b.slot === 'weapon' ? `a weapon base needs a ${key}` : `only a weapon base has a ${key}`}`,
+            });
       }),
     ),
   affixes: z
@@ -757,6 +787,11 @@ export const KnobsSchema = z
     manaOnHit: z.number().min(0),
     guardOnLand: z.number().min(0),
     stackTime: z.number().min(0),
+    // The constructs spec: Detonate's blast power (§2.3), and the cast styles' traits (§4.2).
+    detonate: z.number().min(0),
+    critBonus: z.number().min(0).max(1),
+    cleave: z.number().min(0),
+    homing: z.number().min(0),
   })
   .partial()
   .strict();
@@ -969,15 +1004,31 @@ export const ArpgDataSchema = z.object({
           'lance',
           'burst',
           'strike',
+          'whirl',
           'ward',
           'armor',
           'surge',
           'blink',
+          'repel',
           'nova',
           'barrage',
           'maelstrom',
+          'onslaught',
         ]),
         slot: z.enum(['primary', 'defensive', 'ultimate']),
+        // The weapon class that expresses it, or both (the constructs spec §2.1).
+        class: z.enum(['melee', 'ranged', 'both']),
+        // A shared form's melee version: what differs when a melee weapon casts it (B1 fills the rows).
+        melee: z
+          .object({
+            range: z.number().positive().optional(),
+            radius: z.number().positive().optional(),
+            motion: z.number().optional(),
+            speed: z.number().positive().optional(),
+            text: z.string().optional(),
+          })
+          .strict()
+          .optional(),
         name: z.string(),
         icon: z.string(),
         text: z.string(),
@@ -995,7 +1046,7 @@ export const ArpgDataSchema = z.object({
         countByKind: perKind(z.number().int().positive()).optional(),
       }),
     )
-    .length(12),
+    .length(15),
   elementTraits: perMana(z.object({ knobs: KnobsSchema, text: z.string(), defensive: z.string() })),
   fusions: z
     .array(

```

Apply to `packages/engine/src/delve/profile-schema.ts`:

```diff
@@ -17,9 +17,9 @@ import { MAX_SOCKETS, RUNE_TIERS } from '../types/rune.js';
 
 /** Each ability slot's forms (`arpg.json`'s, which a test holds this to). */
 export const SLOT_FORMS: Record<AbilitySlot, readonly FormId[]> = {
-  primary: ['bolt', 'volley', 'lance', 'burst', 'strike'],
-  defensive: ['ward', 'armor', 'surge', 'blink'],
-  ultimate: ['nova', 'barrage', 'maelstrom'],
+  primary: ['bolt', 'volley', 'lance', 'burst', 'strike', 'whirl'],
+  defensive: ['ward', 'repel', 'armor', 'surge', 'blink'],
+  ultimate: ['nova', 'onslaught', 'barrage', 'maelstrom'],
 };
 
 const FormIdSchema = z.enum([
@@ -28,13 +28,16 @@ const FormIdSchema = z.enum([
   'lance',
   'burst',
   'strike',
+  'whirl',
   'ward',
   'armor',
   'surge',
   'blink',
+  'repel',
   'nova',
   'barrage',
   'maelstrom',
+  'onslaught',
 ]);
 
 /** One element, or two different ones (a fusion). */

```

Apply to `packages/engine/src/types/ability.ts`:

```diff
@@ -14,19 +14,27 @@ export type AbilitySlot = 'primary' | 'defensive' | 'ultimate';
 
 export const ABILITY_SLOTS: readonly AbilitySlot[] = ['primary', 'defensive', 'ultimate'] as const;
 
+/** A weapon's class (see the constructs spec §2.1): which forms it can express. */
+export type WeaponClass = 'melee' | 'ranged';
+/** A form's class: one weapon class, or both. */
+export type FormClass = WeaponClass | 'both';
+
 export type FormId =
   | 'bolt'
   | 'volley'
   | 'lance'
   | 'burst'
   | 'strike'
+  | 'whirl'
   | 'ward'
   | 'armor'
   | 'surge'
   | 'blink'
+  | 'repel'
   | 'nova'
   | 'barrage'
-  | 'maelstrom';
+  | 'maelstrom'
+  | 'onslaught';
 
 /** Swift, Quick, Balanced, Heavy, Crushing: the per-weight tables' index − 2 (a version 4 build's weight). */
 export type AbilityWeight = -2 | -1 | 0 | 1 | 2;
@@ -43,8 +51,13 @@ export const MOVE_KINDS: readonly MoveKind[] = ['light', 'medium', 'heavy', 'hol
 /** The kinds whose numbers a hold's three stages take (Volley's darts, a basic hold's rows). */
 export const HOLD_STAGE_KINDS: readonly MoveKind[] = ['medium', 'heavy', 'hold'] as const;
 
-/** One move of an ability chain: its kind, a form of the chain's slot, and one or two elements. */
+/**
+ * One move of an ability chain: its kind, a form of the chain's slot, and one or two elements.
+ * A construct (the constructs spec §3.1) once it has a `uid`.
+ */
 export interface Move {
+  /** Its construct id, `c<n>` from `profile.nextUid`; absent in a world drop and in the sandbox. */
+  uid?: string;
   kind: MoveKind;
   form: FormId;
   /** One element, or two distinct elements (a fusion). */
@@ -53,7 +66,10 @@ export interface Move {
   runes?: (RuneRef | null)[];
 }
 
-/** An ability slot's chain: each press casts its next move; one payment for every move. */
+/**
+ * An ability slot's chain: each press casts its next move; one payment for every move. It holds
+ * 0 to its slots' moves (an empty chain plays as an uncarried skill: the constructs spec §3.1).
+ */
 export interface Chain {
   moves: Move[];
   payment: AbilityPayment;
@@ -61,12 +77,17 @@ export interface Chain {
 
 /** One blow of the basic chain: the weapon's row for its kind, in its element. */
 export interface Blow {
+  /** Its construct id, as a move's. */
+  uid?: string;
   kind: MoveKind;
   element: ManaType;
   /** Its open sockets, as a move's. */
   runes?: (RuneRef | null)[];
 }
 
+/** A move or a blow: what the bag holds and a slot takes (the constructs spec §3.1). */
+export type Construct = Move | Blow;
+
 /** A skill that holds a chain: the basic attack or an ability slot. */
 export type ChainSkill = 'basic' | AbilitySlot;
 
@@ -153,6 +174,14 @@ export interface Knobs {
   guardOnLand: number;
   /** Stack duration × (1 + this), where a hit's stacks are applied (a boon's; see the boons spec). */
   stackTime: number;
+  /** Detonate (the constructs spec §2.3): each contact hit sets off a blast of this power around the foe (0: none). */
+  detonate: number;
+  /** A cast style's trait: crit chance added to the move's hits, 0–1 (the dagger's). Not the hero stat `critChance`. */
+  critBonus: number;
+  /** A cast style's trait: a single-target hit cleaves a small arc behind its first foe (the axe's; 0: none). */
+  cleave: number;
+  /** A cast style's trait: shots home toward foes, radians a second (the wand's; 0: none). */
+  homing: number;
 }
 
 /** Knobs as data sets them (elements, fusions, runes): partial, `pierce` true for all. */

```

## Chunk 3: Task 1 — Weapon classes, cast styles and three forms as inert data; the Detonate and trait knobs (continued)

Apply to `packages/engine/src/types/arpg.ts`:

```diff
@@ -12,6 +12,7 @@ import type { TutorialScript } from './tutorial-floor.js';
 import type {
   AbilityCast,
   AbilitySlot,
+  FormClass,
   FormId,
   Knobs,
   KnobsData,
@@ -55,6 +56,10 @@ export type ReactionId =
 export interface FormDef {
   id: FormId;
   slot: AbilitySlot;
+  /** The weapon class that expresses it, or both (the constructs spec §2.1). */
+  class: FormClass;
+  /** A shared form's melee version (spec §2.2): what differs when a melee weapon casts it. B1 fills the rows. */
+  melee?: { range?: number; radius?: number; motion?: number; speed?: number; text?: string };
   name: string;
   icon: string;
   text: string;
@@ -81,6 +86,31 @@ export interface FormDef {
   motion?: number;
 }
 
+/** A cast style's numbers: factors on the form's base (1 = unchanged). */
+export interface StyleNumbers {
+  windup: number;
+  cooldown: number;
+  power: number;
+  range: number;
+  radius: number;
+  speed: number;
+  duration: number;
+}
+/** How a cast style moves the hero as it casts (the weapon flow's pushes; B1 wires them). */
+export type StyleMotion = 'none' | 'dart' | 'step' | 'wade' | 'plant' | 'sway' | 'orbit' | 'back';
+/** A cast style's motif, client-only: drawn on its casts' shots and impacts (the constructs spec §4.2). */
+export type StyleLook = 'blade' | 'crescent' | 'hatchet' | 'stone' | 'orb' | 'spark' | 'arrow';
+
+/** A weapon's cast style (the constructs spec §4): how it expresses every ability form. */
+export interface CastStyle {
+  name: string;
+  numbers: StyleNumbers;
+  motion: StyleMotion;
+  /** Merged first, like a built-in rune that costs nothing. */
+  trait: KnobsData;
+  look: StyleLook;
+}
+
 /** What an element adds to any ability built with it. */
 export interface ElementTraitDef {
   knobs: KnobsData;

```

Apply to `packages/engine/src/types/delve.ts`:

```diff
@@ -1,8 +1,16 @@
 import type { EquippedGear, GearItem, GearSlot, HeroStatKey, Rarity } from './gear.js';
 import type { ManaMap, ManaType } from './mana.js';
-import type { AbilitySlot, ChainSkill, FormId, Knobs, KnobsData, MoveKind } from './ability.js';
+import type {
+  AbilitySlot,
+  ChainSkill,
+  FormId,
+  Knobs,
+  KnobsData,
+  MoveKind,
+  WeaponClass,
+} from './ability.js';
 import type { RunePouch, RuneRef, UnsocketMode } from './rune.js';
-import type { MonsterKind } from './arpg.js';
+import type { CastStyle, MonsterKind } from './arpg.js';
 import type { CraftingBalance, DropsBalance, Haul, MaterialsPouch } from './crafting.js';
 import type { ProfileQuests, QuestsBalance } from './quests.js';
 import type { AiBalance, LayoutBalance, LayoutsData, TerrainBalance } from './floor-map.js';
@@ -91,6 +99,10 @@ export interface GearBaseDef {
   tempo?: number;
   /** Weapons only: the side a blow's side step takes when the steering doesn't pick one (default `alternate`). */
   sway?: WeaponSway;
+  /** Weapons only (every weapon has one): its class, which forms it can express (the constructs spec §2.1). */
+  class?: WeaponClass;
+  /** Weapons only (every weapon has one): its cast style (the constructs spec §4). */
+  style?: CastStyle;
   weight: number;
   implicits: ImplicitTemplate[];
 }

```

- [ ] **Step 4: Typecheck and run them: green**

```bash
cd /c/Projects/alloy-constructs-a
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-constructs-a-data.test.ts tests/ability-data.test.ts tests/delve-chains.test.ts tests/delve-dps-sim.test.ts --reporter=dot)
```

Expected: no type errors; **Test Files 4 passed (4)**; `delve-constructs-a-data.test.ts` 9 passed. Known red between this commit and Task 2's: `ability-resolve.test.ts > mergeKnobs > defaults to neutral knobs` (its neutral literal gains the four knobs in Task 2's diff, as on the scratch copy).

- [ ] **Step 5: The fingerprint**

```bash
cd /c/Projects/alloy-constructs-a
P=C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/1d6bb288-c64f-43d2-9587-234f3b95983f/scratchpad
cp $P/constructs-a-probe.test.ts packages/engine/tests/zz-probe.test.ts
(cd packages/engine && PROBE_OUT=$P/constructs-a-task1.json npx vitest run tests/zz-probe.test.ts --reporter=dot)
rm packages/engine/tests/zz-probe.test.ts
node $P/cmp.cjs $P/constructs-a-before.json $P/constructs-a-task1.json
```

Expected: `Tests 1 passed`, then `FINGERPRINT_SAME` (byte for byte the Base section's `constructs-a-before.json`).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-constructs-a
git add packages/engine
git commit -q -F - <<'EOF'
feat(engine): weapon classes, cast styles and three forms as inert data; the Detonate and trait knobs

A `class` on every form and weapon base, the melee overrides block, an inert
`style` row on every base (every factor 1, no motion, no trait, a look); Whirl,
Repel and Onslaught as rows dispatched to Strike's, Ward's and Nova's
behaviours (B1 replaces); the runes' fits grown to the kin forms; the
detonate, critBonus, cleave and homing knobs, neutral, merged and parsed, read
by nothing. Move.uid, Blow.uid and Construct as types.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git log --oneline -1
```

## Chunk 4: Task 2 — The cast style pipeline wired inert, the weapon's class and style on HeroWeapon, the cast event's look, the signature hook

### Task 2: The cast style pipeline wired inert, the weapon's class and style on HeroWeapon, the cast event's look, the signature hook

`applyStyle(form, cls, style)` in `resolve.ts`: a melee weapon takes the form's `melee` overrides, then the style's numbers scale power, range, radius, speed and duration (every factor 1 in A: the same numbers come back); `resolveAbility` runs every form through it, merges the style's `trait` among its knob partials and carries the style's `look` on `ResolvedAbility.look`, which `castAbility` puts on the `cast` event (`look?` is on the `hit`, `cast`, `beam`, `slash`, `explode` and `dash` events for B1 and C2); `computeHeroStats` sets `HeroWeapon.class` and `style` (unarmed: null); `arpg/abilities/signatures.ts` holds the empty `SIGNATURES` map, `signatureFor(baseId, form)` and `withSignature` (a test binds and restores one), and `forms.ts` asks it before its switch. The fingerprint is identical.

**Files:**
- Modify: `packages/engine/src/arpg/abilities/cast.ts`
- Modify: `packages/engine/src/arpg/abilities/forms.ts`
- Modify: `packages/engine/src/arpg/abilities/resolve.ts`
- Create: `packages/engine/src/arpg/abilities/signatures.ts`
- Modify: `packages/engine/src/delve/hero-stats.ts`
- Modify: `packages/engine/src/types/ability.ts`
- Modify: `packages/engine/src/types/arpg.ts`
- Modify: `packages/engine/src/types/delve.ts`
- Modify: `packages/engine/tests/ability-resolve.test.ts`
- Create: `packages/engine/tests/delve-constructs-a-style.test.ts`

- [ ] **Step 1: The failing tests** — the new test files in full, and the rewritten ones as diffs (2 files)

Apply to `packages/engine/tests/ability-resolve.test.ts`:

```diff
@@ -229,6 +229,10 @@ describe('mergeKnobs', () => {
       manaOnHit: 0,
       guardOnLand: 0,
       stackTime: 0,
+      detonate: 0,
+      critBonus: 0,
+      cleave: 0,
+      homing: 0,
     });
   });
 });

```

Create `packages/engine/tests/delve-constructs-a-style.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyStyle, resolveAbility } from '../src/arpg/abilities/resolve.js';
import { executeForm } from '../src/arpg/abilities/forms.js';
import { SIGNATURES, signatureFor, withSignature } from '../src/arpg/abilities/signatures.js';
import { makeCtx } from '../src/arpg/combat.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { Move } from '../src/types/ability.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import type { CastStyle } from '../src/types/arpg.js';
import { arena, dummy, gear, press, registry } from './fixtures/arena.js';

// See the constructs spec §4.2 (how a style applies) and §4.3 (the signature hook): in Phase A
// the pipeline is wired and inert (every factor 1, every trait empty) and the table is empty.

const bolt: Move = { kind: 'medium', form: 'bolt', elements: ['fire'] };
const stats = (baseId: string | null) =>
  computeHeroStats(
    baseId ? { weapon: { ...gear('fire'), baseId }, chest: gear('earth', 'chest') } : {},
    registry,
  );

describe('applyStyle', () => {
  it('with every factor 1 and no melee block, every form on every weapon comes back as it is', () => {
    for (const base of registry.getGearBasesForSlot('weapon'))
      for (const form of registry.getArpgData().forms)
        expect(applyStyle(form, base.class!, base.style!), `${base.id} ${form.id}`).toEqual(form);
    expect(applyStyle(registry.getForm('bolt'), null, null)).toEqual(registry.getForm('bolt'));
  });

  it("scales the form's base by the style's numbers, after a melee weapon takes the melee block", () => {
    const style: CastStyle = {
      name: 'Heavy',
      numbers: { windup: 1.3, cooldown: 1.15, power: 1.25, range: 1, radius: 1.15, speed: 0.8, duration: 1 },
      motion: 'plant',
      trait: {},
      look: 'stone',
    };
    const lance = { ...registry.getForm('lance'), melee: { range: 5, motion: 0.8 } };
    const ranged = applyStyle(lance, 'ranged', style);
    expect([ranged.range, ranged.motion, ranged.power, ranged.radius]).toEqual([
      7.5,
      -0.3,
      1.55 * 1.25,
      0.55 * 1.15,
    ]);
    const melee = applyStyle(lance, 'melee', style);
    expect([melee.range, melee.motion, melee.power]).toEqual([5, 0.8, 1.55 * 1.25]);
    const bow = applyStyle(registry.getForm('bolt'), 'ranged', style);
    expect([bow.speed, bow.duration]).toEqual([13 * 0.8, undefined]);
    const ward = applyStyle(registry.getForm('ward'), 'ranged', style);
    expect([ward.duration, ward.radius]).toEqual([6, 2.6 * 1.15]);
  });
});

describe('the style pipeline in resolveAbility (inert in A)', () => {
  it('resolves a shared form to the same numbers on a sword and a staff, and names the look', () => {
    const sword = resolveAbility(registry, 'primary', bolt, 'mana', stats('sword'));
    const staff = resolveAbility(registry, 'primary', bolt, 'mana', stats('staff'));
    const { look: _s, ...a } = sword;
    const { look: _t, ...b } = staff;
    expect(a).toEqual(b);
    expect([sword.look, staff.look]).toEqual(['crescent', 'orb']);
    expect(resolveAbility(registry, 'primary', bolt, 'mana', stats(null)).look).toBeNull();
  });

  it('computeHeroStats carries the weapon class and style; unarmed neither', () => {
    const bow = stats('bow').weapon;
    expect(bow.class).toBe('ranged');
    expect(bow.style).toEqual(registry.getGearBase('bow').style);
    const bare = stats(null).weapon;
    expect([bare.class, bare.style]).toEqual([null, null]);
  });

  it("a cast event carries the casting weapon's look", () => {
    const w = arena([dummy(14, 10)]);
    const cast = press(w, 0).find((e): e is Extract<ArpgEvent, { kind: 'cast' }> => e.kind === 'cast');
    expect(cast?.look).toBe('crescent');
  });
});

describe('the signature hook', () => {
  it('ships empty, and a bound entry replaces the form behaviour until restored', () => {
    expect(Object.keys(SIGNATURES)).toEqual([]);
    expect(signatureFor('sword', 'bolt')).toBeUndefined();
    expect(signatureFor(null, 'bolt')).toBeUndefined();
    const w = arena([dummy(14, 10)]);
    const ab = resolveAbility(registry, 'primary', bolt, 'mana', w.hero.stats);
    const events: ArpgEvent[] = [];
    const ctx = makeCtx(registry, w, events);
    const seen: string[] = [];
    const res = withSignature('sword:bolt', (c, a, aim) => {
      seen.push(`${a.form.id}@${c.world.hero.stats.weapon.baseId}:${aim ? 'aimed' : 'auto'}`);
      return { ok: true, tx: 1, ty: 2 };
    }, () => {
      expect(signatureFor('sword', 'bolt')).toBeDefined();
      expect(signatureFor('bow', 'bolt')).toBeUndefined();
      return executeForm(ctx, ab, null);
    });
    expect(res).toEqual({ ok: true, tx: 1, ty: 2 });
    expect(seen).toEqual(['bolt@sword:auto']);
    expect(w.projectiles).toHaveLength(0);
    expect(signatureFor('sword', 'bolt')).toBeUndefined();
    expect(Object.keys(SIGNATURES)).toEqual([]);
    // Without it, a Bolt spawns its shot.
    executeForm(ctx, ab, null);
    expect(w.projectiles).toHaveLength(1);
  });
});

```

- [ ] **Step 2: Run them: red**

```bash
cd /c/Projects/alloy-constructs-a
(cd packages/engine && npx vitest run tests/delve-constructs-a-style.test.ts --reporter=dot)
```

Expected: red: the file fails to collect (`applyStyle`, `signatureFor` and `withSignature` don't exist; `HeroWeapon` has no `class`).

- [ ] **Step 3: The edits** (8 files, in this order)

Apply to `packages/engine/src/arpg/abilities/cast.ts`:

```diff
@@ -164,6 +164,7 @@ function fire(
     tx: res.tx,
     ty: res.ty,
     heft: stepHeft(ab),
+    ...(ab.look && { look: ab.look }),
   });
   if (ab.motion < 0) {
     const d = dirTo(h.x, h.y, res.tx, res.ty);

```

Apply to `packages/engine/src/arpg/abilities/forms.ts`:

```diff
@@ -8,6 +8,7 @@ import { stepBonus, stepHeft } from './resolve.js';
 import { aimPoint, alive, muzzle, SHOT, spawnProjectile } from './targeting.js';
 import { hitObject, objectsIn, objectsOnBeam } from '../objects.js';
 import { hitStructures } from '../terrain.js';
+import { signatureFor } from './signatures.js';
 
 export interface FormResult {
   ok: boolean;
@@ -22,11 +23,14 @@ function rotate(d: Vec, a: number): Vec {
 /**
  * Carry out a move's form. A move after a chain's first lands with its step
  * bonus: harder, and a Bolt, a Lance or a Burst bigger. Fails (nothing
- * happens) when there is nothing to aim at.
+ * happens) when there is nothing to aim at. A signature the weapon has for the
+ * form (`signatureFor`, the constructs spec §4.3) replaces the form's behaviour.
  */
 export function executeForm(ctx: SimCtx, ab: ResolvedAbility, aim: Vec | null): FormResult {
   const { world } = ctx;
   const h = world.hero;
+  const signature = signatureFor(h.stats.weapon.baseId, ab.form.id);
+  if (signature) return signature(ctx, ab, aim);
   const t = world.t;
   const p = aimPoint(ctx, ab, aim);
   if (!p) return { ok: false, tx: h.x, ty: h.y };

```

Apply to `packages/engine/src/arpg/abilities/resolve.ts`:

```diff
@@ -12,8 +12,10 @@ import {
   type MoveKind,
   type ResolvedAbility,
   type ResolvedChain,
+  type WeaponClass,
 } from '../../types/ability.js';
 import type { ManaType } from '../../types/mana.js';
+import type { CastStyle, FormDef } from '../../types/arpg.js';
 import { DEFAULT_FORMS, weaponString } from '../../loot/moveset.js';
 import { extraShotPower, loadEase, runeFits, runeKnobs, runeLoad } from '../../loot/runes.js';
 import type { RuneRef } from '../../types/rune.js';
@@ -113,6 +115,35 @@ export function mergeKnobs(...parts: KnobsData[]): Knobs {
   return k;
 }
 
+/**
+ * A form as a weapon's cast style expresses it (the constructs spec §4.2): a
+ * melee weapon takes the form's `melee` overrides first, then the style's
+ * numbers scale the wind-up (B1 wires it), cooldown (B1), power, range, radius,
+ * speed and duration. With every factor 1 and no `melee` block (or no style:
+ * unarmed) the form comes back as it is.
+ */
+export function applyStyle(
+  form: FormDef,
+  cls: WeaponClass | null,
+  style: CastStyle | null,
+): FormDef {
+  const base = cls === 'melee' && form.melee ? { ...form, ...formOverrides(form.melee) } : form;
+  if (!style) return base;
+  const n = style.numbers;
+  const scaled = { ...base, power: base.power * n.power };
+  if (base.range !== undefined) scaled.range = base.range * n.range;
+  if (base.radius !== undefined) scaled.radius = base.radius * n.radius;
+  if (base.speed !== undefined) scaled.speed = base.speed * n.speed;
+  if (base.duration !== undefined) scaled.duration = base.duration * n.duration;
+  return scaled;
+}
+
+/** A `melee` block's numbers, its text left out (the text is the client's). */
+function formOverrides(melee: NonNullable<FormDef['melee']>): Partial<FormDef> {
+  const { text: _text, ...numbers } = melee;
+  return numbers;
+}
+
 /** The weight a move resolves at: its kind's (`chains.kindWeight`), a hold's by its stage. */
 export function moveWeight(bal: DelveBalance, kind: Move['kind'], stage = 0): number {
   const c = bal.chains;
@@ -135,7 +166,10 @@ export function resolveAbility(
   const data = registry.getArpgData();
   const bal = registry.getDelveBalance();
   const ab = bal.abilities;
-  const form = registry.getForm(move.form);
+  // The form as the weapon's cast style expresses it: the form's base, the melee block, the
+  // style's numbers (the constructs spec §4.2). In Phase A every style is inert.
+  const style = stats.weapon.style ?? null;
+  const form = applyStyle(registry.getForm(move.form), stats.weapon.class ?? null, style);
   if (form.slot !== slot) throw new Error(`${form.name} is not a ${slot} form`);
   const [element, second] = move.elements;
   const fusion =
@@ -150,8 +184,10 @@ export function resolveAbility(
   if (L.rimeheart && move.form === 'nova' && move.elements.includes('frost')) {
     legendary.push({ zone: { seconds: 3, tickPower: 0.15 } });
   }
-  // A dive's boons' knobs merge beside the legendaries' (see the boons spec's 2a).
+  // The style's trait merges first, like a built-in rune that costs nothing; a dive's boons'
+  // knobs merge beside the legendaries' (see the boons spec's 2a).
   const own = [
+    style?.trait ?? {},
     ...move.elements.map((e) => data.elementTraits[e].knobs),
     fusion?.knobs ?? {},
     ...legendary,
@@ -208,6 +244,7 @@ export function resolveAbility(
     index: 0,
     last: false,
     form,
+    look: style?.look ?? null,
     name: `${fusion ? fusion.name : data.mana[element].name} ${form.name}`,
     icon: form.icon,
     element,

```

Create `packages/engine/src/arpg/abilities/signatures.ts`:

```ts
import type { FormId, ResolvedAbility } from '../../types/ability.js';
import type { Vec } from '../../types/arpg.js';
import type { SimCtx } from '../combat.js';
import type { FormResult } from './forms.js';

/**
 * The signature hook (see the constructs spec §4.3): a table keyed by weapon
 * base and form (`'maul:blink'`) naming a behaviour `executeForm` dispatches to
 * in place of the form's own. It ships empty; the signature phases fill it.
 */

export type SignatureKey = `${string}:${FormId}`;
export type SignatureBehaviour = (ctx: SimCtx, ab: ResolvedAbility, aim: Vec | null) => FormResult;

/** Every signature, by `<baseId>:<form>`. Empty as shipped. */
export const SIGNATURES: Partial<Record<SignatureKey, SignatureBehaviour>> = {};

/** The signature a weapon of `baseId` has for `form`, or undefined (unarmed never has one). */
export function signatureFor(baseId: string | null, form: FormId): SignatureBehaviour | undefined {
  return baseId === null ? undefined : SIGNATURES[`${baseId}:${form}`];
}

/** Test only: run `fn` with `key` bound to `behaviour`, restored after (bound or not). */
export function withSignature<T>(key: SignatureKey, behaviour: SignatureBehaviour, fn: () => T): T {
  const had = Object.prototype.hasOwnProperty.call(SIGNATURES, key);
  const before = SIGNATURES[key];
  SIGNATURES[key] = behaviour;
  try {
    return fn();
  } finally {
    if (had) SIGNATURES[key] = before;
    else delete SIGNATURES[key];
  }
}

```

Apply to `packages/engine/src/delve/hero-stats.ts`:

```diff
@@ -208,6 +208,8 @@ export function computeHeroStats(
   const weapon: HeroWeapon = armed?.attack
     ? {
         baseId: armed.id,
+        class: armed.class ?? null,
+        style: armed.style ?? null,
         kind: armed.attack.kind,
         range: armed.attack.range,
         arc: armed.attack.arc ?? 90,
@@ -219,6 +221,8 @@ export function computeHeroStats(
       }
     : {
         baseId: null,
+        class: null,
+        style: null,
         kind: 'melee',
         range: 1.4,
         arc: 90,

```

Apply to `packages/engine/src/types/ability.ts`:

```diff
@@ -1,5 +1,5 @@
 import type { ManaType } from './mana.js';
-import type { FormDef, FusionDef, StatusId, Vec } from './arpg.js';
+import type { FormDef, FusionDef, StatusId, StyleLook, Vec } from './arpg.js';
 import type { RuneRef } from './rune.js';
 
 /**
@@ -214,7 +214,10 @@ export interface ResolvedAbility {
   /** Its place in the chain (from 0), and whether it is the last move of a chain of 2 or more. */
   index: number;
   last: boolean;
+  /** The form as the weapon's cast style expresses it (`applyStyle`). */
   form: FormDef;
+  /** The casting weapon's style look (the constructs spec §4.2), drawn by the client; unarmed null. */
+  look: StyleLook | null;
   /** "Wildfire Burst", "Frost Ward". */
   name: string;
   icon: string;

```

Apply to `packages/engine/src/types/arpg.ts`:

```diff
@@ -663,6 +663,7 @@ export type ArpgEvent =
        * client gives it no hit-stop or kick. Its numbers are as any hit's.
        */
       echo?: true;
+      look?: StyleLook;
     }
   | {
       kind: 'heroHit';
@@ -689,6 +690,11 @@ export type ArpgEvent =
       tx: number;
       ty: number;
       heft: number;
+      /**
+       * The casting weapon's style look (the constructs spec §4.2), drawn as its motif; absent
+       * unarmed. The same on `hit`, `beam`, `slash`, `explode` and `dash` (B1 sets those).
+       */
+      look?: StyleLook;
     }
   | { kind: 'windup'; slot: number; until: number; heft: number }
   /** A hold reached a new stage (1, then 2): an ability slot's, or the basic attack's (null). */
@@ -710,6 +716,7 @@ export type ArpgEvent =
        * `slash`, `explode` and `dash`.
        */
       infusion: ManaType | null;
+      look?: StyleLook;
     }
   | {
       kind: 'slash';
@@ -723,6 +730,7 @@ export type ArpgEvent =
       infusion: ManaType | null;
       /** An echo's slash (an ability's `replay`): the client gives it no hit-stop or kick. */
       echo?: true;
+      look?: StyleLook;
     }
   | {
       kind: 'basic';
@@ -746,6 +754,7 @@ export type ArpgEvent =
       radius: number;
       element: ManaType | null;
       infusion: ManaType | null;
+      look?: StyleLook;
     }
   | {
       kind: 'reaction';
@@ -778,6 +787,7 @@ export type ArpgEvent =
       toX: number;
       toY: number;
       infusion: ManaType | null;
+      look?: StyleLook;
     }
   | { kind: 'noMana'; slot: number }
   /** A skill paid: the mana and charge it really cost (none for the sandbox's free toggles). */

```

Apply to `packages/engine/src/types/delve.ts`:

```diff
@@ -710,6 +710,9 @@ export interface HeroBlow extends ComboStepDef {
 
 export interface HeroWeapon {
   baseId: string | null;
+  /** Its class and cast style (the constructs spec §2.1, §4); unarmed neither. */
+  class: WeaponClass | null;
+  style: CastStyle | null;
   kind: 'melee' | 'bolt';
   range: number;
   arc: number;

```

- [ ] **Step 4: Typecheck and run them: green**

```bash
cd /c/Projects/alloy-constructs-a
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-constructs-a-style.test.ts tests/ability-resolve.test.ts tests/delve-constructs-a-data.test.ts --reporter=dot)
```

Expected: no type errors; **Test Files 3 passed (3)**; `delve-constructs-a-style.test.ts` 6 passed.

- [ ] **Step 5: The fingerprint**

```bash
cd /c/Projects/alloy-constructs-a
P=C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/1d6bb288-c64f-43d2-9587-234f3b95983f/scratchpad
cp $P/constructs-a-probe.test.ts packages/engine/tests/zz-probe.test.ts
(cd packages/engine && PROBE_OUT=$P/constructs-a-task2.json npx vitest run tests/zz-probe.test.ts --reporter=dot)
rm packages/engine/tests/zz-probe.test.ts
node $P/cmp.cjs $P/constructs-a-before.json $P/constructs-a-task2.json
```

Expected: `Tests 1 passed`, then `FINGERPRINT_SAME` (byte for byte the Base section's `constructs-a-before.json`).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-constructs-a
git add packages/engine
git commit -q -F - <<'EOF'
feat(engine): the cast style pipeline wired inert, the weapon's class and style on HeroWeapon, the cast event's look, the signature hook

`applyStyle` (the melee block, then the style's numbers; every factor 1 in A)
runs every form through `resolveAbility`, whose knobs take the style's trait
and whose `look` reaches the cast event; `computeHeroStats` carries the
weapon's class and style; `signatures.ts` ships empty, asked before each
form's behaviour.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git log --oneline -1
```

## Chunk 5: Task 3 — The slot table, Open a skill's prices and runeChance in the balance; the class and slot helpers, read by nothing yet

### Task 3: The slot table, Open a skill's prices and runeChance in the balance; the class and slot helpers, read by nothing yet

`balance.json → delve.movesets.slots` (a `[start, ceiling]` per rarity and skill, the Basic's start 0: its weapon's string), `movesets.openSkill` (a rarity's flux, Links and scrap), `pair.salvageDust` and `runes.runeChance`, each beside the old keys with their schemas (`SlotRangeSchema`; a ceiling never under its start, never falling with rarity, a legendary's 5); and in `loot/moveset.ts` the pure helpers `defaultForm`, `weaponClass`, `formAllowed`, `slotRange`, `ceilingOf`, `plainConstruct`, `constructSkill`, `isPlain`, `dormantUids`, `fillSlots` and `emptyChain`, exported and read by nothing in play. The fingerprint is identical.

Note: `fillSlots`' test here expects a sword's plain refill to be a Bolt (`DEFAULT_FORMS`, the class-free default); Task 4 moves the refill to the class default (a Strike) and updates the expectation.

**Files:**
- Modify: `packages/engine/src/data/balance.json`
- Modify: `packages/engine/src/data/schemas.ts`
- Modify: `packages/engine/src/loot/moveset.ts`
- Modify: `packages/engine/src/types/delve.ts`
- Create: `packages/engine/tests/delve-constructs-a-model.test.ts`
- Modify: `packages/engine/tests/delve-runes-contract.test.ts`

- [ ] **Step 1: The failing tests** — the new test files in full, and the rewritten ones as diffs (2 files)

Create `packages/engine/tests/delve-constructs-a-model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BalanceConfigSchema } from '../src/data/schemas.js';
import balanceData from '../src/data/balance.json';
import { generateItem } from '../src/loot/item-generator.js';
import {
  UNARMED,
  ceilingOf,
  constructSkill,
  defaultForm,
  defaultMoveset,
  dormantUids,
  fillSlots,
  formAllowed,
  isPlain,
  plainConstruct,
  slotRange,
  weaponClass,
} from '../src/loot/moveset.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { ChainSkill, Move } from '../src/types/ability.js';
import { RARITY_ORDER, type GearItem, type Rarity } from '../src/types/gear.js';
import { registry } from './fixtures/arena.js';

// See the constructs spec §2.1 (classes), §2.4 (the class defaults), §3.1 (the model) and §3.2
// (the slot table). In Phase A these helpers are read by nothing: the switch task wires them.

const bal = registry.getDelveBalance();
const weapon = (rarity: Rarity, baseId: string, uid = `w-${baseId}-${rarity}`): GearItem =>
  generateItem(
    registry,
    { uid, ilvl: 5, rarity, slot: 'weapon', baseId, mana: 'fire' },
    new SeededRNG(3).fork(uid),
  );

describe('balance: delve.movesets.slots, openSkill, salvageDust and runes.runeChance', () => {
  it("holds the spec's slot table, the Basic's start 0 (the weapon's string)", () => {
    expect(bal.movesets.slots).toEqual({
      common: { basic: [0, 3], primary: [2, 3], defensive: [0, 1], ultimate: [0, 0] },
      uncommon: { basic: [0, 3], primary: [2, 3], defensive: [1, 2], ultimate: [0, 1] },
      magic: { basic: [0, 4], primary: [3, 4], defensive: [1, 2], ultimate: [0, 1] },
      rare: { basic: [0, 4], primary: [3, 4], defensive: [2, 3], ultimate: [1, 2] },
      epic: { basic: [0, 5], primary: [4, 5], defensive: [2, 4], ultimate: [1, 3] },
      legendary: { basic: [0, 5], primary: [4, 5], defensive: [3, 5], ultimate: [2, 5] },
    });
    expect(bal.movesets.openSkill).toEqual({
      common: { flux: { uncommon: 2 }, links: 1, scrap: 40 },
      uncommon: { flux: { uncommon: 2 }, links: 1, scrap: 60 },
      magic: { flux: { magic: 1 }, links: 2, scrap: 80 },
      rare: { flux: { rare: 1 }, links: 2, scrap: 120 },
      epic: { flux: { epic: 1 }, links: 3, scrap: 160 },
      legendary: { flux: { epic: 1 }, links: 3, scrap: 200 },
    });
    expect(bal.movesets.salvageDust).toBe(0);
    expect(bal.runes.runeChance).toEqual({
      common: 0,
      uncommon: 0,
      magic: 0.05,
      rare: 0.1,
      epic: 0.2,
      legendary: 0.35,
    });
  });

  it('refuses a ceiling under its start, a ceiling that falls with rarity, and a legendary ceiling under 5', () => {
    const withSlots = (patch: (s: typeof bal.movesets.slots) => object) => ({
      ...balanceData,
      delve: {
        ...balanceData.delve,
        movesets: {
          ...balanceData.delve.movesets,
          slots: patch(JSON.parse(JSON.stringify(balanceData.delve.movesets.slots))),
        },
      },
    });
    const ok = (x: object) => BalanceConfigSchema.safeParse(x).success;
    expect(ok(withSlots((s) => s))).toBe(true);
    expect(ok(withSlots((s) => ({ ...s, rare: { ...s.rare, primary: [4, 3] } })))).toBe(false);
    expect(ok(withSlots((s) => ({ ...s, epic: { ...s.epic, defensive: [2, 2] } })))).toBe(false);
    expect(ok(withSlots((s) => ({ ...s, legendary: { ...s.legendary, ultimate: [2, 4] } })))).toBe(
      false,
    );
  });
});

describe('weaponClass, formAllowed and defaultForm', () => {
  it('reads each base; unarmed is null and expresses no form', () => {
    const classes = Object.fromEntries(
      registry.getGearBasesForSlot('weapon').map((b) => [b.id, weaponClass(registry, b.id)]),
    );
    expect(classes).toEqual({
      dagger: 'melee',
      sword: 'melee',
      axe: 'melee',
      maul: 'melee',
      staff: 'ranged',
      wand: 'ranged',
      bow: 'ranged',
    });
    expect(weaponClass(registry, null)).toBeNull();
    expect(formAllowed(registry, 'sword', 'strike')).toBe(true);
    expect(formAllowed(registry, 'sword', 'bolt')).toBe(false);
    expect(formAllowed(registry, 'bow', 'bolt')).toBe(true);
    expect(formAllowed(registry, 'bow', 'strike')).toBe(false);
    expect(formAllowed(registry, 'bow', 'lance')).toBe(true);
    expect(formAllowed(registry, 'sword', 'lance')).toBe(true);
    for (const f of registry.getArpgData().forms) expect(formAllowed(registry, null, f.id)).toBe(false);
  });

  it("the Primary's default is Strike on a melee weapon and Bolt otherwise; Ward and Nova for both", () => {
    expect(defaultForm(registry, 'primary', 'melee')).toEqual({ form: 'strike', payment: 'mana' });
    expect(defaultForm(registry, 'primary', 'ranged')).toEqual({ form: 'bolt', payment: 'mana' });
    expect(defaultForm(registry, 'primary', null)).toEqual({ form: 'bolt', payment: 'mana' });
    for (const cls of ['melee', 'ranged', null] as const) {
      expect(defaultForm(registry, 'defensive', cls)).toEqual({ form: 'ward', payment: 'mana' });
      expect(defaultForm(registry, 'ultimate', cls)).toEqual({ form: 'nova', payment: 'charge' });
    }
  });
});

describe('slotRange, ceilingOf, plainConstruct, constructSkill, isPlain', () => {
  it("gives each skill's [start, ceiling] by rarity, the Basic's start its weapon's string", () => {
    expect(slotRange(registry, { baseId: 'sword', rarity: 'common' }, 'basic')).toEqual([3, 3]);
    expect(slotRange(registry, { baseId: 'maul', rarity: 'rare' }, 'basic')).toEqual([2, 4]);
    expect(slotRange(registry, { baseId: 'dagger', rarity: 'common' }, 'basic')).toEqual([4, 4]);
    expect(slotRange(registry, { baseId: 'sword', rarity: 'common' }, 'primary')).toEqual([2, 3]);
    expect(slotRange(registry, { baseId: 'sword', rarity: 'common' }, 'ultimate')).toEqual([0, 0]);
    expect(slotRange(registry, { baseId: 'bow', rarity: 'legendary' }, 'ultimate')).toEqual([2, 5]);
    expect(slotRange(registry, UNARMED, 'basic')).toEqual([3, 3]);
    for (const skill of ['primary', 'defensive', 'ultimate'] as const)
      expect(slotRange(registry, UNARMED, skill)).toEqual([0, 0]);
    expect(ceilingOf(registry, { baseId: 'sword', rarity: 'epic' }, 'defensive')).toBe(4);
    expect(ceilingOf(registry, UNARMED, 'primary')).toBe(0);
  });

  it("a plain construct: the skill's default kind at its index, the class default form, in the element; no uid", () => {
    const sword = { baseId: 'sword', rarity: 'common' as const };
    expect(plainConstruct(registry, sword, 'primary', 0, 'frost')).toEqual({
      kind: 'medium',
      form: 'strike',
      elements: ['frost'],
    });
    expect(plainConstruct(registry, sword, 'primary', 3, 'frost')).toEqual({
      kind: 'heavy',
      form: 'strike',
      elements: ['frost'],
    });
    expect(plainConstruct(registry, { baseId: 'bow', rarity: 'rare' }, 'primary', 0, 'storm')).toEqual({
      kind: 'light',
      form: 'bolt',
      elements: ['storm'],
    });
    expect(plainConstruct(registry, sword, 'basic', 2, 'fire')).toEqual({ kind: 'heavy', element: 'fire' });
    expect(plainConstruct(registry, sword, 'basic', 4, 'fire')).toEqual({ kind: 'medium', element: 'fire' });
    expect(plainConstruct(registry, sword, 'ultimate', 0, 'fire')).toEqual({
      kind: 'medium',
      form: 'nova',
      elements: ['fire'],
    });
  });

  it('a construct belongs to its skill, and is plain without an open socket or a rune', () => {
    const m = (form: Move['form']): Move => ({ kind: 'medium', form, elements: ['fire'] });
    expect(constructSkill(registry, { kind: 'light', element: 'fire' })).toBe('basic');
    expect(constructSkill(registry, m('bolt'))).toBe('primary');
    expect(constructSkill(registry, m('repel'))).toBe('defensive');
    expect(constructSkill(registry, m('onslaught'))).toBe('ultimate');
    expect(isPlain(m('bolt'))).toBe(true);
    expect(isPlain({ ...m('bolt'), runes: [] })).toBe(true);
    expect(isPlain({ ...m('bolt'), runes: [null] })).toBe(false);
    expect(isPlain({ kind: 'light', element: 'fire', runes: [{ id: 'quick', tier: 1 }] })).toBe(false);
  });
});

describe('dormantUids and fillSlots', () => {
  it("names the moves whose form the weapon's class can't express; blows never", () => {
    const bow = weapon('rare', 'bow');
    const moves: Move[] = [
      { uid: 'c1', kind: 'medium', form: 'strike', elements: ['fire'] },
      { uid: 'c2', kind: 'medium', form: 'lance', elements: ['fire'] },
      { uid: 'c3', kind: 'medium', form: 'bolt', elements: ['fire'] },
    ];
    const held: GearItem = {
      ...bow,
      moveset: {
        chains: {
          basic: [{ uid: 'b1', kind: 'light', element: 'fire', runes: [{ id: 'widen', tier: 1 }] }],
          primary: { moves, payment: 'mana' },
          defensive: { moves: [{ uid: 'c4', kind: 'medium', form: 'armor', elements: ['fire'] }], payment: 'mana' },
        },
        slots: { basic: 3, primary: 3, defensive: 2 },
      },
    };
    expect([...dormantUids(registry, held)].sort()).toEqual(['c1', 'c4']);
    expect(dormantUids(registry, weapon('common', 'sword')).size).toBe(0);
  });

  it("fills a skill's empty slots below its start with plain constructs, raising its slots to the start", () => {
    const rare = { baseId: 'sword', rarity: 'rare' as const };
    // An uncommon sword's moveset as the old carries make it: the Basic and a two-Bolt Primary.
    const m = defaultMoveset(registry, { baseId: 'sword', rarity: 'uncommon' }, 'fire', { primary: 2 });
    const filled = fillSlots(registry, rare, m, 'storm');
    // A rare's Primary starts at 3 (the two kept, one Storm Strike added), its Defensive at 2.
    expect(filled.slots).toMatchObject({ basic: 3, primary: 3, defensive: 2 });
    expect(filled.chains.primary!.moves.map((x) => [x.form, x.elements[0]])).toEqual([
      ['bolt', 'fire'],
      ['bolt', 'fire'],
      ['strike', 'storm'],
    ]);
    expect(filled.chains.defensive).toEqual({
      moves: [
        { kind: 'medium', form: 'ward', elements: ['storm'] },
        { kind: 'medium', form: 'ward', elements: ['storm'] },
      ],
      payment: 'mana',
    });
    // Emptied chains refill to the start, their slots past it kept; nothing above the start is added.
    const emptied = { ...filled, chains: { ...filled.chains, primary: { moves: [], payment: 'cast' as const } }, slots: { ...filled.slots, primary: 4 } };
    const again = fillSlots(registry, rare, emptied, 'storm');
    expect(again.slots.primary).toBe(4);
    expect(again.chains.primary!.moves).toHaveLength(3);
    expect(again.chains.primary!.payment).toBe('cast');
    expect(fillSlots(registry, rare, again, 'storm')).toEqual(again);
    // A skill at a start of 0 with no chain stays without one.
    const skills = (x: typeof m) => Object.keys(x.chains).sort();
    expect(skills(fillSlots(registry, { baseId: 'sword', rarity: 'common' }, m, 'fire'))).toEqual(skills(m));
  });
});

```

Apply to `packages/engine/tests/delve-runes-contract.test.ts`:

```diff
@@ -305,6 +305,8 @@ describe('balance: delve.runes', () => {
   it("loads the spec's numbers", () => {
     expect(bal.runes).toEqual({
       socketCap: { common: 1, uncommon: 1, magic: 2, rare: 2, epic: 3, legendary: 3 },
+      // The constructs spec §3.5: a drop's socketed rune (the switch task reads it).
+      runeChance: { common: 0, uncommon: 0, magic: 0.05, rare: 0.1, epic: 0.2, legendary: 0.35 },
       socketLinks: [1, 2, 3],
       socketScrap: [20, 40, 60],
       socketDrops: {

```

- [ ] **Step 2: Run them: red**

```bash
cd /c/Projects/alloy-constructs-a
(cd packages/engine && npx vitest run tests/delve-constructs-a-model.test.ts tests/delve-runes-contract.test.ts --reporter=dot)
```

Expected: red: `delve-constructs-a-model.test.ts` fails to collect (no `slotRange`), and `delve-runes-contract.test.ts`'s balance literal lacks `runeChance`.

- [ ] **Step 3: The edits** (4 files, in this order)

Apply to `packages/engine/src/data/balance.json`:

```diff
@@ -104,12 +104,29 @@
         "magic": ["basic", "primary"], "rare": ["basic", "primary", "defensive"],
         "epic": ["basic", "primary", "defensive", "ultimate"], "legendary": ["basic", "primary", "defensive", "ultimate"]
       },
+      "slots": {
+        "common": { "basic": [0, 3], "primary": [2, 3], "defensive": [0, 1], "ultimate": [0, 0] },
+        "uncommon": { "basic": [0, 3], "primary": [2, 3], "defensive": [1, 2], "ultimate": [0, 1] },
+        "magic": { "basic": [0, 4], "primary": [3, 4], "defensive": [1, 2], "ultimate": [0, 1] },
+        "rare": { "basic": [0, 4], "primary": [3, 4], "defensive": [2, 3], "ultimate": [1, 2] },
+        "epic": { "basic": [0, 5], "primary": [4, 5], "defensive": [2, 4], "ultimate": [1, 3] },
+        "legendary": { "basic": [0, 5], "primary": [4, 5], "defensive": [3, 5], "ultimate": [2, 5] }
+      },
       "extraSlots": { "common": [0, 0], "uncommon": [0, 0], "magic": [0, 1], "rare": [1, 2], "epic": [2, 3], "legendary": [3, 4] },
       "slotLinks": [1, 2, 3, 4], "slotScrap": [20, 40, 60, 80],
-      "editDust": 5, "elementDust": 15, "transferScrap": 30
+      "openSkill": {
+        "common": { "flux": { "uncommon": 2 }, "links": 1, "scrap": 40 },
+        "uncommon": { "flux": { "uncommon": 2 }, "links": 1, "scrap": 60 },
+        "magic": { "flux": { "magic": 1 }, "links": 2, "scrap": 80 },
+        "rare": { "flux": { "rare": 1 }, "links": 2, "scrap": 120 },
+        "epic": { "flux": { "epic": 1 }, "links": 3, "scrap": 160 },
+        "legendary": { "flux": { "epic": 1 }, "links": 3, "scrap": 200 }
+      },
+      "editDust": 5, "elementDust": 15, "transferScrap": 30, "salvageDust": 0
     },
     "runes": {
       "socketCap": { "common": 1, "uncommon": 1, "magic": 2, "rare": 2, "epic": 3, "legendary": 3 },
+      "runeChance": { "common": 0, "uncommon": 0, "magic": 0.05, "rare": 0.1, "epic": 0.2, "legendary": 0.35 },
       "socketLinks": [1, 2, 3], "socketScrap": [20, 40, 60],
       "socketDrops": { "common": [0, 0], "uncommon": [0, 0], "magic": [0, 1], "rare": [0, 1], "epic": [1, 2], "legendary": [2, 3] },
       "unsocket": "destroy", "pullScrap": [15, 30, 50, 80, 120],

```

Apply to `packages/engine/src/data/schemas.ts`:

```diff
@@ -100,6 +100,11 @@ function perKind<T extends z.ZodTypeAny>(schema: T) {
   return z.object({ light: schema, medium: schema, heavy: schema, hold: schema });
 }
 
+/** A skill's slots on a weapon rarity: `[start, ceiling]`, the ceiling at least the start (the constructs spec §3.2). */
+const SlotRangeSchema = z
+  .tuple([z.number().int().min(0).max(MAX_CHAIN), z.number().int().min(0).max(MAX_CHAIN)])
+  .refine(([start, ceiling]) => ceiling >= start, 'a ceiling is at least its start');
+
 function perRarity<T extends z.ZodTypeAny>(schema: T) {
   return z.object({
     common: schema,
@@ -1431,6 +1436,28 @@ const DelveBalanceSchema = z.object({
         (c) => CHAIN_SKILLS.every((s) => c.legendary.includes(s)),
         'the legendary carries all four chains',
       ),
+    // Each rarity's slots by skill, `[start, ceiling]` (the constructs spec §3.2): the Basic's
+    // start 0 means the weapon's string; a ceiling never below its start nor the rarity below's,
+    // and the legendary's all 5.
+    slots: perRarity(
+      z.object({
+        basic: SlotRangeSchema,
+        primary: SlotRangeSchema,
+        defensive: SlotRangeSchema,
+        ultimate: SlotRangeSchema,
+      }),
+    )
+      .refine(
+        (s) =>
+          RARITY_ORDER.slice(1).every((r, i) =>
+            CHAIN_SKILLS.every((k) => s[r][k][1] >= s[RARITY_ORDER[i]][k][1]),
+          ),
+        'a ceiling never falls with rarity',
+      )
+      .refine(
+        (s) => CHAIN_SKILLS.every((k) => s.legendary[k][1] === MAX_CHAIN),
+        `the legendary's ceilings are all ${MAX_CHAIN}`,
+      ),
     extraSlots: perRarity(
       z
         .tuple([z.number().int().min(0), z.number().int().min(0)])
@@ -1439,12 +1466,32 @@ const DelveBalanceSchema = z.object({
     // By the new slot's position: the 2nd slot's price first, the last slot's last.
     slotLinks: z.array(z.number().int().min(0)).length(MAX_CHAIN - 1),
     slotScrap: z.array(z.number().int().min(0)).length(MAX_CHAIN - 1),
+    // Open a skill (a skill's first slot), by the weapon's rarity: flux by grade, Links and scrap.
+    openSkill: perRarity(
+      z.object({
+        flux: z
+          .object({
+            uncommon: z.number().int().min(0),
+            magic: z.number().int().min(0),
+            rare: z.number().int().min(0),
+            epic: z.number().int().min(0),
+          })
+          .partial()
+          .strict(),
+        links: z.number().int().min(0),
+        scrap: z.number().min(0),
+      }),
+    ),
     editDust: z.number().int().min(0),
     elementDust: z.number().int().min(0),
     transferScrap: z.number().int().min(0),
+    // Mana Dust salvaging a construct gives (the constructs spec §3.3 gives none: 0 as shipped).
+    salvageDust: z.number().int().min(0),
   }),
   runes: z.object({
     socketCap: perRarity(z.number().int().min(0).max(MAX_SOCKETS)),
+    // Chance a weapon drop's open socket holds a rune, by rarity (the constructs spec §3.5).
+    runeChance: perRarity(z.number().min(0).max(1)),
     // By the sockets the move already has: the first socket's price first.
     // At least 1: a removed move gives back a flat Link per socket.
     socketLinks: z.array(z.number().int().min(1)).length(MAX_SOCKETS),

```

Apply to `packages/engine/src/loot/moveset.ts`:

```diff
@@ -7,9 +7,11 @@ import {
   type Blow,
   type Chains,
   type ChainSkill,
+  type Construct,
   type FormId,
   type Move,
   type MoveKind,
+  type WeaponClass,
 } from '../types/ability.js';
 import type { ManaPair } from '../types/delve.js';
 import type { EquippedGear, GearItem, Moveset, Rarity } from '../types/gear.js';
@@ -41,6 +43,143 @@ export const DEFAULT_FORMS: Record<AbilitySlot, { form: FormId; payment: Ability
   ultimate: { form: 'nova', payment: 'charge' },
 };
 
+/**
+ * A slot's default form and payment by weapon class (the constructs spec §2.4):
+ * the Primary's Strike on a melee weapon, Bolt otherwise (unarmed too); the
+ * Defensive's Ward and the Ultimate's charged Nova for both.
+ */
+export function defaultForm(
+  registry: DataRegistry,
+  slot: AbilitySlot,
+  cls: WeaponClass | null,
+): { form: FormId; payment: AbilityPayment } {
+  if (slot === 'primary' && cls === 'melee') return { form: 'strike', payment: 'mana' };
+  const { form, payment } = DEFAULT_FORMS[slot];
+  if (!registry.getArpgData().forms.some((f) => f.id === form)) throw new Error(`No form ${form}`);
+  return { form, payment };
+}
+
+/** A weapon base's class (the constructs spec §2.1); unarmed null. */
+export function weaponClass(registry: DataRegistry, baseId: string | null): WeaponClass | null {
+  return baseId ? (registry.getGearBase(baseId).class ?? null) : null;
+}
+
+/** Whether a weapon of `baseId` can express `form`: a shared form, or one of its class; unarmed none. */
+export function formAllowed(registry: DataRegistry, baseId: string | null, form: FormId): boolean {
+  const cls = weaponClass(registry, baseId);
+  if (!cls) return false;
+  const own = registry.getForm(form).class;
+  return own === 'both' || own === cls;
+}
+
+/**
+ * A skill's slots on `owner`, `[start, ceiling]` by its rarity
+ * (`movesets.slots`; the constructs spec §3.2): the Basic's start its weapon's
+ * string (a string longer than the ceiling keeps its length); unarmed the
+ * Basic at its string and every other skill `[0, 0]`.
+ */
+export function slotRange(
+  registry: DataRegistry,
+  owner: MovesetOwner,
+  skill: ChainSkill,
+): [start: number, ceiling: number] {
+  const string = weaponString(registry, owner.baseId).length;
+  if (!owner.rarity) return skill === 'basic' ? [string, string] : [0, 0];
+  const [start, ceiling] = registry.getDelveBalance().movesets.slots[owner.rarity][skill];
+  if (skill !== 'basic') return [start, ceiling];
+  return [string, Math.max(string, ceiling)];
+}
+
+/** The most slots `owner`'s `skill` can hold (`slotRange`'s ceiling). */
+export function ceilingOf(registry: DataRegistry, owner: MovesetOwner, skill: ChainSkill): number {
+  return slotRange(registry, owner, skill)[1];
+}
+
+/**
+ * A plain construct for slot `index` of `owner`'s `skill` (the constructs spec
+ * §3.5): the skill's default kind at its index (the class default form's
+ * chain, or the weapon's string; medium past its end), the class default form,
+ * in `element`; no sockets, no uid (the caller mints one when it enters the
+ * profile).
+ */
+export function plainConstruct(
+  registry: DataRegistry,
+  owner: MovesetOwner,
+  skill: ChainSkill,
+  index: number,
+  element: ManaType,
+): Construct {
+  if (skill === 'basic') return { kind: defaultKind(registry, 'basic', owner.baseId, index), element };
+  const { form } = defaultForm(registry, skill, weaponClass(registry, owner.baseId));
+  const kind = registry.getForm(form).defaultChain[index] ?? 'medium';
+  return { kind, form, elements: [element] };
+}
+
+/** The skill a construct belongs to: a blow the Basic, a move its form's slot. */
+export function constructSkill(registry: DataRegistry, c: Construct): ChainSkill {
+  return 'form' in c ? registry.getForm(c.form).slot : 'basic';
+}
+
+/** Whether a construct is plain: no open socket and no rune (the constructs spec §3.3's auto-salvage). */
+export function isPlain(c: Construct): boolean {
+  return socketsOf(c).length === 0;
+}
+
+/**
+ * The uids of `weapon`'s constructs its class can't express (the constructs
+ * spec §3.1's dormancy): the moves whose form isn't the class's or shared. A
+ * blow is never dormant (a rune that doesn't fit the weapon's blows is dormant
+ * on its own, in `runeKnobs`). A construct without a uid can't be named: none.
+ */
+export function dormantUids(registry: DataRegistry, weapon: GearItem): Set<string> {
+  const out = new Set<string>();
+  const { chains } = movesetOf(registry, weapon);
+  for (const skill of CHAIN_SKILLS)
+    for (const m of chainMoves(chains[skill]))
+      if ('form' in m && m.uid && !formAllowed(registry, weapon.baseId, m.form)) out.add(m.uid);
+  return out;
+}
+
+/**
+ * `moveset` with each skill's slots raised to its start on `owner` and its
+ * empty slots below the start plain-filled in `element` (the constructs spec
+ * §3.2's Upgrade, §3.3's Move all): a chain the moveset lacks is made at its
+ * skill's default payment; slots and constructs past the start stay as they
+ * are. Nothing is minted: the caller gives the new constructs their uids.
+ */
+export function fillSlots(
+  registry: DataRegistry,
+  owner: MovesetOwner,
+  moveset: Moveset,
+  element: ManaType,
+): Moveset {
+  const chains = { ...moveset.chains };
+  const slots = { ...moveset.slots };
+  for (const skill of CHAIN_SKILLS) {
+    const [start] = slotRange(registry, owner, skill);
+    const have = slots[skill] ?? 0;
+    if (start === 0 && !chains[skill]) continue;
+    const chain = chains[skill] ?? emptyChain(registry, owner, skill);
+    const moves = chainMoves(chain);
+    if (have >= start && moves.length >= start) continue;
+    const added = Array.from({ length: Math.max(0, start - moves.length) }, (_, i) =>
+      plainConstruct(registry, owner, skill, moves.length + i, element),
+    );
+    (chains as Record<ChainSkill, unknown>)[skill] = Array.isArray(chain)
+      ? [...chain, ...(added as Blow[])]
+      : { ...chain, moves: [...chain.moves, ...(added as Move[])] };
+    slots[skill] = Math.max(have, start);
+  }
+  return { ...moveset, chains, slots };
+}
+
+/** An empty chain for `skill`: no blows, or no moves at the skill's default payment. */
+function emptyChain(registry: DataRegistry, owner: MovesetOwner, skill: ChainSkill): Chains[ChainSkill] {
+  if (skill === 'basic') return [];
+  const { payment } = defaultForm(registry, skill, weaponClass(registry, owner.baseId));
+  return { moves: [], payment };
+}
+
 /**
  * The skills `item` carries, by its rarity (`movesets.carries`), and the
  * Ultimate too once awakened (see the tutorial spec's Awaken); unarmed (null,

```

Apply to `packages/engine/src/types/delve.ts`:

```diff
@@ -11,7 +11,13 @@ import type {
 } from './ability.js';
 import type { RunePouch, RuneRef, UnsocketMode } from './rune.js';
 import type { CastStyle, MonsterKind } from './arpg.js';
-import type { CraftingBalance, DropsBalance, Haul, MaterialsPouch } from './crafting.js';
+import type {
+  CraftingBalance,
+  DropsBalance,
+  FluxGrade,
+  Haul,
+  MaterialsPouch,
+} from './crafting.js';
 import type { ProfileQuests, QuestsBalance } from './quests.js';
 import type { AiBalance, LayoutBalance, LayoutsData, TerrainBalance } from './floor-map.js';
 import type { BoonOffer, BoonsBalance, Buff } from './boon.js';
@@ -581,23 +587,31 @@ export interface DelveBalance {
   movesets: {
     /** The chains a weapon of each rarity carries (unarmed: basic and primary). */
     carries: Record<Rarity, ChainSkill[]>;
-    /** Extra slots a weapon drop rolls, least and most, by rarity. */
+    /** Each rarity's slots by skill: `[start, ceiling]` (the Basic's start is the weapon's string; the constructs spec §3.2). */
+    slots: Record<Rarity, Record<ChainSkill, [number, number]>>;
+    /** Extra slots a weapon drop rolls, least and most, by rarity (free: not bought). */
     extraSlots: Record<Rarity, [number, number]>;
     /** Links a new slot costs, by its position: the 2nd slot's first. */
     slotLinks: number[];
     /** Scrap a new slot costs, by its position as `slotLinks`. */
     slotScrap: number[];
+    /** Open a skill (a skill's first slot), by the weapon's rarity: flux by grade, Links and scrap (× `scrapLevelFactor`). */
+    openSkill: Record<Rarity, { flux: Partial<Record<FluxGrade, number>>; links: number; scrap: number }>;
     /** Mana Dust a changed, moved, added or removed move costs, or a changed payment. */
     editDust: number;
     /** Mana Dust a move's changed elements cost, or a new move's elements that no old move has. */
     elementDust: number;
     /** Scrap a transfer costs for each extra slot that moves. */
     transferScrap: number;
+    /** Mana Dust salvaging a construct gives (the constructs spec §3.3 gives none: 0 as shipped; the key exists for tuning). */
+    salvageDust: number;
   };
   /** Runes: sockets and their prices, the pull rule, fusing, drops and the knobs' numbers (see the runes spec). */
   runes: {
     /** Most sockets a move may open, by its weapon's rarity (at most `MAX_SOCKETS`). */
     socketCap: Record<Rarity, number>;
+    /** Chance a weapon drop's open socket holds a rune (the constructs spec §3.5), by rarity. */
+    runeChance: Record<Rarity, number>;
     /** Links the next socket costs, by the sockets the move already has. */
     socketLinks: number[];
     /** Scrap the next socket costs, by the sockets the move already has. */

```

- [ ] **Step 4: Typecheck and run them: green**

```bash
cd /c/Projects/alloy-constructs-a
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-constructs-a-model.test.ts tests/delve-runes-contract.test.ts --reporter=dot)
```

Expected: no type errors; **Test Files 2 passed (2)**; `delve-constructs-a-model.test.ts` 9 passed.

- [ ] **Step 5: The fingerprint**

```bash
cd /c/Projects/alloy-constructs-a
P=C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/1d6bb288-c64f-43d2-9587-234f3b95983f/scratchpad
cp $P/constructs-a-probe.test.ts packages/engine/tests/zz-probe.test.ts
(cd packages/engine && PROBE_OUT=$P/constructs-a-task3.json npx vitest run tests/zz-probe.test.ts --reporter=dot)
rm packages/engine/tests/zz-probe.test.ts
node $P/cmp.cjs $P/constructs-a-before.json $P/constructs-a-task3.json
```

Expected: `Tests 1 passed`, then `FINGERPRINT_SAME` (byte for byte the Base section's `constructs-a-before.json`).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-constructs-a
git add packages/engine
git commit -q -F - <<'EOF'
feat(engine): the slot table, Open a skill's prices and runeChance in the balance; the class and slot helpers, read by nothing yet

`movesets.slots` ([start, ceiling] by rarity and skill), `openSkill`,
`pair.salvageDust` and `runes.runeChance` with their schemas, beside the
old keys; `defaultForm`, `weaponClass`, `formAllowed`, `slotRange`,
`ceilingOf`, `plainConstruct`, `constructSkill`, `isPlain`, `dormantUids`,
`fillSlots` and `emptyChain` in loot/moveset.ts.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git log --oneline -1
```

## Chunk 6: Task 4 — The switch: constructs with uids, the slot table, Open a skill, Move all's preview, runes on any weapon

### Task 4: The switch: constructs with uids, the slot table, Open a skill, Move all's preview, runes on any weapon

Every play-changing retirement at once. **The model:** `Moveset.bought`; `GearItem.awakened` and `ChainOrigins` gone; `DelveProfile.constructs`, `autoSalvagePlain` (true) and `nextConstructUid`; `Haul.constructs` born `[]` (`emptyHaul`, `mapCounts`, the bot's `stockOf` and `mapHaul`), summed by `addHaul`, stocked by `stockHaul`; `SalvageYield.constructs` and `SalvageResult.constructs` (`[]`); `ForgePreview.weapon` as `{ class, slots: Record<skill, [slots, ceiling]>, sockets }`; `weaponExtras` without sockets; the tutorial's `transfer` trigger renamed `moveAll` with `openSkill` beside it. **The data:** `carries`, `transferScrap`, `socketCap`, `crafting.awaken` and `weaponExtras.*.sockets` gone, `unsocket: 'pay'`; the Detonate row first in `runes.json` (its load `[0.3, 0.35, 0.4, 0.45, 0.5]`, fitting Strike, Whirl, Volley, Lance and Onslaught); `tutorial.json`'s `l2-transfer` trigger `moveAll`. **`loot/moveset.ts`** rewritten on the slot table: `defaultMoveset` from the starts, `rollMoveset`'s extras within the ceilings over the skills with a start, `rollSockets` capped at `MAX_SOCKETS`, `rollSocketedRunes` (one rune at `runeChance` by rarity into a random empty socket, the tier by item level, on its own fork `socketed`), `weaponParts` (Links = Σ bought, the runes, the constructs), `heroChains` deciding dormancy (a construct whose form the class can't express is skipped; an ability chain left empty is dropped), `moveAllPreview`; `carriedSkills`, `carriedFrom`, `carriedByText`, `baseSlots`, `extraSlots` and `movesetTransfer` gone. **`delve/moveset.ts`** rewritten: pricing by uid (`movesetEditPrice`: a reorder free, a removed, a new, a changed shape or set each paid), `classRefusal` ("A sword can't express Bolt"), `chainRefusal` (0 slots → `OPEN_SKILL_TEXT`), `setChains` minting each new construct, `addSlot` counting bought up to the ceiling and minting, `slotPrice` null at the ceiling or at 0 slots, `wornClass`. **`delve/runes.ts`:** `SetChainsOptions` is `{ unsocket? }`, `socketRefusal` at `MAX_SOCKETS` ("A move holds at most 3 sockets"), `runeChange` and `draftPrice` by uid. **`delve/crafting.ts`:** `openSkillPrice` and `openSkill` (refused mid-dive, on an unknown item, on anything but a weapon, on a skill with slots, at a ceiling of 0, unpaid; emits `openSkill`), the forge minting its item's constructs. **`delve/profile.ts`:** `createDelveProfile` minting the kit's sword, `mintUid`, `mintMoveset`, `mintItem`, `fitMovesets` (defaults for a weapon without a moveset, minted; repeated and unknown runes emptied by the pull rule; uid uniqueness over the worn weapon, the bag, the move bag and an open dive's haul and banked; null → reset on a violation), `addLootToBag` minting each banked weapon, `upgradeGear`'s `fillSlots`. **`delve/constructs.ts`** new: `ConstructDraft`, `draftRefusal` (a uid in two places, a non-plain uid lost, a bag construct in the wrong skill or off-class, then `setChains`' dry run), the five B2 ops refusing "Not yet". **The readers:** `loot/forge.ts` (`forgedMoveset` by the slot table and `weaponExtras.slots`, no sockets; the preview's weapon), `loot/salvage-yield.ts`, `loot/runes.ts`, `loot/item-generator.ts` (the socketed-rune fork), `delve/pair.ts` (the mana choice mints), `delve/stops.ts`, `delve/tutorial.ts` (the `moveAll` hold: a rare worn whose Primary holds more than its start), `arpg/tutorial-floor.ts`, `delve/hero-stats.ts` (`compareItem`'s home on `moveAllPreview`; `TARGETS` for the three forms), `resolve.ts`'s `defaultChains` by class, `delve/autopilot.ts` (`awakenWeapon` on `openSkill` over the ability slots; `transferBest` wearing the best bag weapon as it is, `// D1 rewires to moveAll`; `openSockets` at `MAX_SOCKETS`; the lesson's `moveAll` op returning the profile), `src/index.ts`. **Every test of a retired rule is rewritten** for the new one (33 files), the fixtures mint uids (`withChains` mints the missing ones, `withUids`, `armed`), and `delve-constructs-a-switch.test.ts` (18 tests) pins the new rules.

**This task changes play:** a new save's common sword holds two Strike constructs; class gating; Open a skill; the bot wears its forged weapons as they are; a drop's socketed rune; the Detonate rows in the Lab. The fingerprint is re-recorded at the end as `constructs-a-task4.json`, the baseline for Task 5.

**Files:**
- Modify: `packages/engine/src/arpg/abilities/resolve.ts`
- Modify: `packages/engine/src/arpg/tutorial-floor.ts`
- Modify: `packages/engine/src/data/balance.json`
- Modify: `packages/engine/src/data/delve.json`
- Modify: `packages/engine/src/data/runes.json`
- Modify: `packages/engine/src/data/schemas.ts`
- Modify: `packages/engine/src/data/tutorial.json`
- Modify: `packages/engine/src/delve/autopilot.ts`
- Create: `packages/engine/src/delve/constructs.ts`
- Modify: `packages/engine/src/delve/crafting.ts`
- Modify: `packages/engine/src/delve/dive.ts`
- Modify: `packages/engine/src/delve/economy.ts`
- Modify: `packages/engine/src/delve/hero-stats.ts`
- Modify: `packages/engine/src/delve/moveset.ts`
- Modify: `packages/engine/src/delve/pair.ts`
- Modify: `packages/engine/src/delve/profile-schema.ts`
- Modify: `packages/engine/src/delve/profile.ts`
- Modify: `packages/engine/src/delve/runes.ts`
- Modify: `packages/engine/src/delve/stops.ts`
- Modify: `packages/engine/src/delve/tutorial.ts`
- Modify: `packages/engine/src/index.ts`
- Modify: `packages/engine/src/loot/forge.ts`
- Modify: `packages/engine/src/loot/item-generator.ts`
- Modify: `packages/engine/src/loot/materials.ts`
- Modify: `packages/engine/src/loot/moveset.ts`
- Modify: `packages/engine/src/loot/runes.ts`
- Modify: `packages/engine/src/loot/salvage-yield.ts`
- Modify: `packages/engine/src/types/ability.ts`
- Modify: `packages/engine/src/types/arpg.ts`
- Modify: `packages/engine/src/types/crafting.ts`
- Modify: `packages/engine/src/types/delve.ts`
- Modify: `packages/engine/src/types/gear.ts`
- Modify: `packages/engine/src/types/rune.ts`
- Modify: `packages/engine/src/types/tutorial.ts`
- Modify: `packages/engine/tests/ability-resolve.test.ts`
- Modify: `packages/engine/tests/delve-autopilot-crafting.test.ts`
- Delete: `packages/engine/tests/delve-awaken-bot.test.ts`
- Delete: `packages/engine/tests/delve-awaken-op.test.ts`
- Modify: `packages/engine/tests/delve-banking.test.ts`
- Modify: `packages/engine/tests/delve-chains.test.ts`
- Modify: `packages/engine/tests/delve-constructs-a-data.test.ts`
- Modify: `packages/engine/tests/delve-constructs-a-model.test.ts`
- Create: `packages/engine/tests/delve-constructs-a-switch.test.ts`
- Modify: `packages/engine/tests/delve-crafting-data.test.ts`
- Modify: `packages/engine/tests/delve-dive.test.ts`
- Modify: `packages/engine/tests/delve-dps-sim.test.ts`
- Modify: `packages/engine/tests/delve-forge.test.ts`
- Modify: `packages/engine/tests/delve-materials.test.ts`
- Modify: `packages/engine/tests/delve-movesets.test.ts`
- Create: `packages/engine/tests/delve-open-skill-bot.test.ts`
- Create: `packages/engine/tests/delve-open-skill-op.test.ts`
- Modify: `packages/engine/tests/delve-pair.test.ts`
- Modify: `packages/engine/tests/delve-profile-abilities.test.ts`
- Modify: `packages/engine/tests/delve-rune-costs.test.ts`
- Modify: `packages/engine/tests/delve-rune-power.test.ts`
- Modify: `packages/engine/tests/delve-runes-contract.test.ts`
- Modify: `packages/engine/tests/delve-runes.test.ts`
- Modify: `packages/engine/tests/delve-salvage-yield.test.ts`
- Modify: `packages/engine/tests/delve-stops.test.ts`
- Modify: `packages/engine/tests/delve-tutorial-balance.test.ts`
- Delete: `packages/engine/tests/delve-tutorial-carries.test.ts`
- Modify: `packages/engine/tests/delve-tutorial-contract.test.ts`
- Modify: `packages/engine/tests/delve-tutorial-floors-drops.test.ts`
- Modify: `packages/engine/tests/delve-tutorial-floors-play.test.ts`
- Modify: `packages/engine/tests/delve-tutorial-review.test.ts`
- Modify: `packages/engine/tests/delve-tutorial-runner-rule.test.ts`
- Modify: `packages/engine/tests/delve-tutorial-runner-script.test.ts`
- Create: `packages/engine/tests/delve-tutorial-slots.test.ts`
- Modify: `packages/engine/tests/fixtures/arena.ts`
- Modify: `packages/engine/tests/fixtures/carries.ts`

- [ ] **Step 1: The failing tests** — the new test files in full, and the rewritten ones as diffs (36 files)

Apply to `packages/engine/tests/ability-resolve.test.ts`:

```diff
@@ -231,6 +231,7 @@ describe('mergeKnobs', () => {
       stackTime: 0,
       detonate: 0,
       critBonus: 0,
+      stepBonus: 0,
       cleave: 0,
       homing: 0,
     });

```

Apply to `packages/engine/tests/delve-autopilot-crafting.test.ts`:

```diff
@@ -248,9 +248,10 @@ describe('the autopilot at the Anvil', () => {
     expect(after.equipped.weapon!.uid).toBe('W');
     expect(after.materials.essences.twin_fang).toBe(1);
     expect(after.links).toBeLessThan(20);
-    expect(movesetOf(registry, after.equipped.weapon!).slots.primary).toBeGreaterThan(
-      movesetOf(registry, worn).slots.primary!,
-    );
+    // The Links went to the weapon's slots (a legendary's Primary may roll at its ceiling of 5 already).
+    const slotsOf = (w: typeof worn) =>
+      Object.values(movesetOf(registry, w).slots).reduce((a, n) => a + (n ?? 0), 0);
+    expect(slotsOf(after.equipped.weapon!)).toBeGreaterThan(slotsOf(worn));
   });
 
   it('buys the tier I shard that makes a triple of an affix it wants, and refines it', () => {

```

Delete `packages/engine/tests/delve-awaken-bot.test.ts` (its tests are rewritten in the file that replaces it).

Delete `packages/engine/tests/delve-awaken-op.test.ts` (its tests are rewritten in the file that replaces it).

Apply to `packages/engine/tests/delve-banking.test.ts`:

```diff
@@ -320,10 +320,11 @@ describe('the first boss, and when pickups bank', () => {
 describe('the E2E dives', () => {
   // The E2E's hero is armed (its seedProfile), and its sim runs at 2× (alloy:delve:timescale),
   // a step a frame: a browser at 60 to 20 frames a second steps 1/30 to 1/10 s.
-  it("seed 5's first floor, played by the bot with the E2E's armed hero, drops gear at any frame rate (delve.spec.ts D02 relies on it)", () => {
+  // Seed 8 since the constructs (seed 5 until then): the armed hero's Strikes play the floor out another way. D2 moves D02 to it.
+  it("seed 8's first floor, played by the bot with the E2E's armed hero, drops gear at any frame rate (delve.spec.ts D02 relies on it)", () => {
     const p = startDive(
       registry,
-      armed(registry, createDelveProfile(registry, 5, { primary: 'fire' })),
+      armed(registry, createDelveProfile(registry, 8, { primary: 'fire' })),
       1,
     );
     for (const fps of [60, 30, 20, 15, 10]) {

```

Apply to `packages/engine/tests/delve-chains.test.ts`:

```diff
@@ -336,15 +336,16 @@ describe('resolving a chain', () => {
     expect(chargeCap(chain)).toBeCloseTo(need(2));
   });
 
-  it("gives a new hero each form's default chain with today's payments, and the weapon's basics", () => {
+  it("gives a new hero each form's class default chain with today's payments, and the weapon's basics", () => {
     const moves = (form: FormId) =>
       registry.getForm(form).defaultChain.map((kind) => m(kind, form, ['frost']));
+    // A maul is melee: its Primary's default is Strike (the constructs spec §2.4).
     expect(defaultChains(registry, 'frost', 'maul')).toEqual({
       basic: [
         { kind: 'medium', element: 'frost' },
         { kind: 'heavy', element: 'frost' },
       ],
-      primary: { moves: moves('bolt'), payment: 'mana' },
+      primary: { moves: moves('strike'), payment: 'mana' },
       defensive: { moves: moves('ward'), payment: 'mana' },
       ultimate: { moves: moves('nova'), payment: 'charge' },
     });

```

Apply to `packages/engine/tests/delve-constructs-a-data.test.ts`:

```diff
@@ -84,6 +84,16 @@ describe('weapon classes and cast styles (inert)', () => {
     wand: ['ranged', 'Seeking', 'spark'],
     bow: ['ranged', 'Marksman', 'arrow'],
   };
+  /** Each style's one line of text (the spec §2.2), carried on the row for the client. */
+  const STYLE_TEXT: Record<string, string> = {
+    Quick: 'Casts gain 15% crit chance',
+    Balanced: 'Each chain step hits a little harder',
+    Sweeping: 'Single-target hits cleave a small arc behind the first foe',
+    Heavy: 'Heavy and hold moves stagger',
+    Channeled: 'Impacts leave a brief small zone',
+    Seeking: 'Shots home slightly',
+    Marksman: 'Shots pierce one foe',
+  };
 
   it('every weapon base has its class and a style of every factor 1, no motion, no trait', () => {
     const weapons = registry.getGearBasesForSlot('weapon');
@@ -93,6 +103,7 @@ describe('weapon classes and cast styles (inert)', () => {
       expect(w.class, w.id).toBe(cls);
       expect(w.style, w.id).toEqual({
         name,
+        text: STYLE_TEXT[name],
         numbers: { windup: 1, cooldown: 1, power: 1, range: 1, radius: 1, speed: 1, duration: 1 },
         motion: 'none',
         trait: {},
@@ -144,6 +155,11 @@ describe('the runes fit the new forms as their kin', () => {
   it('whirl where strike, repel where ward, onslaught where nova', () => {
     for (const r of registry.getRunes()) {
       const f = r.fits.forms;
+      // Detonate (the switch task's row) fits the forms the constructs spec names: Strike, Whirl, Volley, Lance and Onslaught.
+      if (r.id === 'detonate') {
+        expect(f).toEqual(['strike', 'whirl', 'volley', 'lance', 'onslaught']);
+        continue;
+      }
       expect(f.includes('whirl'), `${r.id} whirl`).toBe(f.includes('strike'));
       expect(f.includes('repel'), `${r.id} repel`).toBe(f.includes('ward'));
       expect(f.includes('onslaught'), `${r.id} onslaught`).toBe(f.includes('nova'));

```

Apply to `packages/engine/tests/delve-constructs-a-model.test.ts`:

```diff
@@ -196,19 +196,20 @@ describe('dormantUids and fillSlots', () => {
 
   it("fills a skill's empty slots below its start with plain constructs, raising its slots to the start", () => {
     const rare = { baseId: 'sword', rarity: 'rare' as const };
-    // An uncommon sword's moveset as the old carries make it: the Basic and a two-Bolt Primary.
+    // An uncommon sword's moveset: the Basic, a two-Strike Primary (a sword's class default) and a Ward.
     const m = defaultMoveset(registry, { baseId: 'sword', rarity: 'uncommon' }, 'fire', { primary: 2 });
     const filled = fillSlots(registry, rare, m, 'storm');
     // A rare's Primary starts at 3 (the two kept, one Storm Strike added), its Defensive at 2.
     expect(filled.slots).toMatchObject({ basic: 3, primary: 3, defensive: 2 });
     expect(filled.chains.primary!.moves.map((x) => [x.form, x.elements[0]])).toEqual([
-      ['bolt', 'fire'],
-      ['bolt', 'fire'],
+      ['strike', 'fire'],
+      ['strike', 'fire'],
       ['strike', 'storm'],
     ]);
+    // The uncommon's own Fire Ward is kept; the rare's second Defensive slot takes a Storm one.
     expect(filled.chains.defensive).toEqual({
       moves: [
-        { kind: 'medium', form: 'ward', elements: ['storm'] },
+        { kind: 'medium', form: 'ward', elements: ['fire'] },
         { kind: 'medium', form: 'ward', elements: ['storm'] },
       ],
       payment: 'mana',

```

Create `packages/engine/tests/delve-constructs-a-switch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { openSkill, openSkillPrice, forge } from '../src/delve/crafting.js';
import { startDive } from '../src/delve/dive.js';
import { draftRefusal, moveAll, applyDraft } from '../src/delve/constructs.js';
import { addSlot, movesetEditPrice, setChain, setChains, slotPrice } from '../src/delve/moveset.js';
import { chooseStartingMana } from '../src/delve/pair.js';
import {
  addLootToBag,
  createDelveProfile,
  equipItem,
  mintUid,
  parseDelveProfile,
  salvageItems,
  upgradeGear,
} from '../src/delve/profile.js';
import { draftPrice, openSocket } from '../src/delve/runes.js';
import { generateItem } from '../src/loot/item-generator.js';
import { withMaterial } from '../src/loot/materials.js';
import {
  defaultMoveset,
  heroChains,
  moveAllPreview,
  movesetOf,
  rollSocketedRunes,
  weaponParts,
} from '../src/loot/moveset.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { Chain, Move } from '../src/types/ability.js';
import type { DelveProfile } from '../src/types/delve.js';
import { RARITY_ORDER, type GearItem, type Rarity } from '../src/types/gear.js';
import { chainsOf, withChains } from './fixtures/arena.js';

// The switch (the constructs spec §3): the slot table in play, constructs with uids, pricing by
// uid, class gating, Open a skill, bought-slot Links, the pull rule 'pay', MAX_SOCKETS on every
// weapon, a drop's socketed rune, Detonate's row, dormancy in heroChains and the Move all preview.

const registry = createDefaultRegistry();
const bal = registry.getDelveBalance();
const json = (x: unknown) => JSON.parse(JSON.stringify(x));
const weapon = (rarity: Rarity, baseId: string, uid = `w-${baseId}-${rarity}`, seed = 3): GearItem =>
  generateItem(
    registry,
    { uid, ilvl: 5, rarity, slot: 'weapon', baseId, mana: 'fire' },
    new SeededRNG(seed).fork(uid),
  );
const uids = (p: DelveProfile) =>
  Object.values(movesetOf(registry, p.equipped.weapon!).chains).flatMap((c) =>
    Array.isArray(c) ? c.map((b) => b.uid) : c.moves.map((m) => m.uid),
  );

describe("a new save's sword", () => {
  it('holds its string and two Strike constructs, each with a uid, nothing bought', () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    const m = movesetOf(registry, p.equipped.weapon!);
    expect(m.slots).toEqual({ basic: 3, primary: 2 });
    expect(m.bought).toEqual({});
    expect(m.chains.primary!.moves.map((x) => [x.kind, x.form, x.elements])).toEqual([
      ['medium', 'strike', ['fire']],
      ['medium', 'strike', ['fire']],
    ]);
    const ids = uids(p);
    expect(ids.every((u) => typeof u === 'string' && u.startsWith('c'))).toBe(true);
    expect(new Set(ids).size).toBe(5);
    expect(p.nextConstructUid).toBeGreaterThanOrEqual(5);
    expect(p.nextUid).toBe(2); // the items' counter never moves for a construct
    expect([p.constructs, p.autoSalvagePlain]).toEqual([[], true]);
    // The choice of mana minted the sword's constructs afresh in the primary.
    expect(chainsOf(p).primary!.moves.every((x) => x.elements[0] === 'fire')).toBe(true);
    // Before the choice too (the Anvil asks): every construct has a uid.
    expect(uids(createDelveProfile(registry, 3)).every((u) => !!u)).toBe(true);
  });

  it("the slot table rules every rarity's defaults, the Basic's start its string", () => {
    const slots = (r: Rarity, base = 'sword') =>
      defaultMoveset(registry, { baseId: base, rarity: r }, 'fire').slots;
    expect(slots('common')).toEqual({ basic: 3, primary: 2 });
    expect(slots('uncommon')).toEqual({ basic: 3, primary: 2, defensive: 1 });
    expect(slots('rare')).toEqual({ basic: 3, primary: 3, defensive: 2, ultimate: 1 });
    expect(slots('legendary', 'maul')).toEqual({ basic: 2, primary: 4, defensive: 3, ultimate: 2 });
    expect(slots('epic', 'bow')).toEqual({ basic: 3, primary: 4, defensive: 2, ultimate: 1 });
    expect(defaultMoveset(registry, { baseId: 'bow', rarity: 'epic' }, 'storm').chains.primary!.moves[0].form).toBe('bolt');
  });
});

describe('class gating and dormancy', () => {
  it("refuses a form the weapon's class can't express on a new or changed construct", () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    const primary = chainsOf(p).primary!;
    const bolt = { ...primary, moves: primary.moves.map((m) => ({ ...m, form: 'bolt' as const })) };
    expect(setChain(registry, p, 'primary', bolt).reason).toBe("A sword can't express Bolt");
    const lance = { ...primary, moves: primary.moves.map((m) => ({ ...m, form: 'lance' as const })) };
    expect(setChain(registry, p, 'primary', lance).ok).toBe(true);
    const staff = { ...p, equipped: { ...p.equipped, weapon: weapon('common', 'staff') } };
    const strike: Chain = { moves: [{ kind: 'medium', form: 'strike', elements: ['fire'] }], payment: 'mana' };
    expect(setChain(registry, staff, 'primary', strike).reason).toBe("A staff can't express Strike");
  });

  it('a kept dormant construct may stay; heroChains skips it, and drops a chain left empty', () => {
    const bow = weapon('rare', 'bow');
    const m = movesetOf(registry, bow);
    const dormant: Move = { uid: 'c-d', kind: 'medium', form: 'strike', elements: ['fire'] };
    const live = { ...m.chains.primary!.moves[0], uid: 'c-l' };
    const held = {
      ...bow,
      moveset: {
        ...m,
        chains: {
          ...m.chains,
          primary: { ...m.chains.primary!, moves: [dormant, live] },
          ultimate: { moves: [{ uid: 'c-o', kind: 'medium', form: 'onslaught', elements: ['fire'] }], payment: 'charge' as const },
        },
      },
    };
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
    const p = { ...p0, equipped: { ...p0.equipped, weapon: held } };
    const chains = heroChains(registry, p.equipped, p.pair);
    expect(chains.primary!.moves.map((x) => x.uid)).toEqual(['c-l']);
    expect(chains.ultimate).toBeUndefined();
    expect(chains.defensive).toBeDefined();
    // Kept in place through an Apply that changes something else.
    const reordered = { ...held.moveset.chains.primary, moves: [live, dormant] };
    const res = setChain(registry, p, 'primary', reordered);
    expect(res.ok).toBe(true);
    expect(chainsOf(res.profile).primary!.moves.map((x) => x.uid)).toEqual(['c-l']);
    expect(movesetOf(registry, res.profile.equipped.weapon!).chains.primary!.moves.map((x) => x.uid)).toEqual(['c-l', 'c-d']);
    // A changed form on it is refused.
    const changed = { ...reordered, moves: [live, { ...dormant, form: 'whirl' as const }] };
    expect(setChain(registry, p, 'primary', changed).reason).toBe("A bow can't express Whirl");
  });
});

describe('pricing by uid', () => {
  const E = bal.movesets.editDust;
  const X = bal.movesets.elementDust;
  const mv = (uid: string | undefined, kind: Move['kind'], ...elements: Move['elements']): Move => ({
    ...(uid && { uid }),
    kind,
    form: 'strike',
    elements,
  });
  const chain = (...moves: Move[]): Chain => ({ moves, payment: 'mana' });
  const price = (old: Chain, next: Chain) =>
    movesetEditPrice(registry, { primary: old }, { primary: next });
  const A = mv('a', 'light', 'fire');
  const B = mv('b', 'medium', 'fire');
  const C = mv('c', 'heavy', 'storm');

  it('a reorder is free; a removal, a new construct and a changed shape or set each pay', () => {
    expect(price(chain(A, B, C), chain(A, B, C))).toBe(0);
    expect(price(chain(A, B, C), chain(C, A, B))).toBe(0);
    expect(price(chain(A, B, C), chain(A, C))).toBe(E);
    expect(price(chain(A, C), chain(A, mv(undefined, 'medium', 'fire'), C))).toBe(E);
    expect(price(chain(A, C), chain(A, mv('zz', 'medium', 'fire'), C))).toBe(E);
    expect(price(chain(A, B), chain(A, { ...B, kind: 'heavy' }))).toBe(E);
    expect(price(chain(A, B), chain(A, { ...B, form: 'lance' }))).toBe(E);
    expect(price(chain(A, B), chain(A, { ...B, elements: ['storm'] }))).toBe(X);
    expect(price(chain(A, B), chain(A, { ...B, kind: 'heavy', elements: ['storm', 'fire'] }))).toBe(E + X);
    // Removed and a new one alike: two edits.
    expect(price(chain(A, B), chain(A, mv(undefined, 'medium', 'fire')))).toBe(2 * E);
    expect(price(chain(A), { moves: [A], payment: 'cast' })).toBe(E);
    // A new element set once per Apply; one a saved construct has, never.
    expect(price(chain(A, B), chain({ ...A, elements: ['nature'] }, { ...B, elements: ['nature'] }, mv(undefined, 'light', 'nature')))).toBe(X + E);
    expect(price(chain(A, C), chain(A, C, mv(undefined, 'light', 'storm')))).toBe(E);
  });

  it('setChains mints a uid for each new construct and keeps the rest; sameChain reads a reorder', () => {
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
    const p = { ...p0, manaDust: 99, stats: { ...p0.stats, dives: 1 } };
    const [a, b] = chainsOf(p).primary!.moves;
    const next = { ...chainsOf(p).primary!, moves: [b, a] };
    const moved = setChain(registry, p, 'primary', next);
    expect(moved.profile.manaDust).toBe(99);
    expect(chainsOf(moved.profile).primary!.moves.map((m) => m.uid)).toEqual([b.uid, a.uid]);
    const added = setChains(registry, { ...withChains(p, { primary: { ...next, moves: [a] } }), manaDust: 99 }, {
      primary: { ...next, moves: [a, { kind: 'heavy', form: 'strike', elements: ['fire'] }] },
    });
    expect(added.profile.manaDust).toBe(99 - E);
    const ids = chainsOf(added.profile).primary!.moves.map((m) => m.uid);
    expect(ids[0]).toBe(a.uid);
    expect(ids[1]).toMatch(/^c\d+$/);
    expect(ids[1]).not.toBe(b.uid);
  });
});

describe('slots: bought, the ceiling, Open a skill', () => {
  const rich = () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    return { ...p, links: 99, scrap: 9999 };
  };

  it('addSlot counts as bought up to the ceiling; the basic chain at its ceiling has none to buy', () => {
    const p = rich();
    const sword = p.equipped.weapon!;
    expect(slotPrice(registry, sword, 'primary')).toEqual({ links: 2, scrap: 40 });
    expect(slotPrice(registry, sword, 'basic')).toBeNull(); // a common's string of 3 is its ceiling
    expect(slotPrice(registry, sword, 'defensive')).toBeNull(); // 0 slots: Open a skill's
    const one = addSlot(registry, p, 'primary');
    expect(one.ok).toBe(true);
    const m = movesetOf(registry, one.profile.equipped.weapon!);
    expect([m.slots.primary, m.bought.primary]).toEqual([3, 1]);
    expect(m.chains.primary!.moves[2]).toMatchObject({ kind: 'heavy', form: 'strike', elements: ['fire'] });
    expect(m.chains.primary!.moves[2].uid).toMatch(/^c\d+$/);
    expect(addSlot(registry, one.profile, 'primary').reason).toBe('This chain has every slot');
    expect(addSlot(registry, p, 'defensive').reason).toBe('Open this skill on the Temper bench');
  });

  it("Open a skill: a common sword's Defensive for the rarity's price, bought, plain-filled; the Ultimate's ceiling is 0", () => {
    const p0 = rich();
    const p = { ...p0, materials: withMaterial(p0.materials, { kind: 'flux', grade: 'uncommon' }, 5) };
    const sword = p.equipped.weapon!;
    const price = openSkillPrice(registry, sword);
    expect(price).toEqual({ flux: { uncommon: 2 }, links: 1, scrap: 40 });
    const res = openSkill(registry, p, sword.uid, 'defensive');
    expect(res.ok, res.reason).toBe(true);
    const m = movesetOf(registry, res.item!);
    expect([m.slots.defensive, m.bought.defensive]).toEqual([1, 1]);
    expect(m.chains.defensive).toEqual({
      moves: [{ uid: expect.stringMatching(/^c\d+$/), kind: 'medium', form: 'ward', elements: ['fire'] }],
      payment: 'mana',
    });
    expect(res.profile.materials.flux.uncommon).toBe(p.materials.flux.uncommon - 2);
    expect(res.profile).toMatchObject({ links: 98, scrap: 9999 - 40 });
    expect(res.profile.tutorial).toBeNull();
    expect(openSkill(registry, res.profile, sword.uid, 'defensive').reason).toBe('This skill is open already');
    expect(openSkill(registry, p, sword.uid, 'ultimate').reason).toBe("A common weapon can't open its ultimate");
    expect(openSkill(registry, p, p.equipped.chest!.uid, 'defensive').reason).toBe('Only a weapon opens a skill');
    expect(openSkill(registry, { ...p, links: 0 }, sword.uid, 'defensive').reason).toBe('Not enough Links');
    const noFlux = { ...p, materials: withMaterial(p.materials, { kind: 'flux', grade: 'uncommon' }, -p.materials.flux.uncommon) };
    expect(openSkill(registry, noFlux, sword.uid, 'defensive').reason).toBe('Not enough uncommon flux');
    expect(openSkill(registry, startDive(registry, p, 1), sword.uid, 'defensive').reason).toBe('Forge at the Anvil, between dives');
    // On a bag weapon too, and the rare's price is the rare row's.
    const rare = weapon('rare', 'axe', 'ax');
    const withRare = { ...p, bag: [rare], materials: withMaterial(p.materials, { kind: 'flux', grade: 'rare' }, 1) };
    expect(openSkillPrice(registry, rare).flux).toEqual({ rare: 1 });
    // A rare axe's Ultimate starts open (1); its Primary, Defensive too: nothing to open.
    expect(openSkill(registry, withRare, 'ax', 'ultimate').reason).toBe('This skill is open already');
  });

  it('salvage gives one Link per bought slot: a forged or found weapon, none', () => {
    const p = rich();
    const bought = addSlot(registry, p, 'primary').profile;
    const sword = bought.equipped.weapon!;
    expect(weaponParts(registry, sword).links).toBe(1);
    const inBag = { ...bought, equipped: { ...bought.equipped, weapon: weapon('rare', 'sword', 'other') }, bag: [sword] };
    expect(salvageItems(registry, inBag, [sword.uid]).links).toBe(1);
    for (const r of RARITY_ORDER) expect(weaponParts(registry, weapon(r, 'bow')).links).toBe(0);
  });

  it('an upgrade keeps the weapon as it is when every skill is at its start', () => {
    const p = rich();
    const res = upgradeGear(registry, p, p.equipped.weapon!.uid);
    expect(res.ok).toBe(true);
    expect(movesetOf(registry, res.item!)).toEqual(movesetOf(registry, p.equipped.weapon!));
  });
});

describe('sockets and runes', () => {
  it("every weapon's constructs take up to MAX_SOCKETS; the pull rule ships 'pay'", () => {
    expect(bal.runes.unsocket).toBe('pay');
    expect(bal.runes).not.toHaveProperty('socketCap');
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
    let p = { ...p0, links: 99, scrap: 9999 };
    for (let i = 0; i < 3; i++) {
      const res = openSocket(registry, p, 'primary', 0);
      expect(res.ok, res.reason).toBe(true);
      p = res.profile;
    }
    expect(chainsOf(p).primary!.moves[0].runes).toEqual([null, null, null]);
    expect(openSocket(registry, p, 'primary', 0).reason).toBe('This move has every socket');
  });

  it("a drop's open socket may hold a rune, by rarity, on its own fork; the Detonate row fits the contact forms", () => {
    const det = registry.getRune('detonate');
    expect(det.fits).toEqual({ forms: ['strike', 'whirl', 'volley', 'lance', 'onslaught'], weapons: [] });
    expect(det.tiers.map((t) => t.detonate)).toEqual([0.25, 0.3, 0.35, 0.4, 0.45]);
    expect(det.load).toEqual([0.3, 0.35, 0.4, 0.45, 0.5]);
    let socketed = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const w = weapon('legendary', 'sword', 'l', seed);
      const runes = Object.values(movesetOf(registry, w).chains).flatMap((c) =>
        (Array.isArray(c) ? c : c.moves).flatMap((m) => m.runes ?? []),
      );
      if (runes.some((r) => r !== null)) socketed++;
      expect(runes.filter((r) => r !== null).length).toBeLessThanOrEqual(1);
    }
    expect(socketed).toBeGreaterThan(30);
    expect(socketed).toBeLessThan(120);
    for (let seed = 1; seed <= 50; seed++) {
      const w = weapon('uncommon', 'sword', 'u', seed);
      const m = movesetOf(registry, w);
      expect(rollSocketedRunes(registry, w, m, new SeededRNG(seed))).toBe(m);
    }
  });
});

describe('the bag, the haul and the load', () => {
  it('a banked weapon takes uids as it enters the bag; a drop has none', () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    const drop = weapon('rare', 'axe', 'drop');
    expect(movesetOf(registry, drop).chains.basic![0].uid).toBeUndefined();
    const res = addLootToBag(registry, p, [drop]);
    const banked = res.profile.bag.find((i) => i.uid === 'drop')!;
    const ids = Object.values(movesetOf(registry, banked).chains).flatMap((c) =>
      Array.isArray(c) ? c.map((b) => b.uid) : c.moves.map((m) => m.uid),
    );
    expect(ids.every((u) => /^c\d+$/.test(u!))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(res.profile.nextConstructUid).toBe(p.nextConstructUid + ids.length);
    expect(res.profile.nextUid).toBe(p.nextUid);
    // The next drop's uids follow: never the same.
    const again = addLootToBag(registry, res.profile, [{ ...drop, uid: 'drop2' }]);
    const twice = again.profile.bag.flatMap((i) =>
      Object.values(movesetOf(registry, i).chains).flatMap((c) =>
        Array.isArray(c) ? c.map((b) => b.uid) : c.moves.map((m) => m.uid),
      ),
    );
    expect(new Set(twice).size).toBe(twice.length);
  });

  it('a save round-trips with its constructs and bag; a uid twice or slots bought past the slots resets, a chain past its slots is refused', () => {
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
    const [uid, p1] = mintUid(p0);
    const p = { ...p1, constructs: [{ uid, kind: 'medium' as const, form: 'bolt' as const, elements: ['fire' as const], runes: [null] }] };
    expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p });
    const sword = p.equipped.weapon!;
    const m = sword.moveset!;
    const dup = { ...p, constructs: [{ ...p.constructs[0], uid: m.chains.basic![0].uid! }] };
    expect(parseDelveProfile(registry, json(dup))).toEqual({ reset: true });
    const overBought = { ...p, equipped: { ...p.equipped, weapon: { ...sword, moveset: { ...m, bought: { primary: 5 } } } } };
    expect(parseDelveProfile(registry, json(overBought))).toEqual({ reset: true });
    const past = { ...p, equipped: { ...p.equipped, weapon: { ...sword, moveset: { ...m, slots: { ...m.slots, primary: 1 } } } } };
    expect(parseDelveProfile(registry, json(past))).toBeNull(); // the schema itself: a chain past its slots
    // A save without uids loads: they are minted (v14 requires them).
    const bare = json(p);
    for (const b of bare.equipped.weapon.moveset.chains.basic) delete b.uid;
    const loaded = parseDelveProfile(registry, bare)!;
    expect('profile' in loaded && loaded.profile.equipped.weapon!.moveset!.chains.basic!.every((b) => !!b.uid)).toBe(true);
  });

  it('the choice of mana replaces the constructs with plain ones in the primary, minted', () => {
    const p = createDelveProfile(registry, 5);
    const before = uids(p);
    const chosen = chooseStartingMana(registry, p, 'frost').profile;
    expect(chosen.pair.primary).toBe('frost');
    expect(uids(chosen).some((u) => before.includes(u))).toBe(false);
    expect(chainsOf(chosen).primary!.moves.every((m) => m.elements[0] === 'frost')).toBe(true);
  });

  it('a forged weapon takes its constructs uids, its free extras not bought', () => {
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
    const p = { ...p0, scrap: 9999, patterns: ['sword'], materials: withMaterial(withMaterial(p0.materials, { kind: 'metal', metal: 'iron' }, 1), { kind: 'flux', grade: 'rare' }, 1) };
    const res = forge(registry, p, { baseId: 'sword', metal: 'iron', flux: 'rare', element: 'fire', shards: [] });
    expect(res.ok, res.reason).toBe(true);
    const m = movesetOf(registry, res.item!);
    expect(m.slots).toEqual({ basic: 3, primary: 4, defensive: 2, ultimate: 1 });
    expect(m.bought).toEqual({});
    const ids = Object.values(m.chains).flatMap((c) => (Array.isArray(c) ? c.map((b) => b.uid) : c.moves.map((x) => x.uid)));
    expect(ids.every((u) => /^c\d+$/.test(u!))).toBe(true);
    expect(res.item!.uid).toBe(`g${p.nextUid}`);
  });
});

describe('moveAllPreview and the draft dry run', () => {
  it('moves the constructs slot for slot, the rest to the bag; the old weapon refills plain; dormant ones stay', () => {
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
    const worn = { ...p0.equipped.weapon!, moveset: { ...p0.equipped.weapon!.moveset!, bought: { primary: 1 } } };
    const bow = weapon('rare', 'bow', 'bow');
    const prev = moveAllPreview(registry, worn, bow);
    const own = movesetOf(registry, bow);
    // The sword's two Strikes sit in the bow's Primary (3 slots): dormant; the bow's own three go to the bag.
    expect(prev.moveset.chains.primary!.moves.map((m) => m.uid)).toEqual(worn.moveset.chains.primary!.moves.map((m) => m.uid));
    expect(prev.dormant.sort()).toEqual(worn.moveset.chains.primary!.moves.map((m) => m.uid).sort());
    expect(prev.toBag.filter((c) => 'form' in c && c.form === 'bolt')).toHaveLength(own.chains.primary!.moves.length);
    // The bow's Defensive and Ultimate keep their own constructs: nothing moved in.
    expect(prev.moveset.chains.defensive).toEqual(own.chains.defensive);
    expect(prev.moveset.chains.ultimate).toEqual(own.chains.ultimate);
    expect(prev.moveset.slots).toEqual(own.slots);
    // The old sword: its bought slot kept, plain-filled to its starts, no uids.
    expect(prev.old.slots).toEqual({ basic: 3, primary: 2 });
    expect(prev.old.bought).toEqual({ primary: 1 });
    expect(prev.old.chains.primary!.moves.every((m) => !m.uid && m.form === 'strike')).toBe(true);
    expect(prev.old.chains.basic).toHaveLength(3);
  });

  it("draftRefusal: a lost non-plain construct, a uid in two places, the wrong skill; the ops refuse 'Not yet'", () => {
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
    const [uid, p1] = mintUid(p0);
    const socketed: Move = { uid, kind: 'medium', form: 'strike', elements: ['fire'], runes: [null] };
    const p = { ...p1, constructs: [socketed] };
    const chains = movesetOf(registry, p.equipped.weapon!).chains;
    expect(draftRefusal(registry, p, { chains: {}, bag: [socketed] })).toBeNull();
    expect(draftRefusal(registry, p, { chains: {}, bag: [] })).toBe(`${uid} would be lost`);
    expect(draftRefusal(registry, p, { chains: { primary: { ...chains.primary!, moves: [chains.primary!.moves[0], socketed] } }, bag: [socketed] })).toBe(`${uid} is in two places`);
    const ward = { ...socketed, form: 'ward' as const };
    expect(draftRefusal(registry, { ...p, constructs: [ward] }, { chains: { primary: { ...chains.primary!, moves: [chains.primary!.moves[0], ward] } }, bag: [] })).toBe(`${uid} is not a primary construct`);
    expect(draftRefusal(registry, p, { chains: { primary: { ...chains.primary!, moves: [] } }, bag: [socketed, ...chains.primary!.moves] })).toBeNull();
    expect(draftRefusal(registry, p, { chains: { basic: [] }, bag: [socketed, ...chains.basic!] })).toBe('A chain holds 1 to 3 moves');
    expect(moveAll(registry, p, 'x').reason).toBe('Not yet');
    expect(applyDraft(registry, p, { chains: {}, bag: [socketed] }).reason).toBe('Not yet');
    expect(draftPrice(registry, p, chains)).toMatchObject({ dust: 0, links: 0 });
    expect(equipItem(registry, { ...p, bag: [weapon('rare', 'bow', 'bow')] }, 'bow').equipped.weapon!.uid).toBe('bow');
  });
});

```

Apply to `packages/engine/tests/delve-crafting-data.test.ts`:

```diff
@@ -124,14 +124,12 @@ describe('CraftingDataSchema', () => {
 describe('balance: delve.crafting and delve.drops', () => {
   const bal = registry.getDelveBalance();
 
-  it("loads both blocks; a forged weapon's extras start at the low end of a drop's", () => {
+  it("loads both blocks; a forged weapon's free extra slots start at the low end of a drop's (no sockets: they belong to the constructs)", () => {
     expect(bal.crafting.deathLoss).toBe(0.4);
     expect(bal.crafting.shardBench).toEqual({ scrap: 30, dust: 5 });
     for (const r of RARITY_ORDER)
-      expect(bal.crafting.weaponExtras[r]).toEqual({
-        slots: bal.movesets.extraSlots[r][0],
-        sockets: bal.runes.socketDrops[r][0],
-      });
+      expect(bal.crafting.weaponExtras[r]).toEqual({ slots: bal.movesets.extraSlots[r][0] });
+    expect(bal.crafting).not.toHaveProperty('awaken');
     expect(bal.drops.scrapByKind).toEqual({ normal: 9, elite: 27, boss: 90 });
     expect([bal.drops.magnetSpeed, bal.drops.vacuumSpeed, bal.drops.pickupDelay]).toEqual([
       10, 18, 0.35,

```

Apply to `packages/engine/tests/delve-dive.test.ts`:

```diff
@@ -64,14 +64,15 @@ function clearDepth(p: DelveProfile): DelveProfile {
 }
 
 describe('profile basics', () => {
-  it('starts with a fire sword (its basic chain alone) and an earth cuirass, and Fire chains', () => {
+  it('starts with a fire sword (its basic chain and a two-slot Primary) and an earth cuirass, and Fire chains', () => {
     const p = createDelveProfile(registry, 123);
     expect(p.version).toBe(13);
     expect(p.links).toBe(0);
     expect(p.equipped.weapon?.mana).toBe('fire');
     expect(p.equipped.chest?.mana).toBe('earth');
-    expect(Object.keys(chainsOf(p))).toEqual(['basic']);
+    expect(Object.keys(chainsOf(p))).toEqual(['basic', 'primary']);
     expect(chainsOf(p).basic!.every((b) => b.element === 'fire')).toBe(true);
+    expect(chainsOf(p).primary!.moves.map((m) => m.form)).toEqual(['strike', 'strike']);
     expect(p.bag).toHaveLength(0);
     expect(p.dive).toBeNull();
   });
@@ -274,13 +275,13 @@ describe('gear management', () => {
     expect(beginFloor(registry, startDive(registry, p, 1)).hero.manaMax).toBeGreaterThan(before);
   });
 
-  it("unequip moves the item into the bag; the floor has the common sword's basic chain alone: no Primary, Defensive or Ultimate", () => {
+  it("unequip moves the item into the bag; the floor has the common sword's Primary alone: no Defensive or Ultimate", () => {
     let p = createDelveProfile(registry, 1);
     p = unequipSlot(registry, p, 'chest');
     expect(p.equipped.chest).toBeUndefined();
     expect(p.bag).toHaveLength(1);
     p = startDive(registry, p, 1);
-    expect(beginFloor(registry, p).hero.chains).toEqual([null, null, null]);
+    expect(beginFloor(registry, p).hero.chains.map((c) => c && c.moves.length)).toEqual([2, null, null]);
   });
 
   it('equipBest picks upgrades, but never a weapon', () => {

```

Apply to `packages/engine/tests/delve-dps-sim.test.ts`:

```diff
@@ -386,8 +386,8 @@ describe('the rune view (see the runes spec)', () => {
   const socketed = runeRows.filter((s) => s.dims.rune !== 'none');
   const echo = [{ id: 'echo', tier: 3 }];
 
-  it('192 rune rows, each rune on every attack form and weapon it fits, and 34 baselines', () => {
-    expect(socketed).toHaveLength(192);
+  it('197 rune rows (Detonate on its five forms since the constructs), each rune on every attack form and weapon it fits, and 34 baselines', () => {
+    expect(socketed).toHaveLength(197);
     expect(runeRows.filter((s) => s.dims.rune === 'none')).toHaveLength(34);
     expect(socketed.filter((s) => s.dims.rune === 'split').map((s) => s.dims.on)).toEqual([
       'bolt',

```

Apply to `packages/engine/tests/delve-forge.test.ts`:

```diff
@@ -20,7 +20,7 @@ import {
   shardTiersOf,
   withMaterial,
 } from '../src/loot/materials.js';
-import { baseSlots } from '../src/loot/moveset.js';
+import { slotRange } from '../src/loot/moveset.js';
 import { socketsOf } from '../src/loot/runes.js';
 import { forge, hone, imprint } from '../src/delve/crafting.js';
 import { startDive } from '../src/delve/dive.js';
@@ -255,20 +255,24 @@ describe('previewForge', () => {
     expect(prev.weapon).toBeNull();
   });
 
-  it("places a weapon's extras by S7: the Primary's slots first, sockets on its first moves", () => {
+  it("shows a weapon's class and each skill's slots against its ceiling: the free extras on the Primary first, no sockets", () => {
     const p = smith();
     const weapon = (flux?: FluxGrade) =>
       previewForge(registry, p, req({ baseId: 'sword', flux })).weapon;
-    expect(weapon()).toEqual({ carries: ['basic'], slots: { basic: 0 }, sockets: 0 });
+    expect(weapon()).toEqual({
+      class: 'melee',
+      slots: { basic: [3, 3], primary: [2, 3], defensive: [0, 1], ultimate: [0, 0] },
+      sockets: 0,
+    });
     expect(weapon('rare')).toEqual({
-      carries: ['basic', 'primary', 'defensive'],
-      slots: { basic: 0, primary: C.weaponExtras.rare.slots, defensive: 0 },
-      sockets: C.weaponExtras.rare.sockets,
+      class: 'melee',
+      slots: { basic: [3, 4], primary: [3 + C.weaponExtras.rare.slots, 4], defensive: [2, 3], ultimate: [1, 2] },
+      sockets: 0,
     });
     expect(weapon('epic')).toEqual({
-      carries: ['basic', 'primary', 'defensive', 'ultimate'],
-      slots: { basic: 0, primary: C.weaponExtras.epic.slots, defensive: 0, ultimate: 0 },
-      sockets: C.weaponExtras.epic.sockets,
+      class: 'melee',
+      slots: { basic: [3 + 1, 5], primary: [5, 5], defensive: [2, 4], ultimate: [1, 3] },
+      sockets: 0,
     });
   });
 
@@ -386,15 +390,17 @@ describe('forgeItem', () => {
         continue;
       }
       const m = item.moveset!;
-      expect(Object.keys(m.chains).sort()).toEqual([...prev.weapon.carries].sort());
-      for (const s of prev.weapon.carries)
-        expect(m.slots[s]! - baseSlots(registry, r.baseId, s)).toBe(prev.weapon.slots[s]);
+      for (const s of CHAIN_SKILLS) {
+        expect(m.slots[s] ?? 0).toBe(prev.weapon.slots[s][0]);
+        expect(prev.weapon.slots[s][1]).toBe(slotRange(registry, item, s)[1]);
+      }
+      expect(m.bought).toEqual({});
       const sockets = CHAIN_SKILLS.flatMap((s) => movesOf(m.chains[s])).flatMap(socketsOf);
       expect(sockets).toHaveLength(prev.weapon.sockets);
     }
   });
 
-  it('rolls the same item from the same stream, named by its rarity, sockets on the Primary first', () => {
+  it('rolls the same item from the same stream, named by its rarity, no sockets', () => {
     const p = smith();
     expect(forgeItem(registry, p, reqs[2], new SeededRNG(9))).toEqual(
       forgeItem(registry, p, reqs[2], new SeededRNG(9)),
@@ -402,7 +408,7 @@ describe('forgeItem', () => {
     const helm = forgeItem(registry, p, reqs[0], new SeededRNG(1));
     expect(helm.name).toBe(`Rusty ${registry.getGearBase('helm').name}`);
     const primary = forgeItem(registry, p, reqs[4], new SeededRNG(1)).moveset!.chains.primary!;
-    expect(primary.moves.map((m) => socketsOf(m).length)).toEqual([1, 1, 0, 0]);
+    expect(primary.moves.map((m) => socketsOf(m).length)).toEqual([0, 0, 0, 0, 0]);
   });
 
   it("previews each shard line's and the legendary's range as the floored draw's ends", () => {
@@ -447,7 +453,12 @@ describe('forge: the profile op', () => {
     const prev = previewForge(registry, p, r);
     const res = forge(registry, p, r);
     expect(res.ok).toBe(true);
-    expect(res.item).toEqual(forgeItem(registry, p, r, forgeStream(p)));
+    // The forged item, its constructs minted uids (the constructs spec §3.1).
+    const rolled = forgeItem(registry, p, r, forgeStream(p));
+    expect(JSON.parse(JSON.stringify(res.item, (k, v) => (k === 'uid' && /^c\d+$/.test(v) ? undefined : v)))).toEqual(rolled);
+    const minted = CHAIN_SKILLS.flatMap((s) => movesOf(res.item!.moveset!.chains[s])).map((m) => m.uid);
+    expect(minted.every((u) => /^c\d+$/.test(u!))).toBe(true);
+    expect(res.profile.nextConstructUid).toBe(p.nextConstructUid + minted.length);
     const q = res.profile;
     expect(q.bag).toEqual([...p.bag, res.item]);
     expect(q.scrap).toBe(p.scrap - prev.price.scrap);

```

Apply to `packages/engine/tests/delve-materials.test.ts`:

```diff
@@ -28,7 +28,14 @@ describe('the pouch and the haul', () => {
       shards: {},
       essences: {},
     });
-    expect(emptyHaul()).toEqual({ ...emptyMaterials(), scrap: 0, dust: 0, links: 0, runes: {} });
+    expect(emptyHaul()).toEqual({
+      ...emptyMaterials(),
+      scrap: 0,
+      dust: 0,
+      links: 0,
+      runes: {},
+      constructs: [],
+    });
     // Fresh each time: no shared records.
     const a = emptyHaul();
     a.metals.iron = 3;

```

## Chunk 7: Task 4 — The switch: constructs with uids, the slot table, Open a skill, Move all's preview, runes on any weapon (continued)

Apply to `packages/engine/tests/delve-movesets.test.ts`:

```diff
@@ -6,26 +6,27 @@ import { generateItem } from '../src/loot/item-generator.js';
 import { emptyMaterials } from '../src/loot/materials.js';
 import { rollEncounterDrops } from '../src/loot/drops.js';
 import {
-  baseSlots,
-  carriedFrom,
-  carriedSkills,
   defaultChain,
   defaultMoveset,
-  extraSlots,
   heroChains,
+  moveAllPreview,
+  slotRange,
+  weaponParts,
 } from '../src/loot/moveset.js';
 import { GearItemSchema } from '../src/delve/profile-schema.js';
 import { betweenDives } from '../src/delve/autopilot.js';
 import { bankWorld, beginFloor, startDive } from '../src/delve/dive.js';
 import {
+  OPEN_SKILL_TEXT,
   addSlot,
   movesetEditPrice,
   movesOf,
+  sameChain,
   setChain,
   setChains,
   slotPrice,
-  transferMoveset,
 } from '../src/delve/moveset.js';
+import { moveAll } from '../src/delve/constructs.js';
 import { bindSecondary, chooseStartingMana, reattuneItem } from '../src/delve/pair.js';
 import {
   addLootToBag,
@@ -60,6 +61,8 @@ import {
   type Blow,
   type Chain,
   type Chains,
+  type ChainSkill,
+  type Construct,
   type Move,
 } from '../src/types/ability.js';
 import type { ArpgEvent } from '../src/types/arpg.js';
@@ -80,10 +83,12 @@ import {
   registry,
   run,
   withChains,
+  withUids,
 } from './fixtures/arena.js';
 import { armed } from './fixtures/carries.js';
 
-// See the weapon movesets spec.
+// See the weapon movesets spec, as the constructs spec §3 rewrites it: the weapon is a frame
+// with slots by rarity, holding constructs with uids.
 
 const weapon = (rarity: Rarity, seed: number, baseId?: string): GearItem =>
   generateItem(
@@ -92,15 +97,19 @@ const weapon = (rarity: Rarity, seed: number, baseId?: string): GearItem =>
     new SeededRNG(seed),
   );
 
+/** A chain's constructs without their uids. */
+const bare = <C extends Chains[ChainSkill] | undefined>(c: C): C =>
+  JSON.parse(
+    JSON.stringify(c, (k, v) =>
+      k === 'uid' && typeof v === 'string' && v.startsWith('c') ? undefined : v,
+    ),
+  );
+
 describe('data: movesets', () => {
-  it('loads the chains each rarity carries, the extra slots and the prices', () => {
+  it('loads the slot table, the extra slots, Open a skill and the prices', () => {
     const m = bal.movesets;
-    expect(m.carries.common).toEqual(['basic']);
-    expect(m.carries.uncommon).toEqual(['basic', 'primary']);
-    expect(m.carries.magic).toEqual(['basic', 'primary']);
-    expect(m.carries.rare).toEqual(['basic', 'primary', 'defensive']);
-    expect(m.carries.epic).toEqual(['basic', 'primary', 'defensive', 'ultimate']);
-    expect(m.carries.legendary).toEqual(['basic', 'primary', 'defensive', 'ultimate']);
+    expect(m.slots.common).toEqual({ basic: [0, 3], primary: [2, 3], defensive: [0, 1], ultimate: [0, 0] });
+    expect(m.slots.legendary).toEqual({ basic: [0, 5], primary: [4, 5], defensive: [3, 5], ultimate: [2, 5] });
     expect(m.extraSlots).toEqual({
       common: [0, 0],
       uncommon: [0, 0],
@@ -111,84 +120,84 @@ describe('data: movesets', () => {
     });
     expect(m.slotLinks).toEqual([1, 2, 3, 4]);
     expect(m.slotScrap).toEqual([20, 40, 60, 80]);
-    expect([m.editDust, m.elementDust, m.transferScrap]).toEqual([5, 15, 30]);
-    expect(bal.chains.cap).toEqual({ basic: 5, primary: 5, defensive: 5, ultimate: 5 });
+    expect([m.editDust, m.elementDust, m.salvageDust]).toEqual([5, 15, 0]);
+    expect(m.openSkill.common).toEqual({ flux: { uncommon: 2 }, links: 1, scrap: 40 });
+    expect(m).not.toHaveProperty('carries');
+    expect(m).not.toHaveProperty('transferScrap');
   });
 
-  it('refuses a rarity that carries no basic chain or less than the rarity below, a legendary short of all four, or extra slots that fall', () => {
+  it('refuses extra slots that fall, and a slot row short of a skill', () => {
     const withMovesets = (movesets: object) => ({
       ...balanceData,
       delve: { ...balanceData.delve, movesets: { ...balanceData.delve.movesets, ...movesets } },
     });
-    const carries = { ...balanceData.delve.movesets.carries, common: ['primary'] };
-    expect(BalanceConfigSchema.safeParse(withMovesets({ carries })).success).toBe(false);
-    const shrinks = { ...balanceData.delve.movesets.carries, rare: ['basic'] };
-    expect(BalanceConfigSchema.safeParse(withMovesets({ carries: shrinks })).success).toBe(false);
-    const noUltimate = Object.fromEntries(
-      Object.entries(balanceData.delve.movesets.carries).map(([r, s]) => [
-        r,
-        s.filter((skill) => skill !== 'ultimate'),
-      ]),
-    );
-    expect(BalanceConfigSchema.safeParse(withMovesets({ carries: noUltimate })).success).toBe(
-      false,
-    );
     const extraSlots = { ...balanceData.delve.movesets.extraSlots, rare: [2, 1] };
     expect(BalanceConfigSchema.safeParse(withMovesets({ extraSlots })).success).toBe(false);
-    expect(BalanceConfigSchema.safeParse(balanceData).success).toBe(true);
+    const { ultimate: _u, ...short } = balanceData.delve.movesets.slots.rare;
+    const slots = { ...balanceData.delve.movesets.slots, rare: short };
+    expect(BalanceConfigSchema.safeParse(withMovesets({ slots })).success).toBe(false);
   });
 });
 
-describe('base slots and carried chains', () => {
-  it("gives the basic chain its weapon's string length (unarmed, the hero's), every other chain 1", () => {
-    expect(baseSlots(registry, 'sword', 'basic')).toBe(3);
-    expect(baseSlots(registry, 'maul', 'basic')).toBe(2);
-    expect(baseSlots(registry, 'dagger', 'basic')).toBe(4);
-    expect(baseSlots(registry, null, 'basic')).toBe(3);
+describe('slot ranges', () => {
+  it("gives the basic chain its weapon's string as its start (unarmed, the hero's), the rest the table's", () => {
+    expect(slotRange(registry, { baseId: 'sword', rarity: 'common' }, 'basic')).toEqual([3, 3]);
+    expect(slotRange(registry, { baseId: 'maul', rarity: 'epic' }, 'basic')).toEqual([2, 5]);
+    expect(slotRange(registry, { baseId: 'dagger', rarity: 'common' }, 'basic')).toEqual([4, 4]);
+    expect(slotRange(registry, { baseId: null, rarity: null }, 'basic')).toEqual([3, 3]);
     for (const skill of ['primary', 'defensive', 'ultimate'] as const) {
-      expect(baseSlots(registry, 'sword', skill)).toBe(1);
-      expect(baseSlots(registry, null, skill)).toBe(1);
+      expect(slotRange(registry, { baseId: 'sword', rarity: 'rare' }, skill)).toEqual(
+        bal.movesets.slots.rare[skill],
+      );
+      expect(slotRange(registry, { baseId: null, rarity: null }, skill)).toEqual([0, 0]);
     }
   });
-
-  it('carries chains by rarity; unarmed carries the basic chain alone', () => {
-    for (const r of RARITY_ORDER)
-      expect(carriedSkills(registry, { rarity: r })).toEqual(bal.movesets.carries[r]);
-    expect(carriedSkills(registry, null)).toEqual(['basic']);
-    expect(carriedFrom(registry, 'basic')).toBeNull();
-    expect(carriedFrom(registry, 'primary')).toBe('uncommon');
-    expect(carriedFrom(registry, 'defensive')).toBe('rare');
-    expect(carriedFrom(registry, 'ultimate')).toBe('epic');
-  });
 });
 
 describe('default moves', () => {
-  it("fills a moveset at its base slots: the weapon's string, and each slot's default form's first move", () => {
+  it("fills a moveset at its starts: the weapon's string, and each skill's class default form", () => {
     const m = defaultMoveset(registry, { baseId: 'sword', rarity: 'uncommon' }, 'frost');
-    expect(m.slots).toEqual({ basic: 3, primary: 1 });
+    expect(m.slots).toEqual({ basic: 3, primary: 2, defensive: 1 });
+    expect(m.bought).toEqual({});
     expect(m.chains).toEqual({
       basic: [
         { kind: 'light', element: 'frost' },
         { kind: 'light', element: 'frost' },
         { kind: 'heavy', element: 'frost' },
       ],
-      primary: { moves: [{ kind: 'light', form: 'bolt', elements: ['frost'] }], payment: 'mana' },
-    });
-    const epic = defaultMoveset(registry, { baseId: 'maul', rarity: 'epic' }, 'fire');
-    expect(epic.slots).toEqual({ basic: 2, primary: 1, defensive: 1, ultimate: 1 });
-    expect(epic.chains.defensive).toEqual({
-      moves: [{ kind: 'medium', form: 'ward', elements: ['fire'] }],
-      payment: 'mana',
+      primary: {
+        moves: [
+          { kind: 'medium', form: 'strike', elements: ['frost'] },
+          { kind: 'medium', form: 'strike', elements: ['frost'] },
+        ],
+        payment: 'mana',
+      },
+      defensive: { moves: [{ kind: 'medium', form: 'ward', elements: ['frost'] }], payment: 'mana' },
     });
+    const epic = defaultMoveset(registry, { baseId: 'bow', rarity: 'epic' }, 'fire');
+    expect(epic.slots).toEqual({ basic: 3, primary: 4, defensive: 2, ultimate: 1 });
+    expect(epic.chains.primary!.moves.map((x) => [x.kind, x.form])).toEqual([
+      ['light', 'bolt'],
+      ['medium', 'bolt'],
+      ['medium', 'bolt'],
+      ['heavy', 'bolt'],
+    ]);
     expect(epic.chains.ultimate).toEqual({
       moves: [{ kind: 'medium', form: 'nova', elements: ['fire'] }],
       payment: 'charge',
     });
   });
 
-  it('plays the default chain in order, then medium past its end', () => {
+  it("plays the class default form's chain in order, then medium past its end", () => {
     const kinds = (c: Chain) => c.moves.map((m) => m.kind);
     expect(kinds(defaultChain(registry, 'primary', 'sword', 'fire', 5))).toEqual([
+      'medium',
+      'medium',
+      'heavy',
+      'heavy',
+      'medium',
+    ]);
+    expect(kinds(defaultChain(registry, 'primary', 'bow', 'fire', 5))).toEqual([
       'light',
       'medium',
       'medium',
@@ -218,56 +227,55 @@ describe('default moves', () => {
 });
 
 describe('drops: extra slots by rarity', () => {
-  const EXTRA: Record<Rarity, [number, number]> = {
-    common: [0, 0],
-    uncommon: [0, 0],
-    magic: [0, 1],
-    rare: [1, 2],
-    epic: [2, 3],
-    legendary: [3, 4],
-  };
+  /** A drop's slots past its starts, over the skills it has. */
+  const extra = (w: GearItem) =>
+    CHAIN_SKILLS.reduce(
+      (n, s) => n + Math.max(0, (w.moveset!.slots[s] ?? 0) - slotRange(registry, w, s)[0]),
+      0,
+    );
 
-  it("rolls the rarity's extra slots over the chains it carries, every slot a default move in its mana", () => {
+  it("rolls the rarity's extra slots over the skills it starts with, never a skill at 0, every slot a plain construct in its mana, none bought", () => {
     for (const rarity of RARITY_ORDER) {
       const seen = new Set<number>();
+      const starts = Object.keys(defaultMoveset(registry, { baseId: 'sword', rarity }, 'storm').chains);
       for (let seed = 1; seed <= 60; seed++) {
-        const w = weapon(rarity, seed);
+        const w = weapon(rarity, seed, 'sword');
         const m = w.moveset!;
-        expect(Object.keys(m.chains).sort()).toEqual([...bal.movesets.carries[rarity]].sort());
-        expect(Object.keys(m.slots).sort()).toEqual([...bal.movesets.carries[rarity]].sort());
-        const extra = extraSlots(registry, w);
-        seen.add(extra);
+        expect(Object.keys(m.chains).sort()).toEqual([...starts].sort());
+        expect(m.bought).toEqual({});
+        seen.add(extra(w));
+        for (const s of CHAIN_SKILLS)
+          if (m.slots[s]) expect(m.slots[s]).toBeLessThanOrEqual(slotRange(registry, w, s)[1]);
         expect(unsocketed(m)).toEqual(defaultMoveset(registry, w, 'storm', m.slots));
-        for (const skill of CHAIN_SKILLS) expect(m.slots[skill] ?? 0).toBeLessThanOrEqual(5);
       }
-      expect(Math.min(...seen)).toBe(EXTRA[rarity][0]);
-      expect(Math.max(...seen)).toBe(EXTRA[rarity][1]);
+      const [least, most] = bal.movesets.extraSlots[rarity];
+      expect(Math.min(...seen)).toBe(least);
+      expect(Math.max(...seen)).toBe(most);
     }
   });
 
-  it('spreads extra slots over every chain a weapon carries', () => {
-    const got = new Set<string>();
+  it('spreads extra slots over every skill a weapon starts with', () => {
+    const got = new Set<ChainSkill>();
     for (let seed = 1; seed <= 60; seed++) {
-      const w = weapon('rare', seed);
-      for (const skill of CHAIN_SKILLS)
-        if ((w.moveset!.slots[skill] ?? 0) > baseSlots(registry, w.baseId, skill)) got.add(skill);
+      const w = weapon('legendary', seed, 'sword');
+      for (const s of CHAIN_SKILLS)
+        if ((w.moveset!.slots[s] ?? 0) > slotRange(registry, w, s)[0]) got.add(s);
     }
-    expect([...got].sort()).toEqual(['basic', 'defensive', 'primary']);
+    expect([...got].sort()).toEqual(['basic', 'defensive', 'primary', 'ultimate']);
   });
 
-  it('never grows a chain past 5: a dagger basic string of 4 takes at most one extra', () => {
-    for (let seed = 1; seed <= 60; seed++)
-      expect(weapon('legendary', seed, 'dagger').moveset!.slots.basic).toBeLessThanOrEqual(5);
+  it('never grows a skill past its ceiling: a common dagger basic string of 4 stays at 4', () => {
+    for (let seed = 1; seed <= 20; seed++)
+      expect(weapon('common', seed, 'dagger').moveset!.slots.basic).toBe(4);
   });
 
   it('gives no moveset to gear other than weapons', () => {
     const chest = generateItem(
       registry,
-      { uid: 'c', ilvl: 5, rarity: 'legendary', slot: 'chest' },
-      new SeededRNG(3),
+      { uid: 'c', ilvl: 2, rarity: 'legendary', slot: 'chest' },
+      new SeededRNG(1),
     );
     expect(chest.moveset).toBeUndefined();
-    expect(extraSlots(registry, chest)).toBe(0);
   });
 });
 
@@ -314,19 +322,25 @@ describe('determinism', () => {
 describe('save schema: a weapon moveset', () => {
   const sword = weapon('uncommon', 1, 'sword');
 
-  it('reads an item with a moveset, and one without (a version 5 save)', () => {
+  it('reads an item with a moveset, and one without; `bought` defaults to none', () => {
     expect(GearItemSchema.safeParse(sword).success).toBe(true);
     const { moveset: _m, ...old } = sword;
     expect(GearItemSchema.safeParse(old).success).toBe(true);
+    const { bought: _b, ...noBought } = sword.moveset!;
+    expect(GearItemSchema.parse({ ...sword, moveset: noBought }).moveset!.bought).toEqual({});
   });
 
-  it('refuses a chain longer than its slots, a chain without slots, and slots without a chain', () => {
+  it('refuses a chain longer than its slots, a chain without slots, slots without a chain, and a Basic with no blow; an empty ability chain is fine', () => {
     const m = sword.moveset!;
     const bad = (moveset: object) => GearItemSchema.safeParse({ ...sword, moveset }).success;
     expect(bad({ ...m, slots: { ...m.slots, basic: 2 } })).toBe(false);
     expect(bad({ ...m, slots: { basic: 3 } })).toBe(false);
-    expect(bad({ ...m, slots: { ...m.slots, defensive: 1 } })).toBe(false);
+    expect(bad({ ...m, slots: { ...m.slots, ultimate: 1 } })).toBe(false);
     expect(bad({ ...m, slots: { ...m.slots, primary: 5 } })).toBe(true);
+    expect(bad({ ...m, chains: { ...m.chains, basic: [] } })).toBe(false);
+    expect(bad({ ...m, chains: { ...m.chains, primary: { moves: [], payment: 'mana' } } })).toBe(
+      true,
+    );
   });
 });
 
@@ -438,177 +452,137 @@ describe('an absent skill (a null chain)', () => {
 describe('a save: fitting its weapons to the data at load', () => {
   const json = (x: unknown) => JSON.parse(JSON.stringify(x));
 
-  it("fits a save's weapons to the data at load", () => {
+  it("gives a weapon without a moveset its defaults, minted; keeps a kept chain's slots; mints a missing uid", () => {
     const p = createDelveProfile(registry, 3, { primary: 'fire' });
-    const common = weapon('common', 4, 'sword');
-    const rare = weapon('rare', 5, 'axe');
     const { moveset: _m, ...bare } = weapon('magic', 6, 'bow');
-    const moveset = common.moveset!;
+    const rare = weapon('rare', 5, 'axe');
     const [one, two] = rare.moveset!.chains.basic!;
     const bag = [
-      bare, // no moveset: its base defaults
-      {
-        ...common,
-        moveset: {
-          chains: { ...moveset.chains, defensive: rare.moveset!.chains.defensive },
-          slots: { ...moveset.slots, defensive: 3 },
-        },
-      }, // a chain its rarity doesn't carry, with 2 extra slots
+      bare, // no moveset: its defaults, minted
       {
         ...rare,
         moveset: {
           chains: { basic: [one, two], primary: rare.moveset!.chains.primary },
           slots: { basic: 2, primary: rare.moveset!.slots.primary },
+          bought: {},
         },
-      }, // a Defensive to add, a basic slot count to raise
+      }, // two skills left out and a short basic string: kept as they are, uids minted
     ];
-    const loaded = parseDelveProfile(registry, json({ ...p, bag }))!.profile;
-    const fitted = loaded.bag;
-    expect(fitted[0].moveset).toEqual(defaultMoveset(registry, bare, 'storm'));
-    expect(fitted[1].moveset).toEqual(moveset);
-    // The dropped Defensive's extra slots come back as Links, as salvaging would give.
-    expect(loaded.links).toBe(p.links + 2);
-    expect(fitted[2].moveset!.chains.defensive).toEqual(
-      defaultMoveset(registry, rare, 'storm').chains.defensive,
+    const loaded = parseDelveProfile(registry, json({ ...p, bag }))!;
+    expect('profile' in loaded).toBe(true);
+    const fitted = (loaded as { profile: DelveProfile }).profile.bag;
+    expect(JSON.parse(JSON.stringify(fitted[0].moveset, (k, v) => (k === 'uid' ? undefined : v)))).toEqual(
+      JSON.parse(JSON.stringify(defaultMoveset(registry, bare, 'storm'))),
+    );
+    expect(fitted[1].moveset!.slots).toEqual({ basic: 2, primary: rare.moveset!.slots.primary });
+    expect(fitted[1].moveset!.chains.defensive).toBeUndefined();
+    const ids = [fitted[0], fitted[1]].flatMap((w) =>
+      CHAIN_SKILLS.flatMap((s) => movesOf(w.moveset!.chains[s]).map((c) => c.uid)),
     );
-    expect(fitted[2].moveset!.slots.defensive).toBe(1);
-    expect(fitted[2].moveset!.slots.basic).toBe(3);
-    expect(fitted[2].moveset!.chains.basic).toEqual([one, two]);
+    expect(ids.every((u) => /^c\d+$/.test(u!))).toBe(true);
+    expect(new Set(ids).size).toBe(ids.length);
   });
 });
 
-describe('the edit price (movesetEditPrice): by origin', () => {
+describe('the edit price (movesetEditPrice): by uid', () => {
   const E = bal.movesets.editDust;
   const X = bal.movesets.elementDust;
-  const bolt = (kind: Move['kind'], ...elements: ManaType[]): Move => ({
+  const strike = (uid: string | null, kind: Move['kind'], ...elements: ManaType[]): Move => ({
+    ...(uid && { uid }),
     kind,
-    form: 'bolt',
+    form: 'strike',
     elements,
   });
   const chain = (...moves: Move[]): Chain => ({ moves, payment: 'mana' });
-  const price = (old: Chain, next: Chain, origins?: (number | null)[]) =>
-    movesetEditPrice(
-      registry,
-      { primary: old },
-      { primary: next },
-      origins && { primary: origins },
-    );
-  const A = bolt('light', 'fire');
-  const B = bolt('medium', 'fire');
-  const C = bolt('heavy', 'storm');
+  const price = (old: Chain, next: Chain) =>
+    movesetEditPrice(registry, { primary: old }, { primary: next });
+  const A = strike('a', 'light', 'fire');
+  const B = strike('b', 'medium', 'fire');
+  const C = strike('c', 'heavy', 'storm');
 
-  it('prices what the builder did: removing or inserting a move costs only that move', () => {
+  it('a construct kept is free wherever it sits; one removed or new costs editDust', () => {
     expect(price(chain(A, B, C), chain(A, B, C))).toBe(0);
-    expect(price(chain(A, B, C), chain(A, C), [0, 2])).toBe(E);
-    expect(price(chain(A, B, C), chain(B, C), [1, 2])).toBe(E);
-    expect(price(chain(A, C), chain(A, B, C), [0, null, 1])).toBe(E); // Fire is an old move's element
+    expect(price(chain(A, B, C), chain(C, B, A))).toBe(0);
+    expect(price(chain(A, B, C), chain(A, C))).toBe(E);
+    expect(price(chain(A, B, C), chain(B, C))).toBe(E);
+    expect(price(chain(A, C), chain(A, strike(null, 'medium', 'fire'), C))).toBe(E); // Fire is a saved construct's element
+    expect(price(chain(A, C), chain(A, strike('new', 'medium', 'fire'), C))).toBe(E);
+    // A removed construct and a new one alike: a removal and a new move.
+    expect(price(chain(A, B), chain(A, strike(null, 'medium', 'fire')))).toBe(2 * E);
   });
 
-  it('without origins, move j came from saved move j: an edit in place', () => {
-    // B edited into C (its kind and elements), and the saved C removed.
-    expect(price(chain(A, B, C), chain(A, C))).toBe(E + X + E);
-    expect(price(chain(A, B), chain(A, bolt('heavy', 'fire')))).toBe(E);
+  it("a kept construct's changed kind or form costs editDust, its changed elements elementDust", () => {
+    expect(price(chain(A, B), chain(A, { ...B, kind: 'heavy' }))).toBe(E);
     expect(price(chain(A, B), chain(A, { ...B, form: 'lance' }))).toBe(E);
-    expect(price(chain(A, B), chain(A, bolt('medium', 'storm')))).toBe(X);
-    expect(price(chain(A, B), chain(A, bolt('medium', 'fire', 'storm')))).toBe(X);
-    expect(price(chain(A, B), chain(A, bolt('heavy', 'storm', 'fire')))).toBe(E + X);
-  });
-
-  it('a card that moved costs editDust, even one edited back: the longest rising run stays free', () => {
-    expect(price(chain(A, B, C), chain(B, C, A), [1, 2, 0])).toBe(E);
-    expect(price(chain(A, B), chain(B, A), [1, 0])).toBe(E);
-    // Two cards alike swapped: still a move.
-    expect(price(chain(A, A), chain(A, A), [1, 0])).toBe(E);
-    // A card removed and one alike added: a removal and a new move.
-    expect(price(chain(A, B), chain(A, B), [0, null])).toBe(2 * E);
+    expect(price(chain(A, B), chain(A, { ...B, elements: ['storm'] }))).toBe(X);
+    expect(price(chain(A, B), chain(A, { ...B, elements: ['fire', 'storm'] }))).toBe(X);
+    expect(price(chain(A, B), chain(A, { ...B, kind: 'heavy', elements: ['storm', 'fire'] }))).toBe(
+      E + X,
+    );
   });
 
-  it('a new element set is charged once per Apply, however many moves take it', () => {
-    const fire: Blow = { kind: 'light', element: 'fire' };
-    const storm: Blow = { kind: 'light', element: 'storm' };
+  it('a new element set is charged once per Apply, however many constructs take it', () => {
+    const fire: Blow = { uid: 'f', kind: 'light', element: 'fire' };
+    const storm: Blow = { uid: 's', kind: 'light', element: 'storm' };
     const blows = (old: Blow[], next: Blow[]) =>
       movesetEditPrice(registry, { basic: old }, { basic: next });
-    expect(blows([fire], [fire, storm])).toBe(E + X);
-    expect(blows([fire, storm], [fire, storm, storm])).toBe(E);
-    expect(blows([fire], [fire, storm, storm])).toBe(2 * E + X);
-    // Two moves re-coloured to one new set, and a new move in it: Storm charged once.
-    expect(price(chain(A, B), chain(bolt('light', 'storm'), bolt('medium', 'storm'), C))).toBe(
-      X + E,
-    );
+    expect(blows([fire], [fire, { ...storm, uid: undefined }])).toBe(E + X);
+    expect(blows([fire, storm], [fire, storm, { ...storm, uid: undefined }])).toBe(E);
+    expect(blows([fire], [fire, { kind: 'light', element: 'storm' }, { kind: 'heavy', element: 'storm' }])).toBe(2 * E + X);
+    // Two constructs re-coloured to one new set, and a new one in it: Storm charged once.
+    expect(
+      price(chain(A, B), chain({ ...A, elements: ['storm'] }, { ...B, elements: ['storm'] }, { ...C, uid: undefined })),
+    ).toBe(X + E);
   });
 
-  it('is 0 only for the same chain in place, and never beats doing it in two Applies (random triples, origins composed)', () => {
+  it('is 0 only for the same constructs, in any order (random chains)', () => {
     const rng = new SeededRNG(7);
     const pick = <T>(xs: readonly T[]): T => xs[rng.nextInt(0, xs.length - 1)];
     const kinds: Move['kind'][] = ['light', 'heavy', 'hold'];
-    const sets: ManaType[][] = [
-      ['fire'],
-      ['storm'],
-      ['frost'],
-      ['fire', 'storm'],
-      ['storm', 'fire'],
-    ];
-    const forms = ['bolt', 'lance'] as const;
-    const randomChain = (): Chain => ({
-      moves: Array.from({ length: rng.nextInt(1, 5) }, () => ({
-        kind: pick(kinds),
-        form: pick(forms),
-        elements: pick(sets),
-      })),
-      payment: pick(['mana', 'cast'] as const),
-    });
-    const randomBlows = (): Blow[] =>
-      Array.from({ length: rng.nextInt(1, 5) }, () => ({
-        kind: pick(kinds),
-        element: pick(['fire', 'storm', 'frost'] as const),
-      }));
-    /** Random origins from `from` moves to `to`: each new move a fresh saved index, or null. */
-    const randomOrigins = (from: number, to: number): (number | null)[] => {
-      const free = Array.from({ length: from }, (_, i) => i);
-      return Array.from({ length: to }, () =>
-        free.length === 0 || rng.next() < 0.3
-          ? null
-          : free.splice(rng.nextInt(0, free.length - 1), 1)[0],
-      );
+    const sets: ManaType[][] = [['fire'], ['storm'], ['frost'], ['fire', 'storm'], ['storm', 'fire']];
+    const forms = ['strike', 'lance'] as const;
+    /** A random chain over the uids `pool`, each at most once (a construct without a uid is new by contract: none here). */
+    const randomChain = (pool: string[]): Chain => {
+      const free = [...pool];
+      return {
+        moves: Array.from({ length: rng.nextInt(1, 5) }, () => ({
+          uid: free.splice(rng.nextInt(0, free.length - 1), 1)[0],
+          kind: pick(kinds),
+          form: pick(forms),
+          elements: pick(sets),
+        })),
+        payment: pick(['mana', 'cast'] as const),
+      };
     };
-    const length = (x: Partial<Chains>) => movesOf(x.basic ?? x.primary).length;
-    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
+    const same = (a: Chain, b: Chain) =>
+      a.moves.length === b.moves.length &&
+      a.payment === b.payment &&
+      a.moves.every((m, i) => JSON.stringify(m) === JSON.stringify(b.moves[i]));
     let bad = 0;
     for (let n = 0; n < 4000; n++) {
-      const basic = n % 2 === 0;
-      const skill = basic ? 'basic' : 'primary';
-      const [a, b, c] = basic
-        ? [randomBlows(), randomBlows(), randomBlows()].map((x) => ({ basic: x }))
-        : [randomChain(), randomChain(), randomChain()].map((x) => ({ primary: x }));
-      const ab = randomOrigins(length(a), length(b));
-      const bc = randomOrigins(length(b), length(c));
-      const ac = bc.map((o) => (o === null ? null : ab[o]));
-      const p = (x: Partial<Chains>, y: Partial<Chains>, o?: (number | null)[]) =>
-        movesetEditPrice(registry, x, y, o && { [skill]: o });
-      if (p(a, c, ac) > p(a, b, ab) + p(b, c, bc)) bad++;
-      if ((p(a, b) === 0) !== same(a, b)) bad++;
+      const pool = ['p', 'q', 'r', 's', 't'];
+      const [a, b] = [randomChain(pool), randomChain(pool)];
+      const p = (x: Chain, y: Chain) => movesetEditPrice(registry, { primary: x }, { primary: y });
+      if (p(a, b) < 0) bad++;
+      if (p(a, a) !== 0) bad++;
+      const reordered = { ...a, moves: [...a.moves].reverse() };
+      if (p(a, reordered) !== 0) bad++;
+      if (p(a, b) === 0 && !same(a, { ...b, moves: a.moves.map((m) => b.moves.find((x) => x.uid === m.uid)!) })) bad++;
     }
     expect(bad).toBe(0);
   });
 
-  it('a move left over: a new one costs editDust and, with elements no old move has, elementDust; a removal editDust', () => {
-    expect(price(chain(A), chain(A, bolt('medium', 'nature')))).toBe(E + X);
-    expect(price(chain(A, C), chain(A, C, bolt('light', 'storm')))).toBe(E);
-    expect(price(chain(A, B, C), chain(A))).toBe(2 * E);
-  });
-
-  it('a changed payment costs editDust; blows price the same way; chains left out cost nothing, nor do their origins', () => {
+  it('a changed payment costs editDust; blows price the same way; chains left out cost nothing', () => {
     expect(price(chain(A), { moves: [A], payment: 'cast' })).toBe(E);
-    const fire: Blow = { kind: 'light', element: 'fire' };
-    const heavy: Blow = { kind: 'heavy', element: 'fire' };
-    const blows = (old: Blow[], next: Blow[], origins?: (number | null)[]) =>
-      movesetEditPrice(registry, { basic: old }, { basic: next }, origins && { basic: origins });
-    expect(blows([fire, fire, heavy], [fire, heavy], [0, 2])).toBe(E);
-    expect(blows([fire, fire, heavy], [fire, fire, { ...heavy, element: 'frost' }])).toBe(X);
+    const fire: Blow = { uid: 'f', kind: 'light', element: 'fire' };
+    const heavy: Blow = { uid: 'h', kind: 'heavy', element: 'fire' };
+    const blows = (old: Blow[], next: Blow[]) =>
+      movesetEditPrice(registry, { basic: old }, { basic: next });
+    expect(blows([fire, { ...fire, uid: 'f2' }, heavy], [fire, heavy])).toBe(E);
+    expect(blows([fire, heavy], [fire, { ...heavy, element: 'frost' }])).toBe(X);
     const old = { basic: [fire], primary: chain(A) };
-    expect(movesetEditPrice(registry, old, { primary: chain(B) })).toBe(E);
-    expect(movesetEditPrice(registry, old, { basic: [heavy], primary: chain(B) })).toBe(2 * E);
-    expect(movesetEditPrice(registry, old, { primary: chain(B) }, { basic: [null] })).toBe(E);
+    expect(movesetEditPrice(registry, old, { primary: chain(B) })).toBe(2 * E);
+    expect(movesetEditPrice(registry, old, { basic: [heavy], primary: chain(A) })).toBe(2 * E);
   });
 
   it('a rune is no part of the Dust: a socket or a rune alone costs none', () => {
```

## Chunk 8: Task 4 — The switch: constructs with uids, the slot table, Open a skill, Move all's preview, runes on any weapon (continued)

`packages/engine/tests/delve-movesets.test.ts`, continued (the next hunks of the same diff):

```diff
@@ -618,7 +592,6 @@ describe('the edit price (movesetEditPrice): by origin', () => {
 });
 
 describe('edits: setChain and setChains', () => {
-  const light = (...elements: ManaType[]): Move => ({ kind: 'light', form: 'bolt', elements });
   /** A Fire hero past its first dive, with 20 Mana Dust and an uncommon sword. */
   const veteran = (): DelveProfile => {
     const p = armed(registry, createDelveProfile(registry, 3, { primary: 'fire' }));
@@ -626,30 +599,30 @@ describe('edits: setChain and setChains', () => {
   };
 
   it('edits the equipped weapon for its price; nothing before the first dive, nothing unchanged', () => {
-    const next: Chain = {
-      moves: [{ kind: 'heavy', form: 'bolt', elements: ['fire'] }],
-      payment: 'mana',
-    };
     const fresh = armed(registry, createDelveProfile(registry, 3, { primary: 'fire' }));
-    const free = setChain(registry, fresh, 'primary', next);
+    const heavier = (p: DelveProfile): Chain => {
+      const c = chainsOf(p).primary!;
+      return { ...c, moves: c.moves.map((m, i) => (i === 0 ? { ...m, kind: 'heavy' } : m)) };
+    };
+    const free = setChain(registry, fresh, 'primary', heavier(fresh));
     expect(free.ok).toBe(true);
-    expect(chainsOf(free.profile).primary).toEqual(next);
+    expect(chainsOf(free.profile).primary).toEqual(heavier(fresh));
     expect(free.profile.manaDust).toBe(0);
-    const paid = setChain(registry, veteran(), 'primary', next);
+    const paid = setChain(registry, veteran(), 'primary', heavier(veteran()));
     expect(paid.profile.manaDust).toBe(20 - bal.movesets.editDust);
     const same = setChain(registry, veteran(), 'primary', chainsOf(veteran()).primary!);
     expect(same.profile.manaDust).toBe(20);
     const poor = { ...veteran(), manaDust: bal.movesets.editDust - 1 };
-    expect(setChain(registry, poor, 'primary', next)).toEqual({
+    expect(setChain(registry, poor, 'primary', heavier(poor))).toEqual({
       ok: false,
       profile: poor,
       reason: 'Not enough Mana Dust',
     });
   });
 
-  it("refuses mid-dive, unarmed, a skill the weapon doesn't carry, and more moves than slots", () => {
+  it('refuses mid-dive, unarmed, a skill with no slot, and more moves than slots', () => {
     const p = veteran();
-    const one: Chain = { moves: [light('fire')], payment: 'mana' };
+    const one: Chain = { moves: [{ kind: 'light', form: 'lance', elements: ['fire'] }], payment: 'mana' };
     const reason = (q: DelveProfile, skill: 'primary' | 'defensive' | 'ultimate', c = one) =>
       setChain(registry, q, skill, c).reason;
     expect(reason(startDive(registry, p, 1), 'primary')).toBe(
@@ -658,119 +631,75 @@ describe('edits: setChain and setChains', () => {
     expect(reason(unequipSlot(registry, p, 'weapon'), 'primary')).toBe(
       'Equip a weapon to build your moves',
     );
-    const ward = { moves: [{ ...light('fire'), form: 'ward' as const }], payment: 'mana' as const };
-    expect(reason(p, 'defensive', ward)).toBe('Carried by rare weapons and better');
-    const rare = {
-      ...p,
-      equipped: { ...p.equipped, weapon: weapon('rare', 2, 'sword') },
-    };
-    const nova = { moves: [{ ...light('fire'), form: 'nova' as const }], payment: 'mana' as const };
-    expect(reason(rare, 'ultimate', nova)).toBe(
-      'Carried by epic weapons and better, or an awakened rare',
-    );
-    expect(reason(p, 'primary', { ...one, moves: [light('fire'), light('fire')] })).toBe(
-      'A chain holds 1 to 1 moves',
-    );
+    const nova = { moves: [{ ...one.moves[0], form: 'nova' as const }], payment: 'charge' as const };
+    expect(reason(p, 'ultimate', nova)).toBe(OPEN_SKILL_TEXT);
+    const three = { ...one, moves: [one.moves[0], one.moves[0], one.moves[0]] };
+    expect(reason(p, 'primary', three)).toBe('A chain holds 0 to 2 moves');
   });
 
-  it('keeps, moves and removes off-pair moves, but never adds, copies or re-colours one', () => {
+  it('keeps, moves and removes off-pair constructs, but never adds, copies or re-colours one', () => {
     const p0 = bindSecondary(registry, veteran(), 'storm').profile;
-    const [F, N, NF] = [light('fire'), light('nature'), light('nature', 'fire')];
+    const lance = (uid: string, ...elements: ManaType[]): Move => ({ uid, kind: 'light', form: 'lance', elements });
+    const [F, N, NF] = [lance('F', 'fire'), lance('N', 'nature'), lance('NF', 'nature', 'fire')];
+    const F2 = { ...F, uid: 'F2' };
     const p = {
-      ...withChains(p0, { primary: { moves: [F, N, NF, F], payment: 'mana' } }),
+      ...withChains(p0, { primary: { moves: [F, N, NF, F2], payment: 'mana' } }),
       manaDust: 999,
     };
     const ok = (...moves: Move[]) => setChain(registry, p, 'primary', { moves, payment: 'mana' });
-    expect(ok(F, N, NF, F).ok).toBe(true); // kept
-    expect(ok(N, F, F, NF).ok).toBe(true); // moved
+    expect(ok(F, N, NF, F2).ok).toBe(true); // kept
+    expect(ok(N, F, F2, NF).ok).toBe(true); // moved
     expect(ok(F, NF).ok).toBe(true); // removed
-    expect(ok(F, N, NF, { ...N, kind: 'heavy' }).reason).toBe('Pick from your two elements'); // copied
-    expect(ok(F, N, NF, light('frost')).reason).toBe('Pick from your two elements'); // added
-    expect(ok(F, light('frost'), NF, F).reason).toBe('Pick from your two elements'); // re-coloured
-    expect(ok(F, { ...N, kind: 'heavy' }, NF, F).ok).toBe(true); // its kind changed
-    expect(ok(F, N, light('fire', 'nature'), F).ok).toBe(true); // its elements' order: the same set
+    expect(ok(F, N, NF, { ...N, uid: 'N2', kind: 'heavy' }).reason).toBe('Pick from your two elements'); // copied
+    expect(ok(F, N, NF, { ...lance('x', 'frost'), uid: undefined }).reason).toBe('Pick from your two elements'); // added
+    expect(ok(F, { ...N, elements: ['frost'] }, NF, F2).reason).toBe('Pick from your two elements'); // re-coloured
+    expect(ok(F, { ...N, kind: 'heavy' }, NF, F2).ok).toBe(true); // its kind changed
+    expect(ok(F, N, { ...NF, elements: ['fire', 'nature'] }, F2).ok).toBe(true); // its elements' order: the same set
     const blows: Blow[] = [
-      { kind: 'light', element: 'fire' },
-      { kind: 'heavy', element: 'nature' },
+      { uid: 'b1', kind: 'light', element: 'fire' },
+      { uid: 'b2', kind: 'heavy', element: 'nature' },
     ];
     const b = { ...withChains(p0, { basic: blows }), manaDust: 999 };
     expect(setChain(registry, b, 'basic', [...blows].reverse()).ok).toBe(true);
-    expect(setChain(registry, b, 'basic', [blows[1], blows[1]]).reason).toBe(
+    expect(setChain(registry, b, 'basic', [blows[1], { ...blows[1], uid: 'b3' }]).reason).toBe(
       'Pick from your two elements',
     );
   });
 
   it('setChains applies every chain or none, for their total', () => {
     const p = veteran();
-    const basic: Blow[] = [{ kind: 'heavy', element: 'fire' }];
-    const primary: Chain = {
-      moves: [{ kind: 'heavy', form: 'bolt', elements: ['fire'] }],
-      payment: 'mana',
-    };
-    // The basic chain keeps its heavy blow (the builder's origins); the Primary edits in place.
-    const origins = { basic: [2] };
-    const both = setChains(registry, p, { basic, primary }, { origins });
-    expect(both.ok).toBe(true);
-    expect(chainsOf(both.profile)).toEqual({ basic, primary });
+    const [, , heavy] = chainsOf(p).basic!;
+    const basic: Blow[] = [heavy];
+    const primary = chainsOf(p).primary!;
+    const heavier: Chain = { ...primary, moves: primary.moves.map((m, i) => (i === 0 ? { ...m, kind: 'heavy' } : m)) };
     // Two blows removed and a kind changed: 3 × editDust.
+    const both = setChains(registry, p, { basic, primary: heavier });
+    expect(both.ok).toBe(true);
+    expect(chainsOf(both.profile)).toEqual({ basic, primary: heavier, defensive: chainsOf(p).defensive });
     expect(both.profile.manaDust).toBe(20 - 3 * bal.movesets.editDust);
     const poor = { ...p, manaDust: 3 * bal.movesets.editDust - 1 };
-    expect(setChains(registry, poor, { basic, primary }, { origins })).toMatchObject({
+    expect(setChains(registry, poor, { basic, primary: heavier })).toMatchObject({
       ok: false,
       profile: poor,
       reason: 'Not enough Mana Dust',
     });
-    const ward = {
-      moves: [{ kind: 'medium' as const, form: 'ward' as const, elements: ['fire' as const] }],
-      payment: 'mana' as const,
+    const nova = {
+      moves: [{ kind: 'medium' as const, form: 'nova' as const, elements: ['fire' as const] }],
+      payment: 'charge' as const,
     };
-    expect(setChains(registry, p, { primary, defensive: ward })).toMatchObject({
+    expect(setChains(registry, p, { primary: heavier, ultimate: nova })).toMatchObject({
       ok: false,
       profile: p,
     });
   });
-});
-
-describe('edits by origin', () => {
-  const E = bal.movesets.editDust;
-  /** A Fire hero past its first dive, with Mana Dust to spare. */
-  const veteran = (): DelveProfile => {
-    const p = createDelveProfile(registry, 3, { primary: 'fire' });
-    return { ...p, manaDust: 99, stats: { ...p.stats, dives: 1 } };
-  };
 
-  it('setChains prices by the origins it is given, and refuses bad ones', () => {
+  it('sameChain reads a reorder as a change, and the same constructs in order as none', () => {
     const p = veteran();
-    const blows = chainsOf(p).basic!; // the sword's light, light, heavy
-    const swapped = [blows[2], blows[0], blows[1]];
-    // The heavy moved to the front: one move.
-    const moved = setChains(registry, p, { basic: swapped }, { origins: { basic: [2, 0, 1] } });
-    expect(moved.profile.manaDust).toBe(99 - E);
-    expect(chainsOf(moved.profile).basic).toEqual(swapped);
-    // Without origins, in place: the first light became heavy, and the heavy light.
-    expect(setChains(registry, p, { basic: swapped }).profile.manaDust).toBe(99 - 2 * E);
-    for (const basic of [
-      [0, 0, 1],
-      [0, 1],
-      [0, 1, 3],
-      [0, 1, -1],
-      [0.5, 1, 2],
-    ])
-      expect(setChains(registry, p, { basic: swapped }, { origins: { basic } })).toMatchObject({
-        ok: false,
-        profile: p,
-        reason: 'Bad origins',
-      });
-    // Origins for a skill the edit leaves out are ignored.
-    const origins = { basic: [2, 0, 1], primary: [7] };
-    expect(setChains(registry, p, { basic: swapped }, { origins }).ok).toBe(true);
-  });
-
-  it('the first dive is still free, whatever moved', () => {
-    const fresh = createDelveProfile(registry, 3, { primary: 'fire' });
-    const blows = chainsOf(fresh).basic!;
-    const res = setChains(registry, fresh, { basic: [blows[2]] }, { origins: { basic: [2] } });
-    expect(res.profile.manaDust).toBe(0);
+    const c = chainsOf(p).primary!;
+    const [a, b] = c.moves;
+    expect(sameChain(c, { ...c, moves: [a, b] })).toBe(true);
+    expect(sameChain(c, { ...c, moves: [b, a] })).toBe(false);
+    expect(sameChain(c, { ...c, moves: [{ ...a, uid: undefined }, b] })).toBe(true); // no uid: by what it is
   });
 });
 
@@ -784,88 +713,78 @@ describe('slots: addSlot', () => {
     scrap: 9999,
   });
 
-  it("prices a slot by its position: the 2nd 1 Link, a sword's 4th basic slot 3", () => {
+  it("prices a slot by its position: an uncommon sword's 3rd Primary slot 2 Links; its Basic at its ceiling and its Ultimate at 0 slots have none", () => {
     const sword = rich().equipped.weapon!;
-    expect(slotPrice(registry, sword, 'primary')).toEqual({ links: 1, scrap: 20 });
-    expect(slotPrice(registry, sword, 'basic')).toEqual({ links: 3, scrap: 60 });
-    expect(slotPrice(registry, sword, 'defensive')).toBeNull();
+    expect(slotPrice(registry, sword, 'primary')).toEqual({ links: 2, scrap: 40 });
+    expect(slotPrice(registry, sword, 'basic')).toBeNull();
+    expect(slotPrice(registry, sword, 'defensive')).toEqual({ links: 1, scrap: 20 });
+    expect(slotPrice(registry, sword, 'ultimate')).toBeNull();
     const res = addSlot(registry, rich(), 'primary');
-    expect(res.profile).toMatchObject({ links: 98, scrap: 9979 });
-    expect(slotPrice(registry, res.profile.equipped.weapon!, 'primary')).toEqual({
-      links: 2,
-      scrap: 40,
-    });
+    expect(res.profile).toMatchObject({ links: 97, scrap: 9959 });
+    expect(slotPrice(registry, res.profile.equipped.weapon!, 'primary')).toBeNull(); // the ceiling, 3
+    expect(movesOf(chainsOf(res.profile).primary).map((m) => m.uid).every((u) => /^c\d+$/.test(u!))).toBe(true);
+    expect(res.profile.equipped.weapon!.moveset!.bought).toEqual({ primary: 1 });
   });
 
-  it("appends the default kind at the chain's end, in the last move's form and in-pair elements", () => {
+  it("appends the default kind at the chain's end, in the last move's form and in-pair elements, minted", () => {
     const p = rich();
     const primary = addSlot(registry, p, 'primary').profile;
-    expect(chainsOf(primary).primary!.moves).toEqual([
-      { kind: 'light', form: 'bolt', elements: ['fire'] },
-      { kind: 'medium', form: 'bolt', elements: ['fire'] },
+    expect(bare(chainsOf(primary).primary!.moves)).toEqual([
+      { kind: 'medium', form: 'strike', elements: ['fire'] },
+      { kind: 'medium', form: 'strike', elements: ['fire'] },
+      { kind: 'heavy', form: 'strike', elements: ['fire'] },
     ]);
-    expect(primary.equipped.weapon!.moveset!.slots.primary).toBe(2);
+    expect(primary.equipped.weapon!.moveset!.slots.primary).toBe(3);
     // A Lance's default chain, [medium, medium, heavy], at the new move's place.
     const lance: Chain = {
       moves: [{ kind: 'heavy', form: 'lance', elements: ['fire', 'storm'] }],
       payment: 'cast',
     };
     const bound = rich(withChains(bindSecondary(registry, p, 'storm').profile, { primary: lance }));
-    expect(chainsOf(addSlot(registry, bound, 'primary').profile).primary!.moves[1]).toEqual({
+    expect(bare(chainsOf(addSlot(registry, bound, 'primary').profile).primary!.moves[1])).toEqual({
       kind: 'medium',
       form: 'lance',
       elements: ['fire', 'storm'],
     });
-    // A blow past the sword's string of three: medium.
-    expect(chainsOf(addSlot(registry, p, 'basic').profile).basic![3]).toEqual({
-      kind: 'medium',
-      element: 'fire',
-    });
+    // A blow past a legendary sword's string of three: medium.
+    const legendary = rich({ ...p, equipped: { ...p.equipped, weapon: withUids({ ...p, equipped: { ...p.equipped, weapon: weapon('legendary', 3, 'sword') } }).equipped.weapon! } });
+    const blows = chainsOf(addSlot(registry, legendary, 'basic').profile).basic!;
+    // The sword's Storm blows are off the Fire hero's pair: the new blow takes the primary.
+    expect(bare(blows[blows.length - 1])).toEqual({ kind: 'medium', element: 'fire' });
   });
 
   it("gives the new move the pair's primary when the last move is off-pair", () => {
     const nature: Chain = {
-      moves: [{ kind: 'light', form: 'bolt', elements: ['nature', 'fire'] }],
+      moves: [{ kind: 'light', form: 'lance', elements: ['nature', 'fire'] }],
       payment: 'mana',
     };
-    const p = rich(
-      withChains(createDelveProfile(registry, 3, { primary: 'fire' }), { primary: nature }),
-    );
+    const p = rich(withChains(armed(registry, createDelveProfile(registry, 3, { primary: 'fire' })), { primary: nature }));
     expect(chainsOf(addSlot(registry, p, 'primary').profile).primary!.moves[1].elements).toEqual([
       'fire',
     ]);
   });
 
   it('never touches a slot the chain is not using', () => {
-    const dagger = {
+    const dagger = withUids({
       ...rich(),
-      equipped: { ...rich().equipped, weapon: weapon('common', 3, 'dagger') },
-    };
+      equipped: { ...rich().equipped, weapon: weapon('rare', 3, 'dagger') },
+    });
     const three = setChain(registry, dagger, 'basic', chainsOf(dagger).basic!.slice(0, 3)).profile;
     expect(three.equipped.weapon!.moveset!.slots.basic).toBe(4);
-    const added = addSlot(registry, three, 'basic').profile;
-    expect(added.equipped.weapon!.moveset!.slots.basic).toBe(5);
-    // The dagger's string at the fourth place: heavy.
-    expect(chainsOf(added).basic!.map((b) => b.kind)).toEqual([
-      'light',
-      'light',
-      'medium',
-      'heavy',
-    ]);
+    const four = setChain(registry, three, 'basic', [...chainsOf(three).basic!, { kind: 'light', element: 'fire' }]).profile;
+    expect(four.equipped.weapon!.moveset!.slots.basic).toBe(4);
+    expect(chainsOf(four).basic).toHaveLength(4);
   });
 
-  it("refuses mid-dive, unarmed, a skill the weapon doesn't carry, at 5 slots, and without the Links or the scrap", () => {
+  it('refuses mid-dive, unarmed, a skill with no slot, at the ceiling, and without the Links or the scrap', () => {
     const p = rich();
-    const reason = (q: DelveProfile, skill: 'basic' | 'primary' | 'defensive' = 'primary') =>
-      addSlot(registry, q, skill).reason;
+    const reason = (q: DelveProfile, skill: ChainSkill = 'primary') => addSlot(registry, q, skill).reason;
     expect(reason(startDive(registry, p, 1))).toBe('Chains can only change between dives');
     expect(reason(unequipSlot(registry, p, 'weapon'))).toBe('Equip a weapon to build your moves');
-    expect(reason(p, 'defensive')).toBe('Carried by rare weapons and better');
-    let full = p;
-    for (let i = 0; i < 4; i++) full = addSlot(registry, full, 'primary').profile;
-    expect(full.equipped.weapon!.moveset!.slots.primary).toBe(5);
-    // The 2nd to 5th slots: 1 + 2 + 3 + 4 Links and 20 + 40 + 60 + 80 scrap.
-    expect(full).toMatchObject({ links: 89, scrap: 9799 });
+    expect(reason(p, 'ultimate')).toBe(OPEN_SKILL_TEXT);
+    const full = addSlot(registry, p, 'primary').profile;
+    expect(full.equipped.weapon!.moveset!.slots.primary).toBe(3);
+    expect(full).toMatchObject({ links: 97, scrap: 9959 });
     expect(reason(full)).toBe('This chain has every slot');
     expect(reason({ ...p, links: 0 })).toBe('Not enough Links');
     expect(reason({ ...p, scrap: 19 })).toBe('Not enough scrap');
@@ -873,17 +792,17 @@ describe('slots: addSlot', () => {
 });
 
 /** `w` with a moveset of these slots, every move its default in `w`'s mana. */
-function slotted(w: GearItem, slots: Moveset['slots']): GearItem {
-  return { ...w, moveset: defaultMoveset(registry, w, w.mana, slots) };
+function slotted(w: GearItem, slots: Moveset['slots'], bought: Moveset['bought'] = {}): GearItem {
+  return { ...w, moveset: { ...defaultMoveset(registry, w, w.mana, slots), bought } };
 }
 
 describe('Links: salvage and banking', () => {
-  const rare = slotted(weapon('rare', 1, 'sword'), { basic: 4, primary: 3, defensive: 1 }); // 3 extra
+  // A rare sword with two bought slots.
+  const rare = slotted(weapon('rare', 1, 'sword'), { basic: 4, primary: 4, defensive: 2, ultimate: 1 }, { basic: 1, primary: 1 });
   const hero = () => createDelveProfile(registry, 3, { primary: 'storm' });
-  /** Its Links: the extra slots past the ones a rare forge grants free. */
-  const links = 3 - bal.crafting.weaponExtras.rare.slots;
+  const links = 2;
 
-  it('salvaging a weapon gives a Link for each extra slot past the forged ones; other gear none', () => {
+  it('salvaging a weapon gives a Link for each bought slot; other gear none; a drop none', () => {
     const chest = generateItem(
       registry,
       { uid: 'c', ilvl: 2, rarity: 'rare', slot: 'chest' },
@@ -892,6 +811,7 @@ describe('Links: salvage and banking', () => {
     const res = salvageItems(registry, { ...hero(), bag: [rare, chest] }, [rare.uid, chest.uid]);
     expect(res.links).toBe(links);
     expect(res.profile.links).toBe(links);
+    expect(weaponParts(registry, weapon('legendary', 2, 'sword')).links).toBe(0);
   });
 
   it("auto-salvage and a full bag give them too, into the floor's haul, and banking reports them for the dive", () => {
@@ -911,16 +831,15 @@ describe('Links: salvage and banking', () => {
   });
 });
 
-describe('transfer', () => {
-  const T = bal.movesets.transferScrap;
-  /** A Fire hero wielding `w`, with scrap to spare, and `bag` in the bag. */
+describe('Move all (the preview; B2 commits it)', () => {
+  /** A Fire hero wielding `w`, with `bag` in the bag, every construct minted. */
   const holding = (w: GearItem, ...bag: GearItem[]): DelveProfile => {
     const p = createDelveProfile(registry, 3, { primary: 'fire' });
-    return { ...p, equipped: { ...p.equipped, weapon: w }, bag, scrap: 1000 };
+    return withUids({ ...p, equipped: { ...p.equipped, weapon: w }, bag, scrap: 1000 });
   };
   const built = (w: GearItem, chains: Moveset['chains'], slots: Moveset['slots']): GearItem => {
     const m = slotted(w, slots).moveset!;
-    return { ...w, moveset: { chains: { ...m.chains, ...chains }, slots: m.slots } };
+    return { ...w, moveset: { chains: { ...m.chains, ...chains }, slots: m.slots, bought: {} } };
   };
   const lance: Chain = {
     moves: [
@@ -929,128 +848,88 @@ describe('transfer', () => {
     ],
     payment: 'cast',
   };
+  const uids = (c: Chains[ChainSkill] | undefined) => movesOf(c).map((m) => m.uid);
 
-  it("moves each chain with its extra slots onto the target's base, for scrap; the target's replaced extras come back as Links", () => {
-    // A rare sword: a 4-slot string (1 extra), a 3-slot Primary (2), a 2-slot Defensive (1).
-    const sword = built(
-      weapon('rare', 1, 'sword'),
-      { primary: lance },
-      { basic: 4, primary: 3, defensive: 2 },
-    );
-    // A rare axe with its own extra Primary slot.
-    const axe = slotted(
-      { ...weapon('rare', 2, 'axe'), uid: 'axe' },
-      { basic: 3, primary: 2, defensive: 1 },
-    );
-    const res = transferMoveset(registry, holding(sword, axe), 'axe');
-    expect(res.ok).toBe(true);
-    const moved = res.profile.equipped.weapon!;
-    expect(moved.uid).toBe('axe');
-    expect(moved.moveset!.slots).toEqual({ basic: 4, primary: 3, defensive: 2 });
-    expect(moved.moveset!.chains).toEqual(sword.moveset!.chains);
-    expect(res.links).toBe(1);
-    expect(res.profile.links).toBe(1);
-    expect(res.profile.scrap).toBe(1000 - 4 * T);
-    // The sword goes back to the bag at its base slots, its moves the defaults in its own mana.
-    expect(res.profile.bag).toEqual([
-      { ...sword, moveset: defaultMoveset(registry, sword, sword.mana) },
-    ]);
+  it("moves each chain's constructs slot for slot into the target's slots, its payment with them; the target's replaced constructs go to the bag", () => {
+    const sword = built(weapon('rare', 1, 'sword'), { primary: lance }, { basic: 4, primary: 3, defensive: 2, ultimate: 1 });
+    const axe = slotted({ ...weapon('rare', 2, 'axe'), uid: 'axe' }, { basic: 3, primary: 3, defensive: 2, ultimate: 1 });
+    const p = holding(sword, axe);
+    const worn = p.equipped.weapon!;
+    const target = p.bag[0];
+    const prev = moveAllPreview(registry, worn, target);
+    expect(prev.moveset.slots).toEqual(target.moveset!.slots);
+    expect(uids(prev.moveset.chains.primary)).toEqual(uids(worn.moveset!.chains.primary));
+    expect(prev.moveset.chains.primary!.payment).toBe('cast');
+    // The sword's 4-blow string onto a 3-slot Basic: the fourth blow to the bag with the axe's own three.
+    expect(uids(prev.moveset.chains.basic)).toEqual(uids(worn.moveset!.chains.basic).slice(0, 3));
+    const bagged = prev.toBag.map((c) => c.uid);
+    expect(bagged).toContain(uids(worn.moveset!.chains.basic)[3]);
+    for (const u of CHAIN_SKILLS.flatMap((s) => uids(target.moveset!.chains[s]))) expect(bagged).toContain(u);
+    expect(prev.dormant).toEqual([]);
+    // The old sword: refilled plain to its starts, no uids, its slots kept.
+    expect(prev.old.slots).toEqual(worn.moveset!.slots);
+    expect(movesOf(prev.old.chains.basic).every((c) => !c.uid)).toBe(true);
+    expect(prev.old.chains.primary!.moves).toHaveLength(3);
+    expect(prev.old.chains.primary!.payment).toBe('mana');
   });
 
-  it('a basic chain onto a shorter string drops moves from the end; past the cap its extras come back as Links', () => {
-    // A dagger's full string (4 + 1 extra) onto a maul (2): 3 slots, the last two blows gone.
-    const dagger = slotted(weapon('magic', 3, 'dagger'), { basic: 5, primary: 1, defensive: 1 });
-    const maul = { ...weapon('common', 4, 'maul'), uid: 'maul' };
-    const res = transferMoveset(registry, holding(dagger, maul), 'maul');
-    const basic = res.profile.equipped.weapon!.moveset!;
-    expect(basic.slots.basic).toBe(3);
-    expect(basic.chains.basic).toEqual(dagger.moveset!.chains.basic!.slice(0, 3));
-    expect(res.profile.scrap).toBe(1000 - T);
-    // A sword's 5-slot string (2 extra) onto a dagger (4): 5 slots, 1 Link back.
-    const sword = slotted(weapon('rare', 5, 'sword'), { basic: 5, primary: 1, defensive: 1 });
-    const onto = { ...weapon('common', 6, 'dagger'), uid: 'd' };
-    const over = transferMoveset(registry, holding(sword, onto), 'd');
-    expect(over.profile.equipped.weapon!.moveset!.slots.basic).toBe(5);
-    expect(over.links).toBe(1);
-    expect(over.profile.scrap).toBe(1000 - T);
+  it("a target skill the worn weapon moves nothing into keeps the target's own constructs; a chain the target has no slots for goes whole to the bag", () => {
+    const common = slotted(weapon('common', 9, 'sword'), { basic: 3, primary: 2 });
+    const epic = slotted({ ...weapon('epic', 10, 'axe'), uid: 'axe' }, { basic: 3, primary: 4, defensive: 2, ultimate: 2 });
+    const p = holding(common, epic);
+    const prev = moveAllPreview(registry, p.equipped.weapon!, p.bag[0]);
+    expect(prev.moveset.chains.ultimate).toEqual(p.bag[0].moveset!.chains.ultimate);
+    expect(prev.moveset.chains.defensive).toEqual(p.bag[0].moveset!.chains.defensive);
+    expect(prev.moveset.slots).toEqual({ basic: 3, primary: 4, defensive: 2, ultimate: 2 });
+    // The other way: the epic's Ultimate and Defensive have no slot on the common sword.
+    const back = holding(epic, { ...common, uid: 'common' });
+    const onto = moveAllPreview(registry, back.equipped.weapon!, back.bag[0]);
+    expect(Object.keys(onto.moveset.chains)).toEqual(['basic', 'primary']);
+    const gone = CHAIN_SKILLS.flatMap((s) => (s === 'defensive' || s === 'ultimate' ? uids(back.equipped.weapon!.moveset!.chains[s]) : []));
+    for (const u of gone) expect(onto.toBag.map((c) => c.uid)).toContain(u);
   });
 
-  it("leaves chains the target can't carry behind, their extras back as Links, and prices only what moves", () => {
-    const epic = slotted(weapon('epic', 7, 'sword'), {
-      basic: 3,
-      primary: 2,
-      defensive: 1,
-      ultimate: 3,
-    });
-    const uncommon = { ...weapon('uncommon', 8, 'axe'), uid: 'axe' };
-    const res = transferMoveset(registry, holding(epic, uncommon), 'axe');
-    const m = res.profile.equipped.weapon!.moveset!;
-    expect(Object.keys(m.chains)).toEqual(['basic', 'primary']);
-    expect(m.slots).toEqual({ basic: 3, primary: 2 });
-    expect(res.links).toBe(2); // the Ultimate's two extras
-    expect(res.profile.scrap).toBe(1000 - T); // the Primary's one extra moved
+  it("constructs the target's class can't express sit in their slots, dormant", () => {
+    const sword = holding(weapon('rare', 11, 'sword'), { ...weapon('rare', 12, 'bow'), uid: 'bow' });
+    const prev = moveAllPreview(registry, sword.equipped.weapon!, sword.bag[0]);
+    const strikes = uids(sword.equipped.weapon!.moveset!.chains.primary);
+    expect(uids(prev.moveset.chains.primary)).toEqual(strikes.slice(0, prev.moveset.slots.primary));
+    expect(prev.dormant.sort()).toEqual(strikes.slice(0, prev.moveset.slots.primary).sort());
   });
 
-  it("keeps the target's own chain for a skill only it carries", () => {
-    const common = weapon('common', 9, 'sword');
-    const epic = slotted(
-      { ...weapon('epic', 10, 'axe'), uid: 'axe' },
-      { basic: 3, primary: 1, defensive: 1, ultimate: 2 },
-    );
-    const res = transferMoveset(registry, holding(common, epic), 'axe');
-    const m = res.profile.equipped.weapon!.moveset!;
-    expect(m.chains.ultimate).toEqual(epic.moveset!.chains.ultimate);
-    expect(m.slots).toEqual({ basic: 3, primary: 1, defensive: 1, ultimate: 2 });
-    expect([res.links, res.profile.scrap]).toEqual([0, 1000]);
-  });
-
-  it('refuses mid-dive, unarmed, anything but a bag weapon, and without the scrap', () => {
-    const sword = slotted(weapon('rare', 11, 'sword'), { basic: 3, primary: 3, defensive: 1 });
-    const axe = { ...weapon('rare', 12, 'axe'), uid: 'axe' };
-    const helm = generateItem(
-      registry,
-      { uid: 'helm', ilvl: 2, rarity: 'rare', slot: 'helm' },
-      new SeededRNG(4),
-    );
-    const p = holding(sword, axe, helm);
-    const reason = (q: DelveProfile, uid = 'axe') => transferMoveset(registry, q, uid).reason;
-    expect(reason(startDive(registry, p, 1))).toBe('Transfer your moveset between dives');
-    expect(reason(unequipSlot(registry, p, 'weapon'))).toBe('Equip a weapon to build your moves');
-    expect(reason(p, p.equipped.chest!.uid)).toBe('Transfer onto a weapon in your bag');
-    expect(reason(p, 'helm')).toBe('Transfer onto a weapon in your bag');
-    expect(reason(p, 'nope')).toBe('Transfer onto a weapon in your bag');
-    expect(reason({ ...p, scrap: 2 * bal.movesets.transferScrap - 1 })).toBe('Not enough scrap');
+  it("the op itself refuses 'Not yet' until B2 fills it", () => {
+    const p = holding(weapon('rare', 11, 'sword'), { ...weapon('rare', 12, 'axe'), uid: 'axe' });
+    expect(moveAll(registry, p, 'axe')).toMatchObject({ ok: false, profile: p, reason: 'Not yet' });
   });
 });
 
 describe('valuing a weapon: as it is, and as a home', () => {
-  /** A Fire hero whose uncommon sword holds a 4-slot Primary, and `bag` in the bag. */
+  /** A Fire hero whose uncommon sword holds a 3-slot Primary, and `bag` in the bag. */
   const hero = (...bag: GearItem[]): DelveProfile => {
     const p = armed(registry, createDelveProfile(registry, 3, { primary: 'fire' }));
-    const sword = slotted(p.equipped.weapon!, { basic: 3, primary: 4 });
-    return { ...p, equipped: { ...p.equipped, weapon: sword }, bag, scrap: 1000 };
+    const sword = slotted(p.equipped.weapon!, { basic: 3, primary: 3, defensive: 1 });
+    return withUids({ ...p, equipped: { ...p.equipped, weapon: sword }, bag, scrap: 1000 });
+  };
+  /** The same sword as the hero's, one upgrade better, its 3-slot Primary holding one construct. */
+  const spare = (p: DelveProfile): GearItem => {
+    const m = defaultMoveset(registry, p.equipped.weapon!, 'fire', { basic: 3, primary: 3, defensive: 1 });
+    const primary = { ...m.chains.primary!, moves: m.chains.primary!.moves.slice(0, 1) };
+    return { ...p.equipped.weapon!, uid: 'spare', upgrade: 1, moveset: { ...m, chains: { ...m.chains, primary } } };
   };
-  /** The same sword as the hero's, one upgrade better, with its base moveset. */
-  const spare = (p: DelveProfile): GearItem => ({
-    ...p.equipped.weapon!,
-    uid: 'spare',
-    upgrade: 1,
-    moveset: defaultMoveset(registry, p.equipped.weapon!, 'fire'),
-  });
 
-  it('as it is: its own moveset; as a home: the equipped moveset moved onto it (the default)', () => {
+  it('as it is: its own moveset; as a home: the equipped constructs moved onto it (the default)', () => {
     const p0 = hero();
-    const p = { ...p0, bag: [spare(p0)] };
+    const p = withUids({ ...p0, bag: [spare(p0)] });
     const cmp = (value?: 'home' | 'asIs') =>
       compareItem(p.equipped, p.bag[0], registry, 1, p.pair, value);
     expect(cmp('asIs').newPower).toBe(profilePower(registry, equipItem(registry, p, 'spare')));
-    const moved = transferMoveset(registry, p, 'spare').profile;
+    const moved = { ...p, equipped: { ...p.equipped, weapon: { ...p.bag[0], moveset: moveAllPreview(registry, p.equipped.weapon!, p.bag[0]).moveset } } };
     expect(cmp('home').newPower).toBe(profilePower(registry, moved));
     expect(cmp()).toEqual(cmp('home'));
-    // A better base with fewer slots: junk as it is, an upgrade as a home.
-    expect(cmp('asIs').powerPct).toBeLessThanOrEqual(0);
+    // A better base with a shorter Primary: more as a home than as it is.
+    expect(cmp('home').powerPct).toBeGreaterThan(cmp('asIs').powerPct);
     expect(cmp('home').powerPct).toBeGreaterThan(0);
-    // The equipped weapon itself, and unarmed (no moveset to move), value as they are.
+    // The equipped weapon itself, and unarmed (nothing to move), value as they are.
     const worn = p.equipped.weapon!;
     expect(compareItem(p.equipped, worn, registry, 1, p.pair)).toEqual(
       compareItem(p.equipped, worn, registry, 1, p.pair, 'asIs'),
```

`packages/engine/tests/delve-movesets.test.ts`, continued (the next hunks of the same diff):

```diff
@@ -1064,7 +943,7 @@ describe('valuing a weapon: as it is, and as a home', () => {
 
   it('salvage never marks a good base as junk; Equip best leaves the weapon alone', () => {
     const p0 = hero();
-    const p = { ...p0, bag: [spare(p0)] };
+    const p = withUids({ ...p0, bag: [spare(p0)] });
     expect(salvageCandidates(registry, p, 'legendary')).toEqual([]);
     expect(equipBest(registry, p).equipped).toEqual([]);
   });
@@ -1088,7 +967,6 @@ describe('the dive lock', () => {
     const primary = chainsOf(diving).primary!;
     expect(setChain(registry, diving, 'primary', primary).ok).toBe(false);
     expect(addSlot(registry, diving, 'primary').ok).toBe(false);
-    expect(transferMoveset(registry, diving, 'axe').ok).toBe(false);
     expect(reattuneItem(registry, diving, 'h', 'fire').reason).toBe('Re-attune between dives');
     // The forge and salvage too: the Anvil can be visited with a dive still open.
     const forge = 'Forge at the Anvil, between dives';
@@ -1101,7 +979,6 @@ describe('the dive lock', () => {
     expect(equipBest(registry, choosing)).toEqual({ profile: choosing, equipped: [] });
     expect(setChain(registry, choosing, 'primary', primary).ok).toBe(false);
     expect(addSlot(registry, choosing, 'primary').ok).toBe(false);
-    expect(transferMoveset(registry, choosing, 'axe').ok).toBe(false);
     expect(upgradeGear(registry, choosing, 'h')).toMatchObject({ ok: false, reason: forge });
     expect(salvageItems(registry, choosing, ['h'])).toMatchObject({ count: 0 });
     // But auto-salvage of new loot still runs, so a full bag never blocks pickups.
@@ -1125,40 +1002,40 @@ describe('the autopilot between dives', () => {
   const veteran = (w?: GearItem): DelveProfile => {
     const p = armed(registry, createDelveProfile(registry, 3, { primary: 'fire' }));
     const weapon = w ?? p.equipped.weapon!;
-    return {
+    return withUids({
       ...p,
       equipped: { ...p.equipped, weapon },
       materials: emptyMaterials(),
       stats: { ...p.stats, dives: 1 },
-    };
+    });
   };
 
-  it('moves its moveset onto the bag weapon that makes the best home, when it can pay', () => {
+  it('wears the bag weapon that raises Power as it is, its old one to the bag (D1 rewires it to Move all, B2 fills the op)', () => {
     const p0 = veteran();
-    const sword = slotted(p0.equipped.weapon!, { basic: 3, primary: 2 }); // 1 extra: 30 scrap
     const better = { ...p0.equipped.weapon!, uid: 'better', upgrade: 5 };
-    const p = { ...veteran(sword), bag: [better] };
-    const after = betweenDives(registry, { ...p, scrap: 1000 });
+    const p = { ...p0, bag: [better], scrap: 1000 };
+    // The old sword goes to the bag as it is, where the junk rule melts it (a plain common).
+    const after = betweenDives(registry, p);
     expect(after.equipped.weapon!.uid).toBe('better');
-    expect(after.equipped.weapon!.moveset!.chains).toEqual(sword.moveset!.chains);
-    expect(betweenDives(registry, { ...p, scrap: 0 }).equipped.weapon!.uid).toBe(sword.uid);
+    expect(after.bag.find((i) => i.uid === p0.equipped.weapon!.uid)).toBeUndefined();
   });
 
-  it('spends Links in the order Primary, basic chain, Ultimate, Defensive: each to three slots, then (after sockets) the rest', () => {
+  it('spends Links in the order Primary, basic chain, Ultimate, Defensive: each to three slots, then (after sockets) the rest, up to each ceiling', () => {
     const epic = weapon('epic', 1, 'sword');
     const base = {
-      ...veteran(slotted(epic, { basic: 3, primary: 1, defensive: 1, ultimate: 1 })),
+      ...veteran(slotted(epic, { basic: 3, primary: 4, defensive: 2, ultimate: 1 })),
       scrap: 9999,
     };
     const slots = (links: number) =>
       betweenDives(registry, { ...base, links }).equipped.weapon!.moveset!.slots;
-    expect(slots(1)).toEqual({ basic: 3, primary: 2, defensive: 1, ultimate: 1 });
-    // 1 + 2 each for the Primary's, the Ultimate's and the Defensive's 2nd and 3rd slots (9), then
-    // 3 for the Primary's 4th; its 5th (4) can't be paid, nor the basic chain's 4th (3).
-    expect(slots(13)).toEqual({ basic: 3, primary: 4, defensive: 3, ultimate: 3 });
-    // 9 + 3 + 4 brings the Primary to five; 3 more, the basic chain's 4th.
-    expect(slots(16)).toEqual({ basic: 3, primary: 5, defensive: 3, ultimate: 3 });
-    expect(slots(19)).toEqual({ basic: 4, primary: 5, defensive: 3, ultimate: 3 });
+    // The Primary is past three already; the Ultimate's 2nd slot costs 1.
+    expect(slots(1)).toEqual({ basic: 3, primary: 4, defensive: 2, ultimate: 2 });
+    // 1 + 2 for the Ultimate's 2nd and 3rd, 2 for the Defensive's 3rd (6), then the Primary's 5th (4): 10.
+    expect(slots(10)).toEqual({ basic: 3, primary: 5, defensive: 3, ultimate: 3 });
+    // 3 more for the basic chain's 4th, 4 more for its 5th: 17.
+    expect(slots(13)).toEqual({ basic: 4, primary: 5, defensive: 3, ultimate: 3 });
+    expect(slots(17)).toEqual({ basic: 5, primary: 5, defensive: 3, ultimate: 3 });
+    expect(betweenDives(registry, { ...base, links: 17 }).equipped.weapon!.moveset!.bought).toEqual({ basic: 2, primary: 1, defensive: 1, ultimate: 2 });
   });
 
   it('changes nothing on a dive still open: every op refuses, and it never loops', () => {
@@ -1173,21 +1050,21 @@ describe('the autopilot between dives', () => {
     const primary = (q: DelveProfile) => chainsOf(q).primary!.moves.map((m) => m.elements);
     const poor = betweenDives(registry, p);
     expect(poor.pair.secondary).toBe('frost');
-    expect(primary(poor)).toEqual([['fire']]);
+    expect(primary(poor)).toEqual([['fire'], ['fire']]);
     const paid = betweenDives(registry, { ...p, manaDust: bal.movesets.elementDust });
-    expect(primary(paid)).toEqual([['fire', 'frost']]);
+    expect(primary(paid).some((e) => e.includes('frost'))).toBe(true);
     expect(paid.manaDust).toBe(0);
   });
 });
 
-/** A moveset without its sockets (see the runes spec: weapon drops roll some, empty). */
+/** A moveset without its sockets (see the runes spec: weapon drops roll some, empty) and runes. */
 function unsocketed(m: Moveset): Moveset {
-  const strip = <X extends Move | Blow>({ runes: _r, ...x }: X) => x;
+  const strip = <X extends Construct>({ runes: _r, ...x }: X) => x;
   const chains = Object.fromEntries(
     Object.entries(m.chains).map(([skill, c]) => [
       skill,
       Array.isArray(c) ? c.map(strip) : { ...c, moves: c!.moves.map(strip) },
     ]),
   );
-  return { chains, slots: m.slots };
+  return { chains, slots: m.slots, bought: m.bought };
 }

```

Create `packages/engine/tests/delve-open-skill-bot.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { betweenDives, runAutopilot } from '../src/delve/autopilot.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { generateItem } from '../src/loot/item-generator.js';
import { emptyMaterials, withMaterial } from '../src/loot/materials.js';
import { defaultMoveset, movesetOf } from '../src/loot/moveset.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { FluxGrade } from '../src/types/crafting.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { Rarity } from '../src/types/gear.js';
import { registry, withUids } from './fixtures/arena.js';

// See the constructs spec §7: the autopilot Opens a skill when it can pay and Power rises, and a
// new save's sword starts with a Primary, so nothing forces a forge before dive 1.

/** A Fire hero after its first dive, wielding a sword of `rarity`, nothing to forge, `flux` of `grade` to spare. */
function veteran(rarity: Rarity, grade: FluxGrade, flux = 1): DelveProfile {
  const p = createDelveProfile(registry, 3, { primary: 'fire' });
  const sword = generateItem(
    registry,
    { uid: 'w', ilvl: 6, rarity, slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(2),
  );
  return withUids({
    ...p,
    equipped: {
      ...p.equipped,
      weapon: { ...sword, moveset: defaultMoveset(registry, sword, 'fire') },
    },
    materials: withMaterial(emptyMaterials(), { kind: 'flux', grade }, flux),
    links: 3,
    scrap: 1000,
    stats: { ...p.stats, dives: 1 },
  });
}

describe('the autopilot and Open a skill', () => {
  it('opens the Ultimate on the magic sword it wields when it can pay, and spends the flux', () => {
    const after = betweenDives(registry, veteran('magic', 'magic'));
    const m = movesetOf(registry, after.equipped.weapon!);
    expect(m.chains.ultimate).toBeDefined();
    expect(m.bought.ultimate).toBe(1);
    expect(after.materials.flux.magic).toBe(0);
  });

  it('leaves it be without the flux, and opens nothing on a common sword (its Ultimate ceiling is 0)', () => {
    const poor = betweenDives(registry, veteran('magic', 'magic', 0));
    expect(movesetOf(registry, poor.equipped.weapon!).chains.ultimate).toBeUndefined();
    const common = betweenDives(registry, veteran('common', 'uncommon', 2));
    expect(movesetOf(registry, common.equipped.weapon!).chains.ultimate).toBeUndefined();
  });
});

describe("a new save's bot", () => {
  it('starts with a Primary of two constructs, before any forge', () => {
    for (const primary of ['fire', 'frost'] as const)
      for (const seed of [1, 2]) {
        const { profile } = runAutopilot(registry, { seed, dives: 0, primary });
        const m = movesetOf(registry, profile.equipped.weapon!);
        expect(m.chains.primary!.moves.length, `${primary} ${seed}`).toBeGreaterThanOrEqual(2);
      }
  });
});

```

Create `packages/engine/tests/delve-open-skill-op.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { openSkill, openSkillPrice } from '../src/delve/crafting.js';
import { startDive } from '../src/delve/dive.js';
import { reattuneItem } from '../src/delve/pair.js';
import {
  createDelveProfile,
  equipItem,
  parseDelveProfile,
  reforgeGear,
  upgradeGear,
  type ProfileActionResult,
} from '../src/delve/profile.js';
import { generateItem, scrapLevelFactor } from '../src/loot/item-generator.js';
import { withMaterial } from '../src/loot/materials.js';
import { heroChains, moveAllPreview, movesetOf } from '../src/loot/moveset.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { GearItem, GearSlot, Rarity } from '../src/types/gear.js';
import { withUids } from './fixtures/arena.js';

// See the constructs spec §3.2: Open a skill (Awaken generalised) gives a skill at 0 slots its
// first slot, bought, holding a plain construct, for its rarity's price.

const registry = createDefaultRegistry();
const table = registry.getDelveBalance().movesets.openSkill;
const item = (uid: string, rarity: Rarity, slot: GearSlot = 'weapon', mana = 'frost' as const) =>
  generateItem(
    registry,
    { uid, ilvl: 8, rarity, slot, ...(slot === 'weapon' && { baseId: 'axe' }), mana },
    new SeededRNG(3).fork(uid),
  );
/** A Fire hero with a magic Frost axe in the bag (and a common one and a rare helm), and the price to spare. */
function smith(): DelveProfile {
  const p = createDelveProfile(registry, 5, { primary: 'fire' });
  const bag = [item('magic', 'magic'), item('common', 'common')];
  return withUids({
    ...p,
    bag: [...bag, item('helm', 'rare', 'helm')],
    materials: withMaterial(p.materials, { kind: 'flux', grade: 'magic' }, 2),
    links: 10,
    scrap: 1000,
  });
}
const ultimateOf = (w: GearItem) => movesetOf(registry, w).chains.ultimate;

describe('openSkillPrice', () => {
  it("is movesets.openSkill by rarity, its scrap × the item level's factor", () => {
    const magic = item('magic', 'magic');
    expect(openSkillPrice(registry, magic)).toEqual({
      flux: table.magic.flux,
      links: table.magic.links,
      scrap: Math.round(table.magic.scrap * scrapLevelFactor(registry, magic.ilvl)),
    });
    expect(openSkillPrice(registry, item('common', 'common')).flux).toEqual({ uncommon: 2 });
  });
});

describe('openSkill', () => {
  it("gives a magic axe its Ultimate: one bought slot holding a plain Nova in the pair's primary, for its price", () => {
    const p = smith();
    const res = openSkill(registry, p, 'magic', 'ultimate');
    expect(res.ok, res.reason).toBe(true);
    const w = res.item!;
    const before = movesetOf(registry, p.bag[0]);
    expect(ultimateOf(w)).toEqual({
      moves: [
        { uid: expect.stringMatching(/^c\d+$/), kind: 'medium', form: 'nova', elements: ['fire'] },
      ],
      payment: 'charge',
    });
    expect(w.moveset).toEqual({
      chains: { ...before.chains, ultimate: ultimateOf(w) },
      slots: { ...before.slots, ultimate: 1 },
      bought: { ...before.bought, ultimate: 1 },
    });
    const cost = openSkillPrice(registry, w);
    expect(res.profile).toMatchObject({ links: 10 - cost.links, scrap: 1000 - cost.scrap });
    expect(res.profile.materials.flux.magic).toBe(2 - (cost.flux.magic ?? 0));
    expect(res.profile.bag.find((i) => i.uid === 'magic')).toEqual(w);
    // Equipped, it fights with the Ultimate.
    const worn = equipItem(registry, res.profile, 'magic');
    expect(heroChains(registry, worn.equipped, worn.pair).ultimate).toEqual(ultimateOf(w));
  });

  it('refuses mid-dive, an unknown item, other gear, a skill with slots, a ceiling of 0, and unpaid', () => {
    const p = smith();
    const reason = (
      q: DelveProfile,
      uid = 'magic',
      skill: 'primary' | 'defensive' | 'ultimate' = 'ultimate',
    ) => openSkill(registry, q, uid, skill).reason;
    expect(reason(startDive(registry, p, 1))).toBe('Forge at the Anvil, between dives');
    expect(reason(p, 'nope')).toBe('Item not found');
    expect(reason(p, 'helm')).toBe('Only a weapon opens a skill');
    expect(reason(p, 'magic', 'primary')).toBe('This skill is open already');
    expect(reason(p, 'magic', 'defensive')).toBe('This skill is open already');
    expect(reason(p, 'common')).toBe("A common weapon can't open its ultimate");
    const flux = { kind: 'flux', grade: 'magic' } as const;
    expect(reason({ ...p, materials: withMaterial(p.materials, flux, -2) })).toBe(
      'Not enough magic flux',
    );
    expect(reason({ ...p, links: table.magic.links - 1 })).toBe('Not enough Links');
    expect(reason({ ...p, scrap: 0 })).toBe('Not enough scrap');
    expect(openSkill(registry, p, 'helm', 'ultimate').profile).toBe(p);
  });

  it('keeps its Ultimate through an upgrade, a reforge, a re-attune and a load', () => {
    const p = openSkill(registry, smith(), 'magic', 'ultimate').profile;
    const kept = (q: DelveProfile) => {
      const w = q.bag.find((i) => i.uid === 'magic')!;
      return [movesetOf(registry, w).bought.ultimate, ultimateOf(w)];
    };
    const done = (r: ProfileActionResult) => {
      expect(r.ok, r.reason).toBe(true);
      return r.profile;
    };
    const want = kept(p);
    expect(kept(done(upgradeGear(registry, p, 'magic')))).toEqual(want);
    expect(kept(done(reforgeGear(registry, p, 'magic', 0)))).toEqual(want);
    expect(kept(done(reattuneItem(registry, { ...p, manaDust: 999 }, 'magic', 'fire')))).toEqual(
      want,
    );
    const json = JSON.parse(JSON.stringify(p));
    expect(kept((parseDelveProfile(registry, json) as { profile: DelveProfile }).profile)).toEqual(
      want,
    );
  });

  it('Move all: the opened skill is a slot of the frame, its bought count staying with the weapon', () => {
    const opened = openSkill(registry, smith(), 'magic', 'ultimate').profile;
    const p = equipItem(registry, opened, 'magic');
    const worn = p.equipped.weapon!;
    // Onto a common axe (no Ultimate slot): the Nova goes to the bag; the magic axe keeps its
    // bought slot, refilled plain.
    const prev = moveAllPreview(registry, worn, p.bag.find((i) => i.uid === 'common')!);
    expect(prev.moveset.chains.ultimate).toBeUndefined();
    expect(prev.toBag.some((c) => 'form' in c && c.form === 'nova')).toBe(true);
    expect(prev.old.bought).toEqual({ ultimate: 1 });
    // Its bought slot stays, empty (the constructs spec §3.3: only the starts refill).
    expect(prev.old.slots.ultimate).toBe(1);
    expect(prev.old.chains.ultimate!.moves).toHaveLength(0);
  });
});

```

## Chunk 9: Task 4 — The switch: constructs with uids, the slot table, Open a skill, Move all's preview, runes on any weapon (continued)

Apply to `packages/engine/tests/delve-pair.test.ts`:

```diff
@@ -6,6 +6,14 @@ import {
   isDefaultBasic,
 } from '../src/arpg/abilities/resolve.js';
 import { UNARMED, defaultMoveset } from '../src/loot/moveset.js';
+
+/** `x` without its constructs' uids (what a test compares against the data's defaults). */
+const noUids = <T>(x: T): T =>
+  JSON.parse(
+    JSON.stringify(x, (k, v) =>
+      k === 'uid' && typeof v === 'string' && v.startsWith('c') ? undefined : v,
+    ),
+  );
 import { betweenDives, runAutopilot } from '../src/delve/autopilot.js';
 import { bankWorld, beginFloor, heroMaxHp, startDive } from '../src/delve/dive.js';
 import {
@@ -342,7 +350,7 @@ describe('the save and the pair', () => {
       pair: { primary: 'fire', secondary: 'storm' },
     };
     const res = fixChainsToPair(registry, p);
-    const fixed = chainsOf(res.profile) as Chains;
+    const fixed = noUids(chainsOf(res.profile)) as Chains;
     expect(fixed.basic).toEqual([chains.basic[0], { kind: 'heavy', element: 'fire' }]);
     expect(fixed.primary.moves).toEqual([
       { kind: 'medium', form: 'lance', elements: ['storm'] },
@@ -350,7 +358,7 @@ describe('the save and the pair', () => {
     ]);
     expect(fixed.defensive.moves).toEqual([{ kind: 'light', form: 'ward', elements: ['fire'] }]);
     expect(fixed.ultimate).toEqual(chains.ultimate);
-    expect(res.fixed).toEqual([
+    expect(noUids(res.fixed)).toEqual([
       { skill: 'basic', index: 1, removed: ['frost'], move: fixed.basic[1] },
       { skill: 'primary', index: 0, removed: ['frost'], move: fixed.primary.moves[0] },
       { skill: 'defensive', index: 0, removed: ['nature'], move: fixed.defensive.moves[0] },
@@ -400,18 +408,20 @@ describe('the pair ops', () => {
     ]);
     expect(res.profile.bag).toEqual([spare]);
     const sword = res.profile.equipped.weapon!;
-    expect(sword.moveset).toEqual(defaultMoveset(registry, sword, 'storm'));
+    expect(noUids(sword.moveset)).toEqual(defaultMoveset(registry, sword, 'storm'));
     // A weapon with extra slots starts over at its base slots too.
     const roomy = withChains(p0, { primary: defaultChains(registry, 'fire', 'sword').primary });
     expect(roomy.equipped.weapon!.moveset!.slots.primary).toBe(4);
     const rebuilt = chooseStartingMana(registry, roomy, 'frost').profile.equipped.weapon!;
-    expect(rebuilt.moveset).toEqual(defaultMoveset(registry, rebuilt, 'frost'));
+    expect(noUids(rebuilt.moveset)).toEqual(defaultMoveset(registry, rebuilt, 'frost'));
     expect(chooseStartingMana(registry, res.profile, 'fire')).toMatchObject({
       ok: false,
       reason: 'Your mana is already chosen',
     });
-    expect(createDelveProfile(registry, 3, { primary: 'storm' })).toEqual(
-      chooseStartingMana(registry, fresh(), 'storm').profile,
+    // The same save but for the constructs' uids: a fresh save's sword was minted before the choice rebuilt it.
+    const sameSave = (q: DelveProfile) => ({ ...noUids(q), nextConstructUid: 0 });
+    expect(sameSave(createDelveProfile(registry, 3, { primary: 'storm' }))).toEqual(
+      sameSave(chooseStartingMana(registry, fresh(), 'storm').profile),
     );
   });
 
@@ -559,9 +569,10 @@ describe('the pair ops', () => {
       { kind: 'heavy', element: 'storm' },
     ];
     const moves: Move[] = [
-      { kind: 'light', form: 'bolt', elements: ['fire', 'storm'] },
-      { kind: 'medium', form: 'bolt', elements: ['storm'] },
-      { kind: 'heavy', form: 'bolt', elements: ['fire'] },
+      // Lances: a sword expresses them (a Bolt would be dormant there, `heroChains`).
+      { kind: 'light', form: 'lance', elements: ['fire', 'storm'] },
+      { kind: 'medium', form: 'lance', elements: ['storm'] },
+      { kind: 'heavy', form: 'lance', elements: ['fire'] },
     ];
     // A Defensive and an Ultimate too (`withChains` sets any skill), one Fire move each.
     const one = (form: 'ward' | 'nova'): Chain => ({
@@ -802,7 +813,7 @@ describe("nothing re-colours a weapon's moves on its own", () => {
     const p = { ...hero(), manaDust: realignDust, scrap: realignScrap };
     // Fire's role (the primary) goes to Storm.
     const res = realign(registry, p, { primary: 'storm', secondary: 'nature' });
-    expect(chainsOf(res.profile).basic).toEqual(defaultBasic(registry, 'sword', 'storm'));
+    expect(noUids(chainsOf(res.profile).basic)).toEqual(defaultBasic(registry, 'sword', 'storm'));
     expect(res.fixed!.filter((f) => f.skill === 'basic').map((f) => [f.index, f.removed])).toEqual([
       [0, ['fire']],
       [1, ['fire']],
@@ -890,7 +901,7 @@ describe('real stats read the pair', () => {
   it('setChain refuses elements outside the pair (anything goes before the choice)', () => {
     const p = armed(registry, createDelveProfile(registry, 3, { primary: 'fire' }));
     const plague: Chain = {
-      moves: [{ kind: 'medium', form: 'bolt', elements: ['fire', 'nature'] }],
+      moves: [{ kind: 'medium', form: 'lance', elements: ['fire', 'nature'] }],
       payment: 'mana',
     };
     expect(setChain(registry, p, 'primary', plague).reason).toBe('Pick from your two elements');
@@ -898,7 +909,8 @@ describe('real stats read the pair', () => {
       'Pick from your two elements',
     );
     const withNature = bindSecondary(registry, p, 'nature').profile;
-    const set = (q: DelveProfile) => chainsOf(setChain(registry, q, 'primary', plague).profile);
+    const set = (q: DelveProfile) =>
+      noUids(chainsOf(setChain(registry, q, 'primary', plague).profile));
     expect(set(withNature).primary).toEqual(plague);
     expect(set(armed(registry, createDelveProfile(registry, 3))).primary).toEqual(plague);
   });

```

Apply to `packages/engine/tests/delve-profile-abilities.test.ts`:

```diff
@@ -1,6 +1,6 @@
 import { describe, it, expect } from 'vitest';
 import { createDefaultRegistry } from '../src/data/default-registry.js';
-import { setChain } from '../src/delve/moveset.js';
+import { OPEN_SKILL_TEXT, setChain } from '../src/delve/moveset.js';
 import { createDelveProfile, parseDelveProfile, unequipSlot } from '../src/delve/profile.js';
 import { startDive } from '../src/delve/dive.js';
 import { defaultMoveset } from '../src/loot/moveset.js';
@@ -10,17 +10,25 @@ import { armed } from './fixtures/carries.js';
 
 const registry = createDefaultRegistry();
 const json = (x: unknown) => JSON.parse(JSON.stringify(x));
+/** `x` without its constructs' uids (the shape a default moveset has before it is minted). */
+const bare = (x: unknown) =>
+  JSON.parse(
+    JSON.stringify(x, (k, v) =>
+      k === 'uid' && typeof v === 'string' && v.startsWith('c') ? undefined : v,
+    ),
+  );
 
-describe('chains on the weapon (save v6)', () => {
-  it("a new profile's common sword carries its base moveset in the weapon's element: the basic chain", () => {
+describe('chains on the weapon', () => {
+  it("a new profile's common sword holds its slot table's defaults in the weapon's element: the basic chain and a two-slot Primary, minted", () => {
     const p = createDelveProfile(registry, 1);
     expect(p.version).toBe(13);
     const sword = p.equipped.weapon!;
-    expect(sword.moveset).toEqual(defaultMoveset(registry, sword, 'fire'));
-    expect(sword.moveset!.slots).toEqual({ basic: 3 });
+    expect(bare(sword.moveset)).toEqual(defaultMoveset(registry, sword, 'fire'));
+    expect(sword.moveset!.slots).toEqual({ basic: 3, primary: 2 });
+    expect(sword.moveset!.chains.primary!.moves.every((m) => /^c\d+$/.test(m.uid!))).toBe(true);
   });
 
-  it('setChain takes a valid chain for a skill the weapon carries, and it round-trips', () => {
+  it('setChain takes a valid chain for a skill the weapon has slots for, and it round-trips', () => {
     const chain: Chain = {
       moves: [
         { kind: 'light', form: 'burst', elements: ['fire', 'nature'] },
@@ -29,17 +37,17 @@ describe('chains on the weapon (save v6)', () => {
       payment: 'cast',
     };
     const roomy = withChains(armed(registry, createDelveProfile(registry, 1)), { primary: chain });
-    let p = setChain(registry, roomy, 'primary', chain).profile;
+    let p = setChain(registry, roomy, 'primary', chainsOf(roomy).primary!).profile;
     p = setChain(registry, p, 'basic', [{ kind: 'heavy', element: 'nature' }]).profile;
-    expect(chainsOf(p).primary).toEqual(chain);
-    expect(chainsOf(p).basic).toEqual([{ kind: 'heavy', element: 'nature' }]);
-    expect(p.equipped.weapon!.moveset!.slots).toEqual({ basic: 3, primary: 2 });
+    expect(bare(chainsOf(p).primary)).toEqual(chain);
+    expect(bare(chainsOf(p).basic)).toEqual([{ kind: 'heavy', element: 'nature' }]);
+    expect(p.equipped.weapon!.moveset!.slots).toEqual({ basic: 3, primary: 2, defensive: 1 });
     expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p });
   });
 
-  it('setChain refuses no moves, more than the slots, an unknown kind, a form from another slot, bad elements or payment', () => {
+  it('setChain refuses more than the slots, no blow, an unknown kind, a form from another slot or class, bad elements or payment', () => {
     const fresh = armed(registry, createDelveProfile(registry, 1));
-    const move: Move = { kind: 'medium', form: 'bolt', elements: ['fire'] };
+    const move: Move = { kind: 'medium', form: 'lance', elements: ['fire'] };
     const ok: Chain = { moves: [move], payment: 'mana' };
     const p = withChains(fresh, {
       basic: Array(5).fill({ kind: 'light', element: 'fire' }),
@@ -47,11 +55,12 @@ describe('chains on the weapon (save v6)', () => {
     });
     const set = (chain: Chain, profile = p) => setChain(registry, profile, 'primary', chain).reason;
     expect(set(ok)).toBeUndefined();
-    expect(set({ ...ok, moves: [] })).toBe('A chain holds 1 to 5 moves');
-    expect(set({ ...ok, moves: Array(6).fill(move) })).toBe('A chain holds 1 to 5 moves');
-    expect(set({ ...ok, moves: [move, move] }, fresh)).toBe('A chain holds 1 to 1 moves');
+    expect(set({ ...ok, moves: [] })).toBeUndefined(); // an empty ability chain plays as none
+    expect(set({ ...ok, moves: Array(6).fill(move) })).toBe('A chain holds 0 to 5 moves');
+    expect(set({ ...ok, moves: [move, move, move] }, fresh)).toBe('A chain holds 0 to 2 moves');
     expect(set({ ...ok, moves: [{ ...move, kind: 'huge' as never }] })).toBe('Bad kind huge');
     expect(set({ ...ok, moves: [{ ...move, form: 'nova' }] })).toBe('Nova is not a primary form');
+    expect(set({ ...ok, moves: [{ ...move, form: 'bolt' }] })).toBe("A sword can't express Bolt");
     for (const elements of [[], ['fire', 'fire'], ['fire', 'frost', 'storm']] as const)
       expect(set({ ...ok, moves: [{ ...move, elements: [...elements] }] })).toBe(
         'Pick one or two different elements',
@@ -63,10 +72,8 @@ describe('chains on the weapon (save v6)', () => {
     expect(
       setChain(registry, p, 'basic', [{ kind: 'light', element: 'gold' as never }]).reason,
     ).toBe('Unknown element');
-    const ward: Chain = { moves: [{ ...move, form: 'ward' }], payment: 'mana' };
-    expect(setChain(registry, p, 'defensive', ward).reason).toBe(
-      'Carried by rare weapons and better',
-    );
+    const nova: Chain = { moves: [{ ...move, form: 'nova' }], payment: 'charge' };
+    expect(setChain(registry, p, 'ultimate', nova).reason).toBe(OPEN_SKILL_TEXT);
     expect(set(ok, unequipSlot(registry, p, 'weapon'))).toBe('Equip a weapon to build your moves');
   });
 

```

Apply to `packages/engine/tests/delve-rune-costs.test.ts`:

```diff
@@ -35,6 +35,7 @@ import { arena, dummy, gear, moveOf, press, registry } from './fixtures/arena.js
 describe('rune costs: the data', () => {
   it("pins every rune's five loads", () => {
     expect(Object.fromEntries(registry.getRunes().map((d) => [d.id, d.load]))).toEqual({
+      detonate: [0.3, 0.35, 0.4, 0.45, 0.5],
       split: [0.27, 0.36, 0.45, 0.54, 0.63],
       multishot: [0.15, 0.2, 0.25, 0.3, 0.35],
       pierce: [0.57, 0.76, 0.95, 1.14, 1.33],
@@ -53,7 +54,7 @@ describe('rune costs: the data', () => {
   });
 
   it('refuses a rune without a load, with four, with one below 0, or with one that falls with tier', () => {
-    const [split] = runesData;
+    const split = runesData.find((r) => r.id === 'split')!;
     const ok = (row: object) => RunesSchema.safeParse([row]).success;
     const { load, ...noLoad } = split;
     expect(ok(split)).toBe(true);
@@ -398,7 +399,8 @@ describe('basicIncome and manaSupport', () => {
     const cases: [Partial<Record<AbilitySlot, Chain>> | undefined, number, number][] = [
       [drained, 77.33972432955927, 1098],
       [charged, 122.88517595614529, 1385],
-      [undefined, 158.57566058873041, 1573],
+      // No chains: the sword's class defaults (two Strikes, a Ward, a Nova) since the constructs spec.
+      [undefined, 177.7613550749895, 1665],
     ];
     for (const [chains, dps, power] of cases) {
       // The chains are runed: v0.51.0's numbers are theirs with the loads zeroed.

```

Apply to `packages/engine/tests/delve-rune-power.test.ts`:

```diff
@@ -78,34 +78,35 @@ describe('Power without runes', () => {
       .profile;
   };
 
-  it("is what it was at v0.50.0: the starters (an Earth Bolt's endless pierce included) and an archer", () => {
-    // The starter sword made uncommon: its basic chain and a Bolt, as the common one carried then.
+  it('is what it is at the switch: the starters (two Strikes and a Ward on an uncommon sword) and an archer', () => {
+    // The starter sword made uncommon: its basic chain, two Strikes and a Ward (the slot table).
     const starter = (primary: ManaType) =>
       estimate(armed(registry, createDelveProfile(registry, 3, { primary })), DEPTH);
     expect(starter('fire')).toEqual({
-      dps: 36.424338129677416,
-      ehp: 162.01086642686363,
-      power: 768,
+      dps: 42.61095657127015,
+      ehp: 210.61412635492272,
+      power: 947,
     });
     expect(starter('earth')).toEqual({
-      dps: 34.21053596129032,
-      ehp: 162.01086642686363,
-      power: 744,
+      dps: 39.590204171370964,
+      ehp: 239.33423449423037,
+      power: 973,
     });
     expect(starter('storm')).toEqual({
-      dps: 40.66745895241935,
-      ehp: 162.01086642686363,
-      power: 812,
+      dps: 46.532077687802406,
+      ehp: 210.61412635492272,
+      power: 990,
     });
     expect(starter('shadow')).toEqual({
-      dps: 34.21053596129032,
-      ehp: 162.01086642686363,
-      power: 744,
+      dps: 39.590204171370964,
+      ehp: 210.61412635492272,
+      power: 913,
     });
+    // The epic bow's drop rolls its moveset over the slot table (four Bolts, two Wards, a Nova).
     expect(estimate(archer(), 15)).toEqual({
-      dps: 336.61787210212225,
+      dps: 378.9112929933396,
       ehp: 198.09056273093927,
-      power: 2582,
+      power: 2740,
     });
   });
 
@@ -276,11 +277,11 @@ describe('the autopilot and runes', () => {
       stats: { ...p.stats, dives: 1 },
     };
   };
-  /** `p` with its Primary one medium Fire Bolt whose sockets hold `runes`. */
+  /** `p` with its Primary one medium Fire Lance (a sword expresses it) whose sockets hold `runes`. */
   const bolt = (p: DelveProfile, runes: (RuneRef | null)[]) =>
     withChains(p, {
       primary: {
-        moves: [{ kind: 'medium', form: 'bolt', elements: ['fire'], runes }],
+        moves: [{ kind: 'medium', form: 'lance', elements: ['fire'], runes }],
         payment: 'mana',
       },
     });
@@ -305,14 +306,14 @@ describe('the autopilot and runes', () => {
   });
 
   it('opens sockets with the Links the slots leave, each for a pouch rune that goes in: the cheapest first, the Primary first', () => {
+    // A wand: it expresses the Bolts (on a sword they'd be dormant).
     const magic = generateItem(
       registry,
-      { uid: 'm', ilvl: 5, rarity: 'magic', slot: 'weapon', baseId: 'sword', mana: 'fire' },
+      { uid: 'm', ilvl: 5, rarity: 'magic', slot: 'weapon', baseId: 'wand', mana: 'fire' },
       new SeededRNG(1),
     );
     const five = <T>(make: () => T): T[] => Array.from({ length: 5 }, make);
-    // Every chain it carries at its cap of 5, so no Link goes to a slot; two sockets a move; Fire
-    // and Nature bound.
+    // Every chain at 5 moves, so no Link goes to a slot; Fire and Nature bound.
     const pair = { primary: 'fire', secondary: 'nature' } as const;
     const bound: DelveProfile = { ...veteran(magic), pair };
     const full = withChains(bound, {
@@ -336,19 +337,19 @@ describe('the autopilot and runes', () => {
     });
     // With the runes' price zeroed, so every Leech and Guard nets Power (the price is the next
     // test's). No rune to put in: no socket opens, and the Links stay (the scrap goes to upgrades).
-    const empty = betweenDives(unloaded, { ...full, links: 17, scrap: 340 });
+    const empty = betweenDives(unloaded, { ...full, links: 16, scrap: 320 });
     expect(sockets(empty, 'primary')).toEqual([0, 0, 0, 0, 0]);
-    expect(empty.links).toBe(17);
+    expect(empty.links).toBe(16);
     // The first sockets (1 Link + 20 scrap each), then second ones (2 + 40), each filled as it
-    // opens: none on the fourth and fifth Wards, where neither rune adds Power, so the Primary's
-    // and the basic chain's first moves take a second.
+    // opens: none on the third to fifth Wards, where neither rune adds Power (Guard's gain rounds
+    // away on a wand), so the Primary's and the basic chain's first moves take a second.
     const runes = { leech: [20, 0, 0, 0, 0], guard: [20, 0, 0, 0, 0] };
-    const after = betweenDives(unloaded, { ...full, links: 17, scrap: 340, runes });
+    const after = betweenDives(unloaded, { ...full, links: 16, scrap: 320, runes });
     expect(sockets(after, 'primary')).toEqual([2, 1, 1, 1, 1]);
     expect(sockets(after, 'basic')).toEqual([2, 1, 1, 1, 1]);
-    expect(sockets(after, 'defensive')).toEqual([1, 1, 1, 0, 0]);
+    expect(sockets(after, 'defensive')).toEqual([1, 1, 0, 0, 0]);
     expect(after).toMatchObject({ links: 0, scrap: 0 });
-    expect(after.runes.leech[0] + after.runes.guard[0]).toBe(40 - 15);
+    expect(after.runes.leech[0] + after.runes.guard[0]).toBe(40 - 14);
   });
 
   it('sockets the pouch rune that raises Power most, and keeps the rest', () => {
@@ -361,14 +362,14 @@ describe('the autopilot and runes', () => {
     expect(after.runes).toMatchObject({ echo: [0, 0, 0, 0, 0], leech: [1, 0, 0, 0, 0] });
   });
 
-  it('changes a socketed rune only for one that gains Power (in destroy mode the old one is gone)', () => {
+  it("changes a socketed rune only for one that gains Power (the old one back in the pouch: the pull rule 'pay')", () => {
     const leeched = {
       ...bolt(veteran(), [{ id: 'leech', tier: 1 }]),
       runes: { echo: [0, 0, 1, 0, 0] },
     };
     const swapped = betweenDives(registry, leeched);
     expect(primaryRunes(swapped)).toEqual([III('echo')]);
-    expect(pouchCount(swapped.runes, { id: 'leech', tier: 1 })).toBe(0);
+    expect(pouchCount(swapped.runes, { id: 'leech', tier: 1 })).toBe(1);
     const echoed = { ...bolt(veteran(), [III('echo')]), runes: { leech: [1, 0, 0, 0, 0] } };
     const kept = betweenDives(registry, echoed);
     expect(primaryRunes(kept)).toEqual([III('echo')]);
@@ -398,7 +399,7 @@ describe('the autopilot and runes', () => {
     expect(opened(dear)).toBe(0);
   });
 
-  it('values a transfer without the runes it would destroy (a rare holds two sockets a move)', () => {
+  it('values a Move all with every rune: sockets belong to the construct, whatever weapon holds it', () => {
     const epic = generateItem(
       registry,
       { uid: 'e', ilvl: 10, rarity: 'epic', slot: 'weapon', baseId: 'sword', mana: 'fire' },
@@ -409,11 +410,12 @@ describe('the autopilot and runes', () => {
       const twin = { ...p.equipped.weapon!, uid: 'twin', rarity: 'rare' as const };
       return compareItem(p.equipped, twin, registry, referenceDepth(p), p.pair);
     };
-    // Echo III in the first socket moves with the move; in the third, past the rare's cap, it's destroyed.
-    const kept = value([III('echo'), null, null]);
-    const lost = value([null, null, III('echo')]);
-    expect(lost.power).toBe(kept.power);
-    expect(lost.newPower).toBeLessThan(kept.newPower);
+    // Echo III in the first socket or the third: the construct moves whole either way.
+    const first = value([III('echo'), null, null]);
+    const third = value([null, null, III('echo')]);
+    expect(third.power).toBe(first.power);
+    expect(third.newPower).toBe(first.newPower);
+    expect(first.newPower).toBeGreaterThan(value([null, null, null]).newPower);
   });
 });
 
@@ -424,7 +426,8 @@ describe('Power and the pool (valuedChain; see the rune costs spec)', () => {
   const pool = manaPool(stats, registry).max;
   const chain = (slot: AbilitySlot, moves: Move[], payment: Chain['payment'] = 'mana') =>
     resolveChain(registry, stats, slot, { moves, payment });
-  const bolt = (kind: MoveKind): Move => ({ kind, form: 'bolt', elements: ['fire'] });
+  // A Lance: the starter's sword expresses it (a Bolt would be dormant there: `heroChains`).
+  const bolt = (kind: MoveKind): Move => ({ kind, form: 'lance', elements: ['fire'] });
   const nova = (kind: MoveKind): Move => ({ kind, form: 'nova', elements: ['fire'] });
 
   it('with no pool, is valuedMove for every move (a hold at full charge)', () => {
@@ -483,8 +486,8 @@ describe('Power and the pool (valuedChain; see the rune costs spec)', () => {
     expect(estimateCombat(s, small, DEPTH, { ...rest, defensive: ward('heavy') })).toEqual(without);
   });
 
-  it('a runed Primary: its v0.51.0 Power with the loads zeroed, and less with them', () => {
-    // Echo, Heavy and Linger III on every move of a Bolt's default chain (mana-bound at a pool of 66).
+  it('a runed Primary: its Power with the loads zeroed, and less with them', () => {
+    // Echo, Heavy and Linger III on every move of a four-Lance chain (mana-bound at a pool of 66).
     const runes = ['echo', 'heavy', 'linger'].map(III);
     const runed = withChains(starter, {
       primary: {
@@ -497,7 +500,7 @@ describe('Power and the pool (valuedChain; see the rune costs spec)', () => {
     });
     const at = (r: DataRegistry) =>
       estimateCombat(profileStats(r, runed), r, DEPTH, chainsOf(runed));
-    expect(at(unloaded)).toEqual({ dps: 97.61729476678113, ehp: 162.01086642686363, power: 1258 });
+    expect(at(unloaded)).toEqual({ dps: 134.34157473298708, ehp: 162.01086642686363, power: 1475 });
     expect(at(registry).dps).toBeLessThan(at(unloaded).dps);
     expect(at(registry).power).toBeLessThan(at(unloaded).power);
   });

```

Apply to `packages/engine/tests/delve-runes-contract.test.ts`:

```diff
@@ -32,12 +32,11 @@ import {
   runeFits,
   runeKnobs,
   runeText,
-  socketCap,
   socketPrice,
   socketsOf,
   takeFromPouch,
 } from '../src/loot/runes.js';
-import type { RunePouch, RuneRef, RuneTier } from '../src/types/rune.js';
+import { MAX_SOCKETS, type RunePouch, type RuneRef, type RuneTier } from '../src/types/rune.js';
 import { SeededRNG } from '../src/rng/seeded-rng.js';
 import { MOVE_KINDS, type Move } from '../src/types/ability.js';
 import type { ArpgEvent } from '../src/types/arpg.js';
@@ -212,8 +211,9 @@ describe("a shot's pierce count", () => {
 describe('data: runes', () => {
   const runes = registry.getRunes();
 
-  it("loads the spec's 14 runes in its order, each with five tiers", () => {
+  it("loads the spec's 14 runes in its order, and the constructs spec's Detonate first, each with five tiers", () => {
     expect(runes.map((r) => r.id)).toEqual([
+      'detonate',
       'split',
       'multishot',
       'pierce',
@@ -230,7 +230,7 @@ describe('data: runes', () => {
       'guard',
     ]);
     expect(runes.map((r) => r.family)).toEqual([
-      ...Array(5).fill('shape'),
+      ...Array(6).fill('shape'),
       ...Array(3).fill('tempo'),
       ...Array(3).fill('elemental'),
       ...Array(3).fill('sustain'),
@@ -290,7 +290,8 @@ describe('data: runes', () => {
   });
 
   it('refuses four tiers, an unknown family, a misspelled knob or a repeated id', () => {
-    const [split, multishot] = runesData;
+    const split = runesData.find((r) => r.id === 'split')!;
+    const multishot = runesData.find((r) => r.id === 'multishot')!;
     const bad = (rows: unknown[]) => RunesSchema.safeParse(rows).success;
     expect(bad(runesData)).toBe(true);
     expect(bad([{ ...split, tiers: split.tiers.slice(0, 4) }])).toBe(false);
@@ -304,8 +305,7 @@ describe('data: runes', () => {
 describe('balance: delve.runes', () => {
   it("loads the spec's numbers", () => {
     expect(bal.runes).toEqual({
-      socketCap: { common: 1, uncommon: 1, magic: 2, rare: 2, epic: 3, legendary: 3 },
-      // The constructs spec §3.5: a drop's socketed rune (the switch task reads it).
+      // The constructs spec §3.5: a drop's socketed rune.
       runeChance: { common: 0, uncommon: 0, magic: 0.05, rare: 0.1, epic: 0.2, legendary: 0.35 },
       socketLinks: [1, 2, 3],
       socketScrap: [20, 40, 60],
@@ -317,7 +317,7 @@ describe('balance: delve.runes', () => {
         epic: [1, 2],
         legendary: [2, 3],
       },
-      unsocket: 'destroy',
+      unsocket: 'pay',
       pullScrap: [15, 30, 50, 80, 120],
       fuseCount: 3,
       fuseScrap: [20, 40, 80, 160],
@@ -335,14 +335,13 @@ describe('balance: delve.runes', () => {
     });
   });
 
-  it('refuses a cap past MAX_SOCKETS and price tables of the wrong length', () => {
+  it('refuses price tables of the wrong length and an unknown pull rule', () => {
     const withRunes = (runes: object) => ({
       ...balanceData,
       delve: { ...balanceData.delve, runes: { ...balanceData.delve.runes, ...runes } },
     });
     const ok = (runes: object) => BalanceConfigSchema.safeParse(withRunes(runes)).success;
     expect(ok({})).toBe(true);
-    expect(ok({ socketCap: { ...balanceData.delve.runes.socketCap, legendary: 4 } })).toBe(false);
     expect(ok({ socketLinks: [1, 2] })).toBe(false);
     // A free socket would let a removal's flat 1-Link refund mint Links.
     expect(ok({ socketLinks: [0, 2, 3] })).toBe(false);
@@ -524,11 +523,9 @@ describe('rune helpers: costs (the rune costs spec)', () => {
 });
 
 describe('rune helpers: sockets and the pouch', () => {
-  it("caps a move's sockets by its weapon's rarity; unarmed has none", () => {
-    expect(socketCap(registry, 'common')).toBe(1);
-    expect(socketCap(registry, 'rare')).toBe(2);
-    expect(socketCap(registry, 'legendary')).toBe(3);
-    expect(socketCap(registry, null)).toBe(0);
+  it('every construct takes up to MAX_SOCKETS (3), whatever weapon holds it (the constructs spec §3.1)', () => {
+    expect(MAX_SOCKETS).toBe(3);
+    expect(bal.runes).not.toHaveProperty('socketCap');
   });
 
   it('prices the next socket by the sockets the move has, none past MAX_SOCKETS', () => {
@@ -593,8 +590,16 @@ describe('the sim and the index: the contract is in place', () => {
       'runeKnobs',
       'runeText',
       'extraShotPower',
-      'socketCap',
       'socketPrice',
+      'rollSocketedRunes',
+      'openSkill',
+      'openSkillPrice',
+      'moveAllPreview',
+      'draftRefusal',
+      'applyStyle',
+      'signatureFor',
+      'withSignature',
+      'mintUid',
       'pouchCount',
       'addToPouch',
       'takeFromPouch',
@@ -621,13 +626,14 @@ describe('the sim and the index: the contract is in place', () => {
 describe('save v9: sockets and the pouch', () => {
   const json = (x: unknown) => JSON.parse(JSON.stringify(x));
   const fresh = () => createDelveProfile(registry, 1, { primary: 'fire' });
+  /** A medium Fire Lance (a sword expresses it; a Bolt would be dormant) holding `runes`. */
   const bolt = (runes: (RuneRef | null)[]): Move => ({
     kind: 'medium',
-    form: 'bolt',
+    form: 'lance',
     elements: ['fire'],
     runes,
   });
-  /** A rare weapon: two sockets a move. */
+  /** A rare weapon. */
   const rare = (p: DelveProfile): DelveProfile => ({
     ...p,
     equipped: { ...p.equipped, weapon: { ...p.equipped.weapon!, rarity: 'rare' } },
@@ -654,7 +660,7 @@ describe('save v9: sockets and the pouch', () => {
     expect(parseDelveProfile(registry, json(res.profile))).toEqual(res);
   });
 
-  it('empties unknown and repeated runes and trims sockets past the cap: a Link each, the runes destroyed', () => {
+  it("empties unknown and repeated runes; the repeated one goes by the pull rule ('pay' as shipped: back to the pouch)", () => {
     const p = {
       ...withChains(rare(fresh()), {
         primary: {
@@ -677,21 +683,21 @@ describe('save v9: sockets and the pouch', () => {
     const res = parseDelveProfile(registry, json(p))!;
     expect(chainsOf(res.profile).primary!.moves.map((m) => m.runes)).toEqual([
       [null, { id: 'chain', tier: 1 }],
-      [{ id: 'quick', tier: 2 }, null],
+      [{ id: 'quick', tier: 2 }, null, { id: 'echo', tier: 1 }],
     ]);
-    expect(res.profile.links).toBe(p.links + 1);
-    // The trimmed Quick III and Echo I are destroyed: the pouch keeps only its own Echo.
-    expect(res.profile.runes).toEqual({ echo: [0, 0, 1, 0, 0] });
+    expect(res.profile.links).toBe(p.links);
+    // The repeated Quick III goes back to the pouch beside its own Echo.
+    expect(res.profile.runes).toEqual({ echo: [0, 0, 1, 0, 0], quick: [0, 0, 1, 0, 0] });
   });
 
-  it("in 'pay' mode the runes a trim takes off go back to the pouch", () => {
+  it("in 'destroy' mode a repeated rune is destroyed", () => {
     const p = {
       ...withChains(armed(registry, fresh()), {
         primary: {
           moves: [
             bolt([
               { id: 'quick', tier: 2 },
-              { id: 'echo', tier: 1 },
+              { id: 'quick', tier: 3 },
             ]),
           ],
           payment: 'mana',
@@ -699,19 +705,19 @@ describe('save v9: sockets and the pouch', () => {
       }),
       runes: { echo: [0, 0, 1, 0, 0] },
     };
-    bal.runes.unsocket = 'pay';
+    bal.runes.unsocket = 'destroy';
     try {
       const res = parseDelveProfile(registry, json(p))!;
-      expect(chainsOf(res.profile).primary!.moves[0].runes).toEqual([{ id: 'quick', tier: 2 }]);
-      expect(res.profile.links).toBe(p.links + 1);
-      expect(res.profile.runes).toEqual({ echo: [1, 0, 1, 0, 0] });
+      expect(chainsOf(res.profile).primary!.moves[0].runes).toEqual([{ id: 'quick', tier: 2 }, null]);
+      expect(res.profile.links).toBe(p.links);
+      expect(res.profile.runes).toEqual({ echo: [0, 0, 1, 0, 0] });
     } finally {
-      bal.runes.unsocket = 'destroy';
+      bal.runes.unsocket = 'pay';
     }
   });
 
-  it("a chain the weapon can't carry takes its sockets with it: a Link each, its runes by the rule", () => {
-    // A common sword carries no Defensive.
+  it('a chain on a skill the rarity starts at 0 is kept as it is (the slot table only gates buying)', () => {
+    // A common sword starts with no Defensive; a save that holds one keeps it.
     const ward: Move = {
       kind: 'medium',
       form: 'ward',
@@ -720,8 +726,8 @@ describe('save v9: sockets and the pouch', () => {
     };
     const p = withChains(fresh(), { defensive: { moves: [ward], payment: 'mana' } });
     const res = parseDelveProfile(registry, json(p))!;
-    expect(res.profile.equipped.weapon!.moveset!.chains.defensive).toBeUndefined();
-    expect(res.profile.links).toBe(p.links + 2);
+    expect(chainsOf(res.profile).defensive!.moves[0].runes).toEqual([{ id: 'guard', tier: 1 }, null]);
+    expect(res.profile.links).toBe(p.links);
     expect(res.profile.runes).toEqual({});
   });
 

```

## Chunk 10: Task 4 — The switch: constructs with uids, the slot table, Open a skill, Move all's preview, runes on any weapon (continued)

Apply to `packages/engine/tests/delve-runes.test.ts`:

```diff
@@ -1,8 +1,8 @@
 import { describe, it, expect } from 'vitest';
 import { SeededRNG } from '../src/rng/seeded-rng.js';
 import { generateItem } from '../src/loot/item-generator.js';
-import { baseSlots, carriedSkills, defaultMoveset } from '../src/loot/moveset.js';
-import { sameChain, setChains, transferMoveset } from '../src/delve/moveset.js';
+import { defaultMoveset, moveAllPreview, slotRange } from '../src/loot/moveset.js';
+import { OPEN_SKILL_TEXT, sameChain, setChains } from '../src/delve/moveset.js';
 import { bankWorld, beginFloor, failFloor, startDive } from '../src/delve/dive.js';
 import { killMonster, makeCtx } from '../src/arpg/combat.js';
 import { setSandboxToggles } from '../src/arpg/sandbox.js';
@@ -34,13 +34,19 @@ import {
   socketsOf,
   weaponParts,
 } from '../src/loot/runes.js';
-import { CHAIN_SKILLS, type Blow, type Chain, type Move } from '../src/types/ability.js';
+import {
+  CHAIN_SKILLS,
+  type Blow,
+  type Chain,
+  type Construct,
+  type Move,
+} from '../src/types/ability.js';
 import type { ArpgWorld, Drop, DropKind, MonsterKind } from '../src/types/arpg.js';
 import type { GearItem, Moveset, Rarity } from '../src/types/gear.js';
 import { RARITY_ORDER } from '../src/types/gear.js';
 import type { DelveProfile, StopKind } from '../src/types/delve.js';
-import type { RunePouch, RuneRef } from '../src/types/rune.js';
-import { arena, bal, chainsOf, dummy, registry, run } from './fixtures/arena.js';
+import { MAX_SOCKETS, type RunePouch, type RuneRef } from '../src/types/rune.js';
+import { arena, bal, chainsOf, dummy, registry, run, withUids } from './fixtures/arena.js';
 import { armed } from './fixtures/carries.js';
 
 // See the runes spec: sockets, the pouch, the draft's price, fusing, drops and the stop.
@@ -70,7 +76,7 @@ function bare(m: Moveset): Moveset {
       Array.isArray(c) ? c.map(strip) : { ...c, moves: c!.moves.map(strip) },
     ]),
   );
-  return { chains, slots: m.slots };
+  return { chains, slots: m.slots, bought: m.bought };
 }
 
 const weapon = (rarity: Rarity, seed: number, baseId?: string): GearItem =>
@@ -156,6 +162,7 @@ describe('the socket roll', () => {
       expect(JSON.stringify(m)).toBe(before);
       expect(bare(out)).toEqual(m);
       expect(openSockets(out)).toBeGreaterThanOrEqual(2);
+      for (const x of allMoves(out)) expect(socketsOf(x).length).toBeLessThanOrEqual(MAX_SOCKETS);
     }
     // Nothing to open: the moveset itself, untouched.
     expect(rollSockets(registry, { rarity: 'uncommon' }, m, new SeededRNG(1))).toBe(m);
@@ -163,40 +170,45 @@ describe('the socket roll', () => {
 });
 
 describe("a weapon's parts", () => {
-  it('a Link for each extra slot and each open socket, and the runes in them; other gear none', () => {
+  it('a Link for each bought slot, the runes in its sockets, and its constructs; other gear none', () => {
     const w = weapon('rare', 1, 'sword');
     const moveset = defaultMoveset(registry, w, 'storm', { basic: 4, primary: 2, defensive: 1 });
+    moveset.bought = { basic: 1, primary: 1 };
     const [first] = moveset.chains.basic!;
     moveset.chains.basic![0] = { ...first, runes: [{ id: 'chain', tier: 2 }, null] };
     const primary = moveset.chains.primary!;
     primary.moves[1] = { ...primary.moves[1], runes: [{ id: 'quick', tier: 1 }] };
-    expect(weaponParts(registry, { ...w, moveset })).toEqual({
-      links: 2 + 3,
+    const parts = weaponParts(registry, { ...w, moveset });
+    expect(parts).toMatchObject({
+      links: 2,
       runes: [
         { id: 'chain', tier: 2 },
         { id: 'quick', tier: 1 },
       ],
     });
+    expect(parts.constructs).toHaveLength(allMoves(moveset).length);
     const chest = generateItem(
       registry,
       { uid: 'c', ilvl: 2, rarity: 'rare', slot: 'chest' },
       new SeededRNG(2),
     );
-    expect(weaponParts(registry, chest)).toEqual({ links: 0, runes: [] });
+    expect(weaponParts(registry, chest)).toEqual({ links: 0, runes: [], constructs: [] });
   });
 });
 
+
 const CHAIN_II: RuneRef = { id: 'chain', tier: 2 };
 const SPLIT_I: RuneRef = { id: 'split', tier: 1 };
 
 /**
- * A rare sword (`uid`) with one extra basic slot and three open sockets: its
- * first blow holds Chain II and an empty socket, its Bolt holds Split I.
- * Its parts: 4 Links, and the two runes.
+ * A rare sword (`uid`) with one bought basic slot and three open sockets: its
+ * first blow holds Chain II and an empty socket, its first Strike holds Split I.
+ * Its parts: 1 Link (the bought slot), and the two runes.
  */
 function socketedSword(uid = 'w'): GearItem {
   const w = { ...weapon('rare', 1, 'sword'), uid };
   const moveset = defaultMoveset(registry, w, 'storm', { basic: 4, primary: 1, defensive: 1 });
+  moveset.bought = { basic: 1 };
   moveset.chains.basic![0] = { ...moveset.chains.basic![0], runes: [CHAIN_II, null] };
   const primary = moveset.chains.primary!;
   primary.moves[0] = { ...primary.moves[0], runes: [SPLIT_I] };
@@ -205,27 +217,26 @@ function socketedSword(uid = 'w'): GearItem {
 
 describe('the parts rule', () => {
   const hero = () => createDelveProfile(registry, 3, { primary: 'storm' });
-  /** The socketed sword's Links on salvage: its parts past a rare forge's free extras. */
-  const free = bal.crafting.weaponExtras.rare;
-  const links = 4 - free.slots - free.sockets;
+  /** The socketed sword's Links on salvage: its one bought slot. */
+  const links = 1;
 
-  it('reads the pull mode from the balance unless overridden', () => {
-    expect(R.unsocket).toBe('destroy');
-    expect(unsocketMode(registry)).toBe('destroy');
-    expect(unsocketMode(registry, null)).toBe('destroy');
+  it("reads the pull mode from the balance ('pay' as shipped) unless overridden", () => {
+    expect(R.unsocket).toBe('pay');
+    expect(unsocketMode(registry)).toBe('pay');
+    expect(unsocketMode(registry, null)).toBe('pay');
     expect(unsocketMode(registry, 'pay')).toBe('pay');
     expect(unsocketMode(registry, 'destroy')).toBe('destroy');
   });
 
-  it('salvage: a Link for each extra slot and open socket past the forged ones; the runes destroyed, or back to the pouch in pay mode', () => {
+  it('salvage: a Link for each bought slot; the runes back to the pouch, or destroyed in destroy mode', () => {
     const p = { ...hero(), bag: [socketedSword()] };
-    const gone = salvageItems(registry, p, ['w']);
-    expect(gone).toMatchObject({ links, count: 1, runes: [], destroyed: [CHAIN_II, SPLIT_I] });
-    expect(gone.profile.links).toBe(links);
-    expect(gone.profile.runes).toEqual({});
-    const paid = salvageItems(registry, p, ['w'], { unsocket: 'pay' });
-    expect(paid).toMatchObject({ links, runes: [CHAIN_II, SPLIT_I], destroyed: [] });
+    const paid = salvageItems(registry, p, ['w']);
+    expect(paid).toMatchObject({ links, count: 1, runes: [CHAIN_II, SPLIT_I], destroyed: [] });
+    expect(paid.profile.links).toBe(links);
     expect(paid.profile.runes).toEqual({ chain: [0, 1, 0, 0, 0], split: [1, 0, 0, 0, 0] });
+    const gone = salvageItems(registry, p, ['w'], { unsocket: 'destroy' });
+    expect(gone).toMatchObject({ links, runes: [], destroyed: [CHAIN_II, SPLIT_I] });
+    expect(gone.profile.runes).toEqual({});
     // Nothing melts mid-dive, so nothing comes back.
     const diving = startDive(registry, p, 1);
     expect(salvageItems(registry, diving, ['w'])).toMatchObject({
@@ -238,16 +249,16 @@ describe('the parts rule', () => {
 
   it('auto-salvage and a full bag melt a socketed weapon the same way', () => {
     const auto = setAutoSalvage(hero(), 'rare', true);
-    const melted = addLootToBag(registry, auto, [socketedSword()]);
-    expect(melted).toMatchObject({ links, runes: [], destroyed: [CHAIN_II, SPLIT_I] });
-    const paid = addLootToBag(registry, auto, [socketedSword()], { unsocket: 'pay' });
+    const paid = addLootToBag(registry, auto, [socketedSword()]);
     expect(paid).toMatchObject({ links, runes: [CHAIN_II, SPLIT_I], destroyed: [] });
     expect(paid.profile.runes).toEqual({ chain: [0, 1, 0, 0, 0], split: [1, 0, 0, 0, 0] });
+    const melted = addLootToBag(registry, auto, [socketedSword()], { unsocket: 'destroy' });
+    expect(melted).toMatchObject({ links, runes: [], destroyed: [CHAIN_II, SPLIT_I] });
     const full = { ...hero(), bag: Array(bal.loot.bagSize).fill(socketedSword('x')) };
     expect(addLootToBag(registry, full, [socketedSword()])).toMatchObject({
       bagFull: true,
       links,
-      destroyed: [CHAIN_II, SPLIT_I],
+      runes: [CHAIN_II, SPLIT_I],
     });
     // Kept loot gives nothing back.
     expect(addLootToBag(registry, hero(), [socketedSword()])).toMatchObject({
@@ -278,22 +289,32 @@ describe('the parts rule', () => {
     expect(salvageCandidates(registry, wield(plain), 'epic')).toEqual(['w']);
   });
 
-  it('the choice of mana rebuilds the weapon: its sockets back as Links, its runes by the rule', () => {
+  it('the choice of mana rebuilds the weapon plain: its bought slots back as Links, its runes by the rule', () => {
     const unchosen = createDelveProfile(registry, 3);
     const p = { ...unchosen, equipped: { ...unchosen.equipped, weapon: socketedSword() } };
     const res = chooseStartingMana(registry, p, 'fire');
-    expect(res).toMatchObject({ ok: true, links: 3, runes: [], destroyed: [CHAIN_II, SPLIT_I] });
-    expect(res.profile.links).toBe(3); // the open sockets; the extra slot, as before, is not refunded
+    expect(res).toMatchObject({ ok: true, links: 1, runes: [CHAIN_II, SPLIT_I], destroyed: [] });
+    expect(res.profile.links).toBe(1);
     const sword = res.profile.equipped.weapon!;
-    expect(sword.moveset).toEqual(defaultMoveset(registry, sword, 'fire'));
-    const paid = chooseStartingMana(registry, p, 'fire', { unsocket: 'pay' });
-    expect(paid.profile.runes).toEqual({ chain: [0, 1, 0, 0, 0], split: [1, 0, 0, 0, 0] });
+    expect(bareUids(sword.moveset)).toEqual(defaultMoveset(registry, sword, 'fire'));
+    expect(allMoves(sword.moveset!).every((m) => /^c\d+$/.test(m.uid!))).toBe(true);
+    expect(res.profile.runes).toEqual({ chain: [0, 1, 0, 0, 0], split: [1, 0, 0, 0, 0] });
+    const gone = chooseStartingMana(registry, p, 'fire', { unsocket: 'destroy' });
+    expect(gone).toMatchObject({ runes: [], destroyed: [CHAIN_II, SPLIT_I] });
     // A fresh hero has no parts: a new save is unchanged.
     const fresh = createDelveProfile(registry, 3, { primary: 'fire' });
     expect([fresh.links, fresh.runes]).toEqual([0, {}]);
   });
 });
 
+/** A moveset without its constructs' uids. */
+function bareUids(m: Moveset | undefined): unknown {
+  return JSON.parse(
+    JSON.stringify(m, (k, v) => (k === 'uid' && typeof v === 'string' && v.startsWith('c') ? undefined : v)),
+  );
+}
+
+
 const QUICK_I: RuneRef = { id: 'quick', tier: 1 };
 const ECHO_I: RuneRef = { id: 'echo', tier: 1 };
 const GUARD_I: RuneRef = { id: 'guard', tier: 1 };
@@ -308,39 +329,31 @@ function slotted(w: GearItem, slots: Moveset['slots']): GearItem {
   return { ...w, moveset: defaultMoveset(registry, w, w.mana, slots) };
 }
 
-describe('transfer: sockets move with their moves', () => {
-  const T = bal.movesets.transferScrap;
-  /** A Storm hero wielding `w`, with scrap to spare, and `bag` in the bag. */
+describe('Move all: sockets and runes travel with their constructs (the preview)', () => {
+  /** A Storm hero wielding `w`, with scrap to spare, and `bag` in the bag, every construct minted. */
   const holding = (w: GearItem, ...bag: GearItem[]): DelveProfile => {
     const p = createDelveProfile(registry, 3, { primary: 'storm' });
-    return { ...p, equipped: { ...p.equipped, weapon: w }, bag, scrap: 1000 };
+    return withUids({ ...p, equipped: { ...p.equipped, weapon: w }, bag, scrap: 1000 });
   };
+  const runesOf = (c: Construct[]) => c.flatMap((m) => socketsOf(m).filter((r): r is RuneRef => r !== null));
 
-  it("moves each kept move's sockets and runes, priced per open socket; the target's replaced ones come back", () => {
-    // The target: a rare axe whose own Bolt holds Quick I.
+  it("each moved construct keeps its sockets and runes; the target's replaced constructs go to the bag with theirs", () => {
+    // The target: a rare axe whose own first Strike holds Quick I.
     const axe = slotted(
       { ...weapon('rare', 2, 'axe'), uid: 'axe' },
-      { basic: 3, primary: 1, defensive: 1 },
+      { basic: 3, primary: 3, defensive: 2, ultimate: 1 },
     );
-    const bolt = axe.moveset!.chains.primary!;
-    bolt.moves[0] = { ...bolt.moves[0], runes: [QUICK_I] };
-    const res = transferMoveset(registry, holding(socketedSword(), axe), 'axe');
-    expect(res.ok).toBe(true);
-    const moved = res.profile.equipped.weapon!.moveset!;
-    expect(moved.chains.basic![0].runes).toEqual([CHAIN_II, null]);
-    expect(moved.chains.primary!.moves[0].runes).toEqual([SPLIT_I]);
-    // The sword's extra slot and its three open sockets move; the axe's socket comes back.
-    expect(res.profile.scrap).toBe(1000 - 4 * T);
-    expect(res).toMatchObject({ links: 1, runes: [], destroyed: [QUICK_I] });
-    expect(res.profile.links).toBe(1);
-    const paid = transferMoveset(registry, holding(socketedSword(), axe), 'axe', {
-      unsocket: 'pay',
-    });
-    expect(paid).toMatchObject({ links: 1, runes: [QUICK_I], destroyed: [] });
-    expect(paid.profile.runes).toEqual({ quick: [1, 0, 0, 0, 0] });
+    const strike = axe.moveset!.chains.primary!;
+    strike.moves[0] = { ...strike.moves[0], runes: [QUICK_I] };
+    const p = holding(socketedSword(), axe);
+    const prev = moveAllPreview(registry, p.equipped.weapon!, p.bag[0]);
+    expect(prev.moveset.chains.basic![0].runes).toEqual([CHAIN_II, null]);
+    expect(prev.moveset.chains.primary!.moves[0].runes).toEqual([SPLIT_I]);
+    expect(runesOf(prev.toBag)).toEqual([QUICK_I]);
+    expect(prev.dormant).toEqual([]);
   });
 
-  it("a blow's rune that doesn't fit the target leaves, its socket open; past the cap and on a chain left behind, they come back", () => {
+  it("a blow's rune that doesn't fit the target stays on the blow, dormant there; a construct past the target's slots goes to the bag with its runes", () => {
     // A legendary bow: its first blow holds Split II, Chain I and an empty socket; its Ward Guard I.
     const bow = slotted(weapon('legendary', 3, 'bow'), {
       basic: 3,
@@ -352,30 +365,22 @@ describe('transfer: sockets move with their moves', () => {
     blows[0] = { ...blows[0], runes: [{ id: 'split', tier: 2 }, { id: 'chain', tier: 1 }, null] };
     const ward = bow.moveset!.chains.defensive!;
     ward.moves[0] = { ...ward.moves[0], runes: [GUARD_I] };
-    // Onto a common sword: one socket a move, no Defensive.
+    // Onto a common sword: no Defensive slot.
     const sword = { ...weapon('common', 4, 'sword'), uid: 'sword' };
-    const res = transferMoveset(registry, holding(bow, sword), 'sword');
-    expect(res.profile.equipped.weapon!.moveset!.chains.basic![0].runes).toEqual([null]);
-    // Back: the two sockets past the cap and the Ward's; Split doesn't fit a sword's blows.
-    expect(res).toMatchObject({
-      links: 3,
-      destroyed: [{ id: 'chain', tier: 1 }, { id: 'split', tier: 2 }, GUARD_I],
-    });
-    expect(res.profile.scrap).toBe(1000 - T); // the one socket that moved
-  });
-
-  it('a move the transfer drops takes its sockets with it, back as Links', () => {
-    // A dagger's full string (4 + 1 extra) onto a maul (2): 3 slots, the last two blows gone.
-    const dagger = slotted(weapon('magic', 3, 'dagger'), { basic: 5, primary: 1, defensive: 1 });
-    const blows = dagger.moveset!.chains.basic!;
-    blows[4] = { ...blows[4], runes: [ECHO_I] };
-    const maul = { ...weapon('common', 4, 'maul'), uid: 'maul' };
-    const res = transferMoveset(registry, holding(dagger, maul), 'maul');
-    expect(res).toMatchObject({ links: 1, destroyed: [ECHO_I] });
-    expect(res.profile.scrap).toBe(1000 - T); // the extra slot; the dropped socket isn't priced
+    const p = holding(bow, sword);
+    const prev = moveAllPreview(registry, p.equipped.weapon!, p.bag[0]);
+    expect(prev.moveset.chains.basic![0].runes).toEqual([
+      { id: 'split', tier: 2 },
+      { id: 'chain', tier: 1 },
+      null,
+    ]);
+    expect(prev.moveset.chains.defensive).toBeUndefined();
+    expect(runesOf(prev.toBag)).toContainEqual(GUARD_I);
+    // The bow's Bolt sits on the sword, dormant (its class can't express it).
+    expect(prev.dormant).toEqual([p.equipped.weapon!.moveset!.chains.primary!.moves[0].uid]);
   });
 
-  it('conserves Links and runes over random transfers and salvages, in both modes, and reads back', () => {
+  it('conserves runes over random Move all previews: every rune is on the moveset or in the bag', () => {
     const rng = new SeededRNG(77);
     const bases = ['sword', 'axe', 'dagger', 'maul', 'staff', 'wand', 'bow'];
     /** A random weapon at random slots, each move with random sockets holding random fitting runes. */
@@ -388,14 +393,16 @@ describe('transfer: sockets move with their moves', () => {
         rng.fork(uid),
       );
       const slots: Moveset['slots'] = {};
-      for (const s of carriedSkills(registry, { rarity }))
-        slots[s] = rng.nextInt(baseSlots(registry, baseId, s), bal.chains.cap[s]);
+      for (const s of CHAIN_SKILLS) {
+        const [start, ceiling] = slotRange(registry, w, s);
+        if (start > 0) slots[s] = rng.nextInt(start, ceiling);
+      }
       const moveset = defaultMoveset(registry, w, 'fire', slots);
       for (const m of allMoves(moveset)) {
         const on = 'form' in m ? { form: m.form } : { weapon: baseId, kind: m.kind };
         const fit = registry.getRunes().filter((d) => runeFits(d, on));
         const runes: (RuneRef | null)[] = [];
-        for (let i = rng.nextInt(0, R.socketCap[rarity]); i > 0; i--) {
+        for (let i = rng.nextInt(0, MAX_SOCKETS); i > 0; i--) {
           const def = fit[rng.nextInt(0, fit.length - 1)];
           const empty = rng.next() < 0.3 || runes.some((r) => r?.id === def.id);
           runes.push(empty ? null : { id: def.id, tier: rng.nextInt(1, 5) as RuneRef['tier'] });
@@ -404,33 +411,28 @@ describe('transfer: sockets move with their moves', () => {
       }
       return { ...w, moveset };
     };
-    const totals = (q: DelveProfile, destroyed: RuneRef[]) => {
-      const weapons = [q.equipped.weapon!, ...q.bag].map((i) => weaponParts(registry, i));
-      return {
-        links: q.links + weapons.reduce((n, p) => n + p.links, 0),
-        runes:
-          pouchSize(q.runes) + weapons.reduce((n, p) => n + p.runes.length, 0) + destroyed.length,
-      };
-    };
-    for (let n = 0; n < 400; n++) {
-      const unsocket = n % 2 === 0 ? 'destroy' : 'pay';
+    const count = (runes: RuneRef[]) => runes.map((r) => `${r.id}:${r.tier}`).sort();
+    for (let n = 0; n < 200; n++) {
       const a = randomWeapon(`a${n}`);
       const b = randomWeapon(`b${n}`);
-      const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
-      const p = { ...p0, equipped: { ...p0.equipped, weapon: a }, bag: [b], scrap: 1e6 };
-      const before = totals(p, []);
-      const t = transferMoveset(registry, p, b.uid, { unsocket });
-      expect(t.ok).toBe(true);
-      expect(totals(t.profile, t.destroyed!)).toEqual(before);
-      const saved = JSON.parse(JSON.stringify(t.profile));
-      expect(parseDelveProfile(registry, saved)!.profile).toEqual(t.profile);
-      const s = salvageItems(registry, t.profile, [a.uid], { unsocket });
-      expect(s.count).toBe(1);
-      expect(totals(s.profile, [...t.destroyed!, ...s.destroyed])).toEqual(before);
+      const p = holding(a, b);
+      const before = count([...weaponParts(registry, p.equipped.weapon!).runes, ...weaponParts(registry, p.bag[0]).runes]);
+      const prev = moveAllPreview(registry, p.equipped.weapon!, p.bag[0]);
+      const after = count([
+        ...allMoves(prev.moveset).flatMap((m) => socketsOf(m).filter((r): r is RuneRef => r !== null)),
+        ...runesOf(prev.toBag),
+      ]);
+      expect(after).toEqual(before);
+      // Nothing of the old weapon's refill carries a rune or a uid.
+      expect(allMoves(prev.old).every((m) => !m.uid && socketsOf(m).every((r) => r === null))).toBe(true);
+      // Every moved construct keeps its uid once, and the bag the rest.
+      const uids = [...allMoves(prev.moveset), ...prev.toBag].map((m) => m.uid);
+      expect(new Set(uids).size).toBe(uids.length);
     }
   });
 });
 
+
 const QUICK_II: RuneRef = { id: 'quick', tier: 2 };
 const CHAIN_I: RuneRef = { id: 'chain', tier: 1 };
 
@@ -452,7 +454,7 @@ function ready(): DelveProfile {
   const primary = bow.moveset!.chains.primary!;
   primary.moves[0] = { ...primary.moves[0], runes: [SPLIT_I, null] };
   primary.moves[1] = { ...primary.moves[1], runes: [QUICK_II] };
-  return {
+  return withUids({
     ...p,
     equipped: { ...p.equipped, weapon: bow },
     links: 10,
@@ -460,7 +462,7 @@ function ready(): DelveProfile {
     manaDust: 100,
     stats: { ...p.stats, dives: 1 },
     runes: { split: [2, 0, 0, 0, 0], chain: [1, 0, 0, 0, 0], echo: [1, 0, 0, 0, 0] },
-  };
+  });
 }
 
 /** The hero's Primary chain. */
@@ -496,15 +498,16 @@ describe('the draft: sockets and runes through setChains', () => {
     expect(R.socketScrap).toEqual([20, 40, 60]);
   });
 
-  it('a pull follows the mode: destroy is free and the rune is gone; pay costs its tier and returns it', () => {
+  it('a pull follows the mode: destroy is free and the rune is gone; pay (as shipped) costs its tier and returns it', () => {
     const p = ready();
     const c = withRunes(primaryOf(p), 1, [null]);
-    expect(draftPrice(registry, p, { primary: c })).toMatchObject({
+    const DESTROY = { unsocket: 'destroy' as const };
+    expect(draftPrice(registry, p, { primary: c }, DESTROY)).toMatchObject({
       scrap: 0,
       destroys: [QUICK_II],
       returns: [],
     });
-    const gone = setChains(registry, p, { primary: c });
+    const gone = setChains(registry, p, { primary: c }, DESTROY);
     expect(gone).toMatchObject({ ok: true, runes: [], destroyed: [QUICK_II] });
     expect(gone.profile.scrap).toBe(500);
     expect(gone.profile.runes).toEqual(p.runes);
@@ -522,31 +525,27 @@ describe('the draft: sockets and runes through setChains', () => {
       pouch: paid.profile.runes,
     });
     // Overwriting is a pull and a socket: Quick II out, Echo I in from the pouch.
-    const over = setChains(registry, p, { primary: withRunes(primaryOf(p), 1, [ECHO_I]) });
+    const over = setChains(registry, p, { primary: withRunes(primaryOf(p), 1, [ECHO_I]) }, DESTROY);
     expect(over).toMatchObject({ ok: true, destroyed: [QUICK_II] });
     expect(over.profile.runes.echo).toEqual([0, 0, 0, 0, 0]);
   });
 
-  it('reordering carries the runes; a removed move gives its sockets back, netted against those opened', () => {
+  it('reordering carries the runes, free; a removed construct gives its sockets back, netted against those opened', () => {
     const p = ready();
     const [m0, m1, m2] = primaryOf(p).moves;
     const swapped = { ...primaryOf(p), moves: [m1, m0, m2] };
-    const moved = setChains(registry, p, { primary: swapped }, { origins: { primary: [1, 0, 2] } });
+    const moved = setChains(registry, p, { primary: swapped });
     expect(moved).toMatchObject({ ok: true, destroyed: [] });
-    expect(moved.profile).toMatchObject({ links: 10, scrap: 500, manaDust: 100 - E });
+    expect(moved.profile).toMatchObject({ links: 10, scrap: 500, manaDust: 100 });
     expect(primaryOf(moved.profile).moves.map((m) => m.runes)).toEqual([
       [QUICK_II],
       [SPLIT_I, null],
       undefined,
     ]);
-    // Read in place, the same chain would close move 0's second socket.
-    expect(draftPrice(registry, p, { primary: swapped })).toEqual({
-      refused: "Sockets can't be closed",
-    });
-    // Move 0 removed (2 sockets back, Split I pulled), move 2's first socket opened.
+    // Move 0 removed (2 sockets back, Split I pulled, 'destroy' here), move 2's first socket opened.
     const removed = { ...primaryOf(p), moves: [m1, { ...m2, runes: [null] }] };
-    const origins = { primary: [1, 2] };
-    expect(draftPrice(registry, p, { primary: removed }, { origins })).toEqual({
+    const DESTROY = { unsocket: 'destroy' as const };
+    expect(draftPrice(registry, p, { primary: removed }, DESTROY)).toEqual({
       dust: E,
       links: 1,
       scrap: 20,
@@ -555,12 +554,10 @@ describe('the draft: sockets and runes through setChains', () => {
       returns: [],
       pouch: p.runes,
     });
-    const res = setChains(registry, p, { primary: removed }, { origins });
+    const res = setChains(registry, p, { primary: removed }, DESTROY);
     expect(res.profile).toMatchObject({ links: 10 - 1 + 2, scrap: 480, manaDust: 100 - E });
     // The refund pays for the socket: a hero with no Links can still do it.
-    expect(setChains(registry, { ...p, links: 0 }, { primary: removed }, { origins }).ok).toBe(
-      true,
-    );
+    expect(setChains(registry, { ...p, links: 0 }, { primary: removed }, DESTROY).ok).toBe(true);
   });
 
   it('a rune that changes moves is a pull plus a socket: destroy needs another in the pouch, pay can re-socket it', () => {
@@ -570,19 +567,20 @@ describe('the draft: sockets and runes through setChains', () => {
       ...primaryOf(p),
       moves: [{ ...m0, runes: [null, null] }, m1, { ...m2, runes: [SPLIT_I] }],
     };
-    expect(draftPrice(registry, p, { primary: c })).toEqual({
+    const DESTROY = { unsocket: 'destroy' as const };
+    expect(draftPrice(registry, p, { primary: c }, DESTROY)).toEqual({
       dust: 0,
       links: 1,
       scrap: 20,
       refundLinks: 0,
       destroys: [SPLIT_I],
       returns: [],
-      pouch: setChains(registry, p, { primary: c }).profile.runes,
+      pouch: setChains(registry, p, { primary: c }, DESTROY).profile.runes,
     });
-    const res = setChains(registry, p, { primary: c });
+    const res = setChains(registry, p, { primary: c }, DESTROY);
     expect(res.profile.runes.split).toEqual([1, 0, 0, 0, 0]);
     const empty = { ...p, runes: {} };
-    expect(setChains(registry, empty, { primary: c })).toMatchObject({
+    expect(setChains(registry, empty, { primary: c }, DESTROY)).toMatchObject({
       ok: false,
       profile: empty,
       reason: 'Not enough runes in your pouch',
@@ -592,7 +590,7 @@ describe('the draft: sockets and runes through setChains', () => {
     expect(paid.profile).toMatchObject({ scrap: 500 - 20 - 15, runes: { split: [0, 0, 0, 0, 0] } });
   });
 
-  it('refuses past the cap, a closed socket, a rune twice, one that does not fit or is unknown, and bad origins', () => {
+  it('refuses past MAX_SOCKETS, a closed socket, a rune twice, and one that does not fit or is unknown', () => {
     const p = ready();
     const c = primaryOf(p);
     const reason = (next: Chain, opts = {}) => {
@@ -600,16 +598,13 @@ describe('the draft: sockets and runes through setChains', () => {
       expect(res.profile).toBe(p);
       return res.reason;
     };
-    expect(reason(withRunes(c, 2, [null, null, null, null]))).toBe(
-      "This weapon's moves hold at most 3 sockets",
-    );
+    expect(reason(withRunes(c, 2, [null, null, null, null]))).toBe('A move holds at most 3 sockets');
     expect(reason(withRunes(c, 0, [SPLIT_I]))).toBe("Sockets can't be closed");
     expect(reason(withRunes(c, 0, [SPLIT_I, { id: 'split', tier: 2 }]))).toBe(
       'A move takes one Split',
     );
     expect(reason(withRunes(c, 2, [{ id: 'widen', tier: 1 }]))).toBe("Widen doesn't fit a Bolt");
     expect(reason(withRunes(c, 2, [{ id: 'nope', tier: 1 }]))).toBe('Unknown rune nope');
-    expect(reason(c, { origins: { primary: [0, 0, 1] } })).toBe('Bad origins');
     // A form change is refused while a socketed rune wouldn't fit it.
     const lance = {
       ...c,
@@ -651,31 +646,24 @@ describe('the draft: sockets and runes through setChains', () => {
     expect(sameChain(c, withRunes(c, 1, [QUICK_II]))).toBe(true);
   });
 
-  it('nets Links: a batch is never dearer than its edits one Apply at a time, and the same when it removes no move (random edits, origins composed)', () => {
+  it('nets Links: a batch is never dearer than its edits one Apply at a time, and the same when it removes no move (random edits, by uid)', () => {
     const rng = new SeededRNG(21);
     const fits = registry.getRunes().filter((d) => runeFits(d, { form: 'bolt' }));
     const pouch = Object.fromEntries(registry.getRunes().map((d) => [d.id, [50, 50, 50, 50, 50]]));
-    /** One edit as the builder makes it: the new chain, and each new move's index in `c` (null: new). */
-    const randomEdit = (c: Chain, remove: boolean): { next: Chain; map: (number | null)[] } => {
+    /** One edit as the builder makes it: the new chain (its constructs keep their uids; a new one has none). */
+    const randomEdit = (c: Chain, remove: boolean): { next: Chain } => {
       const moves = c.moves.map((m) => ({ ...m }));
-      const map: (number | null)[] = moves.map((_, i) => i);
       const i = rng.nextInt(0, moves.length - 1);
       const sockets = [...socketsOf(moves[i])];
       switch (rng.nextInt(0, 5)) {
         case 0:
-          if (remove && moves.length > 1) [moves, map].forEach((xs) => xs.splice(i, 1));
+          if (remove && moves.length > 1) moves.splice(i, 1);
           break;
         case 1:
-          if (i + 1 < moves.length) {
-            [moves[i], moves[i + 1]] = [moves[i + 1], moves[i]];
-            [map[i], map[i + 1]] = [map[i + 1], map[i]];
-          }
+          if (i + 1 < moves.length) [moves[i], moves[i + 1]] = [moves[i + 1], moves[i]];
           break;
         case 2:
-          if (moves.length < 3) {
-            moves.push({ kind: 'light', form: 'bolt', elements: ['storm'] });
-            map.push(null);
-          }
+          if (moves.length < 3) moves.push({ kind: 'light', form: 'bolt', elements: ['storm'] });
           break;
         case 3:
           if (sockets.length < 3) moves[i].runes = [...sockets, null];
@@ -698,7 +686,7 @@ describe('the draft: sockets and runes through setChains', () => {
           break;
         }
       }
-      return { next: { ...c, moves }, map };
+      return { next: { ...c, moves } };
     };
     for (let n = 0; n < 300; n++) {
       const unsocket = n % 2 === 0 ? 'destroy' : 'pay';
@@ -707,29 +695,24 @@ describe('the draft: sockets and runes through setChains', () => {
       const remove = n % 4 < 2;
       const start = { ...ready(), links: 999, scrap: 99999, manaDust: 9999, runes: pouch };
       let step = start;
-      let chain = primaryOf(start);
-      let origins: (number | null)[] = chain.moves.map((_, i) => i);
       for (let k = 0; k < 8; k++) {
-        const { next, map } = randomEdit(chain, remove);
-        const opts = { origins: { primary: map }, unsocket };
-        const res = setChains(registry, step, { primary: next }, opts);
+        const { next } = randomEdit(primaryOf(step), remove);
+        const res = setChains(registry, step, { primary: next }, { unsocket });
         expect(res.ok).toBe(true);
         step = res.profile;
-        chain = next;
-        origins = map.map((o) => (o === null ? null : origins[o]));
       }
-      const opts = { origins: { primary: origins }, unsocket };
-      const batch = setChains(registry, start, { primary: chain }, opts);
+      // The batch: the saved chain as the steps left it (a construct the steps minted is new to `start`).
+      const batch = setChains(registry, start, { primary: primaryOf(step) }, { unsocket });
       expect(batch.ok).toBe(true);
       if (remove) expect(batch.profile.links).toBeGreaterThanOrEqual(step.links);
       else expect(batch.profile.links).toBe(step.links);
-      expect(primaryOf(batch.profile)).toEqual(primaryOf(step));
+      expect(bareUids(primaryOf(batch.profile))).toEqual(bareUids(primaryOf(step)));
     }
   });
 });
 
 describe('opening a socket, socketing a rune, fusing', () => {
-  it("opens a move's next socket for Links and scrap by its index, up to the rarity's cap", () => {
+  it("opens a move's next socket for Links and scrap by its index, up to MAX_SOCKETS on any weapon", () => {
     const p = ready();
     const one = openSocket(registry, p, 'primary', 2);
     expect(one.ok).toBe(true);
```

`packages/engine/tests/delve-runes.test.ts`, continued (the next hunks of the same diff):

```diff
@@ -746,17 +729,16 @@ describe('opening a socket, socketing a rune, fusing', () => {
     expect(openSocket(registry, { ...p, links: 0 }, 'primary', 2).reason).toBe('Not enough Links');
     expect(openSocket(registry, { ...p, scrap: 0 }, 'primary', 2).reason).toBe('Not enough scrap');
     expect(openSocket(registry, p, 'primary', 3).reason).toBe('Pick a move the chain holds');
-    // An uncommon weapon: one socket a move, and no Defensive.
+    // An uncommon weapon: three sockets a move too, and no Ultimate slot.
     const fresh = {
       ...armed(registry, createDelveProfile(registry, 3, { primary: 'fire' })),
       links: 9,
       scrap: 999,
     };
-    const opened = openSocket(registry, fresh, 'primary', 0).profile;
+    let opened = fresh;
+    for (let i = 0; i < 3; i++) opened = openSocket(registry, opened, 'primary', 0).profile;
     expect(openSocket(registry, opened, 'primary', 0).reason).toBe('This move has every socket');
-    expect(openSocket(registry, fresh, 'defensive', 0).reason).toBe(
-      'Carried by rare weapons and better',
-    );
+    expect(openSocket(registry, fresh, 'ultimate', 0).reason).toBe(OPEN_SKILL_TEXT);
     expect(openSocket(registry, unequipSlot(registry, fresh, 'weapon'), 'primary', 0).reason).toBe(
       'Equip a weapon to build your moves',
     );
@@ -769,11 +751,11 @@ describe('opening a socket, socketing a rune, fusing', () => {
     expect(primaryOf(res.profile).moves[0].runes).toEqual([SPLIT_I, CHAIN_I]);
     expect(res.profile).toMatchObject({ links: 10, scrap: 500, manaDust: 100 });
     expect(res.profile.runes.chain).toEqual([0, 0, 0, 0, 0]);
-    expect(socketRune(registry, p, 'primary', 1, 0, ECHO_I)).toMatchObject({
+    expect(socketRune(registry, p, 'primary', 1, 0, ECHO_I, { unsocket: 'destroy' })).toMatchObject({
       ok: true,
       destroyed: [QUICK_II],
     });
-    const paid = socketRune(registry, p, 'primary', 1, 0, ECHO_I, { unsocket: 'pay' });
+    const paid = socketRune(registry, p, 'primary', 1, 0, ECHO_I);
     expect(paid).toMatchObject({ ok: true, runes: [QUICK_II], destroyed: [] });
     expect(paid.profile.scrap).toBe(470);
     expect(socketRune(registry, p, 'primary', 2, 0, CHAIN_I).reason).toBe('Open this socket first');
@@ -832,9 +814,6 @@ describe('opening a socket, socketing a rune, fusing', () => {
         forge,
       );
       const bag = { ...q, bag: ['a', 'b', 'c'].map((uid) => socketedSword(uid)) };
-      expect(transferMoveset(registry, bag, 'a').reason).toBe(
-        'Transfer your moveset between dives',
-      );
       expect(salvageItems(registry, bag, ['a'])).toMatchObject({ count: 0, destroyed: [] });
     }
     // The choice of mana stays open (a migrated save may be diving).
@@ -939,7 +918,10 @@ describe('rune drops in the world', () => {
       split: [1, 0, 0, 0, 0],
     });
     expect(paid.profile.runes).toEqual({});
-    expect(addLootToBag(registry, auto, [socketedSword()]).profile.dive!.haul.runes).toEqual({});
+    expect(
+      addLootToBag(registry, auto, [socketedSword()], { unsocket: 'destroy' }).profile.dive!.haul
+        .runes,
+    ).toEqual({});
     w.pending.items = [socketedSword()];
     expect(bankWorld(registry, auto, w, { unsocket: 'pay' }).profile.runes).toEqual({});
     w.pending.items = [socketedSword()];
@@ -1052,7 +1034,7 @@ describe("the stop's fifth kind: socket a rune", () => {
 });
 
 describe('sockets on weapon drops', () => {
-  it("opens the rarity's sockets, empty, over the moves it carries, never past a move's cap", () => {
+  it("opens the rarity's sockets over its constructs, never past MAX_SOCKETS; at most one holds a rune (runeChance)", () => {
     expect(R.socketDrops).toEqual({
       common: [0, 0],
       uncommon: [0, 0],
@@ -1066,10 +1048,8 @@ describe('sockets on weapon drops', () => {
       for (let seed = 1; seed <= 80; seed++) {
         const m = weapon(rarity, seed).moveset!;
         seen.add(openSockets(m));
-        for (const x of allMoves(m)) {
-          expect(socketsOf(x).length).toBeLessThanOrEqual(R.socketCap[rarity]);
-          expect(socketsOf(x).every((r) => r === null)).toBe(true);
-        }
+        for (const x of allMoves(m)) expect(socketsOf(x).length).toBeLessThanOrEqual(MAX_SOCKETS);
+        expect(allMoves(m).flatMap(socketsOf).filter((r) => r !== null).length).toBeLessThanOrEqual(1);
       }
       expect(Math.min(...seen)).toBe(R.socketDrops[rarity][0]);
       expect(Math.max(...seen)).toBe(R.socketDrops[rarity][1]);
@@ -1092,5 +1072,18 @@ describe('sockets on weapon drops', () => {
       const w = weapon('legendary', seed);
       expect(bare(w.moveset!)).toEqual(defaultMoveset(registry, w, 'storm', w.moveset!.slots));
     }
+    // The socketed rune draws on its own fork: with none, the sockets are as rolled.
+    const w = weapon('legendary', 3);
+    const bal2 = registry.getDelveBalance();
+    const was = bal2.runes.runeChance.legendary;
+    bal2.runes.runeChance.legendary = 0;
+    try {
+      const plain = weapon('legendary', 3);
+      expect(allMoves(plain.moveset!).map((x) => socketsOf(x).length)).toEqual(
+        allMoves(w.moveset!).map((x) => socketsOf(x).length),
+      );
+    } finally {
+      bal2.runes.runeChance.legendary = was;
+    }
   });
 });

```

Apply to `packages/engine/tests/delve-salvage-yield.test.ts`:

```diff
@@ -53,7 +53,7 @@ const legendary = generateItem(
   new SeededRNG(2),
 );
 
-/** An epic Fire sword as forged (two extra slots, one socket), Split I in its socket. */
+/** An epic Fire sword as forged (two free extra slots), a socket opened on its first Primary move, Split I in it. */
 function sword(): GearItem {
   const w = generateItem(
     registry,
@@ -82,6 +82,7 @@ describe('salvageYield', () => {
       pattern: 'gauntlets',
       essence: null,
       runes: [],
+      constructs: [],
     });
     const tierAt = (roll: number) =>
       salvageYield(registry, hero(), gloves({ affixes: [line('armor', roll)] })).shards[0].tier;
@@ -120,18 +121,21 @@ describe('salvageYield', () => {
       shards: [],
       extraShard: 0,
       essence: 'nightstalker',
+      constructs: [],
     });
   });
 
-  it("lists a weapon's runes, and a Link for each slot and socket past its rarity's forged extras", () => {
+  it("lists a weapon's runes, and a Link for each bought slot: a forged weapon's free extras and its sockets give none", () => {
     expect(salvageYield(registry, hero(), sword())).toMatchObject({
       links: 0,
       runes: [{ id: 'split', tier: 1 }],
       pattern: null,
+      constructs: [],
     });
     const w = sword();
     const m = w.moveset!;
     m.slots.primary! += 1;
+    m.bought = { primary: 1, basic: 2 };
     m.chains.primary!.moves.push({ ...m.chains.primary!.moves[0], runes: [null, null] });
     expect(salvageYield(registry, hero(), w).links).toBe(3);
   });
@@ -224,11 +228,11 @@ describe('applySalvage', () => {
     expect(res.profile.patterns).toContain('gauntlets');
   });
 
-  it("sends a weapon's runes by the parts rule, in the mode given", () => {
-    const gone = applySalvage(registry, hero(), sword(), new SeededRNG(1));
+  it("sends a weapon's runes by the parts rule, in the mode given ('pay' as shipped)", () => {
+    const gone = applySalvage(registry, hero(), sword(), new SeededRNG(1), { unsocket: 'destroy' });
     expect(gone).toMatchObject({ runes: [], destroyed: [{ id: 'split', tier: 1 }] });
     expect(gone.profile.runes).toEqual({});
-    const paid = applySalvage(registry, hero(), sword(), new SeededRNG(1), { unsocket: 'pay' });
+    const paid = applySalvage(registry, hero(), sword(), new SeededRNG(1));
     expect(paid).toMatchObject({ runes: [{ id: 'split', tier: 1 }], destroyed: [] });
     expect(paid.profile.runes).toEqual({ split: [1, 0, 0, 0, 0] });
     expect(paid.profile.links).toBe(hero().links + paid.links);

```

Apply to `packages/engine/tests/delve-stops.test.ts`:

```diff
@@ -2,7 +2,7 @@ import { describe, it, expect } from 'vitest';
 import { hitMonster, makeCtx } from '../src/arpg/combat.js';
 import { takeBestStop } from '../src/delve/autopilot.js';
 import { beginFloor, chooseDoor, completeFloor, startDive } from '../src/delve/dive.js';
-import { addSlot } from '../src/delve/moveset.js';
+import { OPEN_SKILL_TEXT, addSlot } from '../src/delve/moveset.js';
 import {
   createDelveProfile,
   equipItem,
@@ -110,14 +110,14 @@ describe('the stop after a cleared depth', () => {
     });
     const broke = { ...p, links: 0, scrap: 0 };
     expect(stopKinds(registry, broke)).not.toContain('slot');
-    expect(stopKinds(registry, banking(1, 20, broke))).toContain('slot');
-    // The slot's Link and 20 scrap: the banked Link and 15 scrap, then 5 of the stockpile's.
-    const res = takeStop(registry, banking(1, 15, { ...p, links: 2, scrap: 100 }), {
+    expect(stopKinds(registry, banking(2, 40, broke))).toContain('slot');
+    // The 3rd Primary slot's 2 Links and 40 scrap: the banked 2 Links and 15 scrap, then 25 of the stockpile's.
+    const res = takeStop(registry, banking(2, 15, { ...p, links: 2, scrap: 100 }), {
       kind: 'slot',
       skill: 'primary',
     });
     expect(res.ok).toBe(true);
-    expect(res.profile).toMatchObject({ links: 2, scrap: 95 });
+    expect(res.profile).toMatchObject({ links: 2, scrap: 75 });
     expect(res.profile.dive!.banked).toMatchObject({ links: 0, scrap: 0 });
     expect(res.profile.dive!.stop!.taken).toBe(true);
   });
@@ -169,8 +169,9 @@ describe('takeStop', () => {
   it('adds a slot, adjusts one move, or upgrades an item, each at its normal price', () => {
     const p = { ...atStop(hero(), ALL), links: 5, scrap: 1000, manaDust: 50 };
     const slot = takeStop(registry, p, { kind: 'slot', skill: 'primary' });
-    expect(slot.profile).toMatchObject({ links: 4, scrap: 980 });
-    expect(slot.profile.equipped.weapon!.moveset!.slots.primary).toBe(2);
+    expect(slot.profile).toMatchObject({ links: 3, scrap: 960 });
+    expect(slot.profile.equipped.weapon!.moveset!.slots.primary).toBe(3);
+    expect(slot.profile.equipped.weapon!.moveset!.bought).toEqual({ primary: 1 });
     const bolt = chainsOf(p).primary!.moves[0];
     const move = takeStop(registry, p, {
       kind: 'move',
@@ -243,11 +244,11 @@ describe('takeStop', () => {
       expect(at(0, bad as never)).toBe('Change the move');
     const nothing = takeStop(registry, moved, {
       kind: 'move',
-      skill: 'defensive',
+      skill: 'ultimate',
       index: 0,
-      move: { kind: 'medium', form: 'ward', elements: ['fire'] },
+      move: { kind: 'medium', form: 'nova', elements: ['fire'] },
     });
-    expect(nothing.reason).toBe('Carried by rare weapons and better');
+    expect(nothing.reason).toBe(OPEN_SKILL_TEXT);
     expect(takeStop(registry, moved, { kind: 'equip', uid: 'nope' }).reason).toBe(
       'Item not in bag: nope',
     );
@@ -379,13 +380,13 @@ describe('the autopilot at a stop', () => {
 
   it('else adds an affordable slot, the Primary first; else skips', () => {
     const p = { ...atStop(hero(), stopOf('slot', 'move')), links: 5, scrap: 1000 };
-    expect(takeBestStop(registry, p).equipped.weapon!.moveset!.slots.primary).toBe(2);
+    expect(takeBestStop(registry, p).equipped.weapon!.moveset!.slots.primary).toBe(3);
     const both = { ...atStop(hero(), stopOf('slot', 'upgrade')), links: 5, scrap: 1000 };
     const upgraded = takeBestStop(registry, both); // an upgrade before a slot
     const { weapon, chest } = upgraded.equipped;
     expect(weapon!.upgrade + chest!.upgrade).toBe(1);
     expect(upgraded).toMatchObject({ links: 5 });
-    expect(weapon!.moveset!.slots.primary).toBe(1);
+    expect(weapon!.moveset!.slots.primary).toBe(2);
     const broke = { ...atStop(hero(), stopOf('move', 'upgrade')), scrap: 0 };
     expect(takeBestStop(registry, broke)).toBe(broke);
   });

```

Apply to `packages/engine/tests/delve-tutorial-balance.test.ts`:

```diff
@@ -1,39 +1,52 @@
 import { describe, it, expect } from 'vitest';
 import { createDefaultRegistry } from '../src/data/default-registry.js';
-import { CraftingBalanceSchema, DropsBalanceSchema } from '../src/data/schemas.js';
+import { BalanceConfigSchema, DropsBalanceSchema } from '../src/data/schemas.js';
+import balanceData from '../src/data/balance.json';
 import { GearItemSchema } from '../src/delve/profile-schema.js';
 import { createDelveProfile } from '../src/delve/profile.js';
 
-// See the tutorial spec: Awaken's price, `drops.essenceMinDepth` and `GearItem.awakened`.
+// See the tutorial spec and the constructs spec §3.2: Open a skill's prices (Awaken's heir),
+// `drops.essenceMinDepth`, and a save without the retired `awakened`.
 
 const registry = createDefaultRegistry();
 const bal = registry.getDelveBalance();
 
 describe('the tutorial stage balance', () => {
-  it("holds Awaken's price and the essence floor (depth 20)", () => {
-    expect(bal.crafting.awaken).toEqual({ epicFlux: 1, links: 2, scrap: 120 });
+  it("holds Open a skill's prices (the rare's at Awaken's old Links and scrap) and the essence floor (depth 20)", () => {
+    expect(bal.movesets.openSkill.rare).toEqual({ flux: { rare: 1 }, links: 2, scrap: 120 });
+    expect(bal.crafting).not.toHaveProperty('awaken');
     expect(bal.drops.essenceMinDepth).toBe(20);
   });
 
-  it('refuses a negative price and an essence floor under 1', () => {
-    const awaken = (a: object) =>
-      CraftingBalanceSchema.safeParse({ ...bal.crafting, awaken: { ...bal.crafting.awaken, ...a } })
-        .success;
-    expect(awaken({})).toBe(true);
-    expect(awaken({ links: -1 })).toBe(false);
-    expect(awaken({ epicFlux: 0.5 })).toBe(false);
+  it('refuses a negative price, a fractional or common flux, and an essence floor under 1', () => {
+    const open = (patch: object) =>
+      BalanceConfigSchema.safeParse({
+        ...balanceData,
+        delve: {
+          ...balanceData.delve,
+          movesets: {
+            ...balanceData.delve.movesets,
+            openSkill: {
+              ...balanceData.delve.movesets.openSkill,
+              rare: { ...balanceData.delve.movesets.openSkill.rare, ...patch },
+            },
+          },
+        },
+      }).success;
+    expect(open({})).toBe(true);
+    expect(open({ links: -1 })).toBe(false);
+    expect(open({ flux: { rare: 0.5 } })).toBe(false);
+    expect(open({ flux: { common: 1 } })).toBe(false);
     const floor = (d: number) =>
       DropsBalanceSchema.safeParse({ ...bal.drops, essenceMinDepth: d }).success;
     expect([floor(1), floor(0), floor(2.5)]).toEqual([true, false, false]);
   });
 });
 
-describe('GearItem.awakened', () => {
-  it('round-trips on a saved item, and an item without it stays without', () => {
+describe('GearItem.awakened is gone', () => {
+  it('a saved item carries no such flag, and one in an old save is dropped at load', () => {
     const sword = createDelveProfile(registry, 3).equipped.weapon!;
-    expect(sword.awakened).toBeUndefined();
-    expect(GearItemSchema.parse(sword)).not.toHaveProperty('awakened');
-    expect(GearItemSchema.parse({ ...sword, awakened: true }).awakened).toBe(true);
-    expect(GearItemSchema.safeParse({ ...sword, awakened: 'yes' }).success).toBe(false);
+    expect(sword).not.toHaveProperty('awakened');
+    expect(GearItemSchema.parse({ ...sword, awakened: true })).not.toHaveProperty('awakened');
   });
 });

```

Delete `packages/engine/tests/delve-tutorial-carries.test.ts` (its tests are rewritten in the file that replaces it).

Apply to `packages/engine/tests/delve-tutorial-contract.test.ts`:

```diff
@@ -3,9 +3,9 @@ import * as engine from '../src/index.js';
 import { createDefaultRegistry } from '../src/data/default-registry.js';
 import { applyTutorialEvents, tutorialFloorOf } from '../src/delve/tutorial.js';
 import { tutorialTick } from '../src/arpg/tutorial.js';
-import { forge, hone, refine } from '../src/delve/crafting.js';
+import { forge, hone, openSkill, refine } from '../src/delve/crafting.js';
 import { beginFloor, startDive } from '../src/delve/dive.js';
-import { setChains, transferMoveset } from '../src/delve/moveset.js';
+import { setChains } from '../src/delve/moveset.js';
 import { bindSecondary } from '../src/delve/pair.js';
 import { createDelveProfile, equipItem, salvageItems } from '../src/delve/profile.js';
 import { applyQuestEvents, claimQuest } from '../src/delve/quests.js';
@@ -55,8 +55,8 @@ describe('the stubs', () => {
       'tutorialExitHeld',
       'worldTutorialEvents',
       'tutorialChest',
-      'awaken',
-      'awakenPrice',
+      'openSkill',
+      'openSkillPrice',
       'essenceAllowed',
       'doorShut',
       'tutorialDataProblems',
@@ -106,20 +106,16 @@ describe('the hooks are called', () => {
     expect(lastEvents()).toEqual([{ type: 'salvage', slot: 'chest' }]);
   });
 
-  it('the bind, an Apply, a transfer and a claim emit theirs', () => {
+  it('the bind, an Apply, Open a skill and a claim emit theirs', () => {
     const p = forged();
     bindSecondary(registry, p, 'frost');
     expect(lastEvents()).toEqual([{ type: 'bind' }]);
     const { chains } = movesetOf(registry, p.equipped.weapon!);
     expect(setChains(registry, p, { primary: chains.primary }).ok).toBe(true);
     expect(lastEvents()).toEqual([{ type: 'setChains' }]);
-    const blade = generateItem(
-      registry,
-      { uid: 'b1', ilvl: 1, rarity: 'uncommon', slot: 'weapon', baseId: 'sword', mana: 'fire' },
-      new SeededRNG(9),
-    );
-    expect(transferMoveset(registry, { ...p, bag: [...p.bag, blade] }, 'b1').ok).toBe(true);
-    expect(lastEvents()).toEqual([{ type: 'transfer' }]);
+    const sword = p.equipped.weapon!;
+    expect(openSkill(registry, { ...p, links: 1 }, sword.uid, 'defensive').ok).toBe(true);
+    expect(lastEvents()).toEqual([{ type: 'openSkill', skill: 'defensive' }]);
     const done = applyQuestEvents(registry, p, [{ type: 'reachDepth', depth: 2 }]);
     expect(claimQuest(registry, done, 'first_steps').ok).toBe(true);
     expect(lastEvents()).toEqual([{ type: 'claim', quest: 'first_steps' }]);

```

## Chunk 11: Task 4 — The switch: constructs with uids, the slot table, Open a skill, Move all's preview, runes on any weapon (continued)

Apply to `packages/engine/tests/delve-tutorial-floors-drops.test.ts`:

```diff
@@ -1,7 +1,7 @@
 import { describe, it, expect } from 'vitest';
 import { killMonster, makeCtx } from '../src/arpg/combat.js';
 import { stepWorld } from '../src/arpg/step.js';
-import { baseSlots } from '../src/loot/moveset.js';
+import { slotRange } from '../src/loot/moveset.js';
 import { runeFits } from '../src/loot/runes.js';
 import type { ArpgEvent, ArpgWorld } from '../src/types/arpg.js';
 import type { TutorialFloorDef } from '../src/types/tutorial-floor.js';
@@ -68,10 +68,14 @@ describe("a hand-built floor's set drops", () => {
       ilvl: 3,
     });
     const { chains, slots } = blade.item!.moveset!;
-    expect(slots).toEqual({ basic: baseSlots(registry, 'sword', 'basic'), primary: 2 });
+    expect(slots).toEqual({
+      basic: slotRange(registry, blade.item!, 'basic')[0],
+      primary: 2,
+      defensive: slotRange(registry, blade.item!, 'defensive')[0],
+    });
     expect(chains.primary!.moves.map((m) => [m.form, m.elements, m.runes])).toEqual([
-      ['bolt', ['fire'], undefined],
-      ['bolt', ['fire'], undefined],
+      ['strike', ['fire'], undefined],
+      ['strike', ['fire'], undefined],
     ]);
     expect([blade.roomId, w.loot.nextUid, w.loot.dropsGiven]).toEqual([1, 101, [1]]);
     const ore = w.drops.filter((d) => d.material?.kind === 'metal' && d.amount === 2);
@@ -104,7 +108,7 @@ describe("a hand-built floor's set drops", () => {
       const [charm] = set(w);
       return [charm.rune!.tier, runeFits(registry.getRune(charm.rune!.id), { form })];
     };
-    expect(fits(builtWorld(registry, 't-2'), 'bolt')).toEqual([2, true]);
+    expect(fits(builtWorld(registry, 't-2'), 'strike')).toEqual([2, true]);
     const strike = {
       kind: 'medium' as const,
       form: 'strike' as const,
@@ -119,7 +123,8 @@ describe("a hand-built floor's set drops", () => {
     const events = kill(w, 'grask');
     expect(set(w).map((d) => [d.item?.rarity, d.item?.mana])).toEqual([['rare', 'frost']]);
     const { chains } = set(w)[0].item!.moveset!;
-    expect([chains.primary!.moves[0].runes, chains.basic![0].runes]).toEqual([[null], [null]]);
+    // Two sockets, one a construct, the Primary's first: its first two moves (a rare's Primary starts at 3).
+    expect([chains.primary!.moves[0].runes, chains.primary!.moves[1].runes]).toEqual([[null], [null]]);
     expect(events.filter((e) => e.kind === 'drop' && e.dropKind === 'item').length).toBe(1);
   });
 

```

Apply to `packages/engine/tests/delve-tutorial-floors-play.test.ts`:

```diff
@@ -7,7 +7,7 @@ import { createFloorWorld } from '../src/arpg/world.js';
 import { createDefaultRegistry } from '../src/data/default-registry.js';
 import { forge, hone, refine } from '../src/delve/crafting.js';
 import { pairElements } from '../src/delve/hero-stats.js';
-import { addSlot, setChains, transferMoveset } from '../src/delve/moveset.js';
+import { addSlot, setChains } from '../src/delve/moveset.js';
 import { bindSecondary, profileStats } from '../src/delve/pair.js';
 import {
   createDelveProfile,
@@ -22,6 +22,7 @@ import type { Haul } from '../src/types/crafting.js';
 import type { DelveProfile } from '../src/types/delve.js';
 import type { GearItem } from '../src/types/gear.js';
 import { MANA_TYPES, type ManaType } from '../src/types/mana.js';
+import { withUids } from './fixtures/arena.js';
 
 // See the tutorial spec: the Anvil lessons paid from the starter kit and the set drops alone (the
 // eight hand-built floors' gear and rune as the engine drops them), and a starter hero (the bot)
@@ -85,7 +86,8 @@ const fresh = (primary: ManaType) => createDelveProfile(registry, 7, { primary }
 function armed(p: DelveProfile): DelveProfile {
   const blade: GearItem = gearOf(kill(world(p, 'd1-1'), 'rat3'))[0];
   const bag = [...p.bag, p.equipped.weapon!];
-  return { ...p, nextUid: p.nextUid + 1, equipped: { ...p.equipped, weapon: blade }, bag };
+  // A set drop's constructs have no uids until they bank: minted here as `addLootToBag` would.
+  return withUids({ ...p, nextUid: p.nextUid + 1, equipped: { ...p.equipped, weapon: blade }, bag });
 }
 
 /**
@@ -128,8 +130,9 @@ describe('the Anvil lessons', () => {
     let p = afterLesson1(primary);
     const crown = gearOf(kill(world(p, 'd2-5'), 'grask'))[0];
     expect([crown.rarity, crown.mana]).toEqual(['rare', primary]);
-    p = stockHaul({ ...p, bag: [...p.bag, crown], bestDepth: 5 }, setHaul(2));
-    p = ok(transferMoveset(registry, p, crown.uid));
+    p = withUids(stockHaul({ ...p, bag: [...p.bag, crown], bestDepth: 5 }, setHaul(2)));
+    // Move all is B2's op (D1 rewires the lesson): the rare is worn as it is.
+    p = equipItem(registry, p, crown.uid);
     ok(hone(registry, p, crown.uid, 0));
   });
 });
@@ -157,7 +160,7 @@ describe('the eight floors', () => {
     const seen: Record<string, ArpgEvent[]> = {};
     for (const f of data.floors) {
       if (f.depth === 1) [hp, flasks] = [1, potions];
-      // A new save's common sword carries the Basic alone (the spec's carries).
+      // A new save's common sword holds its Basic and two Primary constructs (the slot table).
       const p = f.id === 'd1-1' ? start : heroes[f.dive as 1 | 2];
       const w = world(p, f.id, hp, flasks, f.id !== 'd1-1');
       seen[f.id] = play(w);

```

Apply to `packages/engine/tests/delve-tutorial-review.test.ts`:

```diff
@@ -7,7 +7,7 @@ import { createDefaultRegistry } from '../src/data/default-registry.js';
 import { loadAndValidateData } from '../src/data/loader.js';
 import { DataRegistry } from '../src/data/registry.js';
 import { beginFloor, startDive } from '../src/delve/dive.js';
-import { addSlot, transferMoveset } from '../src/delve/moveset.js';
+import { addSlot } from '../src/delve/moveset.js';
 import { addLootToBag, createDelveProfile, equipItem } from '../src/delve/profile.js';
 import { startTutorial, tutorialSkippable, tutorialText } from '../src/delve/tutorial.js';
 import { rollEncounterDrops } from '../src/loot/drops.js';
@@ -34,8 +34,9 @@ describe('auto-salvage waits for the tutorial', () => {
       { uid: 'gB', ilvl: 1, rarity: 'uncommon', baseId: 'sword', mana: 'fire' },
       new SeededRNG(1),
     );
-    expect(addLootToBag(registry, startTutorial(registry, p), [blade]).kept).toEqual([blade]);
-    expect(addLootToBag(registry, p, [blade]).salvaged).toEqual([blade]);
+    // Banked, the blade's constructs take their uids: the item is the same but for those.
+    expect(addLootToBag(registry, startTutorial(registry, p), [blade]).kept.map((i) => i.uid)).toEqual(['gB']);
+    expect(addLootToBag(registry, p, [blade]).salvaged.map((i) => i.uid)).toEqual(['gB']);
   });
 });
 
@@ -89,10 +90,10 @@ const atStep = (step: string, p = fresh()): DelveProfile => ({
 });
 
 describe('impossible Anvil steps offer "Skip this step"', () => {
-  it('the Skills step with a weapon that carries no Primary, or none at all', () => {
+  it('the Skills step unarmed, but not with a sword whose Primary can grow to the lesson (the common one starts with two slots)', () => {
     const p = { ...atStep('l1-skills'), runes: { quick: [1, 0, 0, 0, 0] } };
     expect(p.equipped.weapon!.rarity).toBe('common');
-    expect(tutorialSkippable(registry, p, p.tutorial!)).toBe(true);
+    expect(tutorialSkippable(registry, p, p.tutorial!)).toBe(false);
     const unarmed = { ...p, equipped: { ...p.equipped, weapon: null } };
     expect(tutorialSkippable(registry, unarmed, p.tutorial!)).toBe(true);
     const armed = { ...p, equipped: { ...p.equipped, weapon: blade([['fire'], ['fire']]) } };
@@ -107,25 +108,24 @@ describe('impossible Anvil steps offer "Skip this step"', () => {
   });
 });
 
-describe('the Transfer step', () => {
-  const rare = () => {
+describe('the Move all step', () => {
+  const rare = (primary?: number) => {
     const item = generateItem(
       registry,
       { uid: 'gRare', ilvl: 5, rarity: 'rare', baseId: 'sword', mana: 'fire' },
       new SeededRNG(1),
     );
-    return { ...item, moveset: defaultMoveset(registry, item, 'fire') };
+    return { ...item, moveset: defaultMoveset(registry, item, 'fire', primary ? { primary } : {}) };
   };
-  it('a plain Equip of the rare leaves it current; a Transfer completes it', () => {
+  it('a plain Equip of the rare leaves it current; the rare worn holding more than its start completes it (B2 fills Move all; D1 rewires)', () => {
     const p = {
       ...atStep('l2-transfer'),
       equipped: { ...fresh().equipped, weapon: blade([['fire'], ['fire'], ['frost']]) },
       bag: [rare()],
     };
     expect(equipItem(registry, p, 'gRare').tutorial!.step).toBe('l2-transfer');
-    const moved = transferMoveset(registry, p, 'gRare');
-    expect(moved.ok).toBe(true);
-    expect(moved.profile.tutorial!.step).not.toBe('l2-transfer');
+    const moved = equipItem(registry, { ...p, bag: [rare(4)] }, 'gRare');
+    expect(moved.tutorial!.step).not.toBe('l2-transfer');
   });
 });
 

```

Apply to `packages/engine/tests/delve-tutorial-runner-rule.test.ts`:

```diff
@@ -140,7 +140,7 @@ const equipChest = lesson('equip', { slot: 'chest', rarity: 'uncommon' });
 const skills = lesson('setChains', { moves: 3 });
 const salvage = lesson('salvage', { slot: 'weapon', rarity: 'common' });
 const refine = lesson('refine', { metal: 'iron' });
-const transfer = lesson('transfer', { rarity: 'rare' });
+const moveAll = lesson('moveAll', { rarity: 'rare' });
 const hone = lesson('hone');
 
 describe('tutorialHolds', () => {
@@ -192,7 +192,7 @@ describe('tutorialHolds', () => {
     );
   });
 
-  it('salvage, refine, transfer and hone: the old sword gone, a bar made, a rare worn, a line honed', () => {
+  it('salvage, refine, Move all and hone: the old sword gone, a bar made, a rare worn with its constructs moved, a line honed', () => {
     const p = onStep('bind');
     const blade = weapon('uncommon');
     const swapped = equipItem(script, { ...p, bag: [blade] }, blade.uid);
@@ -205,15 +205,15 @@ describe('tutorialHolds', () => {
       materials: { ...p.materials, metals: { ...p.materials.metals, iron: 1 } },
     };
     expect(tutorialHolds(script, iron, refine)).toBe(true);
-    expect(tutorialHolds(script, swapped, transfer)).toBe(false);
-    // A rare worn with the moveset moved onto it: its Primary past its base slots.
+    expect(tutorialHolds(script, swapped, moveAll)).toBe(false);
+    // A rare worn with the constructs moved onto it: its Primary past its start (3).
     const rare = (primary: number) => {
       const w = weapon('rare');
       const moveset = defaultMoveset(script, w, 'fire', { primary });
       return { ...p, equipped: { ...p.equipped, weapon: { ...w, moveset } } };
     };
-    expect(tutorialHolds(script, rare(1), transfer)).toBe(false);
-    expect(tutorialHolds(script, rare(2), transfer)).toBe(true);
+    expect(tutorialHolds(script, rare(3), moveAll)).toBe(false);
+    expect(tutorialHolds(script, rare(4), moveAll)).toBe(true);
     expect(tutorialHolds(script, p, hone)).toBe(false);
     expect(tutorialHolds(script, replaceItem(p, { ...p.equipped.chest!, hones: 1 }), hone)).toBe(
       true,

```

Apply to `packages/engine/tests/delve-tutorial-runner-script.test.ts`:

```diff
@@ -5,7 +5,7 @@ import { DataRegistry } from '../src/data/registry.js';
 import { tutorialDataProblems } from '../src/data/tutorial-check.js';
 import { forge, hone, refine } from '../src/delve/crafting.js';
 import { beginFloor, chooseDoor, completeFloor, startDive } from '../src/delve/dive.js';
-import { addSlot, setChains, transferMoveset } from '../src/delve/moveset.js';
+import { addSlot, setChains } from '../src/delve/moveset.js';
 import { bindSecondary } from '../src/delve/pair.js';
 import { createDelveProfile, equipItem, salvageItems } from '../src/delve/profile.js';
 import { applyQuestEvents, claimQuest, questStates } from '../src/delve/quests.js';
@@ -165,7 +165,7 @@ describe('the guided path', () => {
   });
 
   it('Anvil lesson 1, op by op: claim, forge, equip, bind, the Primary, salvage, refine, claim', () => {
-    const bolt = (elements: Move['elements']): Move => ({ kind: 'medium', form: 'bolt', elements });
+    const bolt = (elements: Move['elements']): Move => ({ kind: 'medium', form: 'strike', elements });
     let p = createDelveProfile(registry, 7, { primary: 'fire' });
     const old = p.equipped.weapon!;
     p = withChains(
@@ -225,11 +225,13 @@ describe('the guided path', () => {
     expect(tutorialBlocksDive(registry, p)).toBeNull();
   });
 
-  it('Anvil lesson 2: the compare beat, Transfer, hone, claim, the board, the Training Grounds, farewell', () => {
-    // The blade as dive 1 drops it: its Primary at two slots, which the Transfer carries over.
+  it('Anvil lesson 2: the compare beat, Move all, hone, claim, the board, the Training Grounds, farewell', () => {
+    // The blade as dive 1 drops it: its Primary at two slots. Move all is B2's op (D1 rewires the
+    // bot): here the rare arrives holding four Primary constructs, which is what the step reads.
     const b1 = sword('uncommon', 'b1');
     const blade = { ...b1, moveset: defaultMoveset(registry, b1, 'fire', { primary: 2 }) };
-    const rare = sword('rare', 'r1');
+    const r1 = sword('rare', 'r1');
+    const rare = { ...r1, moveset: defaultMoveset(registry, r1, 'fire', { primary: 4 }) };
     let p = createDelveProfile(registry, 7, { primary: 'fire' });
     p = {
       ...p,
@@ -240,7 +242,7 @@ describe('the guided path', () => {
     };
     p = applyTutorialEvents(registry, p, [{ type: 'ack' }]);
     expect(p.tutorial).toEqual(st('l2-transfer'));
-    p = transferMoveset(registry, p, 'r1').profile;
+    p = equipItem(registry, p, 'r1');
     expect(p.tutorial).toEqual(st('l2-hone'));
     p = claimAll(hone(registry, p, 'r1', 0).profile);
     expect(p.tutorial).toEqual(st('l2-board'));

```

Create `packages/engine/tests/delve-tutorial-slots.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { generateItem } from '../src/loot/item-generator.js';
import { UNARMED, defaultMoveset, moveAllPreview, slotRange } from '../src/loot/moveset.js';
import { OPEN_SKILL_TEXT } from '../src/delve/moveset.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { CHAIN_SKILLS } from '../src/types/ability.js';
import { RARITY_ORDER, type Rarity } from '../src/types/gear.js';

// See the constructs spec §3.2: the slot table replaces carries by rarity; a weapon holds the
// skills its rarity starts with, and Open a skill gives a skill at 0 its first slot.

const registry = createDefaultRegistry();
const slots = registry.getDelveBalance().movesets.slots;
const sword = (rarity: Rarity, uid = `w-${rarity}`) =>
  generateItem(
    registry,
    { uid, ilvl: 5, rarity, slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(7).fork(uid),
  );

describe('the slot table', () => {
  it('starts each rarity at its row: a common with the Basic and a Primary, every skill from rare', () => {
    const skills = (r: Rarity) =>
      Object.keys(defaultMoveset(registry, { baseId: 'sword', rarity: r }, 'fire').chains);
    expect(skills('common')).toEqual(['basic', 'primary']);
    expect(skills('uncommon')).toEqual(['basic', 'primary', 'defensive']);
    expect(skills('magic')).toEqual(['basic', 'primary', 'defensive']);
    expect(skills('rare')).toEqual(['basic', 'primary', 'defensive', 'ultimate']);
    expect(skills('epic')).toEqual(['basic', 'primary', 'defensive', 'ultimate']);
    expect(skills('legendary')).toEqual(['basic', 'primary', 'defensive', 'ultimate']);
    for (const r of RARITY_ORDER)
      for (const s of CHAIN_SKILLS) {
        const [start, ceiling] = slotRange(registry, sword(r), s);
        if (s === 'basic') expect([start, ceiling]).toEqual([3, Math.max(3, slots[r].basic[1])]);
        else expect([start, ceiling]).toEqual(slots[r][s]);
      }
  });

  it('unarmed (UNARMED) holds the basic chain alone, every other skill at [0, 0]', () => {
    expect(Object.keys(defaultMoveset(registry, UNARMED, 'fire').chains)).toEqual(['basic']);
    for (const s of ['primary', 'defensive', 'ultimate'] as const)
      expect(slotRange(registry, UNARMED, s)).toEqual([0, 0]);
  });

  it('a skill with no slot says where it opens', () => {
    expect(OPEN_SKILL_TEXT).toBe('Open this skill on the Temper bench');
  });

  it("Move all onto a weapon without a skill's slots sends that chain's constructs to the bag", () => {
    const epic = sword('epic');
    const common = sword('common', 'c2');
    const onto = moveAllPreview(registry, epic, common);
    expect(Object.keys(onto.moveset.chains)).toEqual(['basic', 'primary']);
    const ultimates = onto.toBag.filter(
      (c) => 'form' in c && registry.getForm(c.form).slot === 'ultimate',
    );
    expect(ultimates.length).toBe(epic.moveset!.chains.ultimate!.moves.length);
  });
});

```

Apply to `packages/engine/tests/fixtures/arena.ts`:

```diff
@@ -2,7 +2,7 @@ import { createDefaultRegistry } from '../../src/data/default-registry.js';
 import { SeededRNG } from '../../src/rng/seeded-rng.js';
 import { createFloorWorld, createMonsterEntity } from '../../src/arpg/world.js';
 import { stepWorld } from '../../src/arpg/step.js';
-import { withMoveset } from '../../src/delve/profile.js';
+import { mintMoveset, withMoveset } from '../../src/delve/profile.js';
 import { computeHeroStats, type HeroStatsExtra } from '../../src/delve/hero-stats.js';
 import { generateItem } from '../../src/loot/item-generator.js';
 import { heroChains, movesetOf } from '../../src/loot/moveset.js';
@@ -50,11 +50,13 @@ export function chainsOf(p: DelveProfile): Partial<Chains> {
 
 /**
  * `p` with its weapon holding `chains`, each skill given at least as many slots
- * as moves (a test's shortcut: no price, and any skill, carried or not).
+ * as moves (a test's shortcut: no price, and any skill, with slots or not), and
+ * every construct without a uid minted one (the constructs spec §3.1); those with
+ * one keep it.
  */
 export function withChains(p: DelveProfile, chains: Partial<Chains>): DelveProfile {
   const moveset = movesetOf(registry, p.equipped.weapon!);
-  const next = { chains: { ...moveset.chains }, slots: { ...moveset.slots } };
+  const next = { chains: { ...moveset.chains }, slots: { ...moveset.slots }, bought: { ...moveset.bought } };
   for (const skill of CHAIN_SKILLS) {
     const chain = chains[skill];
     if (!chain) continue;
@@ -62,7 +64,22 @@ export function withChains(p: DelveProfile, chains: Partial<Chains>): DelveProfi
     (next.chains as Record<string, unknown>)[skill] = chain;
     next.slots[skill] = Math.max(next.slots[skill] ?? 0, length);
   }
-  return withMoveset(p, next);
+  const [minted, q] = mintMoveset(p, next);
+  return withMoveset(q, minted);
+}
+
+/** `p` with every construct of its worn and bag weapons minted a uid where it lacks one. */
+export function withUids(p: DelveProfile): DelveProfile {
+  let q = p;
+  const mint = (w: EquippedGear['weapon']) => {
+    if (!w) return w;
+    const [moveset, next] = mintMoveset(q, movesetOf(registry, w));
+    q = next;
+    return { ...w, moveset };
+  };
+  const weapon = mint(p.equipped.weapon);
+  const bag = p.bag.map((i) => (i.slot === 'weapon' ? mint(i)! : i));
+  return { ...q, equipped: { ...p.equipped, ...(weapon && { weapon }) }, bag };
 }
 
 /** A slot's chain in a test: its one move with these parts changed and its payment, or whole `moves`. */

```

Apply to `packages/engine/tests/fixtures/carries.ts`:

```diff
@@ -1,12 +1,12 @@
 import type { DataRegistry } from '../../src/data/registry.js';
 import { defaultMoveset } from '../../src/loot/moveset.js';
+import { mintMoveset } from '../../src/delve/profile.js';
 import type { DelveProfile } from '../../src/types/delve.js';
 import type { GearItem, Rarity } from '../../src/types/gear.js';
 
 /**
- * A new save's common sword carries the basic chain alone (see the tutorial
- * spec's carries): a test of the Primary arms the hero first, as its first
- * forge would.
+ * A test's weapon of another rarity: its slot table's defaults (the constructs
+ * spec §3.2), its constructs minted uids when it goes on a profile (`armed`).
  */
 
 /** Weapon `w` made `rarity` (uncommon by default), holding that rarity's base moveset in its mana. */
@@ -25,5 +25,6 @@ export function armed(
   rarity: Rarity = 'uncommon',
 ): DelveProfile {
   const weapon = armedWeapon(registry, p.equipped.weapon!, rarity);
-  return { ...p, equipped: { ...p.equipped, weapon } };
+  const [moveset, q] = mintMoveset(p, weapon.moveset!);
+  return { ...q, equipped: { ...p.equipped, weapon: { ...weapon, moveset } } };
 }

```

- [ ] **Step 2: Run them: red**

```bash
cd /c/Projects/alloy-constructs-a
(cd packages/engine && npx vitest run tests/delve-constructs-a-switch.test.ts tests/delve-movesets.test.ts tests/delve-open-skill-op.test.ts --reporter=dot)
```

Expected: red: the three files fail to collect (`openSkill`, `moveAllPreview`, `draftRefusal`, `mintMoveset`, `withUids` don't exist; `Moveset` has no `bought`).

- [ ] **Step 3: The edits** (34 files, in this order)

Apply to `packages/engine/src/arpg/abilities/resolve.ts`:

```diff
@@ -16,7 +16,7 @@ import {
 } from '../../types/ability.js';
 import type { ManaType } from '../../types/mana.js';
 import type { CastStyle, FormDef } from '../../types/arpg.js';
-import { DEFAULT_FORMS, weaponString } from '../../loot/moveset.js';
+import { defaultForm, weaponClass, weaponString } from '../../loot/moveset.js';
 import { extraShotPower, loadEase, runeFits, runeKnobs, runeLoad } from '../../loot/runes.js';
 import type { RuneRef } from '../../types/rune.js';
 import type {
@@ -54,6 +54,7 @@ export const NEUTRAL: Knobs = Object.freeze({
   critBonus: 0,
   cleave: 0,
   homing: 0,
+  stepBonus: 0,
 });
 
 /**
@@ -111,6 +112,7 @@ export function mergeKnobs(...parts: KnobsData[]): Knobs {
     k.critBonus += p.critBonus ?? 0;
     k.cleave += p.cleave ?? 0;
     k.homing += p.homing ?? 0;
+    k.stepBonus += p.stepBonus ?? 0;
   }
   return k;
 }
@@ -503,17 +505,19 @@ export function followBasic(
 }
 
 /**
- * A new (or reset) hero's chains, all of `element`: each slot's default form's
- * whole default chain with its payment (`DEFAULT_FORMS`: a Bolt, a Ward and a
- * charged Nova), and the weapon's default basic chain.
+ * A new (or reset) hero's chains, all of `element`: each slot's class default
+ * form's whole default chain with its payment (`defaultForm`: a Strike on a
+ * melee weapon or a Bolt, a Ward and a charged Nova), and the weapon's default
+ * basic chain.
  */
 export function defaultChains(
   registry: DataRegistry,
   element: ManaType,
   weaponBaseId: string | null,
 ): Chains {
+  const cls = weaponClass(registry, weaponBaseId);
   const chain = (slot: AbilitySlot): Chain => {
-    const { form, payment } = DEFAULT_FORMS[slot];
+    const { form, payment } = defaultForm(registry, slot, cls);
     const moves = registry.getForm(form).defaultChain.map((kind) => ({
       kind,
       form,

```

Apply to `packages/engine/src/arpg/tutorial-floor.ts`:

```diff
@@ -1,14 +1,14 @@
 import type { DataRegistry } from '../data/registry.js';
 import { onRoomWall } from '../data/tutorial-floor-schema.js';
 import { generateItem } from '../loot/item-generator.js';
-import { DEFAULT_FORMS, defaultMoveset } from '../loot/moveset.js';
-import { runeFits, socketCap, socketsOf } from '../loot/runes.js';
+import { defaultForm, defaultMoveset, weaponClass } from '../loot/moveset.js';
+import { runeFits, socketsOf } from '../loot/runes.js';
 import { SeededRNG } from '../rng/seeded-rng.js';
 import type { Blow, ChainSkill, Move } from '../types/ability.js';
 import type { ArpgWorld, Drop, MonsterEntity, Vec } from '../types/arpg.js';
 import type { Door, FloorMap, Interactable, Room } from '../types/floor-map.js';
 import type { GearItem } from '../types/gear.js';
-import type { RuneTier } from '../types/rune.js';
+import { MAX_SOCKETS, type RuneTier } from '../types/rune.js';
 import {
   TUTORIAL_INTERACTABLES,
   type TutorialDrop,
@@ -145,7 +145,7 @@ function setGear(
     return !chain ? [] : Array.isArray(chain) ? chain : chain.moves;
   });
   let open = g.sockets ?? 0;
-  for (let round = 0; round < socketCap(registry, item.rarity); round++)
+  for (let round = 0; round < MAX_SOCKETS; round++)
     for (const m of moves)
       if (open > 0) {
         m.runes = [...socketsOf(m), null];
@@ -176,7 +176,9 @@ function setDrop(ctx: SimCtx, d: TutorialSetDrop, from: Vec, roomId: number | nu
   let what: Pick<Drop, 'kind' | 'amount' | 'item' | 'rune' | 'material'>;
   if (g.kind === 'gear') what = { kind: 'item', amount: 1, item: setGear(registry, world, g, rng) };
   else if (g.kind === 'rune') {
-    const form = world.hero.chains[0]?.moves[0]?.form.id ?? DEFAULT_FORMS.primary.form;
+    const form =
+      world.hero.chains[0]?.moves[0]?.form.id ??
+      defaultForm(registry, 'primary', weaponClass(registry, world.hero.stats.weapon.baseId)).form;
     const fits = registry.getRunes().filter((def) => runeFits(def, { form }));
     if (fits.length === 0) return;
     const id = fits[rng.nextInt(0, fits.length - 1)].id;

```

Apply to `packages/engine/src/data/balance.json`:

```diff
@@ -99,11 +99,6 @@
       "beatSlot": { "primary": 1, "defensive": 0.75, "ultimate": 1.5 }
     },
     "movesets": {
-      "carries": {
-        "common": ["basic"], "uncommon": ["basic", "primary"],
-        "magic": ["basic", "primary"], "rare": ["basic", "primary", "defensive"],
-        "epic": ["basic", "primary", "defensive", "ultimate"], "legendary": ["basic", "primary", "defensive", "ultimate"]
-      },
       "slots": {
         "common": { "basic": [0, 3], "primary": [2, 3], "defensive": [0, 1], "ultimate": [0, 0] },
         "uncommon": { "basic": [0, 3], "primary": [2, 3], "defensive": [1, 2], "ultimate": [0, 1] },
@@ -122,14 +117,13 @@
         "epic": { "flux": { "epic": 1 }, "links": 3, "scrap": 160 },
         "legendary": { "flux": { "epic": 1 }, "links": 3, "scrap": 200 }
       },
-      "editDust": 5, "elementDust": 15, "transferScrap": 30, "salvageDust": 0
+      "editDust": 5, "elementDust": 15, "salvageDust": 0
     },
     "runes": {
-      "socketCap": { "common": 1, "uncommon": 1, "magic": 2, "rare": 2, "epic": 3, "legendary": 3 },
       "runeChance": { "common": 0, "uncommon": 0, "magic": 0.05, "rare": 0.1, "epic": 0.2, "legendary": 0.35 },
       "socketLinks": [1, 2, 3], "socketScrap": [20, 40, 60],
       "socketDrops": { "common": [0, 0], "uncommon": [0, 0], "magic": [0, 1], "rare": [0, 1], "epic": [1, 2], "legendary": [2, 3] },
-      "unsocket": "destroy", "pullScrap": [15, 30, 50, 80, 120],
+      "unsocket": "pay", "pullScrap": [15, 30, 50, 80, 120],
       "fuseCount": 3, "fuseScrap": [20, 40, 80, 160],
       "dropChance": { "normal": 0.03, "elite": 0.15, "boss": 1 },
       "tierDepths": [1, 7, 13, 21, 31], "tierUp": 0.2,
@@ -166,8 +160,8 @@
       "forgeScrap": { "common": 10, "uncommon": 20, "magic": 40, "rare": 80, "epic": 160, "legendary": 240 },
       "offPairDust": 15,
       "weaponExtras": {
-        "common": { "slots": 0, "sockets": 0 }, "uncommon": { "slots": 0, "sockets": 0 }, "magic": { "slots": 0, "sockets": 0 },
-        "rare": { "slots": 1, "sockets": 0 }, "epic": { "slots": 2, "sockets": 1 }, "legendary": { "slots": 3, "sockets": 2 }
+        "common": { "slots": 0 }, "uncommon": { "slots": 0 }, "magic": { "slots": 0 },
+        "rare": { "slots": 1 }, "epic": { "slots": 2 }, "legendary": { "slots": 3 }
       },
       "honeScrap": 15, "honeGrowth": 1.5,
       "imprintScrap": { "common": 0, "uncommon": 10, "magic": 20, "rare": 40, "epic": 80, "legendary": 120 },
@@ -175,8 +169,7 @@
       "attuneRoll": { "perPoint": 0.03, "cap": 0.5 },
       "salvageShardTier": [0.3, 0.55, 0.75, 0.9], "salvageExtraShard": 0.25,
       "shardBench": { "scrap": 30, "dust": 5 },
-      "deathLoss": 0.4,
-      "awaken": { "epicFlux": 1, "links": 2, "scrap": 120 }
+      "deathLoss": 0.4
     },
     "drops": {
       "normal": {

```

Apply to `packages/engine/src/data/delve.json`:

```diff
@@ -18,6 +18,7 @@
       "class": "melee",
       "style": {
         "name": "Quick",
+        "text": "Casts gain 15% crit chance",
         "numbers": { "windup": 1, "cooldown": 1, "power": 1, "range": 1, "radius": 1, "speed": 1, "duration": 1 },
         "motion": "none",
         "trait": {},
@@ -58,6 +59,7 @@
       "class": "melee",
       "style": {
         "name": "Balanced",
+        "text": "Each chain step hits a little harder",
         "numbers": { "windup": 1, "cooldown": 1, "power": 1, "range": 1, "radius": 1, "speed": 1, "duration": 1 },
         "motion": "none",
         "trait": {},
@@ -93,6 +95,7 @@
       "class": "melee",
       "style": {
         "name": "Sweeping",
+        "text": "Single-target hits cleave a small arc behind the first foe",
         "numbers": { "windup": 1, "cooldown": 1, "power": 1, "range": 1, "radius": 1, "speed": 1, "duration": 1 },
         "motion": "none",
         "trait": {},
@@ -133,6 +136,7 @@
       "class": "melee",
       "style": {
         "name": "Heavy",
+        "text": "Heavy and hold moves stagger",
         "numbers": { "windup": 1, "cooldown": 1, "power": 1, "range": 1, "radius": 1, "speed": 1, "duration": 1 },
         "motion": "none",
         "trait": {},
@@ -168,6 +172,7 @@
       "class": "ranged",
       "style": {
         "name": "Channeled",
+        "text": "Impacts leave a brief small zone",
         "numbers": { "windup": 1, "cooldown": 1, "power": 1, "range": 1, "radius": 1, "speed": 1, "duration": 1 },
         "motion": "none",
         "trait": {},
@@ -209,6 +214,7 @@
       "class": "ranged",
       "style": {
         "name": "Seeking",
+        "text": "Shots home slightly",
         "numbers": { "windup": 1, "cooldown": 1, "power": 1, "range": 1, "radius": 1, "speed": 1, "duration": 1 },
         "motion": "none",
         "trait": {},
@@ -250,6 +256,7 @@
       "class": "ranged",
       "style": {
         "name": "Marksman",
+        "text": "Shots pierce one foe",
         "numbers": { "windup": 1, "cooldown": 1, "power": 1, "range": 1, "radius": 1, "speed": 1, "duration": 1 },
         "motion": "none",
         "trait": {},

```

Apply to `packages/engine/src/data/runes.json`:

```diff
@@ -1,4 +1,21 @@
 [
+  {
+    "id": "detonate",
+    "name": "Detonate",
+    "icon": "🧨",
+    "family": "shape",
+    "fits": { "forms": ["strike", "whirl", "volley", "lance", "onslaught"], "weapons": [] },
+    "tiers": [
+      { "detonate": 0.25, "power": 0.9 },
+      { "detonate": 0.3, "power": 0.9 },
+      { "detonate": 0.35, "power": 0.9 },
+      { "detonate": 0.4, "power": 0.9 },
+      { "detonate": 0.45, "power": 0.9 }
+    ],
+    "load": [0.3, 0.35, 0.4, 0.45, 0.5],
+    "effect": "Each foe hit sets off a blast of {detonate:%} power around it",
+    "tradeoff": "{power:±%} power"
+  },
   {
     "id": "split",
     "name": "Split",

```

Apply to `packages/engine/src/data/schemas.ts`:

```diff
@@ -196,6 +196,8 @@ export const DelveDataSchema = z.object({
         style: z
           .object({
             name: z.string().min(1),
+            // The trait as the player reads it ("Shots pierce one foe"): the item header's line.
+            text: z.string().min(1),
             numbers: z
               .object({
                 windup: z.number().positive(),
@@ -797,6 +799,7 @@ export const KnobsSchema = z
     critBonus: z.number().min(0).max(1),
     cleave: z.number().min(0),
     homing: z.number().min(0),
+    stepBonus: z.number().min(0),
   })
   .partial()
   .strict();
@@ -1092,9 +1095,7 @@ const StartDepthsSchema = z
 export const CraftingBalanceSchema = z.object({
   forgeScrap: perRarity(z.number().min(0)),
   offPairDust: z.number().int().min(0),
-  weaponExtras: perRarity(
-    z.object({ slots: z.number().int().min(0), sockets: z.number().int().min(0) }),
-  ),
+  weaponExtras: perRarity(z.object({ slots: z.number().int().min(0) })),
   honeScrap: z.number().min(0),
   honeGrowth: z.number().min(1),
   imprintScrap: perRarity(z.number().min(0)),
@@ -1115,11 +1116,6 @@ export const CraftingBalanceSchema = z.object({
   salvageExtraShard: z.number().min(0).max(1),
   shardBench: z.object({ scrap: z.number().min(0), dust: z.number().min(0) }),
   deathLoss: z.number().min(0).max(1),
-  awaken: z.object({
-    epicFlux: z.number().int().min(0),
-    links: z.number().int().min(0),
-    scrap: z.number().min(0),
-  }),
 });
 
 /** `balance.json → delve.drops` (see the crafting spec). */
@@ -1420,22 +1416,6 @@ const DelveBalanceSchema = z.object({
     .refine((c) => c.holdStages[0] < c.holdStages[1], 'holdStages must rise')
     .refine((c) => c.holdMax >= c.holdTime, 'holdMax must be at least holdTime'),
   movesets: z.object({
-    // Every weapon swings a basic chain; each skill once.
-    carries: perRarity(
-      z
-        .array(z.enum(['basic', 'primary', 'defensive', 'ultimate']))
-        .refine((s) => s.includes('basic'), 'every weapon carries basic')
-        .refine((s) => new Set(s).size === s.length, 'each skill once'),
-    )
-      .refine(
-        (c) =>
-          RARITY_ORDER.slice(1).every((r, i) => c[RARITY_ORDER[i]].every((s) => c[r].includes(s))),
-        'a rarity carries every chain the rarity below it does',
-      )
-      .refine(
-        (c) => CHAIN_SKILLS.every((s) => c.legendary.includes(s)),
-        'the legendary carries all four chains',
-      ),
     // Each rarity's slots by skill, `[start, ceiling]` (the constructs spec §3.2): the Basic's
     // start 0 means the weapon's string; a ceiling never below its start nor the rarity below's,
     // and the legendary's all 5.
@@ -1484,12 +1464,10 @@ const DelveBalanceSchema = z.object({
     ),
     editDust: z.number().int().min(0),
     elementDust: z.number().int().min(0),
-    transferScrap: z.number().int().min(0),
     // Mana Dust salvaging a construct gives (the constructs spec §3.3 gives none: 0 as shipped).
     salvageDust: z.number().int().min(0),
   }),
   runes: z.object({
-    socketCap: perRarity(z.number().int().min(0).max(MAX_SOCKETS)),
     // Chance a weapon drop's open socket holds a rune, by rarity (the constructs spec §3.5).
     runeChance: perRarity(z.number().min(0).max(1)),
     // By the sockets the move already has: the first socket's price first.

```

Apply to `packages/engine/src/data/tutorial.json`:

```diff
@@ -508,7 +508,7 @@
       "objective": "Transfer your moveset",
       "highlight": "loadout.transfer",
       "trail": ["loadout.bag:weapon.rare", "loadout.transfer"],
-      "trigger": { "type": "transfer", "filter": { "rarity": "rare" }, "count": 1 }
+      "trigger": { "type": "moveAll", "filter": { "rarity": "rare" }, "count": 1 }
     },
     {
       "id": "l2-hone",

```

Apply to `packages/engine/src/delve/autopilot.ts`:

```diff
@@ -43,13 +43,21 @@ import {
   salvageItems,
   upgradeGear,
 } from './profile.js';
-import { awaken, buyShard, forge, hone, refine } from './crafting.js';
-import { addSlot, movesOf, setChain, setChains, transferMoveset, withMove } from './moveset.js';
+import { buyShard, forge, hone, openSkill, refine } from './crafting.js';
+import { addSlot, movesOf, setChain, setChains, withMove } from './moveset.js';
 import { fuseRunes, openSocket } from './runes.js';
-import { pouchCount, runeFits, socketCap, socketsOf } from '../loot/runes.js';
+import { pouchCount, runeFits, socketsOf } from '../loot/runes.js';
+import { MAX_SOCKETS } from '../types/rune.js';
 import { alcoveOffers, takeAlcove, takeStop, type StopAction } from './stops.js';
 import { claimQuest, questStates } from './quests.js';
-import { MAX_CHAIN, MOVE_KINDS, type Blow, type ChainSkill, type Move } from '../types/ability.js';
+import {
+  ABILITY_SLOTS,
+  MAX_CHAIN,
+  MOVE_KINDS,
+  type Blow,
+  type ChainSkill,
+  type Move,
+} from '../types/ability.js';
 import { RUNE_TIERS, type RuneRef, type RuneTarget, type RuneTier } from '../types/rune.js';
 import type { EconomyDive } from './economy.js';
 import {
@@ -321,14 +329,13 @@ function cheapestUpgrade(
 }
 
 /**
- * Move the moveset onto the bag weapon that makes the best home (valued with
- * it moved: `compareItem`'s default), when that raises Power and it can pay.
+ * Wear the bag weapon that raises Power most as it is (its own constructs;
+ * `equipBest` leaves weapons alone). D1 rewires to moveAll (B2's op): until
+ * then the old weapon's bought slots and runes stay on it in the bag.
  */
 function transferBest(registry: DataRegistry, p: DelveProfile): DelveProfile {
-  const uid = bestGain(registry, p, 'home', (item) => item.slot === 'weapon');
-  if (!uid) return p;
-  const res = transferMoveset(registry, p, uid);
-  return res.ok ? res.profile : p;
+  const uid = bestGain(registry, p, 'asIs', (item) => item.slot === 'weapon');
+  return uid ? equipItem(registry, p, uid) : p;
 }
 
 /**
@@ -451,7 +458,7 @@ function bestRune(
  * cap, while it can pay.
  */
 function openSockets(registry: DataRegistry, profile: DelveProfile): DelveProfile {
-  const cap = socketCap(registry, profile.equipped.weapon?.rarity ?? null);
+  const cap = profile.equipped.weapon ? MAX_SOCKETS : 0;
   let p = profile;
   for (;;) {
     const power = profilePower(registry, p);
@@ -636,12 +643,15 @@ function takeGuidedStop(registry: DataRegistry, profile: DelveProfile): DelvePro
   return best?.profile ?? profile;
 }
 
-/** Awaken the rare weapon it wields when it can pay and Power rises (see the tutorial spec's Awaken). */
-function awakenWeapon(registry: DataRegistry, p: DelveProfile): DelveProfile {
-  const weapon = p.equipped.weapon;
-  const res = weapon && awaken(registry, p, weapon.uid);
-  if (!res?.ok) return p;
-  return profilePower(registry, res.profile) > profilePower(registry, p) ? res.profile : p;
+/** Open a skill on the weapon it wields (the constructs spec §3.2, Awaken generalised): each ability slot in order, when it can pay and Power rises. */
+function awakenWeapon(registry: DataRegistry, profile: DelveProfile): DelveProfile {
+  let p = profile;
+  for (const skill of ABILITY_SLOTS) {
+    const weapon = p.equipped.weapon;
+    const res = weapon && openSkill(registry, p, weapon.uid, skill);
+    if (res?.ok && profilePower(registry, res.profile) > profilePower(registry, p)) p = res.profile;
+  }
+  return p;
 }
 
 /**
@@ -886,7 +896,7 @@ function honeGear(registry: DataRegistry, profile: DelveProfile): DelveProfile {
 
 /** The stockpile as a haul: materials, scrap, Mana Dust, Links and runes. */
 function stockOf(p: DelveProfile): Haul {
-  return { ...p.materials, scrap: p.scrap, dust: p.manaDust, links: p.links, runes: p.runes };
+  return { ...p.materials, scrap: p.scrap, dust: p.manaDust, links: p.links, runes: p.runes, constructs: [] };
 }
 
 /** `h` with every count passed through `f`. */
@@ -904,6 +914,7 @@ function mapHaul(h: Haul, f: (n: number) => number): Haul {
     dust: f(h.dust),
     links: f(h.links),
     runes: tiers(h.runes),
+    constructs: [],
   };
 }
 
@@ -1023,9 +1034,10 @@ function lessonOp(
       const from = metals[metals.findIndex((m) => m.id === f.metal) - 1];
       return from ? refine(registry, p, { kind: 'metal', metal: from.id }).profile : p;
     }
-    case 'transfer': {
+    case 'moveAll': {
+      // D1 rewires to moveAll (B2's op): the step is skipped meanwhile.
       const uid = bestGain(registry, p, 'home', (i) => weapons.includes(i)) ?? weapons[0]?.uid;
-      return uid ? transferMoveset(registry, p, uid).profile : p;
+      return uid ? p : p;
     }
     case 'hone': {
       const worn = GEAR_SLOTS.flatMap((s) => p.equipped[s] ?? []).filter((i) => i.affixes.length);

```

## Chunk 12: Task 4 — The switch: constructs with uids, the slot table, Open a skill, Move all's preview, runes on any weapon (continued)

Create `packages/engine/src/delve/constructs.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import { constructSkill, formAllowed, isPlain, movesetOf } from '../loot/moveset.js';
import { CHAIN_SKILLS, type Chains, type Construct } from '../types/ability.js';
import type { DelveProfile } from '../types/delve.js';
import type { RuneRef } from '../types/rune.js';
import { classRefusal, movesOf, setChains } from './moveset.js';
import type { ProfileActionResult } from './profile.js';
import type { SetChainsOptions } from './runes.js';

/**
 * The construct operations (the constructs spec §3.3): the Skills tab's draft
 * of the chains and the bag together, and the Loadout's Move all and a bag
 * construct's salvage. Phase A lays the signatures and `draftRefusal`; B2
 * fills the ops, each refusing "Not yet" until then.
 */

/** The Skills tab's draft: the chains as edited and the bag as the draft sees it. A skill `chains` leaves out is unchanged. */
export interface ConstructDraft {
  chains: Partial<Chains>;
  bag: Construct[];
}

const NOT_YET = 'Not yet';

function refuse(profile: DelveProfile, reason: string): ProfileActionResult {
  return { ok: false, profile, reason };
}

/**
 * Why `draft` can't be applied, or null (the dry run the client's Apply reads):
 * a uid in both the chains and the bag; a saved uid (the worn weapon's chains'
 * or the bag's) the draft lacks, unless it is plain (deleted at Apply); a bag
 * construct placed into a chain of the wrong skill, or whose form the weapon's
 * class can't express; and whatever `setChains` refuses (past the slots, an
 * empty Basic, the runes, the price). A skill `draft.chains` leaves out reads
 * as unchanged.
 */
export function draftRefusal(
  registry: DataRegistry,
  profile: DelveProfile,
  draft: ConstructDraft,
): string | null {
  const weapon = profile.equipped.weapon;
  if (!weapon) return 'Equip a weapon to build your moves';
  const saved = movesetOf(registry, weapon).chains;
  const inChains = new Map<string, Construct>();
  for (const skill of CHAIN_SKILLS)
    for (const m of movesOf(draft.chains[skill] ?? saved[skill]))
      if (m.uid) {
        if (inChains.has(m.uid)) return `${m.uid} is in two slots`;
        inChains.set(m.uid, m);
      }
  const inBag = new Set<string>();
  for (const c of draft.bag) {
    if (!c.uid) return 'A bag construct has no uid';
    if (inChains.has(c.uid) || inBag.has(c.uid)) return `${c.uid} is in two places`;
    inBag.add(c.uid);
  }
  // Every saved construct is still somewhere, or was plain.
  const before = [
    ...CHAIN_SKILLS.flatMap((skill) => movesOf(saved[skill])),
    ...profile.constructs,
  ];
  for (const c of before)
    if (c.uid && !inChains.has(c.uid) && !inBag.has(c.uid) && !isPlain(c))
      return `${c.uid} would be lost`;
  // A placed bag construct: its skill, and its class.
  const bagBefore = new Map(profile.constructs.map((c) => [c.uid!, c]));
  for (const skill of CHAIN_SKILLS)
    for (const m of movesOf(draft.chains[skill] ?? saved[skill])) {
      if (!m.uid || !bagBefore.has(m.uid)) continue;
      if (constructSkill(registry, m) !== skill) return `${m.uid} is not a ${skill} construct`;
      if ('form' in m && !formAllowed(registry, weapon.baseId, m.form))
        return classRefusal(registry, weapon, m.form);
    }
  const dry = setChains(registry, profile, draft.chains);
  return dry.ok ? null : (dry.reason ?? 'Refused');
}

/** `setChains` grown: the chains and the bag together, all or nothing (B2 fills it). */
export function applyDraft(
  _registry: DataRegistry,
  profile: DelveProfile,
  _draft: ConstructDraft,
  _opts: SetChainsOptions = {},
): ProfileActionResult {
  return refuse(profile, NOT_YET);
}

/** A bag construct into slot `index` of `skill` (a one-op `applyDraft`; B2 fills it). */
export function placeConstruct(
  _registry: DataRegistry,
  profile: DelveProfile,
  _uid: string,
  _skill: Chains extends infer _C ? keyof Chains : never,
  _index: number,
): ProfileActionResult {
  return refuse(profile, NOT_YET);
}

/** Slot `index` of `skill` to the bag, its chain closing up (a one-op `applyDraft`; B2 fills it). */
export function unsocketConstruct(
  _registry: DataRegistry,
  profile: DelveProfile,
  _skill: keyof Chains,
  _index: number,
): ProfileActionResult {
  return refuse(profile, NOT_YET);
}

/** Move all (the constructs spec §3.3): the worn weapon's constructs onto bag weapon `uid`, equipped (B2 fills it). */
export function moveAll(
  _registry: DataRegistry,
  profile: DelveProfile,
  _uid: string,
): ProfileActionResult {
  return refuse(profile, NOT_YET);
}

/** Salvage bag construct `uid`: its runes to the pouch at the pull price, `salvageDust` Dust (B2 fills it). */
export function salvageConstruct(
  _registry: DataRegistry,
  profile: DelveProfile,
  _uid: string,
  _opts: SetChainsOptions = {},
): ProfileActionResult & { runes?: RuneRef[] } {
  return refuse(profile, NOT_YET);
}

```

Apply to `packages/engine/src/delve/crafting.ts`:

```diff
@@ -12,8 +12,15 @@ import {
 } from '../loot/forge.js';
 import { implicitValue, scrapLevelFactor } from '../loot/item-generator.js';
 import { materialCount, refineCost, refinedRef, withMaterial } from '../loot/materials.js';
-import { baseSlots, defaultChain, movesetOf } from '../loot/moveset.js';
-import type { AwakenPrice, ForgeRequest, MaterialRef, ShardRef } from '../types/crafting.js';
+import { ceilingOf, defaultForm, movesetOf, plainConstruct, weaponClass } from '../loot/moveset.js';
+import {
+  FLUX_GRADES,
+  type FluxGrade,
+  type ForgeRequest,
+  type MaterialRef,
+  type ShardRef,
+} from '../types/crafting.js';
+import type { AbilitySlot, Move } from '../types/ability.js';
 import type { DelveProfile } from '../types/delve.js';
 import type { GearItem, HeroStatKey } from '../types/gear.js';
 import { isDiveActive } from './dive.js';
@@ -23,7 +30,9 @@ import { applyTutorialEvents } from './tutorial.js';
 import {
   findItem,
   forgeRng,
+  mintMoveset,
   recordFinds,
+  mintUid,
   referenceDepth,
   replaceItem,
   type ProfileActionResult,
@@ -49,13 +58,17 @@ export function forge(
 ): ProfileActionResult {
   const preview = previewForge(registry, profile, req);
   if (preview.refused) return refuse(profile, preview.refused.reason);
-  const item = forgeItem(registry, profile, req, forgeRng(profile));
+  const rolled = forgeItem(registry, profile, req, forgeRng(profile));
   const materials = forgeInputs(req).reduce(
     (m, ref) => withMaterial(m, ref, -1),
     profile.materials,
   );
+  // The item takes `g<nextUid>`; its constructs their `c<n>` uids (the constructs spec §3.1).
+  const [item, minted] = rolled.moveset
+    ? (([moveset, p]) => [{ ...rolled, moveset }, p] as const)(mintMoveset(profile, rolled.moveset))
+    : ([rolled, profile] as const);
   const paid: DelveProfile = {
-    ...profile,
+    ...minted,
     materials,
     scrap: profile.scrap - preview.price.scrap,
     manaDust: profile.manaDust - preview.price.dust,
@@ -205,58 +218,82 @@ export function refine(
   return { ok: true, profile: done };
 }
 
+/** What Open a skill costs on `item` (the constructs spec §3.2): `movesets.openSkill[rarity]`, its scrap × `scrapLevelFactor(ilvl)`. */
+export function openSkillPrice(
+  registry: DataRegistry,
+  item: GearItem,
+): { flux: Partial<Record<FluxGrade, number>>; links: number; scrap: number } {
+  const price = registry.getDelveBalance().movesets.openSkill[item.rarity];
+  return {
+    flux: { ...price.flux },
+    links: price.links,
+    scrap: Math.round(price.scrap * scrapLevelFactor(registry, item.ilvl)),
+  };
+}
+
 /**
- * Awaken rare weapon `uid` (see the tutorial spec's Awaken): it carries the
- * Ultimate too (`GearItem.awakened`; its moveset gains the Ultimate's base
- * chain in the pair's primary), once, for `awakenPrice`. Refused mid-dive, on
- * anything but a rare weapon, on an awakened one, and unpaid. Pure: the Temper
- * bench reads its refusal from a dry run.
+ * Open a skill on weapon `uid`, worn or in the bag (the constructs spec §3.2,
+ * Awaken generalised): a skill at 0 slots whose ceiling is at least 1 gains
+ * its first slot, bought, holding a plain construct in the pair's primary (the
+ * weapon's mana before the choice) at the skill's default payment, for
+ * `openSkillPrice` (flux by grade, Links and scrap). Refused mid-dive, on an
+ * unknown item, on anything but a weapon, on a skill with slots already, at a
+ * ceiling of 0, and unpaid. Pure: the Temper bench reads its refusal from a dry
+ * run. Emits the tutorial's `openSkill` event.
  */
-export function awaken(
+export function openSkill(
   registry: DataRegistry,
   profile: DelveProfile,
   uid: string,
+  skill: AbilitySlot,
 ): ProfileActionResult {
   if (isDiveActive(profile)) return refuse(profile, FORGE_LOCKED);
   const found = findItem(profile, uid);
   if (!found) return refuse(profile, 'Item not found');
   const { item } = found;
-  if (item.slot !== 'weapon' || item.rarity !== 'rare')
-    return refuse(profile, 'Only a rare weapon awakens');
-  if (item.awakened) return refuse(profile, 'Already awakened');
-  const price = awakenPrice(registry, item);
-  const epic: MaterialRef = { kind: 'flux', grade: 'epic' };
-  if (materialCount(profile.materials, epic) < price.epicFlux)
-    return refuse(profile, 'Not enough epic flux');
+  if (item.slot !== 'weapon') return refuse(profile, 'Only a weapon opens a skill');
+  const moveset = movesetOf(registry, item);
+  if (moveset.slots[skill]) return refuse(profile, 'This skill is open already');
+  if (ceilingOf(registry, item, skill) < 1)
+    return refuse(profile, `A ${item.rarity} weapon can't open its ${skill}`);
+  const price = openSkillPrice(registry, item);
+  for (const grade of FLUX_GRADES) {
+    const need = price.flux[grade] ?? 0;
+    if (need > 0 && materialCount(profile.materials, { kind: 'flux', grade }) < need)
+      return refuse(profile, `Not enough ${grade} flux`);
+  }
   if (profile.links < price.links) return refuse(profile, 'Not enough Links');
   if (profile.scrap < price.scrap) return refuse(profile, 'Not enough scrap');
-  const { chains, slots } = movesetOf(registry, item);
-  const base = baseSlots(registry, item.baseId, 'ultimate');
   const element = profile.pair.primary ?? item.mana;
-  const ultimate = defaultChain(registry, 'ultimate', item.baseId, element, base);
-  const awakened: GearItem = {
+  const [cuid, minted] = mintUid(profile);
+  const move = { ...plainConstruct(registry, item, skill, 0, element), uid: cuid } as Move;
+  const { payment } = defaultForm(registry, skill, weaponClass(registry, item.baseId));
+  const opened: GearItem = {
     ...item,
-    awakened: true,
-    moveset: { chains: { ...chains, ultimate }, slots: { ...slots, ultimate: base } },
+    moveset: {
+      chains: { ...moveset.chains, [skill]: { moves: [move], payment } },
+      slots: { ...moveset.slots, [skill]: 1 },
+      bought: { ...moveset.bought, [skill]: 1 },
+    },
+  };
+  let materials = profile.materials;
+  for (const grade of FLUX_GRADES) {
+    const need = price.flux[grade] ?? 0;
+    if (need > 0) materials = withMaterial(materials, { kind: 'flux', grade }, -need);
+  }
+  const paid: DelveProfile = {
+    ...replaceItem(minted, opened),
+    materials,
+    links: profile.links - price.links,
+    scrap: profile.scrap - price.scrap,
   };
   return {
     ok: true,
-    item: awakened,
-    profile: {
-      ...replaceItem(profile, awakened),
-      materials: withMaterial(profile.materials, epic, -price.epicFlux),
-      links: profile.links - price.links,
-      scrap: profile.scrap - price.scrap,
-    },
+    item: opened,
+    profile: applyTutorialEvents(registry, paid, [{ type: 'openSkill', skill }]),
   };
 }
 
-/** What awakening `item` costs: `crafting.awaken`, its scrap × `scrapLevelFactor(ilvl)`. */
-export function awakenPrice(registry: DataRegistry, item: GearItem): AwakenPrice {
-  const price = registry.getDelveBalance().crafting.awaken;
-  return { ...price, scrap: Math.round(price.scrap * scrapLevelFactor(registry, item.ilvl)) };
-}
-
 /** Buy a tier I shard of `stat` at the shard bench (`crafting.shardBench`). */
 export function buyShard(
   registry: DataRegistry,

```

Apply to `packages/engine/src/delve/dive.ts`:

```diff
@@ -448,6 +448,8 @@ function mapCounts(haul: Haul, f: (n: number) => number): Haul {
     dust: f(haul.dust),
     links: f(haul.links),
     runes: tiers(haul.runes),
+    // Its constructs are no counts: the haul's are lost with it, the banked ones kept (B2 rolls each).
+    constructs: [],
   };
 }
 

```

Apply to `packages/engine/src/delve/economy.ts`:

```diff
@@ -46,7 +46,7 @@ export interface EconomyReport {
 
 /** The stockpile as a haul: materials, scrap, Mana Dust, Links and runes. */
 function stockOf(p: DelveProfile): Haul {
-  return { ...p.materials, scrap: p.scrap, dust: p.manaDust, links: p.links, runes: p.runes };
+  return { ...p.materials, scrap: p.scrap, dust: p.manaDust, links: p.links, runes: p.runes, constructs: [] };
 }
 
 /** `h` with every count passed through `f`. */
@@ -64,6 +64,7 @@ function mapHaul(h: Haul, f: (n: number) => number): Haul {
     dust: f(h.dust),
     links: f(h.links),
     runes: tiers(h.runes),
+    constructs: [],
   };
 }
 

```

Apply to `packages/engine/src/delve/hero-stats.ts`:

```diff
@@ -21,7 +21,7 @@ import {
   resolveChain,
   stepBonus,
 } from '../arpg/abilities/resolve.js';
-import { heroChains, movesetTransfer } from '../loot/moveset.js';
+import { heroChains, moveAllPreview } from '../loot/moveset.js';
 import { runeKnobs } from '../loot/runes.js';
 import type { DelveBalance, HeroStats, HeroWeapon, ManaPair } from '../types/delve.js';
 import type { EquippedGear, GearItem, HeroStatKey, StatRoll } from '../types/gear.js';
@@ -365,6 +365,10 @@ const TARGETS: Record<string, number> = {
   armor: 1,
   surge: 0,
   blink: 1.5,
+  // The constructs spec's forms, as their kin until B1 tunes them.
+  whirl: 2,
+  repel: 2.5,
+  onslaught: 3,
 };
 
 const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
@@ -867,8 +871,8 @@ function estimateLoadout(
 }
 
 /**
- * How a weapon is valued: `home`, with the equipped weapon's moveset moved
- * onto it (`movesetTransfer`); `asIs`, with its own, as it would fight if
+ * How a weapon is valued: `home`, with the equipped weapon's constructs moved
+ * onto it (`moveAllPreview`); `asIs`, with its own, as it would fight if
  * equipped now.
  */
 export type WeaponValue = 'home' | 'asIs';
@@ -891,7 +895,7 @@ export function compareItem(
   const worn = equipped.weapon;
   const home = value === 'home' && item.slot === 'weapon' && worn && worn.uid !== item.uid;
   const candidate = home
-    ? { ...item, moveset: movesetTransfer(registry, worn, item).moveset }
+    ? { ...item, moveset: moveAllPreview(registry, worn, item).moveset }
     : item;
   const next = { ...equipped, [item.slot]: candidate };
   const { stats: beforeStats, estimate: before } = estimateLoadout(equipped, registry, depth, pair);

```

Apply to `packages/engine/src/delve/moveset.ts`:

```diff
@@ -1,10 +1,11 @@
 import type { DataRegistry } from '../data/registry.js';
 import {
-  carriedByText,
+  ceilingOf,
   defaultKind,
-  defaultMoveset,
+  formAllowed,
   movesetOf,
-  movesetTransfer,
+  plainConstruct,
+  weaponClass,
 } from '../loot/moveset.js';
 import {
   ABILITY_PAYMENTS,
@@ -14,58 +15,68 @@ import {
   type Chain,
   type Chains,
   type ChainSkill,
+  type Construct,
   type Move,
 } from '../types/ability.js';
 import type { DelveProfile } from '../types/delve.js';
 import type { GearItem, Moveset } from '../types/gear.js';
 import type { ManaType } from '../types/mana.js';
-import type { ChainOrigins } from '../types/rune.js';
 import { isDiveActive } from './dive.js';
 import { inPair } from './pair.js';
-import { withMoveset, type ProfileActionResult } from './profile.js';
+import { mintUid, withMoveset, type ProfileActionResult } from './profile.js';
 import { applyQuestEvents } from './quests.js';
 import { applyTutorialEvents } from './tutorial.js';
 import { runeChange, settleParts, type SetChainsOptions } from './runes.js';
 import { socketsOf, takeFromPouch } from '../loot/runes.js';
 
 /**
- * Editing a weapon's moveset (see the weapon movesets spec): its chains'
- * moves, priced in Mana Dust, and its slots, priced in Links and scrap.
- * profile.ts and pair.ts import this module back: keep to function declarations.
+ * Editing a weapon's moveset (see the constructs spec §3.3): its chains'
+ * constructs, priced in Mana Dust by uid, and its slots, priced in Links and
+ * scrap. profile.ts and pair.ts import this module back: keep to function
+ * declarations.
  */
 
 const BETWEEN_DIVES = 'Chains can only change between dives';
 const UNARMED_TEXT = 'Equip a weapon to build your moves';
+/** A skill with no slot on this weapon (`slots[skill]` absent or 0). */
+export const OPEN_SKILL_TEXT = 'Open this skill on the Temper bench';
 
 function refuse(profile: DelveProfile, reason: string): ProfileActionResult {
   return { ok: false, profile, reason };
 }
 
 /** A chain's moves or blows. */
-export function movesOf(chain: Chains[ChainSkill] | undefined): (Move | Blow)[] {
+export function movesOf(chain: Chains[ChainSkill] | undefined): Construct[] {
   if (!chain) return [];
   return Array.isArray(chain) ? chain : chain.moves;
 }
 
 /** A move's elements: its one or two, a blow's one. */
-function elementsOf(m: Move | Blow): ManaType[] {
+function elementsOf(m: Construct): ManaType[] {
   return 'element' in m ? [m.element] : m.elements;
 }
 
 /** A move as it is: its kind, its form and its elements (a blow: its kind and element). */
-export function moveKey(m: Move | Blow): string {
+export function moveKey(m: Construct): string {
   return 'element' in m ? `${m.kind}|${m.element}` : `${m.kind}|${m.form}|${m.elements.join('+')}`;
 }
 
 /** Whether two moves hold the same sockets: each empty in both, or the same rune at the same tier. */
-function sameSockets(a: Move | Blow, b: Move | Blow): boolean {
+function sameSockets(a: Construct, b: Construct): boolean {
   const [x, y] = [socketsOf(a), socketsOf(b)];
   return x.length === y.length && x.every((r, i) => r?.id === y[i]?.id && r?.tier === y[i]?.tier);
 }
 
+/** Whether two constructs are the same one: by uid when both have one, else by `moveKey`. */
+function sameConstruct(a: Construct, b: Construct): boolean {
+  if (a.uid && b.uid) return a.uid === b.uid && moveKey(a) === moveKey(b);
+  return moveKey(a) === moveKey(b);
+}
+
 /**
- * Whether two chains hold the same moves in order (by `moveKey`), with the
- * same sockets (see the runes spec), and the same payment.
+ * Whether two chains hold the same constructs in order (by uid where both
+ * have one, else by `moveKey`), with the same sockets (see the runes spec),
+ * and the same payment: a reorder reads as a change, an unchanged chain as none.
  */
 export function sameChain(
   a: Chains[ChainSkill] | undefined,
@@ -76,7 +87,7 @@ export function sameChain(
   const [x, y] = [movesOf(a), movesOf(b)];
   if (!Array.isArray(a) && (a as Chain).payment !== (b as Chain).payment) return false;
   return (
-    x.length === y.length && x.every((m, i) => moveKey(m) === moveKey(y[i]) && sameSockets(m, y[i]))
+    x.length === y.length && x.every((m, i) => sameConstruct(m, y[i]) && sameSockets(m, y[i]))
   );
 }
 
@@ -84,7 +95,7 @@ export function sameChain(
 export function withMove(
   chain: Chains[ChainSkill],
   index: number,
-  move: Move | Blow,
+  move: Construct,
 ): Chains[ChainSkill] {
   if (Array.isArray(chain)) return chain.map((b, i) => (i === index ? (move as Blow) : b));
   return { ...chain, moves: chain.moves.map((m, i) => (i === index ? (move as Move) : m)) };
@@ -119,40 +130,19 @@ export function legendaryNeeds(id: string): ChainSkill | null {
   return LEGENDARY_NEEDS.get(id) ?? null;
 }
 
-/**
- * A new chain's origins (see the runes spec): for each of its `moves` moves,
- * the index in the saved chain (`saved` moves) it came from, or null for a new
- * move. `given` is checked: one per move, each a saved index at most once;
- * null when it isn't. Without it, the identity map: move j came from saved
- * move j, if any.
- */
-export function chainOrigins(
-  saved: number,
-  moves: number,
-  given?: readonly (number | null)[],
-): (number | null)[] | null {
-  if (!given) return Array.from({ length: moves }, (_, j) => (j < saved ? j : null));
-  if (given.length !== moves) return null;
-  const seen = new Set<number>();
-  for (const o of given) {
-    if (o === null) continue;
-    if (!Number.isInteger(o) || o < 0 || o >= saved || seen.has(o)) return null;
-    seen.add(o);
-  }
-  return [...given];
+/** A move's elements as the price matches them ("fire+storm"). */
+function els(m: Construct): string {
+  return elementsOf(m).join('+');
 }
 
-/** The length of the longest strictly increasing run in `xs`, in order (at most 5 values). */
-function longestRise(xs: readonly number[]): number {
-  const best = xs.map(() => 1);
-  for (let j = 0; j < xs.length; j++)
-    for (let i = 0; i < j; i++) if (xs[i] < xs[j]) best[j] = Math.max(best[j], best[i] + 1);
-  return Math.max(0, ...best);
+/** A construct's kind and form (a blow's kind): what a changed one pays `editDust` for. */
+function shape(x: Construct): string {
+  return 'form' in x ? `${x.kind}|${x.form}` : x.kind;
 }
 
-/** A move's elements as the price matches them ("fire+storm"). */
-function els(m: Move | Blow): string {
-  return elementsOf(m).join('+');
+/** The saved construct a draft construct is (by uid), or null for a new one. */
+function savedOf(saved: readonly Construct[], m: Construct): Construct | null {
+  return (m.uid && saved.find((s) => s.uid === m.uid)) || null;
 }
 
 /** The Mana Dust one chain's edit costs (see `movesetEditPrice`). */
@@ -160,77 +150,67 @@ function chainEditPrice(
   registry: DataRegistry,
   old: Chains[ChainSkill] | undefined,
   next: Chains[ChainSkill],
-  given?: readonly (number | null)[],
 ): number {
   const { editDust, elementDust } = registry.getDelveBalance().movesets;
   const was = movesOf(old);
   const now = movesOf(next);
-  const origins =
-    chainOrigins(was.length, now.length, given) ?? chainOrigins(was.length, now.length)!;
-  const kept = origins.filter((o): o is number => o !== null);
-  // 1. The moves whose origins rise in order are in place, free; every other one moved.
-  let price = (kept.length - longestRise(kept)) * editDust;
-  // 2. Each origin pair's changes; 3. each new move, and each saved move none came from.
+  let price = 0;
   const known = new Set(was.map(els));
   const charged = new Set<string>();
-  const shape = (x: Move | Blow) => ('form' in x ? `${x.kind}|${x.form}` : x.kind);
-  now.forEach((m, j) => {
-    const o = origins[j];
+  const kept = new Set<string>();
+  for (const m of now) {
+    const from = savedOf(was, m);
     const set = els(m);
-    if (o === null) {
+    if (!from) {
+      // A new construct, and its element set when no saved construct has it (once per Apply).
       price += editDust;
-      if (known.has(set) || charged.has(set)) return;
+      if (known.has(set) || charged.has(set)) continue;
     } else {
-      if (shape(was[o]) !== shape(m)) price += editDust;
-      if (set === els(was[o]) || charged.has(set)) return;
+      kept.add(from.uid!);
+      if (shape(from) !== shape(m)) price += editDust;
+      if (set === els(from) || charged.has(set)) continue;
     }
-    // A new element set: charged once per Apply, however many moves take it.
     charged.add(set);
     price += elementDust;
-  });
-  price += (was.length - kept.length) * editDust;
-  // 4. A changed payment.
+  }
+  // Each saved construct the draft lacks: removed.
+  price += was.filter((s) => !s.uid || !kept.has(s.uid)).length * editDust;
   if (old && !Array.isArray(old) && !Array.isArray(next) && old.payment !== next.payment)
     price += editDust;
   return price;
 }
 
 /**
- * The Mana Dust turning `old` into `next` costs, over every chain `next`
- * holds (see the runes spec, which retires 4a's matching by what moves are):
- * each new move is priced against the saved move it came from (`origins`;
- * missing, the identity map). The moves whose origins rise in order are in
- * place, free; every other one moved, `editDust`. A pair whose kind or form
- * changed costs `editDust`, whose elements changed `elementDust`; a new move
- * `editDust`, and a saved move none came from `editDust`; an element set is
- * charged `elementDust` once per Apply however many moves take it (a new
- * move's only when no saved move has it); a changed payment costs `editDust`.
- * Runes are no part of it (`moveKey` ignores them). Origins for a chain
- * `next` doesn't hold are ignored, and bad origins price as the identity map
- * (`setChains` refuses them first). The caller applies the first-dive freebie.
+ * The Mana Dust turning `saved` into `next` costs, over every chain `next`
+ * holds (the constructs spec §3.3), by uid: a construct in `next` whose uid
+ * `saved` lacks (or without a uid) is new, `editDust`; a saved uid `next`
+ * lacks is removed, `editDust`; a kept uid whose kind or form changed pays
+ * `editDust`, whose elements changed `elementDust`; an element set is charged
+ * `elementDust` once per Apply however many constructs take it (a new
+ * construct's only when no saved one has it); a changed payment costs
+ * `editDust`. Position changes are free, and runes are no part of it. The
+ * caller applies the first-dive freebie.
  */
 export function movesetEditPrice(
   registry: DataRegistry,
-  old: Partial<Chains>,
+  saved: Partial<Chains>,
   next: Partial<Chains>,
-  origins?: ChainOrigins,
 ): number {
   return CHAIN_SKILLS.reduce((sum, skill) => {
     const chain = next[skill];
-    return chain ? sum + chainEditPrice(registry, old[skill], chain, origins?.[skill]) : sum;
+    return chain ? sum + chainEditPrice(registry, saved[skill], chain) : sum;
   }, 0);
 }
 
-/** What an edit costs `profile`: its price (by `origins`), but nothing before the hero's first dive. */
+/** What an edit costs `profile`: its price against the worn weapon's saved chains, but nothing before the hero's first dive. */
 export function editPrice(
   registry: DataRegistry,
   profile: DelveProfile,
   next: Partial<Chains>,
-  origins?: ChainOrigins,
 ): number {
   const weapon = profile.equipped.weapon;
   if (!weapon || profile.stats.dives === 0) return 0;
-  return movesetEditPrice(registry, movesetOf(registry, weapon).chains, next, origins);
+  return movesetEditPrice(registry, movesetOf(registry, weapon).chains, next);
 }
 
 /** How many moves of `chain` hold each element set outside the pair ("fire+nature"). */
@@ -245,20 +225,31 @@ function offPairSets(profile: DelveProfile, chain: Chains[ChainSkill] | undefine
   return counts;
 }
 
+/** "A bow can't express Strike": the class refusal (the constructs spec §3.3). */
+export function classRefusal(registry: DataRegistry, weapon: GearItem, form: Move['form']): string {
+  const base = registry.getGearBase(weapon.baseId).name;
+  const article = /^[AEIOU]/.test(base) ? 'An' : 'A';
+  return `${article} ${base.toLowerCase()} can't express ${registry.getForm(form).name}`;
+}
+
 /** Why `chain` can't be the weapon's `skill` chain, or null when it can. */
 function chainRefusal(
   registry: DataRegistry,
   profile: DelveProfile,
+  weapon: GearItem,
   moveset: Moveset,
   skill: ChainSkill,
   chain: Chains[ChainSkill],
 ): string | null {
-  const slots = moveset.slots[skill];
-  if (slots === undefined) return carriedByText(registry, skill);
+  const slots = moveset.slots[skill] ?? 0;
+  if (slots === 0) return OPEN_SKILL_TEXT;
   if (Array.isArray(chain) !== (skill === 'basic')) return `Not a ${skill} chain`;
   const moves = movesOf(chain);
-  if (moves.length < 1 || moves.length > slots) return `A chain holds 1 to ${slots} moves`;
+  const least = skill === 'basic' ? 1 : 0;
+  if (moves.length < least || moves.length > slots)
+    return `A chain holds ${least} to ${slots} moves`;
   for (const m of moves) if (!MOVE_KINDS.includes(m.kind)) return `Bad kind ${m.kind}`;
+  const saved = movesOf(moveset.chains[skill]);
   for (const m of moves) {
     const els = elementsOf(m);
     if (els.length < 1 || els.length > 2 || new Set(els).size !== els.length)
@@ -269,6 +260,11 @@ function chainRefusal(
         return `Unknown form ${m.form}`;
       const form = registry.getForm(m.form);
       if (form.slot !== skill) return `${form.name} is not a ${skill} form`;
+      // A new or changed construct must be one the weapon's class can express; a kept dormant one may stay.
+      const from = savedOf(saved, m);
+      const changed = !from || !('form' in from) || from.form !== m.form;
+      if (changed && !formAllowed(registry, weapon.baseId, m.form))
+        return classRefusal(registry, weapon, m.form);
     }
   }
   if (!Array.isArray(chain) && !ABILITY_PAYMENTS.includes(chain.payment))
@@ -282,7 +278,7 @@ function chainRefusal(
 
 /** A chain copied, its sockets too, so the save never shares arrays with the caller. */
 function copyChain(chain: Chains[ChainSkill]): Chains[ChainSkill] {
-  const copy = <M extends Move | Blow>(m: M): M =>
+  const copy = <M extends Construct>(m: M): M =>
     m.runes ? { ...m, runes: m.runes.map((r) => r && { ...r }) } : { ...m };
   if (Array.isArray(chain)) return chain.map(copy);
   const moves = chain.moves.map((m) => ({ ...copy(m), elements: [...m.elements] }));
@@ -290,19 +286,42 @@ function copyChain(chain: Chains[ChainSkill]): Chains[ChainSkill] {
 }
 
 /**
- * Set several of the equipped weapon's chains at once: all or nothing (see
- * the runes spec). Mana Dust by origin (`editPrice`, by `opts.origins`), and
- * the sockets' Links and scrap and the runes in and out (`runeChange`; a pull
- * by `opts.unsocket`): the hero's Links become `links − change.links +
+ * `chain` with a fresh uid minted for each construct the saved chain lacks
+ * (no uid, or one the saved chain doesn't hold): the profile's counter moves on.
+ */
+function mintNew(
+  profile: DelveProfile,
+  saved: readonly Construct[],
+  chain: Chains[ChainSkill],
+): [Chains[ChainSkill], DelveProfile] {
+  let p = profile;
+  const mint = <M extends Construct>(m: M): M => {
+    if (savedOf(saved, m)) return m;
+    const [uid, next] = mintUid(p);
+    p = next;
+    return { ...m, uid };
+  };
+  if (Array.isArray(chain)) return [chain.map(mint), p];
+  return [{ ...chain, moves: chain.moves.map(mint) }, p];
+}
+
+/**
+ * Set several of the equipped weapon's chains at once: all or nothing (the
+ * constructs spec §3.3), by uid. Mana Dust (`editPrice`), and the sockets'
+ * Links and scrap and the runes in and out (`runeChange`; a pull by
+ * `opts.unsocket`): the hero's Links become `links − change.links +
  * change.refundLinks`, the netted amount, whatever order the edits were made
  * in (never dearer than the same edits one by one). Refuses mid-dive, unarmed,
- * when any chain is refused (a skill the weapon doesn't carry; fewer than one
- * move or more than its slots; an unknown kind, a form from another slot,
- * anything but one or two different known elements, an unknown payment; an
- * element set outside the pair held more times than before; or bad origins),
- * when the runes are refused (`runeChange`), and when the Dust, the net Links
- * or the scrap can't be paid. Its result lists the runes pulled back to the
- * pouch (`runes`) and those destroyed (`destroyed`).
+ * when any chain is refused (a skill with no slot on the weapon; a Basic with
+ * no blow, or a chain past its slots; an unknown kind, a form from another
+ * slot, a form the weapon's class can't express on a new or changed construct
+ * (a kept dormant one may stay), anything but one or two different known
+ * elements, an unknown payment; an element set outside the pair held more
+ * times than before), when the runes are refused (`runeChange`), and when the
+ * Dust, the net Links or the scrap can't be paid. A construct whose uid the
+ * saved chain lacks is new: it is minted a fresh uid from `profile.nextUid`.
+ * Its result lists the runes pulled back to the pouch (`runes`) and those
+ * destroyed (`destroyed`).
  */
 export function setChains(
   registry: DataRegistry,
@@ -315,26 +334,26 @@ export function setChains(
   if (!weapon) return refuse(profile, UNARMED_TEXT);
   const moveset = movesetOf(registry, weapon);
   const next = { ...moveset.chains };
+  let minted = profile;
   for (const skill of CHAIN_SKILLS) {
     const chain = chains[skill];
     if (!chain) continue;
-    const reason = chainRefusal(registry, profile, moveset, skill, chain);
+    const reason = chainRefusal(registry, profile, weapon, moveset, skill, chain);
     if (reason) return refuse(profile, reason);
-    const saved = movesOf(moveset.chains[skill]).length;
-    if (!chainOrigins(saved, movesOf(chain).length, opts.origins?.[skill]))
-      return refuse(profile, 'Bad origins');
-    (next as Record<ChainSkill, unknown>)[skill] = copyChain(chain);
+    const [made, p] = mintNew(minted, movesOf(moveset.chains[skill]), copyChain(chain));
+    minted = p;
+    (next as Record<ChainSkill, unknown>)[skill] = made;
   }
   const change = runeChange(registry, profile, chains, opts);
   if ('refused' in change) return refuse(profile, change.refused);
-  const price = editPrice(registry, profile, chains, opts.origins);
+  const price = editPrice(registry, profile, chains);
   if (profile.manaDust < price) return refuse(profile, 'Not enough Mana Dust');
   if (profile.links < change.links - change.refundLinks) return refuse(profile, 'Not enough Links');
   if (profile.scrap < change.scrap) return refuse(profile, 'Not enough scrap');
   const settled = settleParts(registry, profile.runes, change.pulled, opts.unsocket);
   const runes = takeFromPouch(settled.pouch, change.socketed);
   if (!runes) return refuse(profile, 'Not enough runes in your pouch');
-  const edited = withMoveset(profile, { ...moveset, chains: next });
+  const edited = withMoveset(minted, { ...moveset, chains: next });
   const paid: DelveProfile = {
     ...edited,
     manaDust: profile.manaDust - price,
@@ -366,7 +385,7 @@ export function setChain<S extends ChainSkill>(
 /**
  * The next slot of `weapon`'s `skill` chain: its Links and scrap by the new
  * slot's position (`slotLinks`, `slotScrap`: the 2nd slot's first), or null
- * when the weapon doesn't carry the skill or the chain has every slot.
+ * at the skill's ceiling or at 0 slots (that is Open a skill's).
  */
 export function slotPrice(
   registry: DataRegistry,
@@ -374,19 +393,20 @@ export function slotPrice(
   skill: ChainSkill,
 ): { links: number; scrap: number } | null {
   const bal = registry.getDelveBalance();
-  const slots = movesetOf(registry, weapon).slots[skill];
-  if (slots === undefined || slots >= bal.chains.cap[skill]) return null;
+  const slots = movesetOf(registry, weapon).slots[skill] ?? 0;
+  if (slots === 0 || slots >= ceilingOf(registry, weapon, skill)) return null;
   return { links: bal.movesets.slotLinks[slots - 1], scrap: bal.movesets.slotScrap[slots - 1] };
 }
 
 /**
  * Add a slot to the equipped weapon's `skill` chain, for Links and scrap
- * (`slotPrice`), and a move at the chain's end: the default kind at its
- * position (the last move's form's default chain, or for the basic chain the
- * weapon's, medium past its end), the last move's form, and the last move's
- * elements while they're all in the pair, else the pair's primary. A slot the
- * chain isn't using stays free. Refuses mid-dive, unarmed, for a skill the
- * weapon doesn't carry, at the cap, and when it can't be paid for.
+ * (`slotPrice`), up to the skill's ceiling; it counts as bought. It arrives
+ * holding a plain construct, minted: the default kind at its position (the
+ * last construct's form's default chain, or for the basic chain the weapon's,
+ * medium past its end), the last construct's form (the class default on an
+ * empty chain), and the last construct's elements while they're all in the
+ * pair, else the pair's primary. Refuses mid-dive, unarmed, for a skill with
+ * no slot (Open a skill's), at the ceiling, and when it can't be paid for.
  */
 export function addSlot(
   registry: DataRegistry,
@@ -397,7 +417,7 @@ export function addSlot(
   const weapon = profile.equipped.weapon;
   if (!weapon) return refuse(profile, UNARMED_TEXT);
   const moveset = movesetOf(registry, weapon);
-  if (moveset.slots[skill] === undefined) return refuse(profile, carriedByText(registry, skill));
+  if (!moveset.slots[skill]) return refuse(profile, OPEN_SKILL_TEXT);
   const price = slotPrice(registry, weapon, skill);
   if (!price) return refuse(profile, 'This chain has every slot');
   if (profile.links < price.links) return refuse(profile, 'Not enough Links');
@@ -405,20 +425,28 @@ export function addSlot(
   const chain = moveset.chains[skill]!;
   const moves = movesOf(chain);
   const last = moves[moves.length - 1];
-  const primary = profile.pair.primary;
-  const kept = elementsOf(last).every((e) => inPair(profile, e));
-  const elements = kept || !primary ? elementsOf(last) : [primary];
-  let next: Chains[ChainSkill];
-  if (Array.isArray(chain)) {
-    const kind = defaultKind(registry, 'basic', weapon.baseId, moves.length);
-    next = [...chain, { kind, element: elements[0] }];
-  } else {
-    const form = (last as Move).form;
-    const kind = registry.getForm(form).defaultChain[moves.length] ?? 'medium';
-    next = { ...chain, moves: [...chain.moves, { kind, form, elements: [...elements] }] };
+  const primary = profile.pair.primary ?? weapon.mana;
+  const [uid, minted] = mintUid(profile);
+  let added: Construct;
+  if (!last) added = { ...plainConstruct(registry, weapon, skill, 0, primary), uid };
+  else {
+    const kept = elementsOf(last).every((e) => inPair(profile, e));
+    const elements = kept ? elementsOf(last) : [primary];
+    if (Array.isArray(chain)) {
+      const kind = defaultKind(registry, 'basic', weapon.baseId, moves.length);
+      added = { uid, kind, element: elements[0] };
+    } else {
+      const form = (last as Move).form;
+      const kind = registry.getForm(form).defaultChain[moves.length] ?? 'medium';
+      added = { uid, kind, form, elements: [...elements] };
+    }
   }
+  const next: Chains[ChainSkill] = Array.isArray(chain)
+    ? [...chain, added as Blow]
+    : { ...chain, moves: [...chain.moves, added as Move] };
   const slots = { ...moveset.slots, [skill]: moveset.slots[skill]! + 1 };
-  const edited = withMoveset(profile, { chains: { ...moveset.chains, [skill]: next }, slots });
+  const bought = { ...moveset.bought, [skill]: (moveset.bought?.[skill] ?? 0) + 1 };
+  const edited = withMoveset(minted, { chains: { ...moveset.chains, [skill]: next }, slots, bought });
   const paid = {
     ...edited,
     links: profile.links - price.links,
@@ -432,44 +460,7 @@ export function addSlot(
   };
 }
 
-/**
- * Move the equipped weapon's moveset onto weapon `uid` in the bag and equip
- * it, for scrap (`movesetTransfer`: its extra slots and open sockets); its
- * Links come back, and the runes that leave go by the parts rule
- * (`opts.unsocket`, else the balance's). The old weapon goes to the bag at its
- * base slots, its moves the defaults in its own mana. Refuses mid-dive,
- * unarmed, for anything but a bag weapon, and when it can't be paid for.
- */
-export function transferMoveset(
-  registry: DataRegistry,
-  profile: DelveProfile,
-  uid: string,
-  opts: Pick<SetChainsOptions, 'unsocket'> = {},
-): ProfileActionResult {
-  if (isDiveActive(profile)) return refuse(profile, 'Transfer your moveset between dives');
-  const source = profile.equipped.weapon;
-  if (!source) return refuse(profile, UNARMED_TEXT);
-  const target = profile.bag.find((i) => i.uid === uid && i.slot === 'weapon');
-  if (!target) return refuse(profile, 'Transfer onto a weapon in your bag');
-  const t = movesetTransfer(registry, source, target);
-  if (profile.scrap < t.scrap) return refuse(profile, 'Not enough scrap');
-  const item = { ...target, moveset: t.moveset };
-  const old = { ...source, moveset: defaultMoveset(registry, source, source.mana) };
-  const settled = settleParts(registry, profile.runes, t.runes, opts.unsocket);
-  const moved: DelveProfile = {
-    ...profile,
-    equipped: { ...profile.equipped, weapon: item },
-    bag: [...profile.bag.filter((i) => i.uid !== uid), old],
-    scrap: profile.scrap - t.scrap,
-    links: profile.links + t.links,
-    runes: settled.pouch,
-  };
-  return {
-    ok: true,
-    item,
-    links: t.links,
-    runes: settled.runes,
-    destroyed: settled.destroyed,
-    profile: applyTutorialEvents(registry, moved, [{ type: 'transfer' }]),
-  };
+/** The class the equipped weapon expresses, for the builder's form picker (unarmed null). */
+export function wornClass(registry: DataRegistry, profile: DelveProfile) {
+  return weaponClass(registry, profile.equipped.weapon?.baseId ?? null);
 }

```

## Chunk 13: Task 4 — The switch: constructs with uids, the slot table, Open a skill, Move all's preview, runes on any weapon (continued)

Apply to `packages/engine/src/delve/pair.ts`:

```diff
@@ -1,6 +1,6 @@
 import type { DataRegistry } from '../data/registry.js';
 import { roleHeir } from '../arpg/abilities/resolve.js';
-import { defaultMoveset, extraSlots, heroChains, movesetOf, weaponParts } from '../loot/moveset.js';
+import { defaultMoveset, heroChains, movesetOf, weaponParts } from '../loot/moveset.js';
 import { ABILITY_SLOTS, type Blow, type ChainSkill, type Move } from '../types/ability.js';
 import type { DelveProfile, HeroStats, ManaPair } from '../types/delve.js';
 import { GEAR_SLOTS, type GearItem, type HeroStatKey, type StatRoll } from '../types/gear.js';
@@ -8,7 +8,13 @@ import type { ManaMap, ManaType } from '../types/mana.js';
 import { buffSum } from './boons.js';
 import { isDiveActive } from './dive.js';
 import { computeHeroStats, pairElements, pairExtra } from './hero-stats.js';
-import { findItem, replaceItem, withMoveset, type ProfileActionResult } from './profile.js';
+import {
+  findItem,
+  mintMoveset,
+  replaceItem,
+  withMoveset,
+  type ProfileActionResult,
+} from './profile.js';
 import { applyQuestEvents } from './quests.js';
 import { applyTutorialEvents } from './tutorial.js';
 import { settleParts, type SetChainsOptions } from './runes.js';
@@ -164,10 +170,10 @@ function attuneTo(item: GearItem, mana: ManaType): GearItem {
 /**
  * The one-time choice: `mana` becomes the primary, every equipped item is
  * re-attuned to it for free (the bag is left alone), and the equipped
- * weapon's moveset starts over at its base slots, every move the default in
- * it. Its open sockets come back as Links and its runes by the parts rule
- * (`opts.unsocket`; its extra slots aren't refunded). Allowed mid-dive (a
- * migrated save may be).
+ * weapon's constructs are replaced with plain ones in it at its starts, minted
+ * (the constructs spec §3.4; B2 sends the old ones to the bag). Its bought
+ * slots come back as Links and its runes by the parts rule (`opts.unsocket`).
+ * Allowed mid-dive (a migrated save may be).
  */
 export function chooseStartingMana(
   registry: DataRegistry,
@@ -185,15 +191,16 @@ export function chooseStartingMana(
   const weapon = equipped.weapon;
   if (!weapon) return { ok: true, profile: { ...profile, equipped, pair } };
   const parts = weaponParts(registry, weapon);
-  const links = parts.links - extraSlots(registry, weapon);
+  const links = parts.links;
   const settled = settleParts(registry, profile.runes, parts.runes, opts.unsocket);
-  equipped.weapon = { ...weapon, moveset: defaultMoveset(registry, weapon, mana) };
+  const [moveset, minted] = mintMoveset(profile, defaultMoveset(registry, weapon, mana));
+  equipped.weapon = { ...weapon, moveset };
   return {
     ok: true,
     links,
     runes: settled.runes,
     destroyed: settled.destroyed,
-    profile: { ...profile, equipped, pair, links: profile.links + links, runes: settled.pouch },
+    profile: { ...minted, equipped, pair, links: profile.links + links, runes: settled.pouch },
   };
 }
 

```

Apply to `packages/engine/src/delve/profile-schema.ts`:

```diff
@@ -58,7 +58,11 @@ export const RuneRefSchema = z.object({
 /** A move's or a blow's open sockets, each a rune or null (see the runes spec). */
 const SocketsSchema = z.array(RuneRefSchema.nullable()).max(MAX_SOCKETS).optional();
 
+/** A construct's id, `c<n>` (the constructs spec §3.1); optional until save v14 requires it. */
+const UidSchema = z.string().min(1).optional();
+
 export const MoveSchema = z.object({
+  uid: UidSchema,
   kind: MoveKindSchema,
   form: FormIdSchema,
   elements: ElementsSchema,
@@ -66,11 +70,15 @@ export const MoveSchema = z.object({
 });
 
 export const BlowSchema = z.object({
+  uid: UidSchema,
   kind: MoveKindSchema,
   element: ManaTypeSchema,
   runes: SocketsSchema,
 });
 
+/** A move or a blow in the bag or a haul (the constructs spec §3.1). */
+export const ConstructSchema = z.union([MoveSchema, BlowSchema]);
+
 /** Loose runes: rune id → counts by tier. */
 export const RunePouchSchema = z.record(
   z.string(),
@@ -98,11 +106,12 @@ export const HaulSchema = MaterialsPouchSchema.extend({
   dust: count,
   links: count,
   runes: RunePouchSchema,
+  constructs: z.array(ConstructSchema).default([]),
 });
 
-/** An ability chain: 1 to `MAX_CHAIN` moves and a payment (see `slotChain` for the forms). */
+/** An ability chain: 0 to `MAX_CHAIN` moves (empty: an uncarried skill) and a payment (see `slotChain` for the forms). */
 export const ChainSchema = z.object({
-  moves: z.array(MoveSchema).min(1).max(MAX_CHAIN),
+  moves: z.array(MoveSchema).min(0).max(MAX_CHAIN),
   payment: PaymentSchema,
 });
 
@@ -116,7 +125,7 @@ function slotChain(slot: AbilitySlot) {
 
 const CapSchema = z.number().int().min(1).max(MAX_CHAIN);
 
-/** A weapon's moveset: a chain for each skill it carries, each within its skill's slots. */
+/** A weapon's moveset: a chain for each skill with slots, each within them, and the slots bought (the constructs spec §3.2). */
 export const MovesetSchema = z
   .object({
     chains: z.object({
@@ -131,6 +140,14 @@ export const MovesetSchema = z
       defensive: CapSchema.optional(),
       ultimate: CapSchema.optional(),
     }),
+    bought: z
+      .object({
+        basic: count.optional(),
+        primary: count.optional(),
+        defensive: count.optional(),
+        ultimate: count.optional(),
+      })
+      .default({}),
   })
   .refine(
     ({ chains, slots }) =>
@@ -169,7 +186,6 @@ export const GearItemSchema = z.object({
   hones: z.number().int().min(0).default(0),
   locked: z.boolean(),
   moveset: MovesetSchema.optional(),
-  awakened: z.boolean().optional(),
 });
 
 const PerRarityCount = z.object({
@@ -306,6 +322,7 @@ const ProfileSchema = z.object({
   diveCount: z.number().int().min(0),
   forgeCount: z.number().int().min(0),
   nextUid: z.number().int().min(0),
+  nextConstructUid: z.number().int().min(0).default(0),
   equipped: z.object({
     weapon: GearItemSchema.optional(),
     helm: GearItemSchema.optional(),
@@ -341,6 +358,9 @@ const ProfileSchema = z.object({
   manaDust: z.number().int().min(0),
   links: z.number().int().min(0),
   runes: RunePouchSchema,
+  // The move bag and its auto-salvage of plain constructs (the constructs spec §3.1, §3.3).
+  constructs: z.array(ConstructSchema).default([]),
+  autoSalvagePlain: z.boolean().default(true),
   materials: MaterialsPouchSchema,
   patterns: z.array(z.string()),
   essencesSeen: z.array(z.string()),
@@ -352,6 +372,8 @@ const ProfileSchema = z.object({
 /** A tutorial depth's entry: the profile as it entered, its dive without an entry (never nested). */
 const TutorialEntrySchema = ProfileSchema.extend({ dive: DiveSchema });
 
-export const DelveProfileSchema = ProfileSchema.extend({
+// Annotated: with the constructs' union in every haul (the dive's and its tutorial entry's) the
+// inferred type is past what the compiler serialises.
+export const DelveProfileSchema: z.ZodTypeAny = ProfileSchema.extend({
   dive: DiveSchema.extend({ tutorialEntry: TutorialEntrySchema.nullable() }).nullable(),
 });

```

Apply to `packages/engine/src/delve/profile.ts`:

```diff
@@ -11,18 +11,25 @@ import { DelveProfileSchema } from './profile-schema.js';
 import { chooseStartingMana, type ChainFix } from './pair.js';
 import { isDiveActive } from './dive.js';
 import type { SetChainsOptions } from './runes.js';
-import { baseSlots, carriedSkills, defaultChain, movesetOf, weaponParts } from '../loot/moveset.js';
+import {
+  chainMoves,
+  constructSkill,
+  defaultMoveset,
+  fillSlots,
+  movesetOf,
+  weaponParts,
+} from '../loot/moveset.js';
 import { emptyMaterials } from '../loot/materials.js';
 import { applyQuestEvents, emptyQuests } from './quests.js';
 import { applyTutorialEvents } from './tutorial.js';
 import { refillBoard } from './contracts.js';
 import { rollFloor } from '../loot/forge.js';
 import { applySalvage, salvageRng } from '../loot/salvage-yield.js';
-import { addToPouch, socketCap } from '../loot/runes.js';
-import type { RuneRef } from '../types/rune.js';
+import { addToPouch } from '../loot/runes.js';
+import { MAX_SOCKETS, type RuneRef } from '../types/rune.js';
 import type { ShardRef } from '../types/crafting.js';
 import type { RewardGrant } from '../types/quests.js';
-import { CHAIN_SKILLS, type Blow, type ChainSkill, type Move } from '../types/ability.js';
+import { CHAIN_SKILLS, type ChainSkill, type Construct } from '../types/ability.js';
 
 export interface ProfileActionResult {
   ok: boolean;
@@ -76,7 +83,10 @@ export function createDelveProfile(
     diveCount: 0,
     forgeCount: 0,
     nextUid: 2,
+    nextConstructUid: 0,
     equipped: { weapon, chest },
+    constructs: [],
+    autoSalvagePlain: true,
     bag: [],
     scrap: kit.startingMaterials.scrap,
     bestDepth: 0,
@@ -104,19 +114,64 @@ export function createDelveProfile(
     tutorial: null,
     dive: null,
   };
+  // The starter sword's constructs take their uids (a world drop's have none; the constructs spec §3.1).
+  const [moveset, minted] = mintMoveset(profile, weapon.moveset!);
+  const armed = { ...minted, equipped: { ...minted.equipped, weapon: { ...weapon, moveset } } };
   // The first unlocks, and a full Contract board once there are templates (see the quests spec).
-  let started = applyQuestEvents(registry, profile, []);
+  let started = applyQuestEvents(registry, armed, []);
   if (registry.getQuestsData().contractTemplates.length > 0)
     started = refillBoard(registry, started);
   return opts.primary ? chooseStartingMana(registry, started, opts.primary).profile : started;
 }
 
-/** `profile` with its equipped weapon's moveset replaced (it has a weapon). */
+/** `profile` with its equipped weapon's moveset replaced (it has a weapon). Uids are kept as given. */
 export function withMoveset(profile: DelveProfile, moveset: Moveset): DelveProfile {
   const weapon = profile.equipped.weapon!;
   return { ...profile, equipped: { ...profile.equipped, weapon: { ...weapon, moveset } } };
 }
 
+/**
+ * A fresh construct uid, `c<nextConstructUid>`, and the profile with that counter moved on (the
+ * constructs spec §3.1). The constructs' counter is apart from the items' `nextUid`: the floor
+ * keys its drops and RNG streams on that one, so a bank's minting must never move it.
+ */
+export function mintUid(profile: DelveProfile): [uid: string, profile: DelveProfile] {
+  return [
+    `c${profile.nextConstructUid}`,
+    { ...profile, nextConstructUid: profile.nextConstructUid + 1 },
+  ];
+}
+
+/** `moveset` with a uid minted for each construct lacking one, and the profile with its counter moved on. */
+export function mintMoveset(
+  profile: DelveProfile,
+  moveset: Moveset,
+): [moveset: Moveset, profile: DelveProfile] {
+  let p = profile;
+  const mint = <M extends Construct>(m: M): M => {
+    if (m.uid) return m;
+    const [uid, next] = mintUid(p);
+    p = next;
+    return { ...m, uid };
+  };
+  const chains: Moveset['chains'] = {};
+  for (const skill of CHAIN_SKILLS) {
+    const chain = moveset.chains[skill];
+    if (!chain) continue;
+    (chains as Record<ChainSkill, unknown>)[skill] = Array.isArray(chain)
+      ? chain.map(mint)
+      : { ...chain, moves: chain.moves.map(mint) };
+  }
+  return [{ ...moveset, chains, bought: moveset.bought ?? {} }, p];
+}
+
+/** `item` with its moveset's constructs minted (`mintMoveset`); other gear as it is. */
+function mintItem(profile: DelveProfile, item: GearItem): [GearItem, DelveProfile] {
+  if (item.slot !== 'weapon') return [item, profile];
+  const [moveset, p] = mintMoveset(profile, item.moveset ?? { chains: {}, slots: {}, bought: {} });
+  return [{ ...item, moveset }, p];
+}
+
 /**
  * A save read back: the profile, or `reset` for a save of another version (no
  * migrations: see the crafting spec), which starts afresh with a notice.
@@ -124,25 +179,27 @@ export function withMoveset(profile: DelveProfile, moveset: Moveset): DelveProfi
 export type ParsedDelveProfile = { profile: DelveProfile } | { reset: true };
 
 /**
- * Every weapon's moveset fitted to the data: a weapon without one gets its
- * base defaults in its own mana; a chain its rarity no longer carries is
- * dropped, its extra slots back as Links (as salvaging would give); a newly
- * carried one gets its base default; and a basic chain's slots are raised to
- * its weapon's string. (A base whose string grew absorbs extras it can't tell
- * from its new base: the old base isn't stored, so those give no Links.)
+ * Every weapon's moveset fitted to the data at load (the constructs spec §3.1):
+ * a weapon without a moveset gets its defaults in its own mana with uids
+ * minted, and a construct without a uid is minted one; then every uid must be
+ * unique across the worn weapon, the bag weapons, the bag and an open dive's
+ * `haul` and `banked` constructs (a settled dive's are in the bag already),
+ * each construct in a slot of its own skill, no chain past its slots, no empty
+ * Basic, and `bought` within the slots: anything else resets the save (null
+ * here). A class mismatch is dormancy, not an error.
  *
  * And its sockets (see the runes spec): a rune the data doesn't know, or the
- * second of one id on a move, is emptied; sockets past the rarity's cap are
- * trimmed from the end, and a dropped chain's go with it. Each socket that
- * goes comes back as a Link, and each known rune taken off leaves by the parts
- * rule in the balance's mode: back to the pouch ('pay') or destroyed
- * ('destroy'). The pouch drops ids the data doesn't know.
+ * second of one id on a move, is emptied; sockets past `MAX_SOCKETS` are
+ * trimmed from the end. Each socket that goes comes back as a Link, and each
+ * known rune taken off leaves by the parts rule in the balance's mode: back to
+ * the pouch ('pay') or destroyed ('destroy'). The pouch drops ids the data
+ * doesn't know.
  */
-function fitMovesets(registry: DataRegistry, profile: DelveProfile): DelveProfile {
+function fitMovesets(registry: DataRegistry, profile: DelveProfile): DelveProfile | null {
   let links = 0;
   const off: RuneRef[] = [];
   const known = (r: RuneRef | null): r is RuneRef => !!r && !!registry.findRune(r.id);
-  const fitSockets = <M extends Move | Blow>(m: M, cap: number): M => {
+  const fitSockets = <M extends Construct>(m: M): M => {
     if (!m.runes) return m;
     const seen = new Set<string>();
     const runes = m.runes.map((r) => {
@@ -154,39 +211,42 @@ function fitMovesets(registry: DataRegistry, profile: DelveProfile): DelveProfil
       seen.add(r.id);
       return r;
     });
-    for (const r of runes.slice(cap)) {
+    for (const r of runes.slice(MAX_SOCKETS)) {
       links++;
       if (r) off.push(r);
     }
-    return { ...m, runes: runes.slice(0, cap) };
+    return { ...m, runes: runes.slice(0, MAX_SOCKETS) };
   };
+  let p = profile;
+  let bad: string | null = null;
   const fit = (item: GearItem): GearItem => {
     if (item.slot !== 'weapon') return item;
-    const old = movesetOf(registry, item);
-    const carried = carriedSkills(registry, item);
-    const cap = socketCap(registry, item.rarity);
-    const moveset: Moveset = { chains: {}, slots: {} };
+    const [withUids, next] = mintItem(
+      p,
+      item.moveset ? item : { ...item, moveset: defaultMoveset(registry, item, item.mana) },
+    );
+    p = next;
+    const old = withUids.moveset!;
+    const moveset: Moveset = { chains: {}, slots: {}, bought: {} };
     for (const skill of CHAIN_SKILLS) {
-      const base = baseSlots(registry, item.baseId, skill);
       const chain = old.chains[skill];
-      if (!carried.includes(skill)) {
-        links += Math.max(0, (old.slots[skill] ?? base) - base);
-        for (const m of chain ? (Array.isArray(chain) ? chain : chain.moves) : [])
-          for (const r of m.runes ?? []) {
-            links++;
-            if (known(r)) off.push(r);
-          }
-        continue;
-      }
+      const slots = old.slots[skill] ?? 0;
+      if (!chain !== (slots === 0)) bad = `${item.uid}: ${skill} has a chain without slots, or slots without a chain`;
+      if (!chain) continue;
+      const moves = chainMoves(chain);
+      if (moves.length > slots) bad = `${item.uid}: ${skill} past its slots`;
+      if (skill === 'basic' && moves.length === 0) bad = `${item.uid}: an empty Basic`;
+      if ((old.bought?.[skill] ?? 0) > slots) bad = `${item.uid}: ${skill} bought past its slots`;
+      for (const m of moves)
+        if (constructSkill(registry, m) !== skill) bad = `${item.uid}: ${m.uid} in a ${skill} slot`;
       const set = moveset.chains as Record<ChainSkill, unknown>;
-      set[skill] = !chain
-        ? defaultChain(registry, skill, item.baseId, item.mana, base)
-        : Array.isArray(chain)
-          ? chain.map((b) => fitSockets(b, cap))
-          : { ...chain, moves: chain.moves.map((m) => fitSockets(m, cap)) };
-      moveset.slots[skill] = chain ? Math.max(old.slots[skill]!, base) : base;
+      set[skill] = Array.isArray(chain)
+        ? chain.map(fitSockets)
+        : { ...chain, moves: chain.moves.map(fitSockets) };
+      moveset.slots[skill] = slots;
+      if (old.bought?.[skill]) moveset.bought[skill] = old.bought[skill];
     }
-    return { ...item, moveset };
+    return { ...withUids, moveset };
   };
   const equipped: EquippedGear = {};
   for (const slot of GEAR_SLOTS) {
@@ -194,14 +254,37 @@ function fitMovesets(registry: DataRegistry, profile: DelveProfile): DelveProfil
     if (item) equipped[slot] = fit(item);
   }
   const bag = profile.bag.map(fit);
+  // The bag's constructs, each in its own right, get a uid too.
+  const constructs = profile.constructs.map((c) => {
+    if (c.uid) return c;
+    const [uid, next] = mintUid(p);
+    p = next;
+    return { ...c, uid };
+  });
+  // Every uid once, over everything the profile holds (an open dive's haul and banked too).
+  const seen = new Set<string>();
+  const weapons = [...GEAR_SLOTS.flatMap((s) => equipped[s] ?? []), ...bag];
+  const dive = profile.dive && !profile.dive.settled ? profile.dive : null;
+  const all = [
+    ...weapons.flatMap((w) => CHAIN_SKILLS.flatMap((s) => chainMoves(w.moveset?.chains[s]))),
+    ...constructs,
+    ...(dive?.haul.constructs ?? []),
+    ...(dive?.banked.constructs ?? []),
+  ];
+  for (const c of all) {
+    if (!c.uid || seen.has(c.uid)) bad = `uid ${c.uid} twice`;
+    seen.add(c.uid ?? '');
+  }
+  if (bad) return null;
   const pouch = Object.fromEntries(
     Object.entries(profile.runes).filter(([id]) => registry.findRune(id)),
   );
   const pay = registry.getDelveBalance().runes.unsocket === 'pay';
   return {
-    ...profile,
+    ...p,
     equipped,
     bag,
+    constructs,
     links: profile.links + links,
     runes: pay ? addToPouch(pouch, off) : pouch,
   };
@@ -209,14 +292,18 @@ function fitMovesets(registry: DataRegistry, profile: DelveProfile): DelveProfil
 
 /**
  * Validate an unknown JSON blob as a save. A version 13 save is fitted to the
- * data (`fitMovesets`); a save of any other version is `{ reset: true }`. Null
- * when it isn't an object, or a version 13 save doesn't fit the schema.
+ * data (`fitMovesets`); a save of any other version, or one whose constructs
+ * don't fit (a uid twice, a construct out of its skill, a chain past its
+ * slots, an empty Basic), is `{ reset: true }`. Null when it isn't an object,
+ * or a version 13 save doesn't fit the schema.
  */
 export function parseDelveProfile(registry: DataRegistry, raw: unknown): ParsedDelveProfile | null {
   if (typeof raw !== 'object' || raw === null) return null;
   if ((raw as { version?: unknown }).version !== 13) return { reset: true };
   const parsed = DelveProfileSchema.safeParse(raw);
-  return parsed.success ? { profile: fitMovesets(registry, parsed.data as DelveProfile) } : null;
+  if (!parsed.success) return null;
+  const fitted = fitMovesets(registry, parsed.data as DelveProfile);
+  return fitted ? { profile: fitted } : { reset: true };
 }
 
 /** Depth used as the yardstick for Power and comparisons. */
@@ -361,7 +448,11 @@ export function addLootToBag(
   const kept: GearItem[] = [];
   const salvaged: GearItem[] = [];
   let bagFull = false;
-  for (const item of items) {
+  let p = recorded.profile;
+  for (const dropped of items) {
+    // A banked weapon's constructs take their uids as it enters the profile (the constructs spec §3.1).
+    const [item, next] = mintItem(p, dropped);
+    p = next;
     // Never while the tutorial runs: its set gear is the next steps' (see the tutorial spec).
     const auto =
       !profile.tutorial && item.rarity !== 'legendary' && profile.autoSalvage[item.rarity];
@@ -373,7 +464,7 @@ export function addLootToBag(
       kept.push(item);
     }
   }
-  const melted = melt(registry, { ...recorded.profile, bag }, salvaged, opts);
+  const melted = melt(registry, { ...p, bag }, salvaged, opts);
   return { ...melted, kept, salvaged, bagFull, newCodex: recorded.newCodex };
 }
 
@@ -514,11 +605,21 @@ export function upgradeGear(
   const cost = upgradeCost(registry, found.item);
   if (cost === null) return { ok: false, profile, reason: 'Already at max upgrade' };
   if (profile.scrap < cost) return { ok: false, profile, reason: 'Not enough scrap' };
-  const item = applyUpgrade(registry, found.item);
+  const upgraded = applyUpgrade(registry, found.item);
+  // A weapon's skills below its rarity's starts gain plain-filled slots up to them, not bought
+  // (the constructs spec §3.2), their constructs minted. (An upgrade keeps the rarity here, so
+  // a weapon at its starts is left as it is.)
+  const [item, minted] =
+    upgraded.slot === 'weapon'
+      ? mintItem(profile, {
+          ...upgraded,
+          moveset: fillSlots(registry, upgraded, movesetOf(registry, upgraded), upgraded.mana),
+        })
+      : [upgraded, profile];
   return {
     ok: true,
     item,
-    profile: { ...replaceItem(profile, item), scrap: profile.scrap - cost },
+    profile: { ...replaceItem(minted, item), scrap: profile.scrap - cost },
   };
 }
 

```

Apply to `packages/engine/src/delve/runes.ts`:

```diff
@@ -1,25 +1,19 @@
 import type { DataRegistry } from '../data/registry.js';
-import { carriedByText, movesetOf } from '../loot/moveset.js';
-import {
-  addToPouch,
-  runeFits,
-  socketCap,
-  socketPrice,
-  socketsOf,
-  takeFromPouch,
-} from '../loot/runes.js';
+import { movesetOf } from '../loot/moveset.js';
+import { addToPouch, runeFits, socketPrice, socketsOf, takeFromPouch } from '../loot/runes.js';
 import {
   CHAIN_SKILLS,
   type Blow,
   type Chains,
   type ChainSkill,
+  type Construct,
   type Move,
 } from '../types/ability.js';
 import type { DelveProfile } from '../types/delve.js';
 import type { GearItem } from '../types/gear.js';
 import {
+  MAX_SOCKETS,
   RUNE_TIERS,
-  type ChainOrigins,
   type RunePouch,
   type RuneRef,
   type RuneTarget,
@@ -27,7 +21,7 @@ import {
   type UnsocketMode,
 } from '../types/rune.js';
 import { isDiveActive } from './dive.js';
-import { chainOrigins, editPrice, movesOf, setChains, withMove } from './moveset.js';
+import { OPEN_SKILL_TEXT, editPrice, movesOf, setChains, withMove } from './moveset.js';
 import type { ProfileActionResult } from './profile.js';
 
 /**
@@ -37,8 +31,8 @@ import type { ProfileActionResult } from './profile.js';
  * function declarations.
  */
 
+/** Apply's options: the pull rule (the dev override, else the balance's). Origins are gone: constructs have uids. */
 export interface SetChainsOptions {
-  origins?: ChainOrigins;
   unsocket?: UnsocketMode;
 }
 
@@ -113,15 +107,14 @@ function fitName(registry: DataRegistry, baseId: string | null, m: Move | Blow):
 }
 
 /**
- * Why `m`'s sockets can't be on `weapon`, or null: more than its rarity's cap,
- * an unknown rune (or tier), the same rune twice at any tier, or a rune that
- * doesn't fit the move's form or the weapon's blows.
+ * Why `m`'s sockets can't be on `weapon`, or null: more than `MAX_SOCKETS`
+ * (sockets belong to the construct, whatever weapon holds it: the constructs
+ * spec §3.1), an unknown rune (or tier), the same rune twice at any tier, or a
+ * rune that doesn't fit the move's form or the weapon's blows.
  */
 function socketRefusal(registry: DataRegistry, weapon: GearItem, m: Move | Blow): string | null {
   const sockets = socketsOf(m);
-  const cap = socketCap(registry, weapon.rarity);
-  if (sockets.length > cap)
-    return `This weapon's moves hold at most ${cap} socket${cap === 1 ? '' : 's'}`;
+  if (sockets.length > MAX_SOCKETS) return `A move holds at most ${MAX_SOCKETS} sockets`;
   const seen = new Set<string>();
   for (const r of sockets) {
     if (!r) continue;
@@ -138,16 +131,16 @@ function socketRefusal(registry: DataRegistry, weapon: GearItem, m: Move | Blow)
 
 /**
  * What the draft `chains` does to the equipped weapon's sockets (see the runes
- * spec), each new move against the saved move it came from (`opts.origins`;
- * missing, the identity map): sockets past the saved move's are opened, each
- * priced by its index (`socketPrice`); at each socket both have, a different
- * rune is a pull and a socket; a saved move no new move came from gives its
- * sockets back (`refundLinks`, netted against `links`) and its runes are
- * pulled; a new move opens all of its. A pull costs `pullScrap` in 'pay'
- * (`opts.unsocket`, else the balance's). Refuses unarmed, bad origins, a
- * socket refusal (`socketRefusal`), fewer sockets on a kept move, and a pouch
- * that can't hold what is socketed (in 'pay', what is pulled goes back first).
- * Chains `chains` doesn't hold, and their origins, are left out.
+ * spec), by uid (the constructs spec §3.3): a kept uid's sockets against its
+ * saved sockets (those past the saved ones are opened, each priced by its
+ * index, `socketPrice`; at each socket both have, a different rune is a pull
+ * and a socket); a new uid (or a construct without one) opens all of its; a
+ * removed uid gives its sockets back (`refundLinks`, netted against `links`)
+ * and its runes are pulled. A pull costs `pullScrap` in 'pay' (`opts.unsocket`,
+ * else the balance's). Refuses unarmed, a socket refusal (`socketRefusal`),
+ * fewer sockets on a kept construct, and a pouch that can't hold what is
+ * socketed (in 'pay', what is pulled goes back first). Chains `chains`
+ * doesn't hold are left out.
  */
 export function runeChange(
   registry: DataRegistry,
@@ -176,13 +169,13 @@ export function runeChange(
     if (!chain) continue;
     const was = movesOf(saved[skill]);
     const now = movesOf(chain);
-    const origins = chainOrigins(was.length, now.length, opts.origins?.[skill]);
-    if (!origins) return { refused: 'Bad origins' };
-    for (const [j, m] of now.entries()) {
+    const kept = new Set<string>();
+    for (const m of now) {
       const why = socketRefusal(registry, weapon, m);
       if (why) return { refused: why };
-      const o = origins[j];
-      const old = o === null ? [] : socketsOf(was[o]);
+      const from: Construct | undefined = m.uid ? was.find((s) => s.uid === m.uid) : undefined;
+      if (from?.uid) kept.add(from.uid);
+      const old = from ? socketsOf(from) : [];
       const next = socketsOf(m);
       if (next.length < old.length) return { refused: "Sockets can't be closed" };
       next.forEach((r, i) => {
@@ -198,12 +191,11 @@ export function runeChange(
         }
       });
     }
-    const from = new Set(origins);
-    was.forEach((m, i) => {
-      if (from.has(i)) return;
+    for (const m of was) {
+      if (m.uid && kept.has(m.uid)) continue;
       change.refundLinks += socketsOf(m).length;
       for (const r of socketsOf(m)) add(change.pulled, r);
-    });
+    }
   }
   if (pay) for (const r of change.pulled) change.scrap += pullScrap[r.tier - 1];
   const back = pay ? addToPouch(profile.runes, change.pulled) : profile.runes;
@@ -214,12 +206,12 @@ export function runeChange(
 
 /**
  * The draft's one total, as Apply would charge it (see the runes spec): the
- * Mana Dust (`editPrice`, by the origins), the Links and scrap the sockets and
- * pulls cost (`runeChange`), the Links removed moves give back, the runes a
- * pull destroys ('destroy') or returns ('pay'), and the pouch it leaves; or `runeChange`'s refusal
- * (unarmed, bad origins, a socket refusal, closed sockets, a short pouch). It
- * doesn't check the chains themselves (`setChains`' refusals) or whether the
- * hero can afford the total.
+ * Mana Dust (`editPrice`, by uid), the Links and scrap the sockets and pulls
+ * cost (`runeChange`), the Links removed constructs give back, the runes a
+ * pull destroys ('destroy') or returns ('pay'), and the pouch it leaves; or
+ * `runeChange`'s refusal (unarmed, a socket refusal, closed sockets, a short
+ * pouch). It doesn't check the chains themselves (`setChains`' refusals) or
+ * whether the hero can afford the total.
  */
 export function draftPrice(
   registry: DataRegistry,
@@ -231,7 +223,7 @@ export function draftPrice(
   if ('refused' in change) return change;
   const pay = unsocketMode(registry, opts.unsocket) === 'pay';
   return {
-    dust: editPrice(registry, profile, chains, opts.origins),
+    dust: editPrice(registry, profile, chains),
     links: change.links,
     scrap: change.scrap,
     refundLinks: change.refundLinks,
@@ -259,7 +251,7 @@ function moveAt(
   const weapon = profile.equipped.weapon;
   if (!weapon) return UNARMED_TEXT;
   const chain = movesetOf(registry, weapon).chains[skill];
-  if (!chain) return carriedByText(registry, skill);
+  if (!chain) return OPEN_SKILL_TEXT;
   const move = Number.isInteger(index) ? movesOf(chain)[index] : undefined;
   if (!move) return 'Pick a move the chain holds';
   return { chain, move };
@@ -269,8 +261,8 @@ function moveAt(
  * Open the next socket on the equipped weapon's move `index` of `skill`: one
  * `setChains` in place, so it costs `socketLinks[n]` Links and
  * `socketScrap[n]` scrap by the `n` sockets the move has. Refuses mid-dive,
- * unarmed, a skill the weapon doesn't carry, a move the chain doesn't hold, at
- * the weapon rarity's cap, and when it can't be paid.
+ * unarmed, a skill with no slot on the weapon, a move the chain doesn't hold,
+ * at `MAX_SOCKETS`, and when it can't be paid.
  */
 export function openSocket(
   registry: DataRegistry,
@@ -281,8 +273,7 @@ export function openSocket(
   const at = moveAt(registry, profile, skill, index);
   if (typeof at === 'string') return refuse(profile, at);
   const sockets = socketsOf(at.move);
-  if (sockets.length >= socketCap(registry, profile.equipped.weapon!.rarity))
-    return refuse(profile, 'This move has every socket');
+  if (sockets.length >= MAX_SOCKETS) return refuse(profile, 'This move has every socket');
   const move = { ...at.move, runes: [...sockets, null] };
   return setChains(registry, profile, { [skill]: withMove(at.chain, index, move) });
 }

```

Apply to `packages/engine/src/delve/stops.ts`:

```diff
@@ -4,7 +4,7 @@ import type { Interactable } from '../types/floor-map.js';
 import type { Buff } from '../types/boon.js';
 import { rollBoons } from './boons.js';
 import { refreshWorldHero } from '../arpg/world.js';
-import { carriedByText, heroChains, movesetOf } from '../loot/moveset.js';
+import { heroChains, movesetOf } from '../loot/moveset.js';
 import { upgradeCost } from '../loot/smithing.js';
 import { SeededRNG } from '../rng/seeded-rng.js';
 import { runeFits, socketsOf } from '../loot/runes.js';
@@ -14,7 +14,15 @@ import { CHAIN_SKILLS, type Blow, type ChainSkill, type Move } from '../types/ab
 import type { DelveProfile, DiveState, DiveStop, StopKind } from '../types/delve.js';
 import { GEAR_SLOTS, type GearItem } from '../types/gear.js';
 import type { RuneRef } from '../types/rune.js';
-import { addSlot, moveKey, movesOf, setChain, slotPrice, withMove } from './moveset.js';
+import {
+  OPEN_SKILL_TEXT,
+  addSlot,
+  moveKey,
+  movesOf,
+  setChain,
+  slotPrice,
+  withMove,
+} from './moveset.js';
 import { equipItem, upgradeGear, type ProfileActionResult } from './profile.js';
 import { runeTargetOf, socketRune } from './runes.js';
 import { bankWorld } from './dive.js';
@@ -220,7 +228,7 @@ function runStop(
       const weapon = profile.equipped.weapon;
       if (!weapon) return { ok: false, profile, reason: 'Equip a weapon to build your moves' };
       const chain = movesetOf(registry, weapon).chains[action.skill];
-      if (!chain) return { ok: false, profile, reason: carriedByText(registry, action.skill) };
+      if (!chain) return { ok: false, profile, reason: OPEN_SKILL_TEXT };
       const moves = movesOf(chain);
       const { index, move } = action;
       if (!Number.isInteger(index) || index < 0 || index >= moves.length)
@@ -242,7 +250,7 @@ function runStop(
       const weapon = profile.equipped.weapon;
       if (!weapon) return { ok: false, profile, reason: 'Equip a weapon to build your moves' };
       const chain = movesetOf(registry, weapon).chains[action.skill];
-      if (!chain) return { ok: false, profile, reason: carriedByText(registry, action.skill) };
+      if (!chain) return { ok: false, profile, reason: OPEN_SKILL_TEXT };
       const { index, socket } = action;
       const move = Number.isInteger(index) ? movesOf(chain)[index] : undefined;
       if (!move) return { ok: false, profile, reason: 'Socket a rune into a move the chain holds' };

```

Apply to `packages/engine/src/delve/tutorial.ts`:

```diff
@@ -4,7 +4,7 @@ import { nextMove } from '../arpg/abilities/cast.js';
 import { setDoor } from '../arpg/grid.js';
 import { honeCost, previewForge } from '../loot/forge.js';
 import { materialCount, refineCost } from '../loot/materials.js';
-import { baseSlots, movesetOf, movesetTransfer } from '../loot/moveset.js';
+import { movesetOf, slotRange } from '../loot/moveset.js';
 import { socketsOf } from '../loot/runes.js';
 import type { Move } from '../types/ability.js';
 import type { ArpgWorld } from '../types/arpg.js';
@@ -53,7 +53,7 @@ const BY_STATE: ReadonlySet<string> = new Set([
   'setChains',
   'salvage',
   'refine',
-  'transfer',
+  'moveAll',
   'hone',
 ]);
 
@@ -240,12 +240,12 @@ export function tutorialHolds(
       return !items.some((i) => i.slot === f.slot && i.rarity === f.rarity);
     case 'refine':
       return materialCount(profile.materials, { kind: 'metal', metal: f.metal as MetalId }) > 0;
-    case 'transfer': {
-      // The moveset moved with it: a plain Equip leaves the Primary at its base slots.
+    case 'moveAll': {
+      // The constructs moved with it: a plain Equip leaves the Primary at its start (D1 rewrites).
       const weapon = profile.equipped.weapon;
       return (
         atLeast(weapon, f.rarity) &&
-        primaryMoves(registry, profile).length > baseSlots(registry, weapon!.baseId, 'primary')
+        primaryMoves(registry, profile).length > slotRange(registry, weapon!, 'primary')[0]
       );
     }
     case 'hone':
@@ -311,9 +311,10 @@ function unaffordable(registry: DataRegistry, profile: DelveProfile, step: Tutor
       const cost = refineCost(registry, ref)!;
       return materialCount(profile.materials, ref) < cost.count || profile.scrap < cost.scrap;
     }
-    case 'transfer': {
+    case 'moveAll': {
+      // Move all is free; without a worn weapon or a target it can't be done. D1 rewires to B2's op.
       const target = profile.bag.find((i) => i.slot === 'weapon' && atLeast(i, f.rarity));
-      return !weapon || !target || movesetTransfer(registry, weapon, target).scrap > profile.scrap;
+      return !weapon || !target;
     }
     case 'hone':
       return !itemsOf(profile).some(

```

Apply to `packages/engine/src/index.ts`:

```diff
@@ -92,13 +92,15 @@ export {
   editPrice,
   addSlot,
   slotPrice,
-  transferMoveset,
   movesOf,
   moveKey,
   sameChain,
   withMove,
   takesElements,
   legendaryNeeds,
+  classRefusal,
+  wornClass,
+  OPEN_SKILL_TEXT,
 } from './delve/moveset.js';
 export {
   STOP_KINDS,
@@ -130,14 +132,28 @@ export {
   heroChains,
   movesetOf,
   defaultMoveset,
-  extraSlots,
-  baseSlots,
-  carriedSkills,
-  carriedByText,
-  carriedFrom,
-  movesetTransfer,
+  defaultChain,
+  defaultForm,
+  weaponClass,
+  formAllowed,
+  slotRange,
+  ceilingOf,
+  plainConstruct,
+  fillSlots,
+  rollMoveset,
+  constructSkill,
+  isPlain,
+  dormantUids,
+  moveAllPreview,
+  chainMoves,
+  UNARMED,
 } from './loot/moveset.js';
-export type { MovesetTransfer } from './loot/moveset.js';
+export type { MovesetOwner, MoveAllPreview } from './loot/moveset.js';
+// Constructs (see the constructs spec): the ops module whole (B2 fills it), the style pipeline and the signature hook.
+export * from './delve/constructs.js';
+export { mintUid, mintMoveset } from './delve/profile.js';
+export { applyStyle } from './arpg/abilities/resolve.js';
+export * from './arpg/abilities/signatures.js';
 export {
   GearItemSchema,
   MoveSchema,

```

Apply to `packages/engine/src/loot/forge.ts`:

```diff
@@ -29,8 +29,8 @@ import {
   weightedPick,
 } from './item-generator.js';
 import { materialCount, shardTiersOf } from './materials.js';
-import { baseSlots, carriedSkills, defaultMoveset } from './moveset.js';
-import { socketCap, socketsOf } from './runes.js';
+import { ceilingOf, defaultMoveset, slotRange, weaponClass } from './moveset.js';
+import { socketsOf } from './runes.js';
 
 /**
  * Forging and the Temper sinks on an item (see the crafting spec): the forge's
@@ -63,38 +63,27 @@ function shardBand(registry: DataRegistry, shard: ShardRef): [number, number] |
 const EXTRAS_ORDER: readonly ChainSkill[] = ['primary', 'basic', 'ultimate', 'defensive'];
 
 /**
- * A forged weapon's moveset (the crafting spec's S7): the skills its rarity
- * carries, every move its default in the item's mana; `crafting.weaponExtras`
- * extra slots fill the Primary to its cap first, then Basic, Ultimate and
- * Defensive; the open sockets go one a move in that order (the Primary's first
- * moves first), round after round up to the rarity's cap.
+ * A forged weapon's moveset (the constructs spec §3.5): each skill at its
+ * rarity's start, every slot a plain construct in the item's mana;
+ * `crafting.weaponExtras.slots` free extra slots (not bought) fill the Primary
+ * to its ceiling first, then Basic, Ultimate and Defensive, only skills with a
+ * start (a forge never opens a skill). No sockets, no uids (`forge` mints them).
  */
 export function forgedMoveset(
   registry: DataRegistry,
   item: Pick<GearItem, 'baseId' | 'rarity' | 'mana'>,
 ): Moveset {
-  const bal = registry.getDelveBalance();
-  const extras = bal.crafting.weaponExtras[item.rarity];
-  const carried = carriedSkills(registry, item);
-  const order = EXTRAS_ORDER.filter((s) => carried.includes(s));
+  const extras = registry.getDelveBalance().crafting.weaponExtras[item.rarity];
   const slots: Partial<Record<ChainSkill, number>> = {};
   let left = extras.slots;
-  for (const s of order) {
-    const base = baseSlots(registry, item.baseId, s);
-    const add = Math.min(left, Math.max(0, bal.chains.cap[s] - base));
-    slots[s] = base + add;
+  for (const s of EXTRAS_ORDER) {
+    const [start, ceiling] = slotRange(registry, item, s);
+    if (start === 0) continue;
+    const add = Math.min(left, Math.max(0, ceiling - start));
+    slots[s] = start + add;
     left -= add;
   }
-  const moveset = defaultMoveset(registry, item, item.mana, slots);
-  const moves = order.flatMap((s) => movesOf(moveset.chains[s]));
-  let open = extras.sockets;
-  for (let round = 0; round < socketCap(registry, item.rarity); round++)
-    for (const m of moves)
-      if (open > 0) {
-        m.runes = [...socketsOf(m), null];
-        open--;
-      }
-  return moveset;
+  return defaultMoveset(registry, item, item.mana, slots);
 }
 
 /** What a forge consumes besides scrap and Mana Dust: the bar, the flux, the essence and the shards. */
@@ -215,14 +204,14 @@ export function previewForge(
       dust: inPair(profile, req.element) ? 0 : bal.crafting.offPairDust,
     },
     weapon: moveset && {
-      carries: [...carriedSkills(registry, { rarity })],
-      // Each carried skill's extra slots, past its base.
+      class: weaponClass(registry, base.id)!,
+      // Each skill's slots against its ceiling (a skill at 0 slots listed too).
       slots: Object.fromEntries(
-        carriedSkills(registry, { rarity }).map((s) => [
+        CHAIN_SKILLS.map((s) => [
           s,
-          moveset.slots[s]! - baseSlots(registry, base.id, s),
+          [moveset.slots[s] ?? 0, ceilingOf(registry, { baseId: base.id, rarity }, s)],
         ]),
-      ),
+      ) as Record<ChainSkill, [number, number]>,
       sockets: CHAIN_SKILLS.flatMap((s) => movesOf(moveset.chains[s])).flatMap(socketsOf).length,
     },
   };

```

Apply to `packages/engine/src/loot/item-generator.ts`:

```diff
@@ -4,7 +4,7 @@ import type { GearAffixDef, ImplicitTemplate } from '../types/delve.js';
 import type { GearItem, GearSlot, HeroStatKey, Rarity, StatRoll } from '../types/gear.js';
 import { GEAR_SLOTS, RARITY_ORDER } from '../types/gear.js';
 import { MANA_TYPES, type ManaType } from '../types/mana.js';
-import { rollMoveset, rollSockets } from './moveset.js';
+import { rollMoveset, rollSocketedRunes, rollSockets } from './moveset.js';
 import { metalAt } from './materials.js';
 
 export interface ItemGenOptions {
@@ -234,7 +234,8 @@ export function generateItem(registry: DataRegistry, opts: ItemGenOptions, rng:
   // Last, from their own streams: every other roll, and every later drop, stays as it was.
   if (item.slot === 'weapon') {
     const moveset = rollMoveset(registry, item, rng.fork('moveset'));
-    item.moveset = rollSockets(registry, item, moveset, rng.fork('sockets'));
+    const socketed = rollSockets(registry, item, moveset, rng.fork('sockets'));
+    item.moveset = rollSocketedRunes(registry, item, socketed, rng.fork('socketed'));
   }
   return item;
 }

```

## Chunk 14: Task 4 — The switch: constructs with uids, the slot table, Open a skill, Move all's preview, runes on any weapon (continued)

Apply to `packages/engine/src/loot/materials.ts`:

```diff
@@ -44,9 +44,9 @@ export function emptyMaterials(): MaterialsPouch {
   };
 }
 
-/** An empty haul: no materials, scrap, Mana Dust, Links or runes. */
+/** An empty haul: no materials, scrap, Mana Dust, Links, runes or constructs. */
 export function emptyHaul(): Haul {
-  return { ...emptyMaterials(), scrap: 0, dust: 0, links: 0, runes: {} };
+  return { ...emptyMaterials(), scrap: 0, dust: 0, links: 0, runes: {}, constructs: [] };
 }
 
 /** Counts by tier summed (a missing tier counts 0; the longer length is kept). */
@@ -78,7 +78,7 @@ export function addMaterials<P extends MaterialsPouch>(a: P, b: MaterialsPouch):
   };
 }
 
-/** Two hauls summed: materials, scrap, Mana Dust, Links and runes. */
+/** Two hauls summed: materials, scrap, Mana Dust, Links and runes; their constructs in order. */
 export function addHaul(a: Haul, b: Haul): Haul {
   return {
     ...addMaterials(a, b),
@@ -86,6 +86,7 @@ export function addHaul(a: Haul, b: Haul): Haul {
     dust: a.dust + b.dust,
     links: a.links + b.links,
     runes: sumKeys(a.runes, b.runes, sumTiers),
+    constructs: [...(a.constructs ?? []), ...(b.constructs ?? [])],
   };
 }
 
@@ -115,8 +116,12 @@ export function addMaterial(haul: Haul, ref: MaterialRef, amount = 1): Haul {
   return addHaul(haul, one);
 }
 
-/** `profile` with `haul` in its stockpile: materials, scrap (counted as earned), Mana Dust, Links and runes. */
+/**
+ * `profile` with `haul` in its stockpile: materials, scrap (counted as earned), Mana Dust, Links
+ * and runes, and its constructs into the move bag (the constructs spec §3.3).
+ */
 export function stockHaul(profile: DelveProfile, haul: Haul): DelveProfile {
+  const constructs = haul.constructs ?? [];
   return {
     ...profile,
     materials: addMaterials(profile.materials, haul),
@@ -124,6 +129,7 @@ export function stockHaul(profile: DelveProfile, haul: Haul): DelveProfile {
     manaDust: profile.manaDust + haul.dust,
     links: profile.links + haul.links,
     runes: sumKeys(profile.runes, haul.runes, sumTiers),
+    constructs: constructs.length > 0 ? [...profile.constructs, ...constructs] : profile.constructs,
     stats: { ...profile.stats, scrapEarned: profile.stats.scrapEarned + haul.scrap },
   };
 }

```

Apply to `packages/engine/src/loot/moveset.ts`:

```diff
@@ -15,29 +15,30 @@ import {
 } from '../types/ability.js';
 import type { ManaPair } from '../types/delve.js';
 import type { EquippedGear, GearItem, Moveset, Rarity } from '../types/gear.js';
-import { RARITY_ORDER } from '../types/gear.js';
 import type { ManaType } from '../types/mana.js';
-import type { RuneRef } from '../types/rune.js';
-import { runeFits, socketCap, socketsOf } from './runes.js';
+import { MAX_SOCKETS, type RuneRef } from '../types/rune.js';
+import { runeTierAt } from './drops.js';
+import { socketsOf } from './runes.js';
 
 /**
- * Weapon movesets (see the weapon movesets spec): which chains a weapon
- * carries, its base slots, its default moves, and a drop's extra slots.
+ * Weapon movesets (see the constructs spec §3): a weapon is a frame, with a
+ * class, a cast style and slots by skill, holding constructs; the pure parts
+ * live here: the slot table, the class rules, the default and plain fillings,
+ * a drop's rolls, a weapon's parts and the Move all preview. The profile ops
+ * live in `delve/moveset.ts` and `delve/constructs.ts`.
  */
 
-/** A weapon as its moveset sees it: its base, rarity and awakening (unarmed: base and rarity null). */
+/** A weapon as its moveset sees it: its base and rarity (unarmed: both null). Any `{ baseId, rarity }` pick, a `GearItem` included. */
 export interface MovesetOwner {
   baseId: string | null;
   rarity: Rarity | null;
-  /** An awakened rare (see the tutorial spec's Awaken). */
-  awakened?: boolean;
 }
 
-/** No weapon: it carries the basic chain alone, at the hero's own string. */
+/** No weapon: it holds the basic chain alone, at the hero's own string. */
 export const UNARMED: MovesetOwner = { baseId: null, rarity: null };
 
-/** Each ability slot's default form and payment: a Bolt, a Ward and a charged Nova. */
-export const DEFAULT_FORMS: Record<AbilitySlot, { form: FormId; payment: AbilityPayment }> = {
+/** Each ability slot's class-free default form and payment: a Bolt, a Ward and a charged Nova. */
+const DEFAULT_FORMS: Record<AbilitySlot, { form: FormId; payment: AbilityPayment }> = {
   primary: { form: 'bolt', payment: 'mana' },
   defensive: { form: 'ward', payment: 'mana' },
   ultimate: { form: 'nova', payment: 'charge' },
@@ -72,6 +73,36 @@ export function formAllowed(registry: DataRegistry, baseId: string | null, form:
   return own === 'both' || own === cls;
 }
 
+/** A weapon's basic string, the kinds of its default basic chain (unarmed, null: the hero's). */
+export function weaponString(registry: DataRegistry, baseId: string | null): readonly MoveKind[] {
+  const base = baseId ? registry.getGearBase(baseId).defaultChain : undefined;
+  return base ?? registry.getDelveBalance().hero.defaultChain;
+}
+
+/** The kinds a skill's default chain plays: its class default form's, or the weapon's basic string. */
+function defaultKinds(
+  registry: DataRegistry,
+  skill: ChainSkill,
+  baseId: string | null,
+): readonly MoveKind[] {
+  if (skill === 'basic') return weaponString(registry, baseId);
+  return registry.getForm(defaultForm(registry, skill, weaponClass(registry, baseId)).form)
+    .defaultChain;
+}
+
+/**
+ * The kind of a skill's default move at `index` (from 0): its default chain's
+ * (the class default form's, or for the basic chain the weapon's), medium past its end.
+ */
+export function defaultKind(
+  registry: DataRegistry,
+  skill: ChainSkill,
+  baseId: string | null,
+  index: number,
+): MoveKind {
+  return defaultKinds(registry, skill, baseId)[index] ?? 'medium';
+}
+
 /**
  * A skill's slots on `owner`, `[start, ceiling]` by its rarity
  * (`movesets.slots`; the constructs spec §3.2): the Basic's start its weapon's
@@ -109,35 +140,77 @@ export function plainConstruct(
   index: number,
   element: ManaType,
 ): Construct {
-  if (skill === 'basic') return { kind: defaultKind(registry, 'basic', owner.baseId, index), element };
+  const kind = defaultKind(registry, skill, owner.baseId, index);
+  if (skill === 'basic') return { kind, element };
   const { form } = defaultForm(registry, skill, weaponClass(registry, owner.baseId));
-  const kind = registry.getForm(form).defaultChain[index] ?? 'medium';
   return { kind, form, elements: [element] };
 }
 
-/** The skill a construct belongs to: a blow the Basic, a move its form's slot. */
-export function constructSkill(registry: DataRegistry, c: Construct): ChainSkill {
-  return 'form' in c ? registry.getForm(c.form).slot : 'basic';
-}
-
-/** Whether a construct is plain: no open socket and no rune (the constructs spec §3.3's auto-salvage). */
-export function isPlain(c: Construct): boolean {
-  return socketsOf(c).length === 0;
+/** A skill's default chain of `length` plain constructs, every one in `element`. */
+export function defaultChain<S extends ChainSkill>(
+  registry: DataRegistry,
+  skill: S,
+  baseId: string | null,
+  element: ManaType,
+  length: number,
+): Chains[S] {
+  const owner = { baseId, rarity: null };
+  const moves = Array.from({ length }, (_, i) =>
+    plainConstruct(registry, owner, skill, i, element),
+  );
+  if (skill === 'basic') return moves as Chains[S];
+  const { payment } = defaultForm(registry, skill as AbilitySlot, weaponClass(registry, baseId));
+  return { moves: moves as Move[], payment } as Chains[S];
 }
 
 /**
- * The uids of `weapon`'s constructs its class can't express (the constructs
- * spec §3.1's dormancy): the moves whose form isn't the class's or shared. A
- * blow is never dormant (a rune that doesn't fit the weapon's blows is dormant
- * on its own, in `runeKnobs`). A construct without a uid can't be named: none.
+ * A moveset for `owner` (the constructs spec §3.2, §3.5): each skill at its
+ * start (or `slots`), every slot holding a plain construct in `element`, no
+ * uids, `bought` all 0. A skill at 0 slots has no chain and no slots entry.
  */
-export function dormantUids(registry: DataRegistry, weapon: GearItem): Set<string> {
-  const out = new Set<string>();
-  const { chains } = movesetOf(registry, weapon);
-  for (const skill of CHAIN_SKILLS)
-    for (const m of chainMoves(chains[skill]))
-      if ('form' in m && m.uid && !formAllowed(registry, weapon.baseId, m.form)) out.add(m.uid);
-  return out;
+export function defaultMoveset(
+  registry: DataRegistry,
+  owner: MovesetOwner,
+  element: ManaType,
+  slots: Partial<Record<ChainSkill, number>> = {},
+): Moveset {
+  const n = (s: ChainSkill) => slots[s] ?? slotRange(registry, owner, s)[0];
+  const skills = CHAIN_SKILLS.filter((s) => n(s) > 0);
+  return {
+    chains: Object.fromEntries(
+      skills.map((s) => [s, defaultChain(registry, s, owner.baseId, element, n(s))]),
+    ) as Moveset['chains'],
+    slots: Object.fromEntries(skills.map((s) => [s, n(s)])),
+    bought: {},
+  };
+}
+
+/** A weapon's own moveset: its stored one, else its base defaults in its mana. */
+export function movesetOf(registry: DataRegistry, weapon: GearItem): Moveset {
+  return weapon.moveset ?? defaultMoveset(registry, weapon, weapon.mana);
+}
+
+/** A chain's moves, or its blows (none for a chain left out). */
+export function chainMoves(chain: Chains[ChainSkill] | undefined): Construct[] {
+  if (!chain) return [];
+  return Array.isArray(chain) ? chain : chain.moves;
+}
+
+/** An empty chain for `skill`: no blows, or no moves at the skill's default payment. */
+function emptyChain(
+  registry: DataRegistry,
+  owner: MovesetOwner,
+  skill: ChainSkill,
+): Chains[ChainSkill] {
+  if (skill === 'basic') return [];
+  const { payment } = defaultForm(registry, skill, weaponClass(registry, owner.baseId));
+  return { moves: [], payment };
+}
+
+/** `chain` with `moves` appended (a basic chain takes blows). */
+function withMoves(chain: Chains[ChainSkill], moves: Construct[]): Chains[ChainSkill] {
+  if (Array.isArray(chain)) return [...chain, ...(moves as Blow[])];
+  return { ...chain, moves: [...chain.moves, ...(moves as Move[])] };
 }
 
 /**
@@ -165,180 +238,40 @@ export function fillSlots(
     const added = Array.from({ length: Math.max(0, start - moves.length) }, (_, i) =>
       plainConstruct(registry, owner, skill, moves.length + i, element),
     );
-    (chains as Record<ChainSkill, unknown>)[skill] = Array.isArray(chain)
-      ? [...chain, ...(added as Blow[])]
-      : { ...chain, moves: [...chain.moves, ...(added as Move[])] };
+    (chains as Record<ChainSkill, unknown>)[skill] = withMoves(chain, added);
     slots[skill] = Math.max(have, start);
   }
   return { ...moveset, chains, slots };
 }
 
-/** An empty chain for `skill`: no blows, or no moves at the skill's default payment. */
-function emptyChain(registry: DataRegistry, owner: MovesetOwner, skill: ChainSkill): Chains[ChainSkill] {
-  if (skill === 'basic') return [];
-  const { payment } = defaultForm(registry, skill, weaponClass(registry, owner.baseId));
-  return { moves: [], payment };
-}
-
-/**
- * The skills `item` carries, by its rarity (`movesets.carries`), and the
- * Ultimate too once awakened (see the tutorial spec's Awaken); unarmed (null,
- * or `UNARMED`): the basic chain alone.
- */
-export function carriedSkills(
-  registry: DataRegistry,
-  item: Pick<MovesetOwner, 'rarity' | 'awakened'> | null,
-): readonly ChainSkill[] {
-  if (!item?.rarity) return ['basic'];
-  const carried = registry.getDelveBalance().movesets.carries[item.rarity];
-  if (!item.awakened || carried.includes('ultimate')) return carried;
-  return [...carried, 'ultimate'];
-}
-
 /**
- * The least rarity that carries `skill`, or null for one every rarity carries
- * (the balance's schema has the legendary carry all four, so some rarity does).
- */
-export function carriedFrom(registry: DataRegistry, skill: ChainSkill): Rarity | null {
-  const carries = registry.getDelveBalance().movesets.carries;
-  if (RARITY_ORDER.every((r) => carries[r].includes(skill))) return null;
-  return RARITY_ORDER.find((r) => carries[r].includes(skill)) ?? null;
-}
-
-/**
- * Why a weapon can't hold `skill`: "Carried by rare weapons and better" (the
- * locked tab's text, and the ops' refusal); the Ultimate adds ", or an
- * awakened rare" (`awaken`). The balance's schema keeps `carries` growing with
- * rarity; a skill every rarity carries (missing only from a hand-edited save)
- * reads "Not carried by this weapon".
- */
-export function carriedByText(registry: DataRegistry, skill: ChainSkill): string {
-  const from = carriedFrom(registry, skill);
-  if (!from) return 'Not carried by this weapon';
-  const text = `Carried by ${from} weapons and better`;
-  return skill === 'ultimate' ? `${text}, or an awakened rare` : text;
-}
-
-/** A weapon's basic string, the kinds of its default basic chain (unarmed, null: the hero's). */
-export function weaponString(registry: DataRegistry, baseId: string | null): readonly MoveKind[] {
-  const base = baseId ? registry.getGearBase(baseId).defaultChain : undefined;
-  return base ?? registry.getDelveBalance().hero.defaultChain;
-}
-
-/** The kinds a skill's default chain plays: its default form's, or the weapon's basic string. */
-function defaultKinds(
-  registry: DataRegistry,
-  skill: ChainSkill,
-  baseId: string | null,
-): readonly MoveKind[] {
-  if (skill !== 'basic') return registry.getForm(DEFAULT_FORMS[skill].form).defaultChain;
-  return weaponString(registry, baseId);
-}
-
-/**
- * The kind of a skill's default move at `index` (from 0): its default chain's
- * (the default form's, or for the basic chain the weapon's), medium past its end.
- */
-export function defaultKind(
-  registry: DataRegistry,
-  skill: ChainSkill,
-  baseId: string | null,
-  index: number,
-): MoveKind {
-  return defaultKinds(registry, skill, baseId)[index] ?? 'medium';
-}
-
-/** A skill's slots to start with: the basic chain's weapon string length (unarmed, the hero's), else 1. */
-export function baseSlots(
-  registry: DataRegistry,
-  baseId: string | null,
-  skill: ChainSkill,
-): number {
-  return skill === 'basic' ? defaultKinds(registry, 'basic', baseId).length : 1;
-}
-
-/** A skill's default chain of `length` moves, every one in `element`. */
-export function defaultChain<S extends ChainSkill>(
-  registry: DataRegistry,
-  skill: S,
-  baseId: string | null,
-  element: ManaType,
-  length: number,
-): Chains[S] {
-  const kinds = Array.from({ length }, (_, i) => defaultKind(registry, skill, baseId, i));
-  if (skill === 'basic') return kinds.map((kind) => ({ kind, element })) as Chains[S];
-  const { form, payment } = DEFAULT_FORMS[skill as AbilitySlot];
-  return {
-    moves: kinds.map((kind) => ({ kind, form, elements: [element] })),
-    payment,
-  } as Chains[S];
-}
-
-/**
- * A moveset for `owner`: each skill it carries at `slots` (its base slots
- * where left out), every slot holding its default move in `element`.
- */
-export function defaultMoveset(
-  registry: DataRegistry,
-  owner: MovesetOwner,
-  element: ManaType,
-  slots: Partial<Record<ChainSkill, number>> = {},
-): Moveset {
-  const skills = carriedSkills(registry, owner);
-  const n = (s: ChainSkill) => slots[s] ?? baseSlots(registry, owner.baseId, s);
-  return {
-    chains: Object.fromEntries(
-      skills.map((s) => [s, defaultChain(registry, s, owner.baseId, element, n(s))]),
-    ) as Moveset['chains'],
-    slots: Object.fromEntries(skills.map((s) => [s, n(s)])),
-  };
-}
-
-/** A weapon's own moveset: its stored one, else its base defaults in its mana. */
-export function movesetOf(registry: DataRegistry, weapon: GearItem): Moveset {
-  return weapon.moveset ?? defaultMoveset(registry, weapon, weapon.mana);
-}
-
-/** A weapon's extra slots: its slots past each chain's base, summed. */
-export function extraSlots(registry: DataRegistry, weapon: GearItem): number {
-  if (weapon.slot !== 'weapon') return 0;
-  const { slots } = movesetOf(registry, weapon);
-  return (Object.keys(slots) as ChainSkill[]).reduce(
-    (sum, s) => sum + slots[s]! - baseSlots(registry, weapon.baseId, s),
-    0,
-  );
-}
-
-/**
- * A weapon drop's moveset: its rarity's extra slots (`movesets.extraSlots`),
- * each on a chain it carries picked uniformly at random (never past the
- * chain's cap), every slot holding its default move in the item's mana.
+ * A weapon drop's moveset: its rarity's extra slots (`movesets.extraSlots`,
+ * free: not bought), each on a skill it has slots for, picked uniformly at
+ * random, never past the skill's ceiling (a drop never opens a skill), every
+ * slot holding a plain construct in the item's mana.
  */
 export function rollMoveset(
   registry: DataRegistry,
   item: Pick<GearItem, 'baseId' | 'rarity' | 'mana'>,
   rng: SeededRNG,
 ): Moveset {
-  const bal = registry.getDelveBalance();
-  const [least, most] = bal.movesets.extraSlots[item.rarity];
-  const skills = carriedSkills(registry, item);
-  const slots = Object.fromEntries(skills.map((s) => [s, baseSlots(registry, item.baseId, s)]));
+  const [least, most] = registry.getDelveBalance().movesets.extraSlots[item.rarity];
+  const slots: Partial<Record<ChainSkill, number>> = {};
+  for (const s of CHAIN_SKILLS) {
+    const [start] = slotRange(registry, item, s);
+    if (start > 0) slots[s] = start;
+  }
+  const skills = Object.keys(slots) as ChainSkill[];
   for (let extra = rng.nextInt(least, most); extra > 0; extra--) {
-    const open = skills.filter((s) => slots[s] < bal.chains.cap[s]);
+    const open = skills.filter((s) => slots[s]! < ceilingOf(registry, item, s));
     if (open.length === 0) break;
-    slots[open[rng.nextInt(0, open.length - 1)]]++;
+    slots[open[rng.nextInt(0, open.length - 1)]]!++;
   }
   return defaultMoveset(registry, item, item.mana, slots);
 }
 
-/** A chain's moves, or its blows (none for a chain left out). */
-function chainMoves(chain: Chains[ChainSkill] | undefined): (Move | Blow)[] {
-  if (!chain) return [];
-  return Array.isArray(chain) ? chain : chain.moves;
-}
-
 /** A move or blow copied, its elements and sockets too, so the copy never shares an array. */
-function copyMove<M extends Move | Blow>(m: M): M {
+function copyMove<M extends Construct>(m: M): M {
   const copy = { ...m };
   if ('elements' in copy) copy.elements = [...copy.elements];
   if (copy.runes) copy.runes = copy.runes.map((r) => r && { ...r });
@@ -351,11 +284,21 @@ function copyChain<C extends Chains[ChainSkill]>(chain: C): C {
   return { ...chain, moves: chain.moves.map(copyMove) };
 }
 
+/** `moveset` with every chain copied (`copyChain`), its slots and bought too. */
+function copyMoveset(moveset: Moveset): Moveset {
+  const chains: Moveset['chains'] = {};
+  for (const skill of CHAIN_SKILLS) {
+    const chain = moveset.chains[skill];
+    if (chain) (chains as Record<ChainSkill, unknown>)[skill] = copyChain(chain);
+  }
+  return { chains, slots: { ...moveset.slots }, bought: { ...moveset.bought } };
+}
+
 /**
  * A weapon drop's open sockets (see the runes spec): its rarity's count
- * (`runes.socketDrops`), each on a move or blow of the chains it carries
- * picked uniformly at random (never past the rarity's cap on a move), every
- * one empty. With none to open, `moveset` comes back as it is.
+ * (`runes.socketDrops`), each on a construct of its chains picked uniformly at
+ * random (never past `MAX_SOCKETS` on one), every one empty. With none to open,
+ * `moveset` comes back as it is.
  */
 export function rollSockets(
   registry: DataRegistry,
@@ -364,47 +307,102 @@ export function rollSockets(
   rng: SeededRNG,
 ): Moveset {
   const [least, most] = registry.getDelveBalance().runes.socketDrops[item.rarity];
-  const cap = socketCap(registry, item.rarity);
   let open = rng.nextInt(least, most);
   if (open === 0) return moveset;
-  const chains: Moveset['chains'] = {};
-  for (const skill of CHAIN_SKILLS) {
-    const chain = moveset.chains[skill];
-    if (chain) (chains as Record<ChainSkill, unknown>)[skill] = copyChain(chain);
-  }
-  const moves = CHAIN_SKILLS.flatMap((skill) => chainMoves(chains[skill]));
+  const copy = copyMoveset(moveset);
+  const moves = CHAIN_SKILLS.flatMap((skill) => chainMoves(copy.chains[skill]));
   for (; open > 0; open--) {
-    const room = moves.filter((m) => socketsOf(m).length < cap);
+    const room = moves.filter((m) => socketsOf(m).length < MAX_SOCKETS);
     if (room.length === 0) break;
     const m = room[rng.nextInt(0, room.length - 1)];
     m.runes = [...socketsOf(m), null];
   }
-  return { chains, slots: { ...moveset.slots } };
+  return copy;
+}
+
+/**
+ * A weapon drop's socketed rune (the constructs spec §3.5): at
+ * `runes.runeChance[rarity]`, one of its open empty sockets, picked uniformly
+ * at random, takes a rune uniform over the data at the tier the item level
+ * gives (`runeTierAt`, as a slain foe's). Drawn on its own fork after
+ * `rollSockets`; with no chance or no empty socket, `moveset` comes back as it is.
+ */
+export function rollSocketedRunes(
+  registry: DataRegistry,
+  item: Pick<GearItem, 'rarity' | 'ilvl'>,
+  moveset: Moveset,
+  rng: SeededRNG,
+): Moveset {
+  const chance = registry.getDelveBalance().runes.runeChance[item.rarity];
+  if (rng.next() >= chance) return moveset;
+  const copy = copyMoveset(moveset);
+  const empty = CHAIN_SKILLS.flatMap((skill) => chainMoves(copy.chains[skill])).flatMap((m) =>
+    socketsOf(m).flatMap((r, i) => (r === null ? [{ m, i }] : [])),
+  );
+  if (empty.length === 0) return moveset;
+  const { m, i } = empty[rng.nextInt(0, empty.length - 1)];
+  const runes = registry.getRunes();
+  const { id } = runes[rng.nextInt(0, runes.length - 1)];
+  m.runes = socketsOf(m).map((r, j) => (j === i ? { id, tier: runeTierAt(registry, item.ilvl, rng) } : r));
+  return copy;
+}
+
+/** The skill a construct belongs to: a blow the Basic, a move its form's slot. */
+export function constructSkill(registry: DataRegistry, c: Construct): ChainSkill {
+  return 'form' in c ? registry.getForm(c.form).slot : 'basic';
+}
+
+/** Whether a construct is plain: no open socket and no rune (the constructs spec §3.3's auto-salvage). */
+export function isPlain(c: Construct): boolean {
+  return socketsOf(c).length === 0;
+}
+
+/** Whether `weapon`'s class can play construct `c`: a blow always, a move by its form (`formAllowed`). */
+function expresses(registry: DataRegistry, baseId: string | null, c: Construct): boolean {
+  return !('form' in c) || formAllowed(registry, baseId, c.form);
 }
 
 /**
- * What a weapon gives back when it goes (salvaged, fused, rebuilt): a Link
- * for each extra slot and each open socket, and the runes in its sockets
- * (which leave by the parts rule). Other gear gives nothing. Salvage pays
- * only the Links past a forge's free extras (`salvageYield`).
+ * The uids of `weapon`'s constructs its class can't express (the constructs
+ * spec §3.1's dormancy): the moves whose form isn't the class's or shared. A
+ * blow is never dormant (a rune that doesn't fit the weapon's blows is dormant
+ * on its own, in `runeKnobs`). A construct without a uid can't be named: none.
+ */
+export function dormantUids(registry: DataRegistry, weapon: GearItem): Set<string> {
+  const out = new Set<string>();
+  const { chains } = movesetOf(registry, weapon);
+  for (const skill of CHAIN_SKILLS)
+    for (const m of chainMoves(chains[skill]))
+      if (m.uid && !expresses(registry, weapon.baseId, m)) out.add(m.uid);
+  return out;
+}
+
+/**
+ * What a weapon gives back when it goes (the constructs spec §3.3): a Link for
+ * each bought slot, the runes in its sockets, and its constructs. Other gear
+ * gives nothing.
  */
 export function weaponParts(
   registry: DataRegistry,
   weapon: GearItem,
-): { links: number; runes: RuneRef[] } {
-  if (weapon.slot !== 'weapon') return { links: 0, runes: [] };
-  const { chains } = movesetOf(registry, weapon);
-  const sockets = CHAIN_SKILLS.flatMap((skill) => chainMoves(chains[skill])).flatMap(socketsOf);
+): { links: number; runes: RuneRef[]; constructs: Construct[] } {
+  if (weapon.slot !== 'weapon') return { links: 0, runes: [], constructs: [] };
+  const { chains, bought } = movesetOf(registry, weapon);
+  const constructs = CHAIN_SKILLS.flatMap((skill) => chainMoves(chains[skill])).map(copyMove);
+  const sockets = constructs.flatMap(socketsOf);
   return {
-    links: extraSlots(registry, weapon) + sockets.length,
+    links: CHAIN_SKILLS.reduce((sum, s) => sum + (bought?.[s] ?? 0), 0),
     runes: sockets.filter((r): r is RuneRef => r !== null).map((r) => ({ ...r })),
+    constructs,
   };
 }
 
 /**
- * The hero's chains: the equipped weapon's moveset's; unarmed, a default
- * moveset at base slots (never stored) in the pair's primary, or fire before
- * the choice. A skill the weapon doesn't carry has no chain.
+ * The hero's chains as they play (the constructs spec §3.1, the one place
+ * dormancy is decided): the equipped weapon's chains with the constructs its
+ * class can't express left out and an ability chain left empty dropped (it
+ * plays as an uncarried skill); unarmed, a default moveset at the hero's
+ * string (never stored) in the pair's primary, or fire before the choice.
  */
 export function heroChains(
   registry: DataRegistry,
@@ -412,110 +410,81 @@ export function heroChains(
   pair: ManaPair,
 ): Partial<Chains> {
   const weapon = equipped.weapon;
-  if (weapon) return movesetOf(registry, weapon).chains;
-  return defaultMoveset(registry, UNARMED, pair.primary ?? 'fire').chains;
+  if (!weapon) return defaultMoveset(registry, UNARMED, pair.primary ?? 'fire').chains;
+  const { chains } = movesetOf(registry, weapon);
+  const out: Partial<Chains> = {};
+  for (const skill of CHAIN_SKILLS) {
+    const chain = chains[skill];
+    if (!chain) continue;
+    if (Array.isArray(chain)) {
+      out.basic = chain;
+      continue;
+    }
+    const live = chain.moves.filter((m) => expresses(registry, weapon.baseId, m));
+    if (live.length === 0) continue;
+    out[skill as AbilitySlot] = live.length === chain.moves.length ? chain : { ...chain, moves: live };
+  }
+  return out;
 }
 
-/** What moving one weapon's moveset onto another gives (see `movesetTransfer`). */
-export interface MovesetTransfer {
-  /** The target's moveset once the chains have moved onto it. */
+/** What Move all onto a weapon gives (`moveAllPreview`). */
+export interface MoveAllPreview {
+  /** The target's moveset once the worn weapon's constructs sit in its slots. */
   moveset: Moveset;
-  /** Extra slots that move: the price counts these. */
-  moved: number;
-  /** Open sockets that move (on the moves the target keeps, within its cap): the price counts these too. */
-  sockets: number;
-  /**
-   * Links back: the extras past the cap, the extras of chains the target
-   * can't carry, and the target's own extras on the chains replaced; and one
-   * for each open socket that doesn't move (past the target's cap, on a move
-   * the transfer drops, or the target's own on the chains replaced).
-   */
-  links: number;
-  /**
-   * The runes that leave, by the parts rule: those in the sockets that don't
-   * move, and a kept blow's rune that doesn't fit the target weapon (its socket moves, empty).
-   */
-  runes: RuneRef[];
-  /** Scrap: `transferScrap` for each extra slot and each open socket that moves. */
-  scrap: number;
+  /** The constructs that go to the bag: the worn weapon's past the target's slots, and the target's own on the chains replaced. */
+  toBag: Construct[];
+  /** The uids of the moved constructs the target's class can't express (they sit in their slots, dormant). */
+  dormant: string[];
+  /** The worn weapon's moveset refilled plain (`fillSlots`, its constructs without uids). */
+  old: Moveset;
 }
 
 /**
- * `source`'s moveset moved onto `target`: each chain the target carries keeps
- * its extra slots over the target's base (at most the cap, the rest back as
- * Links), its moves past the new slots dropped from the end; a chain the
- * target can't carry stays behind, its extras back as Links; the target's own
- * extras on the chains replaced come back as Links; and a skill only the
- * target carries keeps the target's chain. Sockets go with their moves (see
- * the runes spec): a kept move's sockets past the target's cap come back from
- * the end, and so do all of a dropped move's and of the target's replaced
- * moves, each as a Link with its rune leaving; a kept blow's rune that
- * doesn't fit the target weapon leaves too, its socket staying open.
+ * Move all (the constructs spec §3.3), pure: the target's moveset once the worn
+ * weapon's constructs sit in its slots slot for slot (each chain's payment with
+ * them), `toBag` the constructs past its slots and the target's own on the
+ * chains replaced, `dormant` the uids its class can't express (they stay, in
+ * their slots), and `old` the worn weapon's moveset emptied and refilled plain
+ * to its starts (its bought and extra slots kept). A target skill the worn
+ * weapon moves no construct into (no chain, or a skill the target has no slots
+ * for) keeps the target's own constructs. `compareItem`'s 'home' value, the
+ * Loadout's verdicts and the autopilot read it and never mint; only B2's
+ * `moveAll` mints the refill's uids and bumps `nextUid`.
  */
-export function movesetTransfer(
+export function moveAllPreview(
   registry: DataRegistry,
-  source: GearItem,
+  worn: GearItem,
   target: GearItem,
-): MovesetTransfer {
-  const bal = registry.getDelveBalance();
-  const from = movesetOf(registry, source);
-  const onto = movesetOf(registry, target);
-  const carried = carriedSkills(registry, target);
-  const cap = socketCap(registry, target.rarity);
-  const chains = { ...onto.chains };
-  const slots = { ...onto.slots };
-  let moved = 0;
-  let sockets = 0;
-  let links = 0;
-  const runes: RuneRef[] = [];
-  /** Sockets that don't move: a Link each, their runes leaving. */
-  const leave = (gone: (RuneRef | null)[]) => {
-    links += gone.length;
-    for (const r of gone) if (r) runes.push({ ...r });
-  };
-  /** A move the target keeps: its sockets within the cap, and a blow's runes that fit the target. */
-  const keep = <M extends Move | Blow>(m: M): M => {
-    const copy = copyMove(m);
-    const own = socketsOf(copy);
-    if (own.length === 0) return copy;
-    leave(own.slice(cap));
-    copy.runes = own.slice(0, cap).map((r) => {
-      if (!r || 'form' in copy) return r;
-      const def = registry.findRune(r.id);
-      if (def && runeFits(def, { weapon: target.baseId, kind: copy.kind })) return r;
-      runes.push(r);
-      return null;
-    });
-    sockets += copy.runes.length;
-    return copy;
-  };
+): MoveAllPreview {
+  const from = movesetOf(registry, worn);
+  const onto = copyMoveset(movesetOf(registry, target));
+  const toBag: Construct[] = [];
+  const dormant: string[] = [];
+  const emptied: Moveset = { chains: {}, slots: { ...from.slots }, bought: { ...from.bought } };
   for (const skill of CHAIN_SKILLS) {
     const chain = from.chains[skill];
     if (!chain) continue;
-    const extra = from.slots[skill]! - baseSlots(registry, source.baseId, skill);
-    if (!carried.includes(skill)) {
-      links += extra;
-      for (const m of chainMoves(chain)) leave(socketsOf(m));
+    const moves = chainMoves(chain).map(copyMove);
+    (emptied.chains as Record<ChainSkill, unknown>)[skill] = withMoves(
+      emptyChain(registry, worn, skill),
+      [],
+    );
+    const room = onto.slots[skill] ?? 0;
+    if (room === 0 || moves.length === 0) {
+      toBag.push(...moves);
       continue;
     }
-    const base = baseSlots(registry, target.baseId, skill);
-    const n = Math.min(base + extra, bal.chains.cap[skill]);
-    links += base + extra - n + (onto.slots[skill]! - base);
-    moved += n - base;
-    for (const m of chainMoves(onto.chains[skill])) leave(socketsOf(m));
-    for (const m of chainMoves(chain).slice(n)) leave(socketsOf(m));
-    const kept = Array.isArray(chain)
-      ? chain.slice(0, n).map(keep)
-      : { ...chain, moves: chain.moves.slice(0, n).map(keep) };
-    (chains as Record<ChainSkill, unknown>)[skill] = kept;
-    slots[skill] = n;
+    toBag.push(...chainMoves(onto.chains[skill]));
+    const placed = moves.slice(0, room);
+    toBag.push(...moves.slice(room));
+    for (const m of placed)
+      if (m.uid && !expresses(registry, target.baseId, m)) dormant.push(m.uid);
+    (onto.chains as Record<ChainSkill, unknown>)[skill] = Array.isArray(chain)
+      ? placed
+      : { ...chain, moves: placed };
   }
-  return {
-    moveset: { chains, slots },
-    moved,
-    sockets,
-    links,
-    runes,
-    scrap: (moved + sockets) * bal.movesets.transferScrap,
-  };
+  // A kept chain's payment travels with its constructs (`{ ...chain, moves }` above); an emptied
+  // old chain keeps the worn weapon's payment only where B2's `moveAll` says so: here the default.
+  const old = fillSlots(registry, worn, emptied, worn.mana);
+  return { moveset: onto, toBag, dormant, old };
 }

```

Apply to `packages/engine/src/loot/runes.ts`:

```diff
@@ -1,7 +1,6 @@
 import type { DataRegistry } from '../data/registry.js';
 import type { AbilityPayment, Blow, FormId, KnobsData, Move } from '../types/ability.js';
 import type { HeroStats } from '../types/delve.js';
-import type { Rarity } from '../types/gear.js';
 import type { ManaType } from '../types/mana.js';
 import {
   MAX_SOCKETS,
@@ -189,11 +188,6 @@ export function loadText(registry: DataRegistry, load: number, payment?: Ability
   return `${pct(load)} cost`;
 }
 
-/** Most sockets a move may open on a weapon of `rarity` (unarmed, null: 0). */
-export function socketCap(registry: DataRegistry, rarity: Rarity | null): number {
-  return rarity ? registry.getDelveBalance().runes.socketCap[rarity] : 0;
-}
-
 /** The price of a move's next socket when it has `open`; null at `MAX_SOCKETS`. */
 export function socketPrice(
   registry: DataRegistry,
@@ -238,4 +232,4 @@ export function socketsOf(m: Move | Blow): (RuneRef | null)[] {
 }
 
 export { rollRuneDrop, runeTierAt } from './drops.js';
-export { rollSockets, weaponParts } from './moveset.js';
+export { rollSocketedRunes, rollSockets, weaponParts } from './moveset.js';

```

Apply to `packages/engine/src/loot/salvage-yield.ts`:

```diff
@@ -8,7 +8,7 @@ import { salvageDust } from '../delve/pair.js';
 import { applyQuestEvents } from '../delve/quests.js';
 import { settleParts, type SetChainsOptions } from '../delve/runes.js';
 import { addHaul, addMaterial, emptyHaul, shardTiersOf, stockHaul } from './materials.js';
-import { extraSlots, weaponParts } from './moveset.js';
+import { weaponParts } from './moveset.js';
 import { salvageValue } from './smithing.js';
 
 /**
@@ -30,18 +30,11 @@ function salvageTier(registry: DataRegistry, stat: HeroStatKey, roll: number): n
 }
 
 /**
- * A weapon's Links on salvage: one for each extra slot and open socket past the
- * free ones a forge of its rarity grants (`crafting.weaponExtras`), dropped or
- * forged alike, so forging then salvaging never makes Links.
+ * What salvaging `item` could give (the Loadout's preview). A weapon's Links
+ * are one per bought slot (`weaponParts`; the constructs spec §3.3): free extra
+ * slots and open sockets give nothing, so forging or finding a weapon and
+ * melting it mints no Links.
  */
-function salvageLinks(registry: DataRegistry, item: GearItem, partLinks: number): number {
-  if (item.slot !== 'weapon') return 0;
-  const free = registry.getDelveBalance().crafting.weaponExtras[item.rarity];
-  const slots = extraSlots(registry, item);
-  return Math.max(0, slots - free.slots) + Math.max(0, partLinks - slots - free.sockets);
-}
-
-/** What salvaging `item` could give (the Loadout's preview). */
 export function salvageYield(
   registry: DataRegistry,
   profile: DelveProfile,
@@ -57,12 +50,14 @@ export function salvageYield(
   return {
     scrap: salvageValue(registry, item),
     dust: salvageDust(registry, item, profile.pair),
-    links: salvageLinks(registry, item, parts.links),
+    links: parts.links,
     shards,
     extraShard: shards.length > 1 ? registry.getDelveBalance().crafting.salvageExtraShard : 0,
     pattern: profile.patterns.includes(item.baseId) ? null : item.baseId,
     essence,
     runes: parts.runes,
+    // B2 sends them to the bag; in Phase A they leave with the weapon as before.
+    constructs: [],
   };
 }
 
@@ -125,5 +120,6 @@ export function applySalvage(
     essence: y.essence,
     runes: settled.runes,
     destroyed: settled.destroyed,
+    constructs: [],
   };
 }

```

Apply to `packages/engine/src/types/ability.ts`:

```diff
@@ -182,6 +182,8 @@ export interface Knobs {
   cleave: number;
   /** A cast style's trait: shots home toward foes, radians a second (the wand's; 0: none). */
   homing: number;
+  /** A cast style's trait: added to `chains.stepBonus` a chain step (the sword's; B1 reads it in `stepBonus()`). */
+  stepBonus: number;
 }
 
 /** Knobs as data sets them (elements, fusions, runes): partial, `pierce` true for all. */

```

Apply to `packages/engine/src/types/arpg.ts`:

```diff
@@ -104,6 +104,8 @@ export type StyleLook = 'blade' | 'crescent' | 'hatchet' | 'stone' | 'orb' | 'sp
 /** A weapon's cast style (the constructs spec §4): how it expresses every ability form. */
 export interface CastStyle {
   name: string;
+  /** The trait as the player reads it ("Shots pierce one foe"): the item header's line. */
+  text: string;
   numbers: StyleNumbers;
   motion: StyleMotion;
   /** Merged first, like a built-in rune that costs nothing. */

```

Apply to `packages/engine/src/types/crafting.ts`:

```diff
@@ -1,4 +1,4 @@
-import type { ChainSkill } from './ability.js';
+import type { ChainSkill, Construct, WeaponClass } from './ability.js';
 import type { MonsterKind } from './arpg.js';
 import type { DelveProfile } from './delve.js';
 import type { GearSlot, HeroStatKey, Rarity } from './gear.js';
@@ -55,6 +55,8 @@ export interface Haul extends MaterialsPouch {
   dust: number;
   links: number;
   runes: RunePouch;
+  /** Constructs a weapon salvaged mid-dive gave (the constructs spec §3.3), lost with the haul. */
+  constructs: Construct[];
 }
 
 /** One material pickup's kind: a bar, a flux, a shard, an essence, Mana Dust or Links. */
@@ -128,10 +130,13 @@ export interface ForgePreview {
   legendary: { id: string; band: [number, number]; range: [number, number] } | null;
   /** What it costs besides the bar, flux, essence and shards it consumes. */
   price: { scrap: number; dust: number };
-  /** A weapon's carried skills, each one's extra slots past its base, and its open sockets (S7). */
+  /**
+   * A weapon's class, each skill's slots against its ceiling (a skill at 0 slots listed with its
+   * ceiling, so the bench can show "Defensive 0 / 1") and its open sockets (the constructs spec §3.5).
+   */
   weapon: {
-    carries: ChainSkill[];
-    slots: Partial<Record<ChainSkill, number>>;
+    class: WeaponClass;
+    slots: Record<ChainSkill, [slots: number, ceiling: number]>;
     sockets: number;
   } | null;
   refused: ForgeRefusal | null;
@@ -154,6 +159,8 @@ export interface SalvageYield {
   essence: string | null;
   /** A weapon's socketed runes, which go by the pull rule. */
   runes: RuneRef[];
+  /** A weapon's constructs, which go to the bag (the constructs spec §3.3; B2 fills it: empty in A). */
+  constructs: Construct[];
 }
 
 /** What one salvage gave (`applySalvage`): mid-dive into the floor's haul, at the Anvil into the stockpile. */
@@ -167,6 +174,8 @@ export interface SalvageResult {
   essence: string | null;
   runes: RuneRef[];
   destroyed: RuneRef[];
+  /** The constructs sent to the bag, or mid-dive the haul (B2 fills it: empty in A). */
+  constructs: Construct[];
 }
 
 // ── Data (crafting.json) ───────────────────────────────────────────────────
@@ -218,8 +227,8 @@ export interface CraftingBalance {
   forgeScrap: Record<Rarity, number>;
   /** Mana Dust to forge in an element outside the pair. */
   offPairDust: number;
-  /** A forged weapon's extra slots and open sockets, by rarity (placed as the spec's S7 says). */
-  weaponExtras: Record<Rarity, { slots: number; sockets: number }>;
+  /** A forged weapon's free extra slots by rarity (the Primary's first, then Basic, Ultimate, Defensive; not bought). */
+  weaponExtras: Record<Rarity, { slots: number }>;
   /** A hone's scrap: this × `forge.rarityCostMult` × `honeGrowth` ^ hones × `scrapLevelFactor(ilvl)`. */
   honeScrap: number;
   honeGrowth: number;
@@ -241,15 +250,6 @@ export interface CraftingBalance {
   shardBench: { scrap: number; dust: number };
   /** The share of a dive's banked materials a death or an abandon loses. */
   deathLoss: number;
-  /** Awaken's price, its scrap before `scrapLevelFactor(ilvl)` (see the tutorial spec). */
-  awaken: AwakenPrice;
-}
-
-/** What awakening a rare weapon costs (`awakenPrice`): epic flux, Links and scrap. */
-export interface AwakenPrice {
-  epicFlux: number;
-  links: number;
-  scrap: number;
 }
 
 export interface DropsBalance {

```

## Chunk 15: Task 4 — The switch: constructs with uids, the slot table, Open a skill, Move all's preview, runes on any weapon (continued)

Apply to `packages/engine/src/types/delve.ts`:

```diff
@@ -3,6 +3,7 @@ import type { ManaMap, ManaType } from './mana.js';
 import type {
   AbilitySlot,
   ChainSkill,
+  Construct,
   FormId,
   Knobs,
   KnobsData,
@@ -585,8 +586,6 @@ export interface DelveBalance {
   };
   /** Weapon movesets: which chains a weapon carries, its slots and their prices (see the weapon movesets spec). */
   movesets: {
-    /** The chains a weapon of each rarity carries (unarmed: basic and primary). */
-    carries: Record<Rarity, ChainSkill[]>;
     /** Each rarity's slots by skill: `[start, ceiling]` (the Basic's start is the weapon's string; the constructs spec §3.2). */
     slots: Record<Rarity, Record<ChainSkill, [number, number]>>;
     /** Extra slots a weapon drop rolls, least and most, by rarity (free: not bought). */
@@ -601,15 +600,11 @@ export interface DelveBalance {
     editDust: number;
     /** Mana Dust a move's changed elements cost, or a new move's elements that no old move has. */
     elementDust: number;
-    /** Scrap a transfer costs for each extra slot that moves. */
-    transferScrap: number;
     /** Mana Dust salvaging a construct gives (the constructs spec §3.3 gives none: 0 as shipped; the key exists for tuning). */
     salvageDust: number;
   };
   /** Runes: sockets and their prices, the pull rule, fusing, drops and the knobs' numbers (see the runes spec). */
   runes: {
-    /** Most sockets a move may open, by its weapon's rarity (at most `MAX_SOCKETS`). */
-    socketCap: Record<Rarity, number>;
     /** Chance a weapon drop's open socket holds a rune (the constructs spec §3.5), by rarity. */
     runeChance: Record<Rarity, number>;
     /** Links the next socket costs, by the sockets the move already has. */
@@ -900,6 +895,11 @@ export interface DelveProfile {
   diveCount: number;
   forgeCount: number;
   nextUid: number;
+  /**
+   * The constructs' own counter (`c<n>`, `mintUid`): apart from the items' `nextUid`, which the
+   * floor's drops and RNG streams key on, so when pickups bank never re-keys an item.
+   */
+  nextConstructUid: number;
   equipped: EquippedGear;
   bag: GearItem[];
   scrap: number;
@@ -916,6 +916,10 @@ export interface DelveProfile {
   links: number;
   /** Loose runes: counts by id and tier (see the runes spec). */
   runes: RunePouch;
+  /** The move bag (the constructs spec §3.1): every construct not in a weapon's slot, each with a uid. */
+  constructs: Construct[];
+  /** A plain construct (no socket, no rune) displaced into the bag is deleted (the constructs spec §3.3). */
+  autoSalvagePlain: boolean;
   /** Bars, flux, shards and essences: the stockpile at the Anvil (see the crafting spec). */
   materials: MaterialsPouch;
   /** The bases the hero can forge: learned from the start, from salvage and from pattern drops. */

```

Apply to `packages/engine/src/types/gear.ts`:

```diff
@@ -127,19 +127,21 @@ export interface GearItem {
   /** Number of hones performed — drives escalating hone cost (see the crafting spec). */
   hones: number;
   locked: boolean;
-  /** Weapons: the chains the weapon carries and their slots (see the weapon movesets spec). */
+  /** Weapons: the chains the weapon holds and their slots (see the constructs spec). */
   moveset?: Moveset;
-  /** A rare weapon awakened to carry the Ultimate too (see the tutorial spec's Awaken). */
-  awakened?: boolean;
 }
 
 /**
- * A weapon's moveset: a chain for each skill its rarity carries, each holding
- * 1 to `slots[skill]` moves; a skill it doesn't carry has neither.
+ * A weapon's moveset (the constructs spec §3.1–3.2): a chain for each skill
+ * with slots, each holding 0 to `slots[skill]` constructs (the Basic at least
+ * 1); `slots` the slots it has, `bought` how many of each were bought with
+ * Links or Open a skill (free extra slots are not), which a salvage refunds.
+ * `chains[skill]` exists exactly when `slots[skill] > 0`.
  */
 export interface Moveset {
   chains: Partial<Chains>;
   slots: Partial<Record<ChainSkill, number>>;
+  bought: Partial<Record<ChainSkill, number>>;
 }
 
 export type EquippedGear = Partial<Record<GearSlot, GearItem>>;

```

Apply to `packages/engine/src/types/rune.ts`:

```diff
@@ -1,4 +1,4 @@
-import type { FormId, MoveKind, ChainSkill, KnobsData } from './ability.js';
+import type { FormId, MoveKind, KnobsData } from './ability.js';
 
 /**
  * Runes (see the runes spec): pouch items socketed on a move or a basic blow,
@@ -53,9 +53,6 @@ export type RunePouch = Record<RuneId, number[]>;
 /** What a pull does: the rune is destroyed, or it costs scrap and goes back to the pouch. */
 export type UnsocketMode = 'destroy' | 'pay';
 
-/** For each chain, the saved move index each new move came from (null: a new move). */
-export type ChainOrigins = Partial<Record<ChainSkill, (number | null)[]>>;
-
 /** What a rune is socketed on: an ability move's form, or a basic blow on a weapon. */
 export type RuneTarget =
   | { form: FormId }

```

Apply to `packages/engine/src/types/tutorial.ts`:

```diff
@@ -1,3 +1,4 @@
+import type { ChainSkill } from './ability.js';
 import type { DropKind } from './arpg.js';
 import type { MaterialRef } from './crafting.js';
 import type { StopKind } from './delve.js';
@@ -64,7 +65,8 @@ export const TUTORIAL_TRIGGERS = [
   'equip',
   'setChains',
   'salvage',
-  'transfer',
+  'moveAll',
+  'openSkill',
   'hone',
 ] as const;
 export type TutorialTriggerType = (typeof TUTORIAL_TRIGGERS)[number];
@@ -90,7 +92,9 @@ export type TutorialOnlyEvent =
   | { type: 'equip'; slot: GearSlot }
   | { type: 'setChains' }
   | { type: 'salvage'; slot: GearSlot }
-  | { type: 'transfer' }
+  /** Move all (the constructs spec §3.3, in Transfer's place) and Open a skill (in Awaken's). */
+  | { type: 'moveAll' }
+  | { type: 'openSkill'; skill: ChainSkill }
   | { type: 'hone' }
   | { type: 'skipStep' };
 

```

- [ ] **Step 4: Typecheck and run them: green**

```bash
cd /c/Projects/alloy-constructs-a
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-constructs-a-switch.test.ts tests/delve-constructs-a-data.test.ts tests/delve-constructs-a-model.test.ts tests/delve-movesets.test.ts tests/delve-open-skill-op.test.ts tests/delve-open-skill-bot.test.ts tests/delve-tutorial-slots.test.ts tests/delve-tutorial-balance.test.ts tests/delve-profile-abilities.test.ts tests/delve-runes.test.ts tests/delve-runes-contract.test.ts tests/delve-pair.test.ts tests/delve-stops.test.ts tests/delve-tutorial-runner-rule.test.ts tests/delve-tutorial-runner-script.test.ts tests/delve-tutorial-review.test.ts tests/delve-tutorial-floors-play.test.ts tests/delve-tutorial-floors-drops.test.ts tests/delve-tutorial-contract.test.ts tests/delve-rune-power.test.ts tests/delve-rune-costs.test.ts tests/delve-forge.test.ts tests/delve-salvage-yield.test.ts tests/delve-crafting-data.test.ts tests/delve-dive.test.ts tests/delve-chains.test.ts tests/delve-banking.test.ts tests/ability-resolve.test.ts tests/delve-materials.test.ts tests/delve-dps-sim.test.ts tests/delve-autopilot-crafting.test.ts --reporter=dot)
(cd packages/engine && npx vitest run tests/delve-pacing.test.ts tests/delve-pacing-robust.test.ts tests/delve-pacing-pairs.test.ts --reporter=dot)
(cd packages/engine && npx vitest run --reporter=dot)
```

Expected: no type errors; the first run **Test Files 31 passed (31)** (`delve-constructs-a-switch` 18, `delve-movesets` 52, `delve-runes` 37, `delve-open-skill-op` 5, `delve-open-skill-bot` 3, `delve-tutorial-slots` 4; `delve-rune-power`'s pins: the fire starter `{ dps: 42.61095657127015, ehp: 210.61412635492272, power: 947 }`, earth `{ 39.590204171370964, 239.33423449423037, 973 }`, storm `{ 46.532077687802406, 210.61412635492272, 990 }`, shadow `{ 39.590204171370964, 210.61412635492272, 913 }`, the archer `{ 378.9112929933396, 198.09056273093927, 2740 }`, the runed Lances `{ 134.34157473298708, 162.01086642686363, 1475 }`; `delve-rune-costs`' no-chains case `177.7613550749895` and `1665`); the pacing run **Test Files 3 passed (3)** (about 12 minutes: the rails hold with the bot wearing its forged weapons); the whole suite as Verification lists it: its only failures are the 40 `delve-tutorial-bot.test.ts` runs, each `skipped: "l2-transfer"` (D1's: the lesson's Move all is B2's op). On the scratch copy the whole suite ran once, after Task 5 (Verification has its counts); `delve-rooms-world.test.ts > a furnished floor > hides packs in foliage…` times out at 5 s when the suite runs beside another heavy process (it passes alone and in a quiet run).

- [ ] **Step 5: The fingerprint**

```bash
cd /c/Projects/alloy-constructs-a
P=C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/1d6bb288-c64f-43d2-9587-234f3b95983f/scratchpad
cp $P/constructs-a-probe.test.ts packages/engine/tests/zz-probe.test.ts
(cd packages/engine && PROBE_OUT=$P/constructs-a-task4.json npx vitest run tests/zz-probe.test.ts --reporter=dot)
rm packages/engine/tests/zz-probe.test.ts
node $P/cmp.cjs $P/constructs-a-before.json $P/constructs-a-task4.json
```

Expected: `Tests 1 passed`, then `FINGERPRINT_CHANGED` with every run moved: this task changes play. `constructs-a-task4.json` is the new baseline (its content is under Verification); Task 5 compares against it.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-constructs-a
git add packages/engine
git commit -q -F - <<'EOF'
feat(delve): the switch: constructs with uids, the slot table, Open a skill, Move all's preview, runes on any weapon

Every move and blow is a construct with a uid (`profile.nextConstructUid`,
minted on a new save, a forge, a bank, an Apply and the mana choice); the
weapon's skills come from the slot table (`movesets.slots`, a chain where a
skill starts above 0; `bought` counts the slots paid for, a Link each on
salvage); Open a skill (`openSkill`, `openSkillPrice`) takes Awaken's place;
the forge's weapon preview shows class, slots and ceilings; `moveAllPreview`
values a weapon as a home (`compareItem`); a weapon drop may roll one socketed
rune (`rollSocketedRunes`, `runeChance`); every construct takes up to
MAX_SOCKETS on any weapon; the pull rule pays as shipped; Detonate leads
runes.json; `heroChains` decides dormancy (a form the class can't express);
`setChains` prices by uid and refuses off-class forms; `fitMovesets` resets a
save that breaks the uid rules; `delve/constructs.ts` lays `draftRefusal` and
the B2 stubs; the tutorial's `transfer` trigger is `moveAll` (D1 rewires the
lesson); the bot wears its best bag weapon as it is until D1's Move all.
Every test of a retired rule is rewritten for the new one.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git log --oneline -1
```

## Chunk 16: Task 5 — Save v14: every saved construct carries its uid

### Task 5: Save v14: every saved construct carries its uid

`DelveProfile.version` 14 (the type, `createDelveProfile`, `parseDelveProfile`'s gate and the schema's literal); the save schema requires a uid on every construct of a weapon's chains, the bag and a haul (`SavedMoveSchema`, `SavedBlowSchema`, `SavedChainSchema`; the exported `MoveSchema`, `BlowSchema` and `ChainSchema` keep it optional for the Training Grounds' sandbox); a version 13 save resets, a v14 save with an unminted construct is refused (null). The tests' version literals move to 14 and their unminted fixtures are minted (`mintMoveset`). The fingerprint is identical to Task 4's.

**Files:**
- Modify: `packages/engine/src/delve/profile-schema.ts`
- Modify: `packages/engine/src/delve/profile.ts`
- Modify: `packages/engine/src/types/delve.ts`
- Modify: `packages/engine/tests/delve-boons-a-save.test.ts`
- Create: `packages/engine/tests/delve-constructs-a-save.test.ts`
- Modify: `packages/engine/tests/delve-constructs-a-switch.test.ts`
- Modify: `packages/engine/tests/delve-dive.test.ts`
- Modify: `packages/engine/tests/delve-maps-save.test.ts`
- Modify: `packages/engine/tests/delve-movesets.test.ts`
- Modify: `packages/engine/tests/delve-pair.test.ts`
- Modify: `packages/engine/tests/delve-profile-abilities.test.ts`
- Modify: `packages/engine/tests/delve-quests-save.test.ts`
- Modify: `packages/engine/tests/delve-room-save.test.ts`
- Modify: `packages/engine/tests/delve-runes-contract.test.ts`
- Modify: `packages/engine/tests/delve-save-v8.test.ts`
- Modify: `packages/engine/tests/delve-tutorial-save.test.ts`

- [ ] **Step 1: The failing tests** — the new test files in full, and the rewritten ones as diffs (13 files)

Apply to `packages/engine/tests/delve-boons-a-save.test.ts`:

```diff
@@ -5,7 +5,7 @@ import type { Buff } from '../src/types/boon.js';
 import type { DelveProfile } from '../src/types/delve.js';
 import { registry } from './fixtures/arena.js';
 
-// See the boons spec, "4. The stop" (Save): version 13; any other version resets.
+// See the boons spec, "4. The stop" (Save): version 14 since the constructs; any other version resets.
 
 const KEEN: Buff = { boon: 'keen_edge', tier: 2, effect: { damage: 0.15 } };
 const ECHO: Buff = {
@@ -15,9 +15,9 @@ const ECHO: Buff = {
 };
 
 describe('save v13', () => {
-  it('a new save is version 13, and a dive with boons and a boons stop round-trips', () => {
+  it('a new save is version 14, and a dive with boons and a boons stop round-trips', () => {
     const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
-    expect(p0.version).toBe(13);
+    expect(p0.version).toBe(14);
     const diving = startDive(registry, p0, 1);
     const p: DelveProfile = {
       ...diving,

```

Create `packages/engine/tests/delve-constructs-a-save.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { startDive } from '../src/delve/dive.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import { generateItem } from '../src/loot/item-generator.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { DelveProfile } from '../src/types/delve.js';

// The constructs spec §3.1 (Save): version 14; every saved construct carries its uid; a save of
// any other version resets (no migration, as ever).

const registry = createDefaultRegistry();
const json = (x: unknown) => JSON.parse(JSON.stringify(x));

describe('save v14', () => {
  it('a new save is version 14, its constructs minted, and round-trips, mid-dive too', () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    expect(p.version).toBe(14);
    const sword = p.equipped.weapon!.moveset!;
    const uids = [...sword.chains.basic!, ...sword.chains.primary!.moves].map((c) => c.uid);
    expect(uids).toHaveLength(5);
    expect(new Set(uids).size).toBe(5);
    expect(uids.every((u) => /^c\d+$/.test(u!))).toBe(true);
    // The kit's sword is minted, then rebuilt and minted again by the mana choice: c5 to c9.
    expect(p.nextConstructUid).toBe(10);
    expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p });
    const diving = startDive(registry, p, 1);
    expect(parseDelveProfile(registry, json(diving))).toEqual({ profile: diving });
  });

  it('a version 13 save resets; a saved construct without its uid, worn, in the bag or in the move bag, is refused', () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    expect(parseDelveProfile(registry, json({ ...p, version: 13 }))).toEqual({ reset: true });
    const sword = p.equipped.weapon!;
    const strip = (c: { uid?: string }) => {
      const { uid: _u, ...rest } = c;
      return rest;
    };
    const chains = sword.moveset!.chains;
    const bare = {
      ...sword,
      moveset: {
        ...sword.moveset!,
        chains: { ...chains, primary: { ...chains.primary!, moves: chains.primary!.moves.map(strip) } },
      },
    };
    expect(parseDelveProfile(registry, json({ ...p, equipped: { ...p.equipped, weapon: bare } }))).toBeNull();
    const bagged = generateItem(
      registry,
      { uid: 'w2', ilvl: 2, rarity: 'uncommon', slot: 'weapon', baseId: 'axe', mana: 'fire' },
      new SeededRNG(2),
    );
    expect(parseDelveProfile(registry, json({ ...p, bag: [bagged] }))).toBeNull(); // unminted
    const loose: DelveProfile = { ...p, constructs: [strip(chains.primary!.moves[0]) as never] };
    expect(parseDelveProfile(registry, json(loose))).toBeNull();
    // A blow without its uid is refused the same way.
    const blows = { ...sword, moveset: { ...sword.moveset!, chains: { ...chains, basic: chains.basic!.map(strip) } } };
    expect(parseDelveProfile(registry, json({ ...p, equipped: { ...p.equipped, weapon: blows } }))).toBeNull();
  });
});

```

Apply to `packages/engine/tests/delve-constructs-a-switch.test.ts`:

```diff
@@ -331,11 +331,10 @@ describe('the bag, the haul and the load', () => {
     expect(parseDelveProfile(registry, json(overBought))).toEqual({ reset: true });
     const past = { ...p, equipped: { ...p.equipped, weapon: { ...sword, moveset: { ...m, slots: { ...m.slots, primary: 1 } } } } };
     expect(parseDelveProfile(registry, json(past))).toBeNull(); // the schema itself: a chain past its slots
-    // A save without uids loads: they are minted (v14 requires them).
+    // A saved construct without its uid is refused (save v14).
     const bare = json(p);
     for (const b of bare.equipped.weapon.moveset.chains.basic) delete b.uid;
-    const loaded = parseDelveProfile(registry, bare)!;
-    expect('profile' in loaded && loaded.profile.equipped.weapon!.moveset!.chains.basic!.every((b) => !!b.uid)).toBe(true);
+    expect(parseDelveProfile(registry, bare)).toBeNull();
   });
 
   it('the choice of mana replaces the constructs with plain ones in the primary, minted', () => {

```

Apply to `packages/engine/tests/delve-dive.test.ts`:

```diff
@@ -66,7 +66,7 @@ function clearDepth(p: DelveProfile): DelveProfile {
 describe('profile basics', () => {
   it('starts with a fire sword (its basic chain and a two-slot Primary) and an earth cuirass, and Fire chains', () => {
     const p = createDelveProfile(registry, 123);
-    expect(p.version).toBe(13);
+    expect(p.version).toBe(14);
     expect(p.links).toBe(0);
     expect(p.equipped.weapon?.mana).toBe('fire');
     expect(p.equipped.chest?.mana).toBe('earth');

```

Apply to `packages/engine/tests/delve-maps-save.test.ts`:

```diff
@@ -26,7 +26,7 @@ const blessed = (p: DelveProfile): DelveProfile => ({
 describe('save v10', () => {
   it('a dive starts with nothing used and no blessings; a world has nothing pending', () => {
     const p = diving();
-    expect(p.version).toBe(13);
+    expect(p.version).toBe(14);
     expect(p.dive).toMatchObject({ used: [], diveBuffs: [] });
     expect(emptyPending()).toMatchObject({ used: [], diveBuffs: [] });
   });

```

Apply to `packages/engine/tests/delve-movesets.test.ts`:

```diff
@@ -31,6 +31,7 @@ import { bindSecondary, chooseStartingMana, reattuneItem } from '../src/delve/pa
 import {
   addLootToBag,
   createDelveProfile,
+  mintMoveset,
   equipBest,
   equipItem,
   parseDelveProfile,
@@ -320,7 +321,12 @@ describe('determinism', () => {
 });
 
 describe('save schema: a weapon moveset', () => {
-  const sword = weapon('uncommon', 1, 'sword');
+  // A saved construct carries its uid (save v14): the drop's moveset minted first.
+  const sword = (() => {
+    const w = weapon('uncommon', 1, 'sword');
+    const [moveset] = mintMoveset(createDelveProfile(registry, 1), w.moveset!);
+    return { ...w, moveset };
+  })();
 
   it('reads an item with a moveset, and one without; `bought` defaults to none', () => {
     expect(GearItemSchema.safeParse(sword).success).toBe(true);
@@ -452,10 +458,11 @@ describe('an absent skill (a null chain)', () => {
 describe('a save: fitting its weapons to the data at load', () => {
   const json = (x: unknown) => JSON.parse(JSON.stringify(x));
 
-  it("gives a weapon without a moveset its defaults, minted; keeps a kept chain's slots; mints a missing uid", () => {
-    const p = createDelveProfile(registry, 3, { primary: 'fire' });
+  it("gives a weapon without a moveset its defaults, minted; keeps a kept chain's slots; a missing uid is refused (save v14)", () => {
+    const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
     const { moveset: _m, ...bare } = weapon('magic', 6, 'bow');
-    const rare = weapon('rare', 5, 'axe');
+    const [rareMoveset, p] = mintMoveset(p0, weapon('rare', 5, 'axe').moveset!);
+    const rare = { ...weapon('rare', 5, 'axe'), moveset: rareMoveset };
     const [one, two] = rare.moveset!.chains.basic!;
     const bag = [
       bare, // no moveset: its defaults, minted
@@ -466,8 +473,10 @@ describe('a save: fitting its weapons to the data at load', () => {
           slots: { basic: 2, primary: rare.moveset!.slots.primary },
           bought: {},
         },
-      }, // two skills left out and a short basic string: kept as they are, uids minted
+      }, // two skills left out and a short basic string: kept as they are
     ];
+    // Unminted, the rare's constructs refuse the save.
+    expect(parseDelveProfile(registry, json({ ...p, bag: [weapon('rare', 5, 'axe')] }))).toBeNull();
     const loaded = parseDelveProfile(registry, json({ ...p, bag }))!;
     expect('profile' in loaded).toBe(true);
     const fitted = (loaded as { profile: DelveProfile }).profile.bag;

```

Apply to `packages/engine/tests/delve-pair.test.ts`:

```diff
@@ -304,10 +304,10 @@ describe('the save and the pair', () => {
     expect(c.defensive.moves.map((m) => m.form)).toEqual(['ward']);
   });
 
-  it('a new profile is version 13 with no pair yet, no Mana Dust, no Links and no runes, and round-trips', () => {
+  it('a new profile is version 14 with no pair yet, no Mana Dust, no Links and no runes, and round-trips', () => {
     const p = createDelveProfile(registry, 3);
     expect(p).toMatchObject({
-      version: 13,
+      version: 14,
       pair: { primary: null, secondary: null },
       manaDust: 0,
       links: 0,

```

Apply to `packages/engine/tests/delve-profile-abilities.test.ts`:

```diff
@@ -21,7 +21,7 @@ const bare = (x: unknown) =>
 describe('chains on the weapon', () => {
   it("a new profile's common sword holds its slot table's defaults in the weapon's element: the basic chain and a two-slot Primary, minted", () => {
     const p = createDelveProfile(registry, 1);
-    expect(p.version).toBe(13);
+    expect(p.version).toBe(14);
     const sword = p.equipped.weapon!;
     expect(bare(sword.moveset)).toEqual(defaultMoveset(registry, sword, 'fire'));
     expect(sword.moveset!.slots).toEqual({ basic: 3, primary: 2 });

```

Apply to `packages/engine/tests/delve-quests-save.test.ts`:

```diff
@@ -67,7 +67,7 @@ describe('save v9', () => {
       claimCount: 0,
     });
     const p = fresh();
-    expect(p.version).toBe(13);
+    expect(p.version).toBe(14);
     expect(p.quests.board).toHaveLength(registry.getDelveBalance().quests.contracts.slots);
   });
 
@@ -78,7 +78,7 @@ describe('save v9', () => {
     expect(parseDelveProfile(registry, json(diving))).toEqual({ profile: diving });
   });
 
-  it('resets a version 8 save; a version 13 save without its quests, or a bad contract, is refused', () => {
+  it('resets a version 8 save; a version 14 save without its quests, or a bad contract, is refused', () => {
     const p = underWay(fresh());
     expect(parseDelveProfile(registry, json({ ...p, version: 8 }))).toEqual({ reset: true });
     const { quests: _q, ...noQuests } = p;

```

Apply to `packages/engine/tests/delve-room-save.test.ts`:

```diff
@@ -9,9 +9,9 @@ import { registry } from './fixtures/arena.js';
 const json = (x: unknown) => JSON.parse(JSON.stringify(x));
 
 describe('save v12', () => {
-  it('a new save is version 13 and round-trips, mid-dive too', () => {
+  it('a new save is version 14 and round-trips, mid-dive too', () => {
     const p = createDelveProfile(registry, 4, { primary: 'fire' });
-    expect(p.version).toBe(13);
+    expect(p.version).toBe(14);
     expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p });
     const diving = startDive(registry, p, 1);
     expect(parseDelveProfile(registry, json(diving))).toEqual({ profile: diving });

```

Apply to `packages/engine/tests/delve-runes-contract.test.ts`:

```diff
@@ -639,9 +639,9 @@ describe('save v9: sockets and the pouch', () => {
     equipped: { ...p.equipped, weapon: { ...p.equipped.weapon!, rarity: 'rare' } },
   });
 
-  it('a new profile is version 13 with an empty pouch; a version 6 or 7 save resets', () => {
+  it('a new profile is version 14 with an empty pouch; a version 6 or 7 save resets', () => {
     const p = fresh();
-    expect(p).toMatchObject({ version: 13, runes: {} });
+    expect(p).toMatchObject({ version: 14, runes: {} });
     const { runes: _runes, ...v6 } = p;
     expect(parseDelveProfile(registry, json({ ...v6, version: 6 }))).toEqual({ reset: true });
     expect(parseDelveProfile(registry, json({ ...p, version: 7 }))).toEqual({ reset: true });

```

Apply to `packages/engine/tests/delve-save-v8.test.ts`:

```diff
@@ -13,7 +13,7 @@ const json = (x: unknown) => JSON.parse(JSON.stringify(x));
 describe('save v8', () => {
   it('starts with the starter kit: three patterns, 5 Rusty bars, 5 uncommon flux and 50 scrap', () => {
     const p = createDelveProfile(registry, 7, { primary: 'fire' });
-    expect(p.version).toBe(13);
+    expect(p.version).toBe(14);
     expect(p.patterns).toEqual(['sword', 'cuirass', 'dagger']);
     expect(p.materials.metals).toMatchObject({ rusty: 5, iron: 0 });
     expect(p.materials.flux).toEqual({ uncommon: 5, magic: 0, rare: 0, epic: 0 });
@@ -52,7 +52,7 @@ describe('save v8', () => {
     expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p });
   });
 
-  it('resets a save of any other version; a version 13 save that does not fit is refused', () => {
+  it('resets a save of any other version; a version 14 save that does not fit is refused', () => {
     const p = createDelveProfile(registry, 7, { primary: 'fire' });
     for (const version of [2, 6, 7, 8, 9, 10, undefined])
       expect(parseDelveProfile(registry, json({ ...p, version }))).toEqual({ reset: true });

```

Apply to `packages/engine/tests/delve-tutorial-save.test.ts`:

```diff
@@ -28,7 +28,7 @@ function guided(p: DelveProfile): DelveProfile {
 describe('save v11', () => {
   it('a new save has no tutorial; a dive starts with no entry', () => {
     const p = diving();
-    expect(p.version).toBe(13);
+    expect(p.version).toBe(14);
     expect(p.tutorial).toBeNull();
     expect(p.dive!.tutorialEntry).toBeNull();
     expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p });

```

- [ ] **Step 2: Run them: red**

```bash
cd /c/Projects/alloy-constructs-a
(cd packages/engine && npx vitest run tests/delve-constructs-a-save.test.ts --reporter=dot)
```

Expected: red: `a new save is version 14…` fails (`expected 13 to be 14`) and `a version 13 save resets…` fails (a v13 save loads; an unminted construct is minted, not refused).

- [ ] **Step 3: The edits** (3 files, in this order)

Apply to `packages/engine/src/delve/profile-schema.ts`:

```diff
@@ -13,7 +13,7 @@ import { FLUX_GRADES, METAL_IDS } from '../types/crafting.js';
 import { CONTRACT_TIERS } from '../types/quests.js';
 import { MAX_SOCKETS, RUNE_TIERS } from '../types/rune.js';
 
-/** Zod schema for persisted Delve saves (version 13 only) — rejects corrupt or foreign data. */
+/** Zod schema for persisted Delve saves (version 14 only) — rejects corrupt or foreign data. */
 
 /** Each ability slot's forms (`arpg.json`'s, which a test holds this to). */
 export const SLOT_FORMS: Record<AbilitySlot, readonly FormId[]> = {
@@ -58,7 +58,7 @@ export const RuneRefSchema = z.object({
 /** A move's or a blow's open sockets, each a rune or null (see the runes spec). */
 const SocketsSchema = z.array(RuneRefSchema.nullable()).max(MAX_SOCKETS).optional();
 
-/** A construct's id, `c<n>` (the constructs spec §3.1); optional until save v14 requires it. */
+/** A construct's id, `c<n>` (the constructs spec §3.1): optional on a chain outside a save (the Training Grounds' sandbox); a save requires it (`SavedMoveSchema`). */
 const UidSchema = z.string().min(1).optional();
 
 export const MoveSchema = z.object({
@@ -76,8 +76,12 @@ export const BlowSchema = z.object({
   runes: SocketsSchema,
 });
 
+/** A saved construct carries its uid (save v14): the weapon's chains, the bag and a haul. */
+const SavedMoveSchema = MoveSchema.extend({ uid: z.string().min(1) });
+const SavedBlowSchema = BlowSchema.extend({ uid: z.string().min(1) });
+
 /** A move or a blow in the bag or a haul (the constructs spec §3.1). */
-export const ConstructSchema = z.union([MoveSchema, BlowSchema]);
+export const ConstructSchema = z.union([SavedMoveSchema, SavedBlowSchema]);
 
 /** Loose runes: rune id → counts by tier. */
 export const RunePouchSchema = z.record(
@@ -115,9 +119,14 @@ export const ChainSchema = z.object({
   payment: PaymentSchema,
 });
 
-/** A chain whose every move is one of `slot`'s forms. */
+/** A saved chain: every move with its uid (save v14). */
+const SavedChainSchema = ChainSchema.extend({
+  moves: z.array(SavedMoveSchema).min(0).max(MAX_CHAIN),
+});
+
+/** A saved chain whose every move is one of `slot`'s forms. */
 function slotChain(slot: AbilitySlot) {
-  return ChainSchema.refine(
+  return SavedChainSchema.refine(
     (c) => c.moves.every((m) => SLOT_FORMS[slot].includes(m.form)),
     `every move must be a ${slot} form`,
   );
@@ -129,7 +138,7 @@ const CapSchema = z.number().int().min(1).max(MAX_CHAIN);
 export const MovesetSchema = z
   .object({
     chains: z.object({
-      basic: z.array(BlowSchema).min(1).max(MAX_CHAIN).optional(),
+      basic: z.array(SavedBlowSchema).min(1).max(MAX_CHAIN).optional(),
       primary: slotChain('primary').optional(),
       defensive: slotChain('defensive').optional(),
       ultimate: slotChain('ultimate').optional(),
@@ -317,7 +326,7 @@ const TutorialStateSchema = z.object({ step: z.string().min(1), count, misses: c
  * rebuild a different floor); older saves reset. Every field but the dive.
  */
 const ProfileSchema = z.object({
-  version: z.literal(13),
+  version: z.literal(14),
   seed: z.number().int(),
   diveCount: z.number().int().min(0),
   forgeCount: z.number().int().min(0),

```

Apply to `packages/engine/src/delve/profile.ts`:

```diff
@@ -78,7 +78,7 @@ export function createDelveProfile(
   Object.assign(materials.metals, kit.startingMaterials.metals);
   Object.assign(materials.flux, kit.startingMaterials.flux);
   const profile: DelveProfile = {
-    version: 13,
+    version: 14,
     seed: seed | 0,
     diveCount: 0,
     forgeCount: 0,
@@ -291,15 +291,15 @@ function fitMovesets(registry: DataRegistry, profile: DelveProfile): DelveProfil
 }
 
 /**
- * Validate an unknown JSON blob as a save. A version 13 save is fitted to the
+ * Validate an unknown JSON blob as a save. A version 14 save is fitted to the
  * data (`fitMovesets`); a save of any other version, or one whose constructs
  * don't fit (a uid twice, a construct out of its skill, a chain past its
  * slots, an empty Basic), is `{ reset: true }`. Null when it isn't an object,
- * or a version 13 save doesn't fit the schema.
+ * or a version 14 save doesn't fit the schema (a saved construct without its uid).
  */
 export function parseDelveProfile(registry: DataRegistry, raw: unknown): ParsedDelveProfile | null {
   if (typeof raw !== 'object' || raw === null) return null;
-  if ((raw as { version?: unknown }).version !== 13) return { reset: true };
+  if ((raw as { version?: unknown }).version !== 14) return { reset: true };
   const parsed = DelveProfileSchema.safeParse(raw);
   if (!parsed.success) return null;
   const fitted = fitMovesets(registry, parsed.data as DelveProfile);

```

Apply to `packages/engine/src/types/delve.ts`:

```diff
@@ -890,7 +890,7 @@ export interface CodexEntry {
 }
 
 export interface DelveProfile {
-  version: 13;
+  version: 14;
   seed: number;
   diveCount: number;
   forgeCount: number;

```

- [ ] **Step 4: Typecheck and run them: green**

```bash
cd /c/Projects/alloy-constructs-a
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-constructs-a-save.test.ts tests/delve-constructs-a-switch.test.ts tests/delve-movesets.test.ts tests/delve-tutorial-save.test.ts tests/delve-save-v8.test.ts tests/delve-boons-a-save.test.ts tests/delve-dive.test.ts tests/delve-maps-save.test.ts tests/delve-pair.test.ts tests/delve-profile-abilities.test.ts tests/delve-quests-save.test.ts tests/delve-room-save.test.ts tests/delve-runes-contract.test.ts tests/delve-runes.test.ts --reporter=dot)
(cd packages/engine && npx vitest run --reporter=dot)
```

Expected: no type errors; the first run **Test Files 14 passed (14)** (`delve-constructs-a-save` 2 passed); the whole suite as Verification lists it.

- [ ] **Step 5: The fingerprint**

```bash
cd /c/Projects/alloy-constructs-a
P=C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/1d6bb288-c64f-43d2-9587-234f3b95983f/scratchpad
cp $P/constructs-a-probe.test.ts packages/engine/tests/zz-probe.test.ts
(cd packages/engine && PROBE_OUT=$P/constructs-a-task5.json npx vitest run tests/zz-probe.test.ts --reporter=dot)
rm packages/engine/tests/zz-probe.test.ts
node $P/cmp.cjs $P/constructs-a-task4.json $P/constructs-a-task5.json
```

Expected: `Tests 1 passed`, then `FINGERPRINT_SAME` against Task 4's `constructs-a-task4.json` (the save's version is outside the hash).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-constructs-a
git add packages/engine
git commit -q -F - <<'EOF'
feat(delve): save v14: every saved construct carries its uid

`DelveProfile.version` 14; the save schema requires a uid on every construct
of a weapon's chains, the bag and a haul (`SavedMoveSchema`, `SavedBlowSchema`;
the exported `MoveSchema`, `BlowSchema` and `ChainSchema` keep it optional for
the Training Grounds' sandbox); a version 13 save resets, a v14 save with an
unminted construct is refused (null). No migration, as ever.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git log --oneline -1
```

## Chunk 17: Task 6 — The client on the new bundle

### Task 6: The client on the new bundle

The smallest edits that compile and keep behaviour on the switch's engine (C1 and C2 rewrite them): `kit/glyph-art.ts`'s rows for `whirl`, `repel` and `onslaught`; the store's draft without origins (`ChainDraft` is `{ uid, pair, chains }`, `applyOpts` the pull rule alone, `editDraft` ignoring the builder's `map`), its `transfer` on `moveAll` (B2's op, refusing "Not yet" until then) and `openSkill(uid, skill)` in `awaken`'s place; the compare pane and the take sheet on `moveAllPreview` ("Move all my constructs here", free; `TransferNotes` says what goes to the bag, `transfer-leaves`, and what sits dormant, `transfer-dormant`); the Temper bench's "Open <skill>" row (the first closed skill with a ceiling, its flux, Links and scrap, the engine's dry run; "Only a weapon opens a skill", "Every skill it can hold is open"); the forge preview's weapon frame ("Melee · slots: Basic 3/3, Primary 2/3"); Help's weapons topic from the slot table (`startsFrom`: "every weapon", "uncommon weapons and better"); the Equipped pane, `MovesetView`, `LegendaryBox`, `StopPanel` and `useAnvilChains` on `OPEN_SKILL_TEXT`, `slotRange`, `UNARMED` and `MAX_SOCKETS`. **Every client test of a retired rule is rewritten:** `__tests__/armed.ts` mints (`mintMoveset`) and gains `wearing` and `lancePrimary` (four Fire Lances of distinct kinds: a sword expresses a Lance, where a Bolt sits dormant), the Skills tests' fixtures wear them, the rune fixtures take runes that fit (Widen on a Strike, Multi-shot on a Lance, Quick anywhere), the pull rule is 'pay' unless a test sets 'destroy', the slot table's starts and ceilings price Add slot (2 Links · 40 scrap for an uncommon sword's 3rd Primary slot, none at 3), the home-only fixtures are a forged-up copy with a weak chain and room for every construct (worse as it is, better as a home), and the save tests read v14.

Rebuild the bundle first; against it the client's typecheck fails in 24 files (55 errors) until these edits.

**Files:**
- Modify: `packages/client/src/features/delve/StopPanel.tsx`
- Modify: `packages/client/src/features/delve/__tests__/StopPanel.test.tsx`
- Modify: `packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx`
- Modify: `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts`
- Modify: `packages/client/src/features/delve/__tests__/arena-input.test.ts`
- Modify: `packages/client/src/features/delve/__tests__/armed.ts`
- Modify: `packages/client/src/features/delve/arena/hud/__tests__/FoundLog.test.tsx`
- Modify: `packages/client/src/features/delve/hub/__tests__/SystemMenu.test.tsx`
- Modify: `packages/client/src/features/delve/hub/forge/ForgeBench.tsx`
- Modify: `packages/client/src/features/delve/hub/forge/Temper.tsx`
- Modify: `packages/client/src/features/delve/hub/forge/__tests__/ForgeBench.test.tsx`
- Modify: `packages/client/src/features/delve/hub/forge/__tests__/Temper.test.tsx`
- Modify: `packages/client/src/features/delve/hub/help/__tests__/help-topics.test.tsx`
- Modify: `packages/client/src/features/delve/hub/help/help-topics.tsx`
- Modify: `packages/client/src/features/delve/hub/loadout/ComparePane.tsx`
- Modify: `packages/client/src/features/delve/hub/loadout/EquippedPane.tsx`
- Modify: `packages/client/src/features/delve/hub/loadout/TakeSheet.tsx`
- Modify: `packages/client/src/features/delve/hub/loadout/__tests__/BagPane.test.tsx`
- Modify: `packages/client/src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx`
- Modify: `packages/client/src/features/delve/hub/loadout/__tests__/EquippedPane.test.tsx`
- Modify: `packages/client/src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx`
- Modify: `packages/client/src/features/delve/hub/loadout/__tests__/TakeSheet.test.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/ApplyBar.test.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/ApplySheet.test.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/MoveRows.test.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/SkillStrip.test.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.test.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.trail.test.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/draft-equipped.test.ts`
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/draft-lines.test.ts`
- Modify: `packages/client/src/features/delve/hub/skills/useAnvilChains.ts`
- Modify: `packages/client/src/features/delve/items/LegendaryBox.tsx`
- Modify: `packages/client/src/features/delve/items/MovesetView.tsx`
- Modify: `packages/client/src/features/delve/items/__tests__/MovesetView.test.tsx`
- Modify: `packages/client/src/features/delve/kit/glyph-art.ts`
- Modify: `packages/client/src/pages/__tests__/DelveCamp.test.tsx`
- Modify: `packages/client/src/stores/delveStore.test.ts`
- Modify: `packages/client/src/stores/delveStore.ts`
- Modify: `packages/client/src/stores/sandboxStore.test.ts`

- [ ] **Step 1: The failing tests** — the new test files in full, and the rewritten ones as diffs (28 files)

Apply to `packages/client/src/features/delve/__tests__/StopPanel.test.tsx`:

```diff
@@ -149,29 +149,30 @@ describe('StopPanel (the stop between depths)', () => {
   });
 
   it("adds a slot to a chain at its price; one it can't pay for is off", () => {
-    atStop(['slot'], { links: 1, scrap: 20 });
+    atStop(['slot'], { links: 2, scrap: 40 });
     fireEvent.click(screen.getByTestId('stop-slot'));
+    // The uncommon sword's 3rd Primary slot: 2 Links and 40 scrap (its ceiling).
     expect(screen.getByTestId('stop-slot-primary')).toHaveTextContent(
-      'Primary 1/5 · + a slot · 1 Link · 20 scrap',
+      'Primary 2/5 · + a slot · 2 Links · 40 scrap',
     );
     const basic = screen.getByTestId('stop-slot-basic');
-    expect(basic).toBeDisabled(); // its 4th slot: 3 Links
-    // It says why, in the engine's words.
-    const why = document.getElementById(basic.getAttribute('aria-describedby')!);
-    expect(why).toHaveTextContent('Not enough Links');
+    expect(basic).toBeDisabled(); // at its ceiling of 3: nothing to buy, no price, no reason
+    expect(basic).not.toHaveAttribute('aria-describedby');
     expect(screen.getByTestId('stop-slot-primary')).not.toHaveAttribute('aria-describedby');
-    expect(screen.queryByTestId('stop-slot-defensive')).toBeNull(); // not carried
+    // An uncommon sword starts with a Defensive slot: its 2nd is on offer too.
+    expect(screen.getByTestId('stop-slot-defensive')).toHaveTextContent('Defensive 1/5');
     fireEvent.click(screen.getByTestId('stop-slot-primary'));
-    expect(chains().primary.moves).toHaveLength(2);
+    expect(chains().primary.moves).toHaveLength(3);
     expect(store().profile).toMatchObject({ links: 0, scrap: 0 });
+    expect(store().profile.equipped.weapon!.moveset!.bought).toEqual({ primary: 1 });
   });
 
   it('adjusts one move: a later change replaces an earlier one, at its price', () => {
     const p = store().profile;
-    // A two-slot Primary holding one move: a free builder would offer to add one.
+    // A three-slot Primary holding two moves: a free builder would offer to add one.
     const sword = p.equipped.weapon!;
     const moveset = movesetOf(registry, sword);
-    const weapon = { ...sword, moveset: { ...moveset, slots: { ...moveset.slots, primary: 2 } } };
+    const weapon = { ...sword, moveset: { ...moveset, slots: { ...moveset.slots, primary: 3 } } };
     atStop(['move'], {
       manaDust: 20,
       stats: { ...p.stats, dives: 1 },
@@ -181,12 +182,12 @@ describe('StopPanel (the stop between depths)', () => {
     expect(screen.getByTestId('stop-move-take')).toBeDisabled();
     expect(screen.queryByTestId('move-add')).toBeNull();
     expect(screen.queryByTestId('attune-fire')).toBeNull(); // no attunement bars either
-    // A blow of the basic chain, then the Primary's Bolt: only the Bolt's change is taken.
+    // A blow of the basic chain, then the Primary's first Strike: only the Strike's change is taken.
     fireEvent.click(screen.getByTestId('chain-skill-basic'));
     fireEvent.click(screen.getByTestId('kind-heavy'));
     fireEvent.click(screen.getByTestId('chain-skill-primary'));
     fireEvent.click(screen.getByTestId('form-lance'));
-    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Fire Lance');
+    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('medium Fire Lance');
     expect(screen.getByTestId('stop-move-take')).toHaveTextContent(
       "Change Primary's move 1 · 5 Mana Dust",
     );
@@ -246,7 +247,7 @@ describe('StopPanel (the stop between depths)', () => {
     expect(store().profile.scrap).toBe(0);
   });
 
-  /** At a stop offering a rune: the sword's Bolt has one open, empty socket. */
+  /** At a stop offering a rune: the sword's first Strike has one open, empty socket. */
   function atRuneStop() {
     const p = store().profile;
     const sword = p.equipped.weapon!;
@@ -263,7 +264,7 @@ describe('StopPanel (the stop between depths)', () => {
     });
     fireEvent.click(screen.getByTestId('stop-rune'));
     const move = screen.getByTestId('stop-rune-move-primary-0');
-    expect(move).toHaveTextContent('Primary · light Fire Bolt');
+    expect(move).toHaveTextContent('Primary · medium Fire Strike');
     fireEvent.click(within(move).getByRole('button', { name: 'Socket 1: empty' }));
     return within(screen.getByTestId('rune-picker'));
   }
@@ -272,11 +273,11 @@ describe('StopPanel (the stop between depths)', () => {
     const picker = atRuneStop();
     // Inline, inside the stop's picker: no sheet over the screen.
     expect(screen.getByTestId('stop-picker')).toContainElement(screen.getByTestId('rune-picker'));
-    // Widen doesn't fit a Bolt.
-    expect(picker.queryByRole('button', { name: /^Widen/ })).toBeNull();
-    fireEvent.click(picker.getByRole('button', { name: 'Split I ×1' }));
-    expect(chains().primary.moves[0].runes).toEqual([{ id: 'split', tier: 1 }]);
-    expect(pouchCount(store().profile.runes, { id: 'split', tier: 1 })).toBe(0);
+    // Split doesn't fit a Strike.
+    expect(picker.queryByRole('button', { name: /^Split/ })).toBeNull();
+    fireEvent.click(picker.getByRole('button', { name: 'Widen I ×1' }));
+    expect(chains().primary.moves[0].runes).toEqual([{ id: 'widen', tier: 1 }]);
+    expect(pouchCount(store().profile.runes, { id: 'widen', tier: 1 })).toBe(0);
     expect(store().profile.dive!.stop!.taken).toBe(true);
     expect(screen.getByTestId('stop-taken')).toBeInTheDocument();
     expect(screen.getByText('Socket a rune: done')).toBeInTheDocument();
@@ -286,8 +287,8 @@ describe('StopPanel (the stop between depths)', () => {
   it("prices a rune in the saved chain's payment, eased by the move's attunement", () => {
     pricedRegistry();
     const picker = atRuneStop();
-    // Split I's 0.27, eased 6% by the starting sword's and chest's 2 Fire.
-    expect(picker.getByTestId('rune-pick-split')).toHaveTextContent('+25% cost');
+    // Widen I's 0.12, eased 6% by the starting sword's and chest's 2 Fire.
+    expect(picker.getByTestId('rune-pick-widen')).toHaveTextContent('+11% cost');
   });
 
   it("Escape closes the rune picker, not the stop's", () => {

```

Apply to `packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx`:

```diff
@@ -95,9 +95,9 @@ describe('TrainingPanel', () => {
     expect(screen.queryByRole('dialog')).toBeNull();
     const picker = within(screen.getByTestId('rune-picker'));
     fireEvent.click(picker.getByRole('button', { name: 'Tier III' }));
-    fireEvent.click(picker.getByRole('button', { name: 'Split III' }));
+    fireEvent.click(picker.getByRole('button', { name: 'Quick III' }));
     expect(useSandboxStore.getState().chains.primary.moves[0].runes).toEqual([
-      { id: 'split', tier: 3 },
+      { id: 'quick', tier: 3 },
     ]);
     expect(screen.getByTestId('socket-count')).toHaveTextContent('Sockets 1/3');
   });

```

Apply to `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts`:

```diff
@@ -48,12 +48,12 @@ function sandbox(over: Partial<Chains> = {}, extra: HeroStatsExtra = {}, infinit
 
 describe('arena HUD snapshot', () => {
   it('a channelled ability dims the buttons only once its channel starts, not in its conjure', () => {
-    // A new hero whose sword is epic (all four skills), its Primary a cast Bolt.
+    // A new hero whose sword is epic (every skill), its Primary a cast Lance (a sword expresses it).
     const p = createDelveProfile(registry, 99);
     const weapon = { ...p.equipped.weapon!, rarity: 'epic' as const };
     const moveset = defaultMoveset(registry, weapon, 'fire');
     moveset.chains.primary = {
-      moves: [{ kind: 'medium', form: 'bolt', elements: ['fire'] }],
+      moves: [{ kind: 'medium', form: 'lance', elements: ['fire'] }],
       payment: 'cast',
     };
     const armed = { ...p, equipped: { ...p.equipped, weapon: { ...weapon, moveset } } };
@@ -178,13 +178,13 @@ describe('arena HUD snapshot', () => {
   });
 
   it("a skill the weapon doesn't carry has no entry, and its slot keeps its place", () => {
-    // An uncommon sword: Basic and Primary only.
+    // An uncommon sword: Basic, Primary and Defensive; no Ultimate.
     const hero = armed(createDelveProfile(registry, 99));
     const w = beginFloor(registry, startDive(registry, hero, 1));
     const hud = snapshot(w, null);
     expect(hud.abilities).toHaveLength(3);
-    expect(hud.abilities[0]).toMatchObject({ name: 'Fire Bolt' });
-    expect(hud.abilities[1]).toBeNull();
+    expect(hud.abilities[0]).toMatchObject({ name: 'Fire Strike' });
+    expect(hud.abilities[1]).toMatchObject({ name: 'Fire Ward' });
     expect(hud.abilities[2]).toBeNull();
   });
 
@@ -232,7 +232,7 @@ describe('arena HUD snapshot: buffs and the map', () => {
     w.hero.dodgeRechargeAt = w.t + bal.dodge.recharge * 0.25; // a quarter of the eased recharge left
     const hud = snapshot(w, null);
     expect(hud.dodgeMax).toBe(bal.dodge.charges + 1);
-    expect(hud.dodgeRefill).toBeCloseTo(0.5); // (recharge � 0.25) � (recharge � 0.5) left
+    expect(hud.dodgeRefill).toBeCloseTo(0.5); // (recharge � 0.25) � (recharge � 0.5) left
   });
 
   it("lists the worn boons after them, one per boon, the dive's then the floor's, with count and lines", () => {

```

Apply to `packages/client/src/features/delve/__tests__/arena-input.test.ts`:

```diff
@@ -351,10 +351,10 @@ describe('the aim marker of a key or button held to aim', () => {
   const aiming = { slot: 0, since: 0, at: { x: 1, y: 1 } };
 
   it("none for a skill the weapon doesn't carry", () => {
-    // An uncommon sword: no Defensive.
+    // An uncommon sword: no Ultimate.
     const hero = armed(createDelveProfile(registry, 99));
     const w = beginFloor(registry, startDive(registry, hero, 1));
-    expect(aimView(w, { ...aiming, slot: 1 }, point, 1000)).toBeNull();
+    expect(aimView(w, { ...aiming, slot: 2 }, point, 1000)).toBeNull();
     expect(aimView(w, aiming, point, 1000)).toMatchObject({ marker: 'line' });
   });
 
@@ -589,11 +589,11 @@ describe("frameInput: each step's input from the keys, the HUD and the pad", ()
   });
 
   it("the pad's button of a skill the weapon doesn't carry casts nothing", () => {
-    // An uncommon sword: no Defensive.
+    // An uncommon sword: no Ultimate.
     const hero = armed(createDelveProfile(registry, 99));
     const w = beginFloor(registry, startDive(registry, hero, 1));
     const input = createArenaInput();
-    expect(frameInput(registry, w, input, pad({ cast: [1] }), padMemory(), opts).cast).toBeNull();
+    expect(frameInput(registry, w, input, pad({ cast: [2] }), padMemory(), opts).cast).toBeNull();
     expect(frameInput(registry, w, input, pad({ cast: [0] }), padMemory(), opts).cast).toEqual({
       slot: 0,
       aim: null,

```

Apply to `packages/client/src/features/delve/__tests__/armed.ts`:

```diff
@@ -1,13 +1,40 @@
-import { defaultMoveset, type DelveProfile, type Rarity } from '@alloy/engine';
+import {
+  defaultMoveset,
+  mintMoveset,
+  type Chain,
+  type DelveProfile,
+  type GearItem,
+  type Rarity,
+} from '@alloy/engine';
 import { getDelveRegistry } from '../registry';
 
 /**
- * `p` with its equipped weapon made `rarity` (uncommon by default), holding that rarity's base
- * moveset in its mana. A new save's common sword carries the basic chain alone (see the tutorial
- * spec's carries): a test of the Primary arms the hero first, as its first forge would.
+ * `p` with its equipped weapon made `rarity` (uncommon by default), holding that rarity's default
+ * moveset in its mana (the slot table's starts), its constructs minted. A new save's common
+ * sword holds its Basic and a two-slot Primary; an uncommon one a Defensive too.
  */
 export function armed(p: DelveProfile, rarity: Rarity = 'uncommon'): DelveProfile {
   const w = p.equipped.weapon!;
   const moveset = defaultMoveset(getDelveRegistry(), { baseId: w.baseId, rarity }, w.mana);
-  return { ...p, equipped: { ...p.equipped, weapon: { ...w, rarity, moveset } } };
+  return wearing(p, { ...w, rarity, moveset });
+}
+
+/** `p` wearing `weapon`, its moveset's constructs minted (as a drop banks or a forge makes them). */
+export function wearing(p: DelveProfile, weapon: GearItem): DelveProfile {
+  const [moveset, q] = mintMoveset(p, weapon.moveset!);
+  return { ...q, equipped: { ...p.equipped, weapon: { ...weapon, moveset } } };
+}
+
+/** Four kinds, each distinct enough to read in a summary: the Skills tests' Primary. */
+export const LANCE_KINDS = ['light', 'medium', 'medium', 'heavy'] as const;
+
+/**
+ * A Primary of `count` Fire Lances in `LANCE_KINDS`' order: a sword expresses a Lance (a Bolt
+ * would sit dormant there, the constructs spec's class rule), and the kinds tell the moves apart.
+ */
+export function lancePrimary(count = 4): Chain {
+  return {
+    moves: LANCE_KINDS.slice(0, count).map((kind) => ({ kind, form: 'lance', elements: ['fire'] })),
+    payment: 'mana',
+  };
 }

```

Apply to `packages/client/src/features/delve/arena/hud/__tests__/FoundLog.test.tsx`:

```diff
@@ -1,10 +1,10 @@
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import { fireEvent, render, screen, within } from '@testing-library/react';
-import { addMaterial, emptyHaul, generateItem, SeededRNG } from '@alloy/engine';
+import { defaultMoveset, addMaterial, emptyHaul, generateItem, SeededRNG } from '@alloy/engine';
 import { FoundLog } from '../FoundLog';
 import { getDelveRegistry } from '../../../registry';
 import { useDelveStore } from '@/stores/delveStore';
-import { armed } from '../../../__tests__/armed';
+import { armed, wearing } from '../../../__tests__/armed';
 
 const registry = getDelveRegistry();
 const store = () => useDelveStore.getState();
@@ -128,18 +128,33 @@ describe('FoundLog: what this floor found', () => {
   });
 
   /**
-   * Slots bought on the worn (uncommon) sword make an uncommon dagger better
-   * only with that moveset moved onto it: a potential upgrade.
+   * Constructs built up on the worn (uncommon) sword make a forged-up dagger whose own Primary
+   * is one light Strike (and room for every construct) better only with them moved onto it: a
+   * potential upgrade.
    */
-  it('counts a weapon better only as a home for your moveset apart, as a potential upgrade', () => {
-    store().setProfile({ ...armed(store().profile), links: 99, scrap: 9999 });
-    for (const skill of ['basic', 'basic', 'primary', 'primary', 'primary'] as const)
-      expect(store().addSlot(skill).ok).toBe(true);
-    const dagger = generateItem(
+  it('counts a weapon better only as a home for your constructs apart, as a potential upgrade', () => {
+    const a = armed(store().profile);
+    const sword = a.equipped.weapon!;
+    const mine = {
+      ...sword,
+      moveset: {
+        ...defaultMoveset(registry, sword, 'fire', { primary: 5, defensive: 2 }),
+        bought: { primary: 2, defensive: 1 },
+      },
+    };
+    store().setProfile({ ...wearing(a, mine), links: 99, scrap: 9999 });
+    const rolled = generateItem(
       registry,
-      { uid: 'w2', ilvl: 3, rarity: 'uncommon', slot: 'weapon', mana: 'fire' },
+      { uid: 'w2', ilvl: 3, rarity: 'uncommon', slot: 'weapon', baseId: 'dagger', mana: 'fire' },
       new SeededRNG(3),
     );
+    const weak = defaultMoveset(registry, rolled, 'fire', { primary: 2 });
+    weak.chains.primary!.moves = [{ kind: 'light', form: 'strike', elements: ['fire'] }];
+    const dagger = {
+      ...rolled,
+      upgrade: 1,
+      moveset: { ...weak, slots: { ...weak.slots, basic: 4, primary: 5, defensive: 2 } },
+    };
     store().setProfile({ ...store().profile, bag: [...store().profile.bag, dagger] });
     store().startDive(1);
     store().pushDiveDrops(['h1', 'w1', 'w2']);

```

Apply to `packages/client/src/features/delve/hub/__tests__/SystemMenu.test.tsx`:

```diff
@@ -166,13 +166,13 @@ describe('SystemMenu', () => {
     act(() => useDelveStore.setState({ unsocket: null }));
     renderMenu();
     const chip = screen.getByTestId('unsocket-chip');
-    expect(chip).toHaveTextContent('Pull: destroys'); // the balance's rule
-    fireEvent.click(chip);
-    expect(chip).toHaveTextContent('Pull: pays');
-    expect(useDelveStore.getState().unsocket).toBe('pay');
-    expect(localStorage.getItem(UNSOCKET_KEY)).toBe('pay');
+    expect(chip).toHaveTextContent('Pull: pays'); // the balance's rule
     fireEvent.click(chip);
     expect(chip).toHaveTextContent('Pull: destroys');
+    expect(useDelveStore.getState().unsocket).toBe('destroy');
+    expect(localStorage.getItem(UNSOCKET_KEY)).toBe('destroy');
+    fireEvent.click(chip);
+    expect(chip).toHaveTextContent('Pull: pays');
   });
 
   it('a production build shows neither Restart nor the pull chip', () => {

```

Apply to `packages/client/src/features/delve/hub/forge/__tests__/ForgeBench.test.tsx`:

```diff
@@ -221,9 +221,11 @@ describe('ForgeBench', () => {
       expect(screen.getByTestId('forge-implicits')).toHaveTextContent(
         statRange(registry, im.stat, im.min, im.max),
       );
-    // A common weapon carries the basic chain alone.
-    expect(screen.getByTestId('forge-weapon')).toHaveTextContent('Carries Basic');
-    expect(screen.getByTestId('forge-weapon')).not.toHaveTextContent('Primary');
+    // A common sword's frame: melee, its Basic at the string's 3 slots and a two-slot Primary (the slot table).
+    expect(screen.getByTestId('forge-weapon')).toHaveTextContent(
+      'Melee · slots: Basic 3/3, Primary 2/3',
+    );
+    expect(screen.getByTestId('forge-weapon')).not.toHaveTextContent('Defensive');
     expect(uses()).toHaveTextContent('Uses Iron bar');
     expect(screen.getByTestId('forge-button')).toHaveTextContent(
       `Forge · ${prev.price.scrap} scrap`,

```

Apply to `packages/client/src/features/delve/hub/forge/__tests__/Temper.test.tsx`:

```diff
@@ -1,13 +1,13 @@
 import { describe, it, expect, beforeEach, vi } from 'vitest';
-import { act, render, screen, fireEvent } from '@testing-library/react';
+import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
 import {
-  awaken,
-  awakenPrice,
   emptyMaterials,
   findItem,
   generateItem,
   honeCost,
   imprintCost,
+  openSkill,
+  openSkillPrice,
   reforgeCost,
   shardTiersOf,
   upgradeCost,
@@ -20,11 +20,11 @@ import { Temper } from '../Temper';
 import { getDelveRegistry } from '../../../registry';
 import { useDelveStore } from '@/stores/delveStore';
 
-// Awaken's price and dry run (the tutorial's B3 fills them): each test says what they give.
+// Open a skill's price and dry run: each test says what they give.
 vi.mock('@alloy/engine', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@alloy/engine')>()),
-  awaken: vi.fn(),
-  awakenPrice: vi.fn(),
+  openSkill: vi.fn(),
+  openSkillPrice: vi.fn(),
 }));
 
 const registry = getDelveRegistry();
@@ -60,8 +60,8 @@ describe('Temper', () => {
   beforeEach(() => {
     localStorage.clear();
     store().resetProfile(1234, 'fire');
-    vi.mocked(awaken).mockReset();
-    vi.mocked(awakenPrice).mockReset();
+    vi.mocked(openSkill).mockReset();
+    vi.mocked(openSkillPrice).mockReset();
   });
 
   it("lists the six operations as rows, each with its price; one it can't do is off and says why on its row", () => {
@@ -74,7 +74,7 @@ describe('Temper', () => {
       'temper-op-hone',
       'temper-op-imprint',
       'temper-op-reattune',
-      'temper-op-awaken',
+      'temper-op-open-skill',
     ]);
     const item = store().profile.bag[0];
     const op = (id: string) => screen.getByTestId(`temper-op-${id}`);
@@ -88,10 +88,10 @@ describe('Temper', () => {
     expect(why('imprint')).toHaveTextContent('No shard you hold fits a helm');
     // A pair of one element: nothing to re-attune to.
     expect(why('reattune')).toHaveTextContent('Bind a second element first');
-    // Not a rare weapon.
-    expect(why('awaken')).toHaveTextContent('Only a rare weapon awakens');
+    // Not a weapon.
+    expect(why('open-skill')).toHaveTextContent('Only a weapon opens a skill');
     // The reason sits in the row itself, beside its button.
-    expect(op('awaken').closest('[data-temper-row]')!.contains(why('awaken'))).toBe(true);
+    expect(op('open-skill').closest('[data-temper-row]')!.contains(why('open-skill'))).toBe(true);
   });
 
   it("an item with no lines can't Reforge, Hone or Imprint: each row says so", () => {
@@ -288,11 +288,11 @@ describe('Temper', () => {
     expect(screen.getByRole('status')).toHaveTextContent('Attuned to Storm');
   });
 
-  it("awakens a rare weapon at the engine's price, as its dry run allows, and says why not", () => {
-    const price = { epicFlux: 1, links: 2, scrap: 150 };
-    vi.mocked(awakenPrice).mockReturnValue(price);
-    // The engine's rule stands in: 150 scrap awakens the sword.
-    vi.mocked(awaken).mockImplementation((_registry, p, uid) =>
+  it("opens a common sword's Defensive at the engine's price, as its dry run allows, and says why not", () => {
+    const price = { flux: { uncommon: 2 }, links: 1, scrap: 150 };
+    vi.mocked(openSkillPrice).mockReturnValue(price);
+    // The engine's rule stands in: 150 scrap opens the skill, its first slot bought.
+    vi.mocked(openSkill).mockImplementation((_registry, p, uid, skill) =>
       p.scrap < price.scrap
         ? { ok: false, profile: p, reason: 'Needs 150 scrap' }
         : {
@@ -300,61 +300,70 @@ describe('Temper', () => {
             profile: {
               ...p,
               scrap: p.scrap - price.scrap,
-              bag: p.bag.map((i) => (i.uid === uid ? { ...i, awakened: true } : i)),
+              bag: p.bag.map((i) =>
+                i.uid === uid
+                  ? {
+                      ...i,
+                      moveset: {
+                        ...i.moveset!,
+                        slots: { ...i.moveset!.slots, [skill]: 1 },
+                        bought: { ...i.moveset!.bought, [skill]: 1 },
+                      },
+                    }
+                  : i,
+              ),
             },
           },
     );
-    bench(sword('rare'), { scrap: 149 });
-    expect(awakenPrice).toHaveBeenCalledWith(
+    bench(sword('common'), { scrap: 149 });
+    expect(openSkillPrice).toHaveBeenCalledWith(
       registry,
-      expect.objectContaining({ uid: 'w1', rarity: 'rare' }),
+      expect.objectContaining({ uid: 'w1', rarity: 'common' }),
     );
-    const button = screen.getByTestId('temper-op-awaken');
-    expect(button).toHaveTextContent('Awaken');
-    expect(button).toHaveTextContent('1 Epic flux · 2 Links · 150 scrap');
+    const button = screen.getByTestId('temper-op-open-skill');
+    expect(button).toHaveTextContent('Open Defensive');
+    expect(button).toHaveTextContent('2 Uncommon flux · 1 Link · 150 scrap');
     expect(button).toBeDisabled();
     expect(button).toHaveAccessibleDescription('Needs 150 scrap');
     act(() => store().setProfile({ ...store().profile, scrap: 150 }));
     expect(button).toBeEnabled();
     expect(button).not.toHaveAttribute('aria-describedby');
     fireEvent.click(button);
-    expect(awaken).toHaveBeenLastCalledWith(
+    expect(openSkill).toHaveBeenLastCalledWith(
       registry,
       expect.objectContaining({ scrap: 150 }),
       'w1',
+      'defensive',
     );
-    expect(store().profile).toMatchObject({ scrap: 0, bag: [{ uid: 'w1', awakened: true }] });
-    expect(screen.getByRole('status')).toHaveTextContent('Awakened!');
-    // Once: the row and the detail say so.
-    expect(screen.getByTestId('temper-op-awaken')).toBeDisabled();
-    expect(screen.getByTestId('temper-op-awaken')).toHaveAccessibleDescription(
-      'Awakened: it carries the Ultimate',
+    expect(store().profile).toMatchObject({ scrap: 0 });
+    expect(store().profile.bag[0].moveset!.slots.defensive).toBe(1);
+    expect(screen.getByRole('status')).toHaveTextContent('Defensive opened!');
+    // A common sword's Ultimate has a ceiling of 0: nothing is left to open.
+    expect(screen.getByTestId('temper-op-open-skill')).toBeDisabled();
+    expect(screen.getByTestId('temper-op-open-skill')).toHaveAccessibleDescription(
+      'Every skill it can hold is open',
     );
-    expect(screen.getByTestId('awakened')).toHaveTextContent('Awakened: it carries the Ultimate.');
   });
 
-  it('Awaken is enabled only on a rare weapon not yet awakened, as the dry run allows; an awakened one says it is', () => {
-    for (const item of [
-      sword('magic'),
-      sword('epic'),
-      { ...helm('fire'), rarity: 'rare' as const },
-    ]) {
-      const { unmount } = bench(item);
-      expect(screen.getByTestId('temper-op-awaken')).toBeDisabled();
-      expect(screen.getByTestId('temper-op-awaken')).toHaveAccessibleDescription(
-        'Only a rare weapon awakens',
-      );
-      expect(screen.queryByTestId('awakened')).toBeNull();
-      unmount();
-    }
-    bench({ ...sword('rare'), awakened: true });
-    expect(screen.getByTestId('temper-op-awaken')).toBeDisabled();
-    expect(screen.getByTestId('temper-op-awaken')).toHaveAccessibleDescription(
-      'Awakened: it carries the Ultimate',
+  it('Open a skill names the first closed skill with a ceiling; other gear and a weapon with every skill open say so', () => {
+    vi.mocked(openSkillPrice).mockReturnValue({ flux: { magic: 1 }, links: 2, scrap: 80 });
+    vi.mocked(openSkill).mockImplementation((_registry, p) => ({ ok: true, profile: p }));
+    // A magic sword starts with a Defensive; its Ultimate (a ceiling of 1) is the one to open.
+    bench(sword('magic'));
+    expect(screen.getByTestId('temper-op-open-skill')).toHaveTextContent('Open Ultimate');
+    expect(openSkill).toHaveBeenCalledWith(registry, expect.anything(), 'w1', 'ultimate');
+    cleanup();
+    // A rare sword starts with every skill.
+    bench(sword('rare'));
+    expect(screen.getByTestId('temper-op-open-skill')).toBeDisabled();
+    expect(screen.getByTestId('temper-op-open-skill')).toHaveAccessibleDescription(
+      'Every skill it can hold is open',
+    );
+    cleanup();
+    bench({ ...helm('fire'), rarity: 'rare' as const });
+    expect(screen.getByTestId('temper-op-open-skill')).toBeDisabled();
+    expect(screen.getByTestId('temper-op-open-skill')).toHaveAccessibleDescription(
+      'Only a weapon opens a skill',
     );
-    expect(screen.getByTestId('awakened')).toBeInTheDocument();
-    // The engine is asked for neither the price nor a dry run.
-    expect(awakenPrice).not.toHaveBeenCalled();
-    expect(awaken).not.toHaveBeenCalled();
   });
 });

```

Apply to `packages/client/src/features/delve/hub/help/__tests__/help-topics.test.tsx`:

```diff
@@ -1,6 +1,6 @@
 import { describe, it, expect, beforeEach } from 'vitest';
 import { act, cleanup, render, screen } from '@testing-library/react';
-import { CHAIN_SKILLS, carriedByText, carriedFrom, carriedSkills } from '@alloy/engine';
+import { ABILITY_SLOTS, RARITY_ORDER, type ChainSkill } from '@alloy/engine';
 import { HELP_TOPICS, HelpPage } from '../help-topics';
 import { getDelveRegistry } from '../../../registry';
 import { SKILL_NAME } from '../../../chains/chain-text';
@@ -61,21 +61,20 @@ describe('HelpPage', () => {
     expect(screen.getByTestId('delve-howto')).toHaveTextContent('Z dodges');
   });
 
-  it("names what a weapon carries in the engine's words, and where a rare awakens", () => {
+  it("names each skill's least rarity from the slot table, and where a skill opens", () => {
     render(<HelpPage topic="weapons" />);
-    const always = carriedSkills(registry, { rarity: 'common' });
+    const slots = registry.getDelveBalance().movesets.slots;
+    const from = (s: ChainSkill) => RARITY_ORDER.find((r) => slots[r][s][0] > 0)!;
     const carries = screen.getByTestId('howto-carries');
-    expect(carries).toHaveTextContent(
-      `Every weapon carries your ${always.map((s) => SKILL_NAME[s]).join(' and ')}`,
-    );
-    for (const s of CHAIN_SKILLS.filter((c) => !always.includes(c)))
+    expect(carries).toHaveTextContent('every weapon your Basic chain');
+    for (const s of ABILITY_SLOTS)
       expect(screen.getByTestId(`howto-carry-${s}`)).toHaveTextContent(
-        `${SKILL_NAME[s]}: ${carriedByText(registry, s).toLowerCase()}`,
+        `${SKILL_NAME[s]}: ${from(s) === 'common' ? 'every weapon' : `${from(s)} weapons and better`}`,
       );
-    expect(carries).toHaveTextContent("Awaken a rare weapon on the Forge's Temper bench");
-    // A Jump in save's first forge: the kit's flux at the rarity that carries the Primary.
+    expect(carries).toHaveTextContent("opens on the Forge's Temper bench");
+    // A Jump in save's first forge: the kit's flux at the rarity that starts a Defensive.
     expect(carries).toHaveTextContent(
-      `Forge your first weapon from your starting kit on the Forge tab: with ${carriedFrom(registry, 'primary')} flux it carries your Primary Q`,
+      `Forge your first weapon from your starting kit on the Forge tab: with ${from('defensive')} flux it holds a Defensive E too`,
     );
   });
 

```

Apply to `packages/client/src/features/delve/hub/loadout/__tests__/BagPane.test.tsx`:

```diff
@@ -11,7 +11,7 @@ import {
   type Rarity,
 } from '@alloy/engine';
 import { useDelveStore } from '@/stores/delveStore';
-import { armed } from '../../../__tests__/armed';
+import { armed, wearing } from '../../../__tests__/armed';
 import { useInputDeviceStore } from '@/stores/inputDeviceStore';
 import { BagPane } from '../BagPane';
 import { getDelveRegistry } from '../../../registry';
@@ -77,19 +77,22 @@ describe('the bag pane', () => {
   it('counts the bag, and marks each tile ▲ better as it is, ◇ better only as a home, NEW', () => {
     const p = store().profile;
     const sword = p.equipped.weapon!;
-    // A built-up common sword against a plain uncommon one: worse as it is, better as a home.
+    // A built-up sword against a forged-up copy whose own Primary is one light Strike, with room
+    // for every construct: worse as it is, better as a home.
     const mine = {
       ...sword,
       moveset: defaultMoveset(registry, sword, 'fire', { primary: 5, basic: 5 }),
     };
-    const plain = generateItem(
-      registry,
-      { uid: 'w2', ilvl: 2, rarity: 'uncommon', slot: 'weapon', baseId: 'sword', mana: 'fire' },
-      new SeededRNG(4),
-    );
+    const weak = defaultMoveset(registry, sword, 'fire', { primary: 2 });
+    weak.chains.primary!.moves = [{ kind: 'light', form: 'strike', elements: ['fire'] }];
+    const plain: GearItem = {
+      ...sword,
+      uid: 'w2',
+      upgrade: 1,
+      moveset: { ...weak, slots: { ...weak.slots, basic: 5, primary: 5 } },
+    };
     store().setProfile({
-      ...p,
-      equipped: { ...p.equipped, weapon: mine },
+      ...wearing(p, mine),
       bag: [gear('h1', 'helm'), plain],
     });
     store().markNew(['h1']);

```

Apply to `packages/client/src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx`:

```diff
@@ -1,10 +1,11 @@
 import { describe, it, expect, beforeEach, vi } from 'vitest';
-import { act, render, screen, fireEvent } from '@testing-library/react';
+import { render, screen, fireEvent } from '@testing-library/react';
 import {
   compareItem,
   defaultMoveset,
   generateItem,
   heroChains,
+  moveAllPreview,
   referenceDepth,
   salvageYield,
   SeededRNG,
@@ -14,7 +15,7 @@ import {
   type SalvageYield,
 } from '@alloy/engine';
 import { useDelveStore } from '@/stores/delveStore';
-import { armed } from '../../../__tests__/armed';
+import { armed, wearing } from '../../../__tests__/armed';
 import { ToastContainer } from '@/components/Toast';
 import { ComparePane, VERDICT_TEXT, verdictOf } from '../ComparePane';
 import { getDelveRegistry } from '../../../registry';
@@ -35,6 +36,7 @@ const SCRAP_ONLY: SalvageYield = {
   pattern: null,
   essence: null,
   runes: [],
+  constructs: [],
 };
 
 const registry = getDelveRegistry();
@@ -76,6 +78,10 @@ const quick = { id: 'quick', tier: 1 } as const;
  * A built-up common sword worn against a plain uncommon one in the bag (`w2`): worse as it is,
  * better as a home for your moveset.
  */
+/**
+ * A built-up sword (five Strikes, five blows) against a forged-up copy (one forge level) whose own
+ * Primary is one light Strike, with room for every construct: worse as it is, better as a home.
+ */
 const putHomeOnlyWeapon = () => {
   const p = store().profile;
   const sword = p.equipped.weapon!;
@@ -83,14 +89,18 @@ const putHomeOnlyWeapon = () => {
     ...sword,
     moveset: defaultMoveset(registry, sword, 'fire', { primary: 5, basic: 5 }),
   };
-  const plain = generateItem(
-    registry,
-    { uid: 'w2', ilvl: 2, rarity: 'uncommon', slot: 'weapon', baseId: 'sword', mana: 'fire' },
-    new SeededRNG(4),
-  );
-  const equipped = { ...p.equipped, weapon: mine };
-  store().setProfile({ ...p, equipped, bag: [plain] });
-  return { p, plain, equipped };
+  const weak = defaultMoveset(registry, sword, 'fire', { primary: 2 });
+  weak.chains.primary!.moves = [{ kind: 'light', form: 'strike', elements: ['fire'] }];
+  const plain: GearItem = {
+    ...sword,
+    uid: 'w2',
+    upgrade: 1,
+    moveset: { ...weak, slots: { ...weak.slots, basic: 5, primary: 5 } },
+  };
+  const q = wearing(p, mine);
+  const equipped = q.equipped;
+  store().setProfile({ ...q, bag: [plain] });
+  return { p: q, plain, equipped };
 };
 
 /** The pane showing `uid` as selected, and the toasts. */
@@ -202,6 +212,7 @@ describe('the compare pane', () => {
       extraShard: 0.25,
       pattern: 'axe',
       essence: essence.id,
+      constructs: [],
       runes: [],
     });
     put(helm('fire'));
@@ -341,7 +352,7 @@ describe('the compare pane', () => {
     expect(store().profile.equipped.helm).toBeUndefined();
   });
 
-  it('a bag weapon is valued as it is and with your moveset; Transfer moves your moveset onto it for scrap', () => {
+  it('a bag weapon is valued as it is and with your constructs; Move all is offered, free (B2 fills the op)', () => {
     const p = store().profile;
     const sword = p.equipped.weapon!;
     const mine = { ...sword, moveset: defaultMoveset(registry, sword, 'fire', { primary: 2 }) };
@@ -358,28 +369,22 @@ describe('the compare pane', () => {
     expect(screen.getByTestId('compare-as-is').closest('.k-scroll')).not.toBeNull();
     expect(screen.getByTestId('compare-as-is')).toHaveTextContent('Power');
     expect(screen.getByTestId('compare-home')).toHaveTextContent('Power');
-    expect(screen.getByTestId('item-compare')).toHaveTextContent(
-      'With your moveset · 30 scrap to move it',
-    );
-    // Your Primary's extra slot moves (30 scrap); the target's own extra Primary slot comes back.
-    expect(screen.getByTestId('transfer-button')).toHaveTextContent(
-      /Transfer my moveset here · 30 scrap · \+1 Link$/,
+    expect(screen.getByTestId('item-compare')).toHaveTextContent('With your constructs moved here');
+    expect(screen.getByTestId('transfer-button')).toHaveTextContent(/Move all my constructs here$/);
+    // The rare sword's own blows and Primary constructs give way to yours: they go to the bag.
+    const { toBag } = moveAllPreview(registry, mine, store().profile.bag[0]);
+    expect(toBag.length).toBeGreaterThan(0);
+    expect(screen.getByTestId('transfer-leaves')).toHaveTextContent(
+      `${toBag.length} constructs to your bag`,
     );
-    expect(screen.queryByTestId('transfer-leaves')).toBeNull(); // a rare sword carries all of yours
+    expect(screen.queryByTestId('transfer-dormant')).toBeNull(); // a sword expresses a Strike
+    // The engine's op is B2's: until then it refuses, and the sword stays worn.
     fireEvent.click(screen.getByTestId('transfer-button'));
-    expect(screen.getByText('Not enough scrap')).toBeInTheDocument();
-    act(() => store().setProfile({ ...store().profile, scrap: 30 }));
-    fireEvent.click(screen.getByTestId('transfer-button'));
-    const now = store().profile;
-    expect(now.equipped.weapon!.uid).toBe('w1');
-    expect(now.equipped.weapon!.moveset!.chains.primary).toEqual(mine.moveset.chains.primary);
-    expect(now.equipped.weapon!.moveset!.slots).toMatchObject({ primary: 2, defensive: 1 });
-    expect(now.bag.find((i) => i.uid === sword.uid)!.moveset!.slots.primary).toBe(1);
-    expect(now).toMatchObject({ scrap: 0, links: 1 });
-    expect(screen.getByText(/Your moveset moved onto .+ · \+1 Link$/)).toBeInTheDocument();
+    expect(screen.getByText('Not yet')).toBeInTheDocument();
+    expect(store().profile.equipped.weapon!.uid).toBe(mine.uid);
   });
 
-  it('each valuation shows its own delta: Equip is marked as it is, Transfer as a home', () => {
+  it('each valuation shows its own delta: Equip is marked as it is, Move all as a home', () => {
     const { p, plain, equipped } = putHomeOnlyWeapon();
     const depth = referenceDepth(store().profile);
     const asIs = compareItem(equipped, plain, registry, depth, p.pair, 'asIs').powerPct;
@@ -393,14 +398,13 @@ describe('the compare pane', () => {
       `Equip · ${formatDelta(asIs)} Power`,
     );
     expect(screen.getByTestId('equip-button')).not.toHaveClass('k-go');
-    // Four Primary and two basic extra slots move: 6 × 30 scrap.
     expect(screen.getByTestId('transfer-button')).toHaveTextContent(
-      /^▲ Transfer my moveset here · 180 scrap$/,
+      /^▲ Move all my constructs here$/,
     );
     expect(screen.getByTestId('transfer-button')).toHaveClass('k-go');
   });
 
-  it('Transfer onto a weapon that carries less says which of your chains stay behind', () => {
+  it('Move all onto a weapon with fewer slots says how many constructs go to your bag', () => {
     const p = store().profile;
     const epic = { ...p.equipped.weapon!, rarity: 'epic' as const };
     const mine = { ...epic, moveset: defaultMoveset(registry, epic, 'fire') };
@@ -411,37 +415,35 @@ describe('the compare pane', () => {
     );
     store().setProfile({ ...p, equipped: { ...p.equipped, weapon: mine }, bag: [plain] });
     show('w2');
+    // The epic's constructs past the uncommon's slots, and the uncommon's own replaced ones.
+    const { toBag } = moveAllPreview(registry, mine, plain);
+    expect(toBag.length).toBeGreaterThan(0);
     expect(screen.getByTestId('transfer-leaves')).toHaveTextContent(
-      'Leaves your Defensive and Ultimate behind',
+      `${toBag.length} constructs to your bag`,
     );
   });
 
-  it('a transfer counts the sockets it moves and names the runes that leave, by the pull rule', () => {
+  it("Move all onto a weapon of another class says which constructs sit dormant there; a construct's runes travel with it", () => {
     const p = store().profile;
-    // A rare sword's two sockets onto a common one (one a move): Quick has no socket there.
+    // A rare sword's Strikes onto a wand: a wand can't express a Strike.
     const worn = withRunes(rareSword('w1'), [split, quick]);
-    const common = { ...p.equipped.weapon!, uid: 'w2' };
-    store().setProfile({
-      ...p,
-      scrap: 999,
-      equipped: { ...p.equipped, weapon: worn },
-      bag: [common],
-    });
-    show('w2');
-    expect(screen.getByTestId('item-compare')).toHaveTextContent(
-      'to move it, its 1 socket included',
+    const wand = generateItem(
+      registry,
+      { uid: 'w2', ilvl: 2, rarity: 'rare', slot: 'weapon', baseId: 'wand', mana: 'fire' },
+      new SeededRNG(4),
     );
-    expect(screen.getByTestId('transfer-runes')).toHaveTextContent(
-      'Destroys Quick I: no socket for it there',
+    // Minted, as every worn construct is: the preview names the dormant ones by uid.
+    store().setProfile(wearing({ ...p, scrap: 999, bag: [wand] }, worn));
+    show('w2');
+    const minted = store().profile.equipped.weapon!;
+    const { dormant, moveset } = moveAllPreview(registry, minted, wand);
+    expect(dormant.length).toBeGreaterThan(0);
+    expect(screen.getByTestId('transfer-dormant')).toHaveTextContent(
+      `${dormant.length} constructs dormant there`,
     );
-    act(() => store().setUnsocket('pay'));
-    expect(screen.getByTestId('transfer-runes')).toHaveTextContent('Quick I back to your pouch');
-    act(() => store().setUnsocket('destroy'));
-    fireEvent.click(screen.getByTestId('transfer-button'));
-    expect(
-      screen.getByText(/Your moveset moved onto .+ · \+1 Link · destroys Quick I$/),
-    ).toBeInTheDocument();
-    expect(store().profile.equipped.weapon!.uid).toBe('w2');
+    // The sockets belong to the construct: the runes are on the preview's moveset, nothing destroyed.
+    expect(moveset.chains.primary!.moves[0].runes).toEqual([split, quick]);
+    expect(screen.queryByTestId('transfer-runes')).toBeNull();
   });
 
   it("full compare adds a bag item's stat lines and a weapon's moveset", () => {
@@ -459,14 +461,15 @@ describe('the compare pane', () => {
       { uid: 'b1', ilvl: 3, rarity: 'legendary', slot: 'boots', mana: 'fire' },
       new SeededRNG(4),
     );
-    put({ ...boots, legendary: { id: 'nightstalker', value: 30, roll: 0.5 } });
+    // Rimeheart rides the Ultimate, which an uncommon sword has no slot for.
+    put({ ...boots, legendary: { id: 'rimeheart', value: 30, roll: 0.5 } });
     show('b1');
     expect(screen.getByTestId('legendary-dead')).toHaveTextContent(
-      "Needs a Defensive: your weapon doesn't carry one",
+      "Needs an Ultimate: your weapon doesn't carry one",
     );
   });
 
-  it('locked, Equip, Salvage, Lock, the bind choice, Transfer and Forge it give way to a note', () => {
+  it('locked, Equip, Salvage, Lock, the bind choice, Move all and Forge it give way to a note', () => {
     put(helm('storm'), rareSword('w1'));
     const view = show('h1', { locked: true });
     // Nothing salvages mid-dive, so the engine isn't asked.

```

Apply to `packages/client/src/features/delve/hub/loadout/__tests__/EquippedPane.test.tsx`:

```diff
@@ -99,10 +99,11 @@ describe('the equipped pane', () => {
     const props = open();
     const box = screen.getByTestId('loadout-moveset');
     expect(box).toHaveTextContent(`Moveset · ${store().profile.equipped.weapon!.name}`);
-    // The common sword carries Basic and Primary.
+    // The uncommon sword: its Basic, a two-slot Primary and a Defensive; no Ultimate.
     expect(screen.getByTestId('loadout-moveset-basic')).toHaveTextContent('Basic 3/5');
-    expect(screen.getByTestId('loadout-moveset-primary')).toHaveTextContent('Primary 1/5');
-    expect(screen.getByTestId('loadout-moveset-defensive')).toHaveTextContent('Defensive —');
+    expect(screen.getByTestId('loadout-moveset-primary')).toHaveTextContent('Primary 2/5');
+    expect(screen.getByTestId('loadout-moveset-defensive')).toHaveTextContent('Defensive 1/5');
+    expect(screen.getByTestId('loadout-moveset-ultimate')).toHaveTextContent('Ultimate —');
     fireEvent.click(within(box).getByRole('button', { name: 'Skills ›' }));
     expect(props.go).toHaveBeenCalledWith({ tab: 'skills' });
   });

```

Apply to `packages/client/src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx`:

```diff
@@ -248,8 +248,9 @@ describe('LoadoutTab', () => {
   });
 
   it('X salvages a precious item at once, and says the Links it gave', () => {
-    // Three extra Primary slots: two Links past the one a rare forge grants free.
-    put(rareSword('w1', { primary: 4 }));
+    // Two Primary slots bought on it: a Link each on salvage (the constructs spec §3.2).
+    const w = rareSword('w1', { primary: 4 });
+    put({ ...w, moveset: { ...w.moveset!, bought: { primary: 2 } } });
     const { props } = open({ link: { tab: 'loadout', uid: 'w1' } });
     expect(screen.getByTestId('salvage-button')).toHaveTextContent(
       /^Salvage · \+2 Links · \+\d+ scrap/,
@@ -264,6 +265,9 @@ describe('LoadoutTab', () => {
     useDelveStore.setState({ unsocket: null });
     putRunedSword('w2');
     open({ link: { tab: 'loadout', uid: 'w2' } });
+    // The pull rule 'pay' as shipped; 'destroy' under the dev override.
+    expect(screen.getByTestId('salvage-button')).toHaveTextContent('Split III back to your pouch');
+    act(() => store().setUnsocket('destroy'));
     expect(screen.getByTestId('salvage-button')).toHaveTextContent('destroys Split III');
     act(() => store().setUnsocket('pay'));
     expect(screen.getByTestId('salvage-button')).toHaveTextContent('Split III back to your pouch');

```

## Chunk 18: Task 6 — The client on the new bundle (continued)

Apply to `packages/client/src/features/delve/hub/loadout/__tests__/TakeSheet.test.tsx`:

```diff
@@ -25,11 +25,11 @@ describe('TakeSheet', () => {
     store().setProfile({ ...store().profile, bag: [rareSword('w1')] });
   });
 
-  it('offers Equip as it is and Transfer with their Power and the price; Transfer carries the guided-start target', () => {
+  it('offers Equip as it is and Move all with their Power, free; Move all carries the guided-start target', () => {
     render(<TakeSheet uid="w1" onClose={vi.fn()} />);
     expect(screen.getByTestId('take-equip')).toHaveTextContent(/Equip as it is · [+−±]\d/);
     expect(screen.getByTestId('take-transfer')).toHaveTextContent(
-      /Transfer my moveset here · .*scrap/,
+      /^Move all my constructs here · [+−±]\d.* Power$/,
     );
     expect(screen.getByTestId('take-transfer')).toHaveAttribute(
       'data-tutorial',
@@ -37,16 +37,13 @@ describe('TakeSheet', () => {
     );
   });
 
-  it('Transfer moves your moveset onto it and wears it; each closes the sheet', () => {
+  it("Move all is the engine's op (B2 fills it): until then it refuses, and the sheet stays open", () => {
     const onClose = vi.fn();
     const before = store().profile.equipped.weapon!;
     render(<TakeSheet uid="w1" onClose={onClose} />);
     fireEvent.click(screen.getByTestId('take-transfer'));
-    expect(store().profile.equipped.weapon?.uid).toBe('w1');
-    expect(store().profile.equipped.weapon?.moveset?.chains.primary).toEqual(
-      before.moveset!.chains.primary,
-    );
-    expect(onClose).toHaveBeenCalled();
+    expect(store().profile.equipped.weapon?.uid).toBe(before.uid);
+    expect(onClose).not.toHaveBeenCalled();
   });
 
   it('Equip wears it as it is, its moveset its own', () => {

```

Apply to `packages/client/src/features/delve/hub/skills/__tests__/ApplyBar.test.tsx`:

```diff
@@ -56,7 +56,7 @@ describe('ApplyBar', () => {
     draftLance();
     fireEvent.click(screen.getByTestId('chain-apply'));
     expect(onApply).toHaveBeenCalledOnce();
-    expect(chains().primary.moves[0].form).toBe('bolt'); // the save untouched
+    expect(chains().primary.moves[0].form).toBe('strike'); // the save untouched
     expect(price()).toHaveTextContent('1 unapplied change');
   });
 

```

Apply to `packages/client/src/features/delve/hub/skills/__tests__/ApplySheet.test.tsx`:

```diff
@@ -24,7 +24,7 @@ const renderSheet = () =>
       <ApplySheet skill="primary" onClose={onClose} />
     </MemoryRouter>,
   );
-/** The Primary's Bolt made a Lance. */
+/** The Primary's first Strike made a Lance. */
 const draftLance = () => {
   const primary = chains().primary;
   act(() =>
@@ -46,8 +46,8 @@ describe('the Apply sheet', () => {
     draftLance();
     renderSheet();
     const sheet = screen.getByTestId('apply-sheet');
-    expect(within(sheet).getByTestId('apply-line-primary')).toHaveTextContent('light Fire Bolt');
-    expect(within(sheet).getByTestId('apply-line-primary')).toHaveTextContent('light Fire Lance');
+    expect(within(sheet).getByTestId('apply-line-primary')).toHaveTextContent('medium Fire Strike');
+    expect(within(sheet).getByTestId('apply-line-primary')).toHaveTextContent('medium Fire Lance');
     expect(within(sheet).getByTestId('apply-sheet-price')).toHaveTextContent(
       'free until your first dive',
     );
@@ -73,7 +73,7 @@ describe('the Apply sheet', () => {
     fireEvent.click(within(screen.getByTestId('apply-sheet')).getByRole('button', { name: /Back/ }));
     expect(onClose).toHaveBeenCalledOnce();
     expect(store().chainDraft?.chains.primary?.moves[0].form).toBe('lance');
-    expect(chains().primary.moves[0].form).toBe('bolt');
+    expect(chains().primary.moves[0].form).toBe('strike');
   });
 
   it('Discard changes reverts the draft and closes it', () => {
@@ -90,7 +90,7 @@ describe('the Apply sheet', () => {
     act(() =>
       store().editDraft('primary', {
         ...primary,
-        moves: primary.moves.map((m) => ({ ...m, runes: [{ id: 'split', tier: 1 as const }] })),
+        moves: primary.moves.map((m) => ({ ...m, runes: [{ id: 'chain', tier: 1 as const }] })),
       }),
     );
     renderSheet();
@@ -112,7 +112,7 @@ describe('the Apply sheet', () => {
     expect(sandbox.loadedWeapon?.uid).toBe(store().profile.equipped.weapon!.uid);
     expect(sandbox.primary).toBe('fire');
     // The draft stays a draft: the save is untouched, the draft as it was.
-    expect(chains().primary.moves[0].form).toBe('bolt');
+    expect(chains().primary.moves[0].form).toBe('strike');
     expect(store().chainDraft?.chains.primary?.moves[0].form).toBe('lance');
     expect(onClose).toHaveBeenCalledOnce();
     expect(mockNavigate).toHaveBeenCalledWith('/delve/training', {
@@ -125,19 +125,20 @@ describe('the Apply sheet', () => {
     act(() =>
       store().editDraft('primary', {
         ...primary,
-        moves: primary.moves.map((m) => ({ ...m, runes: [{ id: 'split', tier: 1 as const }] })),
+        moves: primary.moves.map((m) => ({ ...m, runes: [{ id: 'chain', tier: 1 as const }] })),
       }),
     );
     renderSheet();
     expect(screen.getByTestId('apply-sheet-try')).toBeEnabled();
     fireEvent.click(screen.getByTestId('apply-sheet-try'));
     expect(useSandboxStore.getState().chains.primary.moves[0].runes).toEqual([
-      { id: 'split', tier: 1 },
+      { id: 'chain', tier: 1 },
     ]);
   });
 
   it('names what Apply destroys', () => {
-    // A socketed rune pulled under the shipped rule (destroy): the price says so.
+    // A socketed rune pulled under the 'destroy' rule (the dev override): the price says so.
+    act(() => store().setUnsocket('destroy'));
     const runed = { ...chains().primary.moves[0], runes: [{ id: 'quick', tier: 3 as const }] };
     const p = store().profile;
     const weapon = p.equipped.weapon!;

```

Apply to `packages/client/src/features/delve/hub/skills/__tests__/MoveRows.test.tsx`:

```diff
@@ -3,6 +3,7 @@ import { screen, fireEvent, within } from '@testing-library/react';
 import { defaultMoveset, heroChains, type Chains, type ChainSkill } from '@alloy/engine';
 import { getDelveRegistry } from '../../../registry';
 import { useDelveStore } from '@/stores/delveStore';
+import { lancePrimary, wearing } from '../../../__tests__/armed';
 import { edit, renderSkills, stepTo, valuesOf } from './harness';
 
 vi.mock('react-router', async () => {
@@ -17,7 +18,7 @@ const saved = () => heroChains(registry, store().profile.equipped, store().profi
 const summary = () => screen.getByTestId('abilities-summary');
 const damage = () => screen.getByTestId('stat-damage').textContent;
 
-/** The starting sword made epic, every chain at five slots, the Primary its four default Bolts. */
+/** The starting sword made epic, every chain at five slots, the Primary four Lances. */
 function roomy() {
   const p = store().profile;
   const weapon = { ...p.equipped.weapon!, rarity: 'epic' as const };
@@ -28,11 +29,13 @@ function roomy() {
     ultimate: 1,
   });
   const slots: Record<ChainSkill, number> = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };
-  store().setProfile({
-    ...p,
-    pair: { primary: 'fire', secondary: 'nature' },
-    equipped: { ...p.equipped, weapon: { ...weapon, moveset: { chains: moveset.chains, slots } } },
-  });
+  const chains = { ...moveset.chains, primary: lancePrimary() };
+  store().setProfile(
+    wearing(
+      { ...p, pair: { primary: 'fire', secondary: 'nature' } },
+      { ...weapon, moveset: { chains, slots, bought: {} } },
+    ),
+  );
 }
 
 describe('the move editor', () => {
@@ -68,7 +71,7 @@ describe('the move editor', () => {
     stepTo('move-kind', 'Heavy');
     expect(draft()!.moves[0].kind).toBe('heavy');
     expect(saved().primary.moves[0].kind).toBe('light'); // a draft until Apply
-    expect(summary()).toHaveTextContent('heavy Fire Bolt · medium Fire Bolt');
+    expect(summary()).toHaveTextContent('heavy Fire Lance · medium Fire Lance');
     expect(damage()).not.toBe(before);
   });
 
@@ -89,7 +92,7 @@ describe('the move editor', () => {
     expect(position).toHaveAttribute('aria-valuetext', 'Position 1 of 4');
     fireEvent.keyDown(position, { key: 'ArrowRight' });
     expect(summary()).toHaveTextContent(
-      'medium Fire Bolt · light Fire Bolt · medium Fire Bolt · heavy Fire Bolt',
+      'medium Fire Lance · light Fire Lance · medium Fire Lance · heavy Fire Lance',
     );
     expect(screen.getByTestId('move-1')).toHaveAttribute('aria-pressed', 'true');
     expect(screen.getByTestId('move-position')).toHaveAttribute(
@@ -97,8 +100,8 @@ describe('the move editor', () => {
       'Position 2 of 4',
     );
     expect(document.activeElement).toBe(screen.getByTestId('move-position'));
-    // The draft's origins follow the move: Apply's price sees a reorder, not two new moves.
-    expect(store().chainDraft!.origins.primary).toEqual([1, 0, 2, 3]);
+    // The moves keep their uids through the move: Apply's price sees a reorder, not two new moves.
+    expect(store().chainDraft!.chains.primary!.moves.every((m) => m.uid)).toBe(true);
   });
 
   it("Payment is the chain's: one stepper for every move", () => {
@@ -116,15 +119,15 @@ describe('the move editor', () => {
     fireEvent.click(screen.getByTestId('move-form'));
     const grid = screen.getByTestId('form-picker');
     expect(grid).toHaveAttribute('data-pad-scope');
-    expect(within(grid).getByTestId('form-bolt')).toHaveAttribute('aria-pressed', 'true');
-    expect(within(grid).getByTestId('form-damage-lance')).toHaveTextContent(
+    expect(within(grid).getByTestId('form-lance')).toHaveAttribute('aria-pressed', 'true');
+    expect(within(grid).getByTestId('form-damage-burst')).toHaveTextContent(
       /chain damage a second/,
     );
     // A defensive form is no Primary's.
     expect(within(grid).queryByTestId('form-ward')).toBeNull();
-    fireEvent.click(within(grid).getByTestId('form-lance'));
+    fireEvent.click(within(grid).getByTestId('form-burst'));
     expect(screen.queryByTestId('form-picker')).toBeNull();
-    expect(draft()!.moves[0].form).toBe('lance');
+    expect(draft()!.moves[0].form).toBe('burst');
     expect(document.activeElement).toBe(screen.getByTestId('move-form'));
   });
 

```

Apply to `packages/client/src/features/delve/hub/skills/__tests__/SkillStrip.test.tsx`:

```diff
@@ -1,6 +1,6 @@
 import { describe, it, expect, beforeEach, vi } from 'vitest';
 import { screen, fireEvent, within } from '@testing-library/react';
-import { carriedByText, defaultMoveset, type ChainSkill } from '@alloy/engine';
+import { OPEN_SKILL_TEXT, defaultMoveset, type ChainSkill } from '@alloy/engine';
 import { getDelveRegistry } from '../../../registry';
 import { useDelveStore } from '@/stores/delveStore';
 import { armed } from '../../../__tests__/armed';
@@ -28,7 +28,10 @@ function roomy() {
   const slots = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };
   store().setProfile({
     ...p,
-    equipped: { ...p.equipped, weapon: { ...weapon, moveset: { chains: moveset.chains, slots } } },
+    equipped: {
+      ...p.equipped,
+      weapon: { ...weapon, moveset: { chains: moveset.chains, slots, bought: {} } },
+    },
   });
 }
 
@@ -60,15 +63,15 @@ describe('the skill strip', () => {
     expect(tab('basic').textContent).toMatch(/^Basic\s*3 of 5 · free$/);
   });
 
-  it('an uncarried skill is a dimmed tab whose line says what carries it; it can still be chosen', () => {
-    renderSkills(); // the new save's common sword: the Basic alone
-    for (const s of ['primary', 'defensive', 'ultimate'] as const) {
-      const line = within(tab(s)).getByText(carriedByText(registry, s));
+  it('a skill with no slot is a dimmed tab whose line says where it opens; it can still be chosen', () => {
+    renderSkills(); // the new save's common sword: its Basic and a two-slot Primary
+    for (const s of ['defensive', 'ultimate'] as const) {
+      const line = within(tab(s)).getByText(OPEN_SKILL_TEXT);
       expect(line).toHaveAttribute('data-absent');
       expect(tab(s)).toBeEnabled();
       fireEvent.click(tab(s));
       expect(tab(s)).toHaveAttribute('aria-selected', 'true');
-      expect(screen.getByTestId('abilities-summary')).toHaveTextContent(carriedByText(registry, s));
+      expect(screen.getByTestId('abilities-summary')).toHaveTextContent(OPEN_SKILL_TEXT);
     }
   });
 

```

Apply to `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`:

```diff
@@ -1,7 +1,7 @@
 import { describe, it, expect, beforeEach, vi } from 'vitest';
 import { act, screen, fireEvent, within } from '@testing-library/react';
 import {
-  carriedByText,
+  OPEN_SKILL_TEXT,
   defaultMoveset,
   heroChains,
   pouchCount,
@@ -15,7 +15,7 @@ import {
 } from '@alloy/engine';
 import { getDelveRegistry } from '../../../registry';
 import { useDelveStore } from '@/stores/delveStore';
-import { armed } from '../../../__tests__/armed';
+import { armed, lancePrimary, wearing } from '../../../__tests__/armed';
 import { edit, pickForm, renderSkills, stepTo, valuesOf } from './harness';
 
 const mockNavigate = vi.fn();
@@ -46,9 +46,9 @@ const closeSheet = () =>
 const priceLine = () => screen.getByTestId('chain-price');
 
 /**
- * The starting sword made epic (it carries all four skills), every chain at
- * `slots` slots, holding its default moves (the Primary 4, the basic chain the
- * sword's 3, the others 1), or `chains` over them.
+ * The starting sword made epic (every skill open), every chain at `slots` slots, holding its
+ * default moves (the basic chain the sword's 3, the others 1) but the Primary four Lances
+ * (`lancePrimary`), or `chains` over them; its constructs minted.
  */
 function roomy(slots = 5, over: Partial<Chains> = {}) {
   const p = store().profile;
@@ -61,13 +61,8 @@ function roomy(slots = 5, over: Partial<Chains> = {}) {
     defensive: slots,
     ultimate: slots,
   };
-  store().setProfile({
-    ...p,
-    equipped: {
-      ...p.equipped,
-      weapon: { ...weapon, moveset: { chains: { ...moveset.chains, ...over }, slots: all } },
-    },
-  });
+  const chains = { ...moveset.chains, primary: lancePrimary(), ...over };
+  store().setProfile(wearing(p, { ...weapon, moveset: { chains, slots: all, bought: {} } }));
 }
 
 describe('SkillsTab', () => {
@@ -88,7 +83,7 @@ describe('SkillsTab', () => {
     ]);
     expect(screen.getByTestId('chain-skill-primary')).toHaveAttribute('aria-selected', 'true');
     expect(screen.getByTestId('abilities-summary')).toHaveTextContent(
-      'light Fire Bolt · medium Fire Bolt · medium Fire Bolt · heavy Fire Bolt',
+      'light Fire Lance · medium Fire Lance · medium Fire Lance · heavy Fire Lance',
     );
     expect(screen.getAllByTestId(/^move-\d$/)).toHaveLength(4);
     fireEvent.click(screen.getByTestId('chain-skill-basic'));
@@ -100,17 +95,15 @@ describe('SkillsTab', () => {
     expect(screen.queryByText('Quick and cheap.')).toBeNull(); // nor a cost
   });
 
-  it("a new hero's common sword carries Basic alone; the others show locked, saying what carries them", () => {
+  it("a new hero's common sword holds its Basic and a two-slot Primary; the others show locked, saying where they open", () => {
     store().resetProfile(1234, 'fire'); // the common sword, as a new save has it
     renderSkills();
     expect(screen.getByTestId('mana-pair')).toHaveTextContent('Fire · 2');
     expect(screen.getByTestId('chain-skill-basic')).toHaveTextContent('3 of 3');
-    for (const [skill, text] of [
-      ['primary', 'Carried by uncommon weapons and better'],
-      ['defensive', 'Carried by rare weapons and better'],
-      ['ultimate', 'Carried by epic weapons and better, or an awakened rare'],
-    ]) {
-      // The tab's own line says what carries it.
+    expect(screen.getByTestId('chain-skill-primary')).toHaveTextContent('2 of 2');
+    for (const skill of ['defensive', 'ultimate'] as const) {
+      const text = OPEN_SKILL_TEXT;
+      // The tab's own line says where it opens (the Temper bench).
       expect(screen.getByTestId(`chain-skill-${skill}`)).toHaveTextContent(text);
       fireEvent.click(screen.getByTestId(`chain-skill-${skill}`));
       expect(screen.getByTestId('abilities-summary')).toHaveTextContent(text);
@@ -125,7 +118,7 @@ describe('SkillsTab', () => {
     renderSkills();
     expect(screen.getByTestId('chain-skill-basic')).toHaveTextContent('3 of 3');
     for (const s of ['primary', 'defensive'] as const)
-      expect(screen.getByTestId(`chain-skill-${s}`)).toHaveTextContent(carriedByText(registry, s));
+      expect(screen.getByTestId(`chain-skill-${s}`)).toHaveTextContent(OPEN_SKILL_TEXT);
   });
 
   it('edits a draft: Apply commits it, free before the first dive, and Revert drops it', () => {
@@ -133,17 +126,17 @@ describe('SkillsTab', () => {
     renderSkills();
     expect(priceLine()).toHaveTextContent('No changes');
     edit(0);
-    pickForm('lance');
-    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Fire Lance');
-    expect(chains().primary.moves[0].form).toBe('bolt'); // not yet
+    pickForm('burst');
+    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Fire Burst');
+    expect(chains().primary.moves[0].form).toBe('lance'); // not yet
     expect(priceLine()).toHaveTextContent('free until your first dive');
     fireEvent.click(screen.getByTestId('chain-revert'));
-    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Fire Bolt');
+    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Fire Lance');
     expect(priceLine()).toHaveTextContent('No changes');
-    pickForm('lance');
+    pickForm('burst');
     expect(screen.getByTestId('chain-apply')).toHaveAccessibleName('Apply'); // free: no price
     apply();
-    expect(chains().primary.moves[0].form).toBe('lance');
+    expect(chains().primary.moves[0].form).toBe('burst');
     expect(priceLine()).toHaveTextContent('No changes');
     expect(store().profile.manaDust).toBe(0);
   });
@@ -152,10 +145,10 @@ describe('SkillsTab', () => {
     roomy();
     const { unmount } = renderSkills();
     edit(0);
-    pickForm('lance');
+    pickForm('burst');
     unmount();
     renderSkills();
-    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Fire Lance');
+    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Fire Burst');
     expect(priceLine()).toHaveTextContent('1 unapplied change');
     expect(store().startDive(1)).toBe(false);
     expect(priceLine()).toHaveTextContent('1 unapplied change');
@@ -164,14 +157,14 @@ describe('SkillsTab', () => {
       store().startDive(1);
     });
     expect(priceLine()).toHaveTextContent('No changes');
-    expect(chains().primary.moves[0].form).toBe('bolt');
+    expect(chains().primary.moves[0].form).toBe('lance');
   });
 
   it('Apply is off while the engine would refuse the draft, and says why; the draft stays', () => {
     roomy();
     renderSkills();
     // A storm move the pair (Fire alone) doesn't hold: the engine refuses it.
-    const storm: Move = { kind: 'medium', form: 'bolt', elements: ['storm'] };
+    const storm: Move = { kind: 'medium', form: 'lance', elements: ['storm'] };
     act(() => store().editDraft('primary', { moves: [storm], payment: 'mana' }));
     // The footer says why for the mouse; its Apply opens the sheet, whose Apply is off.
     expect(screen.getByTestId('chain-apply-why')).toHaveTextContent('Pick from your two elements');
@@ -189,11 +182,11 @@ describe('SkillsTab', () => {
     );
     expect(screen.queryByTestId('chain-apply-why')).toBeNull();
     apply();
-    expect(chains().primary.moves).toEqual([{ ...storm, elements: ['fire'] }]);
+    expect(chains().primary.moves).toMatchObject([{ ...storm, elements: ['fire'] }]);
   });
 
   it('Add slot waits while its chain has a change pending; an edit undone by hand leaves none', () => {
-    store().setProfile({ ...store().profile, links: 1, scrap: 25 });
+    store().setProfile({ ...store().profile, links: 2, scrap: 45 });
     renderSkills();
     edit(0);
     pickForm('lance');
@@ -201,23 +194,24 @@ describe('SkillsTab', () => {
     expect(screen.getByTestId('add-slot-why')).toHaveTextContent(
       'Apply or revert this chain first',
     );
-    pickForm('bolt'); // back as it was
+    pickForm('strike'); // back as it was
     expect(priceLine()).toHaveTextContent('No changes');
     expect(store().chainDraft?.chains.primary).toBeUndefined();
     fireEvent.click(screen.getByTestId('add-slot'));
-    expect(screen.getByTestId('chain-slots')).toHaveTextContent('2 of 2 slots');
+    expect(screen.getByTestId('chain-slots')).toHaveTextContent('3 of 3 slots');
     expect(priceLine()).toHaveTextContent('No changes');
-    // A chain's edit made on fewer slots goes when a slot is added to it (the store's rule).
-    const primary = chains().primary;
+    // A chain's edit made on fewer slots goes when a slot is added to it (the store's rule): the
+    // Defensive, whose second slot an uncommon sword can still buy.
+    const defensive = chains().defensive;
     act(() => {
       store().setProfile({ ...store().profile, links: 2, scrap: 40 });
-      store().editDraft('primary', {
-        ...primary,
-        moves: [{ ...primary.moves[0], form: 'lance' }, primary.moves[1]],
+      store().editDraft('defensive', {
+        ...defensive,
+        moves: [{ ...defensive.moves[0], form: 'armor' }],
       });
-      expect(store().addSlot('primary').ok).toBe(true);
+      expect(store().addSlot('defensive').ok).toBe(true);
     });
-    expect(store().chainDraft?.chains.primary).toBeUndefined();
+    expect(store().chainDraft?.chains.defensive).toBeUndefined();
   });
 
   it('equipping another weapon, or a realign, drops the draft', () => {
@@ -227,7 +221,7 @@ describe('SkillsTab', () => {
     store().setProfile({ ...p, bag: [{ ...sword, uid: 'spare' }] });
     renderSkills();
     edit(0);
-    pickForm('lance');
+    pickForm('burst');
     act(() => store().equip('spare'));
     expect(priceLine()).toHaveTextContent('No changes');
     act(() => store().equip(sword.uid));
@@ -238,13 +232,13 @@ describe('SkillsTab', () => {
       store().setProfile({ ...store().profile, manaDust: 500, scrap: 500 });
     });
     edit(0);
-    pickForm('lance');
+    pickForm('burst');
     expect(priceLine()).toHaveTextContent('1 unapplied change');
     act(() => {
       expect(store().realign({ primary: 'frost' }).ok).toBe(true);
     });
     expect(priceLine()).toHaveTextContent('No changes');
-    expect(chains().primary.moves[0]).toMatchObject({ form: 'bolt', elements: ['frost'] });
+    expect(chains().primary.moves[0]).toMatchObject({ form: 'lance', elements: ['frost'] });
   });
 
   it('after the first dive the draft shows its price in Mana Dust, and Apply pays it', () => {
@@ -253,7 +247,7 @@ describe('SkillsTab', () => {
     store().setProfile({ ...p, stats: { ...p.stats, dives: 1 }, manaDust: 4 });
     renderSkills();
     edit(0);
-    pickForm('lance'); // a changed form: editDust
+    pickForm('burst'); // a changed form: editDust
     expect(priceLine()).toHaveTextContent('1 unapplied change · 5 Mana Dust');
     expect(screen.getByTestId('chain-apply-why')).toHaveTextContent('Not enough Mana Dust');
     openSheet();
@@ -265,7 +259,7 @@ describe('SkillsTab', () => {
     // Still one move changed: its kind and form together cost editDust once.
     expect(screen.getByTestId('chain-apply')).toHaveAccessibleName('Apply · 5 Mana Dust');
     apply();
-    expect(chains().primary.moves[0]).toEqual({ kind: 'heavy', form: 'lance', elements: ['fire'] });
+    expect(chains().primary.moves[0]).toMatchObject({ kind: 'heavy', form: 'burst', elements: ['fire'] });
     expect(store().profile.manaDust).toBe(15);
   });
 
@@ -277,14 +271,14 @@ describe('SkillsTab', () => {
     pickForm('burst');
     stepTo('move-elements', 'Fire + Nature');
     apply();
-    expect(chains().primary.moves[1]).toEqual({
+    expect(chains().primary.moves[1]).toMatchObject({
       kind: 'medium',
       form: 'burst',
       elements: ['fire', 'nature'],
     });
     expect(screen.getByTestId('ability-readout')).toHaveTextContent('medium Wildfire Burst');
     expect(screen.getByTestId('abilities-summary')).toHaveTextContent(
-      'light Fire Bolt · medium Wildfire Burst',
+      'light Fire Lance · medium Wildfire Burst',
     );
     expect(screen.getByTestId('element-effect')).toHaveTextContent('Wildfire');
     stepTo('move-elements', 'Nature + Fire'); // the swap is a set of its own
@@ -317,7 +311,7 @@ describe('SkillsTab', () => {
     roomy();
     const num = (id: string) => screen.getByTestId(`num-${id}`);
     const { unmount } = renderSkills();
-    // The Primary's first move, a light Bolt, on the starting sword (tempo 1).
+    // The Primary's first move, a light Lance, on the starting sword (tempo 1).
     expect(num('beat')).toHaveTextContent(/^0\.25s$/);
     edit(0);
     stepTo('move-kind', 'Hold');
@@ -341,12 +335,12 @@ describe('SkillsTab', () => {
   });
 
   it('adds, reorders and removes moves within the slots, never below one', () => {
-    const bolt: Move = { kind: 'light', form: 'bolt', elements: ['fire'] };
+    const bolt: Move = { kind: 'light', form: 'lance', elements: ['fire'] };
     roomy(5, { primary: { moves: [bolt], payment: 'mana' } });
     renderSkills();
     edit(0);
     expect(screen.getByTestId('move-remove')).toBeDisabled();
-    expect(screen.getByTestId('move-remove')).toHaveAccessibleName('Remove light Fire Bolt');
+    expect(screen.getByTestId('move-remove')).toHaveAccessibleName('Remove light Fire Lance');
     fireEvent.click(screen.getByTestId('move-editor-back'));
     fireEvent.click(screen.getByTestId('move-add'));
     expect(document.activeElement).toBe(screen.getByTestId('move-1')); // the new card
@@ -368,7 +362,7 @@ describe('SkillsTab', () => {
   });
 
   it('Position moves a card; the selection follows it', () => {
-    const bolt = (kind: MoveKind): Move => ({ kind, form: 'bolt', elements: ['fire'] });
+    const bolt = (kind: MoveKind): Move => ({ kind, form: 'lance', elements: ['fire'] });
     roomy(5, {
       primary: { moves: [bolt('light'), bolt('medium'), bolt('heavy')], payment: 'mana' },
     });
@@ -379,14 +373,14 @@ describe('SkillsTab', () => {
     expect(screen.getByTestId('move-position')).toHaveAttribute('aria-valuemax', '2');
     stepTo('move-position', 'Position 2 of 3');
     expect(screen.getByTestId('abilities-summary')).toHaveTextContent(
-      'medium Fire Bolt · light Fire Bolt · heavy Fire Bolt',
+      'medium Fire Lance · light Fire Lance · heavy Fire Lance',
     );
     expect(screen.getByTestId('move-1')).toHaveAttribute('aria-pressed', 'true');
-    expect(screen.getByTestId('ability-readout')).toHaveTextContent('light Fire Bolt');
+    expect(screen.getByTestId('ability-readout')).toHaveTextContent('light Fire Lance');
   });
 
   it('two steps of Position move a card two places, the selection with it and the focus kept', () => {
-    const bolt = (kind: MoveKind): Move => ({ kind, form: 'bolt', elements: ['fire'] });
+    const bolt = (kind: MoveKind): Move => ({ kind, form: 'lance', elements: ['fire'] });
     roomy(5, {
       primary: { moves: [bolt('light'), bolt('medium'), bolt('heavy')], payment: 'mana' },
     });
@@ -405,31 +399,32 @@ describe('SkillsTab', () => {
 
   it("shows each chain's slots, and Add slot's price in Links and scrap", () => {
     renderSkills();
-    expect(screen.queryByTestId('move-add')).toBeNull(); // the Primary's one slot is used
-    expect(screen.getByTestId('chain-slots')).toHaveTextContent('1 of 1 slots');
-    expect(screen.getByTestId('add-slot')).toHaveTextContent('+ Slot1 Link · 20 scrap');
+    expect(screen.queryByTestId('move-add')).toBeNull(); // the Primary's two slots are used
+    expect(screen.getByTestId('chain-slots')).toHaveTextContent('2 of 2 slots');
+    expect(screen.getByTestId('add-slot')).toHaveTextContent('+ Slot2 Links · 40 scrap');
     expect(screen.getByTestId('add-slot')).toBeDisabled(); // no Links yet
     expect(screen.getByTestId('add-slot-why')).toHaveTextContent('Not enough Links');
     expect(screen.getByTestId('add-slot')).toHaveAttribute(
       'aria-describedby',
       screen.getByTestId('add-slot-why').id,
     );
-    act(() => store().setProfile({ ...store().profile, links: 1, scrap: 0 }));
+    act(() => store().setProfile({ ...store().profile, links: 2, scrap: 0 }));
     expect(screen.getByTestId('add-slot-why')).toHaveTextContent('Not enough scrap');
-    act(() => store().setProfile({ ...store().profile, links: 1, scrap: 25 }));
+    act(() => store().setProfile({ ...store().profile, links: 2, scrap: 45 }));
     fireEvent.click(screen.getByTestId('add-slot'));
     expect(store().profile).toMatchObject({ links: 0, scrap: 5 });
-    expect(screen.getByTestId('chain-slots')).toHaveTextContent('2 of 2 slots');
-    expect(screen.getByTestId('chain-skill-primary')).toHaveTextContent('2 of 2');
-    expect(screen.getByTestId('add-slot')).toHaveTextContent('2 Links · 40 scrap');
-    // The sword's basic chain starts at its string's 3 slots: its 4th costs 3 Links.
+    expect(screen.getByTestId('chain-slots')).toHaveTextContent('3 of 3 slots');
+    expect(screen.getByTestId('chain-skill-primary')).toHaveTextContent('3 of 3');
+    // An uncommon sword's Primary stops at 3 (the slot table's ceiling): nothing more to buy.
+    expect(screen.queryByTestId('add-slot')).toBeNull();
+    // Its basic chain starts at its string's 3 slots, its ceiling too.
     fireEvent.click(screen.getByTestId('chain-skill-basic'));
     expect(screen.getByTestId('chain-slots')).toHaveTextContent('3 of 3 slots');
-    expect(screen.getByTestId('add-slot')).toHaveTextContent('3 Links · 60 scrap');
+    expect(screen.queryByTestId('add-slot')).toBeNull();
   });
 
   it('offers + Slot beside + Move while the chain is under five slots, and none at five', () => {
-    const bolt: Move = { kind: 'light', form: 'bolt', elements: ['fire'] };
+    const bolt: Move = { kind: 'light', form: 'lance', elements: ['fire'] };
     roomy(3, { primary: { moves: [bolt], payment: 'mana' } });
     renderSkills();
     expect(screen.getByTestId('move-add')).toBeInTheDocument();
@@ -440,7 +435,7 @@ describe('SkillsTab', () => {
   });
 
   it("a refused Add slot or Apply says the engine's reason on the lane's message line", () => {
-    store().setProfile({ ...store().profile, links: 1, scrap: 25 });
+    store().setProfile({ ...store().profile, links: 2, scrap: 45 });
     renderSkills();
     const refuse = (reason: string) => ({ ok: false, profile: store().profile, reason });
     vi.spyOn(store(), 'addSlot').mockReturnValueOnce(refuse('Not now'));
@@ -456,12 +451,12 @@ describe('SkillsTab', () => {
   });
 
   it('marks a move outside the pair off-pair, and never offers its element to another', () => {
-    const storm: Move = { kind: 'medium', form: 'bolt', elements: ['storm'] };
-    const fire: Move = { kind: 'medium', form: 'bolt', elements: ['fire'] };
+    const storm: Move = { kind: 'medium', form: 'lance', elements: ['storm'] };
+    const fire: Move = { kind: 'medium', form: 'lance', elements: ['fire'] };
     roomy(5, { primary: { moves: [storm, fire], payment: 'mana' } });
     renderSkills();
     expect(screen.getAllByTestId('card-off-pair')).toHaveLength(1);
-    expect(screen.getByTestId('move-0')).toHaveAccessibleName('medium Storm Bolt, off-pair');
+    expect(screen.getByTestId('move-0')).toHaveAccessibleName('medium Storm Lance, off-pair');
     edit(0);
     expect(screen.getByTestId('move-elements')).toHaveAttribute(
       'aria-valuetext',
@@ -502,7 +497,7 @@ describe('SkillsTab', () => {
     stepTo('move-elements', 'Storm');
     apply();
     expect(chains().defensive.moves[0].form).toBe('armor');
-    expect(chains().basic[2]).toEqual({ kind: 'heavy', element: 'storm' });
+    expect(chains().basic[2]).toMatchObject({ kind: 'heavy', element: 'storm' });
   });
 
   it('warns when a mana cost is bigger than the pool', () => {
@@ -546,7 +541,7 @@ describe('SkillsTab', () => {
     expect(screen.getByTestId('move-2')).toBeEnabled();
     fireEvent.click(screen.getByTestId('move-2'));
     expect(screen.getByTestId('move-2')).toHaveAttribute('aria-pressed', 'true');
-    expect(screen.getByTestId('ability-readout')).toHaveTextContent('medium Fire Bolt');
+    expect(screen.getByTestId('ability-readout')).toHaveTextContent('medium Fire Lance');
     expect(screen.queryByTestId('move-editor')).toBeNull();
     expect(screen.getByTestId('move-add')).toBeDisabled();
   });
@@ -568,7 +563,8 @@ describe('SkillsTab', () => {
   });
 });
 
-const split = { id: 'split', tier: 1 } as const;
+const widen = { id: 'widen', tier: 1 } as const;
+const quick = { id: 'quick', tier: 1 } as const;
 
 describe('SkillsTab: sockets and runes', () => {
   beforeEach(() => {
@@ -579,8 +575,8 @@ describe('SkillsTab: sockets and runes', () => {
   });
 
   /**
-   * The starting sword (common: one socket a move): its Primary Bolt's sockets `bolt` (none
-   * open when null), its blows' sockets `blows`, and the pouch `pouch`.
+   * The armed sword (uncommon): each of its Primary Strikes' sockets `bolt` (none open when
+   * null), its blows' sockets `blows`, and the pouch `pouch`; its constructs minted.
    */
   function socketed(
     bolt: (RuneRef | null)[] | null,
@@ -596,11 +592,9 @@ describe('SkillsTab: sockets and runes', () => {
       basic: moveset.chains.basic!.map((b, i) => (blows[i] ? { ...b, runes: blows[i] } : b)),
       primary: { ...primary, moves: primary.moves.map((m) => (bolt ? { ...m, runes: bolt } : m)) },
     };
-    store().setProfile({
-      ...p,
-      runes: pouch,
-      equipped: { ...p.equipped, weapon: { ...sword, moveset: { ...moveset, chains } } },
-    });
+    store().setProfile(
+      wearing({ ...p, runes: pouch }, { ...sword, moveset: { ...moveset, chains } }),
+    );
   }
   /** Tap socket `n` (1-based, by its name) under card `i`. */
   const tapSocket = (i: number, name: string) =>
@@ -610,7 +604,7 @@ describe('SkillsTab: sockets and runes', () => {
   it('+ socket opens one on the chosen move at its price; Apply pays the Links and scrap', () => {
     store().setProfile({ ...store().profile, links: 1, scrap: 20 });
     renderSkills();
-    expect(screen.getByTestId('socket-count')).toHaveTextContent('Sockets · 0 of 1');
+    expect(screen.getByTestId('socket-count')).toHaveTextContent('Sockets · 0 of 3');
     edit(0);
     const open = screen.getByTestId('socket-open');
     expect(open).toHaveTextContent('Open a socket');
@@ -618,7 +612,7 @@ describe('SkillsTab: sockets and runes', () => {
     expect(open).toHaveTextContent('20 scrap');
     fireEvent.click(open);
     expect(screen.getAllByTestId(/^inspect-socket-/)).toHaveLength(1);
-    expect(screen.queryByTestId('socket-open')).toBeNull(); // a common weapon's cap
+    expect(screen.getByTestId('socket-open')).toBeInTheDocument(); // two more to MAX_SOCKETS
     expect(priceLine()).toHaveTextContent('1 unapplied change · 1 Link · 20 scrap');
     expect(screen.getByTestId('chain-apply')).toHaveAccessibleName('Apply · 1 Link · 20 scrap');
     apply();
@@ -630,7 +624,7 @@ describe('SkillsTab: sockets and runes', () => {
     socketed([null]);
     renderSkills();
     const primary = chains().primary;
-    const moves = primary.moves.map((m) => ({ ...m, runes: [{ id: 'split', tier: 1 as const }] }));
+    const moves = primary.moves.map((m) => ({ ...m, runes: [{ id: 'chain', tier: 1 as const }] }));
     act(() => store().editDraft('primary', { ...primary, moves }));
     const price = screen.getByTestId('chain-price');
     expect(price).toHaveTextContent('Not enough runes in your pouch');
@@ -660,33 +654,34 @@ describe('SkillsTab: sockets and runes', () => {
     renderSkills();
     tapSocket(0, 'Socket 1: empty');
     expect(picker().getByRole('button', { name: 'Quick III ×2' })).toBeInTheDocument();
-    // Widen fits a Burst, a Strike or a Ward, never a Bolt.
-    expect(picker().queryByRole('button', { name: /^Widen/ })).toBeNull();
-    fireEvent.click(picker().getByRole('button', { name: 'Split I ×1' }));
+    // Split fits a Bolt, a Volley or a Barrage, never a Strike.
+    expect(picker().queryByRole('button', { name: /^Split/ })).toBeNull();
+    fireEvent.click(picker().getByRole('button', { name: 'Widen I ×1' }));
     expect(screen.queryByTestId('rune-picker')).toBeNull();
     expect(
-      within(screen.getByTestId('sockets-0')).getByRole('button', { name: 'Socket 1: Split I' }),
+      within(screen.getByTestId('sockets-0')).getByRole('button', { name: 'Socket 1: Widen I' }),
     ).toBeInTheDocument();
     expect(screen.getByTestId('chain-apply')).toHaveAccessibleName('Apply'); // socketing is free
     apply();
-    expect(chains().primary.moves[0].runes).toEqual([split]);
-    expect(pouchCount(store().profile.runes, split)).toBe(0);
+    expect(chains().primary.moves[0].runes).toEqual([widen]);
+    expect(pouchCount(store().profile.runes, widen)).toBe(0);
   });
 
-  it('a filled socket offers Pull: destroyed by the rule, or for scrap and back to the pouch', () => {
-    socketed([split]);
+  it('a filled socket offers Pull: destroyed under that rule, or for scrap and back to the pouch (as shipped)', () => {
+    socketed([widen]);
+    act(() => store().setUnsocket('destroy'));
     renderSkills();
-    tapSocket(0, 'Socket 1: Split I');
+    tapSocket(0, 'Socket 1: Widen I');
     expect(picker().getByTestId('rune-pull')).toHaveTextContent('Pull · destroys it');
     fireEvent.click(picker().getByTestId('rune-pull'));
-    expect(screen.getByTestId('chain-apply')).toHaveAccessibleName('Apply · destroys Split I');
-    expect(priceLine()).toHaveTextContent('1 unapplied change · destroys Split I');
+    expect(screen.getByTestId('chain-apply')).toHaveAccessibleName('Apply · destroys Widen I');
+    expect(priceLine()).toHaveTextContent('1 unapplied change · destroys Widen I');
     fireEvent.click(screen.getByTestId('chain-revert'));
     act(() => {
       store().setUnsocket('pay');
       store().setProfile({ ...store().profile, scrap: 15 });
     });
-    tapSocket(0, 'Socket 1: Split I');
+    tapSocket(0, 'Socket 1: Widen I');
     expect(picker().getByTestId('rune-pull')).toHaveTextContent(
       'Pull · 15 scrap, back to your pouch',
     );
@@ -695,7 +690,7 @@ describe('SkillsTab: sockets and runes', () => {
     apply();
     expect(chains().primary.moves[0].runes).toEqual([null]);
     expect(store().profile.scrap).toBe(0);
-    expect(pouchCount(store().profile.runes, split)).toBe(1);
+    expect(pouchCount(store().profile.runes, widen)).toBe(1);
   });
 
   it('a rune that does nothing on its move is dimmed, with why: Linger on a light blow', () => {
@@ -716,27 +711,27 @@ describe('SkillsTab: sockets and runes', () => {
   });
 
   it("a form a socketed rune doesn't fit is off; the kind stays free", () => {
-    socketed([split]);
+    socketed([widen]);
     renderSkills();
     edit(0);
     fireEvent.click(screen.getByTestId('move-form'));
-    expect(screen.getByTestId('form-volley')).toBeEnabled();
-    for (const f of ['lance', 'burst', 'strike'])
+    expect(screen.getByTestId('form-burst')).toBeEnabled();
+    for (const f of ['lance', 'bolt', 'volley'])
       expect(screen.getByTestId(`form-${f}`), f).toBeDisabled();
     // Each off form says why beside itself.
-    expect(screen.getByTestId('form-burst')).toHaveTextContent("Split doesn't fit a Burst");
+    expect(screen.getByTestId('form-lance')).toHaveTextContent("Widen doesn't fit a Lance");
     fireEvent.click(screen.getByTestId('form-picker-back'));
     stepTo('move-kind', 'Heavy');
     apply();
-    expect(chains().primary.moves[0]).toMatchObject({ kind: 'heavy', runes: [split] });
+    expect(chains().primary.moves[0]).toMatchObject({ kind: 'heavy', runes: [widen] });
   });
 
   it('a reorder carries the runes with their move', () => {
-    const bolt: Move = { kind: 'light', form: 'bolt', elements: ['fire'] };
+    const bolt: Move = { kind: 'light', form: 'lance', elements: ['fire'] };
     roomy(5, {
       primary: {
         moves: [
-          { ...bolt, runes: [split] },
+          { ...bolt, runes: [quick] },
           { ...bolt, kind: 'heavy' },
         ],
         payment: 'mana',
@@ -747,19 +742,19 @@ describe('SkillsTab: sockets and runes', () => {
     stepTo('move-position', 'Position 2 of 2');
     apply();
     expect(chains().primary.moves.map((m) => m.kind)).toEqual(['heavy', 'light']);
-    expect(chains().primary.moves[1].runes).toEqual([split]);
+    expect(chains().primary.moves[1].runes).toEqual([quick]);
     expect(socketsOf(chains().primary.moves[0])).toEqual([]);
   });
 
   it("the editor's socket rows open the rune grid under the rows, as a scope", () => {
-    socketed([null], { split: [1, 0, 0, 0, 0] });
+    socketed([null], { widen: [1, 0, 0, 0, 0] });
     renderSkills();
     const readout = within(screen.getByTestId('ability-readout'));
-    expect(readout.getByTestId('socket-count')).toHaveTextContent('Sockets · 1 of 1');
+    expect(readout.getByTestId('socket-count')).toHaveTextContent('Sockets · 1 of 3');
     edit(0);
     fireEvent.click(readout.getByTestId('inspect-socket-0'));
     expect(readout.getByTestId('rune-picker')).toHaveAttribute('data-pad-scope');
-    expect(readout.getByTestId('rune-pick-split').parentElement!.className).toMatch(/grid-cols-2/);
+    expect(readout.getByTestId('rune-pick-widen').parentElement!.className).toMatch(/grid-cols-2/);
     fireEvent.click(readout.getByTestId('rune-picker-close'));
     expect(readout.queryByTestId('rune-picker')).toBeNull();
     expect(readout.getByTestId('inspect-socket-0')).toBeInTheDocument();

```

Apply to `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.test.tsx`:

```diff
@@ -11,6 +11,7 @@ import { PAD_BUTTONS, type PadButton } from '@/features/gamepad/gamepad';
 import { padPrompts } from '@/features/delve/kit/prompts';
 import { getDelveRegistry } from '../../../registry';
 import { useDelveStore } from '@/stores/delveStore';
+import { lancePrimary, wearing } from '../../../__tests__/armed';
 import { useInputDeviceStore } from '@/stores/inputDeviceStore';
 import { useUIStore } from '@/stores/uiStore';
 import { ONBOARDING } from '../../../onboarding';
@@ -26,17 +27,15 @@ const store = () => useDelveStore.getState();
 /** The hero's chains, as its equipped weapon carries them. */
 const chains = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;
 
-/** The starting sword made epic (all four skills), every chain at five slots, its default moves. */
+/** The starting sword made epic (every skill open), every chain at five slots, its default moves but a four-Lance Primary. */
 function roomy() {
   const p = store().profile;
   const weapon = { ...p.equipped.weapon!, rarity: 'epic' as const };
   const lengths = { basic: 3, primary: 4, defensive: 1, ultimate: 1 };
   const moveset = defaultMoveset(registry, weapon, 'fire', lengths);
   const slots: Record<ChainSkill, number> = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };
-  store().setProfile({
-    ...p,
-    equipped: { ...p.equipped, weapon: { ...weapon, moveset: { chains: moveset.chains, slots } } },
-  });
+  const chains = { ...moveset.chains, primary: lancePrimary() };
+  store().setProfile(wearing(p, { ...weapon, moveset: { chains, slots, bought: {} } }));
 }
 /** A key as the window hears it. */
 const press = (code: string, mods: { altKey?: boolean; ctrlKey?: boolean } = {}) =>
@@ -45,7 +44,7 @@ const press = (code: string, mods: { altKey?: boolean; ctrlKey?: boolean } = {})
 const held = (...on: PadButton[]) =>
   Object.fromEntries(PAD_BUTTONS.map((b) => [b, on.includes(b)])) as Record<PadButton, boolean>;
 const summary = () => screen.getByTestId('abilities-summary');
-const kinds = (...k: MoveKind[]) => k.map((kind) => `${kind} Fire Bolt`).join(' · ');
+const kinds = (...k: MoveKind[]) => k.map((kind) => `${kind} Fire Lance`).join(' · ');
 
 describe('SkillsTab: the footer, the keys and the pad', () => {
   beforeEach(() => {

```

Apply to `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.trail.test.tsx`:

```diff
@@ -65,7 +65,8 @@ describe("the Skills tab under Hesta's lesson (l1-skills)", () => {
     expect(screen.getByTestId('chain-skill-primary')).toHaveAttribute('data-tutorial', 'skills.primary');
     expect(marker()).toEqual(['skills.addSlot', 'add-slot']);
     fireEvent.click(screen.getByTestId('add-slot'));
-    expect(screen.getByTestId('add-slot')).toHaveAttribute('data-tutorial-done', 'true');
+    // At its ceiling (an uncommon sword's Primary stops at 3), Add slot is gone: the trail passes it.
+    expect(screen.queryByTestId('add-slot')).toBeNull();
 
     // The new last move: its card, then its editor's Elements row.
     expect(marker()).toEqual(['skills.card:last', 'move-2']);

```

Apply to `packages/client/src/features/delve/hub/skills/__tests__/draft-equipped.test.ts`:

```diff
@@ -19,7 +19,7 @@ describe('draftEquipped', () => {
     expect(equipped.weapon!.uid).toBe(p.equipped.weapon!.uid);
     expect(equipped.chest).toBe(p.equipped.chest);
     // The save's own weapon is untouched.
-    expect(heroChains(registry, p.equipped, p.pair).primary!.moves[0].form).toBe('bolt');
+    expect(heroChains(registry, p.equipped, p.pair).primary!.moves[0].form).toBe('strike');
   });
 
   it('unarmed, the gear is as worn', () => {

```

Apply to `packages/client/src/features/delve/hub/skills/__tests__/draft-lines.test.ts`:

```diff
@@ -18,7 +18,11 @@ describe('draftLines', () => {
       basic: saved.basic.map((b, i) => (i === 0 ? { ...b, kind: 'medium' as const } : b)),
     });
     expect(lines.map((l) => l.skill)).toEqual(['basic', 'primary']);
-    expect(lines[1]).toMatchObject({ before: 'light Fire Bolt', after: 'heavy Fire Bolt', notes: [] });
+    expect(lines[1]).toMatchObject({
+      before: 'medium Fire Strike · medium Fire Strike',
+      after: 'heavy Fire Strike',
+      notes: [],
+    });
     expect(lines[0].after).toMatch(/^medium Fire blow/);
   });
 

```

Apply to `packages/client/src/features/delve/items/__tests__/MovesetView.test.tsx`:

```diff
@@ -20,20 +20,20 @@ describe('MovesetView', () => {
     expect(screen.getByTestId('moveset-basic')).toHaveTextContent(
       'Basic 3/5 · light Fire blow · light Fire blow · heavy Fire blow',
     );
-    // A new save's common sword: the basic chain alone.
+    // A new save's common sword: its Basic and a two-slot Primary; no Defensive slot.
     expect(screen.getByTestId('moveset-primary')).toHaveTextContent(
-      'Primary: carried by uncommon weapons and better',
+      'Primary 2/5 · medium Fire Strike · medium Fire Strike',
     );
     expect(screen.getByTestId('moveset-defensive')).toHaveTextContent(
-      'Defensive: carried by rare weapons and better',
+      'Defensive: open this skill on the temper bench',
     );
-    expect(screen.getByTestId('item-sockets')).toHaveTextContent('Sockets · up to 1 a move');
+    expect(screen.getByTestId('item-sockets')).toHaveTextContent('Sockets · up to 3 a move');
     expect(screen.getByTestId('item-moveset').outerHTML).not.toMatch(
       /text-(\[(\d|1[0-3])px\]|xs\b)/,
     );
   });
 
-  it("shows a rare weapon's Defensive and its extra Primary slot", () => {
+  it("shows a rare weapon's Defensive and Ultimate at the slot table's starts", () => {
     const w = generateItem(
       registry,
       { uid: 'w1', ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'sword', mana: 'fire' },
@@ -43,9 +43,7 @@ describe('MovesetView', () => {
       <MovesetView item={{ ...w, moveset: defaultMoveset(registry, w, 'fire', { primary: 2 }) }} />,
     );
     expect(screen.getByTestId('moveset-primary')).toHaveTextContent(/^Primary 2\/5 · /);
-    expect(screen.getByTestId('moveset-defensive')).toHaveTextContent(/^Defensive 1\/5 · /);
-    expect(screen.getByTestId('moveset-ultimate')).toHaveTextContent(
-      'Ultimate: carried by epic weapons and better',
-    );
+    expect(screen.getByTestId('moveset-defensive')).toHaveTextContent(/^Defensive 2\/5 · /);
+    expect(screen.getByTestId('moveset-ultimate')).toHaveTextContent(/^Ultimate 1\/5 · /);
   });
 });

```

## Chunk 19: Task 6 — The client on the new bundle (continued)

Apply to `packages/client/src/pages/__tests__/DelveCamp.test.tsx`:

```diff
@@ -189,10 +189,11 @@ describe('DelveCamp', () => {
     const p = useDelveStore.getState().profile;
     expect(p.pair).toEqual({ primary: 'frost', secondary: null });
     expect(p.equipped.weapon!.mana).toBe('frost');
-    // Its common sword carries the basic chain alone, in Frost.
+    // Its common sword holds its basic chain and a two-slot Primary, in Frost.
     const chains = p.equipped.weapon!.moveset!.chains;
     expect(chains.basic!.map((b) => b.element)).toEqual(['frost', 'frost', 'frost']);
-    expect(Object.keys(chains)).toEqual(['basic']);
+    expect(Object.keys(chains)).toEqual(['basic', 'primary']);
+    expect(chains.primary!.moves.map((m) => m.elements)).toEqual([['frost'], ['frost']]);
     // Jump in promised How to delve: Help opens once; closed, the hub is the player's.
     fireEvent.click(within(screen.getByTestId('help-dialog')).getByRole('button', { name: /back/i }));
     expect(screen.queryByTestId('help-dialog')).toBeNull();

```

Apply to `packages/client/src/stores/delveStore.test.ts`:

```diff
@@ -1,6 +1,7 @@
 import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
 import {
   defaultMoveset,
+  mintMoveset,
   generateItem,
   heroChains,
   SeededRNG,
@@ -30,7 +31,7 @@ import {
   selectDraftApply,
 } from './delveStore';
 import { getDelveRegistry } from '@/features/delve/registry';
-import { armed } from '@/features/delve/__tests__/armed';
+import { armed, lancePrimary, wearing } from '@/features/delve/__tests__/armed';
 
 const registry = getDelveRegistry();
 /** The hero's chains, as its equipped weapon carries them. */
@@ -77,7 +78,7 @@ describe('delveStore', () => {
   it('resets a save of another version, and falls back to a new profile when the save is corrupt', () => {
     localStorage.setItem(DELVE_SAVE_KEY, '{"version":12,"broken":true}');
     expect(loadDelveProfile()).toEqual({ reset: true });
-    localStorage.setItem(DELVE_SAVE_KEY, '{"version":13,"broken":true}');
+    localStorage.setItem(DELVE_SAVE_KEY, '{"version":14,"broken":true}');
     expect(loadDelveProfile()).toBeNull();
     localStorage.setItem(DELVE_SAVE_KEY, 'not json');
     expect(loadDelveProfile()).toBeNull();
@@ -118,12 +119,12 @@ describe('delveStore', () => {
       patterns: [],
       essences: [],
     });
-    // A weapon gives a Link for each slot past its base.
+    // A weapon gives a Link for each slot bought on it.
     const sword = useDelveStore.getState().profile.equipped.weapon!;
     const roomy = {
       ...sword,
       uid: 'x3',
-      moveset: defaultMoveset(registry, sword, 'fire', { primary: 3 }),
+      moveset: { ...defaultMoveset(registry, sword, 'fire', { primary: 3 }), bought: { primary: 2 } },
     };
     s.setProfile({ ...useDelveStore.getState().profile, bag: [roomy] });
     expect(useDelveStore.getState().salvage(['x3']).links).toBe(2);
@@ -156,7 +157,9 @@ describe('delveStore', () => {
     };
     const basic = [{ kind: 'hold' as const, element: 'fire' as const }];
     expect(useDelveStore.getState().setChains({ primary: chain, basic }).ok).toBe(true);
-    expect(chains().primary).toEqual(chain);
+    // The new constructs are minted uids (the constructs spec §3.1).
+    expect(chains().primary).toMatchObject(chain);
+    expect(chains().primary.moves[0].uid).toMatch(/^c\d+$/);
     expect(loadDelveProfile()).toMatchObject({
       profile: { equipped: { weapon: { moveset: { chains: { primary: chain, basic } } } } },
     });
@@ -168,20 +171,23 @@ describe('delveStore', () => {
       primary: { moves: [{ kind: 'medium', form: 'nova', elements: ['fire'] }], payment: 'mana' },
     });
     expect(res).toMatchObject({ ok: false, reason: 'Nova is not a primary form' });
-    expect(chains().primary.moves[0].form).toBe('bolt');
+    expect(chains().primary.moves[0].form).toBe('strike');
     expect(chains().basic).toHaveLength(3);
   });
 
   it('adds a slot for Links and scrap', () => {
     const s = () => useDelveStore.getState();
     expect(s().addSlot('primary')).toMatchObject({ ok: false, reason: 'Not enough Links' });
-    s().setProfile({ ...s().profile, links: 1, scrap: 20 });
+    // The Primary's 3rd slot: 2 Links and 40 scrap, bought (the constructs spec §3.2).
+    s().setProfile({ ...s().profile, links: 2, scrap: 40 });
     expect(s().addSlot('primary').ok).toBe(true);
     expect(s().profile).toMatchObject({ links: 0, scrap: 0 });
-    expect(chains().primary.moves).toHaveLength(2);
-    expect(s().addSlot('defensive')).toMatchObject({
+    expect(chains().primary.moves).toHaveLength(3);
+    expect(s().profile.equipped.weapon!.moveset!.bought).toEqual({ primary: 1 });
+    // An uncommon sword's Ultimate starts at 0: it opens on the Temper bench, not here.
+    expect(s().addSlot('ultimate')).toMatchObject({
       ok: false,
-      reason: 'Carried by rare weapons and better',
+      reason: 'Open this skill on the Temper bench',
     });
   });
 
@@ -240,9 +246,9 @@ describe('delveStore', () => {
     vi.resetModules();
     const fresh = (await import('./delveStore')).useDelveStore;
     expect(fresh.getState().notices).toEqual([RESET_NOTICE]);
-    expect(fresh.getState().profile).toMatchObject({ version: 13, scrap: 50 }); // the kit's
+    expect(fresh.getState().profile).toMatchObject({ version: 14, scrap: 50 }); // the kit's
     expect(JSON.parse(localStorage.getItem(DELVE_SAVE_KEY)!)).toMatchObject({
-      version: 13,
+      version: 14,
       scrap: 50,
     });
     // The written-back save loads as it is: no second notice.
@@ -261,9 +267,9 @@ describe('delveStore', () => {
     expect('fuse' in s).toBe(false);
   });
 
-  it("wraps the guided start's ops and Awaken (the tutorial's B1 and B3 fill them)", () => {
+  it("wraps the guided start's ops and Open a skill", () => {
     const s = useDelveStore.getState();
-    for (const op of [s.awaken, s.startTutorial, s.skipTutorial, s.retryTutorialDepth])
+    for (const op of [s.openSkill, s.startTutorial, s.skipTutorial, s.retryTutorialDepth])
       expect(op).toBeTypeOf('function');
     // No tutorial running: its events leave the save as it is.
     const before = s.profile;
@@ -365,7 +371,8 @@ describe('delveStore', () => {
     // The weapon's every chain says so once, the basic one too.
     expect(s().takeNotices()).toEqual([
       "Your basic attack's 1st, 2nd and 3rd blows used Fire, which isn't in your pair; they now use Frost",
-      "Your Bolt's 1st move used Fire, which isn't in your pair; it now uses Frost",
+      "Your Strike's 1st and 2nd moves used Fire, which isn't in your pair; they now use Frost",
+      "Your Ward's 1st move used Fire, which isn't in your pair; it now uses Frost",
     ]);
   });
 
@@ -424,6 +431,8 @@ describe('delveStore', () => {
 });
 
 const split = { id: 'split', tier: 1 } as const;
+/** A rune that fits a Lance (Split never does): the draft tests' socketed rune. */
+const multi = { id: 'multishot', tier: 1 } as const;
 const s = () => useDelveStore.getState();
 
 /** A fresh store module, as on a page load: the override it reads back. */
@@ -444,20 +453,21 @@ describe('delveStore: runes in the draft', () => {
   });
 
   /**
-   * The starting sword (common: one socket a move) with a two-Bolt Primary, each Bolt's sockets
-   * as given (none open when missing), and the profile's `over`.
+   * The armed sword with a two-Lance Primary (a light and a medium: a sword expresses a Lance),
+   * each Lance's sockets as given (none open when missing), its constructs minted, and the
+   * profile's `over`.
    */
   function bolts(runes: ((RuneRef | null)[] | undefined)[], over: Partial<DelveProfile> = {}) {
     const p = s().profile;
     const sword = p.equipped.weapon!;
     const moveset = defaultMoveset(registry, sword, 'fire', { primary: 2 });
-    const primary = moveset.chains.primary!;
+    const primary = lancePrimary(2);
     const moves = primary.moves.map((m, i) => (runes[i] ? { ...m, runes: runes[i] } : m));
     const weapon = {
       ...sword,
       moveset: { ...moveset, chains: { ...moveset.chains, primary: { ...primary, moves } } },
     };
-    s().setProfile({ ...p, ...over, equipped: { ...p.equipped, weapon } });
+    s().setProfile(wearing({ ...p, ...over }, weapon));
   }
   const view = () => draftApply(registry, s().profile, s().chainDraft, s().unsocket);
 
@@ -480,40 +490,40 @@ describe('delveStore: runes in the draft', () => {
   });
 
   it('socketing a pouch rune is free: Apply takes it from the pouch', () => {
-    bolts([[null]], { runes: { split: [1, 0, 0, 0, 0] } });
+    bolts([[null]], { runes: { multishot: [1, 0, 0, 0, 0] } });
     const primary = chains().primary;
     const [first, second] = primary.moves;
-    s().editDraft('primary', { ...primary, moves: [{ ...first, runes: [split] }, second] });
-    expect(s().chainDraft?.origins).toEqual({ primary: [0, 1] });
+    s().editDraft('primary', { ...primary, moves: [{ ...first, runes: [multi] }, second] });
     expect(view().price).toMatchObject({ dust: 0, links: 0, scrap: 0, refundLinks: 0 });
-    expect(pouchCount(view().pouch, split)).toBe(0); // what the picker has left to offer
+    expect(pouchCount(view().pouch, multi)).toBe(0); // what the picker has left to offer
     expect(applyLabel(registry, view().price)).toBe('Apply');
     expect(s().applyDraft().ok).toBe(true);
-    expect(chains().primary.moves[0].runes).toEqual([split]);
-    expect(pouchCount(s().profile.runes, split)).toBe(0);
+    expect(chains().primary.moves[0].runes).toEqual([multi]);
+    expect(pouchCount(s().profile.runes, multi)).toBe(0);
   });
 
-  it("composes the builder's maps into origins; moved and moved back, nothing is left", () => {
-    bolts([[split], [null]]);
+  it('the moves carry their uids through the draft (no origins); moved and moved back, nothing is left', () => {
+    bolts([[multi], [null]]);
     const primary = chains().primary;
     const [a, b] = primary.moves;
     s().editDraft('primary', { ...primary, moves: [b, a] }, [1, 0]); // ▸ on the first
-    expect(s().chainDraft?.origins).toEqual({ primary: [1, 0] });
-    const added = { kind: 'light' as const, form: 'bolt' as const, elements: ['fire' as const] };
+    expect(s().chainDraft?.chains.primary?.moves.map((m) => m.uid)).toEqual([b.uid, a.uid]);
+    expect(view().price).toMatchObject({ dust: 0 }); // a reorder is free
+    const added = { kind: 'light' as const, form: 'lance' as const, elements: ['fire' as const] };
     s().editDraft('primary', { ...primary, moves: [b, a, added] }, [0, 1, null]); // +
-    expect(s().chainDraft?.origins).toEqual({ primary: [1, 0, null] });
+    expect(s().chainDraft?.chains.primary?.moves.map((m) => m.uid)).toEqual([b.uid, a.uid, undefined]);
     s().editDraft('primary', { ...primary, moves: [b, a] }, [0, 1]); // × on the new one
     s().editDraft('primary', { ...primary, moves: [a, b] }, [1, 0]); // ◂ back
     expect(s().chainDraft?.chains).toEqual({});
-    expect(s().chainDraft?.origins).toEqual({});
   });
 
-  it('a removed move refunds its socket as a Link, netted in the label; its rune goes by the rule', () => {
-    bolts([[split], [null]]);
+  it('a removed move refunds its sockets as Links, netted in the label; its rune goes by the rule (destroy, the dev override)', () => {
+    bolts([[multi], [null]]);
+    s().setUnsocket('destroy');
     const primary = chains().primary;
-    s().editDraft('primary', { ...primary, moves: [primary.moves[1]] }, [1]); // × on the Split Bolt
-    expect(view().price).toMatchObject({ links: 0, refundLinks: 1, destroys: [split] });
-    expect(applyLabel(registry, view().price)).toBe('Apply · +1 Link · destroys Split I');
+    s().editDraft('primary', { ...primary, moves: [primary.moves[1]] }, [1]); // × on the Multi-shot Lance
+    expect(view().price).toMatchObject({ links: 0, refundLinks: 1, destroys: [multi] });
+    expect(applyLabel(registry, view().price)).toBe('Apply · +1 Link · destroys Multi-shot I');
     expect(s().applyDraft().ok).toBe(true);
     expect(chains().primary.moves).toEqual([primary.moves[1]]);
     expect(s().profile.links).toBe(1);
@@ -536,7 +546,7 @@ describe('delveStore: runes in the draft', () => {
     bolts([[null]], { runes: {} });
     const primary = chains().primary;
     const [first, second] = primary.moves;
-    s().editDraft('primary', { ...primary, moves: [{ ...first, runes: [split] }, second] });
+    s().editDraft('primary', { ...primary, moves: [{ ...first, runes: [multi] }, second] });
     expect(view()).toMatchObject({ price: null, refused: 'Not enough runes in your pouch' });
     expect(view().pouch).toEqual({});
   });
@@ -555,18 +565,18 @@ describe('delveStore: runes in the draft', () => {
   });
 
   it('the dev override sets the pull rule: paying, a pull costs scrap and the rune comes back', () => {
-    bolts([[split]], { scrap: 100 });
+    bolts([[multi]], { scrap: 100 });
     s().setUnsocket('pay');
     expect(localStorage.getItem(UNSOCKET_KEY)).toBe('pay');
     const primary = chains().primary;
     const [first, second] = primary.moves;
     s().editDraft('primary', { ...primary, moves: [{ ...first, runes: [null] }, second] });
-    expect(view().price).toMatchObject({ scrap: 15, destroys: [], returns: [split] });
+    expect(view().price).toMatchObject({ scrap: 15, destroys: [], returns: [multi] });
     expect(applyLabel(registry, view().price)).toBe('Apply · 15 scrap');
-    expect(pouchCount(view().pouch, split)).toBe(1); // free to socket elsewhere in this Apply
+    expect(pouchCount(view().pouch, multi)).toBe(1); // free to socket elsewhere in this Apply
     expect(s().applyDraft().ok).toBe(true);
     expect(s().profile.scrap).toBe(85);
-    expect(pouchCount(s().profile.runes, split)).toBe(1);
+    expect(pouchCount(s().profile.runes, multi)).toBe(1);
   });
 
   it('reads the override back on this device, in dev builds only', async () => {
@@ -595,20 +605,24 @@ describe('delveStore: runes outside the draft', () => {
     useDelveStore.setState({ unsocket: null });
   });
 
-  /** The starting sword, its one Bolt's sockets `runes` (under `uid` when given: a bag copy). */
-  function swordWith(runes: (RuneRef | null)[], uid?: string): GearItem {
+  /**
+   * The armed sword, its first Strike's sockets `runes` (under `uid` when given: a bag copy), its
+   * constructs minted from `from` (save v14 requires their uids; two copies take different runs).
+   */
+  function swordWith(runes: (RuneRef | null)[], uid?: string, from = 500): GearItem {
     const sword = s().profile.equipped.weapon!;
-    const moveset = defaultMoveset(registry, sword, 'fire');
-    const primary = moveset.chains.primary!;
+    const base = defaultMoveset(registry, sword, 'fire');
+    const primary = base.chains.primary!;
     const moves = [{ ...primary.moves[0], runes }];
-    const chains = { ...moveset.chains, primary: { ...primary, moves } };
-    return { ...sword, uid: uid ?? sword.uid, moveset: { ...moveset, chains } };
+    const chains = { ...base.chains, primary: { ...primary, moves } };
+    const [moveset] = mintMoveset({ ...s().profile, nextConstructUid: from }, { ...base, chains });
+    return { ...sword, uid: uid ?? sword.uid, moveset };
   }
 
-  it('a load-time trim takes a socket past the cap off: a Link, its rune by the rule, no notice', async () => {
+  it('a load-time trim empties a repeated rune: back to the pouch by the rule, no Link, no notice', async () => {
     const p = s().profile;
-    // Two sockets on a common sword (one a move): the second goes, and its Quick with it.
-    const weapon = swordWith([split, quick]);
+    // Quick twice on a move: the second goes back to the pouch (the pull rule, pay as shipped).
+    const weapon = swordWith([quick, quick]);
     localStorage.setItem(
       DELVE_SAVE_KEY,
       JSON.stringify({ ...p, equipped: { ...p.equipped, weapon } }),
@@ -619,14 +633,19 @@ describe('delveStore: runes outside the draft', () => {
     vi.resetModules();
     const fresh = (await import('./delveStore')).useDelveStore;
     expect(fresh.getState().notices).toEqual([]);
-    expect(fresh.getState().profile.links).toBe(p.links + 1);
+    expect(fresh.getState().profile.links).toBe(p.links);
+    expect(pouchCount(fresh.getState().profile.runes, quick)).toBe(1);
   });
 
-  it('salvage gives a socket back as a Link; its rune follows the pull rule', () => {
-    s().setProfile({ ...s().profile, bag: [swordWith([split], 'x5'), swordWith([split], 'x6')] });
-    expect(s().salvage(['x5'])).toMatchObject({ links: 1, runes: [], destroyed: [split] });
-    s().setUnsocket('pay');
-    expect(s().salvage(['x6'])).toMatchObject({ links: 1, runes: [split], destroyed: [] });
+  it("salvage gives no Link for a socket (they belong to the construct); its rune follows the pull rule, 'pay' as shipped", () => {
+    s().setProfile({
+      ...s().profile,
+      bag: [swordWith([split], 'x5'), swordWith([split], 'x6', 600)],
+    });
+    expect(s().salvage(['x5'])).toMatchObject({ links: 0, runes: [split], destroyed: [] });
+    expect(pouchCount(s().profile.runes, split)).toBe(1);
+    s().setUnsocket('destroy');
+    expect(s().salvage(['x6'])).toMatchObject({ links: 0, runes: [], destroyed: [split] });
     expect(pouchCount(s().profile.runes, split)).toBe(1);
   });
 

```

Apply to `packages/client/src/stores/sandboxStore.test.ts`:

```diff
@@ -6,6 +6,7 @@ import {
   generateItem,
   SeededRNG,
   type Blow,
+  mintMoveset,
 } from '@alloy/engine';
 import { getDelveRegistry } from '@/features/delve/registry';
 import { armed } from '@/features/delve/__tests__/armed';
@@ -109,11 +110,14 @@ describe('sandboxStore', () => {
   });
 
   it('keeps a saved loaded weapon only while the weapon choice still names it', () => {
-    const bow = generateItem(
+    const rolled = generateItem(
       registry,
       { uid: 'L1', ilvl: 9, rarity: 'legendary', slot: 'weapon', baseId: 'bow', mana: 'storm' },
       new SeededRNG(3),
     );
+    // A saved weapon's constructs carry their uids (save v14).
+    const [moveset] = mintMoveset(createDelveProfile(registry, 7), rolled.moveset!);
+    const bow = { ...rolled, moveset };
     const named = { baseId: 'bow', mana: 'storm', rarity: 'legendary' };
     expect(parseSandbox({ weapon: named, loadedWeapon: bow }).loadedWeapon).toEqual(bow);
     const other = { baseId: 'sword', mana: 'fire', rarity: 'rare' };
@@ -158,11 +162,11 @@ describe('sandboxStore', () => {
   it("Load my build keeps the sandbox's chains for the skills the weapon doesn't carry", () => {
     const profile = createDelveProfile(registry, 7, { primary: 'frost' });
     const before = store().chains;
-    store().loadMyBuild(profile); // a common sword: the basic chain alone
+    store().loadMyBuild(profile); // a common sword: its Basic and a two-slot Primary
     const sword = profile.equipped.weapon!.moveset!.chains;
     expect(store().chains).toEqual({
       basic: sword.basic,
-      primary: before.primary,
+      primary: sword.primary,
       defensive: before.defensive,
       ultimate: before.ultimate,
     });

```

- [ ] **Step 2: Run them: red**

```bash
cd /c/Projects/alloy-constructs-a
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p .)
```

Expected: red: 55 errors in 24 files (`'@alloy/engine' has no exported member 'carriedSkills'` / `'awaken'` / `'movesetTransfer'` / `'socketCap'` / `'ChainOrigins'`, `Property 'carries' does not exist`, `'awakened' does not exist in type 'GearItem'`, `Property 'bought' is missing`, `Property 'constructs' is missing`, `GLYPH_ART` missing the three forms).

- [ ] **Step 3: The edits** (12 files, in this order)

Apply to `packages/client/src/features/delve/StopPanel.tsx`:

```diff
@@ -3,7 +3,8 @@ import { flushSync } from 'react-dom';
 import {
   CHAIN_SKILLS,
   GEAR_SLOTS,
-  carriedByText,
+  MAX_SOCKETS,
+  OPEN_SKILL_TEXT,
   compareItem,
   editPrice,
   heroChains,
@@ -16,7 +17,6 @@ import {
   resolveChain,
   runeTargetOf,
   slotPrice,
-  socketCap,
   socketsOf,
   takeStop,
   upgradeCost,
@@ -414,7 +414,7 @@ function MovePick({ take, dryRun }: { take: Take; dryRun: DryRun }) {
         stats={stats}
         locked={false}
         fixedShape
-        absentText={(s) => carriedByText(registry, s)}
+        absentText={() => OPEN_SKILL_TEXT}
         onChange={(skill, chain) => {
           const now = movesOf(chain);
           const shown = movesOf(chains[skill]);
@@ -553,7 +553,7 @@ function RunePick({ take }: { take: Take }) {
           </span>
           <SocketRow
             runes={socketsOf(move)}
-            cap={socketCap(registry, weapon.rarity)}
+            cap={MAX_SOCKETS}
             nextPrice={null}
             emptyOnly
             onSocketTap={(socket) => setAt({ skill, index, socket })}

```

Apply to `packages/client/src/features/delve/hub/forge/ForgeBench.tsx`:

```diff
@@ -253,10 +253,11 @@ export function ForgeBench({
         ...shards.map((s) => ({ kind: 'shard' as const, ...s })),
       ]
     : [];
+  // Each skill's slots against its ceiling (the constructs spec §3.1), the skills it starts with.
   const extras = preview?.weapon
-    ? Object.entries(preview.weapon.slots)
-        .filter(([, n]) => n > 0)
-        .map(([s, n]) => `${SKILL_NAME[s as keyof typeof SKILL_NAME]} +${n}`)
+    ? (Object.entries(preview.weapon.slots) as [keyof typeof SKILL_NAME, [number, number]][])
+        .filter(([, [n]]) => n > 0)
+        .map(([s, [n, ceiling]]) => `${SKILL_NAME[s]} ${n}/${ceiling}`)
     : [];
   // The guided start's trail: the Lines are done once one holds a shard, or at once when no
   // shard held fits the item, or it rolls no lines (the forge needs none), so the marker goes on
@@ -540,8 +541,7 @@ export function ForgeBench({
               )}
               {preview.weapon && (
                 <p className="k-note" data-testid="forge-weapon">
-                  Carries {preview.weapon.carries.map((s) => SKILL_NAME[s]).join(', ')}
-                  {extras.length > 0 && ` · extra slots: ${extras.join(', ')}`}
+                  {preview.weapon.class === 'melee' ? 'Melee' : 'Ranged'} · slots: {extras.join(', ')}
                   {preview.weapon.sockets > 0 &&
                     ` · ${preview.weapon.sockets} open socket${preview.weapon.sockets === 1 ? '' : 's'}`}
                 </p>

```

Apply to `packages/client/src/features/delve/hub/forge/Temper.tsx`:

```diff
@@ -1,14 +1,18 @@
 import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
 import {
-  awaken,
-  awakenPrice,
+  ABILITY_SLOTS,
   honeCost,
   imprintCost,
   itemStatLines,
+  movesetOf,
+  openSkill,
+  openSkillPrice,
   pairElements,
   reattuneCost,
+  slotRange,
   reforgeCost,
   upgradeCost,
+  type FluxGrade,
   type GearItem,
   type ManaType,
   type ShardRef,
@@ -24,6 +28,7 @@ import { ItemStatLines, AffixLine } from '../../items/ItemStatLines';
 import { manaStyle, SLOT_LABEL } from '../../format';
 import { heldShards, ShardPicker } from './ShardPicker';
 import { materialLabel, shardName } from './materials-text';
+import { SKILL_NAME } from '../../chains/chain-text';
 
 const BACK = { key: 'Escape', pad: 'b' } as const;
 
@@ -47,7 +52,7 @@ interface Op {
 
 /**
  * The Temper bench on the picked item: one list of its six operations (Upgrade +1, Reforge,
- * Hone and Imprint a line, Re-attune to the pair's other element, Awaken a rare weapon once),
+ * Hone and Imprint a line, Re-attune to the pair's other element, Open a skill on a weapon),
  * each row with the engine's price and, when it can't be done, why on the same row; Reforge,
  * Hone and Imprint open a line pick in its own pad scope. Beside it, the item's detail (no
  * stops). Two panels, for the bench's second and third columns.
@@ -81,12 +86,19 @@ export function Temper({ item }: { item: GearItem }) {
   const upShort = upCost !== null && upCost > scrap;
   const ready = line !== null && (op !== 'imprint' || shard !== null);
   const opShort = ready && opCost > scrap;
-  // Awaken, on a rare weapon not yet awakened: its price, and the engine's dry run.
-  const awakenable = item.slot === 'weapon' && item.rarity === 'rare' && !item.awakened;
-  const awakenCost = awakenable ? awakenPrice(registry, item) : null;
-  const awakenTry = useMemo(
-    () => (awakenable ? awaken(registry, profile, item.uid) : null),
-    [awakenable, registry, profile, item.uid],
+  // Open a skill (the constructs spec §3.2, Awaken's heir): the weapon's first skill at 0 slots
+  // with a ceiling, its price, and the engine's dry run.
+  const closed =
+    item.slot === 'weapon'
+      ? (ABILITY_SLOTS.find(
+          (s) =>
+            (movesetOf(registry, item).slots[s] ?? 0) === 0 && slotRange(registry, item, s)[1] > 0,
+        ) ?? null)
+      : null;
+  const openCost = closed ? openSkillPrice(registry, item) : null;
+  const openTry = useMemo(
+    () => (closed ? openSkill(registry, profile, item.uid, closed) : null),
+    [closed, registry, profile, item.uid],
   );
 
   const say = (text: string, good: boolean) => {
@@ -142,10 +154,11 @@ export function Temper({ item }: { item: GearItem }) {
     if (res.ok) playSound('combineMerge');
     done(res.ok, `Attuned to ${manaStyle(registry, to).name}`, res.reason, 'Cannot re-attune');
   };
-  const onAwaken = () => {
-    const res = store().awaken(item.uid);
+  const onOpenSkill = () => {
+    if (!closed) return;
+    const res = store().openSkill(item.uid, closed);
     if (res.ok) playSound('upgradeTier');
-    done(res.ok, 'Awakened!', res.reason, 'Cannot awaken');
+    done(res.ok, `${SKILL_NAME[closed]} opened!`, res.reason, 'Cannot open');
   };
 
   const shardFits = heldShards(registry, profile.materials.shards, item.slot, []).length > 0;
@@ -224,22 +237,25 @@ export function Temper({ item }: { item: GearItem }) {
           },
         ]),
     {
-      id: 'awaken',
-      label: 'Awaken',
-      price: awakenCost && (
+      id: 'open-skill',
+      label: closed ? `Open ${SKILL_NAME[closed]}` : 'Open a skill',
+      price: openCost && (
         <>
-          {awakenCost.epicFlux} {materialLabel(registry, { kind: 'flux', grade: 'epic' })} ·{' '}
-          <Price links={awakenCost.links} scrap={awakenCost.scrap} />
+          {(Object.entries(openCost.flux) as [FluxGrade, number][])
+            .map(([grade, n]) => `${n} ${materialLabel(registry, { kind: 'flux', grade })}`)
+            .join(' · ')}{' '}
+          · <Price links={openCost.links} scrap={openCost.scrap} />
         </>
       ),
-      why: item.awakened
-        ? 'Awakened: it carries the Ultimate'
-        : !awakenable
-          ? 'Only a rare weapon awakens'
-          : awakenTry && !awakenTry.ok
-            ? (awakenTry.reason ?? 'Cannot awaken')
-            : null,
-      run: onAwaken,
+      why:
+        item.slot !== 'weapon'
+          ? 'Only a weapon opens a skill'
+          : !closed
+            ? 'Every skill it can hold is open'
+            : openTry && !openTry.ok
+              ? (openTry.reason ?? 'Cannot open')
+              : null,
+      run: onOpenSkill,
     },
   ];
 
@@ -382,11 +398,6 @@ export function Temper({ item }: { item: GearItem }) {
               Honed {item.hones} {item.hones === 1 ? 'time' : 'times'}: each hone costs more.
             </p>
           )}
-          {item.awakened && (
-            <p className="k-note" data-testid="awakened">
-              Awakened: it carries the Ultimate.
-            </p>
-          )}
         </div>
       </Panel>
     </>

```

Apply to `packages/client/src/features/delve/hub/help/help-topics.tsx`:

```diff
@@ -1,4 +1,4 @@
-import { CHAIN_SKILLS, carriedByText, carriedFrom, carriedSkills } from '@alloy/engine';
+import { ABILITY_SLOTS, RARITY_ORDER, type ChainSkill, type Rarity } from '@alloy/engine';
 import { useControlsStore } from '@/stores/controlsStore';
 import { useInputDeviceStore } from '@/stores/inputDeviceStore';
 import type { KeyAction } from '@/features/controls/controls';
@@ -36,10 +36,14 @@ export function HelpPage({ topic }: { topic: HelpTopicId }) {
     if (pad ? !button : !key) return null;
     return <InputGlyph size="sm" binding={{ key: key ?? undefined, pad: button ?? undefined }} />;
   };
-  // What every weapon carries; the rest come with its rarity.
-  const always = carriedSkills(registry, { rarity: 'common' });
-  // The rarity (its flux grade) the Primary comes with: a Jump in save's first forge.
-  const firstFlux = carriedFrom(registry, 'primary');
+  // The least rarity whose weapons start with a slot of a skill (the slot table).
+  const slots = registry.getDelveBalance().movesets.slots;
+  const startsFrom = (s: ChainSkill): Rarity | null =>
+    RARITY_ORDER.find((r) => slots[r][s][0] > 0) ?? null;
+  const startsText = (s: ChainSkill) => {
+    const from = startsFrom(s);
+    return from === 'common' ? 'every weapon' : from ? `${from} weapons and better` : 'none';
+  };
   const loss = pct(registry.getDelveBalance().crafting.deathLoss);
   return (
     <div
@@ -77,21 +81,23 @@ export function HelpPage({ topic }: { topic: HelpTopicId }) {
       {topic === 'weapons' && (
         <div data-testid="howto-carries">
           <p>
-            Your weapon carries your skills. Every weapon carries your{' '}
-            {always.map((s) => SKILL_NAME[s]).join(' and ')}; better ones carry more:
+            Your weapon holds your skills in slots: every weapon your Basic chain, and its rarity
+            sets how many slots each skill starts with and can grow to:
           </p>
           <ul className="flex flex-col gap-1 pl-4">
-            {CHAIN_SKILLS.filter((s) => !always.includes(s)).map((s) => (
+            {ABILITY_SLOTS.map((s) => (
               <li key={s} data-testid={`howto-carry-${s}`}>
-                {s !== 'basic' && g(s)} <b className="text-[var(--k-text)]">{SKILL_NAME[s]}</b>:{' '}
-                {carriedByText(registry, s).toLowerCase()}
+                {g(s)} <b className="text-[var(--k-text)]">{SKILL_NAME[s]}</b>: {startsText(s)}
               </li>
             ))}
           </ul>
-          <p>Awaken a rare weapon on the Forge's Temper bench and it carries the Ultimate too.</p>
           <p>
-            Forge your first weapon from your starting kit on the Forge tab: with {firstFlux} flux
-            it carries your Primary {g('primary')}.
+            A skill your weapon has no slot for opens on the Forge's Temper bench, for flux, Links
+            and scrap.
+          </p>
+          <p>
+            Forge your first weapon from your starting kit on the Forge tab: with{' '}
+            {startsFrom('defensive')} flux it holds a Defensive {g('defensive')} too.
           </p>
         </div>
       )}

```

Apply to `packages/client/src/features/delve/hub/loadout/ComparePane.tsx`:

```diff
@@ -1,7 +1,6 @@
 import { useMemo, type ReactElement } from 'react';
 import {
-  carriedSkills,
-  movesetTransfer,
+  moveAllPreview,
   profileStats,
   salvageYield,
   unsocketMode,
@@ -9,7 +8,7 @@ import {
   type ItemComparison,
   type ManaType,
 } from '@alloy/engine';
-import { partsText, pullText, runeNames, useDelveStore } from '@/stores/delveStore';
+import { partsText, pullText, useDelveStore } from '@/stores/delveStore';
 import { showToast } from '@/components/Toast';
 import { playSound } from '@/shared/utils/sound-manager';
 import { vibrate } from '@/shared/utils/haptics';
@@ -23,7 +22,6 @@ import { ItemStatLines } from '../../items/ItemStatLines';
 import { LegendaryBox } from '../../items/LegendaryBox';
 import { MovesetView } from '../../items/MovesetView';
 import { deltaMark } from '../../ItemTile';
-import { SKILL_NAME } from '../../chains/chain-text';
 import { SLOT_LABEL, UPGRADE_EPSILON, formatDelta, manaStyle } from '../../format';
 import type { HubLink } from '../types';
 import { shardName } from '../forge/materials-text';
@@ -69,42 +67,37 @@ export function transferOnto(item: GearItem): boolean {
   const res = useDelveStore.getState().transfer(item.uid);
   if (!res.ok) {
     playSound('combineFail');
-    showToast(res.reason ?? 'Cannot transfer');
+    showToast(res.reason ?? 'Cannot move');
     return false;
   }
   playSound('combineMerge');
   vibrate('success');
   const links = res.links ? ` · +${res.links} Link${res.links > 1 ? 's' : ''}` : '';
   const moved = partsText(getDelveRegistry(), res.runes, res.destroyed);
-  showToast(`Your moveset moved onto ${item.name}${links}${moved ? ` · ${moved}` : ''}`);
+  showToast(`Your constructs moved onto ${item.name}${links}${moved ? ` · ${moved}` : ''}`);
   return true;
 }
 
 /**
- * What a transfer of your moveset onto `item` leaves: the chains it can't carry (their extra
- * slots come back as Links) and the runes with no socket there, by the pull rule. The compare
- * pane's Transfer and the pad's take sheet both show it.
+ * What Move all onto `item` leaves (the constructs spec §3.3, `moveAllPreview`): the constructs
+ * that go to the bag (yours past its slots, and its own on the chains replaced) and those that
+ * sit dormant there (its class can't express their form). The compare pane's Move all and the
+ * pad's take sheet both show it.
  */
 export function TransferNotes({ worn, item }: { worn: GearItem; item: GearItem }): ReactElement {
   const registry = getDelveRegistry();
-  const unsocket = useDelveStore((s) => s.unsocket);
-  const pull = unsocketMode(registry, unsocket);
-  const transfer = movesetTransfer(registry, worn, item);
-  const leaves = carriedSkills(registry, worn).filter(
-    (s) => !carriedSkills(registry, item).includes(s),
-  );
+  const { toBag, dormant } = moveAllPreview(registry, worn, item);
+  const n = (k: number, what: string) => `${k} ${what}${k === 1 ? '' : 's'}`;
   return (
     <>
-      {leaves.length > 0 && (
+      {toBag.length > 0 && (
         <span className="text-[18px] text-[var(--k-hot)]" data-testid="transfer-leaves">
-          Leaves your {leaves.map((s) => SKILL_NAME[s]).join(' and ')} behind
+          {n(toBag.length, 'construct')} to your bag
         </span>
       )}
-      {transfer.runes.length > 0 && (
-        <span className="text-[18px] text-[var(--k-hot)]" data-testid="transfer-runes">
-          {pull === 'destroy'
-            ? `Destroys ${runeNames(registry, transfer.runes)}: no socket for ${transfer.runes.length === 1 ? 'it' : 'them'} there`
-            : `${runeNames(registry, transfer.runes)} back to your pouch`}
+      {dormant.length > 0 && (
+        <span className="text-[18px] text-[var(--k-hot)]" data-testid="transfer-dormant">
+          {n(dormant.length, 'construct')} dormant there: a {item.name} can't express {dormant.length === 1 ? 'its' : 'their'} form
         </span>
       )}
     </>
@@ -159,7 +152,7 @@ export function ComparePane({
     );
 
   const inBag = where === 'bag';
-  const transfer = worn && asIs ? movesetTransfer(registry, worn, item) : null;
+  const transfer = worn && asIs ? moveAllPreview(registry, worn, item) : null;
   // Equip takes a weapon as it is; Transfer is marked by its value as a home.
   const equipCmp = asIs ?? cmp;
   const isUpgrade = !!equipCmp && equipCmp.powerPct > UPGRADE_EPSILON;
@@ -231,9 +224,7 @@ export function ComparePane({
                   <PowerDelta cmp={asIs} />
                 </div>
                 <span className="k-label">
-                  With your moveset · <Price scrap={transfer.scrap} /> to move it
-                  {transfer.sockets > 0 &&
-                    `, its ${transfer.sockets} socket${transfer.sockets === 1 ? '' : 's'} included`}
+                  With your constructs moved here
                 </span>
                 <div data-testid="compare-home">
                   <PowerDelta cmp={cmp} />
@@ -278,13 +269,7 @@ export function ComparePane({
               data-tutorial="loadout.transfer"
               testId="transfer-button"
             >
-              {homeUpgrade ? '▲ ' : ''}Transfer my moveset here · <Price scrap={transfer.scrap} />
-              {transfer.links > 0 && (
-                <>
-                  {' · '}
-                  <Price links={transfer.links} signed />
-                </>
-              )}
+              {homeUpgrade ? '▲ ' : ''}Move all my constructs here
             </Button>
             {worn && <TransferNotes worn={worn} item={item} />}
           </div>

```

Apply to `packages/client/src/features/delve/hub/loadout/EquippedPane.tsx`:

```diff
@@ -1,7 +1,6 @@
 import { useMemo, type ReactElement } from 'react';
 import {
   CHAIN_SKILLS,
-  carriedSkills,
   estimateCombat,
   heroChains,
   manaPool,
@@ -74,7 +73,8 @@ export function EquippedPane({
   const weapon = equipped.weapon;
   const cap = registry.getDelveBalance().chains.cap;
   const slots = weapon ? movesetOf(registry, weapon).slots : null;
-  const carried = weapon ? carriedSkills(registry, weapon) : [];
+  // A skill with a slot has a chain (the constructs spec §3.1).
+  const carried = slots ? CHAIN_SKILLS.filter((s) => (slots[s] ?? 0) > 0) : [];
 
   const rows: [string, string, boolean?][] = [
     ['Damage', formatNumber(dps)],

```

Apply to `packages/client/src/features/delve/hub/loadout/TakeSheet.tsx`:

```diff
@@ -1,10 +1,9 @@
 import type { ReactElement } from 'react';
-import { findItem, movesetTransfer, type DelveProfile, type ManaType } from '@alloy/engine';
+import { findItem, type DelveProfile, type ManaType } from '@alloy/engine';
 import { useDelveStore } from '@/stores/delveStore';
 import { playSound } from '@/shared/utils/sound-manager';
 import { vibrate } from '@/shared/utils/haptics';
-import { Button, Dialog, Price } from '../../kit';
-import { getDelveRegistry } from '../../registry';
+import { Button, Dialog } from '../../kit';
 import { useItemComparison } from '../../items/useItemComparison';
 import { UPGRADE_EPSILON, formatDelta } from '../../format';
 import { TransferNotes, transferOnto } from './ComparePane';
@@ -30,9 +29,9 @@ export function canTake(
 
 /**
  * The pad's take sheet (the pad-first spec, 4, rule 1: a priced action gets a sheet): A on a bag
- * weapon that can take your moveset asks how to take it. Equip as it is, or Transfer my moveset
- * here (the engine's price, and what a transfer leaves); each with its Power change, the better
- * one focused first. The mouse has both in the compare pane.
+ * weapon that can take your constructs asks how to take it. Equip as it is, or Move all my
+ * constructs here (free; what it leaves, `TransferNotes`); each with its Power change, the
+ * better one focused first. The mouse has both in the compare pane.
  */
 export function TakeSheet({
   uid,
@@ -41,10 +40,8 @@ export function TakeSheet({
   uid: string;
   onClose: () => void;
 }): ReactElement | null {
-  const registry = getDelveRegistry();
   const { item, worn, cmp, asIs } = useItemComparison(uid);
   if (!item || !worn || !cmp || !asIs) return null;
-  const transfer = movesetTransfer(registry, worn, item);
   const homeFirst = cmp.powerPct > asIs.powerPct && cmp.powerPct > UPGRADE_EPSILON;
 
   const equip = () => {
@@ -76,14 +73,7 @@ export function TakeSheet({
           data-tutorial="loadout.transfer"
           testId="take-transfer"
         >
-          Transfer my moveset here · <Price scrap={transfer.scrap} />
-          {transfer.links > 0 && (
-            <>
-              {' · '}
-              <Price links={transfer.links} signed />
-            </>
-          )}{' '}
-          · {formatDelta(cmp.powerPct)} Power
+          Move all my constructs here · {formatDelta(cmp.powerPct)} Power
         </Button>
         <TransferNotes worn={worn} item={item} />
       </div>

```

Apply to `packages/client/src/features/delve/hub/skills/useAnvilChains.ts`:

```diff
@@ -2,9 +2,10 @@ import { useMemo } from 'react';
 import { create } from 'zustand';
 import {
   CHAIN_SKILLS,
+  MAX_SOCKETS,
+  OPEN_SKILL_TEXT,
+  UNARMED,
   addSlot,
-  baseSlots,
-  carriedByText,
   heroChains,
   isDiveActive,
   movesOf,
@@ -13,7 +14,7 @@ import {
   profileStats,
   setChains,
   slotPrice,
-  socketCap,
+  slotRange,
   socketPrice,
   socketsOf,
   unsocketMode,
@@ -93,7 +94,7 @@ export function useAnvilChains(): AnvilChains {
   const slots = weapon
     ? movesetOf(registry, weapon).slots
     : Object.fromEntries(
-        CHAIN_SKILLS.filter((s) => chains[s]).map((s) => [s, baseSlots(registry, null, s)]),
+        CHAIN_SKILLS.filter((s) => chains[s]).map((s) => [s, slotRange(registry, UNARMED, s)[0]]),
       );
   const stats = useMemo(
     () =>
@@ -110,7 +111,7 @@ export function useAnvilChains(): AnvilChains {
   const runes: ChainRunes | undefined = weapon
     ? {
         pouch: view.pouch,
-        socketCap: socketCap(registry, weapon.rarity),
+        socketCap: MAX_SOCKETS,
         socketPrice: (open) => socketPrice(registry, open),
         weaponBaseId: weapon.baseId,
         pullText: (r) =>
@@ -135,7 +136,7 @@ export function useAnvilChains(): AnvilChains {
       stats,
       locked: isDiveActive(profile) || !weapon,
       lockedText: weapon ? undefined : 'Equip a weapon to build your moves.',
-      absentText: (s) => carriedByText(registry, s),
+      absentText: () => OPEN_SKILL_TEXT,
       onChange: (skill, chain, map) => useDelveStore.getState().editDraft(skill, chain, map),
       elements: elements.length > 0 ? elements : undefined,
       runes,

```

Apply to `packages/client/src/features/delve/items/LegendaryBox.tsx`:

```diff
@@ -1,5 +1,5 @@
 import type { ReactElement } from 'react';
-import { carriedSkills, legendaryNeeds, type ChainSkill, type GearItem } from '@alloy/engine';
+import { legendaryNeeds, movesetOf, type ChainSkill, type GearItem } from '@alloy/engine';
 import { useDelveStore } from '@/stores/delveStore';
 import { getDelveRegistry } from '../registry';
 import { legendaryText } from '../format';
@@ -21,7 +21,7 @@ export function LegendaryBox({ item }: { item: GearItem }): ReactElement | null
   const weapon = useDelveStore((s) => s.profile.equipped.weapon);
   if (!item.legendary) return null;
   const needs = legendaryNeeds(item.legendary.id);
-  const dead = !!needs && !carriedSkills(registry, weapon ?? null).includes(needs);
+  const dead = !!needs && !(weapon && (movesetOf(registry, weapon).slots[needs] ?? 0) > 0);
   return (
     <div
       className="mt-2 rounded-lg px-3 py-2 text-[18px]"

```

## Chunk 20: Task 6 — The client on the new bundle (continued)

Apply to `packages/client/src/features/delve/items/MovesetView.tsx`:

```diff
@@ -1,12 +1,11 @@
 import { useMemo, type ReactElement } from 'react';
 import {
   CHAIN_SKILLS,
-  carriedByText,
-  carriedSkills,
+  MAX_SOCKETS,
+  OPEN_SKILL_TEXT,
   movesetOf,
   profileStats,
   resolveChain,
-  socketCap,
   type AbilitySlot,
   type Blow,
   type GearItem,
@@ -27,7 +26,7 @@ export function MovesetView({ item }: { item: GearItem }): ReactElement {
   const stats = useMemo(() => profileStats(registry, profile), [registry, profile]);
   const { chains, slots } = movesetOf(registry, item);
   const cap = registry.getDelveBalance().chains.cap;
-  const carried = carriedSkills(registry, item);
+  const carried = CHAIN_SKILLS.filter((s) => (slots[s] ?? 0) > 0);
   return (
     <div
       className="delve-panel mt-3 flex flex-col gap-1 px-3 py-2 text-[16px]"
@@ -39,7 +38,7 @@ export function MovesetView({ item }: { item: GearItem }): ReactElement {
         if (!carried.includes(s) || !chain)
           return (
             <div key={s} className="text-stone-500" data-testid={`moveset-${s}`}>
-              {SKILL_NAME[s]}: {carriedByText(registry, s).toLowerCase()}
+              {SKILL_NAME[s]}: {OPEN_SKILL_TEXT.toLowerCase()}
             </div>
           );
         const names = Array.isArray(chain)
@@ -54,7 +53,7 @@ export function MovesetView({ item }: { item: GearItem }): ReactElement {
           </div>
         );
       })}
-      <ItemSockets chains={chains} cap={socketCap(registry, item.rarity)} />
+      <ItemSockets chains={chains} cap={MAX_SOCKETS} />
     </div>
   );
 }

```

Apply to `packages/client/src/features/delve/kit/glyph-art.ts`:

```diff
@@ -240,9 +240,15 @@ export const GLYPH_ART: Record<GlyphId, GlyphArt> = {
   strike: {
     rows: ['....#.#', '...#.#.', '..#.#.#', '.#.#.#.', '#.#.#..', '.#.#...', '#.#....'],
   },
+  whirl: {
+    rows: ['..####.', '.#....#', '#..##..', '#.#..#.', '#..#.#.', '.#..#..', '..##...'],
+  },
   ward: {
     rows: ['..###..', '.#...#.', '#.....#', '#..#..#', '#.....#', '.#...#.', '..###..'],
   },
+  repel: {
+    rows: ['...#...', '..#.#..', '.#.#.#.', '#..#..#', '.#.#.#.', '..#.#..', '...#...'],
+  },
   armor: {
     rows: ['##...##', '#######', '.#####.', '.##.##.', '.#####.', '.##.##.', '.#####.'],
   },
@@ -255,6 +261,9 @@ export const GLYPH_ART: Record<GlyphId, GlyphArt> = {
   nova: {
     rows: ['#..#..#', '.#####.', '.#...#.', '##...##', '.#...#.', '.#####.', '#..#..#'],
   },
+  onslaught: {
+    rows: ['#.#.#.#', '.#.#.#.', '#.#.#.#', '.......', '#.#.#.#', '.#.#.#.', '#.#.#.#'],
+  },
   barrage: {
     rows: ['#...#..', '.#...#.', '..#...#', '#...#..', '.#...#.', '..#...#', '.......'],
   },

```

Apply to `packages/client/src/stores/delveStore.ts`:

```diff
@@ -15,7 +15,6 @@ import {
   imprint as engineImprint,
   refine as engineRefine,
   buyShard as engineBuyShard,
-  awaken as engineAwaken,
   startTutorial as engineStartTutorial,
   skipTutorial as engineSkipTutorial,
   applyTutorialEvents,
@@ -30,8 +29,8 @@ import {
   setChains as engineSetChains,
   addSlot as engineAddSlot,
   draftPrice,
-  movesOf,
-  transferMoveset,
+  moveAll as engineMoveAll,
+  openSkill as engineOpenSkill,
   takeStop as engineTakeStop,
   bindSecondary as engineBindSecondary,
   chooseStartingMana,
@@ -44,8 +43,8 @@ import {
   sameChain,
   type ArpgWorld,
   type ChainFix,
-  type ChainOrigins,
   type Chains,
+  type AbilitySlot,
   type ChainSkill,
   type DataRegistry,
   type DelveProfile,
@@ -220,15 +219,6 @@ export interface ChainDraft {
   uid: string;
   pair: ManaPair;
   chains: Partial<Chains>;
-  /** For each chain in `chains`, the saved move each of its moves came from (null: a new one). */
-  origins: ChainOrigins;
-}
-
-/** `origins` for the skills `chains` holds. */
-function originsFor(origins: ChainOrigins, chains: Partial<Chains>): ChainOrigins {
-  return Object.fromEntries(
-    CHAIN_SKILLS.filter((s) => chains[s] && origins[s]).map((s) => [s, origins[s]]),
-  );
 }
 
 /**
@@ -253,9 +243,9 @@ export function draftChanges(
   );
 }
 
-/** Apply's options: the draft's origins and the pull rule (the dev override, else the balance's). */
-function applyOpts(draft: ChainDraft | null, unsocket: UnsocketMode | null): SetChainsOptions {
-  return { origins: draft?.origins ?? {}, unsocket: unsocket ?? undefined };
+/** Apply's options: the pull rule (the dev override, else the balance's). The price is by uid: no origins. */
+function applyOpts(_draft: ChainDraft | null, unsocket: UnsocketMode | null): SetChainsOptions {
+  return { unsocket: unsocket ?? undefined };
 }
 
 /** What Apply would do with the draft: the Anvil's builder and its Delve button both show it. */
@@ -483,8 +473,8 @@ interface DelveStore {
   refine: (what: MaterialRef) => ProfileActionResult;
   /** Buy a tier I shard at the shard bench. */
   buyShard: (stat: HeroStatKey) => ProfileActionResult;
-  /** Awaken rare weapon `uid`: it carries the Ultimate too (see the tutorial spec). */
-  awaken: (uid: string) => ProfileActionResult;
+  /** Open a skill on weapon `uid` (the constructs spec §3.2, Awaken's heir): its first slot, bought, for flux, Links and scrap. */
+  openSkill: (uid: string, skill: AbilitySlot) => ProfileActionResult;
   /** A new save's Guided start: the script's first step (see the tutorial spec). */
   startTutorial: () => void;
   /** Drop the rails (the confirm is the caller's), and a floor's in progress (`world`). */
@@ -512,9 +502,9 @@ interface DelveStore {
   /** Set the equipped weapon's changed chains, for Mana Dust: all or nothing. */
   setChains: (chains: Partial<Chains>) => ProfileActionResult;
   /**
-   * Put a chain into the builder's draft (a chain back as it was leaves it). `map`: for each of
-   * its moves, the index in the chain the builder showed (null: a new move); missing, each move
-   * stays where it was.
+   * Put a chain into the builder's draft (a chain back as it was leaves it). `map` (the builder's
+   * record of where each move came from) is taken and ignored: the moves carry their uids, and
+   * Apply prices by them (C1 drops it).
    */
   editDraft: <S extends ChainSkill>(skill: S, chain: Chains[S], map?: (number | null)[]) => void;
   /** Pay for the draft's changes and set them (`setChains`); a refusal keeps the draft. */
@@ -522,7 +512,7 @@ interface DelveStore {
   revertDraft: () => void;
   /** Add a slot to a chain of the equipped weapon, for Links and scrap (dropping its draft). */
   addSlot: (skill: ChainSkill) => ProfileActionResult;
-  /** Move the equipped weapon's moveset onto bag weapon `uid` and equip it, for scrap. */
+  /** Move all (the constructs spec §3.3): the worn weapon's constructs onto bag weapon `uid`, equipped. B2 fills the engine's op; until then it refuses. */
   transfer: (uid: string) => ProfileActionResult;
   /** Take the stop's boon (`{ kind: 'boon', index }`) or a guided stop's power-up. */
   takeStop: (action: StopAction) => ProfileActionResult;
@@ -741,7 +731,7 @@ export const useDelveStore = createHmrStore<DelveStore>('delveStore', (set, get)
 
     buyShard: (stat) => applyResult(engineBuyShard(registry(), get().profile, stat)),
 
-    awaken: (uid) => applyResult(engineAwaken(registry(), get().profile, uid)),
+    openSkill: (uid, skill) => applyResult(engineOpenSkill(registry(), get().profile, uid, skill)),
 
     startTutorial: () => commit(engineStartTutorial(registry(), get().profile)),
 
@@ -828,31 +818,14 @@ export const useDelveStore = createHmrStore<DelveStore>('delveStore', (set, get)
 
     setChains: (chains) => applyResult(engineSetChains(registry(), get().profile, chains)),
 
-    editDraft: (skill, chain, map) => {
+    editDraft: (skill, chain) => {
       const { profile, chainDraft } = get();
       const weapon = profile.equipped.weapon;
       if (!weapon) return;
       const changes = draftChanges(registry(), profile, chainDraft);
-      // The builder's map is over the chain it showed (the draft's, else the saved one):
-      // composed with the draft's own origins, it gives each move's index in the saved chain.
-      const shown = changes[skill] ?? heroChains(registry(), profile.equipped, profile.pair)[skill];
-      const from: (number | null)[] =
-        (changes[skill] ? chainDraft?.origins[skill] : undefined) ??
-        movesOf(shown).map((_, i) => i);
-      const handed = map ?? movesOf(chain).map((_, j) => j);
-      const origins = {
-        ...originsFor(chainDraft?.origins ?? {}, changes),
-        [skill]: handed.map((k) => (k === null ? null : (from[k] ?? null))),
-      };
       // Only what differs from the weapon is kept: an edit undone by hand leaves nothing.
-      const next = {
-        uid: weapon.uid,
-        pair: profile.pair,
-        chains: { ...changes, [skill]: chain },
-        origins,
-      };
-      const chains = draftChanges(registry(), profile, next);
-      set({ chainDraft: { ...next, chains, origins: originsFor(origins, chains) } });
+      const next = { uid: weapon.uid, pair: profile.pair, chains: { ...changes, [skill]: chain } };
+      set({ chainDraft: { ...next, chains: draftChanges(registry(), profile, next) } });
     },
 
     applyDraft: () => {
@@ -875,13 +848,13 @@ export const useDelveStore = createHmrStore<DelveStore>('delveStore', (set, get)
       const draft = get().chainDraft;
       if (res.ok && draft?.chains[skill]) {
         const { [skill]: _gone, ...chains } = draft.chains;
-        set({ chainDraft: { ...draft, chains, origins: originsFor(draft.origins, chains) } });
+        set({ chainDraft: { ...draft, chains } });
       }
       return res;
     },
 
     transfer: (uid) => {
-      const res = applyResult(transferMoveset(registry(), get().profile, uid, pull()));
+      const res = applyResult(engineMoveAll(registry(), get().profile, uid));
       if (res.ok) {
         set({ newUids: withoutUids(get().newUids, [uid]) });
         useUIStore.getState().markSeen('loadout');

```

- [ ] **Step 4: Typecheck and run them: green**

```bash
cd /c/Projects/alloy-constructs-a
(cd packages/client && npx tsc --noEmit -p . && npx vitest run --reporter=dot)
```

Expected: no type errors; **Test Files 152 passed (152); Tests 1413 passed (1413)** (43 s).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-constructs-a
git add packages/client
git commit -q -F - <<'EOF'
feat(client): the Anvil, the Loadout, the stop, the forge and Help on the constructs bundle

The smallest edits that compile and keep behaviour on the switch's engine
(C1 and C2 rewrite them): the store's draft without origins (the price is by
uid), its `transfer` on `moveAll` (B2's op, refusing until then) and
`openSkill` in Awaken's place; the compare pane and the take sheet on
`moveAllPreview` ("Move all my constructs here", free; what goes to the bag
and what sits dormant); the Temper bench's "Open <skill>" row (the first
closed skill with a ceiling, its flux, Links and scrap, the engine's dry run);
the forge preview's weapon frame (class, slots against ceilings); Help's
weapons topic from the slot table; the Equipped pane, MovesetView, the stop
and the Skills tab on `OPEN_SKILL_TEXT`, `slotRange` and MAX_SOCKETS; the
three new forms' glyphs. Every test of a retired rule is rewritten: the Skills
tests' fixtures wear four Lances (a sword expresses them), minted
(`wearing`), runes that fit, the pull rule 'pay', the slot table's starts and
ceilings, save v14.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git log --oneline -1
```

## Chunk 21: Verification, the scratch copy and what is routed

## Verification

- The engine suite after Task 5: **Test Files 2 failed | 148 passed | 2 skipped (152); Tests 41 failed | 1828 passed | 11 skipped (1880)**, 828 s on the scratch copy (run beside the client suite). The 41st failure was `delve-save-v8.test.ts`'s version literal, missed on that run and fixed into Task 5's diff afterwards (alone: `Tests 4 passed`), so Task 5 as written yields **40 failed | 1829 passed**. The 40 failures are `delve-tutorial-bot.test.ts` (every primary × 4 seeds, each `skipped: "l2-transfer"`: the lesson's Move all is B2's op, D1 rewires the bot and the script). The base's `delve-pacing-robust` seed-3 failure is gone at the switch (the rails pass with the bot wearing its forged weapons).
- The client suite after Task 6: **Test Files 152 passed (152); Tests 1413 passed (1413)**; both typechecks clean.
- The fingerprint identical to the base's after Tasks 1, 2 and 3; re-recorded at Task 4 (`constructs-a-task4.json`, below); identical to it after Task 5.
- `git log --oneline 2f3871b2..constructs/a` shows six commits, one a task.
- Hand the branch to the integrator (it becomes `constructs/main`, the base of B1, B2, C1 and C2).

**The fingerprint after the switch** (`constructs-a-task4.json`; the depths after each hash are dive 1 to 4's, the fire:1 run's dive 4 at 21 against the base's 24, frost:2's 28 against 19: the bot's weapons differ):

```json
{
 "fire:1": "b4c8a546088c7e152f59d6cfb1da47fb8fca1fc5 5/99/300.000,5/83/218.000,12/136/324.000,21/262/634.000",
 "fire:2": "ca48cc9faab5c868bbbb3923f5bc15757cf72866 5/94/262.000,5/91/198.000,13/196/421.000,19/228/454.000",
 "frost:1": "c025ca9f09a3dbdb8023540b5f8d747fc5f57b0b 5/95/280.000,5/87/213.000,12/135/345.000,21/245/555.000",
 "frost:2": "389fd7fc09b29df9b1f80a8469d4d31e565ae357 5/105/300.000,17/248/619.000,23/259/605.000,28/254/482.000",
 "earth:1": "12a3e33c08c9f66e85435742517926e735ed8678 5/95/286.000,5/89/235.000,14/208/540.000,20/255/630.000",
 "earth:2": "a1ab29a3ef94d7503803ff84350bcc755c83c578 5/88/260.000,5/91/202.000,14/209/516.000,23/314/749.000",
 "beeline:3": "66451d8fbab4a4339aefa84f3ab09a197e99062e 5/44/183.000,5/58/159.000,10/69/210.000,13/114/225.000",
 "tutorial:1": "49e87b3ea321f43565c166453819f75ff8ff0361 3/9/37.000,5/24/64.000,8/35/101.000"
}
```

## Checked on a scratch copy

A worktree at `2f3871b2` (`C:/Projects/alloy-constructs-draft-a`, branch `constructs/draft-a`, left in place), every task applied in order and committed: `31ea85d6` (Task 1), `ee4c2347` (Task 2), `d0bf0952` (Task 3), `bf273457` (Task 4), `468282cb` (Task 5), `7b8d2c5b` (Task 6). Every FAIL, PASS, count, typecheck and fingerprint above is what it printed; the edits are those commits' diffs replayed against each parent; the late additions `Knobs.stepBonus` and `CastStyle.text` sit in Task 4's commit (`bf273457`) and in Task 4's diffs here, as deviation 10 says.

## Routed to other areas

See "Needs routed" above: D1 (the tutorial bot, `lessonOp`'s `moveAll`, the `d1-aim` wording), D2 (D02's seed 8, the E2E fixtures' `withUids`, CLAUDE.md, the "Basic alone" expectations), B2 (the five ops, the salvage results' constructs), B1 (`TARGETS`, the Lab's 197 rune rows), C1 and C2 (the client edits of Task 6 are theirs to rewrite).
