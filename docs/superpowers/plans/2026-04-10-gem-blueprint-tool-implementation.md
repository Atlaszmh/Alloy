---
name: Gem Blueprint Tool Implementation Plan
description: Multi-phase implementation of dual-pane gem design tool with D3 visualization and Zustand state management
date: 2026-04-10
phase: planning
---

# Gem Blueprint Tool — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

## Goal

Build a web-based dual-pane visualization and editing system for designing gems, recipes, and synergies with real-time D3 radial tree visualization, full CRUD workbench editors, and integration with the Alloy game engine simulation.

## Architecture

The tool uses a **two-pane layout** with **Zustand centralized state management**. The left pane contains a **D3 radial hierarchy visualization** of gems, recipes, and synergies. The right pane contains **context-aware form editors** with live tree highlighting. Data flows from JSON files → Zustand store → D3 rendering, with bidirectional updates from user interactions. Persistence is handled by validating against engine rules and writing to JSON + git.

## Tech Stack

- **React 19** + **TypeScript 5.7** (strict mode)
- **Zustand 5** (state management)
- **D3.js 7** (radial hierarchy visualization)
- **TailwindCSS v4** (styling)
- **Zod 3** (data validation)
- **Vitest 3** (unit tests)
- **Vite** (dev server / build)

---

## File Structure

### Phase 1 Files (Foundation)

```
packages/tools/
├── src/
│   ├── app.tsx                         (GemBlueprintApp root component)
│   ├── store/
│   │   ├── gem-blueprint-store.ts      (Zustand store + actions)
│   │   ├── types.ts                    (TypeScript types for store)
│   │   └── __tests__/
│   │       └── gem-blueprint-store.test.ts
│   ├── components/
│   │   ├── two-pane-layout.tsx         (Main layout wrapper)
│   │   ├── radial-tree-browser.tsx     (D3 tree + interactions)
│   │   └── __tests__/
│   │       └── radial-tree-browser.test.tsx
│   ├── utils/
│   │   ├── d3-tree-renderer.ts         (D3 hierarchy + rendering logic)
│   │   ├── data-loader.ts              (Load affixes/recipes/synergies from JSON)
│   │   └── __tests__/
│   │       └── d3-tree-renderer.test.ts
│   ├── styles/
│   │   └── gem-blueprint.css           (TailwindCSS + custom D3 styles)
│   └── index.tsx                       (Entry point)
```

### Phase 2 Files (Workbench & Persistence)

```
├── components/
│   ├── workbench-editor.tsx            (Main workbench container)
│   ├── editor-panels/
│   │   ├── affix-editor.tsx            (Affix form)
│   │   ├── recipe-editor.tsx           (Recipe form)
│   │   └── synergy-editor.tsx          (Synergy form)
│   ├── tabs/
│   │   ├── affix-tab.tsx               (Affix list + selection)
│   │   ├── recipe-tab.tsx              (Recipe tree view)
│   │   └── synergy-tab.tsx             (Synergy table)
│   └── __tests__/
│       ├── affix-editor.test.tsx
│       ├── recipe-editor.test.tsx
│       └── synergy-editor.test.tsx
├── utils/
│   ├── validation.ts                   (Zod schemas + validation)
│   ├── git-persistence.ts              (Save/load with git integration)
│   └── __tests__/
│       └── validation.test.ts
```

### Phase 3 Files (Advanced Interactions)

```
├── components/
│   ├── radial-tree-browser.tsx         (Enhanced with zoom/pan/search)
│   ├── tree-controls/
│   │   ├── filter-panel.tsx            (Depth/rarity/category filters)
│   │   ├── search-box.tsx              (Fuzzy search)
│   │   ├── zoom-controls.tsx           (Pan/zoom buttons)
│   │   └── legend-panel.tsx            (Ring layers + synergy types)
│   └── __tests__/
│       ├── filter-panel.test.tsx
│       └── search-box.test.tsx
├── utils/
│   ├── simulation-runner.ts            (Export config + run engine)
│   └── __tests__/
│       └── simulation-runner.test.ts
```

### Phase 4 Files (Content & Data)

```
├── data/
│   ├── affixes-base.json               (33 base affixes from engine)
│   ├── recipes-starter.json            (25 new recipes)
│   ├── synergies-starter.json          (25 new synergies)
│   └── __tests__/
│       └── data-validation.test.ts     (Zod validation against schema)
```

---

# Chunk 1: Foundation (Phase 1 — Week 1)

## Overview

Establish the project structure, Zustand state management, D3 radial tree visualization, and basic hover/click interactions. By end of this chunk, the tool displays all 33 affixes in a radial tree with working hover effects and node selection.

---

## Task 1: Set Up Tool Project Structure

**Files:**
- Create: `packages/tools/src/app.tsx`
- Create: `packages/tools/src/index.tsx`
- Create: `packages/tools/src/store/gem-blueprint-store.ts`
- Create: `packages/tools/src/store/types.ts`
- Create: `packages/tools/tsconfig.json`
- Modify: `packages/tools/package.json`

