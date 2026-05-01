# Passive Compound Mapping (2026-05-01)

> Spec for wiring 21 unwired compounds. Used as input to Chunks 3-6 of
> the balance-recommendations-followup plan
> (`docs/superpowers/plans/2026-05-01-balance-recommendations-followup.md`).

**Total unwired compounds: 21** (out of 44 total compounds; 23 already wired).

## Categories

- **Group A — Always-on (no work needed)**: 0 compounds
- **Group B — Clean trigger fits (Chunk 4)**: 5 compounds
- **Group C — Needs `on_dodge` (Chunk 3 unblocks; Chunk 4 wires)**: 1 compound
- **Group D — Approximation acceptable (Chunk 4 + Chunk 5 fidelity pass)**: 12 compounds
- **Group E — Bespoke (Chunk 6)**: 3 compounds

> **Why no Group A?** Every unwired compound's `weaponEffect` / `armorEffect`
> in `combinations.json` declares only `compound.<id>.<key>` parameter
> entries. The stat-calculator (`packages/engine/src/forge/stat-calculator.ts`,
> `shouldSkipKey`) explicitly drops `compound.*` keys (line 46) on the
> assumption the duel-engine trigger system will consume them via
> `outputBonusEffects` instead. So none of these compounds currently
> contribute *any* runtime effect. They are all silently inert until wired.

## Pipeline reference

Trigger conditions available **after Chunk 3 lands**:
`on_hit`, `on_crit`, `on_block`, `on_taking_damage`, `on_low_hp`, `on_dodge`.

Effect kinds available: `compound_dot`, `apply_dot`, `bonus_damage`,
`bonus_damage_scaled`, `damage_current_hp`, `reduce_max_hp`, `heal`,
`gain_barrier` (with `isPercent` + `duration`), `stun`, `reflect_damage`,
`apply_slow`, `stat_buff_add`, `stat_buff_mul`, `amplify_dot_element`.

Default chance is `compound.<id>.chance` from `outputBonusEffects` (or 0.15
fallback). Add an explicit `compound.<id>.chance` entry when you want a
specific firing rate.

---

## Group A — Always-on stat bonuses

*(none — see "Why no Group A?" above)*

---

## Group B — Clean trigger fits (Chunk 4)

These compounds map cleanly onto the existing trigger pipeline using already-supported conditions. No fidelity loss.

### vampiric_fury (signature)

- **Components:** `affix:lifesteal`, `affix:crit_damage`
- **Description:** Heals 3x more from critical strikes on weapons; converts enemy crits into healing on armor.
- **Recipe params:** `active=1, critLifestealMultiplier=3`
- **Intended mechanic:** When you crit, lifesteal value is tripled for that hit (or, expressed as a temporary buff, your `lifestealPercent` is multiplied for a brief window).
- **Proposed wiring:**
  ```json
  {
    "outputBonusEffects (add)": "compound.vampiric_fury.chance = 1.0",
    "compoundEffects": [
      {
        "condition": "on_crit",
        "effect": {
          "kind": "stat_buff_mul",
          "stat": "lifestealPercent",
          "multiplier": 3.0,
          "duration": 4
        }
      }
    ]
  }
  ```
- **Fidelity notes:** Approximates "crit heals 3x more" as a 4-second 3x lifesteal window after a crit. With high attack speed the buff stays refreshed; near-identical effective behavior.

### iron_maiden (signature)

- **Components:** `affix:thorns`, `affix:block_chance`
- **Description:** Multiplies thorn damage output on blocks from weapons; triggers maximum thorns on every block from armor.
- **Recipe params:** `active=1, blockReflectMultiplier=2`
- **Intended mechanic:** On block, reflect doubled thorns damage back at the attacker.
- **Proposed wiring:**
  ```json
  {
    "outputBonusEffects (add)": "compound.iron_maiden.chance = 1.0",
    "compoundEffects": [
      {
        "condition": "on_block",
        "effect": { "kind": "reflect_damage", "multiplier": 2.0, "duration": 4 }
      }
    ]
  }
  ```
- **Fidelity notes:** `reflect_damage` already exists (used by `retribution_aura`). The duration window means several follow-up attacks within 4s also reflect — slightly more generous than "only the blocked hit," but mechanically faithful.

### regenerative_shield (signature)

