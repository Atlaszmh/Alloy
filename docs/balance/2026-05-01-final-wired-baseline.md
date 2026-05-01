# Balance Simulation Baseline — Post Chunk 6 (All Compounds Wired)

**Date:** 2026-05-01
**Compound system version:** 44 wired compounds (41 trigger / passive + 3 bespoke)
**Engine:** 750 tests PASS
**Client:** v0.25.0, 383 tests PASS

## Summary

This is the final post-Chunk-6 simulation baseline. All 44 compounds now have
runtime behavior wired:

- **41 wired via trigger system / passive damage modifiers** (Chunks 1-5)
- **3 wired via bespoke engine code** (Chunk 6):
  - `flicker_strike` — auto-crit after N hits without crit (counter on
    GladiatorRuntime; default threshold 5 via `compound.flicker_strike.hitInterval`)
  - `sanguine_endurance` — overheal cap +20% (per-runtime
    `sanguineOverhealMultiplier`; default 1.20 via `compound.sanguine_endurance.overhealCap`)
  - `blood_pact` — overheal converts to permanent maxHP gain, capped at +20% of
    base maxHP (per-runtime `bloodPactGainCapFraction`; default 0.20 via
    `compound.blood_pact.overhealToHpCap`)

The bespoke compounds appear in `compoundUsageRates` (AI builds them) but not
in `compoundRuntime` (they don't emit `compound_trigger` events — their effects
are applied directly in the heal / attack pipeline rather than via fireTriggers).

## Observations

- **flicker_strike** in T5v5 ranked: 6.5% usage, 69.2% win-when-used. Strong
  but small sample (13 instances). The forced crit cadence makes low-crit-chance
  builds viable.
- **sanguine_endurance** in T5v5 ranked: 6.0% usage, 41.7% win-when-used. The
  +20% overheal cushion is modest; still sample-noisy.
- **blood_pact** in T5v5 ranked: 5.5% usage, 27.3% win-when-used. The
  permanent maxHP gain is slow to accumulate within a 30-second duel; may need
  a faster cap-fill rate or a higher cap to be competitive.
- All three compounds appear in the AI's pick distribution, confirming they're
  reachable through normal play.

Detailed per-batch output below.

## Tier 5 vs Tier 5 (ranked, 100 matches)