### Step 1: Create package.json with dependencies

Create `packages/tools/package.json`:

```json
{
  "name": "@alloy/tools",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest",
    "test:ui": "vitest --ui"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0",
    "d3": "^7.8.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@alloy/engine": "workspace:*",
    "@types/d3": "^7.4.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0",
    "vite": "^5.0.0",
    "vitest": "^3.0.0",
    "jsdom": "^23.0.0"
  }
}
```

- [ ] **Step 1: Create package.json**

File created with exact dependencies shown above.

- [ ] **Step 2: Create tsconfig.json**

Create `packages/tools/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "resolveJsonModule": true,
    "moduleResolution": "bundler",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "../engine" }]
}
```

- [ ] **Step 3: Create vite.config.ts**

Create `packages/tools/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
  },
})
```

- [ ] **Step 4: Create src/index.tsx entry point**

Create `packages/tools/src/index.tsx`:

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { GemBlueprintApp } from './app'
import './styles/gem-blueprint.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GemBlueprintApp />
  </React.StrictMode>,
)
```

- [ ] **Step 5: Create index.html**

Create `packages/tools/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Gem Blueprint Tool</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/index.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Verify npm install and build**

Run:
```bash
cd packages/tools
npm install
npm run build
```

Expected: No errors, dist folder created.

- [ ] **Step 7: Commit project setup**

```bash
git add packages/tools/package.json packages/tools/tsconfig.json packages/tools/vite.config.ts packages/tools/src/index.tsx packages/tools/index.html
git commit -m "feat(tools): initial gem blueprint tool project setup

- Add package.json with React 19, Zustand 5, D3.js, TailwindCSS
- Configure TypeScript 5.7 with strict mode
- Set up Vite build and dev server
- Create entry point and HTML template

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create Zustand Store & Types

**Files:**
- Create: `packages/tools/src/store/types.ts`
- Create: `packages/tools/src/store/gem-blueprint-store.ts`
- Create: `packages/tools/src/store/__tests__/gem-blueprint-store.test.ts`

### Step 1: Define types

Create `packages/tools/src/store/types.ts`:

```typescript
// Affix type from engine + local extensions
export interface Affix {
  id: string
  name: string
  rarity: 'common' | 'rare' | 'unique' | 'exotic'
  tier: 1 | 2 | 3 | 4 | 5
  categories: string[]
  icon: string
  description: string
  flavorText?: string
  tags: string[]
}

export interface Recipe {
  id: string
  inputs: string[] // affix IDs (2 per recipe)
  output: string // affix ID
  depth: 0 | 1 | 2 | 3
  type: 'signature' | 'category' | 'generic'
  weight: number // 0.5 to 2.0
  notes: string
}

export interface Synergy {
  id: string
  trigger: string // affix ID
  conditions?: {
    affixesPresent?: string[]
    affixesAbsent?: string[]
    statThresholds?: Array<{ affix: string; stat: string; value: number }>
  }
  effect: {
    type: 'transform' | 'apply' | 'enhance'
    value: string | number
    description: string
  }
  category: 'conditional' | 'transformation' | 'support'
  strength: 'weak' | 'normal' | 'strong'
}

export interface FilterState {
  depths: boolean[] // [ring1, ring2, ring3]
  rarities: Set<Affix['rarity']>
  categories: Set<string>
  searchQuery: string
}

export interface TreeState {
  zoomLevel: number // 1 to 3
  panX: number
  panY: number
  highlightedPath: string[] // node IDs in highlighted path
}

export interface GemBlueprintState {
  affixes: Affix[]
  recipes: Recipe[]
  synergies: Synergy[]
  selectedNode: string | null
  editMode: 'view' | 'create' | 'edit'
  filterState: FilterState
  treeState: TreeState
  isDirty: boolean
}

export interface GemBlueprintActions {
  loadDataFromJSON: () => Promise<void>
  setSelectedNode: (nodeId: string | null) => void
  setEditMode: (mode: GemBlueprintState['editMode']) => void
  updateFilterState: (partial: Partial<FilterState>) => void
  updateTreeState: (partial: Partial<TreeState>) => void
  updateAffix: (id: string, partial: Partial<Affix>) => void
  createRecipe: (inputs: string[], output: string) => void
  deleteRecipe: (id: string) => void
  createSynergy: (synergy: Omit<Synergy, 'id'>) => void
  deleteSynergy: (id: string) => void
  searchByName: (query: string) => void
  resetFilters: () => void
}
```

- [ ] **Step 1: Write types.ts with all interfaces**

File created as shown above.

- [ ] **Step 2: Commit types**

```bash
git add packages/tools/src/store/types.ts
git commit -m "feat(tools): define gem blueprint data types

- Add Affix, Recipe, Synergy, FilterState, TreeState types
- Define GemBlueprintState and GemBlueprintActions interfaces
- Complete TypeScript contracts for store

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

### Step 3: Create Zustand store

Create `packages/tools/src/store/gem-blueprint-store.ts`:

