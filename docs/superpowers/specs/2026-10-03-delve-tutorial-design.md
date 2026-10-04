# Delve: the guided start (tutorial), carries and later legendaries

Date: 2026-10-03 · Target: v0.62.0, save v11 (older saves reset; no migrations)

## Goal

A new player can choose a **guided start**: the save's real first two dives run on hand-built floors with gated steps, and Hesta, the Anvil-keeper, walks them through the basics of combat, the loop and crafting, with two Anvil lessons between and after. It is optional and skippable at any point; what the player finds and makes is theirs to keep.

Two game-wide changes ride with it, decided while shaping the tutorial:

1. **Carries:** commons carry only the Basic; uncommon and magic add the Primary; rare adds the Defensive and can be **awakened** (a crafting op) to carry the Ultimate; epic and legendary carry all four. A new save's common sword carries only the Basic.
2. **Legendaries are mid to late game:** no guaranteed first-boss essence; bosses below `drops.essenceMinDepth` (20) drop none.

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
| Approach | An engine-run data script (`tutorial.json`), hand-built floors in the layout data, gates and set drops in the engine, the client draws Hesta, objectives and highlights; the bot plays it for tests |

## 1. The player's path

**Choosing.** On a fresh save the title screen's Delve opens a kit dialog: **Guided start** (recommended for new players) or **Jump in**. Then the mana choice as today. **Skip tutorial** sits in the system menu and the pause (behind a confirm).

**Dive 1: three hand-built Cinder Mines depths.** The hero starts with the common sword: the Basic only.