```
  matchCount=100  tiers=5v5  mode=ranked  seedStart=1000

  Duration: 473ms (4.7ms/match)
  Outcomes: P0=44  P1=56  draws=0
  Win rate: P0=44.0%  P1=56.0%
  Avg match length: 2.27 rounds
  Avg duel duration: 33.01s
  Avg generic upgrades / player: 3.31

  Compound-heavy builds (>=2 socketed compounds):
    matches: 121
    win rate: 52.9%

  Compound usage rates (% of player-instances with compound socketed):
    vampiric_fury                 usage=  12.5%   win-when-used=32.0%
    fortress                      usage=  12.0%   win-when-used=83.3%
    blood_mirror                  usage=  11.0%   win-when-used=68.2%
    counter_strike                usage=  11.0%   win-when-used=27.3%
    blight                        usage=  11.0%   win-when-used=40.9%
    superconductor                usage=  10.0%   win-when-used=60.0%
    storm_of_flames               usage=   8.5%   win-when-used=52.9%
    regenerative_shield           usage=   8.0%   win-when-used=81.3%
    thermal_shock                 usage=   7.5%   win-when-used=60.0%
    iron_maiden                   usage=   7.0%   win-when-used=64.3%
    flicker_strike                usage=   6.5%   win-when-used=69.2%
    blood_frenzy                  usage=   6.0%   win-when-used=58.3%
    sanguine_endurance            usage=   6.0%   win-when-used=41.7%
    static_discharge              usage=   5.5%   win-when-used=45.5%
    blood_pact                    usage=   5.5%   win-when-used=27.3%

  Compound runtime metrics (combat-log derived):
    fortress                      procs=  993   matches-with-proc=  23
    blood_mirror                  procs=  570   matches-with-proc=  22
    regenerative_shield           procs=  384   matches-with-proc=  14
    blight                        procs=  194   matches-with-proc=  21
    thermal_shock                 procs=  135   matches-with-proc=  15
    superconductor                procs=  128   matches-with-proc=  18
    storm_of_flames               procs=   98   matches-with-proc=  14
    reactive_shield               procs=   96   matches-with-proc=  11
    static_discharge              procs=   78   matches-with-proc=  10
    frostplague                   procs=   73   matches-with-proc=   7
    vampiric_fury                 procs=   70   matches-with-proc=  20
    meltdown                      procs=   67   matches-with-proc=   8
    soul_siphon                   procs=   66   matches-with-proc=   7
    envenom                       procs=   49   matches-with-proc=   4
    void_shock                    procs=   41   matches-with-proc=   6
    frostbite                     procs=   41   matches-with-proc=   5   total-dot-dmg=   864   avg-dmg/proc=21.1
    immolation                    procs=   34   matches-with-proc=   6
    bastion                       procs=   29   matches-with-proc=   8
    soul_rend                     procs=   28   matches-with-proc=   2
    iron_maiden                   procs=   24   matches-with-proc=  10
    ignite                        procs=   22   matches-with-proc=   7   total-dot-dmg=  1824   avg-dmg/proc=82.9
    retribution_aura              procs=   19   matches-with-proc=   7
    concussion                    procs=   15   matches-with-proc=   3
    counter_strike                procs=    9   matches-with-proc=   7
    combustion                    procs=    6   matches-with-proc=   4   total-dot-dmg=   372   avg-dmg/proc=62.0
    necrosis                      procs=    3   matches-with-proc=   1
    warriors_edge                 procs=    1   matches-with-proc=   1

  Top affixes by pick rate (top 10):
    compound                      pick=  92.5%   win-when-picked=50.8%
    utility                       pick=  53.5%   win-when-picked=58.9%
    crit_damage                   pick=  49.5%   win-when-picked=50.5%
    armor_rating                  pick=  48.5%   win-when-picked=55.7%
    flat_hp                       pick=  47.0%   win-when-picked=51.1%
    fire_damage                   pick=  45.5%   win-when-picked=47.3%
    lifesteal                     pick=  44.0%   win-when-picked=46.6%
    thorns                        pick=  44.0%   win-when-picked=53.4%
    cold_damage                   pick=  43.0%   win-when-picked=52.3%
    barrier                       pick=  43.0%   win-when-picked=46.5%

  Synergies activated (top 10):
    blood_mirror                  active=  24.5%   win-when-active=51.0%
    vengeance                     active=  17.5%   win-when-active=48.6%
    storm_conduit                 active=  14.5%   win-when-active=41.4%
    berserker                     active=  14.0%   win-when-active=57.1%
    frozen_blade                  active=  13.0%   win-when-active=61.5%
    plague_bearer                 active=  10.0%   win-when-active=25.0%
    fortress                      active=   9.5%   win-when-active=52.6%
    assassin                      active=   6.5%   win-when-active=92.3%
    glass_cannon                  active=   6.5%   win-when-active=92.3%
    juggernaut                    active=   4.5%   win-when-active=33.3%
```

## Tier 3 vs Tier 5 (asymmetry check, 50 matches)

