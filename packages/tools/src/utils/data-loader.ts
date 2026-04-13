import { loadAndValidateData } from '@alloy/engine'
import { Affix, Recipe, Synergy } from '../store/types'

interface LoadedData {
  affixes: Affix[]
  recipes: Recipe[]
  synergies: Synergy[]
}

/**
 * Map engine category to tool rarity (simplified mapping)
 */
function getCategoryRarity(category: string): Affix['rarity'] {
  const rarityMap: Record<string, Affix['rarity']> = {
    offensive: 'common',
    defensive: 'rare',
    sustain: 'unique',
    utility: 'exotic',
    trigger: 'exotic',
  }
  return rarityMap[category] || 'common'
}

/**
 * Get icon based on category
 */
function getCategoryIcon(category: string): string {
  const iconMap: Record<string, string> = {
    offensive: '⚔️',
    defensive: '🛡️',
    sustain: '💚',
    utility: '✨',
    trigger: '⚡',
  }
  return iconMap[category] || '💎'
}

/**
 * Generate flavorful description for base affixes
 */
function generateBaseAffixDescription(id: string, name: string, category: string): string {
  const descriptions: Record<string, string> = {
    flat_physical: `⚔️ **WEAPON**: Pure brute force without apology. Your blade becomes heavier, sharper, more devastating. This is the foundation—damage in its most honest form.\n\n🛡️ **ARMOR**: You're built different. Denser muscle, thicker bone, heavier frame. Taking hits becomes a matter of sheer physical mass. Enemies swing, you absorb, they regret.`,

    fire_damage: `🔥 **WEAPON**: Adds flat fire elemental damage to every strike. No burning, no DoT, no secondary effect—just raw heat applied directly to whoever you're hitting. The burn fantasy lives in the *Ignite* compound. This is the foundation.\n\n🔥 **ARMOR**: Adds fire resistance. Enemy fire spells and flame attacks deal less damage. You don't become fireproof, but you stop being kindling.`,

    cold_damage: `❄️ **WEAPON**: Adds flat cold elemental damage to every attack. No slow, no freeze on its own—just biting cold damage. The slowing fantasy lives in the *Frostbite* compound. This is the ingredient, not the meal.\n\n❄️ **ARMOR**: Adds cold resistance. Enemies wielding frost magic will find their spells hitting softer. You're not immune—you're just harder to ice.`,

    lightning_damage: `⚡ **WEAPON**: Adds flat lightning elemental damage to every attack. Higher per-hit values than fire or cold, no secondary effect on its own. Chain lightning is *Static Discharge*'s job—this gem just hits hard and fast.\n\n⚡ **ARMOR**: Adds lightning resistance. Enemy electrical attacks lose potency. Their arc spells still crackle impressively. They just don't hurt as much.`,

    poison_damage: `☠️ **WEAPON**: DoT that *stacks*—multiple poison wounds interact exponentially. Each additional poison amplifies all previous poisons. Layering poison is your game.\n\n☠️ **ARMOR**: Your defenses are coated in counter-toxins. Enemies who damage you get poisoned in return by *their own attack*. They're self-poisoning against you.`,

    shadow_damage: `🌑 **WEAPON**: Damage scaled on *enemy current health*—full health enemies take maximum damage, low health take minimum. You're executing, not farming damage.\n\n🌑 **ARMOR**: Shadows confuse incoming attacks and make them less likely to land. Enemy accuracy drops around you. Their perception is unreliable.`,

    chaos_damage: `🌀 **WEAPON**: Highly variable damage with unpredictable scaling. Each strike's power is different—impossible to predict or prepare for. Your damage is chaotic by design.\n\n🌀 **ARMOR**: Your defenses shift unpredictably. Incoming attacks hit *something different each time*. Enemies can't learn your patterns because you don't have one.`,

    crit_chance: `🎯 **WEAPON**: Your strikes find weak points with supernatural accuracy. Every blow is searching for that perfect angle, that critical vulnerability. You're never wasting energy on inefficient attacks.\n\n⚔️ **ARMOR**: Your defensive positioning is surgical. You know exactly where incoming attacks are coming from before they arrive. You're not standing in front of the sword—you're standing beside it.`,

    crit_damage: `💥 **WEAPON**: When you *do* land a critical strike, it explodes with devastating force. Your critical hits don't just hurt—they *devastate*. Massive multiplier on already dangerous blows.\n\n🌊 **ARMOR**: Your defensive stance converts attack momentum into counterforce. Enemies who hit you experience backlash proportional to their commit. Critical hits against you cause them massive recoil damage.`,

    attack_speed: `⚙️ **WEAPON**: Your movements blur with supernatural speed. You swing faster, strike more often, attack before enemies can react. By the time they perceive the danger, you've already hit them twice.\n\n🏃 **ARMOR**: You move with impossible grace and speed. Incoming attacks meet empty space. You're already somewhere else when the blow arrives. Speed is your ultimate defense.`,

    armor_rating: `⚠️ **WEAPON**: No weapon enchantment. This gem does nothing socketed in a weapon—all its power is armor-side only.\n\n🏰 **ARMOR**: Reduces incoming physical damage as a flat percentage. Enemies swing. You shrug. The number goes down. That's the whole thing, and it's perfectly effective.`,

    armor_penetration: `⚔️ **WEAPON**: Your attacks shred through enemy defenses like paper. Their armor, shields, resistances—all irrelevant. You hit them *through* their protections. Defenses become meaningless.\n\n🎭 **ARMOR**: Enemy armor becomes a liability. The stronger their defenses, the harder you punish them for trying. Their protection collapses when you're near. They built that fortress and you're the siege engine.`,

    elemental_penetration: `🔥❄️⚡ **WEAPON**: Bypasses elemental resistances with surgical precision. Fire-resistant? Irrelevant. They burn anyway. You ignore their resistances entirely—magic protections simply don't apply.\n\n🌈 **ARMOR**: Your resistances punch through enemy magical protections. You're resistant to fire AND you resist their fire-resistance buffs. Double-negating enemy magical advantages.`,

    flat_hp: `❤️ **WEAPON**: A larger health pool means you can sustain longer fights and deal more cumulative damage. You're built for *marathons*, not sprints.\n\n💪 **ARMOR**: Raw maximum health. More hit points = enemies have to hit you more times to win. It's straightforward—you absorb punishment through sheer capacity.`,

    hp_regen: `🌿 **WEAPON**: Passive health recovery ticks constantly, keeping you in combat longer. The fight duration is your advantage—eventually, their damage output can't out-pace your healing.\n\n💚 **ARMOR**: Constant passive regeneration that ticks even while standing still. You repair damage automatically. Long wars are won through attrition.`,

    lifesteal: `🩸 **WEAPON**: Every point of damage you deal instantly becomes health restored. High damage = high healing. You're a vampire—combat sustains you.\n\n🧛 **ARMOR**: Enemy attacks feed you. They damage you, they heal you. Extended melee becomes unwinnable for them because they're healing their opponent.`,

    life_on_kill: `💀 **WEAPON**: Finishing blows restore massive health in one burst. Kills = instant full heal. You're incentivized to go for executions, not just wear enemies down.\n\n👻 **ARMOR**: Dead enemies nearby transfer remaining health to you. The battlefield becomes a corpse-powered healing field. Multi-kill scenarios become impossible to stop.`,

    barrier: `🔰 **WEAPON**: Successful strikes generate temporary shield layers that absorb *overflow* damage. You're building protection as you attack.\n\n🛡️ **ARMOR**: Temporary shields that regenerate regularly. Incoming damage hits shields first, health second. You're perpetually overshield.`,

    fortify: `⚒️ **WEAPON**: After attacking, you become magically hardened, reducing your *own* incoming damage. Offense makes you defensively stronger.\n\n🗻 **ARMOR**: Permanent magical armor enhancement. Your basic durability is increased at all times. Attacks just bounce off more often naturally.`,

    damage_reduction: `⛔ **WEAPON**: Flat damage reduction on enemies you're striking. The harder you hit them, the weaker their attacks become. Your offense weakens their capability to respond.\n\n🔐 **ARMOR**: Hard cap on incoming damage. Every hit deals X less damage, period. Simple math—enemies face a ceiling on how much they can possibly hurt you. No matter how strong they are.`,

    dodge_chance: `👻 **WEAPON**: Your attacks might miss the enemy entirely, destabilizing their defenses and creating openings. You're not always where they think you are.\n\n💨 **ARMOR**: You're not there when the attack lands. Probability warps around you—incoming strikes just... whiff. You're a ghost until you need to be solid.`,

    block_chance: `🚪 **WEAPON**: Your strikes can physically parry and redirect incoming danger, turning defense into counterattack. You're not dodging—you're hitting back.\n\n🧱 **ARMOR**: You actively block attacks with physical barriers, negating damage entirely. Blocks are complete protection—incoming damage just stops at your shield.`,

    chance_on_hit: `⚡ **WEAPON**: Passive magical blessing on every attack. The more you swing, the more procs you generate. Raw hit count = magic generation.\n\n🎲 **ARMOR**: Combat proximity triggers passive defensive magic. Just standing near attackers activates your safeguards. Your aura defends you.`,

    chance_on_crit: `💥 **WEAPON**: Procs bonus damage on critical strikes—smaller amounts than the armor version, but attached to your strongest hits. Crit-heavy builds double-dip: more crits = more procs.\n\n⚡ **ARMOR**: Procs bonus damage when enemies crit you—and at higher values than the weapon version. Enemies landing their biggest hits are accidentally triggering your counterattack. Their risk is your reward.`,

    chance_on_block: `🛡️ **WEAPON**: Successfully blocking doesn't just stop damage—it triggers offensive magic. Defense becomes your offense vector.\n\n⚔️ **ARMOR**: Every successful block automatically activates magical effects. Blocking is now your most dangerous action, not your most defensive one.`,

    chance_on_kill: `💀 **WEAPON**: Finishing blows trigger jackpot effects beyond just winning. Kill count = magic generation. Massacre = power surge.\n\n🔄 **ARMOR**: Enemies dying near you feed your defenses. The battlefield sustains you. Dead enemies become your shield.`,

    chance_on_taking_damage: `🤕 **WEAPON**: Pain fuels your retaliation. Every hit you take triggers counteroffense. You get stronger the more you bleed.\n\n🔥 **ARMOR**: Damage taken activates defenses that strengthen you. Taking punishment makes you tougher. Enemies literally power your defenses by attacking you.`,

    chance_on_low_hp: `⚠️ **WEAPON**: Desperation unlocks power. When you're near death, special effects activate. Low HP = high damage multiplier.\n\n💎 **ARMOR**: When close to death, defenses surge. The more desperate you are, the harder you are to kill. You're practically invulnerable at 1 HP.`,

    slow_on_hit: `🐌 **WEAPON**: Your strikes sap enemy *momentum*. Movement speed drops dramatically with each hit. Chasers become statues. Fleers can't escape. Movement becomes impossible.\n\n⛓️ **ARMOR**: Attackers slow down after hitting you. Their combat momentum dies. They become sluggish against you. Time becomes your ally.`,

    stun_chance: `⭐ **WEAPON**: Chance to interrupt and disable enemies entirely. Stunned enemies can't act, can't dodge, can't retaliate. Complete control.\n\n🔄 **ARMOR**: When enemies attack, they have a chance to stun themselves. Their own aggression backfires. Their attack fails and they stand helpless.`,

    dot_multiplier: `🔗 **WEAPON**: All damage-over-time effects you apply are *amplified*. More damage per tick, longer duration, stacking higher. Persistent damage becomes your primary damage source.\n\n🛡️ **ARMOR**: DoT effects targeting you are *reduced*. Poison loses potency. Fire burns less hot. Bleed ticks lighter. Persistent damage is your weakness mitigated.`,

    initiative: `⚡ **WEAPON**: You act *first* in combat sequences. You get the first strike before enemies can react. Speed advantage = strategic advantage.\n\n👁️ **ARMOR**: You perceive incoming threats *before they land*. You're already moving to defend before the attack even commits. Reaction time is supernatural.`,

    thorns: `🌹 **WEAPON**: Your attacks are jagged and dangerous. Enemies hurt themselves trying to touch you. Self-defense through sharp edges.\n\n🌵 **ARMOR**: Your armor is covered in enchanted spikes. Enemy melee becomes hazardous. They're attacking a cactus. It doesn't end well for them.`,
  }

  return descriptions[id] || `A mysterious affix that does... something. The mechanics scroll off the bottom of the description before explaining it. Probably magic.`
}