- **Components:** `affix:barrier`, `affix:hp_regen`
- **Description:** Heals shields through regeneration making barriers permanent on weapons; passively regenerates shields on armor.
- **Recipe params:** `active=1, regenMultiplier=2`
- **Intended mechanic:** Periodically refreshes/expands your barrier through regen.
- **Proposed wiring:**
  ```json
  {
    "outputBonusEffects (add)": "compound.regenerative_shield.chance = 0.5",
    "compoundEffects": [
      {
        "condition": "on_taking_damage",
        "effect": {
          "kind": "gain_barrier",
          "amount": 0.05,
          "isPercent": true,
          "duration": 30
        }
      }
    ]
  }
  ```
- **Fidelity notes:** Expresses "regenerated barrier" as periodic barrier top-ups whenever you take damage. Long duration (30s) approximates "permanent." Real fidelity (true regen-feeds-barrier) would require a passive tick hook in duel-engine — not worth a bespoke for this.

### warriors_edge (signature3)

- **Components:** `affix:crit_chance`, `affix:crit_damage`, `affix:attack_speed`
- **Description:** Crits stack attack speed; a sustained DPS spiral.
- **Recipe params:** `active=1, critAttackSpeedStack=0.1, maxStacks=5`
- **Intended mechanic:** Each crit adds a stacking +10% attack speed buff (max 5 stacks).
- **Proposed wiring:**
  ```json
  {
    "outputBonusEffects (add)": "compound.warriors_edge.chance = 1.0",
    "compoundEffects": [
      {
        "condition": "on_crit",
        "effect": {
          "kind": "stat_buff_mul",
          "stat": "attackSpeed",
          "multiplier": 0.1,
          "duration": 6
        }
      }
    ]
  }
  ```
- **Fidelity notes:** `stat_buff_mul` triggers stack additively per cast in the existing system, so repeated crits within the 6s window pile on +10% each. Real "max 5 stacks" cap is not enforced (could overstack with very high crit rate); soft cap is provided by the 6s natural decay. Acceptable for v1; can add real cap later if balance wobbles.

### crystal_aegis (signature3)

- **Components:** `recipe:frostbite`, `recipe:fortress`, `affix:cold_damage`
- **Description:** Fortress (<80% HP) also applies AoE chill; attackers slow while you hold.
- **Recipe params:** `active=1, chillOnFortress=0.3, auraRadius=3`
- **Intended mechanic:** A capstone fusion of frostbite (cold DOT + slow) and fortress (HP-tied damage reduction). Combat is single-target so "AoE radius 3" collapses to "applied to attacker."
- **Proposed wiring:**
  ```json
  {
    "outputBonusEffects (add)": "compound.crystal_aegis.chance = 0.20",
    "compoundEffects": [
      {
        "condition": "on_taking_damage",
        "effect": {
          "kind": "compound_dot",
          "element": "cold",
          "dpsPerTier": 4,
          "duration": 8,
          "tickInterval": 1,
          "dotMultiplier": 1.5
        }
      },
      {
        "condition": "on_taking_damage",
        "effect": { "kind": "apply_slow", "multiplier": 1.8, "duration": 6 }
      }
    ]
  }
  ```
- **Fidelity notes:** Stronger version of `frostbite` (cold DOT + slow) wired off `on_taking_damage` to capture the "while-attacked" feel. Fortress's HP-threshold damage-reduction half remains unwired here — that gets covered if/when fortress itself is wired (currently it's also unwired, see Group D below). After Chunk 4, both pieces fire; capstone effectively layers.

---

## Group C — Needs `on_dodge` (Chunk 3 unblocks; Chunk 4 wires)

### riposte (signature)

- **Components:** `affix:dodge_chance`, `affix:attack_speed`
- **Description:** Triggers automatic counterattacks on dodges from weapons; increases attack speed on each successful dodge on armor.
- **Recipe params:** `active=1, attackSpeedOnDodge=0.5`
- **Intended mechanic:** Successful dodge → attack speed boost (and a counterattack flavor that we model as the attack-speed window letting you swing back faster).
- **Proposed wiring (after `on_dodge` lands in Chunk 3):**
  ```json
  {
    "outputBonusEffects (add)": "compound.riposte.chance = 1.0",
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
  }
  ```
- **Fidelity notes:** Models both halves (counterattack + speed bump) as a single attack-speed surge after a dodge. Cleanest unified expression once `on_dodge` exists.

---

## Group D — Approximation acceptable (Chunk 4 + Chunk 5 fidelity pass)

Each of these is wired in Chunk 4 with a triggers-only blueprint (functional but lossy) and gets a real-fidelity passive damage modifier upgrade in Chunk 5.

