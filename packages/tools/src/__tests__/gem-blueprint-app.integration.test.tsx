import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { GemBlueprintApp } from '../gem-blueprint-app'

// Mock D3
vi.mock('d3', () => ({
  select: vi.fn(() => ({
    attr: vi.fn(function () { return this }),
    selectAll: vi.fn(function () { return this }),
    data: vi.fn(function () { return this }),
    join: vi.fn(function () { return this }),
    append: vi.fn(function () { return this }),
    on: vi.fn(function () { return this }),
    style: vi.fn(function () { return this }),
    text: vi.fn(function () { return this }),
  })),
  hierarchy: vi.fn((data) => ({
    ...data,
    descendants: () => [],
    links: () => [],
  })),
  tree: vi.fn(() => ({
    size: vi.fn(() => (data: any) => data),
  })),
}))

describe('GemBlueprintApp Integration', () => {
  it('renders app header', () => {
    render(<GemBlueprintApp />)
    expect(screen.getByText('Gem Blueprint Tool')).toBeTruthy()
  })

  it('displays design and test subtitle', () => {
    render(<GemBlueprintApp />)
    expect(screen.getByText(/Design and test new gems/)).toBeTruthy()
  })

  it('renders workbench editor section', () => {
    render(<GemBlueprintApp />)
    expect(screen.getByText('Workbench Editor')).toBeTruthy()
  })

  it('displays placeholder when no node selected', () => {
    render(<GemBlueprintApp />)
    expect(screen.getByText(/Select a gem from the tree/)).toBeTruthy()
  })

  it('renders toolbar buttons', () => {
    render(<GemBlueprintApp />)
    expect(screen.getByText('Save Changes')).toBeTruthy()
    expect(screen.getByText('Revert')).toBeTruthy()
    expect(screen.getByText('Test in Sim')).toBeTruthy()
    expect(screen.getByText('Export')).toBeTruthy()
    expect(screen.getByText('Import')).toBeTruthy()
  })

  it('renders workbench tabs', () => {
    render(<GemBlueprintApp />)
    expect(screen.getByText('Affixes')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Recipes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Synergies' })).toBeTruthy()
  })
})
