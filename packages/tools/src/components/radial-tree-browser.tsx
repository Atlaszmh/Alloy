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
  const { affixes, recipes, selectedNode, setSelectedNode } = useGemBlueprintStore()

  useEffect(() => {
    if (!svgRef.current || affixes.length === 0) return

    // Create hierarchy
    const hierarchy = createRadialHierarchy(affixes, recipes)
    const radius = 260

    // Create tree layout
    const tree = d3.tree().size([2 * Math.PI, radius])
    const treeData = tree(hierarchy)

    // Select SVG
    const svg = d3.select(svgRef.current)

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
      .on('mouseenter', function () {
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
      .text((d: any) => d.data.name || '')
      .style('font-size', '10px')
  }, [affixes, recipes, selectedNode, setSelectedNode])

  return (
    <div className="w-full h-full flex-1 flex flex-col min-h-0 bg-slate-800">
      <svg
        ref={svgRef}
        className="radial-tree-svg flex-1"
        width={CONTAINER_SIZE}
        height={CONTAINER_SIZE}
        style={{ width: '100%', height: '100%', minHeight: 0 }}
      />
    </div>
  )
}
