import React, { useState, useMemo } from 'react'
import * as d3 from 'd3'
import { useGemBlueprintStore } from '../store/gem-blueprint-store'
import { getRarityColor, getNodeRadius } from '../utils/d3-tree-renderer'
import { Affix, Recipe } from '../store/types'

const CENTER = 450

/**
 * Get related gems for a selected gem:
 * - Ingredients (gems this one uses)
 * - Outputs (gems that can be made with this one)
 */
function getRelatedGems(
  selectedId: string,
  affixes: Affix[],
  recipes: Recipe[],
) {
  const selected = affixes.find((a) => a.id === selectedId)
  if (!selected) return { selected: null, ingredients: [], outputs: [] }

  const ingredients: Affix[] = []
  const outputs: Affix[] = []

  // Find recipes that output this gem
  recipes.forEach((recipe) => {
    if (recipe.output === selectedId && recipe.inputs.length > 0) {
      recipe.inputs.forEach((inputId) => {
        const affix = affixes.find((a) => a.id === inputId)
        if (affix && !ingredients.find((i) => i.id === affix.id)) {
          ingredients.push(affix)
        }
      })
    }
  })

  // Find recipes that use this gem as input
  recipes.forEach((recipe) => {
    if (recipe.inputs.includes(selectedId)) {
      const outputAffix = affixes.find((a) => a.id === recipe.output)
      if (outputAffix && !outputs.find((o) => o.id === outputAffix.id)) {
        outputs.push(outputAffix)
      }
    }
  })

  return { selected, ingredients, outputs }
}

interface FocusedViewProps {
  affixes: Affix[]
  recipes: Recipe[]
  selectedId: string | null
  onSelect: (id: string) => void
}