```
  matchCount=50  tiers=3v5  mode=ranked  seedStart=2000

  Duration: 114ms (2.3ms/match)
  Outcomes: P0=24  P1=26  draws=0
  Win rate: P0=48.0%  P1=52.0%
  Avg match length: 2.22 rounds
  Avg duel duration: 34.72s
  Avg generic upgrades / player: 1.71

  Compound-heavy builds (>=2 socketed compounds):
    matches: 72
    win rate: 55.6%

  Compound usage rates (% of player-instances with compound socketed):
    fortress                      usage=  17.0%   win-when-used=64.7%
    vampiric_fury                 usage=  16.0%   win-when-used=31.3%
    regenerative_shield           usage=  14.0%   win-when-used=28.6%
    iron_maiden                   usage=  14.0%   win-when-used=35.7%
    blight                        usage=  13.0%   win-when-used=84.6%
    sanguine_endurance            usage=  11.0%   win-when-used=72.7%
    counter_strike                usage=  11.0%   win-when-used=36.4%
    storm_of_flames               usage=   9.0%   win-when-used=77.8%
    superconductor                usage=   9.0%   win-when-used=22.2%
    thermal_shock                 usage=   9.0%   win-when-used=55.6%
    shield_bash                   usage=   7.0%   win-when-used=42.9%
    retribution_aura              usage=   7.0%   win-when-used=57.1%
    warriors_edge                 usage=   6.0%   win-when-used=100.0%
    void_shock                    usage=   6.0%   win-when-used=33.3%
    reactive_shield               usage=   6.0%   win-when-used=50.0%

  Compound runtime metrics (combat-log derived):
    fortress                      procs=  766   matches-with-proc=  17
    regenerative_shield           procs=  379   matches-with-proc=  13
    blood_mirror                  procs=  202   matches-with-proc=   6
    blight                        procs=  138   matches-with-proc=  11
    thermal_shock                 procs=   71   matches-with-proc=   9
    storm_of_flames               procs=   70   matches-with-proc=   8
    reactive_shield               procs=   67   matches-with-proc=   6
    superconductor                procs=   65   matches-with-proc=   8
    meltdown                      procs=   46   matches-with-proc=   5
    void_shock                    procs=   37   matches-with-proc=   5
    static_discharge              procs=   34   matches-with-proc=   3
    retribution_aura              procs=   33   matches-with-proc=   7
    soul_siphon                   procs=   24   matches-with-proc=   2
    iron_maiden                   procs=   21   matches-with-proc=   8
    vampiric_fury                 procs=   17   matches-with-proc=   9
    ignite                        procs=   16   matches-with-proc=   2   total-dot-dmg=  1032   avg-dmg/proc=64.5
    frostbite                     procs=   14   matches-with-proc=   2   total-dot-dmg=   334   avg-dmg/proc=23.9
    envenom                       procs=   12   matches-with-proc=   3
    immolation                    procs=   10   matches-with-proc=   3
    counter_strike                procs=    9   matches-with-proc=   5
    necrosis                      procs=    8   matches-with-proc=   2
    frostplague                   procs=    8   matches-with-proc=   1
    concussion                    procs=    6   matches-with-proc=   2
    combustion                    procs=    4   matches-with-proc=   2   total-dot-dmg=   192   avg-dmg/proc=48.0
    shield_bash                   procs=    3   matches-with-proc=   2
    bastion                       procs=    3   matches-with-proc=   1
    warriors_edge                 procs=    2   matches-with-proc=   2

  Top affixes by pick rate (top 10):
    compound                      pick=  95.0%   win-when-picked=49.5%
    utility                       pick=  63.0%   win-when-picked=50.8%
    crit_damage                   pick=  43.0%   win-when-picked=51.2%
    fire_damage                   pick=  41.0%   win-when-picked=65.9%
    elemental                     pick=  41.0%   win-when-picked=56.1%
    flat_hp                       pick=  40.0%   win-when-picked=62.5%
    armor_rating                  pick=  40.0%   win-when-picked=42.5%
    fire                          pick=  40.0%   win-when-picked=67.5%
    lifesteal                     pick=  39.0%   win-when-picked=51.3%
    barrier                       pick=  38.0%   win-when-picked=44.7%

  Synergies activated (top 10):
    blood_mirror                  active=  16.0%   win-when-active=56.3%
    vengeance                     active=  14.0%   win-when-active=57.1%
    storm_conduit                 active=  10.0%   win-when-active=80.0%
    fortress                      active=   9.0%   win-when-active=44.4%
    plague_bearer                 active=   8.0%   win-when-active=75.0%
    berserker                     active=   8.0%   win-when-active=50.0%
    assassin                      active=   7.0%   win-when-active=100.0%
    glass_cannon                  active=   7.0%   win-when-active=100.0%
    frozen_blade                  active=   4.0%   win-when-active=25.0%
    juggernaut                    active=   3.0%   win-when-active=33.3%
```

## Tier 5 vs Tier 5 (quick mode, 100 matches)

