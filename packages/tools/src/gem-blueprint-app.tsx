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
    <div className="flex flex-col h-full w-full bg-slate-900">
      {/* Main Layout - fills remaining space */}
      <div className="flex-1 min-h-0">
        <TwoPaneLayout left={<RadialTreeBrowser />} right={<WorkbenchEditor />} />
      </div>
    </div>
  )
}