const FocusedView: React.FC<FocusedViewProps> = ({ affixes, recipes, selectedId, onSelect }) => {
  const svgRef = React.useRef<SVGSVGElement>(null)
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  const { selected, ingredients, outputs } = useMemo(
    () => (selectedId ? getRelatedGems(selectedId, affixes, recipes) : { selected: null, ingredients: [], outputs: [] }),
    [selectedId, affixes, recipes],
  )

  const filtered = useMemo(() => {
    return affixes.filter((a) => a.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name))
  }, [affixes, search])

  React.useEffect(() => {
    if (!svgRef.current || !selected) return

    const svg = d3.select(svgRef.current)

    // Get SVG dimensions
    const svgWidth = svgRef.current.clientWidth
    const svgHeight = svgRef.current.clientHeight
    const centerX = svgWidth / 2
    const centerY = svgHeight / 2

    // Clear all previous content
    svg.selectAll('*').remove()

    // Reset zoom transform
    svg.transition().duration(0)

    // Create new group at center
    const g = svg.append('g').attr('transform', `translate(${centerX},${centerY})`)

    // Center: selected gem
    const selectedGroup = g.append('g')
    selectedGroup
      .append('circle')
      .attr('r', getNodeRadius(2))
      .attr('fill', getRarityColor(selected.rarity))
      .attr('stroke', '#fbbf24')
      .attr('stroke-width', 3)

    selectedGroup
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.3em')
      .text(selected.name)
      .style('font-size', '12px')
      .style('font-weight', '600')
      .style('fill', '#e2e8f0')
      .style('pointer-events', 'none')

    // Left side: ingredients
    ingredients.forEach((ingredient, index) => {
      const angle = (Math.PI / (ingredients.length + 1)) * (index + 1) - Math.PI / 2
      const radius = 150
      const x = radius * Math.cos(angle)
      const y = radius * Math.sin(angle)

      // Link
      g.append('line')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', x)
        .attr('y2', y)
        .attr('stroke', '#64748b')
        .attr('stroke-width', 2)
        .attr('opacity', 0.5)

      // Node
      const node = g.append('g').attr('transform', `translate(${x},${y})`)
      node
        .append('circle')
        .attr('r', getNodeRadius(1))
        .attr('fill', getRarityColor(ingredient.rarity))
        .attr('stroke', 'none')
        .style('cursor', 'pointer')
        .on('click', () => {
          onSelect(ingredient.id)
          setShowDropdown(false)
        })
        .on('mouseenter', function () {
          d3.select(this).style('stroke', '#fbbf24').style('stroke-width', '2px')
        })
        .on('mouseleave', function () {
          d3.select(this).style('stroke', 'none')
        })

      node
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.3em')
        .text(ingredient.name)
        .style('font-size', '10px')
        .style('fill', '#cbd5e1')
        .style('pointer-events', 'none')
    })

    // Right side: outputs
    outputs.forEach((output, index) => {
      const angle = (Math.PI / (outputs.length + 1)) * (index + 1) + Math.PI / 2
      const radius = 150
      const x = radius * Math.cos(angle)
      const y = radius * Math.sin(angle)

      // Link
      g.append('line')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', x)
        .attr('y2', y)
        .attr('stroke', '#64748b')
        .attr('stroke-width', 2)
        .attr('opacity', 0.5)

      // Node
      const node = g.append('g').attr('transform', `translate(${x},${y})`)
      node
        .append('circle')
        .attr('r', getNodeRadius(1))
        .attr('fill', getRarityColor(output.rarity))
        .attr('stroke', 'none')
        .style('cursor', 'pointer')
        .on('click', () => {
          onSelect(output.id)
          setShowDropdown(false)
        })
        .on('mouseenter', function () {
          d3.select(this).style('stroke', '#fbbf24').style('stroke-width', '2px')
        })
        .on('mouseleave', function () {
          d3.select(this).style('stroke', 'none')
        })

      node
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.3em')
        .text(output.name)
        .style('font-size', '10px')
        .style('fill', '#cbd5e1')
        .style('pointer-events', 'none')
    })

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>().on('zoom', (event) => {
      g.attr('transform', event.transform)
    })

    svg.call(zoom)

    // Reset zoom to initial state (centered, no scale)
    svg.call(zoom.transform as any, d3.zoomIdentity.translate(centerX, centerY))

    // Pan support (drag to move)
    let isPanning = false
    let startX = 0
    let startY = 0

    svg.on('mousedown', (event: any) => {
      if (event.button === 2 || event.ctrlKey) {
        isPanning = true
        startX = event.clientX
        startY = event.clientY
      }
    })

    const handleMouseMove = (event: MouseEvent) => {
      if (isPanning && svgRef.current) {
        const dx = event.clientX - startX
        const dy = event.clientY - startY
        const currentTransform = d3.zoomTransform(svgRef.current)
        const newTransform = currentTransform.translate(dx / currentTransform.k, dy / currentTransform.k)
        g.attr('transform', newTransform.toString())
        startX = event.clientX
        startY = event.clientY
      }
    }

    const handleMouseUp = () => {
      isPanning = false
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    svg.on('contextmenu', (event: any) => event.preventDefault())

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [selected, ingredients, outputs, onSelect])

  if (!selected) {
    const baseCount = affixes.filter((a) => !a.categories.includes('compound')).length
    const compoundCount = affixes.filter((a) => a.categories.includes('compound')).length

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#1e293b' }}>
        <div style={{ padding: '12px', borderBottom: '1px solid #334155', backgroundColor: '#0f172a', position: 'relative' }}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '4px',
              color: '#cbd5e1',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Select a gem... ▼
          </button>

          {showDropdown && (
            <div
              style={{
                position: 'absolute',
                top: '48px',
                left: '12px',
                right: '12px',
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '4px',
                zIndex: 10,
                maxHeight: '300px',
                overflowY: 'auto',
              }}
            >
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: 'calc(100% - 16px)',
                  padding: '8px',
                  margin: '8px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  color: '#e2e8f0',
                  fontSize: '12px',
                }}
              />
              {filtered.map((affix) => (
                <button
                  key={affix.id}
                  onClick={() => {
                    onSelect(affix.id)
                    setShowDropdown(false)
                    setSearch('')
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#cbd5e1',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '13px',
                    borderBottom: '1px solid #1e293b',
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLButtonElement).style.backgroundColor = '#1e293b'
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLButtonElement).style.backgroundColor = 'transparent'
                  }}
                >
                  <span style={{ marginRight: '8px' }}>{affix.icon}</span>
                  {affix.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '16px', fontSize: '12px', color: '#94a3b8', lineHeight: '1.6' }}>
          <div style={{ marginBottom: '12px' }}>
            <strong style={{ color: '#cbd5e1' }}>Gem Blueprint Explorer</strong>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <span style={{ color: '#64748b' }}>Available Gems:</span>
            <div style={{ marginTop: '4px', fontSize: '13px' }}>
              • {baseCount} base gems
            </div>
            <div style={{ fontSize: '13px' }}>
              • {compoundCount} compound affixes
            </div>
          </div>
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #334155', fontSize: '11px' }}>
            Select a gem from the dropdown above to explore its ingredients and combinations.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#1e293b' }}>
      <div style={{ padding: '12px', borderBottom: '1px solid #334155', backgroundColor: '#0f172a', position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          style={{
            width: '100%',
            padding: '10px 12px',
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '4px',
            color: '#e2e8f0',
            textAlign: 'left',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          {selected.name} ▼
        </button>

        {showDropdown && (
          <div
            style={{
              position: 'absolute',
              top: '48px',
              left: '12px',
              right: '12px',
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '4px',
              zIndex: 10,
              maxHeight: '300px',
              overflowY: 'auto',
            }}
          >
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              style={{
                width: 'calc(100% - 16px)',
                padding: '8px',
                margin: '8px',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '4px',
                color: '#e2e8f0',
                fontSize: '12px',
              }}
            />
            {filtered.map((affix) => (
              <button
                key={affix.id}
                onClick={() => {
                  onSelect(affix.id)
                  setShowDropdown(false)
                  setSearch('')
                }}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: affix.id === selectedId ? '#3b82f6' : 'transparent',
                  border: 'none',
                  color: affix.id === selectedId ? '#fff' : '#cbd5e1',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '13px',
                  borderBottom: '1px solid #1e293b',
                }}
                onMouseEnter={(e) => {
                  if (affix.id !== selectedId) {
                    (e.target as HTMLButtonElement).style.backgroundColor = '#1e293b'
                  }
                }}
                onMouseLeave={(e) => {
                  if (affix.id !== selectedId) {
                    (e.target as HTMLButtonElement).style.backgroundColor = 'transparent'
                  }
                }}
              >
                <span style={{ marginRight: '8px' }}>{affix.icon}</span>
                {affix.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '8px 12px', fontSize: '11px', color: '#94a3b8', borderBottom: '1px solid #334155', flexShrink: 0 }}>
        Scroll to zoom • Ctrl+Click+Drag to pan
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <svg
          ref={svgRef}
          style={{ display: 'block', width: '100%', height: '100%', backgroundColor: '#1e293b' }}
        />
      </div>
    </div>
  )
}

export const RadialTreeBrowser: React.FC = () => {
  const { affixes, recipes, selectedNode, setSelectedNode } = useGemBlueprintStore()

  return (
    <div style={{ height: '100%', width: '100%', backgroundColor: '#0f172a' }}>
      <FocusedView affixes={affixes} recipes={recipes} selectedId={selectedNode} onSelect={setSelectedNode} />
    </div>
  )
}
