import { describe, it, expect } from 'vitest'
import { createRadialHierarchy, getPolarCoordinates, getRarityColor, getNodeRadius } from '../d3-tree-renderer'

describe('D3 Tree Renderer', () => {
  it('creates radial hierarchy from affixes and recipes', () => {
    const affixes = [
      {
        id: 'fire',
        name: 'Fire',
        rarity: 'common' as const,
        tier: 1 as const,
        categories: ['elemental'],
        icon: '🔥',
        description: '',
        tags: [],
      },
      {
        id: 'water',
        name: 'Water',
        rarity: 'common' as const,
        tier: 1 as const,
        categories: ['elemental'],
        icon: '💧',
        description: '',
        tags: [],
      },
    ]

    const recipes = [
      {
        id: 'recipe-1',
        inputs: ['fire', 'water'],
        output: 'steam',
        depth: 1,
        type: 'signature' as const,
        weight: 1,
        notes: '',
      },
    ]

    const hierarchy = createRadialHierarchy(affixes, recipes)

    // Verify hierarchy structure
    expect(hierarchy).toBeDefined()
    expect(hierarchy.children).toBeDefined()
    expect(hierarchy.children!.length).toBeGreaterThan(0)
  })

  it('calculates correct polar coordinates', () => {
    const angle = 0
    const ring = 1
    const coords = getPolarCoordinates(angle, ring, 400)

    expect(coords).toHaveProperty('x')
    expect(coords).toHaveProperty('y')
    expect(coords.x).toBe(400) // 400 + 100*cos(-π/2) = 400 + 0
    expect(coords.y).toBe(300) // 400 + 100*sin(-π/2) = 400 - 100
  })

  it('returns correct color for rarity', () => {
    expect(getRarityColor('common')).toBe('#808080')
    expect(getRarityColor('rare')).toBe('#4169e1')
    expect(getRarityColor('unique')).toBe('#ff8c00')
    expect(getRarityColor('exotic')).toBe('#ff1493')
  })

  it('calculates node radius based on weight', () => {
    expect(getNodeRadius(1)).toBe(6) // 4 + 1*2
    expect(getNodeRadius(2)).toBe(8) // 4 + 2*2
    expect(getNodeRadius(4)).toBe(12) // 4 + 4*2
  })
})