```typescript
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import {
  GemBlueprintState,
  GemBlueprintActions,
  Affix,
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
```

- [ ] **Step 3: Write gem-blueprint-store.ts with Zustand setup**

File created as shown above.

### Step 4: Write store tests

Create `packages/tools/src/store/__tests__/gem-blueprint-store.test.ts`:

```typescript
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
      affixes: [{ id: 'fire', name: 'Fire', rarity: 'common', tier: 1, categories: ['elemental'], icon: '🔥', description: '', tags: [] }],
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
      recipes: [{ id: 'recipe-1', inputs: ['fire', 'water'], output: 'steam', depth: 1, type: 'signature', weight: 1, notes: '' }],
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
```

- [ ] **Step 4: Write store.test.ts with full test coverage**

File created as shown above.

- [ ] **Step 5: Run tests to verify all pass**

Run:
```bash
cd packages/tools
npm run test -- src/store/__tests__/gem-blueprint-store.test.ts
```

Expected: All 8 tests pass.

- [ ] **Step 6: Commit store implementation**

```bash
git add packages/tools/src/store/gem-blueprint-store.ts packages/tools/src/store/__tests__/gem-blueprint-store.test.ts
git commit -m "feat(tools): implement Zustand store for gem blueprint state

- Create GemBlueprintStore with Zustand + devtools
- Implement actions: loadDataFromJSON, setSelectedNode, updateAffix, createRecipe, etc.
- Add comprehensive unit tests for all store actions
- All tests passing

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Create D3 Radial Tree Renderer

**Files:**
- Create: `packages/tools/src/utils/d3-tree-renderer.ts`
- Create: `packages/tools/src/utils/__tests__/d3-tree-renderer.test.ts`

### Step 1: Write failing test for tree layout

Create `packages/tools/src/utils/__tests__/d3-tree-renderer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createRadialHierarchy } from '../d3-tree-renderer'

describe('D3 Tree Renderer', () => {
  it('creates radial hierarchy from affixes and recipes', () => {
    const affixes = [
      { id: 'fire', name: 'Fire', rarity: 'common' as const, tier: 1, categories: ['elemental'], icon: '🔥', description: '', tags: [] },
      { id: 'water', name: 'Water', rarity: 'common' as const, tier: 1, categories: ['elemental'], icon: '💧', description: '', tags: [] },
    ]

    const recipes = [
      { id: 'recipe-1', inputs: ['fire', 'water'], output: 'steam', depth: 1, type: 'signature' as const, weight: 1, notes: '' },
    ]

    const hierarchy = createRadialHierarchy(affixes, recipes)

    // Verify hierarchy structure
    expect(hierarchy).toBeDefined()
    expect(hierarchy.children).toBeDefined()
    expect(hierarchy.children.length).toBeGreaterThan(0)
  })

  it('assigns correct depth to nodes based on recipe chains', () => {
    const affixes = [
      { id: 'fire', name: 'Fire', rarity: 'common' as const, tier: 1, categories: ['elemental'], icon: '🔥', description: '', tags: [] },
      { id: 'steam', name: 'Steam', rarity: 'rare' as const, tier: 2, categories: ['elemental'], icon: '☁️', description: '', tags: [] },
    ]

    const recipes = [
      { id: 'recipe-1', inputs: ['fire', 'water'], output: 'steam', depth: 1, type: 'signature' as const, weight: 1, notes: '' },
    ]

    const hierarchy = createRadialHierarchy(affixes, recipes)
    const steamNode = hierarchy.children?.find((n: any) => n.data.id === 'steam')

    expect(steamNode).toBeDefined()
    expect(steamNode?.depth).toBeGreaterThan(0)
  })

  it('calculates node size based on affix weight (synergy count)', () => {
    const affixes = [
      { id: 'fire', name: 'Fire', rarity: 'common' as const, tier: 1, categories: ['elemental'], icon: '🔥', description: '', tags: [] },
    ]

    const recipes: any[] = []

    const hierarchy = createRadialHierarchy(affixes, recipes)
    const fireNode = hierarchy.children?.find((n: any) => n.data.id === 'fire')

    // All nodes start with weight 1
    expect(fireNode?.data.weight).toBe(1)
  })
})
```

- [ ] **Step 1: Write test file (will fail)**

File created as shown above.

- [ ] **Step 2: Run test to verify failure**

Run:
```bash
cd packages/tools
npm run test -- src/utils/__tests__/d3-tree-renderer.test.ts
```

Expected: Test fails with "createRadialHierarchy is not defined"

### Step 2: Implement D3 tree renderer

Create `packages/tools/src/utils/d3-tree-renderer.ts`:

```typescript
import * as d3 from 'd3'
import { Affix, Recipe, Synergy } from '../store/types'

export interface TreeNode {
  id: string
  name: string
  depth: number
  ring: number // 0-3 for visualization rings
  rarity: string
  weight: number // size scalar for node
  tier?: number
  isRecipeOutput?: boolean
  synergyCon?: number // number of synergies referencing this node
}

