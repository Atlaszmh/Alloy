import React from 'react'
import { useGemBlueprintStore } from '../store/gem-blueprint-store'

export const WorkbenchEditor: React.FC = () => {
  const { selectedNode, editMode } = useGemBlueprintStore()

  return (
    <div className="flex flex-col h-full flex-1 min-h-0 bg-slate-800 text-slate-100">
      {/* Workbench Header */}
      <div className="border-b border-slate-700 px-6 py-4 bg-slate-900">
        <h2 className="text-lg font-semibold">Workbench Editor</h2>
        <p className="text-sm text-slate-400">
          {selectedNode ? `Editing: ${selectedNode}` : 'Select a node to edit'}
        </p>
      </div>

      {/* Tabs (placeholder for Phase 2) */}
      <div className="workbench-tabs px-6 mt-4">
        <button className="workbench-tab active">Affixes</button>
        <button className="workbench-tab">Recipes</button>
        <button className="workbench-tab">Synergies</button>
      </div>

      {/* Editor Panel (placeholder) */}
      <div className="flex-1 p-6 overflow-auto">
        {selectedNode ? (
          <div className="bg-slate-700 p-4 rounded">
            <p className="text-slate-300">Editor form for {selectedNode} goes here (Phase 2)</p>
            <p className="text-sm text-slate-500 mt-2">Mode: {editMode}</p>
          </div>
        ) : (
          <div className="text-slate-500 text-center py-12">
            <p>Select a gem from the tree to begin editing</p>
          </div>
        )}
      </div>

      {/* Toolbar (placeholder) */}
      <div className="border-t border-slate-700 px-6 py-4 flex gap-2 bg-slate-900">
        <button className="button button-primary">Save Changes</button>
        <button className="button button-secondary">Revert</button>
        <button className="button button-secondary">Test in Sim</button>
        <button className="button button-secondary">Export</button>
        <button className="button button-secondary">Import</button>
      </div>
    </div>
  )
}