- **Depth 1.** Walk to a marker (moving). Rats fall to the automatic attack; mana fills (basics feed mana). Materials burst and fly in; scrap. A set drop: an **uncommon weapon in the primary** (carries the Primary), walked over. The exit gate: interact.
- **Stop 1.** The only power-up offered is **Equip**, and the only item is that weapon: "better weapons carry more skills". One door (Winding Path).
- **Depth 2.** Cast the Primary (Q); press again for the chain's next move; hold Q to aim at a slinger off to the side. A brute with a slow, telegraphed slam: **dodge**, then a **perfect dodge** (it keeps slamming until you land one; "Skip this step" after `skipAfter` misses). Fog of war and the minimap; a **vault chest**; a **shrine** (a blessing). Exit.
- **Stop 2.** A power-up of the data's choosing (e.g. "Adjust a move", free) and a door.
- **Depth 3.** An **elite den** seals behind you; life drops and Hesta prompts the **potion** (F). Set drops: a **rune that fits the Primary's move**, **Links**, **Mana Dust**, scrap. Exit.
- **Stop 3.** The only road is **Extract**. Hesta explains banking and the risk line (dying loses the floor's haul and a share of what the dive banked).

**Anvil lesson 1** (each step highlighted; the next opens when it's done; Delve stays disabled until the lesson ends or is skipped):

1. Claim the quests that completed (First Steps, Bring It Home).
2. **Forge** a cuirass: the pattern, a Rusty bar, uncommon flux and a chosen shard (from dive 1's drops); **equip** it, reading ▲.
3. **Bind a second element** (the Mana view). Hesta names her suggestion for the primary (`partners`, e.g. fire → frost, Melt); the player picks any.
4. **Skills:** add a slot to the Primary (Links + scrap), set the new move's element to the secondary, open a socket and socket the rune, **Apply**.
5. **Salvage** the old common sword; **refine** three Rusty bars into an Iron bar.
6. Claim what completed (Strike the Anvil, A Second Flame). Then Delve.

**Dive 2: hand-built depths 1–5.**

- **Depths 1–2.** Elements stack on foes (the pips under them, explained) and the pair's reaction fires; enough foes that the reaction fires at least five times (Spark and Counterspark).
- **Depth 3.** An **anvil alcove** (a power-up taken mid-floor).
- **Depth 4.** A choice of two doors.
- **Depth 5.** **Foreman Grask** in a hand-built boss room. A set drop: a **rare weapon in the primary** (carries the Defensive). No essence.

**Anvil lesson 2.**

1. Compare Grask's weapon as it is and as a home for your moveset (◇); **Transfer** your moveset onto it.
2. **Hone** a line on the Temper bench.
3. Claim what completed; the Quests tab's **Contract board** is introduced (an acknowledged beat).
4. The **Training Grounds**: raise your Defensive (E) once on the dummies.
5. Hesta's farewell (mentions Awaken and the Ultimate for later). The tutorial is done; the save is ordinary from here.

**Dying** (any tutorial depth): "Hesta pulls you back" with a line of advice and Retry, instead of the dive summary; the depth restarts from its entry snapshot. Real death rules are taught by Hesta's line at stop 3 and the risk line.

## 2. The engine

**State.** `DelveProfile.tutorial: { step: string } | null` (null: off, done or skipped). A guided start sets it to the first step; `skipTutorial(profile)` clears it; the last step's completion clears it. During a floor the step rides on the world (`ArpgWorld.tutorial`) and is written back by `bankWorld`, as quest events are. `DiveState.tutorialEntry` holds the profile snapshot taken when a tutorial depth begins (for the retry).

**The script: `src/data/tutorial.json`** (`TutorialDataSchema`, `registry.getTutorialData()`):

- `steps[]`: `{ id, where: 'floor' | 'stop' | 'anvil' | 'training', floor?, line, objective, highlight?, beat?: boolean, trigger: { type, filter?, count }, gate?: { door: string } , skipAfter?: number, marker?: string }`.
- `partners`: the suggested secondary per primary.
- `floors`: the hand-built floors (or in `layouts.json → tutorial`, whichever the plan finds cleaner; one place).
- Templates fill tokens `{primary}`, `{secondary}`, `{partner}`, `{primarySkill}` (the Primary's next move's name), `{reaction}` (the pair's), and `{input:<action>}` (the player's binding, drawn by the client as a glyph). Only `tutorialText(registry, profile, step)` fills them, as `runeText` does: the client never writes rule text.
- A load-time check (as `quests-check.ts` does): every step's floor, marker, door, highlight target name and trigger type exists; the steps form one sequence.

**Triggers** reuse the quest event stream (`QuestEvent`, pushed by the arena onto `WorldPending.questEvents`, applied at bank; the Anvil ops call `applyQuestEvents`), extended with tutorial-only types that quests ignore: `reachMarker`, `cast` (slot, chain step, aimed), `pickup` (drop kind), `dodge`, `perfectDodge` (exists), `interact` (kind), `potion`, `takeStop` (kind), `ack` (a reading beat acknowledged), and at the Anvil `claim`, `forge` (exists), `equip`, `bind` (exists), `setChains` (slot added, element set, socket opened, rune socketed), `salvage`, `refine` (exists), `transfer`, `hone`. One function, `applyTutorialEvents(registry, profile, events)`, advances the step when its trigger's count is met; every emitting op calls it beside `applyQuestEvents`. The sandbox stays sealed, with one exception: while the current step is `where: 'training'`, the Training Grounds report its trigger (a Defensive cast) through a store action that applies it to the save.

**Hand-built floors.** Each floor is ASCII rows (`#` wall, `.` floor, `D` door with an id, `S` start, `X` exit gate, `C` chest, `H` shrine, `A` alcove) with rooms, spawns (`{ id, monster, at, room, elite?, script?: 'slamOnly', hpMult?, damageMult? }`), markers (`{ id, at }`) and set drops (`{ on: 'spawn:<id>' | 'chest' | 'boss', drop }`). When the tutorial is active, `beginFloor` builds the floor named for the dive (1 or 2) and depth instead of generating one (`FloorOptions.tutorial`); fog, rooms, seals, interactables, physics and AI work as on any generated floor. A floor's data is checked: a reachable exit, markers and spawns on walkable cells inside their rooms, doors on room walls.

**Set drops.** Gear as a spec `{ base, rarity, element: 'primary' | 'secondary', sockets? }`, generated on the fork `tutorial:<dropId>` (deterministic, in the player's element); runes as `{ rune: 'fitsPrimary', tier }`, picked at drop time to fit the Primary's move; materials, scrap, Dust and Links as counts. On tutorial floors random gear, rune and pattern drops are off; material drops still roll (they're the loot lesson); set drops cover every lesson's price (a test checks the Anvil lessons are affordable from the set drops plus the kit).

**Gates.** A floor step with `gate.door` keeps that door closed until it completes (the doors' existing `closed` state). A tutorial stop offers the power-up kinds, items and doors the step data names (Equip only; Extract only). At the Anvil nothing is blocked but `startDive`, which refuses while an Anvil lesson is unfinished ("Finish Hesta's lesson or skip it").

**Retry.** `retryTutorialDepth(registry, profile)`: the profile from `DiveState.tutorialEntry`, the depth rebuilt; used instead of `failFloor` while the tutorial is active.

**Skip.** `skipTutorial` clears the state; a hand-built floor in progress plays out, later floors generate, stops roll as usual, and the Anvil's Delve unlocks.

**Carries (game-wide).** `balance.json → delve.movesets.carries`: common `[basic]`; uncommon, magic `[basic, primary]`; rare `[basic, primary, defensive]`; epic, legendary all four. `carriedSkills` also adds `ultimate` for an **awakened** rare.

**Awaken (new crafting op).** `awaken(registry, profile, uid)` on the Temper bench: a rare weapon gains the Ultimate (`GearItem.awakened: true`; its moveset gains the Ultimate's base chain), once. Price in `delve.crafting.awaken` (e.g. 1 epic flux + Links + scrap × `scrapLevelFactor`); refused mid-dive, on a non-rare, on an awakened weapon, unpaid. An upgrade, reforge or transfer keeps the flag with the weapon. The autopilot awakens its equipped rare when it can pay and Power rises.

**Legendaries later (game-wide).** `firstEssenceGiven` and the first-boss guarantee go; `delve.drops.essenceMinDepth` (20): a boss below it drops no essence; contracts offer no essence and `essence` rewards resolve to their fallback while `bestDepth` is below it. The Cinder Warden asks for a **rare** forge instead of a legendary; the Untouchable side quest's essence reward becomes epic flux. The pacing target "the first boss's essence forged on the visit after its dive" becomes "the first legendary is forged within two Anvil visits of the first essence banking", and the targets are re-measured (basic-only starts, later legendaries).

**The bot.** `AutopilotOptions.tutorial: true`: the bot plays a guided start, following each step's objective (walk to the marker, cast, aim, dodge, interact, potion, take the offered power-up, the Anvil ops in order, the Training step's cast). A non-tutorial bot's first forge gives it the Primary (it already forges before dive 1 with the kit).

## 3. The client

- **The choice dialog** (`GuidedChoice`, a kit `Dialog`) before `ManaChoice` on a fresh save.
- **`TutorialPanel`**: Hesta's portrait (the `hesta` atlas sprite), her line, the objective line with `InputGlyph` for the device in hand; above the dock in a dive, docked bottom right at the Anvil and in the Training Grounds. A `beat` step pauses the arena (no pause screen) until Continue (Enter / A), which sends `ack`. "Skip this step" when allowed.
- **Highlights:** controls a step can name carry `data-tutorial="<target>"`; `TutorialHighlight` draws a pulsing forge-gold outline around the target in the topmost pad scope; under the pad the focus moves to it.
- **The floor:** the renderer draws the step's marker (a pixel beacon, an edge arrow off screen).
- **Retry screen** instead of `DiveSummary` on a tutorial death.
- **Skip tutorial** in `SystemMenu` and the pause (confirm).
- **The Temper bench gains Awaken** (price, refusal reason from the engine).
- **"How to delve"** stays for Jump in players, rewritten for the current rules (death costs, carries).
- Everything at the 14 px text floor, prompts per device, the input lock respected.

## 4. Testing

- **Engine:** the tutorial data check (steps, tokens, targets, floors); each trigger type; a gated door opens on its step; tutorial stops offer only the data's kinds; the retry restores the entry snapshot; skip mid-dive leaves an ordinary save; set drops follow the pair; the Anvil lessons are affordable; carries by rarity; Awaken's price and refusals; essences only from `essenceMinDepth`; no first-boss essence. **The whole tutorial** played by the bot (`tutorial: true`) through both dives and both Anvil lessons, every primary element: it ends with the tutorial done, a rare weapon equipped, a secondary bound, no essence. The pacing rails re-measured (and re-banded only where the carries change moves them; report the numbers).
- **Client:** the choice dialog, `TutorialPanel` per device, highlights, beats pausing and resuming, the retry screen, skip, Awaken on the Temper bench.
- **E2E (desktop):** a guided start played by the bot (`alloy:delve:autopilot = "tutorial"`) through dive 1 and Anvil lesson 1; a Jump in start has only the Basic until its first forge.

## Out of scope

The Ultimate and Awaken inside the tutorial; voice acting; localisation; a tutorial replay from the title screen (a new save does it); crafting other skills onto other rarities.

## Phases and parallel areas (for the plan)

- **A — contract:** types (`tutorial` state, events, step and floor schemas, `awakened`, `essenceMinDepth`), `tutorial.json` skeleton and its check, carries data, stubs with signatures, save v11.
- **B (engine, in parallel):** B1 the script runner (triggers, `applyTutorialEvents`, text, gates, stops, retry, skip); B2 hand-built floors (the eight floors' data, `beginFloor` path, set drops, scripted spawns); B3 carries + Awaken + legendaries later (drops, quests, contracts, autopilot); B4 the bot's tutorial mode and the pacing re-measure (after B1–B3).
- **C (client, in parallel):** C1 choice dialog, `TutorialPanel`, beats, retry, skip; C2 highlights and `data-tutorial` targets across the hub, the stop and the HUD, the floor marker; C3 Awaken on the Temper bench and the rewritten How to delve.
- **D:** E2E, CLAUDE.md, the balance check, v0.62.0.