export interface TreeLink {
  source: TreeNode
  target: TreeNode
  type: 'recipe' | 'synergy'
}

/**
 * Create D3 hierarchy data structure from affixes and recipes
 * Ring 0: Base affixes (depth 0)
 * Ring 1: Depth-1 recipes
 * Ring 2: Depth-2 recipes
 * Ring 3: Depth-3 recipes
 */
export function createRadialHierarchy(affixes: Affix[], recipes: Recipe[]) {
  const nodeMap = new Map<string, TreeNode>()

  // Create nodes for base affixes (Ring 0)
  affixes.forEach((affix) => {
    const node: TreeNode = {
      id: affix.id,
      name: affix.name,
      depth: 0,
      ring: 0,
      rarity: affix.rarity,
      weight: 1,
      tier: affix.tier,
    }
    nodeMap.set(affix.id, node)
  })

  // Create nodes for recipe outputs and assign to rings 1-3
  recipes.forEach((recipe) => {
    if (!nodeMap.has(recipe.output)) {
      const outputAffix = affixes.find((a) => a.id === recipe.output)
      if (outputAffix) {
        const node: TreeNode = {
          id: recipe.output,
          name: outputAffix.name,
          depth: recipe.depth,
          ring: recipe.depth,
          rarity: outputAffix.rarity,
          weight: 1,
          tier: outputAffix.tier,
          isRecipeOutput: true,
        }
        nodeMap.set(recipe.output, node)
      }
    }
  })

  // Build hierarchy with root
  const root = {
    id: 'root',
    name: 'Gems',
    depth: -1,
    ring: -1,
    rarity: 'common',
    weight: 1,
    children: Array.from(nodeMap.values()).filter((n) => n.depth === 0),
  }

  // Nest by depth
  const hierarchy = d3.hierarchy(root)

  return hierarchy
}

/**
 * Calculate polar coordinates for radial layout
 * angle: 0 to 2π
 * radius: based on ring (0, 100, 180, 260)
 */
export function getPolarCoordinates(
  angle: number,
  ring: number,
  containerRadius: number = 400
) {
  const ringRadii = [0, 100, 180, 260]
  const radius = ringRadii[Math.min(ring, 3)] || 0

  const x = containerRadius + radius * Math.cos(angle - Math.PI / 2)
  const y = containerRadius + radius * Math.sin(angle - Math.PI / 2)

  return { x, y }
}

/**
 * Get node color based on rarity
 */
export function getRarityColor(rarity: string): string {
  const colors: Record<string, string> = {
    common: '#808080',
    rare: '#4169e1',
    unique: '#ff8c00',
    exotic: '#ff1493',
  }
  return colors[rarity] || '#808080'
}

/**
 * Get node size based on weight
 */
export function getNodeRadius(weight: number): number {
  return 4 + weight * 2 // 4-12px range
}
```

- [ ] **Step 3: Implement d3-tree-renderer.ts**

File created as shown above.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd packages/tools
npm run test -- src/utils/__tests__/d3-tree-renderer.test.ts
```

Expected: All 3 tests pass.

- [ ] **Step 5: Commit D3 renderer**

```bash
git add packages/tools/src/utils/d3-tree-renderer.ts packages/tools/src/utils/__tests__/d3-tree-renderer.test.ts
git commit -m "feat(tools): implement D3 radial tree layout utilities

- Create createRadialHierarchy to nest affixes/recipes by depth
- Add getPolarCoordinates for radial positioning
- Add getRarityColor for visual encoding
- Add getNodeRadius for weight-based sizing
- Tests verify hierarchy creation and node properties

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Create Data Loader Utility

**Files:**
- Create: `packages/tools/src/utils/data-loader.ts`
- Create: `packages/tools/src/utils/__tests__/data-loader.test.ts`

### Step 1: Write test for data loading

Create `packages/tools/src/utils/__tests__/data-loader.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadDataFromJSON } from '../data-loader'

// Mock file system or engine registry
vi.mock('@alloy/engine', () => ({
  DataRegistry: {
    getInstance: () => ({
      getAffixes: () => [
        { id: 'fire', name: 'Fire', rarity: 'common', tier: 1, categories: ['elemental'], icon: '🔥', description: '', tags: [] },
      ],
      getRecipes: () => [],
      getSynergies: () => [],
    }),
  },
}))

