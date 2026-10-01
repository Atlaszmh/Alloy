# Delve runes: sockets on moves, 14 runes over shared knobs, tiers and fusing

**Status:** approved design, 2026-09-30. It is stage 4b of the skill roadmap, and it ships as v0.51.0 with save version 7. It builds on stage 4a (weapon movesets and slots, v0.49.0–v0.50.0; `docs/superpowers/specs/2026-09-30-delve-weapon-movesets-design.md`). The user's decisions are settled; this spec grounds them in the code and settles the details they left open. Every such detail is marked **Decided in the spec**, with a one-line reason, and listed again at the end. All numbers are starting points for the DPS Lab gate; nothing has been measured yet.

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
Each rune's numbers are per tier, I → V. Where the decisions gave only the ends, the spec spreads them evenly. **Decided in the spec: the tier tables below.** *Even steps between the user's ends, with counts rounded to whole foes or shots.*

| Family | Rune | Tier I → V | Trade-off | Fits (forms) | Fits (blows) |
|---|---|---|---|---|---|
| Shape | **Split** | shards 2, 2, 3, 3, 4 at 30, 35, 40, 45, 50% power | — | Bolt, Volley, Barrage | bow, wand |
| Shape | **Multi-shot** | +1, +1, +2, +2, +3 shots | each shot 65, 69, 73, 77, 80% power | Bolt, Volley, Lance, Barrage | bow, wand |
| Shape | **Pierce** | passes 1, 2, 3, 4, 5 foes | 90% power | Bolt, Volley | wand |
| Shape | **Chain** | +1, +1, +2, +2, +3 jumps | — | Bolt, Volley, Lance, Burst, Strike, Ward, Nova, Barrage, Maelstrom | all seven |
| Shape | **Widen** | area ×1.2, 1.3, 1.4, 1.5, 1.6 | 90% power | Burst, Nova, Maelstrom, Strike, Ward | dagger, sword, axe, maul |
| Tempo | **Quick** | beat and cooldown ×0.9, 0.85, 0.8, 0.75, 0.7 | 90% power | all twelve | all seven |
| Tempo | **Echo** | repeats after 0.4 s at 30, 37.5, 45, 52.5, 60% | — | Bolt, Volley, Lance, Burst, Strike, Nova, Barrage, Maelstrom | all seven |
| Tempo | **Heavy** | power ×1.15, 1.225, 1.3, 1.375, 1.45, staggers | beat and wind-up ×1.2 | Bolt, Volley, Lance, Burst, Strike, Nova, Barrage, Maelstrom | all seven |
| Elemental | **Saturate** | +1, +1, +1, +2, +2 stacks per direct hit | — | every form but Surge and Armor | all seven |
| Elemental | **Linger** | a zone for 1.5, 2, 2.5, 3, 3.5 s (ticks at 20% of the hit) | — | Bolt, Lance, Burst, Strike, Nova, Barrage | all seven, heavy and hold blows only |
| Elemental | **Catalyst** | reactions it sets off +15, 24, 33, 41, 50% | — | every form but Surge | all seven |
| Sustain | **Leech** | lifesteal 2, 3, 4, 5, 6% | — | every form but Surge | all seven |
| Sustain | **Siphon** | +1, +1.5, +2, +2.5, +3 mana per foe hit, up to 5 foes a cast | — | every form but Surge | all seven |
| Sustain | **Guard** | on landing, a 3 s shield of 3, 4, 5.5, 7, 8% max life | — | all twelve | all seven |

The seven weapons are dagger, sword, axe and maul (melee) and staff, wand and bow (shots). The fits lists follow the decisions' table, narrowed only where the code makes a rune do nothing:
- **Decided in the spec: Pierce leaves out Lance, bow and staff blows.** *A Lance already hits every foe on its line, a bow's shots already pierce every foe (`attack.pierce: true`), and a staff's shots that burst end at their burst (`burstShot` kills the shot); Pierce would do nothing on them.*
- **Decided in the spec: Linger leaves out Volley and Maelstrom.** *Each Volley dart would leave its own zone (five per cast), and a Maelstrom is already a zone; "landing forms" are the ones that land once.*
- **Decided in the spec: Chain leaves out Blink and Armor.** *Neither goes through a path that jumps (Blink's trail and Armor's strike-back call `hitMonster` directly); adding one is a new mechanic.*
- **Decided in the spec: Saturate leaves out Armor; every "any hit" rune leaves out Surge.** *Surge has no hit (`power: 0`), and Armor's strike-back isn't a direct hit, so extra direct-hit stacks would never apply.*
- **"Attack moves"** (Echo, Heavy) are the Primary's and the Ultimate's eight forms. *The Defensive's forms re-buff or teleport the hero; repeating them is not a damage repeat.*

**Decided in the spec: a kind restriction leaves a rune dormant instead of refusing.** Linger acts only on heavy and hold blows (`fits.kinds`). A blow whose kind changes keeps its runes; a rune whose `kinds` no longer include it stays socketed but does nothing until the kind comes back, and the builder shows it dimmed ("works on heavy and hold blows"). *The user's rule is that kind changes keep runes; refusing the kind change would contradict it, and destroying the rune would punish a free toggle.*

### Knobs: the shared behaviour
A rune does nothing on its own: each tier is a set of **knob** values merged into the move with its elements, fusion and legendaries (`mergeKnobs` in `arpg/abilities/resolve.ts`). The sim reads only knobs, so a knob built once works for every rune, element, fusion and legendary that sets it.