### thermal_shock (signature)

- **Components:** `affix:fire_damage`, `affix:cold_damage`
- **Description:** Stuns enemies briefly through rapid temperature changes on weapons; cancels out opposing elemental attacks on armor.
- **Recipe params:** `active=1, stunDuration=15, dotBonus=0.25`

  *Note: `stunDuration=15` reads as 15 game-ticks/decisecs given the rest of the codebase scale; treat as ~1.5s.*
- **Intended mechanic:** When fire and cold both proc on a target, briefly stun it; +25% bonus damage on DOTs.
- **Chunk 4 approx wiring:**
  ```json
  {
    "outputBonusEffects (add)": "compound.thermal_shock.chance = 0.20",
    "compoundEffects": [
      {
        "condition": "on_hit",
        "effect": { "kind": "stun", "duration": 1.5 }
      }
    ]
  }
  ```
- **Fidelity loss:** Chance-based stun on any hit, not gated on "target has both fire and cold DOTs active." DOT bonus is omitted from triggers.
- **Chunk 5 upgrade:** Add passive damage modifier `{ damageType: 'fire'|'cold', multiplier: 1.25, condition: { kind: 'target_has_dot_element', element: 'cold'|'fire' } }` (cross-condition: fire-bonus when cold-DOT'd, vice versa).

### blight (signature)

- **Components:** `affix:fire_damage`, `affix:poison_damage`
- **Description:** Creates a fire-poison feedback loop that amplifies both elements on weapons; weakens enemy fire and poison synergies on armor.
- **Recipe params:** `active=1, poisonBonusOnBurn=0.3, fireBonusOnPoison=0.2`
- **Intended mechanic:** +30% poison damage when target is burning; +20% fire damage when target is poisoned.
- **Chunk 4 approx wiring:**
  ```json
  {
    "outputBonusEffects (add)": "compound.blight.chance = 0.30",
    "compoundEffects": [
      {
        "condition": "on_hit",
        "effect": { "kind": "apply_dot", "element": "poison", "dpsPerTier": 3, "duration": 4 }
      }
    ]
  }
  ```
- **Fidelity loss:** Always-on extra poison DOT, doesn't conditionally check for fire DOT on target. Fire-bonus-on-poison half is omitted from triggers.
- **Chunk 5 upgrade:** Add two passive damage modifiers:
  - `{ damageType: 'poison', multiplier: 1.30, condition: { kind: 'target_has_dot_element', element: 'fire' } }`
  - `{ damageType: 'fire', multiplier: 1.20, condition: { kind: 'target_has_dot_element', element: 'poison' } }`

### storm_of_flames (signature)

- **Components:** `affix:fire_damage`, `affix:lightning_damage`
- **Description:** Chains lightning between enemies with each bounce applying fire on weapons; grounds and disperses fire and lightning attacks on armor.
- **Recipe params:** `active=1, lightningOnFire=0.25, igniteOnLightning=0.25`
- **Intended mechanic:** Lightning hits proc fire DOT, fire hits proc lightning damage. Cross-element synergy.
- **Chunk 4 approx wiring:**
  ```json
  {
    "outputBonusEffects (add)": "compound.storm_of_flames.chance = 0.25",
    "compoundEffects": [
      {
        "condition": "on_hit",
        "effect": { "kind": "apply_dot", "element": "fire", "dpsPerTier": 3, "duration": 4 }
      },
      {
        "condition": "on_hit",
        "effect": { "kind": "bonus_damage", "damageType": "lightning", "amountPerTier": 6 }
      }
    ]
  }
  ```
- **Fidelity loss:** Both procs fire on every qualifying hit; doesn't actually require the *other* element to have just procced. Rolls one chance for both effects.
- **Chunk 5 upgrade:** Convert to passive damage modifiers conditioned on `target_has_dot_element` (fire procs lightning bonus when target is shocked, etc.) once the modifier system supports element-specific damage routing.

### superconductor (signature)

- **Components:** `affix:cold_damage`, `affix:lightning_damage`
- **Description:** Amplifies lightning damage against slowed enemies on weapons; slows incoming electricity through cold aura on armor.
- **Recipe params:** `active=1, lightningBonusOnSlow=0.3, extendSlow=1`
- **Intended mechanic:** +30% lightning damage when target is slowed.
- **Chunk 4 approx wiring:**
  ```json
  {
    "outputBonusEffects (add)": "compound.superconductor.chance = 0.20",
    "compoundEffects": [
      {
        "condition": "on_hit",
        "effect": { "kind": "apply_slow", "multiplier": 1.3, "duration": 4 }
      },
      {
        "condition": "on_hit",
        "effect": { "kind": "bonus_damage", "damageType": "lightning", "amountPerTier": 5 }
      }
    ]
  }
  ```
- **Fidelity loss:** Bonus lightning damage applies always (not gated on target-slowed). Slow self-applied on hit; doesn't extend an existing slow.
- **Chunk 5 upgrade:** Passive modifier `{ damageType: 'lightning', multiplier: 1.30, condition: { kind: 'target_has_status', status: 'slow' } }`.

### frostplague (signature)

- **Components:** `affix:cold_damage`, `affix:poison_damage`
- **Description:** Accelerates poison on slowed enemies for double weakness on weapons; weakens both poison and cold effects on armor.
- **Recipe params:** `active=1, poisonSpeedOnSlow=0.5, extraSlowOnPoison=0.1`
- **Intended mechanic:** Poison ticks 50% faster on slowed targets; poison procs add extra slow.
- **Chunk 4 approx wiring:**
  ```json
  {
    "outputBonusEffects (add)": "compound.frostplague.chance = 0.25",
    "compoundEffects": [
      {
        "condition": "on_hit",
        "effect": {
          "kind": "amplify_dot_element",
          "element": "poison",
          "stackMultiplier": 1.5,
          "tickMultiplier": 1.5,
          "duration": 6
        }
      },
      {
        "condition": "on_hit",
        "effect": { "kind": "apply_slow", "multiplier": 1.1, "duration": 4 }
      }
    ]
  }
  ```
- **Fidelity loss:** Poison amplification fires regardless of target being slowed.
- **Chunk 5 upgrade:** Make the poison-tick-speedup conditional on `target_has_status: slow` via a passive DOT-rate modifier (requires extending the modifier system beyond pure damage to DOT cadence — flag as stretch).

### void_shock (signature)

- **Components:** `affix:lightning_damage`, `affix:shadow_damage`
- **Description:** Triggers shadow effects through lightning that ignore defenses on weapons; disperses lightning into shadow rifts on armor.
- **Recipe params:** `active=1, shadowChanceOnLightning=0.2`
- **Intended mechanic:** 20% chance lightning hits also deal shadow (defense-ignoring) damage.
- **Chunk 4 approx wiring:**
  ```json
  {
    "outputBonusEffects (add)": "compound.void_shock.chance = 0.20",
    "compoundEffects": [
      {
        "condition": "on_hit",
        "effect": { "kind": "bonus_damage", "damageType": "shadow", "amountPerTier": 8 }
      }
    ]
  }
  ```
- **Fidelity loss:** Doesn't gate on the source hit being lightning; "ignore defenses" framing not modeled (shadow damage just goes through normal resists). Will need a `bypass_defense` flag on bonus_damage for true fidelity — defer.
- **Chunk 5 upgrade:** Add `ignoresArmor: true` flag to bonus_damage if the damage-modifier system gains it; otherwise leave as-is.

### necrosis (signature)

- **Components:** `affix:poison_damage`, `affix:shadow_damage`
- **Description:** Permanently erodes enemy max HP through stacking poison on weapons; negates enemy poison and shadow effects on armor.
- **Recipe params:** `active=1, maxHpPerStack=0.005, poisonStacksOnShadow=2`
- **Intended mechanic:** Poison stacks shave permanent max HP off the target.
- **Chunk 4 approx wiring:**
  ```json
  {
    "outputBonusEffects (add)": "compound.necrosis.chance = 0.20",
    "compoundEffects": [
      {
        "condition": "on_hit",
        "effect": { "kind": "reduce_max_hp", "fraction": 0.01, "duration": 30 }
      },
      {
        "condition": "on_hit",
        "effect": { "kind": "apply_dot", "element": "poison", "dpsPerTier": 2, "duration": 6 }
      }
    ]
  }
  ```
- **Fidelity loss:** Max HP reduction is duration-based (30s) rather than truly permanent; doesn't actually scale with poison stack count (`reduce_max_hp` is a one-shot fraction).
- **Chunk 5 upgrade:** Could add a passive modifier that reads target's poison-stack count and scales `reduce_max_hp` accordingly — but realistically, a duration-based fraction is the right abstraction for round-length combat. May leave as-is.

### blood_mirror (signature)

- **Components:** `affix:lifesteal`, `affix:thorns`
- **Description:** Converts thorns damage into health healing on weapons; feeds health from enemies hurt by your thorns aura on armor.
- **Recipe params:** `active=1, healFromThorns=1`
- **Intended mechanic:** When your thorns deal damage to attackers, you heal for that amount.
- **Chunk 4 approx wiring:**
  ```json
  {
    "outputBonusEffects (add)": "compound.blood_mirror.chance = 0.5",
    "compoundEffects": [
      {
        "condition": "on_taking_damage",
        "effect": { "kind": "heal", "amountPerTier": 6, "isPercent": false }
      }
    ]
  }
  ```
- **Fidelity loss:** Heal isn't actually proportional to thorn damage dealt — it's a flat per-tier amount on `on_taking_damage`. Functionally similar (every time you get hit and your thorns reflect, you also heal a bit).
- **Chunk 5 upgrade:** A passive heal-modifier that triggers off the actual thorns-damage-dealt event would be more faithful but requires the duel-engine to emit a `thorns_dealt` event. Defer to Chunk 6/7 if the modifier system supports heal hooks.

### fortress (signature)

- **Components:** `affix:flat_hp`, `affix:armor_rating`
- **Description:** Grants damage reduction while above 80% health on weapons; stacks massive armor and health bonuses on armor.
- **Recipe params:** `active=1, hpThreshold=0.8, damageReduction=0.15`
- **Intended mechanic:** While `currentHP/maxHP >= 0.8`, take 15% less damage.
- **Chunk 4 approx wiring:**
  ```json
  {
    "outputBonusEffects (add)": "compound.fortress.chance = 1.0",
    "compoundEffects": [
      {
        "condition": "on_taking_damage",
        "effect": {
          "kind": "gain_barrier",
          "amount": 0.05,
          "isPercent": true,
          "duration": 4
        }
      }
    ]
  }
  ```
- **Fidelity loss:** Approximates "while-high-HP DR" as a small barrier top-up on each hit, with no HP-threshold gate — so the bonus also fires when you're low HP (where it shouldn't). Not a great approximation; this entry is a strong candidate for the Chunk 5 fidelity pass.
- **Chunk 5 upgrade:** Add passive damage-taken modifier `{ multiplier: 0.85, condition: { kind: 'self_hp_above', fraction: 0.8 } }`. Real, conditional, no chance roll.

