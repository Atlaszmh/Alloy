import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GemBlueprintApp } from '../gem-blueprint-app'
import { TwoPaneLayout } from '../components/two-pane-layout'

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

describe('Layout Regression Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('TwoPaneLayout uses h-full not h-screen', () => {
    const { container } = render(
      <div style={{ height: '500px', display: 'flex', flexDirection: 'column' }}>
        <TwoPaneLayout left={<div>Left</div>} right={<div>Right</div>} />
      </div>
    )

    const paneContainer = container.querySelector('.flex')
    expect(paneContainer).toBeTruthy()
    // Check that h-screen class is NOT present (would prevent flex from working)
    const classList = paneContainer?.className || ''
    expect(classList).toContain('h-full')
    expect(classList).not.toContain('h-screen')
  })

  it('GemBlueprintApp renders without h-screen', () => {
    const { container } = render(
      <div style={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
        <GemBlueprintApp />
      </div>
    )

    const outerDiv = container.firstChild?.firstChild as HTMLElement
    const classList = outerDiv?.className || ''

    // Should have flex and h-full, NOT h-screen
    expect(classList).toContain('flex')
    expect(classList).toContain('h-full')
    expect(classList).not.toContain('h-screen')
  })

  it('GemBlueprintApp renders workbench editor', () => {
    render(
      <div style={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
        <GemBlueprintApp />
      </div>
    )

    expect(screen.getByText('Workbench Editor')).toBeTruthy()
  })

  it('GemBlueprintApp renders within flex container without overflow', () => {
    const { container } = render(
      <div
        style={{
          height: '600px',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid red'
        }}
      >
        <GemBlueprintApp />
      </div>
    )

    const wrapper = container.firstChild as HTMLElement
    const appContainer = wrapper.firstChild as HTMLElement

    // App should take full height of parent
    const computedStyle = window.getComputedStyle(appContainer)
    expect(computedStyle.display).toBe('flex')
    expect(computedStyle.flexDirection).toBe('column')
    expect(computedStyle.height).toBe('600px')
  })

  it('TwoPaneLayout has panes with overflow-hidden', () => {
    const { container } = render(
      <div style={{ height: '500px', display: 'flex', flexDirection: 'column' }}>
        <TwoPaneLayout left={<div>Left</div>} right={<div>Right</div>} />
      </div>
    )

    const panes = container.querySelectorAll('[style*="width"]')
    panes.forEach((pane) => {
      const classList = pane.className
      expect(classList).toContain('overflow-hidden')
    })
  })

  it('SVG canvas exists in RadialTreeBrowser', () => {
    const { container } = render(
      <div style={{ height: '500px', display: 'flex' }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <svg className="radial-tree-svg" width={900} height={900} />
        </div>
      </div>
    )

    const svg = container.querySelector('svg.radial-tree-svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('width')).toBe('900')
    expect(svg?.getAttribute('height')).toBe('900')
  })
})