```
  matchCount=100  tiers=5v5  mode=quick  seedStart=3000

  Duration: 277ms (2.8ms/match)
  Outcomes: P0=52  P1=48  draws=0
  Win rate: P0=52.0%  P1=48.0%
  Avg match length: 1.00 rounds
  Avg duel duration: 38.06s
  Avg generic upgrades / player: 2.25

  Compound-heavy builds (>=2 socketed compounds):
    matches: 134
    win rate: 46.3%

  Compound usage rates (% of player-instances with compound socketed):
    regenerative_shield           usage=  13.0%   win-when-used=69.2%
    iron_maiden                   usage=  12.5%   win-when-used=56.0%
    counter_strike                usage=  12.0%   win-when-used=16.7%
    blood_mirror                  usage=  11.5%   win-when-used=69.6%
    superconductor                usage=  10.0%   win-when-used=50.0%
    necrosis                      usage=  10.0%   win-when-used=60.0%
    vampiric_fury                 usage=   8.0%   win-when-used=50.0%
    blood_pact                    usage=   7.5%   win-when-used=33.3%
    riposte                       usage=   6.5%   win-when-used=30.8%
    flicker_strike                usage=   6.0%   win-when-used=41.7%
    frostplague                   usage=   6.0%   win-when-used=50.0%
    storm_of_flames               usage=   6.0%   win-when-used=66.7%
    blood_frenzy                  usage=   6.0%   win-when-used=50.0%
    sanguine_endurance            usage=   5.5%   win-when-used=9.1%
    blight                        usage=   5.5%   win-when-used=72.7%

  Compound runtime metrics (combat-log derived):
    regenerative_shield           procs=  417   matches-with-proc=  23
    blood_mirror                  procs=  357   matches-with-proc=  21
    fortress                      procs=  338   matches-with-proc=   9
    superconductor                procs=  101   matches-with-proc=  18
    necrosis                      procs=   74   matches-with-proc=  18
    reactive_shield               procs=   66   matches-with-proc=   8
    frostplague                   procs=   63   matches-with-proc=  12
    void_shock                    procs=   58   matches-with-proc=   9
    blight                        procs=   49   matches-with-proc=  11
    storm_of_flames               procs=   45   matches-with-proc=  10
    static_discharge              procs=   41   matches-with-proc=   8
    frostbite                     procs=   38   matches-with-proc=   6   total-dot-dmg=   704   avg-dmg/proc=18.5
    soul_siphon                   procs=   30   matches-with-proc=   4
    immolation                    procs=   26   matches-with-proc=   6
    soul_rend                     procs=   25   matches-with-proc=   5
    concussion                    procs=   22   matches-with-proc=   6
    iron_maiden                   procs=   20   matches-with-proc=  13
    envenom                       procs=   19   matches-with-proc=   5
    meltdown                      procs=   18   matches-with-proc=   4
    retribution_aura              procs=   15   matches-with-proc=   4
    counter_strike                procs=   13   matches-with-proc=  11
    vampiric_fury                 procs=   13   matches-with-proc=   8
    thermal_shock                 procs=   11   matches-with-proc=   4
    ignite                        procs=    9   matches-with-proc=   4   total-dot-dmg=   690   avg-dmg/proc=76.7
    bastion                       procs=    9   matches-with-proc=   4
    combustion                    procs=    4   matches-with-proc=   4   total-dot-dmg=   300   avg-dmg/proc=75.0
    warriors_edge                 procs=    1   matches-with-proc=   1
    shield_bash                   procs=    1   matches-with-proc=   1

  Top affixes by pick rate (top 10):
    compound                      pick=  93.0%   win-when-picked=51.1%
    utility                       pick=  56.0%   win-when-picked=50.0%
    thorns                        pick=  47.5%   win-when-picked=50.5%
    lifesteal                     pick=  42.0%   win-when-picked=51.2%
    elemental                     pick=  39.0%   win-when-picked=56.4%
    hp_regen                      pick=  34.5%   win-when-picked=63.8%
    block_chance                  pick=  33.0%   win-when-picked=40.9%
    crit_chance                   pick=  32.0%   win-when-picked=60.9%
    crit_damage                   pick=  32.0%   win-when-picked=57.8%
    flat_hp                       pick=  31.5%   win-when-picked=36.5%

  Synergies activated (top 10):
    blood_mirror                  active=  21.5%   win-when-active=60.5%
    berserker                     active=  12.0%   win-when-active=62.5%
    vengeance                     active=  11.5%   win-when-active=26.1%
    frozen_blade                  active=  10.5%   win-when-active=52.4%
    storm_conduit                 active=   7.0%   win-when-active=50.0%
    plague_bearer                 active=   7.0%   win-when-active=50.0%
    assassin                      active=   5.0%   win-when-active=100.0%
    glass_cannon                  active=   5.0%   win-when-active=100.0%
    fortress                      active=   5.0%   win-when-active=30.0%
    alchemist                     active=   2.0%   win-when-active=75.0%
```