### thornfrost (signature)

- **Components:** `recipe:retribution_aura`, `affix:cold_damage`
- **Description:** Retaliation thorns gain cold damage and slow attackers who hit you.
- **Recipe params:** `active=1, slowOnThornHit=0.4, slowDuration=30, coldThornDamageBonus=0.5, chillStackChance=0.2`
- **Intended mechanic:** When attacked, the retaliation thorns also slow the attacker (40% slow, 30s) and add a cold DOT chance.
- **Chunk 4 approx wiring:**
  ```json
  {
    "outputBonusEffects (add)": "compound.thornfrost.chance = 0.40",
    "compoundEffects": [
      {
        "condition": "on_taking_damage",
        "effect": { "kind": "apply_slow", "multiplier": 1.4, "duration": 8 }
      },
      {
        "condition": "on_taking_damage",
        "effect": {
          "kind": "compound_dot",
          "element": "cold",
          "dpsPerTier": 2,
          "duration": 6,
          "tickInterval": 1,
          "dotMultiplier": 1.0
        }
      }
    ]
  }
  ```
- **Fidelity loss:** Slow duration approximated as 8s (vs intended 30s — too long for round combat). Cold-thorn-damage-bonus (+50% to thorns when cold) collapses into a separate DOT instead of buffing the existing thorns reflect.
- **Chunk 5 upgrade:** Passive damage modifier on the reflect_damage path: `{ thorns_multiplier: 1.50, element_added: 'cold' }`. Requires Chunk 5 to expose thorns as a modifiable damage flow.

