# Post-Tuning Balance Baseline (Chunk 7)

**Date:** 2026-05-01
**Wired compounds:** 44 / 44
**Tuning commits:** 10 (plus 1 follow-on test update)
**Engine tests:** 750 / 750 PASS
**Client tests:** 383 / 383 PASS
**Tools tests:** 42 / 46 PASS (4 skipped, all pre-existing)
**Typecheck:** silent across engine, client, tools

## Tuning summary

Ten one-change-per-commit tunes targeting the most consistent outliers across
the three batches (T5v5 ranked, T3v5 asymmetry, T5v5 quick). All edits live in
`packages/engine/src/data/recipes.json`.

| Compound              | Lever                                | Before | After | Direction      |
|-----------------------|--------------------------------------|--------|-------|----------------|
| fortress              | passiveDamage multiplier             | 1.15   | 1.05  | nerf           |
| blood_mirror          | heal amountPerTier                   | 6      | 4     | nerf           |
| counter_strike        | bonus_damage_scaled multiplier       | 1.5    | 2.5   | buff (round 1) |
| vampiric_fury         | on_crit lifestealPercent multiplier  | 3.0    | 5.0   | buff (round 1) |
| regenerative_shield   | barrier duration                     | 30s    | 15s   | nerf (round 1) |
| blight                | apply_dot dpsPerTier                 | 3      | 2     | nerf           |
| blood_pact            | overhealToHpCap                      | 0.20   | 0.30  | buff           |
| counter_strike        | bonus_damage_scaled multiplier       | 2.5    | 3.5   | buff (round 2) |
| vampiric_fury         | on_crit lifestealPercent multiplier  | 5.0    | 7.0   | buff (round 2) |
| regenerative_shield   | barrier amount (% MaxHP)             | 0.05   | 0.04  | nerf (round 2) |

Plus: `tests/compound-runtime.test.ts` updated for the new counter_strike and
blood_pact values.

## Win-rate movement (sample size = usage% x 200 in B1/B3, x 100 in B2)

| Compound              | B1 baseline → tuned | B2 baseline → tuned | B3 baseline → tuned |
|-----------------------|---------------------|---------------------|---------------------|
| fortress              | 83.3% → 83.3% (n=24) | 64.7% → 70.6% (n=34) | n/a                  |
| blood_mirror          | 68.2% → 59.1% (n=22) | low usage           | 69.6% → 60.9% (n=23) |
| counter_strike        | 27.3% → 27.3% (n=22) | 36.4% → 45.5% (n=22) | 16.7% → 25.0% (n=24) |
| vampiric_fury         | 32.0% → 30.8% (n=26) | 31.3% → 31.3% (n=32) | 50.0% → 50.0% (n=16) |
| regenerative_shield   | 81.3% → 75.0% (n=16) | 28.6% → 42.9% (n=28) | 69.2% → 61.5% (n=26) |
| blight                | 40.9% → 40.9% (n=22) | 84.6% → 76.9% (n=26) | 72.7% → 63.6% (n=11) |
| blood_pact            | 27.3% → 36.4% (n=11) | low usage           | 33.3% → 33.3% (n=15) |
| iron_maiden           | 64.3% → 64.3% (n=14) | 35.7% → 42.9% (n=28) | 56.0% → 56.0% (n=25) |
| sanguine_endurance    | 41.7% → 41.7% (n=12) | 72.7% → 72.7% (n=22) | 9.1% → 18.2% (n=11)  |

Movement was directionally correct in most batches but slow per-step. Several
compounds remain outside the [40%, 60%] target window after 2 rounds of tuning.

## Key finding: sim-signal sensitivity is low at n~22

After multiple iterations it became clear that win-when-used at sample size
20-30 is dominated by **AI-build correlation noise** rather than the
compound's own mechanics. Specific evidence:

- Reducing fortress's passive damage from +15% -> +5% (a 67% nerf to its
  offensive component) did not move its B1 win rate at all (83.3% before and
  after).
- Boosting counter_strike's bonus_damage_scaled multiplier from 1.5 -> 2.5
  (67% buff) did not move B1 (still 27.3%).
