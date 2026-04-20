import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import {
  GemBlueprintState,
  GemBlueprintActions,
  Recipe,
  Synergy,
  FilterState,
} from './types'
import { loadDataFromJSON } from '../utils/data-loader'

type Store = GemBlueprintState & GemBlueprintActions

const initialFilterState: FilterState = {
  depths: [true, true, true],
  rarities: new Set(['common', 'rare', 'unique', 'exotic']),
  categories: new Set(),
  searchQuery: '',
}

const initialTreeState = {
  zoomLevel: 1,
  panX: 0,
  panY: 0,
  highlightedPath: [],
}

export const useGemBlueprintStore = create<Store>()(
  devtools(
    (set) => ({
      affixes: [],
      recipes: [],
      synergies: [],
      selectedNode: null,
      editMode: 'view',
      filterState: initialFilterState,
      treeState: initialTreeState,
      isDirty: false,

      loadDataFromJSON: async () => {
        const { affixes, recipes, synergies } = await loadDataFromJSON()
        set({ affixes, recipes, synergies, isDirty: false })
      },

      setSelectedNode: (nodeId) => {
        set({ selectedNode: nodeId })
      },

      setEditMode: (mode) => {
        set({ editMode: mode })
      },

      updateFilterState: (partial) => {
        set((state) => ({
          filterState: { ...state.filterState, ...partial },
        }))
      },

      updateTreeState: (partial) => {
        set((state) => ({
          treeState: { ...state.treeState, ...partial },
        }))
      },

      updateAffix: (id, partial) => {
        set((state) => ({
          affixes: state.affixes.map((a) => (a.id === id ? { ...a, ...partial } : a)),
          isDirty: true,
        }))
      },

      createRecipe: (inputs, output) => {
        const id = `recipe-${Date.now()}`
        const depth = inputs.length === 2 ? (1 as const) : (0 as const) // TODO: calculate from input tiers
        const newRecipe: Recipe = {
          id,
          inputs,
          output,
          depth,
          type: 'signature',
          weight: 1,
          notes: '',
        }
        set((state) => ({
          recipes: [...state.recipes, newRecipe],
          isDirty: true,
        }))
      },

      deleteRecipe: (id) => {
        set((state) => ({
          recipes: state.recipes.filter((r) => r.id !== id),
          isDirty: true,
        }))
      },

      createSynergy: (synergy) => {
        const id = `synergy-${Date.now()}`
        const newSynergy: Synergy = { ...synergy, id }
        set((state) => ({
          synergies: [...state.synergies, newSynergy],
          isDirty: true,
        }))
      },

      deleteSynergy: (id) => {
        set((state) => ({
          synergies: state.synergies.filter((s) => s.id !== id),
          isDirty: true,
        }))
      },

      searchByName: (query) => {
        set((state) => ({
          filterState: { ...state.filterState, searchQuery: query },
        }))
      },

      resetFilters: () => {
        set({ filterState: initialFilterState })
      },
    }),
    { name: 'GemBlueprintStore' }
  )
)