### meltdown (signature3)

- **Components:** `affix:fire_damage`, `affix:cold_damage`, `affix:lightning_damage`
- **Description:** Three elements in chorus. Each elemental proc has a chance to trigger one of the other two.
- **Recipe params:** `active=1, crossElementChance=0.25, allElementBonus=0.15`
- **Intended mechanic:** Cross-element procs (when fire procs, 25% chance cold/lightning also procs) and overlapping-status damage bonus.
- **Chunk 4 approx wiring:**
  ```json
  {
    "outputBonusEffects (add)": "compound.meltdown.chance = 0.25",
    "compoundEffects": [
      {
        "condition": "on_hit",
        "effect": { "kind": "apply_dot", "element": "fire", "dpsPerTier": 2, "duration": 4 }
      },
      {
        "condition": "on_hit",
        "effect": { "kind": "apply_dot", "element": "cold", "dpsPerTier": 2, "duration": 4 }
      },
      {
        "condition": "on_hit",
        "effect": { "kind": "bonus_damage", "damageType": "lightning", "amountPerTier": 4 }
      }
    ]
  }
  ```
- **Fidelity loss:** Always rolls all three element bonuses on hit instead of "one element's proc triggers another." +15% all-element bonus is omitted from triggers (collapses into the flat per-tier values).
- **Chunk 5 upgrade:** Passive modifier `{ damageType: 'all_elemental', multiplier: 1.15, condition: { kind: 'target_has_multiple_dots', count: 2 } }`.

