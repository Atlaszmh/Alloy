# Delve — Loot-Crawler Mode Design

**Date:** 2026-09-24
**Status:** Implemented (v0.27.0)
**Engine modules:** `packages/engine/src/loot/`, `packages/engine/src/delve/`
**Client:** `packages/client/src/pages/DelveCamp.tsx`, `DelveRun.tsx`, `packages/client/src/features/delve/`

---

## Why

Alloy already had the ingredients of a loot game: six rarity tiers, a large affix
catalogue, elements, and a deterministic combat engine. They sat inside a slow
competitive loop, though:

| Friction in the Arena loop | Effect |
|---|---|
| Timed draft of abstract "+4 Fortify" gems before any action | First 60s is homework, not play |
| Drag-and-drop socketing across two items and six sockets | High input cost per decision |
| Long auto-duel (up to 100s) you only watch | Low agency and slow feedback |
| Rewards are stat gems, not *gear* | No "ooh, a legendary helm" moment |
| No persistence between runs | Nothing to come back for |

Delve keeps the part people love (the loot tiers) and puts it in the fastest
possible loop: **kill → loot drops → equip upgrade → go deeper → forge → repeat.**

## The Three Loops

**Seconds: combat and drops.** You face one monster at a time, first-person. Your
hero attacks automatically, and hits land as slashes with damage numbers. Kills burst
into loot that shines in its rarity color and flies into your loot tray. Each drop
shows a green ▲ or red ▼ against your equipped piece, and one tap equips it.
Two active buttons keep your hands busy:
- **Slam**: charges as you hit. Tap it for a heavy strike that stuns. Auto-slam is optional.
- **Potion**: 3 per dive, heals 40%.

**Minutes: the dive.** A dive descends through **depths**. Each depth has 3 encounters.
Every 5th depth ends with a **boss** (guaranteed Rare+, and your first boss ever drops
a Legendary). Your HP carries over between fights, so attrition builds. After each depth
you choose one of three **doors** (modifiers such as *Gilded Halls*: +magic find and tougher
monsters, or *Quiet Shrine*: full heal and less loot) **or extract**.
- The **bounty** (scrap) grows with every depth you clear. It pays out only if you extract.
  If you die, the bounty is lost, but **all gear you found is kept**. That is the push-your-luck layer.
- Boss depths you clear become checkpoints you can start later dives from.

**Hours: the Anvil (meta).** Between dives you return to camp:
- **Paper doll** with 7 slots: weapon, helm, chest, gloves, boots, amulet, ring.
- **Bag** (40 slots): sort, lock, bulk-salvage junk, and "Equip best".
- **Forge** (scrap sink):
  - *Upgrade* +1 to +10 (+10% item stats per level).
  - *Reforge* one affix (the cost escalates per item).
  - *Alloy Fusion*: three items of one rarity become one item of the next rarity.
    Fusing three Epics makes a Legendary.
- **Codex**: 12 legendary powers to collect. This is the long-tail goal.

## Rarity

Reuses `GemRarity` / `RARITY_ORDER` from the engine.

| Rarity | Color | Affixes | Base-stat mult | Min roll |
|---|---|---|---|---|
| Common | grey | 0 | 1.00 | 0 |
| Uncommon | green | 1 | 1.10 | 0 |
| Magic | blue | 2 | 1.20 | 0 |
| Rare | yellow | 3 | 1.35 | 0.10 |
| Epic | purple | 4 | 1.55 | 0.25 |
| Legendary | orange | 4 + power | 1.75 | 0.40 |

Rarity is rolled from base weights. Luck (magic find + depth + elite/boss + door)
tilts the weights toward the top tiers. Legendary **pity** grows each drop without one.

## Gear

- **Item level** = depth. Flat stats scale `itemGrowth^(ilvl-1)`.
- **Material names** progress with ilvl (Rusty → Iron → Steel → Mithril → Adamant → Starforged),
  so each new material is a small milestone.
- **Weapon bases** give the build its identity: Dagger (fast, +crit), Sword, Axe (+crit damage),
  and Maul (slow, huge hits).
- **Implicits**: weapon has damage, armor pieces have armor and HP, gloves add attack speed,
  boots add dodge, amulet adds % damage, ring adds crit.
- **Affixes** come from a slot-restricted pool: flat damage, fire/cold/lightning, % damage,
  attack speed, crit chance and damage, max HP, % HP, armor, dodge, lifesteal, life on hit,
  heal on kill, thorns, magic find, and scrap find.
- **Elements have riders**: fire burns, cold chills (slows the monster), and lightning can chain.
- Every affix records its **roll quality** (0–1), so a perfect roll is visible and worth chasing.
- Rare and Epic items get generated names; Legendaries are named after their power.

## Legendary Powers (Codex)

Twin Fang, Emberheart, Stormcaller, Executioner, Glass Cannon, Berserker, Bulwark,
Phoenix Plume, Frostbite, Thornmail, Lucky Charm, Seismic Slam. Each one has an eligible
slot list and a rolled magnitude.

## Combat

Event-driven and deterministic (`SeededRNG` per encounter). Stepping in any `dt` chunk
size gives identical results, so the client just calls `stepFight(fight, dt × speed)` from
a RAF loop and animates the returned events.

- Hero hit = (weapon damage × %dmg) [× crit] + elemental; armored monsters reduce the physical part.
- Monster hit is reduced by dodge, then armor (`armor / (armor + K·monsterScale)`, capped).
- Monster traits add variety: Armored, Swift, Brute, Regenerating, Vampiric, Spiked.

## Power & Comparison

`Power = sqrt(DPS × EHP)` against the current depth's reference monster. Every item is
compared by recomputing hero stats with the item swapped in. The UI shows the Power delta
as ▲/▼ %, plus DPS and Toughness deltas in the detail sheet.

## Persistence

`DelveProfile` (versioned JSON in localStorage) holds equipped gear, bag, scrap, checkpoints,
codex, stats, legendary pity, and the active dive (resumable between fights). Profile RNG
counters make forge actions deterministic too.

## Balance

All tunables live in `balance.json → delve`. The autopilot sim
(`engine/src/delve/autopilot.ts`) plays dives with a greedy bot. `delve-pacing.test.ts`
guards the curve:

- The first dive with starter gear dies or extracts early.
- The first boss (depth 5) takes a few dives.
- Progress continues steadily over dozens of dives, with no early hard wall.
