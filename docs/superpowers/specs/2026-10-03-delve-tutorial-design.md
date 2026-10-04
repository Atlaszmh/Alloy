# Delve: the guided start (tutorial), carries and later legendaries

Date: 2026-10-03 · Target: v0.62.0, save v11 (older saves reset; no migrations)

## Goal

A new player can choose a **guided start**: the save's real first two dives run on hand-built floors with gated steps, and Hesta, the Anvil-keeper, walks them through the basics of combat, the loop and crafting, with two Anvil lessons between and after. It is optional and skippable at any point; what the player finds and makes is theirs to keep.

Three game-wide changes ride with it, decided while shaping the tutorial:

1. **Carries:** commons carry only the Basic; uncommon and magic add the Primary; rare adds the Defensive and can be **awakened** (a crafting op) to carry the Ultimate; epic and legendary carry all four. Unarmed carries only the Basic. A new save's common sword carries only the Basic.
2. **Legendaries are mid to late game:** no guaranteed first-boss essence; no essence from any source below `drops.essenceMinDepth` (20).
3. **Quests unlock on completion:** a quest unlocks when the one it follows is complete, claimed or not, so progress flows through a dive.

## Decisions (from the brainstorm)

| Question | Decision |
|---|---|
| How strict are the rails | Hand-built floors, gated steps |
| How dive 2 ends | Foreman Grask (the first boss), then a final Anvil lesson |
| Opting in and out | A new save asks Guided start / Jump in; "Skip tutorial" any time drops the rails and leaves an ordinary save |
| How it talks | Hesta's portrait and a line, an objective line with the input in hand, a glowing highlight; reading beats pause the fight |
| Elements | The player picks the primary as usual; the script adapts (every set drop, reward and line follows the player's pair); at the bind Hesta suggests a partner, the player picks |
| Dying in the tutorial | The depth restarts as it was entered, nothing lost, with Hesta's advice |
| Legendaries | Moved to mid/late game everywhere; not in the tutorial |
| Grask's reward | A set **rare** weapon: the finale is Transfer + Temper; the Ultimate is learned later (Awaken, or an epic) |
| Carries | Common Basic; uncommon and magic + Primary (magic loses today's Defensive, by the user's choice); rare + Defensive, awakenable to + Ultimate; epic and legendary all four |
| Approach | An engine-run data script (`tutorial.json`, floors included), gates and set drops in the engine, the client draws Hesta, objectives and highlights; the bot plays it for tests |

## 1. The player's path

**Choosing.** On a fresh save the Anvil (reached from the title screen's Delve) first shows a kit dialog, **Guided start** (recommended for new players) or **Jump in**, then the mana choice as today. Guided start runs `startTutorial(registry, profile)`. **Skip tutorial** sits in the system menu, the pause and the retry screen (behind a confirm).

**Dive 1: three hand-built Cinder Mines depths.** The hero starts with the common sword: the Basic only.

- **Depth 1.** Walk to a marker (moving). Rats fall to the automatic attack; mana fills (basics feed mana). Materials burst and fly in. A set drop: an **uncommon weapon in the primary**, its Primary chain at **2 slots** (two moves), walked over. The exit gate opens when the floor's steps are done.
- **Stop 1.** The only power-up is **Equip** (the bag holds only that weapon); the doors stay disabled until it is taken. One door (Winding Path). "Better weapons carry more skills."
- **Depth 2.** Cast the Primary (Q); press again for the chain's second move; hold Q to aim at a slinger off to the side. A brute (`script: 'slamOnly'`) and its telegraphed slam: **dodge**, then a **perfect dodge** ("Skip this step" after `skipAfter` misses). Fog of war and the minimap; a **vault chest**; a **shrine** (a blessing). Set drops: a shard the cuirass allows, Mana Dust. Exit.
- **Stop 2.** **Adjust a move** (paid with the set Mana Dust); one door.
- **Depth 3.** An **elite den** seals behind you; its elites are tuned to hurt; Hesta prompts the **potion** (F) (the step completes on a drink, or at the den's clear if life never fell). Set drops: a **rune that fits the Primary's first move**, **Links**, scrap. Exit.
- **Stop 3.** No power-up; the only road is **Extract**. Hesta explains banking and the risk line (dying loses the floor's haul and a share of what the dive banked).

**Anvil lesson 1** (each step highlighted; the next opens when it's done; Delve stays disabled until the lesson ends or is skipped):

1. Claim what completed (First Steps, Bring It Home).
2. **Forge** a cuirass: the pattern, a Rusty bar, uncommon flux and the shard from depth 2; **equip** it, reading ▲.
3. **Bind a second element** (the Mana view). Hesta names her suggestion for the primary (`partners`); the player picks any.
4. **Skills:** add a slot to the Primary (1 Link + 20 scrap), set the new move's elements to the secondary (15 Mana Dust), open the first move's first socket (1 Link + 20 scrap) and socket the rune, **Apply**.
5. **Salvage** the old common sword; **refine** three Rusty bars into an Iron bar (10 scrap).
6. Claim what completed (Strike the Anvil, A Second Flame; a claim step with nothing to claim completes at once). Then Delve.

**Dive 2: hand-built depths 1–5.** Every stop is named by the data; no door skips a depth.

- **Depths 1–2.** Elements stack on foes (the pips under them, explained) and the pair's reaction fires. Depth 2's exit opens at five reactions (Spark and Counterspark), with "Skip this step" after `skipAfter` seconds.
- **Stop (after depth 1).** One power-up of the data's choosing; one door.
- **Stop (after depth 2).** One power-up of the data's choosing; one door.
- **Depth 3.** An **anvil alcove**: its offers named by the data (one affordable kind).
- **Stop.** A choice of **two doors**, neither skipping a depth.
- **Depth 4.** A short floor (an elite or two) to reach the boss.
- **Depth 5.** **Foreman Grask** in a hand-built boss room. A set drop: a **rare weapon in the primary** (carries the Defensive). No essence.
- **Stop after Grask.** No power-up (so the rare stays in the bag for the Transfer); Extract only.

**Anvil lesson 2.**

1. Compare Grask's weapon as it is and as a home for your moveset (◇); **Transfer** your moveset onto it (about 90 scrap: the Primary's two extra slots and its open socket at `transferScrap` each).
2. **Hone** a line on the Temper bench.
3. Claim what completed (Spark and Counterspark; the Cinder Warden now asks for a rare forge, so it stays open); the Quests tab's **Contract board** is introduced (an acknowledged beat).
4. The **Training Grounds** (they open with "Load my build" applied): raise your Defensive (E) once on the dummies.
5. Hesta's farewell (mentions Awaken and the Ultimate for later). The tutorial is done; the save is ordinary from here.

**Dying** on any tutorial depth: "Hesta pulls you back" with a line of advice, **Retry** and Skip, instead of the dive summary; the depth restarts from its entry snapshot. Abandon and "Anvil · floor restarts" act as a retry while the tutorial runs. Real death rules are taught by Hesta's line at stop 3 and the risk line.

## 2. The engine

**State.** `DelveProfile.tutorial: { step: string; count: number; misses: number } | null` (null: off, done or skipped). `startTutorial` sets the first step; `skipTutorial(profile)` clears it; the last step's completion clears it. Each step names its floor (dive and depth), so the floor follows the step, never the dive count.

**The script: `src/data/tutorial.json`** (`TutorialDataSchema`, `registry.getTutorialData()`; the floors live here too):

- `steps[]`: `{ id, where: 'floor' | 'stop' | 'anvil' | 'training', floor?, line, objective, highlight?, beat?: boolean, trigger: { type, filter?, count }, gate?: { door?: number; exit?: true }, skipAfter?: number, marker?: string, stop?: { kinds, doors, extract } , alcove?: { kinds } }`.
- `partners`: the suggested secondary per primary.
- `floors`: the hand-built floors (below).
- Templates fill `{primary}`, `{secondary}`, `{partner}`, `{primarySkill}` (the Primary's next move's name), `{reaction}` (the pair's) and `{input:<action>}` (drawn by the client as the binding's glyph). Only `tutorialText(registry, profile, step)` fills them, as `runeText` does.
- A load-time check (as `quests-check.ts` does): every step's floor, marker, door, stop kinds, trigger type and highlight name exists; the steps form one sequence; dive 1's set drops use only the primary element.

**Completion reads what holds, not only what just happened.** A step completes when its condition holds, checked when it becomes current and after every event, so nothing done early is lost:

- **Floor steps** read the floor's tallies: the world counts every tutorial event from the floor's start (`ArpgWorld.tutorial.tally`, keyed by type and filter: kills, casts, pickups by kind, interacts by kind, dodges, perfect dodges, potions, reactions, markers reached), so a rat killed, a weapon grabbed or a chest opened before its step still counts.
- **Stop and Anvil steps** read the profile's state where one exists (`tutorialHolds`): the weapon in the bag or equipped, the cuirass forged since the lesson began (by `forgeCount`), the pair bound, the Primary's slot count and its new move's elements, a rune in the Primary's first move, the old sword gone, the bars refined, the moveset on the rare, a hone done, nothing left to claim. Only steps with no state (an `ack`, a power-up taken) wait for their event.

**Triggers.** One pure rule, `tutorialAdvance(state, event)`, used in two places:

- **On a floor** the sim advances `ArpgWorld.tutorial` each tick from its own `ArpgEvent`s (cast with slot, chain step and aim; pickup; dodge and perfect dodge; interact; potion; reaction; marker reached), so gates open and objectives change at once; `bankWorld` copies the state back to the profile.
- **Off the floor** `applyTutorialEvents(registry, profile, events)` advances it from the quest event stream (`QuestEvent`) extended with tutorial-only types quests ignore: `takeStop` (kind), `ack` (a reading beat), and at the Anvil `claim`, `equip`, `setChains` (slot added, element set, socket opened, rune socketed), `salvage`, `transfer`, `hone`, plus the existing `forge`, `refine`, `bind`. Every emitting op calls it beside `applyQuestEvents`.
- The count lives in `tutorial.count`; a step with `skipAfter` counts misses (perfect-dodge tries, seconds) in `tutorial.misses`.
- **The Training Grounds** stay sealed except for one path: while the current step is `where: 'training'`, the page reports its trigger (a Defensive cast) through a store action that calls only `applyTutorialEvents`, never `applyQuestEvents`.

**Hand-built floors.** Each floor: ASCII rows (`#` wall, `.` floor, `0`–`9` a door by its index, `S` start, `X` exit gate, `C` chest, `H` shrine, `A` alcove), rooms (`{ id, kind: RoomKind, rect }`, at most one interactable each, as generated rooms), spawns (`{ id, monster, at, room, elite?: { traits }, script?: 'slamOnly', hpMult?, damageMult? }`), markers (`{ id, at }`) and set drops (`{ on: 'spawn:<id>' | 'chest' | 'boss', drop }`). `slamOnly`: the foe holds its ground and only slams on a fixed cadence with a long telegraph, never chasing. When the tutorial is active, `beginFloor` builds the step's floor instead of generating one (`FloorOptions.tutorial`); fog, rooms, seals, interactables, physics and AI work as on any generated floor. Each floor's data is checked: a reachable exit, markers and spawns on walkable cells inside their rooms, doors on room walls.

**Set drops.** Gear as `{ base, rarity, element: 'primary' | 'secondary', slots?: { primary?: number }, sockets? }`, generated on the fork `tutorial:<dropId>`; runes as `{ rune: 'fitsPrimary', tier }`, picked at drop time from the runes that fit the Primary's first move; materials, scrap, Dust and Links as counts. On tutorial floors random gear, rune and pattern drops are off; material drops still roll. A test checks every lesson is affordable from the kit plus the set drops (lesson 1 needs 2 Links, 40 + 10 scrap, 15 Dust, the forge's price; lesson 2 the Transfer and a hone).

**Gates.**

- A floor step's `gate.door` holds that door shut through a separate `Door.held` flag that seal code never clears (`unseal` clears only seal closure); one helper, `doorShut(d)` (`closed || held`), replaces every read of `closed` (`isWall` in `grid.ts`, the fog key, the flow fields, the bot's door key), so a held door blocks movement and sight; `gate.exit` keeps the exit gate shut (its interact refused, `exitRequest` not raised) until the step is done.
- A tutorial stop offers the kinds and doors its step names, intersected with `stopKinds` (what the hero can take and pay for); its doors stay disabled until a required power-up is taken (a required kind the intersection empties stops being required); no door may skip a depth; `extract: true` makes Extract the only road.
- A tutorial alcove offers the kinds its step names, intersected with what's affordable.
- At the Anvil nothing is blocked but `startDive`, which refuses while an Anvil lesson is unfinished ("Finish Hesta's lesson or skip it"). A step whose op is unaffordable (the player spent freely) shows "Skip this step".

**Retry.** `startDive`, `chooseDoor` and a retry store the profile as it enters a tutorial depth on `DiveState.tutorialEntry`: the whole profile with its dive (potions, `heroHpFrac`, `used`, `diveBuffs`, `dropsGiven`, kills, finds), stripping only `dive.tutorialEntry` so it never nests. `retryTutorialDepth(registry, profile)` restores it and rebuilds the depth, reverting everything banked on that floor (bag, patterns, materials, `reactionsSeen`, quest progress, the step), consistent with "nothing lost". While the tutorial runs, `failFloor`, Abandon and "Anvil · floor restarts" route to it on a floor; at a stop Abandon is disabled (it would replay a depth already cleared); extraction is offered only where a stop's data says.

**Skip.** `skipTutorial` clears the state; a hand-built floor in progress plays out (its gates open), later floors generate, stops and alcoves roll as usual, and the Anvil's Delve unlocks.

**Quest unlocks.** For every quest, main and side, `unlock.after` is met when that quest is complete (every objective done), claimed or not. `applyQuestEvents` checks it against the progress it has just computed, walking the quests in chain order so one call can cascade (binding, then forging, unlocks A Second Flame and Spark and Counterspark in one pass). A main quest newly unlocked takes its predecessor's tracker slot even while that one waits to be claimed (it stays in the journal, claimable). So Bring It Home counts dive 1's extract, Spark and Counterspark counts dive 2's reactions, and the Cinder Warden is open when Grask falls. The Cinder Warden asks for **a rare forge** (and Grask); the Untouchable side quest's essence reward becomes epic flux.

**Carries (game-wide).** `balance.json → delve.movesets.carries`: common `[basic]`; uncommon, magic `[basic, primary]`; rare `[basic, primary, defensive]`; epic, legendary all four; unarmed (`UNARMED`, `carriedSkills(null)`) `[basic]`. `carriedSkills` takes the item (its rarity and `awakened`), threaded through `MovesetOwner`, `defaultMoveset`, `movesetTransfer`, `forgedMoveset` and `fitMovesets` so an awakened Ultimate survives load and transfer.

**Awaken (new crafting op).** `awaken(registry, profile, uid)` on the Temper bench: a rare weapon gains the Ultimate (`GearItem.awakened: true`; its moveset gains the Ultimate's base chain in the pair's primary), once; `carriedByText('ultimate')` names it ("Carried by epic weapons and better, or an awakened rare"). Price in `delve.crafting.awaken` (e.g. 1 epic flux + Links + scrap × `scrapLevelFactor`); refused mid-dive, on a non-rare or non-weapon, on an awakened weapon, unpaid. Upgrade, reforge and Transfer keep the flag with the weapon (a Transfer moves the moveset; the target's own carries decide). The autopilot awakens its equipped rare when it can pay and `profilePower` rises.

**Legendaries later (game-wide).** `firstEssenceGiven` and the first-boss guarantee go. `delve.drops.essenceMinDepth` (20): below it no boss, vault (`drops.vault.essenceChance`) or other drop yields an essence; contracts offer none and `essence` rewards resolve to their fallback while `bestDepth` is below it. The pacing target "the first boss's essence forged on the visit after its dive" becomes "the first legendary is forged within two Anvil visits of the first essence banking", and the targets are re-measured (basic-only starts, later legendaries, main-quest unlocks on completion), judged on their own numbers.

**The bot.** `AutopilotOptions.tutorial: true`: the bot plays a guided start, following each step's objective (walk to the marker, cast and aim, dodge (for the perfect dodge it dodges within `perfectWindow` of the brute's slam; it takes "Skip this step" when `skipAfter` is reached), interact, potion, take the named power-up, the Anvil ops in order, the Training step's cast). A death retries the depth, at most three times, then skips the tutorial (the test counts that as a failure). A non-tutorial bot gets its Primary from its first forge (it forges before dive 1 with the kit).

## 3. The client

- **The choice dialog** (`GuidedChoice`, a kit `Dialog`) on the Anvil before `ManaChoice` on a fresh save.
- **`TutorialPanel`**: Hesta's portrait (the `hesta` atlas sprite), her line, the objective line with `InputGlyph` for the device in hand; above the dock in a dive, docked bottom right at the Anvil and in the Training Grounds. A `beat` step pauses the arena (no pause screen) until Continue (Enter / A), which sends `ack`. "Skip this step" when allowed.
- **Highlights:** controls a step can name carry `data-tutorial="<target>"`; `TutorialHighlight` draws a pulsing forge-gold outline around the target in the topmost pad scope; under the pad the focus moves to it.
- **The floor:** the renderer draws the step's marker (a pixel beacon, an edge arrow off screen) and a held door or exit as barred.
- **Retry screen** (Retry, Skip tutorial) instead of `DiveSummary` on a tutorial death.
- **Skip tutorial** in `SystemMenu`, the pause and the retry screen (confirm).
- **The Temper bench gains Awaken** (price and refusal reason from the engine).
- **"How to delve"** stays for Jump in players, rewritten for the current rules (death costs, carries).
- Everything at the 14 px text floor, prompts per device, the input lock respected.

## 4. Testing

- **Engine:** the tutorial data check (steps, tokens, stops, floors); each trigger type on and off the floor; anything done before its step (a kill, a pickup, the chest, the bind, the socketed rune) still completes it; a held door opens on its step and a seal never opens it; the exit gate waits for the floor's steps; tutorial stops and the alcove offer only the data's kinds, doors never skip; the retry restores the entry snapshot and reverts the floor's gains; Abandon and floor restarts retry while the tutorial runs; skip mid-dive leaves an ordinary save (gates open, Delve unlocked); set drops follow the pair; the lessons are affordable; main quests unlock on completion; carries by rarity, unarmed Basic only, awakened Ultimate through load and transfer; Awaken's price and refusals; no essence below `essenceMinDepth` from bosses, vaults, contracts or rewards. **The whole tutorial** played by the bot (`tutorial: true`) through both dives and both lessons for every primary element (with the suggested partner, plus a few other secondaries including an Earth pair): it ends with the tutorial done, the rare weapon equipped, a secondary bound, no essence and no skip. The pacing rails re-measured; report the numbers.
- **Client:** the choice dialog, `TutorialPanel` per device, highlights, beats pausing and resuming, the retry screen, skip, Awaken on the Temper bench.
- **E2E (desktop):** a guided start played by the bot (`alloy:delve:autopilot = "tutorial"`) through dive 1 and Anvil lesson 1; a Jump in start has only the Basic until its first forge.

## Out of scope

The Ultimate and Awaken inside the tutorial; voice acting; localisation; a tutorial replay from the title screen (a new save does it); crafting other skills onto other rarities.

## Phases and parallel areas (for the plan)

- **A — contract:** types (the tutorial state, the extended events, step and floor schemas, `Door.held`, `awakened`, `essenceMinDepth`), `tutorial.json` skeleton and its check, carries data, `carriedSkills(item)` signature, stubs with signatures, save v11.
- **B (engine, in parallel):** B1 the script runner (`tutorialAdvance`, `applyTutorialEvents`, text, gates, stops, alcove, retry, skip, `startTutorial`); B2 hand-built floors (the eight floors' data, the `beginFloor` path, set drops, scripted spawns, `slamOnly`); B3 carries + Awaken + legendaries later + main-quest unlocks (drops, vaults, quests, contracts, autopilot); B4 the bot's tutorial mode and the pacing re-measure (after B1–B3).
- **C (client, in parallel):** C1 choice dialog, `TutorialPanel`, beats, retry screen, skip; C2 highlights and `data-tutorial` targets across the hub, the stop and the HUD, the floor marker and barred doors; C3 Awaken on the Temper bench and the rewritten How to delve.
- **D:** E2E, CLAUDE.md, the balance check, v0.62.0.
