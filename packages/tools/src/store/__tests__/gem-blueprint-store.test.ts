import { describe, it, expect, beforeEach } from 'vitest'
import { useGemBlueprintStore } from '../gem-blueprint-store'

describe('GemBlueprintStore', () => {
  beforeEach(() => {
    // Reset store between tests
    useGemBlueprintStore.setState({
      affixes: [],
      recipes: [],
      synergies: [],
      selectedNode: null,
      editMode: 'view',
      isDirty: false,
      filterState: {
        depths: [true, true, true],
        rarities: new Set(['common', 'rare', 'unique', 'exotic']),
        categories: new Set(),
        searchQuery: '',
      },
      treeState: {
        zoomLevel: 1,
        panX: 0,
        panY: 0,
        highlightedPath: [],
      },
    })
  })

  it('initializes with empty state', () => {
    const store = useGemBlueprintStore.getState()
    expect(store.affixes).toEqual([])
    expect(store.recipes).toEqual([])
    expect(store.synergies).toEqual([])
    expect(store.selectedNode).toBeNull()
    expect(store.isDirty).toBe(false)
  })

  it('setSelectedNode updates selected node', () => {
    const { setSelectedNode } = useGemBlueprintStore.getState()
    setSelectedNode('affix-1')
    expect(useGemBlueprintStore.getState().selectedNode).toBe('affix-1')
  })

  it('setEditMode changes edit mode', () => {
    const { setEditMode } = useGemBlueprintStore.getState()
    setEditMode('create')
    expect(useGemBlueprintStore.getState().editMode).toBe('create')
  })

  it('updateAffix modifies affix and marks dirty', () => {
    const { updateAffix } = useGemBlueprintStore.getState()
    useGemBlueprintStore.setState({
      affixes: [
        {
          id: 'fire',
          name: 'Fire',
          rarity: 'common',
          tier: 1,
          categories: ['elemental'],
          icon: '🔥',
          description: '',
          tags: [],
        },
      ],
    })

    updateAffix('fire', { description: 'Updated description' })
    const state = useGemBlueprintStore.getState()
    expect(state.affixes[0].description).toBe('Updated description')
    expect(state.isDirty).toBe(true)
  })

  it('createRecipe adds new recipe and marks dirty', () => {
    const { createRecipe } = useGemBlueprintStore.getState()
    createRecipe(['fire', 'water'], 'steam')

    const state = useGemBlueprintStore.getState()
    expect(state.recipes).toHaveLength(1)
    expect(state.recipes[0].inputs).toEqual(['fire', 'water'])
    expect(state.recipes[0].output).toBe('steam')
    expect(state.isDirty).toBe(true)
  })

  it('deleteRecipe removes recipe and marks dirty', () => {
    useGemBlueprintStore.setState({
      recipes: [
        {
          id: 'recipe-1',
          inputs: ['fire', 'water'],
          output: 'steam',
          depth: 1,
          type: 'signature',
          weight: 1,
          notes: '',
        },
      ],
    })

    const { deleteRecipe } = useGemBlueprintStore.getState()
    deleteRecipe('recipe-1')

    const state = useGemBlueprintStore.getState()
    expect(state.recipes).toHaveLength(0)
    expect(state.isDirty).toBe(true)
  })

  it('searchByName updates search query', () => {
    const { searchByName } = useGemBlueprintStore.getState()
    searchByName('Fire')
    expect(useGemBlueprintStore.getState().filterState.searchQuery).toBe('Fire')
  })

  it('resetFilters restores initial filter state', () => {
    const { updateFilterState, resetFilters } = useGemBlueprintStore.getState()
    updateFilterState({ searchQuery: 'test' })
    expect(useGemBlueprintStore.getState().filterState.searchQuery).toBe('test')

    resetFilters()
    expect(useGemBlueprintStore.getState().filterState.searchQuery).toBe('')
  })
})