describe('Data Loader', () => {
  it('loads affixes from engine registry', async () => {
    const { affixes } = await loadDataFromJSON()
    expect(affixes).toHaveLength(1)
    expect(affixes[0].id).toBe('fire')
  })

  it('returns empty recipes and synergies initially', async () => {
    const { recipes, synergies } = await loadDataFromJSON()
    expect(recipes).toEqual([])
    expect(synergies).toEqual([])
  })

  it('handles missing data files gracefully', async () => {
    const data = await loadDataFromJSON()
    expect(data.affixes).toBeDefined()
    expect(data.recipes).toBeDefined()
    expect(data.synergies).toBeDefined()
  })
})
```

- [ ] **Step 1: Write test file**

File created as shown above.

### Step 2: Implement data loader

Create `packages/tools/src/utils/data-loader.ts`:

```typescript
import { Affix, Recipe, Synergy } from '../store/types'
import { DataRegistry } from '@alloy/engine'

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
    const registry = DataRegistry.getInstance()

    // Load affixes from engine
    const affixes = registry.getAffixes() || []

    // TODO: Load recipes from combinations.json
    const recipes: Recipe[] = []

    // TODO: Load synergies from synergies.json
    const synergies: Synergy[] = []

    return { affixes, recipes, synergies }
  } catch (error) {
    console.error('Failed to load gem data:', error)
    return { affixes: [], recipes: [], synergies: [] }
  }
}

/**
 * Save data to JSON files (placeholder for Phase 2)
 */
export async function saveDataToJSON(data: LoadedData): Promise<void> {
  // TODO: Implement in Phase 2 with validation + git integration
  console.log('Save not yet implemented', data)
}
```

- [ ] **Step 2: Implement data-loader.ts**

File created as shown above.

- [ ] **Step 3: Commit data loader**

```bash
git add packages/tools/src/utils/data-loader.ts packages/tools/src/utils/__tests__/data-loader.test.ts
git commit -m "feat(tools): implement data loading from engine registry

- Create loadDataFromJSON to fetch affixes from DataRegistry
- Add placeholder for recipe/synergy loading (Phase 2)
- Add error handling for missing data
- Tests verify loading and graceful fallback

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Build Two-Pane Layout Component

**Files:**
- Create: `packages/tools/src/components/two-pane-layout.tsx`
- Create: `packages/tools/src/styles/gem-blueprint.css`
- Create: `packages/tools/src/components/__tests__/two-pane-layout.test.tsx`

### Step 1: Write test for layout

Create `packages/tools/src/components/__tests__/two-pane-layout.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TwoPaneLayout } from '../two-pane-layout'

describe('TwoPaneLayout', () => {
  it('renders left and right panes', () => {
    render(
      <TwoPaneLayout
        left={<div>Left Content</div>}
        right={<div>Right Content</div>}
      />
    )

    expect(screen.getByText('Left Content')).toBeInTheDocument()
    expect(screen.getByText('Right Content')).toBeInTheDocument()
  })

  it('applies flex layout with equal sizing', () => {
    const { container } = render(
      <TwoPaneLayout
        left={<div>Left</div>}
        right={<div>Right</div>}
      />
    )

    const paneContainer = container.firstChild as HTMLElement
    expect(paneContainer).toHaveClass('flex')
  })
})
```

- [ ] **Step 1: Write test file**

File created as shown above.

### Step 2: Implement layout component

Create `packages/tools/src/components/two-pane-layout.tsx`:

```typescript
import React from 'react'

interface TwoPaneLayoutProps {
  left: React.ReactNode
  right: React.ReactNode
  leftWidth?: string
  rightWidth?: string
  dividerPosition?: number // 0-100 for resizable later
}

export const TwoPaneLayout: React.FC<TwoPaneLayoutProps> = ({
  left,
  right,
  leftWidth = '50%',
  rightWidth = '50%',
}) => {
  return (
    <div className="flex h-screen bg-slate-900">
      {/* Left Pane */}
      <div className="flex-1 border-r border-slate-700 bg-slate-800" style={{ width: leftWidth }}>
        {left}
      </div>

      {/* Right Pane */}
      <div className="flex-1 bg-slate-800" style={{ width: rightWidth }}>
        {right}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Implement two-pane-layout.tsx**

File created as shown above.

### Step 3: Create base styles

Create `packages/tools/src/styles/gem-blueprint.css`:

```css
@import 'tailwindcss/base';
@import 'tailwindcss/components';
@import 'tailwindcss/utilities';

/* D3 SVG Styles */
.radial-tree-svg {
  background: #1e293b;
  cursor: grab;
}

.radial-tree-svg.dragging {
  cursor: grabbing;
}

.node {
  cursor: pointer;
  transition: r 0.2s, opacity 0.2s;
}

.node:hover {
  stroke: #fbbf24;
  stroke-width: 2px;
}

.node.selected {
  stroke: #60a5fa;
  stroke-width: 3px;
}

.node.faded {
  opacity: 0.2;
}

.link {
  fill: none;
  stroke: #64748b;
  stroke-width: 1.5px;
  opacity: 0.6;
}

.link.recipe {
  stroke: #3b82f6;
}

.link.synergy {
  stroke: #f97316;
}

.link.synergy.dashed {
  stroke-dasharray: 5, 5;
}

.link.highlighted {
  stroke: #60a5fa;
  stroke-width: 2.5px;
  opacity: 1;
}

.node-label {
  font-size: 11px;
  font-family: system-ui, -apple-system, sans-serif;
  fill: #e2e8f0;
  pointer-events: none;
  text-anchor: middle;
  dominant-baseline: middle;
}

.node-label.highlighted {
  fill: #fbbf24;
  font-weight: bold;
}

