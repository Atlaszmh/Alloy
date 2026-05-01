/**
 * Friendly labels for engine stat keys, primarily for the compound metadata
 * keys that appear in recipes.json's outputBonusEffects (now legacy — the
 * mechanics live in compoundEffects, but inspect panels still surface these).
 *
 * For unmapped keys, fall back to the raw key so nothing breaks silently.
 */
export const STAT_KEY_LABELS: Record<string, string> = {
  // Ignite
  'compound.ignite.absorbChance': 'Incoming fire absorption chance',
  'compound.ignite.chance': 'Trigger chance',

  // Concussion
  'compound.concussion.chance': 'Trigger chance',
  'compound.concussion.durationMultiplier': 'Stun duration multiplier',
  'compound.concussion.stunAttacker': 'Self-stun on proc (legacy)',
  'compound.concussion.stunAttackerDuration': 'Self-stun duration (legacy)',

  // Combustion
  'compound.combustion.chance': 'Trigger chance',
  'compound.combustion.aoeRadius': 'AoE radius (legacy)',

  // Bastion / capstones
  'compound.bastion.active': 'Capstone active',
  'compound.bastion.chance': 'Trigger chance',
  'compound.detonator.active': 'Capstone active',
  'compound.detonator.chance': 'Trigger chance',
  'compound.frost_nova.active': 'Capstone active',
  'compound.frost_nova.chance': 'Trigger chance',
  'compound.oathbound_fury.active': 'Capstone active',
  'compound.oathbound_fury.chance': 'Trigger chance',
  'compound.phoenix_embers.active': 'Capstone active',
  'compound.phoenix_embers.chance': 'Trigger chance',
  'compound.plague_carrier.active': 'Capstone active',
  'compound.plague_carrier.chance': 'Trigger chance',
  'compound.thunderbrand.active': 'Capstone active',
  'compound.thunderbrand.chance': 'Trigger chance',

  // Immolation
  'compound.immolation.aoeDamage': 'AoE damage (legacy)',
  'compound.immolation.chance': 'Trigger chance',

  // Generic trigger-chance compounds
  'compound.envenom.chance': 'Trigger chance',
  'compound.frostbite.chance': 'Trigger chance',
  'compound.reactive_shield.chance': 'Trigger chance',
  'compound.retribution_aura.chance': 'Trigger chance',
  'compound.shield_bash.chance': 'Trigger chance',
  'compound.soul_eclipse.chance': 'Trigger chance',
  'compound.soul_rend.chance': 'Trigger chance',
  'compound.soul_siphon.chance': 'Trigger chance',
  'compound.static_discharge.chance': 'Trigger chance',
  'compound.counter_strike.chance': 'Trigger chance',

  // Blight (poison + fire crossover)
  'compound.blight.active': 'Capstone active',
  'compound.blight.fireBonusOnPoison': 'Fire damage bonus vs poisoned',
  'compound.blight.poisonBonusOnBurn': 'Poison damage bonus vs burning',

  // Blood Frenzy / Blood Mirror / Blood Pact
  'compound.blood_frenzy.chance': 'Trigger chance',
  'compound.blood_frenzy.hpThreshold': 'HP threshold',
  'compound.blood_mirror.active': 'Capstone active',
  'compound.blood_mirror.healFromThorns': 'Heal share from thorns',
  'compound.blood_pact.active': 'Capstone active',
  'compound.blood_pact.overhealToHpCap': 'Overheal-to-max-HP cap',

  // Crystal Aegis
  'compound.crystal_aegis.active': 'Capstone active',
  'compound.crystal_aegis.auraRadius': 'Aura radius',
  'compound.crystal_aegis.chillOnFortress': 'Chill on fortress proc',

  // Desperation
  'compound.desperation.chance': 'Trigger chance',
  'compound.desperation.hpThreshold': 'HP threshold',

  // Flicker Strike
  'compound.flicker_strike.active': 'Capstone active',
  'compound.flicker_strike.autoCrit': 'Auto-crit on flicker',
  'compound.flicker_strike.hitInterval': 'Hit interval',

  // Fortress
  'compound.fortress.active': 'Capstone active',
  'compound.fortress.damageReduction': 'Damage reduction',
  'compound.fortress.hpThreshold': 'HP threshold',

  // Frostplague
  'compound.frostplague.active': 'Capstone active',
  'compound.frostplague.extraSlowOnPoison': 'Extra slow vs poisoned',
  'compound.frostplague.poisonSpeedOnSlow': 'Poison tick speed vs slowed',

  // Iron Maiden
  'compound.iron_maiden.active': 'Capstone active',
  'compound.iron_maiden.blockReflectMultiplier': 'Block reflect multiplier',

  // Meltdown
  'compound.meltdown.active': 'Capstone active',
  'compound.meltdown.allElementBonus': 'All-element damage bonus',
  'compound.meltdown.crossElementChance': 'Cross-element proc chance',

  // Necrosis
  'compound.necrosis.active': 'Capstone active',
  'compound.necrosis.maxHpPerStack': 'Max HP per stack',
  'compound.necrosis.poisonStacksOnShadow': 'Poison stacks on shadow hit',

  // Regenerative Shield
  'compound.regenerative_shield.active': 'Capstone active',
  'compound.regenerative_shield.regenMultiplier': 'Regen multiplier',

  // Riposte
  'compound.riposte.active': 'Capstone active',
  'compound.riposte.attackSpeedOnDodge': 'Attack speed on dodge',

  // Sanguine Endurance
  'compound.sanguine_endurance.active': 'Capstone active',
  'compound.sanguine_endurance.overhealCap': 'Overheal cap',

  // Soul Eclipse (capstone fields)
  'compound.soul_eclipse.active': 'Capstone active',

  // Storm of Flames
  'compound.storm_of_flames.active': 'Capstone active',
  'compound.storm_of_flames.igniteOnLightning': 'Ignite on lightning hit',
  'compound.storm_of_flames.lightningOnFire': 'Lightning on fire hit',

  // Superconductor
  'compound.superconductor.active': 'Capstone active',
  'compound.superconductor.extendSlow': 'Slow duration extension',
  'compound.superconductor.lightningBonusOnSlow': 'Lightning damage vs slowed',

  // Thermal Shock
  'compound.thermal_shock.active': 'Capstone active',
  'compound.thermal_shock.dotBonus': 'DoT damage bonus',
  'compound.thermal_shock.stunDuration': 'Stun duration',

  // Thornfrost
  'compound.thornfrost.active': 'Capstone active',
  'compound.thornfrost.chillStackChance': 'Chill stack chance',
  'compound.thornfrost.coldThornDamageBonus': 'Cold thorn damage bonus',
  'compound.thornfrost.slowDuration': 'Slow duration',
  'compound.thornfrost.slowOnThornHit': 'Slow on thorn hit',

  // Vampiric Fury
  'compound.vampiric_fury.active': 'Capstone active',
  'compound.vampiric_fury.critLifestealMultiplier': 'Crit lifesteal multiplier',

  // Void Shock
  'compound.void_shock.active': 'Capstone active',
  'compound.void_shock.shadowChanceOnLightning': 'Shadow chance on lightning hit',

  // Warrior's Edge
  'compound.warriors_edge.active': 'Capstone active',
  'compound.warriors_edge.critAttackSpeedStack': 'Attack speed per crit stack',
  'compound.warriors_edge.maxStacks': 'Max stacks',

  // Worldfire
  'compound.worldfire.active': 'Capstone active',
  'compound.worldfire.fireDamageBonus': 'Fire damage bonus',
  'compound.worldfire.igniteAoeRadius': 'Ignite AoE radius',
  'compound.worldfire.thermalStunOnBurn': 'Thermal stun on burning targets',
};

/**
 * Look up a friendly label for a stat key. For unmapped `compound.<id>.chance`
 * keys, infer "Trigger chance" generically. For unmapped `compound.<id>.active`
 * keys, infer "Capstone active" generically. For everything else, fall back to
 * the raw key so display doesn't fail silently.
 */
export function statKeyLabel(key: string): string {
  if (STAT_KEY_LABELS[key]) return STAT_KEY_LABELS[key];
  if (/^compound\.[a-z_]+\.chance$/.test(key)) return 'Trigger chance';
  if (/^compound\.[a-z_]+\.active$/.test(key)) return 'Capstone active';
  return key;
}
