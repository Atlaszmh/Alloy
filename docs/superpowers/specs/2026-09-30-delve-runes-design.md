# Delve runes: sockets on moves, 14 runes over shared knobs, tiers and fusing

**Status:** approved design, 2026-09-30. It is stage 4b of the skill roadmap, and it ships as v0.51.0 with save version 7. It builds on stage 4a (weapon movesets and slots, v0.49.0–v0.50.0; `docs/superpowers/specs/2026-09-30-delve-weapon-movesets-design.md`). The user's decisions are settled; this spec grounds them in the code and settles the details they left open. Every such detail is marked **Decided in the spec**, with a one-line reason, and listed again at the end. All numbers are starting points for the DPS Lab gate; nothing has been measured yet. Revised after the spec review and the re-review: every change is marked **(review)** or **(review 2)**, here and in the index. Tuned at the balance pass (2026-10-01, the user's decisions after the first gate): every change is marked **(balance)**, here and in the index, and "Balance and gates" records the pass.

Stage 4 is three projects, in this order:
- **4a:** weapon movesets and slots (shipped).
- **4b (this spec):** runes, the modifiers (split, multi-shot and so on): rune drops, sockets on moves, fusing runes.
- **4c:** component crafting, a general break-down-and-combine across every part.

## Why

4a made the build an investment: chains live on the weapon, and slots are earned with Links. The next layer is *how* each move behaves. The user wants that to grow with item power and crafting: "moves can have multiple sockets as item power and crafting are higher level", "start with zero sockets instead of 1, build progression towards modifiable move slots", and "make sure to build this to be flexible and extensible for future runes".

## Decisions (the user's)

| Question | Decision |
|---|---|
| Where runes go | **On the move.** A move (and a basic blow) holds sockets; a socket holds one rune. |
| Socket count | Every move starts at **0**. The cap per move is by weapon rarity: common/uncommon 1, magic/rare 2, epic/legendary 3. |
| Opening a socket | **Links + scrap**, the same currency as slots, rising with the sockets the move already has. Drops can roll sockets already open, by rarity. |
| Basics | All four chains get sockets, basic blows included. |
| First wave | All four families: **Shape, Tempo, Elemental, Sustain**, 14 runes. Built "flexible and extensible for future runes". |
| Approach | **Data runes over shared behaviour knobs** (approach 1). A rune is a data row; a new rune is a row, or at most one new knob. |
| Power | Tiers **I–V**. |
| Pulling | **Pulling destroys it**, with an easy toggle to test "pay" (a price, the rune kept). The rule sits in balance; a dev-only Anvil toggle overrides it locally. |
| Where loose runes live | `profile.runes`, a pouch of stack counts per rune and tier (no bag space). |
| Fit | Each rune declares the forms and weapons it fits. The builder offers only fitting runes; changing a move's form is refused while a socketed rune wouldn't fit it. |
| Moves and runes | Sockets and runes belong to the move: reordering carries them, a transfer moves them (priced per open socket, like extra slots). Removing a move or overwriting a rune destroys it (or charges, in "pay" mode). |
| During a dive | Runes are gear: locked. Stops gain a **fifth kind**, "socket a rune" (into an already open socket). |
| Sources | Tier by depth: I depth 1–6, II 7–12, III 13–20, IV 21–30, V 31+, with a 20% chance of one tier higher. Every boss drops 1; elites ~15%; ordinary packs ~3%. They burst onto the floor like loot and bank into the pouch. |
| Fusing | 3 of the same rune and tier → 1 of the next tier, plus scrap, on the Forge tab. |
| Same rune twice | One rune per effect on a move: the same rune twice on one move is refused. |
| Power and the autopilot | Power values socketed runes through the same damage maths. The autopilot opens sockets, fuses, and sockets its best rune into each open socket. |
| Save | Version 7. Old saves load with no sockets and an empty pouch (prototyping: no careful migration). |
| Balance | DPS Lab before and after: no rune more than doubles a move's damage at tier III. Pacing rails re-run with the autopilot using runes. If a ceiling breaks, report the numbers to the user before tuning. |
| Build | Parallel waves (0, 1: A B C, 2: D E F, 3), a reviewer per agent and a final review. |

## Design

### The model
- **A socket is an entry of the move's `runes` array.** `Move.runes?: (RuneRef | null)[]` and `Blow.runes?: (RuneRef | null)[]`. Its length is the move's open sockets; `null` is an open, empty socket; absent is the same as `[]`. `RuneRef = { id: RuneId; tier: RuneTier }`, tier 1–5 (shown I–V).
  - **Decided in the spec: `runes` is optional on `Move` and `Blow`.** *Every existing move literal (defaults, tests, the DPS Lab, the sandbox) stays valid, and a missing array reads as no sockets.*
  - Socket order is fixed: a rune stays at its socket index. Nothing reorders runes within a move.
- **The cap per move** is `balance.json → delve.runes.socketCap[rarity]` (common 1, uncommon 1, magic 2, rare 2, epic 3, legendary 3), at most `MAX_SOCKETS` (3). Unarmed: 0 (its chains are read-only).
- **The pouch.** `profile.runes: RunePouch`, a record of rune id → counts by tier (`number[5]`, index tier − 1). No bag space.
  - **Decided in the spec: an array per id, not a `"split:3"` key.** *Fusing and the pouch view walk tiers in order, and Zod checks the shape in one line.*
- **`RuneId` is a plain string**, checked against the registry at load, not a TypeScript union. *A new rune is a data row and needs no type change.*

### The 14 runes
Each rune's numbers are per tier, I → V. Where the decisions gave only the ends, the spec spreads them evenly. **Decided in the spec (review): the tier tables below.** *Exact even steps between the user's ends for every fraction (no rounding: Multi-shot's 68.75%, Guard's 4.25%), and whole counts (shards, shots, jumps) rounded down; Saturate's +2 at IV–V is the decisions' own.*

| Family | Rune | Tier I → V | Trade-off | Fits (forms) | Fits (blows) |
|---|---|---|---|---|---|
| Shape | **Split** | shards 2, 2, 3, 3, 4 at 30, 35, 40, 45, 50% power | — | Bolt, Volley, Barrage | bow, wand |
| Shape | **Multi-shot** | +1, +1, +1, +2, +2 shots **(balance)** | each shot 65, 68.75, 72.5, 76.25, 80% power; on Volley half that cut: 82.5, 84.375, 86.25, 88.125, 90%; on Barrage no cut | Bolt, Volley, Lance, Barrage | bow, wand |
| Shape | **Pierce** | passes 1, 1, 1, 2, 2 foes; past its first foe a shot only hits **(balance)** | 60, 62.5, 65, 67.5, 70% power **(balance)** | Bolt, Volley | staff, wand |
| Shape | **Chain** | +1, +1, +1, +2, +2 jumps **(balance)** | — | Bolt, Volley, Lance, Burst, Strike, Ward, Nova, Barrage, Maelstrom | all seven |
| Shape | **Widen** | area ×1.05, 1.1, 1.15, 1.2, 1.25 **(balance)** | 90% power | Burst, Nova, Maelstrom, Strike, Ward | dagger, sword, axe, maul |
| Tempo | **Quick** | beat and cooldown ×0.9, 0.85, 0.8, 0.75, 0.7 | 90% power | all twelve | all seven |
| Tempo | **Echo** | repeats after 0.4 s at 30, 37.5, 45, 52.5, 60% | — | Bolt, Volley, Lance, Burst, Strike, Nova, Barrage, Maelstrom | all seven |
| Tempo | **Heavy** | power ×1.15, 1.225, 1.3, 1.375, 1.45, staggers | beat and wind-up ×1.2 | Bolt, Volley, Lance, Burst, Strike, Nova, Barrage, Maelstrom | all seven |
| Elemental | **Saturate** | +1, +1, +1, +2, +2 stacks per direct hit | — | every form but Surge and Armor | all seven |
| Elemental | **Linger** | a zone for 1.5, 2, 2.5, 3, 3.5 s (ticks at 20% of the hit); at most one a shot and three a cast **(balance)** | — | Bolt, Lance, Burst, Strike, Nova | all seven, heavy and hold blows only |
| Elemental | **Volatile** | reactions it sets off +15, 23.75, 32.5, 41.25, 50% | — | every form but Surge | all seven |
| Sustain | **Leech** | lifesteal 2, 3, 4, 5, 6% | — | every form but Surge | all seven |
| Sustain | **Drain** | +1, +1.5, +2, +2.5, +3 mana per foe hit, up to 5 foe-hits and half the move's mana cost a cast (a blow: half a blow's mana) **(balance)** | — | every form but Surge | all seven |
| Sustain | **Guard** | on landing, a 3 s shield of 3, 4.25, 5.5, 6.75, 8% max life | — | all twelve | all seven |

- **Decided in the spec (review): the mana rune is Drain and the reaction-damage rune is Volatile.** *"Siphon" is already a reaction and "Catalyst" already a legendary; the knobs keep their names (`manaOnHit`, `catalyst`).*