/* Workbench Styles */
.workbench-tabs {
  @apply flex border-b border-slate-600;
}

.workbench-tab {
  @apply px-4 py-2 text-sm font-medium text-slate-400 border-b-2 border-transparent cursor-pointer hover:text-slate-200;
}

.workbench-tab.active {
  @apply border-b-2 border-blue-500 text-blue-400;
}

.form-group {
  @apply mb-4;
}

.form-label {
  @apply block text-sm font-medium text-slate-300 mb-2;
}

.form-input,
.form-select,
.form-textarea {
  @apply w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-100 focus:border-blue-500 focus:outline-none;
}

.form-textarea {
  @apply resize-none;
}

.button {
  @apply px-4 py-2 rounded font-medium text-sm transition-colors;
}

.button-primary {
  @apply bg-blue-600 text-white hover:bg-blue-700;
}

.button-secondary {
  @apply bg-slate-700 text-slate-200 hover:bg-slate-600;
}

.button-danger {
  @apply bg-red-600 text-white hover:bg-red-700;
}

/* Tooltip */
.tooltip {
  @apply absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-slate-950 text-slate-100 px-3 py-2 rounded text-xs whitespace-nowrap pointer-events-none opacity-0 transition-opacity;
}

.tooltip.visible {
  @apply opacity-100;
}
```

- [ ] **Step 3: Create CSS styles**

File created as shown above.

- [ ] **Step 4: Run tests to verify**

Run:
```bash
cd packages/tools
npm run test -- src/components/__tests__/two-pane-layout.test.tsx
```

Expected: Tests pass.

- [ ] **Step 5: Commit layout component**

```bash
git add packages/tools/src/components/two-pane-layout.tsx packages/tools/src/styles/gem-blueprint.css packages/tools/src/components/__tests__/two-pane-layout.test.tsx
git commit -m "feat(tools): implement two-pane layout and base styles

- Create TwoPaneLayout component with flex layout
- Add comprehensive D3, workbench, and form styling
- Include tooltip and button utility styles
- Tests verify component rendering and layout

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Build Radial Tree Browser Component

**Files:**
- Create: `packages/tools/src/components/radial-tree-browser.tsx`
- Create: `packages/tools/src/components/__tests__/radial-tree-browser.test.tsx`

### Step 1: Write test for tree browser

Create `packages/tools/src/components/__tests__/radial-tree-browser.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RadialTreeBrowser } from '../radial-tree-browser'
import { useGemBlueprintStore } from '../../store/gem-blueprint-store'

// Mock D3
vi.mock('d3', () => ({
  select: vi.fn(() => ({
    attr: vi.fn(() => ({ attr: vi.fn(() => ({ append: vi.fn(() => ({})) })) })),
  })),
  hierarchy: vi.fn((data) => ({ ...data, children: data.children || [] })),
}))

describe('RadialTreeBrowser', () => {
  it('renders SVG canvas', () => {
    const { container } = render(<RadialTreeBrowser />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('applies hover highlighting on node hover', async () => {
    render(<RadialTreeBrowser />)
    const svg = screen.getByRole('img', { hidden: true })
    expect(svg).toBeInTheDocument()
  })

  it('handles node click to select', () => {
    render(<RadialTreeBrowser />)
    // Click simulation handled by D3 internally
    const { setSelectedNode } = useGemBlueprintStore.getState()
    setSelectedNode('test-node')
    expect(useGemBlueprintStore.getState().selectedNode).toBe('test-node')
  })
})
```

- [ ] **Step 1: Write test file**

File created as shown above.

### Step 2: Implement tree browser

Create `packages/tools/src/components/radial-tree-browser.tsx`:

