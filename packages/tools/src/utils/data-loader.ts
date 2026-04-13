import { Affix, Recipe, Synergy } from '../store/types'

interface LoadedData {
  affixes: Affix[]
  recipes: Recipe[]
  synergies: Synergy[]
}

/**
 * Load gem data from engine registry
 * TODO: Later integrate with local JSON files for starter content
 */
export async function loadDataFromJSON(): Promise<LoadedData> {
  try {
    // TODO: Load from engine registry
    const affixes: Affix[] = []
    const recipes: Recipe[] = []
    const synergies: Synergy[] = []

    return { affixes, recipes, synergies }
  } catch (error) {
    console.error('Failed to load gem data:', error)
    return { affixes: [], recipes: [], synergies: [] }
  }
}
