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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: '#0f172a' }}>
      {/* Main Layout - fills remaining space */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <TwoPaneLayout left={<RadialTreeBrowser />} right={<WorkbenchEditor />} />
      </div>
    </div>
  )
}