**Reused knobs** (no new code in the sim): `power` (every trade-off, Heavy's power, Multi-shot's per-shot power), `area` (Widen), `applies` (Heavy's `stagger`), `chain` (Chain), `zone` (Linger), `lifesteal` (Leech).

**Changed knob: `pierce`.** Today `Knobs.pierce` is a boolean (Earth and one fusion set it). It becomes a count: `pierce: number`, the foes a shot passes, `Infinity` for all. In data it is `true` (all) or a whole number. `mergeKnobs` adds (`true` adds `Infinity`). `Projectile.pierce` becomes the same count, spent one per foe passed: `step.ts`'s `if (!p.pierce) p.dead = true` becomes "dead when `p.pierce <= 0`, else `p.pierce--`", and the end-of-flight burst keeps today's test (`p.pierce === 0`). A weapon's `attack.pierce: true` maps to `Infinity`. *A count is the only way to say "passes 3 foes"; `true` → `Infinity` keeps every existing shot identical.*
- The client reads `p.pierce` as truthy in `fx/draw-world.ts` (fine as a number) and types it `boolean` in `pixel/floor-engine.ts` (`pierce: p.pierce > 0`).

**New knobs**, each with a neutral value (no effect), a merge rule and one place that reads it:

| Knob | Type | Neutral | Merge | Read in |
|---|---|---|---|---|
| `split` | `{ count: number; power: number } \| null` | `null` | the larger `count` wins, with its `power` | `impact.ts` (`impact`), `step.ts` (a basic shot's hit) |
| `extraShots` | `number` | 0 | add | `resolve.ts` (Volley's and Barrage's `count`), `forms.ts` (Bolt, Lance), `basic.ts` (shots) |
| `echo` | `number` (fraction of power) | 0 | max | `cast.ts` (`fire`) and `basic.ts` (`strike`) queue it; `abilities/echo.ts` runs it |
| `quick` | `{ beat: number; cooldown: number; windup: number }` | all 1 | multiply each | `resolve.ts` (cooldown, conjure, channel), `moveBeat` (`cast.ts`'s `fire`, `useInterval`, the builder's readout), `basic.ts` (a blow's cycle and startup) |
| `stacksBonus` | `number` | 0 | add | `resolve.ts` (`ResolvedAbility.stacks`), `basic.ts` (a blow's stacks) |
| `catalyst` | `number` | 0 | add | `HitOpts.catalyst` → `combat.ts`'s `react` |
| `manaOnHit` | `number` | 0 | add | `HitOpts.manaOnHit` → `combat.ts`'s `hitMonster` |
| `guardOnLand` | `number` (fraction of max life) | 0 | add | `defend.ts`'s `guardLand`, called from `cast.ts`'s `fire` and `basic.ts`'s `strike` |

- **Decided in the spec: `quick` is three multipliers, not one fraction.** *Quick shortens the beat and the cooldown, and Heavy lengthens the beat and the wind-up; one knob with three parts carries both without a ninth knob.*
- **Decided in the spec: `echo` is a power fraction, its delay a balance value (`delve.runes.echoDelay`, 0.4 s).** *Every echo waits the same; the rune scales only how hard it lands.*
- **Hit-time knobs ride `HitOpts`.** `hitOpts(ab, …)` in `impact.ts` already copies `lifesteal` into `leech`; it gains `catalyst` and `manaOnHit`. One helper, `knobHitOpts(k: Knobs)`, returns those three, so ability hits, Armor's strike-back and basic blows build them the same way.

### Each rune in the sim
What every rune does on an ability move, a melee blow and a shot blow. A dash means it doesn't fit there.

| Rune | Ability move | Melee blow | Shot blow |
|---|---|---|---|
| Split | each impact that hits a foe sheds shards | — | its hit sheds shards |
| Multi-shot | a fan (Bolt, Lance) or more darts and impacts (Volley, Barrage) | — | a fan of shots |
| Pierce | its shots pass foes | — | passes foes (wand) |
| Chain | jumps from the first foe hit | jumps from the first foe struck | jumps from the foe hit |
| Widen | radius × area | reach × area (arc unchanged) | — |
| Quick | beat × , cooldown × | cycle × | cycle × |
| Echo | the move again | the blow again, where the hero stands | the shot again |
| Heavy | power, stagger, beat and wind-up × 1.2 | power, stagger, cycle and startup × 1.2 | the same |
| Saturate | + stacks on direct hits | + stacks | + stacks |
| Linger | a zone where it lands | a zone ahead (heavy and hold) | a zone at the hit (heavy and hold) |
| Catalyst | its reactions | its reactions | its reactions |
| Leech | lifesteal on its hits | lifesteal | lifesteal |
| Siphon | mana per foe hit | mana per foe hit | mana per foe hit |
| Guard | when it fires | when it connects | when it fires at a foe in range |

**Decided in the spec: the details below.** *Each is the least new code that does what the rune's line says, and each reuses a path the sim already has.*

- **Split.**
  - An ability's: in `impact`, every non-tick impact that hits at least one foe spawns `split.count` shards from the impact point, evenly spaced round a circle starting along the hero → impact direction (no RNG). They skip the foes the impact hit (their `hitIds` start with them), fly at `delve.runes.shardSpeed` (12) for `shardRange` (4), and each lands as one `impact` of radius 0 at `damage × split.power`.
  - A shard's impact is direct (it can crit, applies the move's stacks) but sheds no shards, jumps no chain, leaves no zone, echoes nothing and makes no embers: `ImpactOpts.shard: true`, and the shard's `Projectile.form` is `'shard'`. *Shards of shards would multiply without end, and a zone per shard is noise.*
  - So a Bolt splits where it bursts, each Volley dart where it lands, each Barrage impact that hits.
  - A basic shot's: on its first foe hit (plain or bursting), the same shards as basic projectiles (`ability: null`), carrying the blow's element, its `applies`, and `stacks.tick`.
  - A `runeFx` event (`effect: 'split'`) marks it.
- **Multi-shot.**
  - Bolt and Lance: `1 + extraShots` of them in a fan, at Volley's 0.22 rad steps. Bolts hit on their own (a foe in two bolts' way takes both); a Lance's beams share one hit set, so a foe is struck once per cast. *Beams are instant lines that overlap at the hero; a point-blank foe would take every one.*
  - Volley and Barrage: `extraShots` adds to `ResolvedAbility.count` in `resolveAbility` (Volley's darts by kind, Barrage's impacts).
  - Bow and wand blows: `1 + extraShots` shots in the same fan.
  - **Every shot, the first included, is at the rune's `power`.** *That is what "each −35%" means, and it keeps the knob a plain `power` factor.*
- **Pierce.** The count above: a Bolt or a dart passes that many foes, impacting on each (as Earth's piercing Bolt does today), then dies on the next.
- **Chain.** Abilities: as today (`chainFrom`), the Storm mastery's +2 included. Blows: `chainFrom`'s body becomes `chainJumps(ctx, first, damage, element, jumps, opts, hit)`, which both call. A melee blow jumps from the first foe struck; a shot from the foe it hit.
  - **Decided in the spec: jumps fall off at the shared `abilities.chainPower` (0.7).** *Storm, Stormcaller and the rune then follow one rule; the decisions' "60%" goes to the DPS Lab gate as an open question rather than a second fall-off.*
- **Widen.** Abilities: `area` already scales `radius` (a Strike's reach, a Ward's burst). Melee blows: reach × `area`; the arc stays.
- **Quick and Heavy (`quick`).**
  - Abilities: `cooldown × quick.cooldown` (a charge payment's lockout too); `conjure`, `channel` and `castTime × quick.windup`; the beat through `moveBeat(bal, ab, tempo) = beatFor(bal, ab.slot, playedKind(ab), tempo) × ab.knobs.quick.beat`, which replaces `beatFor` in `fire`, `useInterval` and the builder's readout. A hold's charge time (`holdTime × tempo`) is untouched; its wind-up after release scales.
  - Blows: the swing's cycle × `quick.beat` and its startup × `quick.windup` (at most the cycle).
  - Quick I is `{ beat: 0.9, cooldown: 0.9 }`; Heavy is `{ beat: 1.2, windup: 1.2 }` at every tier.
- **Echo.**
  - An ability's: when `fire` lands a move with `echo > 0`, it queues `{ at: t + echoDelay, slot, ability, aim: the landing point }` on `ArpgWorld.echoes`. `echoTick` (called right after `castTick`) runs it through `executeForm` with a copy of the move whose `power × echo` and whose `echo` and `guardOnLand` are 0. The copy keeps its stage, its index (so its step bonus), its `last` (a Strike still slams), its extra shots and its split.
  - It costs nothing and starts no beat, cooldown or recoil, makes no `cast` event, and leaves the hero's facing as it was (saved and restored round `executeForm`). It fires from where the hero stands toward the landing point; a self-centred form (Nova) goes off round the hero.
  - A hold's echo repeats the stage that fired.
  - A blow's: `strike` queues `{ at, blow: step, dir }`. Its damage half moves into `landBlow(ctx, blow, row, dir, powerMult)`, which `strike` and the echo both call. An echo re-strikes from where the hero stands now, along `dir`. It doesn't move the hero, gain mana, advance the chain, or fire Twin Fang.
  - A `runeFx` event (`effect: 'echo'`) marks it.
  - *A repeat of the move as it landed is the plainest reading of "repeats", and routing it through the same `executeForm` and `landBlow` keeps every other knob working on the echo.*
- **Saturate.** `ResolvedAbility.stacks += stacksBonus`, and a blow's `basicByKind` stacks + `stacksBonus`. Direct hits only: ticks, jumps and splashes keep `stacks.tick`. *"Any hit" is the fit list; the extra stack is on the hit the move aimed.*
- **Linger.**
  - Abilities: `zone` is merged like Rimeheart's, so `leaveZone` already places it where the move lands (the longer zone wins). `tickPower` is 0.2 at every tier.
  - Heavy and hold blows: a hero zone with `ability: null` at the strike (melee: ahead at half the reach, as Strike's; a shot: at the hit), radius 1.2, ticking every 0.5 s for `hit × 0.2`. In `zonesTick`, a hero zone without an ability ticks each foe inside with `hitMonster(…, { source: 'basic', canCrit: false, applies: [BASIC_STATUS[element]] })`. *Today every hero zone has an ability, so `ability: null` needs no new field.*
- **Catalyst.** `react` takes the hit's `opts.catalyst`, and its factor becomes `1 + legendaries.catalyst / 100 + opts.catalyst`. It scales what it scales today: the damage reactions' bonus per pair and Soulfire. The ten effect reactions don't change.
  - **Decided in the spec: it adds to the Catalyst legendary rather than multiplying.** *Both are "+X% reaction damage"; adding keeps one stat line honest.*
  - A `runeFx` event (`effect: 'catalyst'`) marks a damage reaction or Soulfire the rune boosted.
- **Leech.** `lifesteal` is already `HitOpts.leech` for abilities; blows and their shots now pass theirs too.
- **Siphon.**
  - `hitMonster`, for a `basic` or `skill` hit with `manaOnHit`, adds that much mana while the cast's budget lasts. `HeroEntity.siphoned: number[]` holds the foes counted per skill (primary, defensive, ultimate, then basic at index 3, the hit's `slot ?? 3`), and the budget is `delve.runes.siphonFoes` (5). Each foe hit counts once against it: direct hits, ticks, jumps and shards alike; burns, poisons and reaction splashes never.
  - `fire` resets its slot's count, and `strike` resets the basic one.
  - **Decided in the spec: the cap is 5 foe-hits per cast, counted per slot since it last fired.** *A cast has no identity in the sim today (one `ResolvedAbility` serves every cast of a move); a per-slot count reset on each fire is one array, and a lingering Maelstrom from an earlier cast just shares the new cast's budget.*
- **Guard.**
  - On landing it puts up a shield of `guardOnLand × maxHp` for `delve.runes.guardSeconds` (3) through `guardLand(ctx, knobs)` in `defend.ts`. An ability lands when `fire` succeeds (the Defensive included), a melee blow when it connects, a shot when it fires at a foe in range (the same `landed` that grants mana).
  - **Decided in the spec: Guard feeds Obsidian's barrier, `HeroEntity.barrier`.** The larger of the two wins; a smaller one only extends the time, to `max(until, t + 3)`. So it soaks after the Defensive's reductions (Armor, Earth) and before the Ward, where Obsidian's barrier already sits in `shieldHero`. *It reuses the barrier's soak, break event and HUD as they are, and a second shield layer would only add an order question.*
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
  - `effect` and `tradeoff` are templates. `{path}` prints a knob value of the tier, `{path:%}` it × 100 with a %, `{path:±%}` (it − 1) × 100 signed with a %, and `{runes.key}` a `delve.runes` balance value (Siphon's "up to {runes.siphonFoes} foes a cast"). Quick reads "Beat {quick.beat:±%}, cooldown {quick.cooldown:±%}" → "Beat −20%, cooldown −20%". `runeText(registry, ref)` fills them; the client never formats rune numbers itself.
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

  - **Decided in the spec: the table above.** *It sits a step below `extraSlots` (magic 0–1, rare 1–2, epic 2–3, legendary 3–4), so slots stay the main drop reward and "start with zero" holds through uncommon.*
  - The roll runs after the moveset's, from `rng.fork('sockets')` in `generateItem`. Every item stat, every moveset and every later drop come out exactly as today.
- **Parts come back.** Wherever an open socket goes away other than through the builder's Apply (salvage, fuse inputs, a transfer that drops or caps it, a load-time trim), it comes back as **one Link**, and a rune in it goes back to the pouch.
  - **Decided in the spec: one Link per open socket, and nothing but a pull or a removal ever destroys a rune.** *It is 4a's rule for extra slots; auto-salvage and transfers should never silently eat a rune.*
  - `weaponParts(registry, weapon) → { links, runes }` is extra slots plus open sockets, and the socketed runes. `addLootToBag`, `salvageItems` and `fuseGear` use it in place of `extraSlots`; their results gain `runes: RuneRef[]`, for the toast ("2 runes back to your pouch").

### Changing runes: the draft and its price
Socketing, pulling and opening sockets go through the Anvil's draft with every other move edit, and Apply settles them all through `setChains`.

- **Moves need identity.** Dust pricing matches moves by what they are (4a's `movesetEditPrice`), but a rune belongs to one particular move, and two moves can be alike. So `setChains` takes **origins**: `ChainOrigins = Partial<Record<ChainSkill, (number | null)[]>>`, where `origins[skill][j]` is the index in the saved chain that the new move `j` came from, or null for a new move.
  - Without origins for a chain, it is positional: move `j` came from saved move `j`, if any. That covers every caller that edits in place: the stop's `move`, the autopilot, `socketRune`.
  - The builder reports them: `ChainEditor`'s `onChange(skill, chain, map)` gives, for each new move, the index in the chain it was handed (◂▸ moves it, × drops it, + gives null, an edit keeps it). The store composes that with the draft's origins.
  - `setChains` refuses origins that repeat an index or point past the saved chain ("Bad origins").
  - **Decided in the spec: explicit origins.** *Matching by value would let a pull and a socket elsewhere net out as a free move, and would pick the wrong one of two identical moves; the builder already knows exactly where each card came from.*
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
  - **Dust** is `movesetEditPrice` as today, unchanged. `moveKey` ignores runes, so a rune change alone costs no Dust.
  - **Decided in the spec: pay mode costs 15, 30, 50, 80, 120 scrap by tier I–V.** *A tier-III pull (50) is about one socket's scrap; the mode is a test toggle, and the gate will tell.*
  - **The first-dive freebie covers Dust only.** Sockets cost Links and scrap from the start, as slots do.
- **The pouch must hold what is socketed.** For each rune and tier, `socketed − (pay ? pulled : 0) ≤ pouch`. In pay mode a rune pulled in one Apply can be socketed elsewhere in the same Apply (its move costs the pull price); in destroy mode it can't.
- **Refusals** (all or nothing, with 4a's):
  - a socket count above the weapon rarity's cap;
  - fewer sockets on a kept move;
  - a rune that doesn't fit its move's form or weapon ("Split doesn't fit a Burst"). So **changing a move's form is refused while a socketed rune wouldn't fit it**, the user's rule. Element and kind changes keep runes;
  - **the same rune twice on one move, at any tier** ("A move takes one Split"). The same rune on different moves is fine;
  - an unknown rune id;
  - not enough runes in the pouch, Links or scrap.
- **`DraftPrice`.** The builder shows one total, `draftPrice(…) → { dust, links, scrap, refundLinks, destroys, returns }`, from the same functions `setChains` charges with. Apply reads "Apply · ✦ 15 · 🔗 2 · ⚙ 40"; in destroy mode, with anything destroyed, it adds "· destroys Multi-shot III".
- **The pull rule.** `unsocketMode(registry, override?) = override ?? balance.delve.runes.unsocket` (`'destroy'` as shipped). Every op that can pull takes `opts.unsocket`, defaulting to the balance.
  - The client passes the dev override: a chip beside "↺ Restart Delve (dev)" reading "Pull: destroys" / "Pull: pays", dev builds only, kept in localStorage `alloy:delve:unsocket`.
  - **Decided in the spec: the override lives in localStorage.** *It survives reloads while testing, and production builds never read it.*
- **`sameChain`** (`delve/moveset.ts`) compares runes too, so a rune-only change makes the draft dirty, blocks a new dive like any draft, and refreshes the Training Grounds' hero (`world.ts`'s own `sameChain` also compares runes).

### Moving moves between weapons
- **Reordering** carries a move's sockets and runes (the origins).
- **Transfer** (`movesetTransfer`) moves each kept move's sockets with it.
  - **Price:** `movesets.transferScrap` (30) per open socket that moves, on top of the 30 per extra slot. **Decided in the spec: the same 30.** *The user asked for "per open socket, like extra slots".*
  - **What comes back** (one Link per socket, runes to the pouch):
    - sockets past the target rarity's cap, from the end, with their runes;
    - the sockets and runes of moves the transfer drops (past the new slot count, or on a chain the target can't carry);
    - the target's own sockets and runes on the chains it replaces.
  - **Basic blows.** A blow's rune that doesn't fit the target weapon (Split moving from a bow to a sword) goes back to the pouch, and its socket stays open.
  - `MovesetTransfer` gains `sockets` (moved and priced) and `runes` (back to the pouch).
- **Equipping** a weapon as-is brings its own moveset with its runes. The old weapon goes to the bag with its own.
- **`chooseStartingMana`, realign, bind, overtake and re-attune.** Realign maps elements and keeps runes. `chooseStartingMana` rebuilds the weapon at base, its parts coming back by the rule above (in practice a fresh hero has none).

### Tiers, drops and fusing
- **Tier by depth.** `tierDepths: [1, 7, 13, 21, 31]` gives the highest tier whose depth is reached; then `tierUp` (0.2) gives one tier higher, at most V.
- **Drop chances.** `dropChance: { normal: 0.03, elite: 0.15, boss: 1 }`. For normal and elite foes it is × the door's `dropMult` (at most 1). A boss always drops exactly one.
  - **Decided in the spec: the door's drop multiplier scales rune chances; magic find doesn't.** *Doors already promise "more drops"; magic find is about rarity, and runes have none.*
  - **Decided in the spec: which rune is uniform over `runes.json`, and a boss rolls at its depth (not depth + 1, as its items' item level).** *No weighting until play shows which runes feel scarce; one depth rule is simpler.*
- **On the floor.** `rollRuneDrop(registry, { depth, kind, dropMult }, rng)` runs in `killMonster` after `dropLoot`, through `dropRune` in a new `arpg/rune-drops.ts`. It spawns a `Drop` of kind `'rune'` with `rune: RuneRef`.
  - Picked up by walking over it, like an item (no magnet; vacuumed once the floor clears). The bot fetches it as it fetches items (`bot.ts`).
  - Pickup pushes it onto `world.pending.runes`; `bankWorld` adds them to `profile.runes`, `BankResult.runes` lists them, and `DiveState.runesEarned` counts them for the summary.
  - **Decided in the spec: walked over like an item.** *"Bursts onto the floor like loot" in the decisions, and a pickup the player chooses to go for reads as loot, not as a mote.*
- **Fusing.** `fuseRunes(registry, profile, ref)` turns `fuseCount` (3) of `ref` into one of `ref.tier + 1` for `fuseScrap[ref.tier − 1]` scrap. Tier V doesn't fuse. Refused mid-dive (with the forge), short of runes or scrap.
  - **Decided in the spec: 20, 40, 80, 160 scrap to make tier II, III, IV, V.** *Doubling per tier tracks the rune's worth; a III for 40 scrap matches one socket's second step.*
  - Deterministic: fusing rolls nothing.

### Stops: the fifth kind
- `StopKind` gains `'rune'`: socket one pouch rune into an open empty socket of the equipped weapon. It is free.
- **It applies** when some move of the equipped weapon has an empty socket and some pouch rune fits that move and isn't already on it.
- **Taking it:** `StopAction` gains `{ kind: 'rune'; skill; index; socket; rune }`. `takeStop` runs `socketRune` (one `setChains` with positional origins) with the dive lock lifted for it.
- **Order.** `STOP_KINDS` becomes `['equip', 'slot', 'move', 'upgrade', 'rune']`. `rollStop` is unchanged: when `'rune'` doesn't apply, every stop rolls exactly as today.
- **The autopilot** takes a stop by preference: equip, then rune, then upgrade, then slot, then skip.
  - **Decided in the spec: a rune second.** *It is free and always a gain, so it beats a scrap-priced upgrade.*
- **The client.** `STOP_TEXT.rune`: "Socket a rune: one rune from your pouch into an open socket. Free." Its picker, `RunePick`, is the move list with open sockets, then the rune picker.
- `DiveSchema`'s stop `offers` enum gains `'rune'`.

### Power and the autopilot
- **Power** reads the knobs the move resolved with, so most of it comes for free: `power`, `area`, `chain`, `zone` and `count` (Volley's and Barrage's extra shots) are already in `damagePerUse`. The cooldown and wind-up come in through `ResolvedAbility`, and the beat through `moveBeat` in `useInterval`. The new terms in `damagePerUse`, per move, are:
  - extra shots on Bolt and Lance: × `(1 + 0.5 × extraShots)`;
  - split: + `0.5 × count × power` per hit;
  - pierce: + `0.25 × min(pierce, 3)` targets;
  - echo: × `(1 + echo)`;
  - catalyst: × `(1 + 0.2 × catalyst)`;
  - saturate: × `(1 + 0.05 × stacksBonus)`.

  The new terms in `estimateCombat`:
  - siphon: + `manaOnHit × min(targets, 5) / useInterval` to mana income;
  - guard: + `maxHp × guardOnLand × min(1, 3 / interval) × 2` to bonus life, as a Ward's;
  - leech: + its share of the skill's DPS to `sustain`.

  The blows get the same terms (power, area on melee cleave, extra shots, split, echo, quick on the time).
  - **Decided in the spec: the constants 0.5 (an extra shot or shard finds a foe half the time), 0.25 a pierced foe, 0.2 reaction share and 0.05 per stack.** *Power is a heuristic like `TARGETS`; these keep a rune's Power change in line with its DPS Lab ratio, and the gate checks it.*
- **The autopilot's rune policy** (`delve/autopilot.ts`, between dives, after 4a's transfer, fuse, salvage and slots):
  1. **fuse** every triple, lowest tier first, so twos can cascade;
  2. **open sockets** with the Links slots left over: the cheapest first, the Primary's moves first, then Basic, Ultimate and Defensive, each chain from its first move;
  3. **socket** each empty socket, greedily, with the pouch rune that raises `profilePower` most (fitting and not already on the move). It overwrites a socketed rune only when another gains Power, paying per the mode.
  - **Decided in the spec: slots before sockets.** *A slot adds a whole move; the user's order of investment is slots, then their sockets.*
- **`playFloor`** picks up rune drops (`bot.ts`).

### The client
- **The chain builder** (`features/delve/chains/ChainEditor.tsx`, `MoveEditor.tsx`):
  - each move card shows its sockets as pips (`SocketRow`): a rune's glyph and tier, an empty socket, or "+ socket" with its price (🔗 1 · ⚙ 20) while the move is below its cap;
  - tapping an empty socket opens `RunePicker`: the pouch runes that fit this move and aren't on it, each with its effect and trade-off at its tier (`runeText`) and its count;
  - tapping a filled one shows the rune with **Pull** ("destroys it", or "⚙ 50, back to your pouch");
  - a dormant rune shows dimmed with its reason;
  - the move's readout names the beat with `moveBeat`.

  All of it edits the draft. Apply shows the `DraftPrice` total and what it destroys.
- **The Forge tab** (`ForgePanel.tsx`) gains a Runes section, `RunePouch`: every rune held, by tier, with **Fuse 3 → 1** and its scrap price where three are held. Locked mid-dive like the rest of the forge.
- **The item sheet** (`ItemDetailSheet.tsx`): a weapon's moveset lists each move's sockets and runes, read-only (`SocketRow` locked). A transfer's price line adds its sockets; its notes list the runes that come back.
- **The header** shows nothing new; the pouch lives on the Forge tab. The dive summary and pickup feed name runes found ("Split III").
- **The arena:**
  - extra shots, shards, echoes, zones and the Guard shield come out as projectiles, `explode`, zones and the barrier, which already render;
  - a new `runeFx` event draws the rune's glyph as a brief mana-pixel flash at its point (`arena/fx/runes.ts`, like `fx/reactions.ts`);
  - a rune on the floor draws as its glyph in its family's colour (`ArenaRenderer`'s drop sprites), with a pickup sound.
- **The HUD pip.** `AbilityHud` gains `runes: RuneRef[]`, the active runes of the move the next press casts (`pressMove`). `ArenaHud`'s `AbilityButton` shows one small dot per rune in its family's colour along the button's top edge; none when it holds none. The basic attack has no button, so no pip.
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
- Shards are evenly spaced, echoes replay the landed move, Guard and Siphon roll nothing: no new `world.rng` draws. A hero without runes plays exactly as today, so the DPS Lab's grid comes out identical.

## Save version 7
- **Schemas** (`delve/profile-schema.ts`):
  - `RuneRefSchema = { id: string, tier: 1–5 }`;
  - `MoveSchema` and `BlowSchema` gain `runes: z.array(RuneRefSchema.nullable()).max(MAX_SOCKETS).optional()`, refined so no rune id repeats on a move. The shared `GearItemSchema` takes them, so v3–v6 saves still parse;
  - `RunePouchSchema = z.record(z.string(), z.array(z.number().int().min(0)).length(5))`;
  - the current schema freezes as `DelveProfileV6Schema`, and `DelveProfileSchema` is `DelveProfileV6Schema.extend({ version: z.literal(7), runes: RunePouchSchema })`;
  - the dive's `runesEarned` defaults to 0, and the stop's `offers` enum gains `'rune'`.
- **v6 → v7:** `{ ...v6, version: 7, runes: {} }`. Older saves migrate through v6 as today.
- **At load** (`fitMovesets`, which has the registry): a socket holding an unknown rune id is emptied, sockets past the rarity's cap are trimmed (their runes to the pouch, the sockets as Links), and pouch entries for unknown ids are dropped.
  - **Decided in the spec: no careful migration, but nothing is lost silently once runes exist.** *The user waived migration for v6 saves (they hold none); a renamed rune in later data shouldn't brick a save.*
- `createDelveProfile` writes version 7 with `runes: {}`. The store's key stays `alloy:delve:v2`.

## Where the code changes

| Area | Files | What |
|---|---|---|
| Types | `engine/src/types/rune.ts` (new), `types/ability.ts`, `types/arpg.ts`, `types/delve.ts`, `types/gear.ts` (unchanged: runes ride `Moveset`'s chains) | the contract below |
| Data | `engine/src/data/runes.json` (new), `data/schemas.ts`, `data/loader.ts`, `data/registry.ts`, `data/balance.json` | the 14 rows, `RuneDefSchema`, `KnobsSchema`'s new fields, `delve.runes`, `ArpgData.runes`, `getRunes` / `getRune` / `findRune` |
| Rune helpers | `engine/src/loot/runes.ts` (new) | `runeFits`, `runeActive`, `runeKnobs`, `runeText`, `socketCap`, `socketPrice`, `rollSockets`, `runeTierAt`, `rollRuneDrop`, `weaponParts`, pouch helpers |
| Resolve | `arpg/abilities/resolve.ts`, `delve/hero-stats.ts` | `NEUTRAL`, `mergeKnobs`, runes merged into `resolveAbility` and the blows (`HeroBlow.knobs`), `count`, `stacks`, `quick`, `moveBeat` |
| Sim | `arpg/abilities/impact.ts`, `forms.ts`, `cast.ts`, `defend.ts`, `echo.ts` (new), `arpg/basic.ts`, `arpg/step.ts`, `arpg/combat.ts`, `arpg/world.ts`, `arpg/abilities/targeting.ts` | split, extra shots, pierce count, blow chain and zones, echo queue, Guard, Siphon, Catalyst, `knobHitOpts`, `world.ts`'s `sameChain` |
| Drops | `arpg/rune-drops.ts` (new), `combat.ts` (one call), `step.ts` (pickup case), `delve/dive.ts` (`bankWorld`), `loot/item-generator.ts` (socket roll) | rune drops and banking |
| Economy | `delve/runes.ts` (new), `delve/moveset.ts`, `loot/moveset.ts`, `delve/profile.ts`, `delve/profile-schema.ts`, `delve/stops.ts`, `delve/pair.ts` | `setChains` options, `runeChange`, `draftPrice`, `openSocket`, `socketRune`, `fuseRunes`, transfer, salvage and fuse parts, save v7, the stop's fifth kind |
| Power, bot | `delve/hero-stats.ts`, `delve/autopilot.ts`, `arpg/bot.ts`, `arpg/dps-sim.ts` | the Power terms, the rune policy, rune pickups, the Lab's rune view |
| Client (presentational) | `client/src/features/delve/runes/` (new): `RuneGlyph.tsx`, `SocketRow.tsx`, `RunePicker.tsx`, `RunePouch.tsx`, `rune-style.ts` | the pieces, from contract types only |
| Client (wiring) | `stores/delveStore.ts`, `stores/sandboxStore.ts`, `features/delve/chains/ChainEditor.tsx`, `MoveEditor.tsx`, `chain-text.ts`, `AbilitiesPanel.tsx`, `ForgePanel.tsx`, `ItemDetailSheet.tsx`, `StopPanel.tsx`, `DiveSummary.tsx`, `LootTray.tsx` / `PickupFeed.tsx`, `pages/DelveCamp.tsx`, `pages/DelveTraining.tsx`, `features/delve/lab/` | the draft's origins and price, the pouch, fusing, sheets, stops, the dev chip, Training, the Lab view |
| Client (arena) | `features/delve/arena/fx/runes.ts` (new), `ArenaRenderer.ts`, `arena-sounds.ts`, `useArenaCore.ts`, `ArenaHud.tsx`, `pixel/floor-engine.ts` | `runeFx` flashes, rune drops, HUD pips, the pierce type |
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
export type RuneTarget = { form: FormId } | { weapon: string | null; kind: MoveKind };
```

**Types** (`types/ability.ts`):

```ts
export interface Move { kind: MoveKind; form: FormId; elements: ManaType[]; runes?: (RuneRef | null)[]; }
export interface Blow { kind: MoveKind; element: ManaType; runes?: (RuneRef | null)[]; }

export interface QuickKnob { beat: number; cooldown: number; windup: number; }
export interface SplitKnob { count: number; power: number; }

export interface Knobs {
  // …today's fields, with:
  /** Foes a shot passes (Infinity: all). */
  pierce: number;
  split: SplitKnob | null;
  extraShots: number;
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

`ElementTraitDef.knobs` and `FusionDef.knobs` become `KnobsData`. `mergeKnobs(...parts: KnobsData[])` gets the new fields' merge rules (the knob table), and `NEUTRAL` their neutral values. `resolveAbility` sets `runes: []`.

**Types** (`types/arpg.ts`, `types/delve.ts`):

```ts
export type DropKind = 'item' | 'mote' | 'orb' | 'scrap' | 'rune';
// Drop: rune?: RuneRef
// Projectile: pierce: number; form: FormId | 'ember' | 'shard' | null; knobs?: Knobs  // a basic shot's blow knobs
// Zone: unchanged (a hero zone with ability null is a blow's Linger)
// WorldPending: runes: RuneRef[]
// ArpgWorld: runeRng: SeededRNG; echoes: Echo[]
export interface Echo {
  at: number;
  /** An ability's: its slot, the move as it landed, and its landing point. */
  slot: number | null;
  ability: ResolvedAbility | null;
  aim: Vec | null;
  /** A blow's: its step in the basic chain and its way. */
  blow: number | null;
  dir: Vec | null;
}
// HeroEntity: siphoned: number[]  // foes counted per skill since it last fired: primary, defensive, ultimate, basic
// ArpgEvent: | { kind: 'runeFx'; effect: 'split' | 'echo' | 'catalyst'; x: number; y: number; element: ManaType | null }
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
```

World and hero setup (`world.ts`) initialises `runeRng`, `echoes: []`, `pending.runes: []` and `siphoned: [0, 0, 0, 0]`; `computeHeroStats` gives each blow `knobs: NEUTRAL` and `runes: []`. Projectile spawns pass `pierce: 0` or `Infinity` where they passed `false` or `true` (the step.ts check reads `p.pierce > 0`), which keeps every shot identical.

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
  "siphonFoes": 5,
  "shardSpeed": 12,
  "shardRange": 4
}
```

The schema refines `socketCap` values ≤ `MAX_SOCKETS`, `socketLinks` and `socketScrap` of length `MAX_SOCKETS`, `pullScrap` of length 5, and `fuseScrap` of length 4.

**Save v7:** the schemas and the v6 → v7 step above, `createDelveProfile` at version 7, and `fitMovesets`' load-time checks (unknown ids, caps).

**Pure helpers** (`src/loot/runes.ts`), which every later wave reads:

```ts
export function runeFits(def: RuneDef, on: RuneTarget): boolean;          // forms / weapons only
export function runeActive(def: RuneDef, on: RuneTarget): boolean;        // fits, and the blow's kind
export function runeKnobs(
  registry: DataRegistry,
  runes: readonly (RuneRef | null)[] | undefined,
  on: RuneTarget,
): { knobs: KnobsData[]; active: RuneRef[] };                             // unknown ids and dormant runes skipped
export function runeText(registry: DataRegistry, ref: RuneRef): { effect: string; tradeoff: string | null };
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
  refundLinks: number;    // sockets of removed moves
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

// delve/moveset.ts (B): today's signature plus options
export function setChains(
  registry: DataRegistry, profile: DelveProfile, chains: Partial<Chains>, opts?: SetChainsOptions,
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
- **A: the sim.** Fills `runeKnobs` into `resolveAbility` (merged after the legendaries; `count += extraShots` for Volley and Barrage; `stacks += stacksBonus`; `quick` into cooldown, conjure, channel and castTime; `runes: active`) and into the blows in `computeHeroStats` (`knobs`, `runes`). Then every handler in "Each rune in the sim": `impact.ts`, `forms.ts`, `cast.ts`, `defend.ts`, `echo.ts`, `basic.ts` (`landBlow`, blow chain, Linger, shots' `knobs`), `step.ts` (pierce count, shards, a basic shot's knobs, `echoTick`, blow zones), `combat.ts` (`knobHitOpts`, Catalyst in `react`, Siphon), `targeting.ts` (`spawnProjectile` takes optional `hitIds`), and `world.ts`'s `sameChain` with runes.
  - **Files it owns:** those, plus `tests/delve-rune-sim.test.ts`.
  - **Tests alone:** builds heroes with hand-made chains carrying runes (`createHeroEntity` with a resolved chain, as `tests/fixtures/arena.ts` does) and steps the sandbox world. One test per rune per target it fits (ability, melee, shot), plus: neutral knobs change nothing (a fixed-seed run's events identical with and without empty sockets); shards don't split; an echo doesn't echo; a Guard and an Obsidian barrier merge; Siphon's cap; a dormant Linger.
- **B: the economy.** `loot/runes.ts`'s rolls and parts, `delve/runes.ts`, `setChains`'s options (`runeChange` charged with the Dust, its refusals), `sameChain` with runes, `movesetTransfer`'s sockets and runes, `addLootToBag` / `salvageItems` / `fuseGear` with `weaponParts`, the socket roll in `generateItem`, `world.runeRng` drops (`arpg/rune-drops.ts` and its one call at the end of `killMonster`), the `'rune'` pickup case in `step.ts`'s pickups, `bankWorld`, the stop's fifth kind, `fitMovesets`' trims returning parts.
  - **Files it owns:** those, plus `tests/delve-runes.test.ts`.
  - **Merge points with A:** `combat.ts` (B adds one line in `killMonster`; A edits `hitMonster` and `react`), `step.ts` (B's pickup case; A's projectile and zone ticks), and `delve/moveset.ts`'s `sameChain` (B owns it). Both rebase on wave 0 and touch disjoint functions.
  - **Tests alone:** every price and refusal in "Changing runes", both modes, origins (reorder carries runes, removal refunds, a bad origin refused), transfer, salvage and fuse parts, fusing, drop chances and tiers (a seeded sweep), item determinism (every v0.50.0 item stat and moveset identical, sockets aside), the stop's kind and its `rollStop` identity when it doesn't apply, save v7 load and trims.
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
  export interface RunePouchProps {
    pouch: RunePouch;
    fuseCount: number;
    fusePrice: (ref: RuneRef) => number | null;
    scrap: number;
    locked: boolean;
    onFuse: (ref: RuneRef) => void;
  }
  // rune-style.ts: FAMILY_STYLE: Record<RuneFamily, { color: string; label: string }>
  ```

  Pad navigable (`data-pad-scope` on the picker, `data-pad-back` on its close). Its tests render each with fixture runes from the default registry.

### Wave 2 (3 agents)
- **D: Power, the autopilot, the DPS Lab.** The Power terms (`damagePerUse`, `estimateCombat`, the blows), the autopilot's rune policy and stop preference, `bot.ts`'s rune pickups, and the Lab's rune view: `dpsCombos` adds `view: 'rune'` rows.
  - For each rune, each form it fits among the Primary's and Ultimate's: the form's default chain in Fire, paid with mana, every move with one socket holding the rune at tier III, `dims: { rune, on: form, tier: 'III' }`.
  - For each weapon it fits: the weapon's default basic chain in Fire with every blow socketed, `dims: { rune, on: weapon, tier: 'III' }`.
  - A `rune: 'none'` row per form and weapon as the baseline.
  - The Lab page (`features/delve/lab/`) gets the third view with a "× none" ratio column.
  - **Decided in the spec: Fire only, tier III, every move socketed.** *The gate is about the rune, not the element; one element keeps the axis to about 185 rows.*
  - **Tests alone:** after A, a rune's Power change has the sign and rough size of its Lab ratio; the autopilot fuses, opens and sockets (a seeded profile); `dpsCombos`' old rows are unchanged and `dpsKey`s stay unique.
- **E: client wiring.** `delveStore` (`chainDraft.origins`, `draftChanges` with runes, `draftPrice` for the Apply label, `applyDraft` passing origins and `unsocketMode`, `fuseRunes`, the dev override, rune toasts from `runes` and `destroyed`), `ChainEditor` / `MoveEditor` (`onChange(skill, chain, map)`, `SocketRow` on each card, `RunePicker`, a `runes?: ChainRunes` prop), `ForgePanel` (`RunePouch`), `ItemDetailSheet`, `StopPanel`'s `RunePick`, `DiveSummary` / `PickupFeed`, the dev chip in `DelveCamp`, and the Training Grounds (`sandboxStore` schemas with `runes`, unrestricted sockets, Load my build).

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

  - **Tests alone:** store tests (origins composed through reorder, remove and add; Apply all or nothing; dev override), component tests for the builder's sockets and the Forge pouch.
- **F: the arena.** `fx/runes.ts` flashes for `runeFx`, rune drops in `ArenaRenderer` and `arena-sounds.ts`, `AbilityHud.runes` in `useArenaCore.ts`, the pips in `ArenaHud.tsx`, and `floor-engine.ts`'s pierce type.
  - **Tests alone:** fx tests with synthetic `runeFx` and `drop` events, and an `ArenaHud` test with a snapshot holding runes.

### Wave 3 (gate and finish)
The DPS Lab gate and the pacing rails (below), the E2E spec, `CLAUDE.md`, and v0.51.0. If a ceiling breaks, stop and report the numbers to the user before tuning.

## Balance and gates
- **Before anything changes,** capture v0.50.0's `runAutopilot` numbers and the DPS Lab grid.
- **The DPS Lab's existing grid must come out identical**, row for row: a hero with no runes plays exactly as before.
- **The rune view's ceiling:** no rune more than doubles a move's damage at tier III. Each rune row's DPS ÷ its `none` row must be at most 2.0, both on one dummy and on the pack. The ratios go in the release notes; a breach stops the build for the user's call.
- **Pacing:** every rail in `tests/delve-pacing.test.ts` must hold, with the autopilot using runes. Runes add Links (socket drops salvaged) and power, so dives may go deeper; if a rail breaks, report the numbers. The fix is the user's call: drop chances, socket prices, tier numbers, or a changed rail.

## Testing
- **Engine:**
  - data: every rune row valid, fits ids real, templates filled, all 14 present;
  - knobs: `mergeKnobs`' rule for each new knob; `pierce` true → Infinity; neutral knobs leave a fixed-seed fight identical;
  - each rune on each target it fits (ability, melee blow, shot blow); dormant Linger; shards don't split, chain, linger or echo; echo doesn't echo and starts no beat; Guard and Obsidian share the barrier; Siphon's cap and reset; Catalyst adds to the legendary;
  - `moveBeat` with Quick and Heavy; a blow's cycle and startup;
  - sockets: price by index, the rarity cap, can't close, drops by rarity, determinism of items;
  - the draft: origins (reorder, remove, add), socket free, pull in both modes, removal refunds and pulls, the same rune twice refused, a form change refused for a non-fitting rune, a kind or element change keeping runes, pouch accounting in both modes, all or nothing;
  - transfer (sockets moved and priced, the target's cap, dropped moves' parts, blow runes that don't fit), salvage and fuse parts;
  - fusing (price, tier V, short);
  - drops: chances by kind and door, tier by depth and tierUp, the rune stream leaving item drops unchanged, banking and `runesEarned`;
  - the stop's fifth kind: when it applies, taking it, `rollStop` unchanged without it;
  - Power: each new term's sign; the autopilot's policy;
  - save v7: a v6 save loads with an empty pouch; unknown ids emptied; trims return parts.
- **Client:**
  - the components (wave C);
  - the builder's sockets, picker, pull text, Apply total and "destroys" note, origins through edits, the Training Grounds' unrestricted picker;
  - the Forge pouch and fusing; the item sheet's sockets; the stop's rune pick;
  - the dev chip (dev only);
  - the HUD pips; the `runeFx` flash.
- **E2E** (`e2e/delve-runes.spec.ts`): a seeded save with a pouch and a weapon with open sockets; socket a rune in the builder and Apply; see the HUD pip in a dive (autopilot on); fuse three on the Forge tab. The other Delve specs pass.

## Docs and version
- **CLAUDE.md:** the Delve section gets a runes paragraph: sockets on moves, the pouch, the knobs and where their handlers live, how to add a rune, the draft's origins and price, the pull rule and its dev toggle, drops and fusing, the stop's fifth kind, save v7.
- **Version:** `chore(client): bump version to 0.51.0`.

## Open questions
These don't block the build; each is for the DPS Lab gate or for play.
- **Chain's fall-off.** The decisions say jumps at 60%; the spec uses the shared 0.7. If Chain is weak or strong at the gate, a per-knob fall-off is one more field.
- **Pierce on Lance, bow and staff.** They're out of the fits list because the rune would do nothing there. If the user wants it there, it needs a new meaning (a longer Lance, staff shots that burst and fly on).
- **Rune drop weighting.** Drops are uniform, so a melee hero finds Split and Multi-shot that fit only a Bolt, Volley, Barrage or a bow or wand. Fusing absorbs some of it; weighting toward what the hero carries is a later option.
- **Socket Links.** Salvaged sockets come back as Links, adding to 4a's Link income. Watch the pacing rails.
- **Guard on fast weapons.** A dagger keeps an 8% barrier up all the time at tier V. Fine as a starting point; the gate's pacing will show.
- **Echo on Maelstrom.** A second storm at up to 60% for 6 s is a lot of damage per cast; the gate checks it.

## Decided in the spec (index)
1. Socket price: 1 Link + 20 scrap, then 2 + 40, then 3 + 60.
2. Socket drops: common and uncommon 0, magic and rare 0–1, epic 1–2, legendary 2–3.
3. Pay mode's pull price: 15, 30, 50, 80, 120 scrap by tier; the rune goes back to the pouch.
4. Fusing: 20, 40, 80, 160 scrap to make tier II, III, IV, V; tier V doesn't fuse.
5. The draft: socketing free; pulls per the mode; opened sockets cost Links and scrap on Apply; Dust unchanged; the freebie covers Dust only.
6. Move identity by explicit origins from the builder (positional by default).
7. A removed move's sockets come back as one Link each; its runes are pulled.
8. Sockets can't be closed.
9. Kind and element changes keep runes; a kind restriction leaves a rune dormant; a form change is refused while a rune wouldn't fit.
10. The same rune twice on one move is refused at any tier; on different moves it's fine.
11. Echo repeats the move as it landed (stage, step bonus, extra shots, split) after 0.4 s at the echo fraction, free, without a beat, cooldown, cast event, Guard or a further echo; a blow's echo re-strikes where the hero stands.
12. Split sheds shards from every impact that hits, evenly spaced, skipping the foes hit; shards don't split, chain, linger, echo or make embers.
13. Extra shots fan at 0.22 rad; every shot, the first included, at the rune's power; Volley and Barrage add to `count`; a Lance's beams share one hit set.
14. `pierce` becomes a count (true = Infinity); Lance, bow and staff blows are out of Pierce's fits.
15. Siphon: 5 foe-hits per cast, counted per skill since it last fired; DoTs and splashes don't count.
16. Guard feeds Obsidian's barrier: the larger wins, a smaller extends; it soaks after the Defensive, before the Ward.
17. `quick` is three multipliers: Quick the beat and cooldown, Heavy the beat and wind-up ×1.2; blows scale cycle and startup; a hold's charge is untouched.
18. Catalyst adds to the legendary's factor in `react`, scaling the damage reactions' bonus and Soulfire.
19. Melee versus shot: the per-rune table above (Widen reach on melee only; Split, Multi-shot and Pierce on shots only).
20. Fits narrowed where the code does nothing: Linger without Volley and Maelstrom, Chain without Blink and Armor, Saturate without Armor, every hit rune without Surge.
21. Chain's jumps use the shared `chainPower` (0.7).
22. Linger's zones tick at 20% of the hit; a blow's Linger is a hero zone with no ability, ticking as a basic hit.
23. The tier tables: even steps between the decisions' ends.
24. The stop's fifth kind, `'rune'`: offered with an empty socket and a fitting pouch rune; free; the autopilot takes it second, after equip.
25. Determinism: rune drops on `rng.fork('runes:<nextUid>')`, sockets on `rng.fork('sockets')`, no new `world.rng` draws.
26. Drops: the door's `dropMult` scales rune chances, magic find doesn't; the rune is uniform; a boss rolls at its depth; picked up by walking over it, like an item.
27. Parts come back: one Link per open socket and every rune to the pouch on salvage, fuse, transfer drops and trims.
28. Transfer: 30 scrap per open socket that moves; runes past the target's cap or not fitting its blows go to the pouch.
29. The HUD pip: one dot per active rune of the next move, by family colour.
30. The DPS Lab axis: view `'rune'`, tier III, Fire, every move socketed, each fitting form's default chain and each fitting weapon's basic chain, against a `'none'` row.
31. Power's constants: 0.5 per extra shot or shard, 0.25 per pierced foe, 0.2 reaction share, 0.05 per stack.
32. The autopilot: fuse, then open sockets (slots first), then socket by Power gain.
33. `runes` optional on `Move` and `Blow`; the pouch an array of 5 counts per id; `RuneId` a plain string.
34. The dev override lives in localStorage `alloy:delve:unsocket`.
35. Load-time trims: unknown rune ids emptied, sockets past the cap trimmed with their parts returned.