/**
 * Generate description for compound affix based on components
 */
function generateCompoundDescription(id: string, name: string, componentIds: string[], affixes: any[]): string {
  const componentNames = componentIds
    .map((cId) => affixes.find((a) => a.id === cId)?.name || cId)
    .join(' + ')

  const descriptions: Record<string, string> = {
    ignite: `"Well, well... someone's feeling toasty." Weaves ${componentNames} into pyroclastic devastation.\n\n🔥 **WEAPON - EXPONENTIAL BURN**: Each attack stacks independent ignite effects. 1 ignite? Persistent damage. 2 ignites? They amplify each other. 3? It's exponential. The longer you keep hitting the same target, the more the burns cascade. Eventually, the fire becomes self-sustaining and they just... burn.\n\n🧯 **ARMOR - HEAT SINK**: Enemy fire magic doesn't hurt you—it fuels you. Incoming fire damage is absorbed and converted into passive defensive shields. Standing in the flames makes you stronger. They burn, you get tougher. It's backwards.`,

    frostbite: `"Ice to meet you. Literally." Combines ${componentNames} into an arctic prison.\n\n❄️ **WEAPON - FREEZING ESCALATION**: Every strike applies frost that slows enemy movement drastically. Stack enough frost and enemies become nearly immobilized. While frozen, they take increased damage from *all* sources—you're setting them up for execution. The cold is a debilitating status, not just damage.\n\n🔥 **ARMOR - COUNTER CHILL**: When enemies attack you, temporary frost shields form that reflect cold back at the attacker. You don't absorb heat—you *create* it to push back damage. The contrast between your armor's extreme cold and their heat creates defensive shockwaves.`,

    static_discharge: `"Let there be lightning. Lots of it." Braids ${componentNames} into a triggered electrical multiplier.\n\n⚡ **WEAPON - CHAIN DAMAGE**: On proc, your strike deals 50% chain damage that carries to a secondary target. It's a bonus hit, not a bounce—one extra enemy takes a portion of your original damage. Pairs brutally with high base lightning hits.\n\n📡 **ARMOR - AOE BURST**: On proc, releases an area damage burst around you. Standing in the middle of a group? Everyone near you takes the hit. It's not targeted—it just detonates.`,

    envenom: `"One poison. Two poison. Red poison. Blue poison." Distills ${componentNames} into toxin synergy.\n\n☠️ **WEAPON - POISON INTERACTION**: Each poison stack increases the damage of *all other* poison stacks. One poison is a trickle. Two is a leak. Five is a cascade. You're incentivized to layer poisons on the same target repeatedly. They die to the exponential growth, not the initial hit.\n\n🫀 **ARMOR - REVERSE INFECTION**: Your blood is laced with counter-toxins. Enemies who damage you get infected with their own poisons reflected back. It's not resistance—it's weaponization. They poison themselves through contact with you.`,

    soul_rend: `"Rip. Tear. Claim." Merges ${componentNames} into eldritch execution magic.\n\n💀 **WEAPON - CURRENT HP SCALING**: Your attacks rip into enemies based on *how much life they currently have*—full health enemies take catastrophic damage, but at low health they take less. This incentivizes finishing blows hard. The secondary effect: permanently reduces enemy maximum HP. You're not just damaging them—you're permanently crippling them.\n\n🪦 **ARMOR - DRAINING AEGIS**: When enemies attack you, their maximum health is siphoned into your reserves. Long fights mean you accumulate their power while they lose it. You're literally draining enemy health bars through their assault attempts. Enemies get progressively weaker, you get progressively stronger.`,

    soul_siphon: `"Feed. Heal. Repeat." Fuses ${componentNames} into vampire logic.\n\n🩸 **WEAPON - INSTANT LIFE CONVERSION**: Every point of damage you deal instantly becomes health restored. Hit harder = heal harder. Single strong enemy? You're unkillable because each blow sustains you. Group of enemies? You're healing multiple times per second from every strike. Combat duration is no longer a concern.\n\n🧛 **ARMOR - PASSIVE CONSUMPTION**: Standing there and getting attacked heals you. Enemies literally feed you. The longer they attack, the healthier you get. It's not even a proc—it's automatic. Every wound they inflict on you is a mistake that heals your wounds instead.`,

    concussion: `"Concussive impact. Brain rattling. Consciousness departing." Smashes ${componentNames} into disabling force.\n\n🥊 **WEAPON - INTERRUPT MACHINE**: Your attacks stun targets, interrupting their abilities, their attacks, their plans. They can't dodge while stunned. They can't counterattack. Their power doesn't matter if they can't use it. Rapid hits chain stuns—enemies become helpless punching bags.\n\n🧠 **ARMOR - CC NEGATION**: Crowd control effects aimed at you simply don't land. Stun attempts fail. Slow effects fizzle. Disable magic bounces off. You're immune to "control" at a mechanical level. Enemies can't lock you down.`,

    retribution_aura: `"Your suffering becomes their reckoning." Melds ${componentNames} into reactive punishment.\n\n💢 **WEAPON - PAIN ECHO**: When you take damage, you automatically retaliate with thorns that multiply your counterattack. Getting hurt fuels your offense. Every wound inflicted on you creates a wave of thorns back at the attacker.\n\n⚡ **ARMOR - AURA AMPLIFICATION**: Your thorns aura activates when enemies attack you, dealing reflective damage that scales up. The more sustained the assault, the more damage they're taking from your aura alone. Attacking you becomes a war of attrition you're winning.`,

    immolation: `"Burning from the inside out." Blends ${componentNames} into explosive reaction.\n\n🔥 **WEAPON - DAMAGE EXPLOSION**: Getting hit triggers an area-of-effect fire explosion. Every damage instance you take becomes a damage instance you deal to nearby enemies. It's damage redistribution—you're spreading the pain.\n\n🌪️ **ARMOR - RETALIATORY INFERNO**: Taking damage creates a firestorm around you. Enemies who hurt you hurt everything near them. You're a walking bomb—every hit against you is a mistake that damages their allies.`,

    reactive_shield: `"Defense is the best offense." Bonds ${componentNames} into reactive barriers.\n\n🛡️ **WEAPON - SHIELD GENERATION**: Taking damage generates temporary shields that absorb overflow. You're converting incoming damage into outgoing protection.\n\n🔰 **ARMOR - BARRIER AMPLIFICATION**: Every hit you take spawns protective barriers. Getting attacked makes you harder to kill. Sustained assault activates your defenses until enemies run out of time.`,

    counter_strike: `"Block and strike." Weaves ${componentNames} into perfect parrying.\n\n⚔️ **WEAPON - COUNTER OFFENSE**: Successfully blocking an attack triggers an automatic counterattack. Defense becomes instant retaliation. Every block is a free attack.\n\n🔄 **ARMOR - REFLECTIVE BLOCK**: Blocks don't just prevent damage—they activate thorn effects that hurt the attacker. Your defense is actively damaging them.`,

    shield_bash: `"Defense is an action." Fuses ${componentNames} into defensive interruption.\n\n🛡️ **WEAPON - BLOCK STUN**: When you successfully block, the attacker gets stunned. Your defense disables their offense. \n\n⭐ **ARMOR - REACTIVE STUN**: Enemies attacking you have a chance to stun themselves from the impact of your armor. Your defense is so solid it backfires on them.`,

    blood_frenzy: `"The hunt activates at low tide." Merges ${componentNames} into desperation offense.\n\n🩸 **WEAPON - THRESHOLD OVERLOAD**: When health drops below 30%, lifesteal gets amplified massively. Low health = high healing. You become a vampire when desperate, healing more per strike than you're taking damage.\n\n🧛 **ARMOR - DESPERATE SUSTAIN**: Low health triggers massive healing boosts. You're hardest to kill when you should be dead. Enemies can never quite finish you.`,

    desperation: `"Need drives power." Combines ${componentNames} into speed surge.\n\n⚡ **WEAPON - ADRENALINE SURGE**: When health drops below 30%, attack speed doubles. Desperation makes you FAST. One activation per fight—use it wisely.\n\n💨 **ARMOR - SPEED DODGE**: Low health makes you move faster, dodging more attacks. Enemies can't hit what's moving at double speed.`,

    thermal_shock: `"Extremes collide." Merges ${componentNames} into temperature chaos.\n\n❄️🔥 **WEAPON - OPPOSING BURN**: Fire and cold damage interact—rapid temperature changes stun enemies briefly. Burning + freezing = disorientation.\n\n⚡ **ARMOR - TEMPERATURE BUFFER**: Fire and cold attacks cancel each other out. You're defended by elemental opposition.`,

    blight: `"Decay accelerates." Combines ${componentNames} into compounding rot.\n\n☠️ **WEAPON - SYNERGISTIC TOXIN**: Fire boosts poison damage, poison boosts fire damage. Stack them together and they amplify each other exponentially. Fire + poison become a feedback loop of devastation.\n\n🧪 **ARMOR - DECAY PROTECTION**: Enemy fire and poison effects are weakened and interact poorly. Their elemental combinations fall apart against you.`,

    storm_of_flames: `"Inferno and lightning merge." Weaves ${componentNames} into elemental chain.\n\n⚡🔥 **WEAPON - CHAIN IGNITE**: Lightning bounces between enemies, and each bounce applies fire. Chaining enemies means cascading fire. Multi-target becomes super-effective.\n\n🌪️ **ARMOR - STORM SHIELD**: Fire and lightning attacks get grounded and dispersed. You're protected by both elements working against incoming damage.`,

    superconductor: `"Frozen electricity." Binds ${componentNames} into conductive cold.\n\n❄️⚡ **WEAPON - SLOW AMPLIFIED**: Lightning damage gets amplified when enemies are slowed. Cold + lightning = exponential damage. Freeze them, then zap them harder.\n\n🧊 **ARMOR - COLD CONDUCTION**: Lightning trying to zap you gets slowed by your cold aura. Electricity moves through molasses around you.`,

    frostplague: `"Ice carries infection." Merges ${componentNames} into plague freeze.\n\n☠️❄️ **WEAPON - POISON ACCELERATION**: Poison damage speeds up when enemies are slowed. Slow poison victims and their toxins work faster. Double weakness.\n\n🫀 **ARMOR - PLAGUE RESISTANCE**: Poison and cold effects are weakened together. You're resistant to both.`,

    void_shock: `"The void strikes." Blends ${componentNames} into eldritch disruption.\n\n🌑⚡ **WEAPON - SHADOW CHAIN**: Lightning triggers shadow effects that ignore enemy defenses. Electricity becomes existential threat.\n\n👁️ **ARMOR - VOID CONFUSE**: Lightning attacks get pulled into shadow rifts and dispersed. Enemies can't locate where you are.`,

    necrosis: `"Death compounds." Fuses ${componentNames} into exponential decay.\n\n💀☠️ **WEAPON - MAX HP EROSION**: Poison stacks cause permanent maximum health reduction. Enemies get permanently weaker as poison builds up. Their full health bar shrinks.\n\n🪦 **ARMOR - DEATH WARD**: Enemy poison and shadow effects are negated. Death magic bounces off you.`,

    blood_mirror: `"Blood reflects blood." Weaves ${componentNames} into mirror defense.\n\n🩸 **WEAPON - LIFESTEAL REFLECTION**: Thorns damage is converted to health healing. Your defensive thorns heal you. Defense becomes sustain.\n\n💪 **ARMOR - MIRROR REFLECTION**: Enemies hurt by your thorns aura feed you health. Attacking you makes you stronger.`,

    flicker_strike: `"Blur and crit." Braids ${componentNames} into precision blurs.\n\n⚡💥 **WEAPON - AUTO CRIT CHAIN**: At attack speeds fast enough, you automatically crit every 5th hit. Speed unlocks guaranteed critical strikes.\n\n🎯 **ARMOR - DODGE CRIT**: Every critical attack against you is automatically dodged. Enemies' risky plays fail.`,

    vampiric_fury: `"Crits feed hunger." Merges ${componentNames} into critical sustain.\n\n💥🩸 **WEAPON - CRIT LIFESTEAL TRIPLE**: Critical strikes heal you 3x more than normal hits. Crits become your heal mechanic. Maximize crits, maximize healing.\n\n🧛 **ARMOR - CRIT DEFENSE**: Critical hits against you trigger healing instead of damage. Enemies feeding you through risky crits.`,

    iron_maiden: `"Thorns defend all." Combines ${componentNames} into absolute reflection.\n\n🌹 **WEAPON - BLOCK THORNS**: Blocks multiply thorn damage output. Defensive blocking becomes offensive.\n\n🫀 **ARMOR - ABSOLUTE THORNS**: Every block triggers maximum thorns. Your defense is a porcupine they keep hitting.`,

    regenerative_shield: `"Shields sustain shields." Binds ${componentNames} into eternal barriers.\n\n🛡️ **WEAPON - REGEN SHIELDS**: Shields generated are also healed by your regeneration. Barriers become permanent.\n\n💚 **ARMOR - ETERNAL BARRIER**: Your shields regenerate passively. You're perpetually overshield.`,

    riposte: `"Dodge and counter." Fuses ${componentNames} into evasive strike.\n\n👻 **WEAPON - DODGE ATTACK**: Dodging attacks triggers automatic counterattacks. Evasion becomes offense.\n\n⚡ **ARMOR - DODGE SPEED**: Every dodge you pull off increases your attack speed temporarily. Avoiding damage makes you faster.`,

    fortress: `"Unbreakable walls." Merges ${componentNames} into enduring defense.\n\n🏰 **WEAPON - HP THRESHOLD ARMOR**: While above 80% health, you gain damage reduction. Stay healthy, stay harder to kill.\n\n🗻 **ARMOR - FORTRESS MODE**: Massive armor and health bonuses stack. You're a literal castle.`,

    sanguine_endurance: `"Blood sustains all." Weaves ${componentNames} into life abundance.\n\n🩸 **WEAPON - OVERHEAL CAP**: Lifesteal can overheal you up to 120% max health. Excess healing creates permanent shields. Massive sustain.\n\n💪 **ARMOR - ENDURANCE**: Health pool is increased, and you heal from enemy damage. Attrition is impossible.`,
  }

  return descriptions[id] || `Weaves ${componentNames} into something greater. A compound affix that shouldn't work, but stubbornly does. Probably dark magic. Definitely dangerous.`
}