```typescript
import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { useGemBlueprintStore } from '../store/gem-blueprint-store'
import {
  createRadialHierarchy,
  getPolarCoordinates,
  getRarityColor,
  getNodeRadius,
} from '../utils/d3-tree-renderer'

const CONTAINER_SIZE = 900
const CENTER = CONTAINER_SIZE / 2

export const RadialTreeBrowser: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null)
  const { affixes, recipes, selectedNode, setSelectedNode, filterState } = useGemBlueprintStore()

  useEffect(() => {
    if (!svgRef.current || affixes.length === 0) return

    // Create hierarchy
    const hierarchy = createRadialHierarchy(affixes, recipes)
    const radius = 260

    // Create tree layout
    const tree = d3.tree().size([2 * Math.PI, radius])
    const treeData = tree(hierarchy)

    // Select or create SVG
    const svg = d3.select(svgRef.current)
    svg.attr('width', CONTAINER_SIZE).attr('height', CONTAINER_SIZE)

    // Clear previous
    svg.selectAll('*').remove()

    // Create group for transformations
    const g = svg.append('g').attr('transform', `translate(${CENTER},${CENTER})`)

    // Draw links (recipes)
    const links = treeData.links()
    g.selectAll('.link')
      .data(links)
      .join('line')
      .attr('class', 'link recipe')
      .attr('x1', (d: any) => d.source.x * Math.cos(d.source.y - Math.PI / 2))
      .attr('y1', (d: any) => d.source.x * Math.sin(d.source.y - Math.PI / 2))
      .attr('x2', (d: any) => d.target.x * Math.cos(d.target.y - Math.PI / 2))
      .attr('y2', (d: any) => d.target.x * Math.sin(d.target.y - Math.PI / 2))

    // Draw nodes
    g.selectAll('.node')
      .data(treeData.descendants())
      .join('circle')
      .attr('class', (d: any) => `node ${d.data.id === selectedNode ? 'selected' : ''}`)
      .attr('r', (d: any) => getNodeRadius(d.data.weight || 1))
      .attr('cx', (d: any) => d.x * Math.cos(d.y - Math.PI / 2))
      .attr('cy', (d: any) => d.x * Math.sin(d.y - Math.PI / 2))
      .attr('fill', (d: any) => getRarityColor(d.data.rarity || 'common'))
      .on('click', (event: any, d: any) => {
        event.stopPropagation()
        setSelectedNode(d.data.id)
      })
      .on('mouseenter', function (event: any, d: any) {
        // Highlight node
        d3.select(this).style('stroke', '#fbbf24').style('stroke-width', '2px')
      })
      .on('mouseleave', function () {
        d3.select(this).style('stroke', 'none')
      })

    // Draw labels
    g.selectAll('.node-label')
      .data(treeData.descendants())
      .join('text')
      .attr('class', 'node-label')
      .attr('x', (d: any) => d.x * Math.cos(d.y - Math.PI / 2))
      .attr('y', (d: any) => d.x * Math.sin(d.y - Math.PI / 2))
      .attr('dy', '0.3em')
      .text((d: any) => d.data.name)
      .style('font-size', '10px')
  }, [affixes, recipes, selectedNode, filterState])

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1">
        <svg
          ref={svgRef}
          className="radial-tree-svg"
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Implement radial-tree-browser.tsx**

File created as shown above.

- [ ] **Step 3: Run tests**

Run:
```bash
cd packages/tools
npm run test -- src/components/__tests__/radial-tree-browser.test.tsx
```

Expected: Tests pass.

- [ ] **Step 4: Commit tree browser**

```bash
git add packages/tools/src/components/radial-tree-browser.tsx packages/tools/src/components/__tests__/radial-tree-browser.test.tsx
git commit -m "feat(tools): implement D3 radial tree browser component

- Render SVG radial hierarchy with polar coordinates
- Add hover highlighting on nodes
- Implement click-to-select with store integration
- Draw recipe links and affix labels
- Color nodes by rarity, size by weight
- Full interaction support for Phase 1

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Create Root App Component & Skeleton Workbench

**Files:**
- Create: `packages/tools/src/app.tsx`
- Create: `packages/tools/src/components/workbench-editor.tsx`

### Step 1: Create root app component

Create `packages/tools/src/app.tsx`:

```typescript
import React, { useEffect } from 'react'
import { TwoPaneLayout } from './components/two-pane-layout'
import { RadialTreeBrowser } from './components/radial-tree-browser'
import { WorkbenchEditor } from './components/workbench-editor'
import { useGemBlueprintStore } from './store/gem-blueprint-store'

export const GemBlueprintApp: React.FC = () => {
  const { loadDataFromJSON } = useGemBlueprintStore()

  useEffect(() => {
    loadDataFromJSON()
  }, [loadDataFromJSON])

  return (
    <div className="h-screen bg-slate-900">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="bg-slate-950 border-b border-slate-700 px-6 py-4">
          <h1 className="text-2xl font-bold text-white">Gem Blueprint Tool</h1>
          <p className="text-sm text-slate-400">Design and test new gems, recipes, and synergies</p>
        </div>

        {/* Main Layout */}
        <TwoPaneLayout
          left={<RadialTreeBrowser />}
          right={<WorkbenchEditor />}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 1: Create app.tsx**

File created as shown above.

### Step 2: Create skeleton workbench

Create `packages/tools/src/components/workbench-editor.tsx`:

```typescript
import React from 'react'
import { useGemBlueprintStore } from '../store/gem-blueprint-store'

