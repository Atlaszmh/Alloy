import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GemBlueprintApp } from '../gem-blueprint-app'

// Mock D3
vi.mock('d3', () => {
  const chain: any = {};
  const chainFn = () => chain;
  chain.attr = vi.fn(chainFn);
  chain.selectAll = vi.fn(chainFn);
  chain.data = vi.fn(chainFn);
  chain.join = vi.fn(chainFn);
  chain.append = vi.fn(chainFn);
  chain.on = vi.fn(chainFn);
  chain.style = vi.fn(chainFn);
  chain.text = vi.fn(chainFn);
  return {
    select: vi.fn(() => chain),
    hierarchy: vi.fn((data) => ({
      ...data,
      descendants: () => [],
      links: () => [],
    })),
    tree: vi.fn(() => ({
      size: vi.fn(() => (data: any) => data),
    })),
  };
})

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
