import React from 'react'
import { useGemBlueprintStore } from '../store/gem-blueprint-store'

export const WorkbenchEditor: React.FC = () => {
  const { selectedNode, editMode } = useGemBlueprintStore()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, minHeight: 0, backgroundColor: '#1e293b', color: '#e2e8f0' }}>
      {/* Workbench Header */}
      <div style={{ borderBottom: '1px solid #334155', padding: '1.5rem', backgroundColor: '#0f172a' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Workbench Editor</h2>
        <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
          {selectedNode ? `Editing: ${selectedNode}` : 'Select a node to edit'}
        </p>
      </div>

      {/* Tabs (placeholder for Phase 2) */}
      <div style={{ padding: '0 1.5rem', marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
        <button style={{ padding: '0.5rem 0.75rem', border: 'none', backgroundColor: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.875rem', borderBottom: '2px solid #6366f1' }}>Affixes</button>
        <button style={{ padding: '0.5rem 0.75rem', border: 'none', backgroundColor: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.875rem' }}>Recipes</button>
        <button style={{ padding: '0.5rem 0.75rem', border: 'none', backgroundColor: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.875rem' }}>Synergies</button>
      </div>

      {/* Editor Panel (placeholder) */}
      <div style={{ flex: 1, padding: '1.5rem', overflow: 'auto' }}>
        {selectedNode ? (
          <div style={{ backgroundColor: '#334155', padding: '1rem', borderRadius: '0.375rem' }}>
            <p style={{ color: '#cbd5e1' }}>Editor form for {selectedNode} goes here (Phase 2)</p>
            <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>Mode: {editMode}</p>
          </div>
        ) : (
          <div style={{ color: '#64748b', textAlign: 'center', paddingTop: '3rem' }}>
            <p>Select a gem from the tree to begin editing</p>
          </div>
        )}
      </div>

      {/* Toolbar (placeholder) */}
      <div style={{ borderTop: '1px solid #334155', padding: '1rem 1.5rem', display: 'flex', gap: '0.5rem', backgroundColor: '#0f172a' }}>
        <button style={{ padding: '0.5rem 1rem', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}>Save Changes</button>
        <button style={{ padding: '0.5rem 1rem', backgroundColor: 'transparent', color: '#e2e8f0', border: '1px solid #475569', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}>Revert</button>
        <button style={{ padding: '0.5rem 1rem', backgroundColor: 'transparent', color: '#e2e8f0', border: '1px solid #475569', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}>Test in Sim</button>
        <button style={{ padding: '0.5rem 1rem', backgroundColor: 'transparent', color: '#e2e8f0', border: '1px solid #475569', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}>Export</button>
        <button style={{ padding: '0.5rem 1rem', backgroundColor: 'transparent', color: '#e2e8f0', border: '1px solid #475569', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}>Import</button>
      </div>
    </div>
  )
}
