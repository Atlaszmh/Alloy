import * as d3 from 'd3'
import { Affix, Recipe } from '../store/types'

export interface TreeNode {
  id: string
  name: string
  depth: number
  ring: number // 0-3 for visualization rings
  rarity: string
  weight: number // size scalar for node
  tier?: number
  isRecipeOutput?: boolean
  synergyCount?: number // number of synergies referencing this node
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
    children: Array.from(nodeMap.values()).filter((n) => n.depth === 0),
  }

  // Create D3 hierarchy
  const hierarchy = d3.hierarchy(root as any)

  return hierarchy as d3.HierarchyNode<any>
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