/**
 * Load gem data from engine and transform to tool format
 * Creates one Affix entry per engine AffixDef (no tier splitting)
 */
export async function loadDataFromJSON(): Promise<LoadedData> {
  try {
    const { affixes: engineAffixes, combinations: engineCombinations, recipes: engineRecipes, synergies: engineSynergies } =
      loadAndValidateData()

    // Build base affixes first
    const baseAffixes: Affix[] = engineAffixes.map((engineAffix) => ({
      id: engineAffix.id,
      name: engineAffix.name,
      rarity: getCategoryRarity(engineAffix.category),
      tier: 2 as const, // Use mid-tier as representative
      categories: [engineAffix.category],
      icon: getCategoryIcon(engineAffix.category),
      description: generateBaseAffixDescription(engineAffix.id, engineAffix.name, engineAffix.category),
      tags: engineAffix.tags,
      tierEffects: engineAffix.tiers,
    }))

    // Build compound affixes using base affixes
    const compoundAffixes: Affix[] = engineCombinations.map((compound) => ({
      id: compound.id,
      name: compound.name || compound.id,
      rarity: 'exotic' as const, // Compounds are rare/exotic
      tier: 2 as const,
      categories: ['compound'],
      icon: '✨',
      description: generateCompoundDescription(
        compound.id,
        compound.name || compound.id,
        compound.components,
        baseAffixes
      ),
      tags: compound.tags || [],
      tierEffects: {
        '1': {
          weaponEffect: compound.weaponEffect,
          armorEffect: compound.armorEffect,
          valueRange: [0, 0] as [number, number], // Compounds don't have a value range
        },
      },
    }))

    // Combine all affixes
    const affixes: Affix[] = [...baseAffixes, ...compoundAffixes]

    // Transform recipes
    const recipes: Recipe[] = engineRecipes.map((engineRecipe) => {
      // Extract input affix IDs from components
      const inputs = engineRecipe.components ? engineRecipe.components.map((c) => c.id) : []

      return {
        id: engineRecipe.id,
        inputs,
        output: engineRecipe.outputAffixId,
        depth: Math.min(engineRecipe.maxDepthContribution, 3) as 0 | 1 | 2 | 3,
        type: engineRecipe.type,
        weight: 1,
        notes: `Tags: ${engineRecipe.tags.join(', ')}`,
      }
    })

    // Transform synergies
    const synergies: Synergy[] = engineSynergies.map((engineSynergy) => {
      return {
        id: engineSynergy.id,
        trigger: engineSynergy.requiredAffixes[0] || '',
        conditions: {
          affixesPresent: engineSynergy.requiredAffixes,
        },
        effect: {
          type: 'enhance',
          value: engineSynergy.bonusEffects.length,
          description: engineSynergy.description,
        },
        category: 'conditional',
        strength: 'normal',
      }
    })

    return { affixes, recipes, synergies }
  } catch (error) {
    console.error('Failed to load gem data:', error)
    return { affixes: [], recipes: [], synergies: [] }
  }
}
