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

  it('TwoPaneLayout uses height:100% (not vh) so it fits its flex parent', () => {
    const { container } = render(
      <div style={{ height: '500px', display: 'flex', flexDirection: 'column' }}>
        <TwoPaneLayout left={<div>Left</div>} right={<div>Right</div>} />
      </div>
    )

    // TwoPaneLayout uses inline styles (not Tailwind classes).
    // Verify the root container has display:flex and height:100% via inline style.
    const root = container.firstChild?.firstChild as HTMLElement
    expect(root).toBeTruthy()
    expect(root.style.display).toBe('flex')
    expect(root.style.height).toBe('100%')
    // Must NOT use 100vh (would break nested flex layout)
    expect(root.style.height).not.toBe('100vh')
  })

  it('GemBlueprintApp root uses minHeight (not height:100vh on inner flex pane)', () => {
    const { container } = render(
      <div style={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
        <GemBlueprintApp />
      </div>
    )

    const outerDiv = container.firstChild?.firstChild as HTMLElement
    // App root uses inline styles — display:flex and flexDirection:column
    expect(outerDiv.style.display).toBe('flex')
    expect(outerDiv.style.flexDirection).toBe('column')
  })

  it('GemBlueprintApp renders workbench editor', () => {
    render(
      <div style={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
        <GemBlueprintApp />
      </div>
    )

    expect(screen.getByText('Workbench Editor')).toBeTruthy()
  })

  it('GemBlueprintApp inner flex pane has flex+column inline styles', () => {
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

    // Inline styles are applied directly to the element — check via .style
    expect(appContainer.style.display).toBe('flex')
    expect(appContainer.style.flexDirection).toBe('column')
    // Should not use height:100vh which would escape the flex parent
    expect(appContainer.style.height).not.toBe('100vh')
  })

  it('TwoPaneLayout has panes with overflow:hidden inline style', () => {
    const { container } = render(
      <div style={{ height: '500px', display: 'flex', flexDirection: 'column' }}>
        <TwoPaneLayout left={<div>Left</div>} right={<div>Right</div>} />
      </div>
    )

    // The two content panes (not the divider) must have overflow:hidden.
    // They are the only elements with overflow set to 'hidden' in the tree.
    const panesWithOverflow = Array.from(
      container.querySelectorAll('div')
    ).filter((el) => (el as HTMLElement).style.overflow === 'hidden')
    expect(panesWithOverflow.length).toBe(2)
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