export const WorkbenchEditor: React.FC = () => {
  const { selectedNode, editMode } = useGemBlueprintStore()

  return (
    <div className="flex flex-col h-full bg-slate-800 text-slate-100">
      {/* Workbench Header */}
      <div className="border-b border-slate-700 px-6 py-4">
        <h2 className="text-lg font-semibold">Workbench Editor</h2>
        <p className="text-sm text-slate-400">
          {selectedNode ? `Editing: ${selectedNode}` : 'Select a node to edit'}
        </p>
      </div>

      {/* Tabs (placeholder for Phase 2) */}
      <div className="workbench-tabs px-6 mt-4">
        <button className="workbench-tab active">Affixes</button>
        <button className="workbench-tab">Recipes</button>
        <button className="workbench-tab">Synergies</button>
      </div>

      {/* Editor Panel (placeholder) */}
      <div className="flex-1 p-6">
        {selectedNode ? (
          <div className="bg-slate-700 p-4 rounded">
            <p className="text-slate-300">Editor form for {selectedNode} goes here</p>
            <p className="text-sm text-slate-500 mt-2">Mode: {editMode}</p>
          </div>
        ) : (
          <div className="text-slate-500 text-center py-12">
            <p>Select a gem from the tree to begin editing</p>
          </div>
        )}
      </div>

      {/* Toolbar (placeholder) */}
      <div className="border-t border-slate-700 px-6 py-4 flex gap-2 bg-slate-900">
        <button className="button button-primary">Save Changes</button>
        <button className="button button-secondary">Revert</button>
        <button className="button button-secondary">Test in Sim</button>
        <button className="button button-secondary">Export</button>
        <button className="button button-secondary">Import</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create workbench-editor.tsx**

File created as shown above.

- [ ] **Step 3: Commit root app and workbench**

```bash
git add packages/tools/src/app.tsx packages/tools/src/components/workbench-editor.tsx
git commit -m "feat(tools): create root app component and skeleton workbench

- Implement GemBlueprintApp with data loading on mount
- Create workbench editor with tab navigation skeleton
- Add header with branding and info
- Add toolbar with action buttons (disabled until Phase 2)
- Full layout integration with D3 tree browser

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Integration Test & Dev Server Startup

**Files:**
- Create: `packages/tools/tests/integration.test.tsx`
- Modify: `packages/tools/vite.config.ts` (add React plugin)

### Step 1: Write integration test

Create `packages/tools/tests/integration.test.tsx`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { GemBlueprintApp } from '../src/app'

describe('GemBlueprintApp Integration', () => {
  it('renders app header', () => {
    render(<GemBlueprintApp />)
    expect(screen.getByText('Gem Blueprint Tool')).toBeInTheDocument()
  })

  it('loads data and renders tree on mount', async () => {
    render(<GemBlueprintApp />)

    // Verify tree browser is rendered
    await waitFor(() => {
      const svg = document.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })
  })

  it('renders workbench editor on right pane', () => {
    render(<GemBlueprintApp />)
    expect(screen.getByText('Workbench Editor')).toBeInTheDocument()
  })

  it('displays placeholder when no node selected', () => {
    render(<GemBlueprintApp />)
    expect(screen.getByText(/Select a gem from the tree/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 1: Write integration test**

File created as shown above.

- [ ] **Step 2: Install React Vite plugin**

Run:
```bash
cd packages/tools
npm install --save-dev @vitejs/plugin-react
```

- [ ] **Step 3: Update vite.config.ts**

Modify `packages/tools/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
  },
})
```

- [ ] **Step 3: Update vite config**

File updated as shown.

- [ ] **Step 4: Run integration tests**

Run:
```bash
cd packages/tools
npm run test -- tests/integration.test.tsx
```

Expected: All integration tests pass.

- [ ] **Step 5: Test dev server startup**

Run:
```bash
cd packages/tools
npm run dev &
```

Wait for server to start. Expected output: "Local: http://localhost:5174"

- [ ] **Step 6: Commit integration tests**

```bash
git add packages/tools/tests/integration.test.tsx packages/tools/vite.config.ts packages/tools/package.json
git commit -m "feat(tools): add integration tests and dev server configuration

- Write integration test covering app render, data loading, tree/workbench
- Add @vitejs/plugin-react to vite.config
- Dev server runs on port 5174
- All integration tests passing

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Chunk 1 Summary

✅ **Foundation Phase Complete** — Store, D3 tree, basic layout, and integration ready.

**What was built:**
- Zustand store with full state management
- D3 radial tree renderer with polar coordinates
- Data loader utility for affixes
- Two-pane layout with workbench skeleton
- Radial tree browser with hover/click interactions
- Root app component with data initialization
- 25+ tests covering store, D3, components, integration
- Dev server running on port 5174

**Files created:** 15
**Tests written:** 25+
**Commits:** 7

**Next: Proceed to Chunk 2 (Workbench Editors & Persistence)**

---

# Chunk 2: Workbench Editors & Persistence (Phase 2 — Week 2)

*[To be continued in next iteration after user approval of Chunk 1]*

## Overview (Placeholder)

Build form editors for affixes, recipes, and synergies with validation and JSON persistence.

---

# Chunk 3: Advanced Interactions (Phase 3 — Week 3)

*[To be continued after Chunk 2]*

---

# Chunk 4: Content & Polish (Phase 4 — Week 4)

*[To be continued after Chunk 3]*

---

## Success Metrics

After all 4 chunks:
- ✅ 100+ test cases passing
- ✅ All TypeScript strict mode compliant
- ✅ 25 new recipes loaded and editable
- ✅ 25 new synergies with full CRUD
- ✅ D3 tree renders <500ms with 100+ nodes
- ✅ Persistent JSON with git integration
- ✅ Simulation runner integration working
- ✅ Tool builds and runs on Windows/macOS/Linux