The seven weapons are dagger, sword, axe and maul (melee) and staff, wand and bow (shots). The fits lists follow the decisions' table, narrowed only where the code makes a rune do nothing:
- **Decided in the spec: Pierce leaves out Lance and bow blows.** *A Lance already hits every foe on its line, and a bow's shots already pierce every foe (`attack.pierce: true`); Pierce would do nothing on them.*
- **Decided in the spec (review): Pierce fits staff blows, dormant on the rows that burst.** A staff's light shot pierces; its medium, heavy and hold shots burst (`explode`), and `burstShot` ends a shot at its burst, so there Pierce is dormant, as a kind restriction leaves a rune dormant (`runeActive`: a rune that sets `pierce` is dormant on a blow whose target has `explode: true`; `computeHeroStats` passes it from the blow's row). *It matches the dormant-by-kind rule instead of leaving staff out.*
- **Pierce on a move that already pierces every foe** (an Earth Bolt or dart: `Infinity + n`) does nothing. **Decided in the spec (review, review 2): `resolveAbility` decides it,** not `runeActive` (which can't see the elements): when the move's pierce is infinite without the rune, it leaves that Pierce out of `ResolvedAbility.runes`. The builder's dormant marks and the HUD's dots both read `ResolvedAbility.runes` (a socketed rune missing from it is dormant), so they always agree. *There is nothing further to pass, and one place deciding keeps the two views from drifting.*
- **Decided in the spec (review, review 2): Linger leaves out Volley, Barrage and Maelstrom.** *Those three land many times per cast by design (Volley's three to five darts, Barrage's seven impacts, Maelstrom's twelve ticks), so a zone per landing would bury the floor. Where another rune multiplies the landings, the extra zones are accepted: a Lance fan lingers per beam, and a Multi-shot or Pierce Bolt per bolt impact, at most a handful.*
- **Decided in the spec: Chain leaves out Blink and Armor.** *Neither goes through a path that jumps (Blink's trail and Armor's strike-back call `hitMonster` directly); adding one is a new mechanic.*
- **Decided in the spec: Saturate leaves out Armor; every "any hit" rune leaves out Surge.** *Surge has no hit (`power: 0`), and Armor's strike-back isn't a direct hit, so extra direct-hit stacks would never apply.*
- **"Attack moves"** (Echo, Heavy) are the Primary's and the Ultimate's eight forms. *The Defensive's forms re-buff or teleport the hero; repeating them is not a damage repeat.*

**Decided in the spec: a kind restriction leaves a rune dormant instead of refusing.** Linger acts only on heavy and hold blows (`fits.kinds`). A blow whose kind changes keeps its runes; a rune whose `kinds` no longer include it stays socketed but does nothing until the kind comes back, and the builder shows it dimmed ("works on heavy and hold blows"). *The user's rule is that kind changes keep runes; refusing the kind change would contradict it, and destroying the rune would punish a free toggle.*

### Knobs: the shared behaviour
A rune does nothing on its own: each tier is a set of **knob** values merged into the move with its elements, fusion and legendaries (`mergeKnobs` in `arpg/abilities/resolve.ts`). The sim reads only knobs, so a knob built once works for every rune, element, fusion and legendary that sets it.

**Reused knobs** (no new code in the sim): `power` (every trade-off but Multi-shot's, which is `extraShots.power`; Heavy's power), `area` (Widen), `applies` (Heavy's `stagger`), `chain` (Chain), `zone` (Linger), `lifesteal` (Leech).

**Changed knob: `pierce`.** Today `Knobs.pierce` is a boolean (Earth and one fusion set it). It becomes a count: `pierce: number`, the foes a shot passes, `Infinity` for all. In data it is `true` (all) or a whole number. `mergeKnobs` adds (`true` adds `Infinity`). *A count is the only way to say "passes 3 foes"; `true` → `Infinity` keeps every existing shot identical.*
- **Decided in the spec (review): `Projectile.pierce` stays a boolean, "spawned piercing", and a new `Projectile.pierceLeft: number` counts down.** A shot spawns with `pierce: pierceLeft > 0`. `step.ts`'s `if (!p.pierce) p.dead = true` becomes "dead when `p.pierceLeft <= 0`, else `p.pierceLeft--`"; the end-of-flight burst keeps today's test on `p.pierce`, so a shot spawned piercing never bursts at the end of its flight, even with its count spent. *Today's non-piercing shots burst at the end and piercing ones don't; keeping the spawn flag keeps that exactly, and the client, which reads `p.pierce` as a boolean (`fx/draw-world.ts`, `pixel/floor-engine.ts`), needs no change.*
- Where `basic.ts` passes the weapon's `HeroWeapon.pierce` (a boolean, the bow's) into a shot, it becomes `pierceLeft: Infinity` or 0 (plus the blow's own `pierce` knob), and `pierce: pierceLeft > 0`.

**New knobs**, each with a neutral value (no effect), a merge rule and one place that reads it:

| Knob | Type | Neutral | Merge | Read in |
|---|---|---|---|---|
| `split` | `{ count: number; power: number } \| null` | `null` | the larger `count` wins, with its `power` | `impact.ts` (`impact`), `step.ts` (a basic shot's hit) |
| `extraShots` | `{ count: number; power: number } \| null` | `null` | counts add, powers multiply | `resolve.ts` (Volley's and Barrage's `count`, and the per-shot power cut), `forms.ts` (Bolt, Lance), `basic.ts` (shots) |
| `echo` | `number` (fraction of power) | 0 | max | `cast.ts` (`fire`) and `basic.ts` (`strike`) queue it; `abilities/echo.ts` runs it |
| `quick` | `{ beat: number; cooldown: number; windup: number }` | all 1 | multiply each | `resolve.ts` (cooldown, conjure, channel), `moveBeat` (`cast.ts`'s `fire`, `useInterval`, the builder's readout), `basic.ts` (a blow's cycle and startup) |
| `stacksBonus` | `number` | 0 | add | `resolve.ts` (`ResolvedAbility.stacks`), `basic.ts` (a blow's stacks) |
| `catalyst` | `number` | 0 | add | `HitOpts.catalyst` → `combat.ts`'s `react` |
| `manaOnHit` | `number` | 0 | add | `HitOpts.manaOnHit` → `combat.ts`'s `hitMonster` |
| `guardOnLand` | `number` (fraction of max life) | 0 | add | `defend.ts`'s `guardLand`, called from `cast.ts`'s `fire` and `basic.ts`'s `strike` |

- **Decided in the spec: `quick` is three multipliers, not one fraction.** *Quick shortens the beat and the cooldown, and Heavy lengthens the beat and the wind-up; one knob with three parts carries both without a ninth knob.*
- **Decided in the spec: `echo` is a power fraction, its delay a balance value (`delve.runes.echoDelay`, 0.4 s).** *Every echo waits the same; the rune scales only how hard it lands.*
- **Decided in the spec (review): `extraShots` carries its own per-shot power, `{ count, power }`, not a `power` factor.** The resolver applies the cut in full on Bolt, Lance and shot blows, half of it on Volley (`power' = 1 − (1 − power) / 2`), and none on Barrage; Volley's and Barrage's extra shots add to `count`. *Volley's darts home, so its extra shots land more surely than a fan's and the review's call halves their cut. **(review 2):** Barrage takes no cut: its impacts are separate landings over an area, and with any cut tiers I–II would lose damage (8 impacts × 82.5% < 7). One knob still carries it, and the data stays one row per tier (`{ "extraShots": { "count": 1, "power": 0.65 } }`).*
- **Decided in the spec (review): the `zone` merge becomes the longer `seconds` and the larger `tickPower`, field by field** (today: the longer zone wins whole). So Linger under Magma or Rimebloom lasts the longer of the two and ticks at the stronger. *A short rune zone would otherwise do nothing under a fusion's, or a long weak one would cut the fusion's ticks; the one combination that merges two zones today (Rimeheart's 3 s × 0.15 with Rimebloom's 3 s × 0.2) comes out the same.*
- **Hit-time knobs ride `HitOpts`.** `hitOpts(ab, …)` in `impact.ts` already copies `lifesteal` into `leech`; it gains `catalyst` and `manaOnHit`. One helper, `knobHitOpts(k: Knobs)`, returns those three, so ability hits, Armor's strike-back and basic blows build them the same way.

### Each rune in the sim
What every rune does on an ability move, a melee blow and a shot blow. A dash means it doesn't fit there.

| Rune | Ability move | Melee blow | Shot blow |
|---|---|---|---|
| Split | each impact that hits a foe sheds shards | — | its hit sheds shards |
| Multi-shot | a fan (Bolt, Lance) or more darts and impacts (Volley, Barrage) | — | a fan of shots |
| Pierce | its shots pass foes | — | passes foes (wand; staff's light shot) |
| Chain | jumps from the first foe hit | jumps from the first foe struck | jumps from the foe hit |
| Widen | radius × area | reach × area (arc unchanged) | — |
| Quick | beat × , cooldown × | cycle × | cycle × |
| Echo | the move again | the blow again, where the hero stands | the shot again |
| Heavy | power, stagger, beat and wind-up × 1.2 | power, stagger, cycle and startup × 1.2 | the same |
| Saturate | + stacks on direct hits | + stacks | + stacks |
| Linger | a zone where it lands | a zone ahead (heavy and hold) | a zone at the hit (heavy and hold) |
| Volatile | its reactions | its reactions | its reactions |
| Leech | lifesteal on its hits | lifesteal | lifesteal |
| Drain | mana per foe hit | mana per foe hit | mana per foe hit |
| Guard | when it fires | when it connects | when it fires at a foe in range |

**Decided in the spec: the details below.** *Each is the least new code that does what the rune's line says, and each reuses a path the sim already has.*

- **Split.**
  - An ability's: in `impact`, every non-tick impact that hits at least one foe spawns `split.count` shards from the impact point, evenly spaced round a circle starting along the hero → impact direction (no RNG). They skip the foes the impact hit (their `hitIds` start with them), fly at `delve.runes.shardSpeed` (12) for `shardRange` (4), and each lands as one `impact` of radius 0 at `damage × split.power`.
  - **Decided in the spec (review): what a shard is.** *Shards of shards would multiply without end, and a zone or a ground burst per shard is noise.*
    - It spawns with `pierce: false`, `pierceLeft: 0` and `form: 'shard'`.
    - Its impact is direct (it can crit, applies the move's stacks) with `ImpactOpts.shard: true`, which implies `noScatter` and `silent` (no `explode` event: the shard's own flight is its visual, **review 2**), and sheds no shards, jumps no chain, leaves no zone and makes no embers.
    - An ability's shard carries a copy of its move with `split`, `extraShots`, `echo`, `zone`, `chain` and `guardOnLand` cleared; a basic shard carries no `knobs` at all. So nothing re-splits.
    - It skips the end-of-flight ground burst: a shard that reaches `shardRange` just ends.
  - So a Bolt splits where it bursts, each Volley dart where it lands, each Barrage impact that hits.
  - A basic shot's: on its first foe hit, the same shards as basic projectiles (`ability: null`), carrying the blow's element, its `applies`, and `stacks.tick`. They skip the foe it hit. **Decided in the spec (review): a shot that bursts sheds them after its burst, and they skip every foe the burst hit.** *None of Split's fits bursts today (bow and wand rows have no `explode`), but the knob is generic.*
  - A `runeFx` event (`effect: 'split'`) marks it.
- **Multi-shot.**
  - Bolt and Lance: `1 + extraShots.count` of them in a fan, at Volley's 0.22 rad steps. Bolts hit on their own (a foe in two bolts' way takes both); a Lance's beams share one hit set, so a foe is struck once per cast. *Beams are instant lines that overlap at the hero; a point-blank foe would take every one.*
  - **Decided in the spec (review): a Lance fan chains and lingers per beam.** Each beam that hits jumps from its farthest foe and leaves its zone at its first, as one Lance does today; the shared hit set means a later beam's jumps skip foes an earlier beam struck. *Each beam is a Lance; only the double hit at the hero is shared.*
  - Volley and Barrage: `extraShots.count` adds to `ResolvedAbility.count` in `resolveAbility` (Volley's darts by kind, Barrage's impacts); Volley's shots take half the power cut, Barrage's none (see the knob).
  - Bow and wand blows: `1 + extraShots.count` shots in the same fan.
  - **Every shot, the first included, is at the cut power** (half the cut on Volley, none on Barrage). *That is what "each −35%" means.*
  - **Decided in the spec (review): Twin Fang's extra shot stays one shot and carries no runes.** *It already applies no stacks and pairs nothing; it is the legendary's echo, not the blow's shot.*
- **Pierce.** The count above: a Bolt or a dart passes that many foes, impacting on each (as Earth's piercing Bolt does today), then dies on the next.
  - **(balance): shape runes add, they don't multiply.** Past its first foe, a shot that a Pierce rune carries on (a finite count) still bursts on each foe it passes, but its Chain jumps, its Linger zone and its Split shards come off its first foe only (`ImpactOpts.through`, set in `step.ts` when the shot has hit before and its `pierceLeft` is finite). A jump already spawns nothing (`chainJumps` only hits), and a shard nothing (above). An Earth shot's endless pierce (`Infinity`) keeps today's impact at every foe, so no hero without runes changes. *Of the two rules the user offered (a foe reached through Pierce or Chain spawns nothing further; or one per-cast budget for every extra target), this one needs no budget and leaves the no-rune grid identical: a shared budget would also cut a Storm Volley's per-dart jumps. Multi-shot's extra shots still each pierce and jump; the tier numbers hold those sets under the ceilings.*
- **Chain.** Abilities: as today (`chainFrom`), the Storm mastery's +2 included. Blows: `chainFrom`'s body becomes `chainJumps(ctx, first, damage, element, jumps, opts, hit)`, which both call; it keeps today's per-jump knockback origin (`kbFrom` = the foe it jumps from). A melee blow jumps from the first foe struck; a shot from the foe it hit.
  - **Decided in the spec (review): blow chains get the Storm mastery's +2 too, by the same rule as abilities (when the jumps are above 0).** *`chainJumps` holds the rule, so it can't differ.*
  - **Decided in the spec: jumps fall off at the shared `abilities.chainPower` (0.7).** *Storm, Stormcaller and the rune then follow one rule; the decisions' "60%" goes to the DPS Lab gate as an open question rather than a second fall-off.*
  - **(balance):** the user's lever "Chain falls off faster" is taken as fewer jumps (tier III +1, was +2): a rune-only fall-off would need a new knob field, and the shared 0.7 is Storm's too, so changing it would change heroes without runes.
- **Widen.** Abilities: `area` already scales `radius` (a Strike's reach, a Ward's burst). Melee blows: reach × `area`; the arc stays.
- **Quick and Heavy (`quick`).**
  - Abilities: `cooldown × quick.cooldown` (a charge payment's lockout too); `conjure`, `channel` and `castTime × quick.windup`; the beat through `moveBeat(bal, ab, tempo) = beatFor(bal, ab.slot, playedKind(ab), tempo) × ab.knobs.quick.beat`, which replaces `beatFor` in `fire`, `useInterval` and the builder's readout. A hold's charge time (`holdTime × tempo`) is untouched; its wind-up after release scales.
  - **Decided in the spec (review): blows.** The swing's `cycle = base cycle × quick.beat` and its `startup = base cycle × s.startup × quick.windup`, capped at `cycle`. `strike`'s recompute of a held blow's cycle (`attackInterval × s.time / haste`) takes the same `× quick.beat`, and its remaining time the same startup rule. *The base cycle is today's `attackInterval × s.time / haste`; scaling startup from it keeps Heavy's +20% wind-up separate from its +20% beat.*
  - Quick I is `{ beat: 0.9, cooldown: 0.9 }`; Heavy is `{ beat: 1.2, windup: 1.2 }` at every tier.
- **Echo.**
  - An ability's: when `fire` lands a move with `echo > 0`, it queues `{ at: t + echoDelay, slot, ability, aim: the landing point, blow: null, stage: null, dir: null }` on `ArpgWorld.echoes`. `echoTick` (called right after `castTick`) runs it through `executeForm` with a copy of the move whose `power × echo` and whose `echo` and `guardOnLand` are 0. The copy keeps its stage, its index (so its step bonus), its `last` (a Strike still slams), its extra shots and its split.
  - It costs nothing and starts no beat, cooldown or recoil, makes no `cast` event, and leaves the hero's facing as it was (saved and restored round `executeForm`). It fires from where the hero stands toward the landing point; a self-centred form (Nova) goes off round the hero.
  - A hold's echo repeats the stage that fired.
  - A blow's: `strike` queues `{ at, slot: null, ability: null, aim: null, blow: step, stage, dir }`, `stage` being the held blow's stage (null for a blow not held), so a hold blow's echo replays the stage it struck at. Its damage half moves into `landBlow(ctx, blow, row, dir, powerMult)`, which `strike` and the echo both call. An echo re-strikes from where the hero stands now, along `dir`. It doesn't move the hero, gain mana, advance the chain, or fire Twin Fang.
  - A `runeFx` event (`effect: 'echo'`) marks it.
  - *A repeat of the move as it landed is the plainest reading of "repeats", and routing it through the same `executeForm` and `landBlow` keeps every other knob working on the echo.*
- **Saturate.** `ResolvedAbility.stacks += stacksBonus`, and a blow's `basicByKind` stacks + `stacksBonus`. Direct hits only: ticks, jumps and splashes keep `stacks.tick`. *"Any hit" is the fit list; the extra stack is on the hit the move aimed.*
- **Linger.**
  - Abilities: `zone` is merged like Rimeheart's, so `leaveZone` already places it where the move lands (the field-by-field zone merge above). `tickPower` is 0.2 at every tier.
  - Heavy and hold blows: a hero zone with `ability: null` at the strike (melee: ahead at half the reach, as Strike's; a shot: at the hit), radius 1.2, ticking every 0.5 s for `hit × 0.2`. In `zonesTick`, a hero zone without an ability ticks each foe inside with `hitMonster(…, { source: 'basic', canCrit: false, applies: [BASIC_STATUS[element]] })`. *Today every hero zone has an ability, so `ability: null` needs no new field.*
  - **(balance): at most one zone a shot and three a cast.** One a shot is the Pierce rule's (above). Three a cast rides on the zone knob: `ZoneKnob.perCast` (Linger's rows: 3; merged as the smaller where either has one), counted per skill like Drain (`HeroEntity.zonesLeft`, set from `perCast` as `fire` fires or `strike` lands, spent by `spendZone` in `leaveZone` and `blowZone`), so an Echo's zones come out of its cast's three. An element's or a fusion's zone has no `perCast` and is never capped (a Magma Barrage still leaves seven). *Measured on a heavy Bolt at Linger V with Multi-shot V and Pierce V on 20 dummies: 22 zones a cast and 98 alive at once before, 3 and 15 after.*
- **Volatile** (the `catalyst` knob). `react` takes the hit's `opts.catalyst`, and its factor becomes `1 + legendaries.catalyst / 100 + opts.catalyst`. It scales what it scales today: the damage reactions' bonus per pair and Soulfire. The ten effect reactions don't change.
  - **Decided in the spec: it adds to the Catalyst legendary rather than multiplying.** *Both are "+X% reaction damage"; adding keeps one stat line honest.*
  - A `runeFx` event (`effect: 'volatile'`) marks a damage reaction or Soulfire the rune boosted.
- **Leech.** `lifesteal` is already `HitOpts.leech` for abilities; blows and their shots now pass theirs too.
- **Drain** (the `manaOnHit` knob).
  - `hitMonster`, for a `basic` or `skill` hit with `manaOnHit`, adds that much mana while the cast's budget lasts. `HeroEntity.drained: number[]` holds the foe-hits counted per skill (primary, defensive, ultimate, then basic at index 3, the hit's `slot ?? 3`), and the budget is `delve.runes.drainFoes` (5).
  - **Decided in the spec (review): the cap is 5 foe-hits per cast, not 5 distinct foes.** Every hit on a foe counts one, the same foe again included: direct hits, ticks, jumps and shards alike; burns, poisons and reaction splashes never. *Counting hits needs no per-cast set of foe ids.*
  - `fire` resets its slot's count **before** `executeForm` (a Lance's or a Strike's hits land inside it), and `strike` resets the basic one before its blow lands.
  - **Decided in the spec: counted per slot since it last fired.** *A cast has no identity in the sim today (one `ResolvedAbility` serves every cast of a move); a per-slot count reset on each fire is one array, and a lingering Maelstrom from an earlier cast just shares the new cast's budget.*
  - **(balance): at most half the move's own mana cost a cast** (`delve.runes.drainShare`, 0.5), and a basic blow at most half the mana a blow brings (`mana.basicAttackGain` × 0.5, so 2.5). `HeroEntity.drainLeft` holds the mana left per skill, set beside `drained` (`ab.cost × drainShare` in `fire`); each counted foe-hit gives `min(manaOnHit, drainLeft)`. A move paid with charge costs no mana, so Drain gives it none. Power's Drain terms take the same cap. *Before, Drain III gave a Volley 6 of its 8 mana a cast, and Drain V a light Burst 214% of its cost.*
- **Guard.**
  - On landing it puts up a shield of `guardOnLand × maxHp` for `delve.runes.guardSeconds` (3) through `guardLand(ctx, knobs)` in `defend.ts`. An ability lands when `fire` succeeds (the Defensive included), a melee blow when it connects, a shot when it fires at a foe in range (the same `landed` that grants mana).
  - **Decided in the spec: Guard feeds Obsidian's barrier, `HeroEntity.barrier`,** so it soaks after the Defensive's reductions (Armor, Earth) and before the Ward, where Obsidian's barrier already sits in `shieldHero`. *It reuses the barrier's soak, break event and HUD as they are, and a second shield layer would only add an order question.*
  - **Decided in the spec (review): Guard never extends a barrier larger than its own value.** When Guard's value is at least the barrier's remaining life (or there is none), it sets the barrier to its value for a fresh 3 s; against a larger barrier it does nothing. Obsidian's own rule (the larger wins, a smaller extends) is unchanged. *Otherwise a dagger's 8% Guard would keep a 30% Obsidian barrier alive forever.*
  - On fast blows it simply stays topped up at its value; it never stacks.

### Adding a rune
- **The data row** (`src/data/runes.json`, validated by `RuneDefSchema`):

  ```json
  {
    "id": "split",
    "name": "Split",
    "icon": "✳️",
    "family": "shape",
    "fits": { "forms": ["bolt", "volley", "barrage"], "weapons": ["bow", "wand"] },
    "tiers": [
      { "split": { "count": 2, "power": 0.3 } },
      { "split": { "count": 2, "power": 0.35 } },
      { "split": { "count": 3, "power": 0.4 } },
      { "split": { "count": 3, "power": 0.45 } },
      { "split": { "count": 4, "power": 0.5 } }
    ],
    "effect": "Splits into {split.count} shards on hit, each at {split.power:%} power",
    "tradeoff": null
  }
  ```

  - `tiers` holds five knob sets, the trade-off included (Pierce's is `"power": 0.9` at every tier). They are validated by the same `KnobsSchema` as elements and fusions, so a misspelled knob fails at load.
  - `fits.forms` lists form ids; `fits.weapons` lists weapon base ids whose basic blows it fits; `fits.kinds`, optional, limits the blows it acts on (Linger: `["heavy", "hold"]`).
  - `effect` and `tradeoff` are templates. `{path}` prints a knob value of the tier, `{path:%}` it × 100 with a %, `{path:±%}` (it − 1) × 100 signed with a %, and `{runes.key}` a `delve.runes` balance value (Drain's "up to {runes.drainFoes} foe-hits a cast"). Quick reads "Beat {quick.beat:±%}, cooldown {quick.cooldown:±%}" → "Beat −20%, cooldown −20%". `runeText(registry, ref, on?)` fills them, and with `on` applies the same rules as the resolver (Multi-shot's half cut on Volley and none on Barrage; the picker passes the move); the client never formats rune numbers itself.
- **A new rune from existing knobs** is one row in `runes.json`, nothing else: it drops, sockets, prices, fuses, shows, and is valued by Power and swept by the DPS Lab.
- **A rune that needs a new knob** adds:
  1. the field on `Knobs`, its neutral value in `NEUTRAL` and its rule in `mergeKnobs` (`resolve.ts`);
  2. the field on `KnobsSchema` (`schemas.ts`);
  3. its one handler, by kind:
     - resolve-time (a number on the move) in `resolveAbility` and the blows in `computeHeroStats`;
     - hit-time in `knobHitOpts` and `hitMonster` / `react`;
     - shape (more projectiles, more hits) in `impact.ts`, `forms.ts` or `basic.ts`;
     - timing in `cast.ts`, `basic.ts` or `echo.ts`;
     - landing in `defend.ts`;
  4. its term in Power's `damagePerUse` or `estimateCombat` if it changes damage, life or mana.

  Elements, fusions and legendaries can then set the knob too.

### Sockets and their price
- **Opening a socket** costs `socketLinks[n]` Links and `socketScrap[n]` scrap, where `n` is the sockets the move already has.
  - **Decided in the spec: 1 Link + 20 scrap, then 2 + 40, then 3 + 60.** *It is the slot schedule (`slotLinks` 1/2/3/4, `slotScrap` 20/40/60/80) by index, so a move's first socket costs what a chain's second slot does: a real choice between one more move and a better one.*
  - A socket can't be closed: a chain with fewer sockets on a kept move than it had is refused ("Sockets can't be closed").
  - Refusals: past the cap ("This move has every socket"), unarmed, mid-dive, and when it can't be paid.
- **Drops roll sockets.** A weapon drop opens some sockets by rarity (`delve.runes.socketDrops`), spread uniformly over the moves of the chains it carries, never past a move's cap, all empty:

  | Rarity | Open sockets |
  |---|---|
  | common, uncommon | 0 |
  | magic, rare | 0–1 |
  | epic | 1–2 |
  | legendary | 2–3 |

  - **Decided in the spec (review): the table above.** *From rare up it sits one below `extraSlots` (rare 1–2, epic 2–3, legendary 3–4), magic matches it (0–1), and common and uncommon roll none, so slots stay the main drop reward and "start with zero" holds through uncommon.*
  - The roll runs after the moveset's, from `rng.fork('sockets')` in `generateItem`. Every item stat, every moveset and every later drop come out exactly as today.
- **Parts come back, by the pull mode.** Wherever an open socket or its rune goes away other than through the builder's Apply, the parts rule applies:
  - the open socket always comes back as **one Link**, in both modes;
  - the rune in it follows the pull mode: in `destroy` it is **destroyed**; in `pay` it goes back to the pouch **free** (no pull price).
  - It covers: a salvaged weapon, fuse inputs, a transfer that drops a move or caps its sockets or can't fit a blow's rune, `chooseStartingMana`'s rebuild, and the load-time trims (which use the balance's mode).
  - **Decided in the spec (review): the parts rule follows the pull mode.** *In destroy mode, salvaging or transferring would otherwise be a free way to pull; the Links refund stays in both modes, as 4a's extra slots refund.*
  - **Accepted (review 2): in pay mode a parts return is a free pull** (salvage a bag weapon, or transfer away a rune, and it comes back without the pull price). Pay mode is a test toggle, and the hole costs a weapon or a transfer's scrap; it is noted, not closed.
  - `weaponParts(registry, weapon) → { links, runes }` is extra slots plus open sockets, and the socketed runes. `addLootToBag`, `salvageItems` and `fuseGear` use it in place of `extraSlots`, and take `opts.unsocket`; their results (`BagInsertResult`, `salvageItems`' result, `fuseGear`'s `ProfileActionResult`) gain `runes: RuneRef[]` (back to the pouch) and `destroyed: RuneRef[]`, for the toast ("2 runes back to your pouch", "destroys Split III").

### Changing runes: the draft and its price
Socketing, pulling and opening sockets go through the Anvil's draft with every other move edit, and Apply settles them all through `setChains`.

- **Moves need identity.** A rune belongs to one particular move, and two moves can be alike. So `setChains` takes **origins**: `ChainOrigins = Partial<Record<ChainSkill, (number | null)[]>>`, where `origins[skill][j]` is the index in the saved chain that the new move `j` came from, or null for a new move.
  - **Decided in the spec (review 2): missing origins are the identity map** (move `j` came from saved move `j`, if any), so the per-origin price below always applies; there is one price rule. That covers every caller that edits in place (the stop's `move`, the autopilot, `socketRune`), which price exactly as today, since an in-place edit is the same under both rules.
  - This retires 4a's "matched by what they are": the builder always sends origins, so removing a move and adding one alike now costs 2 × `editDust` (a removal and a new move) where 4a called it unchanged. The docs task updates `CLAUDE.md` and the 4a spec's pricing wording.
  - Origins for a skill that `chains` doesn't hold are ignored.
  - The builder reports them: `ChainEditor`'s `onChange(skill, chain, map)` gives, for each new move, the index in the chain it was handed (◂▸ moves it, × drops it, + gives null, an edit keeps it). The store composes that with the draft's origins.
  - `setChains` refuses origins that repeat an index or point past the saved chain ("Bad origins").
  - **Decided in the spec (review): explicit origins price everything, Dust included.** Whenever origins are given, the Dust is priced per origin pair (below), and a rune that ends up on another move than the one it was on is a **pull** (by the mode) **plus a socket**. *Matching by value would let a card be moved and edited back for nothing, a pull and a socket elsewhere net out as a free move, and two identical moves be confused; with origins the price follows exactly what the builder did.*
- **Dust with origins** (`movesetEditPrice(registry, old, next, origins?)`; missing origins are the identity map):
  1. the moves whose origins form the longest increasing run are in place, free; every other move with an origin **moved**, `editDust`;
  2. each origin pair whose kind or form changed, `editDust`; whose elements changed, `elementDust`, charged once per new element set per Apply as in 4a;
  3. a new move (null origin), `editDust`, its elements charged once per new set; a saved move no new move came from, `editDust`;
  4. a changed payment, `editDust`.
  - `editPrice(registry, profile, next, origins?)` passes them through, with the first-dive freebie as before.
- **The rune diff** (`runeChange`), per chain, for each new move `j` from saved move `o`:
  - sockets past `o`'s are **opened**, priced by their index;
  - at each socket index both have: the same rune is unchanged; otherwise the old rune is **pulled** and the new one is **socketed**;
  - each saved move no new move came from is **removed**: its sockets come back as Links (one each), its runes are pulled;
  - a new move (no origin) starts at 0 sockets, so all its sockets are opened.
- **What each costs:**
  - **socketing is free**: the rune comes out of the pouch;
  - **a pull** follows the mode:
    - `destroy`: free, and the rune is gone;
    - `pay`: `pullScrap[tier − 1]` scrap, and the rune goes back to the pouch;
  - **opening** costs Links and scrap by index;
  - **Dust** as above. `moveKey` ignores runes, so a rune change alone costs no Dust.
  - **Decided in the spec: pay mode costs 15, 30, 50, 80, 120 scrap by tier I–V.** *A tier-III pull (50) is about one socket's scrap; the mode is a test toggle, and the gate will tell.*
  - **The first-dive freebie covers Dust only.** Sockets cost Links and scrap from the start, as slots do.
- **The pouch must hold what is socketed.** For each rune and tier, `socketed − (pay ? pulled : 0) ≤ pouch`. In pay mode a rune pulled in one Apply can be socketed elsewhere in the same Apply (paying its pull price); in destroy mode it can't.
- **Links are netted.** **Decided in the spec (review):** an Apply needs `links − refundLinks` Links, the sockets of removed moves paying for sockets opened in the same Apply, and the label shows that net amount (a refund beyond the cost shows as "🔗 +2"). The hero's Links after Apply are always `before − links + refundLinks`, whatever order the edits were made in. *It conserves Links exactly, so a batch is never cheaper or dearer than the same edits applied one by one.*
- **Refusals** (all or nothing, with 4a's):
  - a socket count above the weapon rarity's cap;
  - fewer sockets on a kept move;
  - a rune that doesn't fit its move's form or weapon ("Split doesn't fit a Burst"). So **changing a move's form is refused while a socketed rune wouldn't fit it**, the user's rule. Element and kind changes keep runes;
  - **the same rune twice on one move, at any tier** ("A move takes one Split"). The same rune on different moves is fine;
  - an unknown rune id;
  - not enough runes in the pouch, net Links or scrap.
- **`DraftPrice`.** The builder shows one total, `draftPrice(…) → { dust, links, scrap, refundLinks, destroys, returns }`, from the same functions `setChains` charges with. Apply reads "Apply · ✦ 15 · 🔗 2 · ⚙ 40" (the net Links); in destroy mode, with anything destroyed, it adds "· destroys Multi-shot III".
- **The pull rule.** `unsocketMode(registry, override?) = override ?? balance.delve.runes.unsocket` (`'destroy'` as shipped). Every op that can pull or return parts takes `opts.unsocket`, defaulting to the balance.
  - The client passes the dev override: a chip beside "↺ Restart Delve (dev)" reading "Pull: destroys" / "Pull: pays", dev builds only, kept in localStorage `alloy:delve:unsocket`.
  - **Decided in the spec: the override lives in localStorage.** *It survives reloads while testing, and production builds never read it.*
- **`sameChain`** (`delve/moveset.ts`) compares runes too, so a rune-only change makes the draft dirty, blocks a new dive like any draft, and refreshes the Training Grounds' hero.
  - **Decided in the spec (review): `world.ts`'s own `sameChain` (a `ResolvedChain` against a `Chain`) compares the raw sockets,** each move's `runes` array as saved (null sockets included, by id and tier), not the resolved `ResolvedAbility.runes`. *The resolved list drops dormant and empty sockets, so it can't tell an open socket from none; the raw array is what changed.*

### Moving moves between weapons
- **Reordering** carries a move's sockets and runes (the origins).
- **Transfer** (`movesetTransfer`) moves each kept move's sockets with it.
  - **Price:** `movesets.transferScrap` (30) per open socket that moves, on top of the 30 per extra slot. **Decided in the spec: the same 30.** *The user asked for "per open socket, like extra slots".*
  - **What comes back** (one Link per socket; runes by the parts rule):
    - sockets past the target rarity's cap, from the end, with their runes;
    - the sockets and runes of moves the transfer drops (past the new slot count, or on a chain the target can't carry);
    - the target's own sockets and runes on the chains it replaces.
  - **Basic blows.** A blow's rune that doesn't fit the target weapon (Split moving from a bow to a sword) leaves by the parts rule, and its socket stays open.
  - `MovesetTransfer` gains `sockets` (moved and priced), `runes` (leaving) and `transferMoveset` takes `opts.unsocket` to settle them.
- **Equipping** a weapon as-is brings its own moveset with its runes. The old weapon goes to the bag with its own.
- **`chooseStartingMana`, realign, bind, overtake and re-attune.** Realign maps elements and keeps runes. `chooseStartingMana` rebuilds the weapon at base, its parts leaving by the parts rule (in practice a fresh hero has none).
- **The Training Grounds' `followBasic`.** **Decided in the spec (review):** when it resets a default basic chain to the new weapon's default, each new blow keeps the runes of the old blow at its position, minus any that don't fit the new weapon; a blow past the old chain's end has none. Its heir branch (`{ ...b, element }`) already keeps them. *The sandbox is free and unrestricted, so keeping what still fits loses the least of a test setup.*

### Tiers, drops and fusing
- **Tier by depth.** `tierDepths: [1, 7, 13, 21, 31]` gives the highest tier whose depth is reached; then `tierUp` (0.2) gives one tier higher, at most V.
- **Drop chances.** `dropChance: { normal: 0.03, elite: 0.15, boss: 1 }`. For normal and elite foes it is × the door's `dropMult` (at most 1). A boss always drops exactly one.
  - **Decided in the spec: the door's drop multiplier scales rune chances; magic find doesn't.** *Doors already promise "more drops"; magic find is about rarity, and runes have none.*
  - **Decided in the spec: which rune is uniform over `runes.json`, and a boss rolls at its depth (not depth + 1, as its items' item level).** *No weighting until play shows which runes feel scarce; one depth rule is simpler.*
- **On the floor.** `rollRuneDrop(registry, { depth, kind, dropMult }, rng)` runs in `killMonster` after `dropLoot`, through `dropRune` in a new `arpg/rune-drops.ts`, called inside `killMonster`'s existing `!world.sandbox` guard, so the Training Grounds and the DPS Lab drop none. It spawns a `Drop` of kind `'rune'` with `rune: RuneRef`.
  - Picked up by walking over it, like an item: `dropsTick`'s magnet (`d.kind !== 'item'` today) excludes `'rune'` too; it is vacuumed once the floor clears. The bot fetches it as it fetches items (`bot.ts`).
  - Pickup pushes it onto `world.pending.runes`; `bankWorld` adds them to `profile.runes`, `BankResult.runes` lists them, and `DiveState.runesEarned` counts them for the summary.
  - **Decided in the spec: walked over like an item.** *"Bursts onto the floor like loot" in the decisions, and a pickup the player chooses to go for reads as loot, not as a mote.*
- **Fusing.** `fuseRunes(registry, profile, ref)` turns `fuseCount` (3) of `ref` into one of `ref.tier + 1` for `fuseScrap[ref.tier − 1]` scrap. Tier V doesn't fuse. Refused mid-dive (with the forge), short of runes or scrap.
  - **Decided in the spec: 20, 40, 80, 160 scrap to make tier II, III, IV, V.** *Doubling per tier tracks the rune's worth; a III for 40 scrap matches one socket's second step.* **(review): the decisions' "plus scrap" is this cost, confirmed.**
  - Deterministic: fusing rolls nothing.

### Stops: the fifth kind
- `StopKind` gains `'rune'`: socket one pouch rune into an open empty socket of the equipped weapon. It is free.
- **It applies** when some move of the equipped weapon has an empty socket and some pouch rune fits that move and isn't already on it.
- **Taking it:** `StopAction` gains `{ kind: 'rune'; skill; index; socket; rune }`. `takeStop` runs `socketRune` (one `setChains` with positional origins) with the dive lock lifted for it.
  - **Decided in the spec (review): it refuses a socket that is filled or not yet open** ("Socket a rune into an empty socket"). *The stop socketes; it never pulls or opens.*
- **The `'move'` stop and runes.** **Decided in the spec (review):** `runStop`'s `move` copies the saved move's `runes` onto the new move and ignores any the client sent. *The stop changes one move's kind, form or elements; a client couldn't slip a socket or a rune through it. Its form change is still refused while a rune wouldn't fit.*
- **Order.** `STOP_KINDS` becomes `['equip', 'slot', 'move', 'upgrade', 'rune']`. `rollStop` is unchanged: when `'rune'` doesn't apply, every stop rolls exactly as today.
- **The autopilot** takes a stop by preference: equip, then rune, then upgrade, then slot, then skip.
  - **Decided in the spec: a rune second.** *It is free and always a gain, so it beats a scrap-priced upgrade.*
- **The client.** `STOP_TEXT.rune`: "Socket a rune: one rune from your pouch into an open socket. Free." Its picker, `RunePick`, is the move list with open sockets, then the rune picker.
- `DiveSchema`'s stop `offers` enum gains `'rune'`.

### Power and the autopilot
- **Power** reads the knobs the move resolved with, so most of it comes for free: `power` (the shot cuts included), `area`, `chain`, `zone` and Barrage's `count` are already in `damagePerUse`. The cooldown and wind-up come in through `ResolvedAbility`, and the beat through `moveBeat` in `useInterval`. The new terms in `damagePerUse`, per move, are:
  - extra shots on Bolt and Lance: × `(1 + 0.5 × extraShots.count)`;
  - **Volley's count (review):** × `count ÷ (count − extraShots.count)`. `repeats` counts only Barrage's impacts today, and Volley is valued by `TARGETS` alone; this term values the added darts and is exactly 1 for a Volley without the rune, so no hero's Power changes without runes;
  - split: + `0.5 × count × power` per hit;
  - **pierce (review):** + `0.25 × min(pierce, 3)` targets, counting only a finite pierce (a rune's). An Earth move's `Infinity` adds nothing, so heroes without runes keep their Power and the v0.50.0 pacing baseline holds;
  - echo: × `(1 + echo)`;
  - catalyst: × `(1 + 0.2 × catalyst)`;
  - saturate: × `(1 + 0.05 × stacksBonus)`.

  The new terms in `estimateCombat`:
  - Drain: + `manaOnHit × min(targets, 5) / useInterval` to mana income;
  - Guard: + `maxHp × guardOnLand × min(1, 3 / interval) × 2` to bonus life, as a Ward's;
  - Leech: + its share of the skill's DPS to `sustain`.

  The blows get the same terms (power, area on melee cleave, extra shots, split, echo, quick on the time).
  - **Decided in the spec: the constants 0.5 (an extra shot or shard finds a foe half the time), 0.25 a pierced foe, 0.2 reaction share and 0.05 per stack.** *Power is a heuristic like `TARGETS`; these keep a rune's Power change in line with its DPS Lab ratio, and the gate checks it.*
- **The autopilot's rune policy** (`delve/autopilot.ts`, between dives, after 4a's transfer, fuse and salvage) **(balance)**:
  1. **slots** up to three a chain (`SOCKETS_AFTER`), in 4a's order;
  2. **open sockets**, each only where a pouch rune that fits it raises `profilePower`, filled at once (`bestRune`): the cheapest first, the Primary's moves first, then Basic, Ultimate and Defensive, each chain from its first move; an empty socket is Links for nothing;
  3. the **4th and 5th slots** with the Links left;
  4. **socket** each socket, greedily, with the pouch rune that raises `profilePower` most (fitting and not already on the move). It overwrites a socketed rune only when another gains Power, paying per the mode;
  5. **fuse** only the copies left over, lowest tier first, so twos can cascade, and socket again (a fused tier can beat a socketed one).
  - **(review 2):** valuing a transfer, it counts the runes the parts rule would destroy (destroy mode) as lost: a transfer is taken only when its Power gain beats the Power those runes give now.
  - **Decided in the spec: slots before sockets.** *A slot adds a whole move; the user's order of investment is slots, then their sockets.* **(balance):** before a chain's 4th and 5th slots, as measured: with every slot first, the pacing seeds' pouches held 20–43 runes at dive 12 over 3–32 sockets; with sockets after the 3rd, 5–19 over 26–42, dive 12's mean 34.5 → 36 and every rail holding (after the 2nd the dives ran deeper, 38.25; after the 4th the 15-pair sweep's lowest pair fell to 14 against its floor of 13.8).
- **`playFloor`** picks up rune drops (`bot.ts`).

### The client
- **The chain builder** (`features/delve/chains/ChainEditor.tsx`, `MoveEditor.tsx`):
  - each move card shows its sockets as pips (`SocketRow`): a rune's glyph and tier, an empty socket, or "+ socket" with its price (🔗 1 · ⚙ 20) while the move is below its cap;
  - tapping an empty socket opens `RunePicker`: the pouch runes that fit this move and aren't on it, each with its effect and trade-off at its tier (`runeText`) and its count;
  - tapping a filled one shows the rune with **Pull** ("destroys it", or "⚙ 50, back to your pouch");
  - a dormant rune shows dimmed with its reason;
  - the move's readout names the beat with `moveBeat`.

  All of it edits the draft. Apply shows the `DraftPrice` total and what it destroys.
- **The Forge tab** (`ForgePanel.tsx`) gains a Runes section, `RunePouchPanel`: every rune held, by tier, with **Fuse 3 → 1** and its scrap price where three are held. Locked mid-dive like the rest of the forge.
- **The item sheet** (`ItemDetailSheet.tsx`): a weapon's moveset lists each move's sockets and runes, read-only (`SocketRow` locked). A transfer's price line adds its sockets; its notes list the runes that leave and whether they come back or are destroyed.
- **The header** shows nothing new; the pouch lives on the Forge tab. The dive summary and pickup feed name runes found ("Split III").
- **The arena:**
  - extra shots, shards, echoes, zones and the Guard shield come out as projectiles, `explode`, zones and the barrier, which already render;
  - a new `runeFx` event draws the rune's glyph as a brief mana-pixel flash at its point (`arena/fx/runes.ts`, like `fx/reactions.ts`);
  - a rune on the floor draws as its glyph in its family's colour (`ArenaRenderer`'s drop sprites), with a pickup sound.
- **The HUD pip.** `AbilityHud` gains `runes: RuneRef[]`, the active runes of the move the next press casts (`pressMove`). `ArenaHud`'s `AbilityButton` shows one small dot per rune in its family's colour along the button's top edge; none when it holds none.
  - **(review):** the manual attack's ⚔️ button (shown with manual attacks on phones) gets the same dots for the blow the next swing makes (`basicStep`), from a new `basicRunes: RuneRef[]` on the HUD snapshot type, `ArenaHud` in `useArenaCore.ts` (beside `abilities: AbilityHud[]`).
  - **Decided in the spec: dots by family for the next move, not glyphs.** *A button is about 56 px; three glyphs would crowd the step and kind marks, and the next move is what a press will do.*
  - Family colours: Shape cyan, Tempo amber, Elemental violet, Sustain green.
- **The Training Grounds** (`stores/sandboxStore.ts`, `pages/DelveTraining.tsx`):
  - every move takes up to 3 sockets, free;
  - the picker offers every fitting rune at a tier chosen in it (I–V chips), with no pouch;
  - **Load my build** copies the runes with the chains (they ride on the moves);
  - the sandbox's saved chains accept the optional `runes`.
- **The DPS Lab** gains a third view, `'rune'` (see Balance and gates).

### Determinism
- Rune drops roll on their own stream, `ArpgWorld.runeRng = rng.fork(\`runes:${opts.loot.nextUid}\`)`, created in `createFloorWorld` beside `lootRng`. Their chance, choice, tier and spawn position all come from it, so item drops, motes and orbs come out exactly as today.
  - A rune drop takes an entity id (`world.nextId`), which renumbers later spawns. Nothing in the sim reads ids for order or chance.
- Socket rolls use `rng.fork('sockets')` after the moveset (see Sockets).
- Shards are evenly spaced, echoes replay the landed move, Guard and Drain roll nothing: **no new `world.rng` draws when no rune is socketed** (an echo's or a shard's hits roll their crits like any hit). A hero without runes plays exactly as today, so the DPS Lab's grid comes out identical.

## Save version 7
- **Schemas** (`delve/profile-schema.ts`):
  - `RuneRefSchema = { id: string, tier: 1–5 }`;
  - `MoveSchema` and `BlowSchema` gain `runes: z.array(RuneRefSchema.nullable()).max(MAX_SOCKETS).optional()`. The shared `GearItemSchema` takes them, so v3–v6 saves still parse;
  - **Decided in the spec (review): no "no repeated id" refine in the schema;** `fitMovesets` fixes a repeat instead (the later socket emptied, its rune leaving by the parts rule). *A schema refine would reject the whole save over one bad socket.*
  - `RunePouchSchema = z.record(z.string(), z.array(z.number().int().min(0)).length(5))`;
  - the current schema freezes as `DelveProfileV6Schema`, and `DelveProfileSchema` is `DelveProfileV6Schema.extend({ version: z.literal(7), runes: RunePouchSchema })`;
  - the dive's `runesEarned` defaults to 0, and the stop's `offers` enum gains `'rune'`.
- **v6 → v7:** `{ ...v6, version: 7, runes: {} }`. Older saves migrate through v6 as today.
- **At load** (`fitMovesets`, which has the registry): a socket holding an unknown rune id is emptied, a repeated rune id on a move is emptied, sockets past the rarity's cap are trimmed from the end, and pouch entries for unknown ids are dropped. Trimmed sockets come back as Links and their runes leave by the parts rule, in the balance's mode. **(review 2):** a rune destroyed by a load-time trim surfaces as a notice, as `fixed` moves do: `ParsedDelveProfile` gains `runesLost: RuneRef[]`, and the store adds its toast beside `fixNotices` ("Split III was lost: its socket no longer exists").
  - **Decided in the spec: no careful migration, but nothing breaks a save once runes exist.** *The user waived migration for v6 saves (they hold none); a renamed rune in later data shouldn't brick a save.*
- `createDelveProfile` writes version 7 with `runes: {}`. The store's key stays `alloy:delve:v2`.

## Where the code changes

| Area | Files | What |
|---|---|---|
| Types | `engine/src/types/rune.ts` (new), `types/ability.ts`, `types/arpg.ts`, `types/delve.ts`, `types/gear.ts` (unchanged: runes ride `Moveset`'s chains) | the contract below |
| Data | `engine/src/data/runes.json` (new), `data/schemas.ts`, `data/loader.ts`, `data/registry.ts`, `data/balance.json` | the 14 rows, `RuneDefSchema`, `KnobsSchema`'s new fields, `delve.runes`, `ArpgData.runes`, `getRunes` / `getRune` / `findRune` |
| Rune helpers | `engine/src/loot/runes.ts` (new) | `runeFits`, `runeActive`, `runeKnobs`, `runeText`, `socketCap`, `socketPrice`, `rollSockets`, `runeTierAt`, `rollRuneDrop`, `weaponParts`, pouch helpers |
| Resolve | `arpg/abilities/resolve.ts`, `delve/hero-stats.ts` | `NEUTRAL`, `mergeKnobs`, runes merged into `resolveAbility` and the blows (`HeroBlow.knobs`), `count`, `stacks`, `quick`, `moveBeat` |
| Sim | `arpg/abilities/impact.ts`, `forms.ts`, `cast.ts`, `defend.ts`, `echo.ts` (new), `arpg/basic.ts`, `arpg/step.ts`, `arpg/combat.ts`, `arpg/world.ts`, `arpg/abilities/targeting.ts` | split, extra shots, pierce count, blow chain and zones, echo queue, Guard, Drain, Volatile, `knobHitOpts`, `world.ts`'s `sameChain` |
| Drops | `arpg/rune-drops.ts` (new), `combat.ts` (one call), `step.ts` (pickup case, magnet), `delve/dive.ts` (`bankWorld`), `loot/item-generator.ts` (socket roll) | rune drops and banking |
| Economy | `delve/runes.ts` (new), `delve/moveset.ts`, `loot/moveset.ts`, `delve/profile.ts`, `delve/profile-schema.ts`, `delve/stops.ts`, `delve/pair.ts` | `setChains` options, Dust with origins, `runeChange`, `draftPrice`, `openSocket`, `socketRune`, `fuseRunes`, transfer, salvage and fuse parts, save v7, the stop's fifth kind |
| Power, bot, Lab | `delve/hero-stats.ts`, `delve/autopilot.ts`, `arpg/bot.ts`, `arpg/dps-sim.ts`, `client/src/features/delve/lab/` | the Power terms, the rune policy, rune pickups, the Lab's rune view (engine and page) |
| Client (presentational) | `client/src/features/delve/runes/` (new): `RuneGlyph.tsx`, `SocketRow.tsx`, `RunePicker.tsx`, `RunePouchPanel.tsx`, `rune-style.ts` | the pieces, from contract types only |
| Client (wiring) | `stores/delveStore.ts`, `stores/sandboxStore.ts`, `features/delve/chains/ChainEditor.tsx`, `MoveEditor.tsx`, `chain-text.ts`, `AbilitiesPanel.tsx`, `ForgePanel.tsx`, `ItemDetailSheet.tsx`, `StopPanel.tsx`, `DiveSummary.tsx`, `LootTray.tsx`, `features/delve/arena/PickupFeed.tsx`, `pages/DelveCamp.tsx`, `pages/DelveTraining.tsx` | the draft's origins and price, the pouch, fusing, sheets, stops, the dev chip, Training |
| Client (arena) | `features/delve/arena/fx/runes.ts` (new), `ArenaRenderer.ts`, `arena-sounds.ts`, `useArenaCore.ts`, `ArenaHud.tsx` | `runeFx` flashes, rune drops, HUD pips |
| Docs | `CLAUDE.md`, `packages/client/package.json` | the Delve section's runes paragraph, v0.51.0 |

## Build waves
The decisions split the build into waves; each wave's agents work in parallel worktrees and build only against the contract below. A reviewer checks each agent's work, and a final review checks the whole. Planning splits the same way: one plan per agent.

### Wave 0: the contract (1 agent)
Everything here compiles and leaves every existing test green: the new fields are neutral, nothing reads them yet, and every behaviour is a later wave's. Merge it before wave 1 starts.

**Types** (`src/types/rune.ts`, new):

```ts
import type { FormId, MoveKind, ChainSkill, KnobsData } from './ability.js';

export type RuneId = string;
export type RuneTier = 1 | 2 | 3 | 4 | 5;
export const RUNE_TIERS = 5;
/** Most sockets any move can hold (the rarity caps are at most this). */
export const MAX_SOCKETS = 3;

export interface RuneRef {
  id: RuneId;
  tier: RuneTier;
}

export type RuneFamily = 'shape' | 'tempo' | 'elemental' | 'sustain';
export const RUNE_FAMILIES: readonly RuneFamily[] = ['shape', 'tempo', 'elemental', 'sustain'];

export interface RuneFits {
  /** Ability forms it fits. */
  forms: FormId[];
  /** Weapon base ids whose basic blows it fits. */
  weapons: string[];
  /** The blow kinds it acts on (all when absent); on another kind it stays, dormant. */
  kinds?: MoveKind[];
}

export interface RuneDef {
  id: RuneId;
  name: string;
  icon: string;
  family: RuneFamily;
  fits: RuneFits;
  /** Knob values at tiers I..V (index tier − 1), the trade-off included. */
  tiers: KnobsData[];
  /** Templates filled by `runeText`: {path}, {path:%}, {path:±%}, {runes.key}. */
  effect: string;
  tradeoff: string | null;
}

/** Loose runes: rune id → counts by tier (index tier − 1). */
export type RunePouch = Record<RuneId, number[]>;

/** What a pull does: the rune is destroyed, or it costs scrap and goes back to the pouch. */
export type UnsocketMode = 'destroy' | 'pay';

/** For each chain, the saved move index each new move came from (null: a new move). */
export type ChainOrigins = Partial<Record<ChainSkill, (number | null)[]>>;

/** What a rune is socketed on: an ability move's form, or a basic blow on a weapon. */
export type RuneTarget =
  | { form: FormId }
  /** `explode`: the blow's row bursts (`ComboStepDef.explode > 0`), where `pierce` does nothing. */
  | { weapon: string | null; kind: MoveKind; explode?: boolean };
```

**Types** (`types/ability.ts`):

```ts
export interface Move { kind: MoveKind; form: FormId; elements: ManaType[]; runes?: (RuneRef | null)[]; }
export interface Blow { kind: MoveKind; element: ManaType; runes?: (RuneRef | null)[]; }

export interface QuickKnob { beat: number; cooldown: number; windup: number; }
export interface SplitKnob { count: number; power: number; }
/** Extra shots and each shot's power (the cut is halved on Volley and Barrage). */
export interface ShotsKnob { count: number; power: number; }

export interface Knobs {
  // …today's fields, with:
  /** Foes a shot passes (Infinity: all). */
  pierce: number;
  split: SplitKnob | null;
  extraShots: ShotsKnob | null;
  /** Fraction of power the move or blow repeats at, `delve.runes.echoDelay` later (0: none). */
  echo: number;
  quick: QuickKnob;
  stacksBonus: number;
  catalyst: number;
  manaOnHit: number;
  /** Fraction of max life shielded on landing, for `delve.runes.guardSeconds`. */
  guardOnLand: number;
}

/** Knobs as data sets them (elements, fusions, runes): partial, `pierce` true for all. */
export type KnobsData = Partial<Omit<Knobs, 'pierce' | 'quick'>> & {
  pierce?: boolean | number;
  quick?: Partial<QuickKnob>;
};

export interface ResolvedAbility {
  // …today's fields, with:
  /** The runes acting on it (fitting and not dormant), in socket order. */
  runes: RuneRef[];
}
```

`ElementTraitDef.knobs` and `FusionDef.knobs` become `KnobsData`. `mergeKnobs(...parts: KnobsData[])` gets the new fields' merge rules (the knob table) and the field-by-field `zone` rule, and `NEUTRAL` their neutral values; **`NEUTRAL` is exported** (`computeHeroStats` and the tests need it). `resolveAbility` sets `runes: []`.

**Types** (`types/arpg.ts`, `types/delve.ts`):

```ts
export type DropKind = 'item' | 'mote' | 'orb' | 'scrap' | 'rune';
// Drop: rune?: RuneRef
// Projectile: pierce: boolean (unchanged: spawned piercing); pierceLeft: number (new);
//   form: FormId | 'ember' | 'shard' | null; knobs?: Knobs  // a basic shot's blow knobs
// Zone: unchanged (a hero zone with ability null is a blow's Linger)
// WorldPending: runes: RuneRef[]
// ArpgWorld: runeRng: SeededRNG; echoes: Echo[]
export interface Echo {
  at: number;
  /** An ability's: its slot, the move as it landed, and its landing point. */
  slot: number | null;
  ability: ResolvedAbility | null;
  aim: Vec | null;
  /** A blow's: its step in the basic chain, the stage it struck at (null: not held), and its way. */
  blow: number | null;
  stage: number | null;
  dir: Vec | null;
}
// HeroEntity: drained: number[]  // foe-hits counted per skill since it last fired: primary, defensive, ultimate, basic
// ArpgEvent: | { kind: 'runeFx'; effect: 'split' | 'echo' | 'volatile'; x: number; y: number; element: ManaType | null }
// ArpgEvent 'pickup': rune?: RuneRef
// HitOpts (combat.ts): catalyst?: number; manaOnHit?: number
// ImpactOpts (impact.ts): shard?: boolean

// types/delve.ts
// HeroBlow: knobs: Knobs; runes: RuneRef[]
// DelveProfile: version: 7; runes: RunePouch
// DiveState: runesEarned: number
// StopKind: 'equip' | 'slot' | 'move' | 'upgrade' | 'rune'
// BankResult: runes: RuneRef[]
// ProfileActionResult (delve/profile.ts): runes?: RuneRef[]  // back to the pouch; destroyed?: RuneRef[]
// BagInsertResult (delve/profile.ts): runes: RuneRef[]; destroyed: RuneRef[]
// salvageItems' result: runes: RuneRef[]; destroyed: RuneRef[]
//   (wave 0 adds the fields, always empty; B fills them)
```

**Wiring that keeps wave 0 green:**
- World and hero setup (`world.ts`) initialises `runeRng`, `echoes: []`, `pending.runes: []` and `drained: [0, 0, 0, 0]`; `computeHeroStats` gives each blow `knobs: NEUTRAL` and `runes: []`.
- Every projectile spawn passes `pierceLeft: Infinity` where it passes `pierce: true` and 0 where `false`; `basic.ts` maps `HeroWeapon.pierce` (a boolean) the same way. `step.ts` spends `pierceLeft` and keeps its end-of-flight test on `p.pierce`, so every shot is identical. The client reads `p.pierce` as a boolean as before, so `pixel/floor-engine.ts` needs no change.
- `tests/ability-resolve.test.ts:203` (`expect(k.pierce).toBe(true)`) becomes `toBe(Infinity)`, and the neutral-knobs test there takes the new fields. **(review 2):** `client/src/stores/delveStore.test.ts:250` and `engine/tests/delve-movesets.test.ts:427` expect `version: 7`.
- **(review 2):** `forms.ts` passes `pierce: ab.knobs.pierce > 0, pierceLeft: ab.knobs.pierce` for Bolt and Volley. `pierceLeft` is optional in `spawnProjectile`'s input, defaulting to `p.pierce ? Infinity : 0`, and `step.ts` treats an `undefined` `pierceLeft` the same way, so spawns that don't pass it (embers, monster shots) are unchanged.
- `stopKinds`' `applies` record gains `rune: false` (B fills it), and `startDive` writes `runesEarned: 0` beside `linksEarned`.
- `fitMovesets` gets its load-time checks inline: unknown ids and repeated ids emptied, sockets past the cap trimmed, pouch entries for unknown ids dropped, the parts returned by the parts rule in the balance's mode. **Decided in the spec (review): inline in wave 0, not handed to B.** *It is a few lines over the save shape wave 0 defines, and B then only uses it.*
- `src/index.ts` pre-exports every new module and symbol (`types/rune.ts`, `loot/runes.ts`, `delve/runes.ts`, `arpg/abilities/echo.ts`, `arpg/rune-drops.ts`, `NEUTRAL`, `moveBeat`, `knobHitOpts`, `guardLand`) in wave 0, so A and B never both edit it.

**Data:**
- `src/data/runes.json`: the 14 rows of the rune table, in that order.
- `schemas.ts`: `KnobsSchema` gains `pierce: z.union([z.boolean(), z.number().int().min(1)])` and the new fields (all optional, `.strict()` kept); `RuneDefSchema` checks `tiers.length === 5` and the family enum; `RunesSchema = z.array(RuneDefSchema)` with unique ids.
- A data test checks every `fits.forms` id against `arpg.json`'s forms, every `fits.weapons` id against `delve.json`'s weapon bases, and every template path against its tiers.
- `loader.ts` parses `runes.json` and sets `arpg.runes`. `ArpgData.runes: RuneDef[]`. The registry gains `getRunes(): RuneDef[]`, `getRune(id): RuneDef` (throws) and `findRune(id): RuneDef | undefined`.

**Balance** (`balance.json → delve.runes`, its Zod schema and its type in `DelveBalance`):

```json
"runes": {
  "socketCap": { "common": 1, "uncommon": 1, "magic": 2, "rare": 2, "epic": 3, "legendary": 3 },
  "socketLinks": [1, 2, 3],
  "socketScrap": [20, 40, 60],
  "socketDrops": { "common": [0, 0], "uncommon": [0, 0], "magic": [0, 1], "rare": [0, 1], "epic": [1, 2], "legendary": [2, 3] },
  "unsocket": "destroy",
  "pullScrap": [15, 30, 50, 80, 120],
  "fuseCount": 3,
  "fuseScrap": [20, 40, 80, 160],
  "dropChance": { "normal": 0.03, "elite": 0.15, "boss": 1 },
  "tierDepths": [1, 7, 13, 21, 31],
  "tierUp": 0.2,
  "echoDelay": 0.4,
  "guardSeconds": 3,
  "drainFoes": 5,
  "shardSpeed": 12,
  "shardRange": 4
}
```

The schema refines `socketCap` values ≤ `MAX_SOCKETS`, `socketLinks` and `socketScrap` of length `MAX_SOCKETS`, `pullScrap` of length 5, and `fuseScrap` of length 4.

**Save v7:** the schemas and the v6 → v7 step above, `createDelveProfile` at version 7, and `fitMovesets`' load-time checks (unknown ids, caps).

**Pure helpers** (`src/loot/runes.ts`), which every later wave reads:

```ts
export function runeFits(def: RuneDef, on: RuneTarget): boolean;          // forms / weapons only
export function runeActive(def: RuneDef, on: RuneTarget): boolean;        // fits, the blow's kind, and no `pierce` on a bursting row
export function runeKnobs(
  registry: DataRegistry,
  runes: readonly (RuneRef | null)[] | undefined,
  on: RuneTarget,
): { knobs: KnobsData[]; active: RuneRef[] };                             // unknown ids and dormant runes skipped
export function runeText(registry: DataRegistry, ref: RuneRef, on?: RuneTarget): { effect: string; tradeoff: string | null };
export function socketCap(registry: DataRegistry, rarity: Rarity | null): number; // unarmed: 0
export function socketPrice(registry: DataRegistry, open: number): { links: number; scrap: number } | null; // null at MAX_SOCKETS
export function pouchCount(pouch: RunePouch, ref: RuneRef): number;
export function addToPouch(pouch: RunePouch, refs: readonly RuneRef[]): RunePouch;
export function takeFromPouch(pouch: RunePouch, refs: readonly RuneRef[]): RunePouch | null; // null when short
export function socketsOf(m: Move | Blow): (RuneRef | null)[];            // m.runes ?? []
```

**Signatures the wave-1 agents fill in** (wave 0 declares them as stubs that throw "not built yet", with `it.todo` tests, so imports resolve):

```ts
// loot/runes.ts (B)
export function runeTierAt(registry: DataRegistry, depth: number, rng: SeededRNG): RuneTier;
export function rollRuneDrop(
  registry: DataRegistry,
  ctx: { depth: number; kind: MonsterKind; dropMult: number },
  rng: SeededRNG,
): RuneRef | null;
export function rollSockets(
  registry: DataRegistry,
  item: Pick<GearItem, 'rarity'>,
  moveset: Moveset,
  rng: SeededRNG,
): Moveset;
export function weaponParts(registry: DataRegistry, weapon: GearItem): { links: number; runes: RuneRef[] };

// delve/runes.ts (B)
export interface SetChainsOptions { origins?: ChainOrigins; unsocket?: UnsocketMode; }
export interface RuneChange {
  links: number;          // sockets opened
  scrap: number;          // sockets opened, and pulls in 'pay'
  refundLinks: number;    // sockets of removed moves (netted against `links`)
  socketed: RuneRef[];    // out of the pouch
  pulled: RuneRef[];      // destroyed ('destroy') or back to the pouch ('pay')
}
export interface DraftPrice {
  dust: number; links: number; scrap: number; refundLinks: number;
  destroys: RuneRef[]; returns: RuneRef[];
}
export function unsocketMode(registry: DataRegistry, override?: UnsocketMode | null): UnsocketMode;
export function runeChange(
  registry: DataRegistry, profile: DelveProfile, chains: Partial<Chains>, opts?: SetChainsOptions,
): RuneChange | { refused: string };
export function draftPrice(
  registry: DataRegistry, profile: DelveProfile, chains: Partial<Chains>, opts?: SetChainsOptions,
): DraftPrice | { refused: string };
export function openSocket(registry: DataRegistry, profile: DelveProfile, skill: ChainSkill, index: number): ProfileActionResult;
export function socketRune(
  registry: DataRegistry, profile: DelveProfile, skill: ChainSkill, index: number, socket: number,
  rune: RuneRef, opts?: SetChainsOptions,
): ProfileActionResult;
export function fusePrice(registry: DataRegistry, ref: RuneRef): number | null; // null at tier V
export function fuseRunes(registry: DataRegistry, profile: DelveProfile, ref: RuneRef): ProfileActionResult;

// delve/moveset.ts (B): today's signatures plus origins and options
export function movesetEditPrice(
  registry: DataRegistry, old: Partial<Chains>, next: Partial<Chains>, origins?: ChainOrigins,
): number;
export function editPrice(
  registry: DataRegistry, profile: DelveProfile, next: Partial<Chains>, origins?: ChainOrigins,
): number;
export function setChains(
  registry: DataRegistry, profile: DelveProfile, chains: Partial<Chains>, opts?: SetChainsOptions,
): ProfileActionResult;
export function transferMoveset(
  registry: DataRegistry, profile: DelveProfile, uid: string, opts?: { unsocket?: UnsocketMode },
): ProfileActionResult;

// delve/profile.ts (B): today's signatures plus the pull mode for the parts rule
export function salvageItems(
  registry: DataRegistry, profile: DelveProfile, uids: string[], opts?: { unsocket?: UnsocketMode },
): { profile: DelveProfile; scrap: number; dust: number; links: number; count: number;
     runes: RuneRef[]; destroyed: RuneRef[] };
export function fuseGear(
  registry: DataRegistry, profile: DelveProfile, uids: string[], opts?: { unsocket?: UnsocketMode },
): ProfileActionResult;

// arpg/abilities/resolve.ts (wave 0: written, not stubbed; see below)
export function moveBeat(bal: DelveBalance, ab: ResolvedAbility, tempo: number): number;
// arpg/abilities/echo.ts (A)
export function queueEcho(ctx: SimCtx, echo: Echo): void;
export function echoTick(ctx: SimCtx): void;
// arpg/abilities/defend.ts (A)
export function guardLand(ctx: SimCtx, knobs: Knobs): void;
// arpg/abilities/impact.ts (A)
export function knobHitOpts(k: Knobs): Pick<HitOpts, 'leech' | 'catalyst' | 'manaOnHit'>;
// arpg/rune-drops.ts (B)
export function dropRune(ctx: SimCtx, m: MonsterEntity): void;
```

`moveBeat` is declared in wave 0 as `beatFor(...) × ab.knobs.quick.beat` (trivially correct with neutral knobs), and its callers switch to it in wave 0 too, so A and D read one function.

### Wave 1 (3 agents, worktrees)
- **A: the sim.** Fills `runeKnobs` into `resolveAbility` (merged after the legendaries; `count += extraShots.count` for Volley and Barrage, the cut halved on Volley, none on Barrage, full elsewhere; `stacks += stacksBonus`; `quick` into cooldown, conjure, channel and castTime; `runes: active`) and into the blows in `computeHeroStats` (`knobs`, `runes`). Then every handler in "Each rune in the sim": `impact.ts`, `forms.ts`, `cast.ts`, `defend.ts`, `echo.ts`, `basic.ts` (`landBlow`, blow chain, Linger, shots' `knobs`, the cycle and startup rule), `step.ts` (`pierceLeft`, shards, a basic shot's knobs, `echoTick`, blow zones), `combat.ts` (`knobHitOpts`, Volatile in `react`, Drain), `targeting.ts` (`spawnProjectile` takes optional `hitIds`), `world.ts`'s `sameChain` on raw sockets, and the Training Grounds' `followBasic` keeping blow runes.
  - **Files it owns:** those, plus `tests/delve-rune-sim.test.ts`.
  - **Tests alone:** builds heroes with hand-made chains carrying runes (`createHeroEntity` with a resolved chain, as `tests/fixtures/arena.ts` does) and steps the sandbox world. One test per rune per target it fits (ability, melee, shot), plus: neutral knobs change nothing (a fixed-seed run's events identical with and without empty sockets); shards don't split, scatter or burst at the end of flight; an echo doesn't echo, and a hold blow's echo replays its stage; Guard never extends a larger barrier; Drain's cap counts foe-hits and resets before the cast's hits; a dormant Linger and a dormant Pierce (a staff's bursting row, an Earth Bolt); a shot spawned piercing never bursts at the end of flight.
- **B: the economy.** `loot/runes.ts`'s rolls and parts, `delve/runes.ts`, `movesetEditPrice` and `editPrice` with origins, `setChains`'s options (`runeChange` charged with the Dust, its refusals, net Links), `sameChain` with runes, `movesetTransfer`'s sockets and runes, `addLootToBag` / `salvageItems` / `fuseGear` / `transferMoveset` with `weaponParts` and the parts rule, `chooseStartingMana`'s parts, the socket roll in `generateItem`, `world.runeRng` drops (`arpg/rune-drops.ts` and its one call inside `killMonster`'s `!world.sandbox` guard), the `'rune'` pickup case and the magnet exclusion in `step.ts`'s `dropsTick`, `bankWorld`, the stop's fifth kind and the `'move'` stop's rune copy.
  - **Files it owns:** those, plus `tests/delve-runes.test.ts`.
  - **Merge points with A:** `combat.ts` (B adds one line in `killMonster`; A edits `hitMonster` and `react`), `step.ts` (B's `dropsTick` changes; A's projectile and zone ticks), and `delve/moveset.ts`'s `sameChain` (B owns it). Both rebase on wave 0 and touch disjoint functions; neither edits `src/index.ts`.
  - **Tests alone:** every price and refusal in "Changing runes", both modes; origins (reorder carries runes, removal refunds, a bad origin refused, a moved card costs `editDust` even when edited back, a rune changing moves is a pull plus a socket, origins for a skill not in `chains` ignored); net Links conserved against the same edits one by one; transfer, salvage, fuse and `chooseStartingMana` parts in both modes; fusing; drop chances and tiers (a seeded sweep), none in the sandbox; item determinism (every v0.50.0 item stat and moveset identical, sockets aside); the stops (`'rune'` refusing a filled or unopened socket, `'move'` keeping the saved runes, `rollStop` unchanged without `'rune'`); save v7 load and trims.
- **C: client presentational components** (`client/src/features/delve/runes/`), from the contract types and `runeText` / `runeFits` only, no store:

  ```tsx
  export function RuneGlyph(props: { rune: RuneRef; dormant?: boolean; size?: 'sm' | 'md' }): JSX.Element;
  export interface SocketRowProps {
    runes: readonly (RuneRef | null)[];
    cap: number;
    /** The next socket's price; null hides "+ socket" (at the cap, or locked). */
    nextPrice: { links: number; scrap: number } | null;
    /** Socket indexes whose rune does nothing on this move now. */
    dormant?: readonly number[];
    locked?: boolean;
    onOpenSocket?: () => void;
    onSocketTap?: (socket: number) => void;
  }
  export interface RunePickerProps {
    /** Runes that fit the move and aren't on it; count null = unlimited (Training Grounds). */
    candidates: readonly { rune: RuneRef; count: number | null }[];
    /** A filled socket's rune, shown with Pull. */
    current?: RuneRef | null;
    /** "Pull · destroys it", or "Pull · ⚙ 50, back to your pouch". */
    pullText?: string;
    /** Training Grounds: pick the tier in the picker (I–V chips). */
    tierChoice?: boolean;
    onPick: (rune: RuneRef) => void;
    onPull?: () => void;
    onClose: () => void;
  }
  // The component is RunePouchPanel, so it never shadows the engine's `RunePouch` type.
  export interface RunePouchPanelProps {
    pouch: RunePouch;
    fuseCount: number;
    fusePrice: (ref: RuneRef) => number | null;
    scrap: number;
    locked: boolean;
    onFuse: (ref: RuneRef) => void;
  }
  // rune-style.ts: FAMILY_STYLE: Record<RuneFamily, { color: string; label: string }>
  ```

  **Decided in the spec (review): the pouch component is `RunePouchPanel`.** *The engine's type is `RunePouch`; one name for two things would need an import alias in every file that uses both.* Pad navigable (`data-pad-scope` on the picker, `data-pad-back` on its close). Its tests render each with fixture runes from the default registry.

### Wave 2 (3 agents)
- **D: Power, the autopilot, the DPS Lab.** D alone owns the Lab, engine and page. The Power terms (`damagePerUse`, `estimateCombat`, the blows), the autopilot's rune policy and stop preference, `bot.ts`'s rune pickups, and the Lab's rune view: `dpsCombos` adds `view: 'rune'` rows.
  - For each rune, each form it fits among the Primary's and Ultimate's: the form's default chain, paid with mana, every move with one socket holding the rune at tier III, `dims: { rune, on: form, elements, tier: 'III' }`.
  - For each weapon it fits: the weapon's default basic chain with every blow socketed, `dims: { rune, on: weapon, elements, tier: 'III' }`.
  - The element set is Fire, except for **Volatile and Saturate, which run on Fire + Frost** (moves `['fire', 'frost']`; basics with a Frost secondary), so their reactions (Melt) actually fire and their gate can fail.
  - A `rune: 'none'` row per form and weapon, in each element set used, as the baseline.
  - `runeComboSetups(registry, on: FormId | string)`: every three-rune set of the runes fitting a form or a weapon's blows, tier III, all three on every move or blow, Fire + Frost when the set holds Volatile or Saturate, else Fire, for the combo gate (wave 3). Not in the grid.
  - The Lab page (`features/delve/lab/`) gets the third view with a "× none" ratio column.
  - **Decided in the spec (review): Fire only (Fire + Frost for Volatile and Saturate), tier III, every move socketed.** *The gate is about the rune, not the element, but a reaction rune on one element never reacts and would pass a ceiling it can't test; this keeps the axis to about 200 rows.*
  - **Tests alone:** after A, a rune's Power change has the sign of its Lab ratio and its size within ±25% of its **single-dummy** ratio (Power models one target, the reference monster, so the pack ratio isn't its yardstick; Guard, Leech and Drain checked for sign only, since their worth is life and mana, not DPS); the autopilot fuses, opens and sockets (a seeded profile); `dpsCombos`' old rows are unchanged and `dpsKey`s stay unique.
- **E: client wiring.** `delveStore` (`chainDraft.origins`, `draftChanges` with runes, `draftPrice` for the Apply label with net Links, `applyDraft` passing origins and `unsocketMode`, `fuseRunes`, the dev override, rune toasts from `runes` and `destroyed`), `ChainEditor` / `MoveEditor` (`onChange(skill, chain, map)`, `SocketRow` on each card, `RunePicker`, a `runes?: ChainRunes` prop), `ForgePanel` (`RunePouchPanel`), `ItemDetailSheet`, `StopPanel`'s `RunePick`, `DiveSummary` and `features/delve/arena/PickupFeed.tsx`, the dev chip in `DelveCamp`, and the Training Grounds (`sandboxStore` schemas with `runes`, unrestricted sockets, Load my build). E doesn't touch the Lab.

  ```ts
  export interface ChainRunes {
    /** Pouch counts, or 'any' (Training Grounds: every rune, every tier). */
    pouch: RunePouch | 'any';
    /** Most sockets a move may open (the weapon's rarity's; 3 in the Training Grounds). */
    socketCap: number;
    /** The next socket's price when a move has `open`; null: free. */
    socketPrice: (open: number) => { links: number; scrap: number } | null;
    /** The weapon whose blows the basic chain's runes must fit. */
    weaponBaseId: string | null;
    pullText: (rune: RuneRef) => string;
  }
  ```

  - **Tests alone:** store tests (origins composed through reorder, remove and add; Apply all or nothing; net Links in the label; dev override), component tests for the builder's sockets and the Forge pouch.
- **F: the arena.** `fx/runes.ts` flashes for `runeFx`, rune drops in `ArenaRenderer` and `arena-sounds.ts`, `AbilityHud.runes` and the snapshot's `basicRunes` (both types in `useArenaCore.ts`), and the pips on the ability buttons and the ⚔️ button in `ArenaHud.tsx`.
  - **Tests alone:** fx tests with synthetic `runeFx` and `drop` events, and an `ArenaHud` test with a snapshot holding runes.

### Wave 3 (gate and finish)
The DPS Lab gate (single runes and combos) and the pacing rails (below), the E2E spec, `CLAUDE.md`, and v0.51.0. If a ceiling breaks, stop and report the numbers to the user before tuning.

## Balance and gates
- **Before anything changes,** capture v0.50.0's `runAutopilot` numbers and the DPS Lab grid.
- **The DPS Lab's existing grid must come out identical**, row for row: a hero with no runes plays exactly as before.
- **The single-rune ceiling:** no rune more than doubles a move's damage at tier III. Each rune row's DPS ÷ its `none` row (same form or weapon, same element set) must be at most **2.0** on one dummy and **2.5** on the pack **(balance: pack-aware; a shape rune's worth is on the other foes)**.
- **Expected (review 2):** Multi-shot on Barrage is a plain gain (tier III, 9 impacts for 7: about 1.29× on the pack); on Volley a gain at every tier (tier III, 5 darts at 86.25% for 3: about 1.44× when they all home on one dummy).
- **The combo ceiling (review, review 2):** for each form and each weapon's basic chain, the highest-ratio set of three runes among those that fit it, at tier III (searched over every such set with `runeComboSetups`, at most 286 each), must be at most **3.0×** its `none` row on one dummy and **4.0×** on the pack **(balance)**. A combo containing Volatile or Saturate runs on Fire + Frost (against a Fire + Frost `none` row), any other on Fire. A one-off run in wave 3 (a skipped-by-default vitest file, or the Lab's worker), not CI. **Decided in the spec (review).** *Runes stack on a move; a ceiling on singles alone would miss a pair that multiplies.*
- The ratios go in the release notes; a breach stops the build for the user's call.
- **Pacing:** every rail in `tests/delve-pacing.test.ts` must hold, with the autopilot using runes. Runes add Links (socket drops salvaged) and power, so dives may go deeper; if a rail breaks, report the numbers. The fix is the user's call: drop chances, socket prices, tier numbers, or a changed rail.

### The balance pass (2026-10-01)
The first gate failed (14 singles and 363 sets over 2.0× / 3.0×; the worst, Multi-shot + Pierce + Chain on a Volley in the pack, at 12.46×). The user's decisions, as built:
- **The ceilings** are pack-aware: one dummy 2.0× a rune and 3.0× a set, the pack 2.5× and 4.0×.
- **How the rune view measures** (`arpg/dps-sim.ts`; the basic and ability views are unchanged, row for row):
  - **An ability's burn counts while its own hits keep it.** A burn belongs to the slot whose hit set its strength, and the basic attack, swinging on its own under a held ability, keeps its stacks alive all fight. So a rune that lifted the ability's per-hit burn above the basics' took over the basics' burn for the whole run: Heavy on a Barrage read 3.07× on one dummy (burn ticks 72 → 239: the Barrage's burn ref 14 over the sword's 12), and a Fire Nova was credited ~30 hits a cast, most of them burn the basics kept up. On Fire + Frost the basics' Frost blow melts the Nova's burn within a second, and that Melt is theirs, so the Fire + Frost Nova's ~4 hits a cast were its own. A rune row now counts a burn or poison tick only within the element's stack duration of the held button's last hit on that foe. Not a sim bug: the game deals the same damage; only the credit moved.
  - **Eight combat seeds, averaged** (`RUNE_SEEDS`; seed 0 the sandbox's own; `DpsOptions.seed` runs one). A Barrage lands twice in 30 s and rains its impacts at random, so one seed swung a rune's ratio 0.7–4×.
- **Shape runes add, they don't multiply** (the Pierce rule above), and **Pierce, Chain, Widen and Multi-shot are tuned down** (the table).
- **Drain** gives back at most half a cast's mana; **Linger** leaves at most one zone a shot and three a cast (above).
- **The autopilot** opens sockets only for runes that go in, fuses only the leftovers, and opens sockets before a chain's 4th and 5th slots (above).
- **Drain on a Volley (1.36×)** is mana, not hits: the held Primary is mana-bound in the Lab (60 mana to start, the basics' income), and Drain lets it cast at its beat (52 casts in 30 s for 40). The cap halves the refund (6 → 4 of 8), but 4 a cast still keeps a Volley above its cost for the Lab's 30 s, so the ratio stands.

**Measured** after the pass (depth 10; the gate's scripts `rune-gate.mjs`, `probes.mjs` and `pacing.mjs`):
- **No runes, no change:** the grid's 9,144 v0.50.0 rows identical; the items hash unchanged (291 items).
- **Singles, tier III (one dummy / pack; first gate → after):** Split 1.00 / 1.45 → 1.00 / 1.41; Multi-shot 3.62 / 2.01 → 1.28 / 1.28; Pierce 0.96 / 4.58 → 0.87 / 1.95; Chain 1.00 / 2.28 → 1.00 / 1.72; Widen 0.90 / 2.81 → 0.90 / 1.80; Quick 1.11 / 1.17 → 1.18 / 1.22; Echo 1.74 / 1.77 → 1.45 / 1.43; Heavy 3.07 / 2.18 → 1.52 / 1.48; Saturate 1.33 / 1.33 → 1.34 / 1.33; Linger 1.53 / 1.55 → 1.79 / 1.93; Volatile 1.22 / 1.23 → 1.21 / 1.23; Leech and Guard 1.00; Drain 1.40 → 1.36. None over.
- **Sets (5,564 runs):** the worst in the pack Pierce + Echo + Heavy on a Volley, 3.78× (was 12.46×). **Over: five, all on a Nova on one dummy with Linger:** Heavy + Linger + Volatile 5.97×, Heavy + Saturate + Linger 5.12×, Echo + Linger + Volatile 5.11×, Echo + Saturate + Linger 4.35× (Fire + Frost) and Echo + Heavy + Linger 3.04× (Fire). The Nova is an Ultimate that lands twice in 30 s, so on one dummy its baseline is two blasts (Fire + Frost: 5.7 DPS); Linger turns it into a 2.5 s field whose ticks set off Melts against the basics' Frost stacks. The whole fight gains 19 DPS on 63 (+31%), which against the Nova's own 5.7 still reads 4.4× counted fight-wide; halving Linger's tick or its seconds leaves it above 3.0×. On the pack the same sets read 3.2–3.4×. Left for the user's call: Nova out of Linger's fits, or a per-cast measure for Ultimates.
- **Pacing (v0.50.0 → the first gate → after):** first dives 3, 3, 3, 3 throughout; dive 6 and dive 12 means 23.5, 30 → 23.5, 33.75 → 24.75, 36; Frost dive 1 → dive 12, 4 → 29.5, then 3.5 → 32.5, then 3.5 → 32.5; legendaries at dive 12, 6.5 → 5.25 → 6; the own pair's reaction 6 of 6 throughout; the 15-pair sweep's median 22 (19–32) → 24 (18–29) → 22 (18–30, allowed 13.2–35.2); seconds a floor 35.03 → 33.49 → 27.98. Every rail holds. At dive 12 the four seeds' weapons hold 26, 42, 38 and 26 sockets, all filled, with 8, 9, 19 and 5 runes left in the pouch.

## Testing
- **Engine:**
  - data: every rune row valid, fits ids real, templates filled, all 14 present;
  - knobs: `mergeKnobs`' rule for each new knob and the field-by-field zone; `pierce` true → Infinity; neutral knobs leave a fixed-seed fight identical;
  - each rune on each target it fits (ability, melee blow, shot blow); dormant Linger and Pierce; shards don't split, chain, linger, echo, scatter or burst at the end; a Lance fan's chain and zone per beam; Twin Fang's shot without runes; echo doesn't echo and starts no beat, and a hold blow's echo replays its stage; Guard never extends a larger barrier; Drain's cap (foe-hits) and reset before the cast; Volatile adds to the legendary; blow chains with the Storm mastery;
  - `moveBeat` with Quick and Heavy; a blow's cycle and startup, a held blow's recompute;
  - sockets: price by index, the rarity cap, can't close, drops by rarity, determinism of items;
  - the draft: origins (reorder, remove, add, ignored for an absent skill), Dust per origin pair, socket free, pull in both modes, a rune changing moves as pull plus socket, removal refunds and pulls, net Links conserved, the same rune twice refused, a form change refused for a non-fitting rune, a kind or element change keeping runes, pouch accounting in both modes, all or nothing;
  - transfer (sockets moved and priced, the target's cap, dropped moves' parts, blow runes that don't fit), salvage, fuse and `chooseStartingMana` parts, each in both modes;
  - fusing (price, tier V, short);
  - drops: chances by kind and door, tier by depth and tierUp, the rune stream leaving item drops unchanged, none in the sandbox, no magnet, banking and `runesEarned`;
  - the stop's fifth kind: when it applies, taking it, refusing a filled or unopened socket, `rollStop` unchanged without it; the `'move'` stop keeping the saved runes;
  - Power: each new term's sign and the ±25% check; no change without runes (Earth's infinite pierce included); the autopilot's policy;
  - save v7: a v6 save loads with an empty pouch; unknown and repeated ids emptied; trims return parts by the mode.
- **Client:**
  - the components (wave C);
  - the builder's sockets, picker, pull text, Apply total (net Links) and "destroys" note, origins through edits, the Training Grounds' unrestricted picker and `followBasic` keeping runes;
  - the Forge pouch and fusing; the item sheet's sockets; the stop's rune pick;
  - the dev chip (dev only);
  - the HUD pips (ability buttons and ⚔️); the `runeFx` flash.
- **E2E** (`e2e/delve-runes.spec.ts`): a seeded save with a pouch and a weapon with open sockets; socket a rune in the builder and Apply; see the HUD pip in a dive (autopilot on); fuse three on the Forge tab. The other Delve specs pass.

## Docs and version
- **CLAUDE.md:** the Delve section gets a runes paragraph: sockets on moves, the pouch, the knobs and where their handlers live, how to add a rune, the draft's origins and price, the pull rule, the parts rule and the dev toggle, drops and fusing, the stop's fifth kind, save v7. Its text names the runes Drain and Volatile; the code's `drained`, `drainFoes` and `runeFx` `'volatile'` already match (**review 2**: renamed in the contract rather than mapped in the docs).
- **Pricing wording (review 2):** `CLAUDE.md` and the 4a spec (`2026-09-30-delve-weapon-movesets-design.md`, "Changes and their price") say moves are priced by origin, the builder's record of where each card came from, instead of "matched by what they are"; the 4a spec gets a dated note that 4b superseded that rule.
- **Version:** `chore(client): bump version to 0.51.0`.

## Open questions
These don't block the build; each is for the DPS Lab gate or for play.
- **Chain's fall-off.** The decisions say jumps at 60%; the spec uses the shared 0.7. If Chain is weak or strong at the gate, a per-knob fall-off is one more field. **(balance):** the pass cut its jumps instead (tier III +1).
- **(balance) A Nova with Linger on one dummy** stays over the combo ceiling (see the balance pass).
- **Pierce on Lance and bow.** They're out of the fits list because the rune would do nothing there. If the user wants it there, it needs a new meaning (a longer Lance).
- **Rune drop weighting.** Drops are uniform, so a melee hero finds Split and Multi-shot that fit only a Bolt, Volley, Barrage or a bow or wand. Fusing absorbs some of it; weighting toward what the hero carries is a later option.
- **Socket Links.** Salvaged sockets come back as Links, adding to 4a's Link income. Watch the pacing rails.
- **Guard on fast weapons.** A dagger keeps an 8% barrier up all the time at tier V (never a larger one). Fine as a starting point; the gate's pacing will show.
- **Echo on Maelstrom.** A second storm at up to 60% for 6 s is a lot of damage per cast; the gate checks it.

## Decided in the spec (index)
Items marked **(review)** were added or changed after the spec review, and **(review 2)** after the re-review; the coordinator will flag them to the user.

1. Socket price: 1 Link + 20 scrap, then 2 + 40, then 3 + 60.
2. **(review)** Socket drops: common and uncommon 0, magic and rare 0–1, epic 1–2, legendary 2–3 (one below `extraSlots` from rare up, magic level with it).
3. Pay mode's pull price: 15, 30, 50, 80, 120 scrap by tier; the rune goes back to the pouch.
4. **(review)** Fusing: 20, 40, 80, 160 scrap to make tier II, III, IV, V; tier V doesn't fuse. The decisions' "plus scrap" is this cost, confirmed.
5. The draft: socketing free; pulls per the mode; opened sockets cost Links and scrap on Apply; the freebie covers Dust only.
6. **(review)** Move identity by explicit origins from the builder (positional by default; ignored for a skill not in `chains`). With origins, Dust is priced per origin pair (a moved card costs `editDust` even if edited back), and a rune that changes moves is a pull plus a socket.
7. A removed move's sockets come back as one Link each; its runes are pulled.
8. Sockets can't be closed.
9. Kind and element changes keep runes; a kind restriction leaves a rune dormant; a form change is refused while a rune wouldn't fit.
10. The same rune twice on one move is refused at any tier; on different moves it's fine.
11. **(review)** Echo repeats the move as it landed (stage, step bonus, extra shots, split) after 0.4 s at the echo fraction, free, without a beat, cooldown, cast event, Guard or a further echo; a blow's echo re-strikes where the hero stands, and `Echo.stage` replays a hold blow's stage.
12. **(review)** Split sheds shards from every impact that hits, evenly spaced, skipping the foes hit (after a burst, every foe the burst hit); shards spawn with no pierce, carry no splitting knobs, don't scatter, chain, linger, echo, make embers or burst at the end of flight.
13. **(review, review 2)** Multi-shot: `extraShots` is `{ count, power }`; Bolt, Lance and shot blows fan at 0.22 rad with the full cut; Volley and Barrage add to `count`, Volley with half the cut (82.5% → 90%) and Barrage with none; a Lance's beams share one hit set and chain and linger per beam; Twin Fang's shot stays one, without runes.
14. **(review)** `Knobs.pierce` becomes a count (true = Infinity); `Projectile.pierce` stays the spawn flag and `pierceLeft` counts down, so a piercing shot never bursts at the end of flight; Lance and bow are out of Pierce's fits; staff blows fit, dormant on the bursting rows; extra Pierce on an infinite pierce is dormant.
15. **(review)** Drain (was Siphon): 5 foe-hits per cast (hits, not distinct foes), counted per skill and reset before `executeForm`; DoTs and splashes don't count.
16. **(review)** Guard feeds Obsidian's barrier, soaking after the Defensive and before the Ward, and never extends a barrier larger than its own value.
17. **(review)** `quick` is three multipliers: Quick the beat and cooldown, Heavy the beat and wind-up ×1.2; a blow's `cycle = base × beat` and `startup = base cycle × s.startup × windup`, capped at the cycle, in `strike`'s held-blow recompute too; a hold's charge is untouched.
18. **(review)** Volatile (was Catalyst) adds to the Catalyst legendary's factor in `react`, scaling the damage reactions' bonus and Soulfire.
19. Melee versus shot: the per-rune table (Widen reach on melee only; Split, Multi-shot and Pierce on shots only).
20. **(review, review 2)** Fits narrowed where the code does nothing: Linger without Volley, Barrage and Maelstrom (many landings per cast by design; extra zones from a Lance fan or a Multi-shot or Pierce Bolt accepted), Chain without Blink and Armor, Saturate without Armor, every hit rune without Surge.
21. **(review)** Chain's jumps use the shared `chainPower` (0.7) and keep the per-jump `kbFrom`; blow chains get the Storm mastery's +2 by the same rule.
22. **(review)** Linger's zones tick at 20% of the hit; the `zone` merge is the longer seconds and the larger tick power, field by field; a blow's Linger is a hero zone with no ability, ticking as a basic hit.
23. **(review)** The tier tables: exact even steps for fractions (Multi-shot 68.75%, Guard 4.25%), whole counts rounded down, Saturate's IV–V the decisions' own.
24. **(review)** The stop's fifth kind, `'rune'`: offered with an empty socket and a fitting pouch rune; free; refuses a filled or unopened socket; the autopilot takes it second, after equip. The `'move'` stop keeps the saved move's runes.
25. **(review)** Determinism: rune drops on `rng.fork('runes:<nextUid>')`, sockets on `rng.fork('sockets')`, no new `world.rng` draws when no rune is socketed.
26. **(review)** Drops: the door's `dropMult` scales rune chances, magic find doesn't; the rune is uniform; a boss rolls at its depth; walked over like an item (no magnet); none in the sandbox (`dropRune` inside `!world.sandbox`).
27. **(review)** The parts rule follows the pull mode: an open socket that leaves (salvage, fuse, transfer drops and caps, `chooseStartingMana`, load-time trims) always comes back as one Link; its rune is destroyed in destroy mode and returns to the pouch free in pay mode.
28. **(review)** Transfer: 30 scrap per open socket that moves; runes past the target's cap or not fitting its blows leave by the parts rule.
29. **(review)** The HUD pip: one dot per active rune of the next move, by family colour, on the ability buttons and on the ⚔️ manual attack button (the next blow).
30. **(review)** The DPS Lab axis: view `'rune'`, tier III, Fire (Fire + Frost for Volatile and Saturate), every move socketed, each fitting form's default chain and each fitting weapon's basic chain, against a `'none'` row; single runes at most 2.0×.
31. **(review)** Power's constants: 0.5 per extra shot or shard, 0.25 per finitely pierced foe (an infinite pierce adds nothing), 0.2 reaction share, 0.05 per stack; a Volley count term (`count ÷ (count − extraShots.count)`, 1 without the rune).
32. The autopilot: fuse, then open sockets (slots first), then socket by Power gain.
33. `runes` optional on `Move` and `Blow`; the pouch an array of 5 counts per id; `RuneId` a plain string.
34. The dev override lives in localStorage `alloy:delve:unsocket`.
35. **(review)** Load-time trims: unknown and repeated rune ids emptied, sockets past the cap trimmed, parts returned by the parts rule; no repeat-id refine in the schema; done inline in wave 0's `fitMovesets`.
36. **(review)** Names: the mana rune is **Drain** and the reaction-damage rune is **Volatile**, clear of the Siphon reaction and the Catalyst legendary; the knobs keep `manaOnHit` and `catalyst`.
37. **(review)** The combo gate: each form's best three-rune set at tier III at most 3.0× its `none` row.
38. **(review)** Links are netted on Apply: removal refunds pay for sockets opened in the same Apply, the label shows the net, and Links are conserved.
39. **(review)** `world.ts`'s `sameChain` compares the raw sockets (each move's `runes` array as saved).
40. **(review)** The Training Grounds' `followBasic` keeps blow runes by position when it resets to the default chain, minus any that don't fit the new weapon.
41. **(review)** The pouch component is `RunePouchPanel`, clear of the `RunePouch` type.
42. **(review)** Wave 0 also: `NEUTRAL` exported; every new module pre-exported from `src/index.ts`; `rune: false` in `stopKinds`; `runesEarned: 0` in `startDive`; `tests/ability-resolve.test.ts:203` updated; the bow's `HeroWeapon.pierce` mapped to `pierceLeft`; `BagInsertResult` and `salvageItems` gaining `runes` and `destroyed`; no client pierce change needed.
43. **(review, review 2)** D's Power check: the sign of a rune's Lab ratio and its size within ±25% of the single-dummy ratio (Power models one target); Guard, Leech and Drain for sign only.
44. **(review 2)** `RuneTarget`'s blow variant gains `explode?: boolean`, so `runeActive` makes Pierce dormant on bursting rows; the infinite-pierce case is decided in `resolveAbility`, which leaves that Pierce out of `ResolvedAbility.runes`, the list the builder and the HUD both read.
45. **(review 2)** Wave 0 green: `delveStore.test.ts:250` and `delve-movesets.test.ts:427` expect version 7; `forms.ts` passes `pierce: ab.knobs.pierce > 0, pierceLeft: ab.knobs.pierce`; `pierceLeft` optional, defaulting to `p.pierce ? Infinity : 0`, in `spawnProjectile` and `step.ts`.
46. **(review 2)** One price rule: missing origins are the identity map; per-origin pricing retires 4a's "matched by what they are" (× then + now costs 2 × `editDust`); the docs task updates `CLAUDE.md` and the 4a spec.
47. **(review 2)** Multi-shot on Barrage takes no per-shot cut (a loss at tiers I–II otherwise); Volley keeps the half cut; gate expectations stated.
48. **(review 2)** Linger's reason allows the extra zones of a Lance fan and a Multi-shot or Pierce Bolt.
49. **(review 2)** Destroy-mode load-time trims surface as notices (`ParsedDelveProfile.runesLost`), as `fixed` moves do.
50. **(review 2)** The autopilot counts a transfer's destroyed runes (destroy mode) as lost Power.
51. **(review 2)** Accepted: in pay mode a parts return is a free pull (a test toggle).
52. **(review 2)** The combo gate covers each form and each weapon's basic chain, on Fire + Frost when the set holds Volatile or Saturate, else Fire.
53. **(review 2)** Shard impacts are `silent` (no `explode` event).
54. **(review 2)** Internal names follow the runes: `HeroEntity.drained`, `delve.runes.drainFoes`, `runeFx` effect `'volatile'`.
55. **(review 2)** `basicRunes` lives on the HUD snapshot type `ArenaHud` in `useArenaCore.ts`, beside `AbilityHud`.
56. **(review 2)** The "Reused knobs" line: Multi-shot's per-shot power is `extraShots.power`, not `power`.
57. **(balance)** Pack-aware ceilings: one dummy 2.0× a rune and 3.0× a set; the pack 2.5× and 4.0×.
58. **(balance)** The rune view counts an ability's burn and poison only while its own hits keep them up, and averages eight combat seeds; the other views are unchanged.
59. **(balance)** Shape runes add, they don't multiply: past its first foe, a rune-pierced shot only hits (no jumps, zone or shards); an Earth shot's endless pierce is unchanged.
60. **(balance)** Pierce passes 1, 1, 1, 2, 2 foes at 60–70% power; Chain +1, +1, +1, +2, +2; Widen ×1.05–1.25; Multi-shot +1, +1, +1, +2, +2.
61. **(balance)** Drain: at most `drainShare` (half) of the move's mana cost a cast; a blow at most half a blow's mana.
62. **(balance)** Linger: `ZoneKnob.perCast` (3), counted per skill, an Echo's included; one zone a shot from the Pierce rule; elements' and fusions' zones uncapped.
63. **(balance)** The autopilot: slots to three a chain, then sockets only for runes that go in, then the 4th and 5th slots; it fuses only the leftovers.