### worldfire (signature3)

- **Components:** `recipe:ignite`, `recipe:storm_of_flames`, `recipe:thermal_shock`
- **Description:** Ultimate fire capstone. Burns, cross-element procs, and thermal stuns unified. +50% fire damage globally; ignite spreads in 3-radius AoE; burning enemies have 20% chance to thermal-stun on each tick.
- **Recipe params:** `active=1, fireDamageBonus=0.5, igniteAoeRadius=3, thermalStunOnBurn=0.2`
- **Intended mechanic:** Capstone fire build amplifier. Stronger ignite + stun chance on burning targets.
- **Chunk 4 approx wiring:**
  ```json
  {
    "outputBonusEffects (add)": "compound.worldfire.chance = 0.30",
    "compoundEffects": [
      {
        "condition": "on_hit",
        "effect": {
          "kind": "compound_dot",
          "element": "fire",
          "dpsPerTier": 8,
          "duration": 8,
          "tickInterval": 1,
          "dotMultiplier": 2.0
        }
      },
      {
        "condition": "on_hit",
        "effect": { "kind": "stun", "duration": 1.0 }
      }
    ]
  }
  ```
- **Fidelity loss:** Global +50% fire damage bonus is not expressed (flat ignite-stronger effect partially covers it). Stun fires on every qualifying hit instead of "on burn-tick when target is burning." AoE radius is a no-op in single-target combat.
- **Chunk 5 upgrade:** Passive modifier `{ damageType: 'fire', multiplier: 1.50 }` (always-on while equipped). Stun should additionally gate on `target_has_dot_element: fire`.

---

## Group E — Bespoke (Chunk 6)

These three need new engine state that doesn't fit the trigger pipeline.

### flicker_strike (signature)

- **Components:** `affix:attack_speed`, `affix:crit_chance`
- **Description:** Guarantees automatic crits at high attack speed on weapons; auto-dodges enemy critical attacks on armor.
- **Recipe params:** `active=1, hitInterval=5, autoCrit=1`
- **Intended mechanic:** Every 5th hit (counted since last crit) is forced to be a crit.
- **Needs:** `hitsSinceCrit: number` counter on `GladiatorRuntime`. In duel-engine attack resolution, before computing `isCrit`, if counter >= threshold AND attacker has flicker_strike equipped, force `isCrit = true` and reset counter; else if computed crit, reset; else increment.
- **See:** Chunk 6 Task 6.1.

### sanguine_endurance (signature)

- **Components:** `affix:lifesteal`, `affix:flat_hp`
- **Description:** Allows lifesteal to overheal up to 120% max health creating permanent shields on weapons; increases health pool and heals from enemy damage on armor.
- **Recipe params:** `active=1, overhealCap=1.2`
- **Intended mechanic:** Lifesteal can push `currentHP` above `effectiveMaxHP` up to 1.2× max.
- **Needs:** Modify the heal-application path in `duel-engine.ts` to allow `currentHP > effectiveMaxHP` when attacker has sanguine_endurance equipped, capped at `effectiveMaxHP * 1.20`.
- **See:** Chunk 6 Task 6.2.

### blood_pact (signature3)

- **Components:** `affix:lifesteal`, `affix:hp_regen`, `affix:flat_hp`
- **Description:** Overheal permanently raises max HP for the round.
- **Recipe params:** `active=1, overhealToHpCap=0.2`
- **Intended mechanic:** Overheal (heal beyond max) converts 20% of the overflow into a temporary max-HP increase that lasts the round.
- **Needs:** Heal-application path: when heal would exceed `maxHP` and attacker has blood_pact equipped, increase `attacker.maxHP` by 20% of the overflow (cap at e.g. 1.5× base maxHP). Cleared at round end.
- **See:** Chunk 6 Task 6.3.