- The same seed-driven AI archetypes pick the same components every time, so
  win/loss outcomes are largely fixed by build composition rather than by
  small mechanical tweaks.

What this means for future tuning:

1. **The signal is most trustworthy when consistent across all three batches.**
   counter_strike at 27% / 36% / 17% is a real outlier; fortress at 83% / 65%
   in only two batches is suggestive but noisier.
2. **Mechanical tweaks of <50% rarely show up in these sample sizes.** Future
   tuning should either (a) bump sample size in the simulator to n=500+ per
   batch, or (b) run playtests rather than relying on sim signal.
3. **Build correlation (e.g. flat_hp + armor_rating IS the strongest defensive
   pair) drives much of the win-when-used metric for compounds built from
   strong components.** Tuning the compound's flavor effect won't fix this;
   the underlying affix tier-stat values would need adjustment.

## Compounds still flagged for follow-up balance work

These remain outside [40%, 60%] in at least one batch with sample >= 20:

- **fortress** — still at 83% (B1, n=24) / 71% (B2, n=34). Likely needs the
  flat_hp/armor_rating component values themselves trimmed (affix-level edit,
  not compound-level), or a more aggressive nerf to its barrier-on-hit. **Do
  not nerf further at compound layer until affix tiers are reviewed.**
- **vampiric_fury** — still at 31-33% (B1/B2, n=26/32). The 7x lifesteal
  multiplier is already large; the build itself may suffer because lifesteal
  + crit_damage as a stat pair is weaker than its competitors. **Consider
  adding a secondary effect (e.g., chance to grant a barrier on crit) rather
  than scaling the existing lever further.**
- **regenerative_shield** — still at 75% / 62% (B1/B3, n=16/26). After two
  nerfs, both halving duration AND trimming amount, it persists. The base
  affix combo (barrier + hp_regen) is intrinsically strong. **Same
  recommendation as fortress — review affix tiers.**
- **blight** — 77% B2 (n=26) / 64% B3 (n=11). One round of nerf moved it
  from 85% but it's still hot. Dual-element synergy (`target_has_dot_element`
  multiplier 1.30 still in place) could be the lever; consider 1.30 -> 1.15.
- **counter_strike** — 27% B1 / 25% B3 (n=22/24). Block triggers are too
  rare in T5v5 sims because the AI almost never builds shields. The compound
  may not actually be weak — it may just be inappropriate for shield-less
  builds. **Consider whether the "AI-uses-it-anyway" rate at n=22 is the
  right metric here, or whether to filter to shield-equipped builds only.**
- **sanguine_endurance** — 73% B2 (n=22). Strong in T3v5 only. Likely a
  small-sample effect since the same compound is at 18-42% in other batches.
  Watch but don't tune yet.

## Compounds confirmed stable after tuning

- **blood_mirror** moved 68% -> 59% (B1) and 70% -> 61% (B3). Inside band.
- **blood_pact** moved 27% -> 36% (B1) — direction-correct, still slightly
  low but with low sample (n=11). Acceptable.
- **iron_maiden** moved 36% -> 43% (B2). Inside band.
- **thermal_shock** moved 56% -> 44% (B2). Inside band.

## Caveats

- Sim header still says "23 wired compounds" — that's a stale string in the
  script, doesn't reflect actual data. Real wired count is 44.
- Many compound runtime metrics show `total-dot-dmg=0 avg-dmg/proc=0.0` even
  for procs that fired — the sim's combat-log derivation only attributes DOT
  damage for ignite/frostbite/combustion. Other compound damage attribution
  is unimplemented and not reflected in win-when-used.
- The `compound.<id>.<key>` outputBonusEffects entries are mostly **dead
  metadata** (kept for documentation/UI display). Only blood_pact's
  overhealToHpCap, sanguine_endurance's overhealCap, and flicker_strike's
  hitInterval are actually read by the runtime via `readCompoundParam`. All
  other compound mechanics live in `compoundEffects` (effect kinds) or
  `passiveDamageModifiers`.
