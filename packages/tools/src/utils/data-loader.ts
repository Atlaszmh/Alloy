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
      description: engineAffix.description,
      weaponFlavorText: engineAffix.weaponFlavorText,
      armorFlavorText: engineAffix.armorFlavorText,
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
      description: compound.description,
      weaponFlavorText: compound.weaponFlavorText,
      armorFlavorText: compound.armorFlavorText,
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
