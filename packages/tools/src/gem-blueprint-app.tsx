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
    <div className="h-screen bg-slate-900">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="bg-slate-950 border-b border-slate-700 px-6 py-4">
          <h1 className="text-2xl font-bold text-white">Gem Blueprint Tool</h1>
          <p className="text-sm text-slate-400">Design and test new gems, recipes, and synergies</p>
        </div>

        {/* Main Layout */}
        <TwoPaneLayout left={<RadialTreeBrowser />} right={<WorkbenchEditor />} />
      </div>
    </div>
  )
}