---

## Capstone dependency notes

`crystal_aegis` and `worldfire` reference other compounds as components but don't strictly *depend* on those parents being wired — they're independent recipe outputs with their own behaviors. Both are wired above (crystal_aegis in Group B, worldfire in Group D). The component recipes (`fortress`, `storm_of_flames`, `thermal_shock`) are also being wired in this same pass, so the layered behavior emerges naturally without ordering constraints.

---

## Open questions / classification uncertainty

- **regenerative_shield (Group B)** — could arguably be Group D since "regen heals barriers" isn't perfectly modeled by "barrier on damage taken." Kept in B because `gain_barrier` exists with the right semantics; the approximation is small.
- **iron_maiden (Group B)** — `reflect_damage` semantics may differ from "doubled thorns on block" if reflect doesn't read the equipped thorns value. Worth verifying during Chunk 4 wiring; may need to migrate to D if the multiplier doesn't apply on top of base thorns.
- **warriors_edge (Group B)** — "max 5 stacks" cap isn't enforceable in current `stat_buff_mul` infrastructure. Soft-capped via duration. If the buff stack semantics are additive (each new buff adds another +10% multiplicatively), behavior may overshoot the design intent at very high crit rate. Monitor in sim.
- **necrosis (Group D)** — `reduce_max_hp` is one-shot (not stacking). Real "permanent erosion" would need new state. Categorized as D rather than E because the duration-based abstraction is acceptable for round-length combat.
- **thornfrost (Group D)** — depends on `retribution_aura` being equipped/active per-recipe-component semantics. If retribution_aura isn't equipped alongside, the `compound_dot` cold + slow still fires standalone. Acceptable.
- **fortress (Group D)** — strongest candidate for Chunk 5 fidelity treatment. The Chunk 4 approximation is genuinely weak (no HP-threshold gate). Recommend Chunk 5 ship a real `self_hp_above` condition early to upgrade this one.
- **void_shock (Group D)** — the "ignores defenses" mechanic is meaningfully different from a normal shadow proc. If sim shows void_shock underperforming intent, escalate to Group E and add a `bypass_armor` flag.

---

## Appendix — Raw data dump

Output of the enumeration script (Step 1 of Task 2.1):

```
Total unwired: 21
--- thermal_shock (signature) ---
  components: affix:fire_damage, affix:cold_damage
  description: Stuns enemies briefly through rapid temperature changes on weapons; cancels out opposing elemental attacks on armor.
  params: active=1, stunDuration=15, dotBonus=0.25
  weaponEffect: [{"stat":"compound.thermal_shock.active","op":"flat","value":1},{"stat":"compound.thermal_shock.stunDuration","op":"flat","value":15},{"stat":"compound.thermal_shock.dotBonus","op":"flat","value":0.25}]
  armorEffect: [{"stat":"compound.thermal_shock.active","op":"flat","value":1},{"stat":"compound.thermal_shock.stunDuration","op":"flat","value":15},{"stat":"compound.thermal_shock.dotBonus","op":"flat","value":0.25}]

--- blight (signature) ---
  components: affix:fire_damage, affix:poison_damage
  description: Creates a fire-poison feedback loop that amplifies both elements on weapons; weakens enemy fire and poison synergies on armor.
  params: active=1, poisonBonusOnBurn=0.3, fireBonusOnPoison=0.2

--- storm_of_flames (signature) ---
  components: affix:fire_damage, affix:lightning_damage
  description: Chains lightning between enemies with each bounce applying fire on weapons; grounds and disperses fire and lightning attacks on armor.
  params: active=1, lightningOnFire=0.25, igniteOnLightning=0.25

--- superconductor (signature) ---
  components: affix:cold_damage, affix:lightning_damage
  description: Amplifies lightning damage against slowed enemies on weapons; slows incoming electricity through cold aura on armor.
  params: active=1, lightningBonusOnSlow=0.3, extendSlow=1

--- frostplague (signature) ---
  components: affix:cold_damage, affix:poison_damage
  description: Accelerates poison on slowed enemies for double weakness on weapons; weakens both poison and cold effects on armor.
  params: active=1, poisonSpeedOnSlow=0.5, extraSlowOnPoison=0.1

--- void_shock (signature) ---
  components: affix:lightning_damage, affix:shadow_damage
  description: Triggers shadow effects through lightning that ignore defenses on weapons; disperses lightning into shadow rifts on armor.
  params: active=1, shadowChanceOnLightning=0.2

--- necrosis (signature) ---
  components: affix:poison_damage, affix:shadow_damage
  description: Permanently erodes enemy max HP through stacking poison on weapons; negates enemy poison and shadow effects on armor.
  params: active=1, maxHpPerStack=0.005, poisonStacksOnShadow=2

--- blood_mirror (signature) ---
  components: affix:lifesteal, affix:thorns
  description: Converts thorns damage into health healing on weapons; feeds health from enemies hurt by your thorns aura on armor.
  params: active=1, healFromThorns=1

--- flicker_strike (signature) ---
  components: affix:attack_speed, affix:crit_chance
  description: Guarantees automatic crits at high attack speed on weapons; auto-dodges enemy critical attacks on armor.
  params: active=1, hitInterval=5, autoCrit=1

--- vampiric_fury (signature) ---
  components: affix:lifesteal, affix:crit_damage
  description: Heals 3x more from critical strikes on weapons; converts enemy crits into healing on armor.
  params: active=1, critLifestealMultiplier=3

--- iron_maiden (signature) ---
  components: affix:thorns, affix:block_chance
  description: Multiplies thorn damage output on blocks from weapons; triggers maximum thorns on every block from armor.
  params: active=1, blockReflectMultiplier=2

--- regenerative_shield (signature) ---
  components: affix:barrier, affix:hp_regen
  description: Heals shields through regeneration making barriers permanent on weapons; passively regenerates shields on armor.
  params: active=1, regenMultiplier=2

--- riposte (signature) ---
  components: affix:dodge_chance, affix:attack_speed
  description: Triggers automatic counterattacks on dodges from weapons; increases attack speed on each successful dodge on armor.
  params: active=1, attackSpeedOnDodge=0.5

--- fortress (signature) ---
  components: affix:flat_hp, affix:armor_rating
  description: Grants damage reduction while above 80% health on weapons; stacks massive armor and health bonuses on armor.
  params: active=1, hpThreshold=0.8, damageReduction=0.15

--- sanguine_endurance (signature) ---
  components: affix:lifesteal, affix:flat_hp
  description: Allows lifesteal to overheal up to 120% max health creating permanent shields on weapons; increases health pool and heals from enemy damage on armor.
  params: active=1, overhealCap=1.2

--- thornfrost (signature) ---
  components: recipe:retribution_aura, affix:cold_damage
  description: Retaliation thorns gain cold damage and slow attackers who hit you.
  params: active=1, slowOnThornHit=0.4, slowDuration=30, coldThornDamageBonus=0.5, chillStackChance=0.2

--- meltdown (signature3) ---
  components: affix:fire_damage, affix:cold_damage, affix:lightning_damage
  description: Three elements in chorus. Each elemental proc has a chance to trigger one of the other two.
  params: active=1, crossElementChance=0.25, allElementBonus=0.15

--- warriors_edge (signature3) ---
  components: affix:crit_chance, affix:crit_damage, affix:attack_speed
  description: Crits stack attack speed; a sustained DPS spiral.
  params: active=1, critAttackSpeedStack=0.1, maxStacks=5

--- blood_pact (signature3) ---
  components: affix:lifesteal, affix:hp_regen, affix:flat_hp
  description: Overheal permanently raises max HP for the round.
  params: active=1, overhealToHpCap=0.2

--- crystal_aegis (signature3) ---
  components: recipe:frostbite, recipe:fortress, affix:cold_damage
  description: Fortress (<80% HP) also applies AoE chill; attackers slow while you hold.
  params: active=1, chillOnFortress=0.3, auraRadius=3

--- worldfire (signature3) ---
  components: recipe:ignite, recipe:storm_of_flames, recipe:thermal_shock
  description: Ultimate fire capstone. Burns, cross-element procs, and thermal stuns unified.
  params: active=1, fireDamageBonus=0.5, igniteAoeRadius=3, thermalStunOnBurn=0.2
```

### Engine cross-check

`packages/engine/src/forge/stat-calculator.ts` line 46:

```ts
if (key.startsWith('compound.')) return true;  // skip — duel-engine consumes compound.* via outputBonusEffects
```

Confirms that all `compound.<id>.<key>` entries in `combinations.json` weaponEffect/armorEffect arrays are silently dropped by the stat calculator. They contribute nothing until `compoundEffects` blueprints are added on the corresponding recipe entries.
