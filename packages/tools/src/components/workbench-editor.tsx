import React, { useState } from 'react'
import { useGemBlueprintStore } from '../store/gem-blueprint-store'
import { StatsAnalyzer } from './stats-analyzer'

type TabType = 'affixes' | 'recipes' | 'synergies' | 'stats'

export const WorkbenchEditor: React.FC = () => {
  const { selectedNode, affixes, recipes, synergies } = useGemBlueprintStore()
  const [activeTab, setActiveTab] = useState<TabType>('affixes')

  const selectedAffix = selectedNode ? affixes.find((a) => a.id === selectedNode) : null

  // Find recipes that involve this gem
  const relatedRecipes = selectedNode
    ? recipes.filter((r) => r.inputs.includes(selectedNode) || r.output === selectedNode)
    : []

  // Find synergies that reference this gem
  const relatedSynergies = selectedNode ? synergies.filter((s) => s.trigger === selectedNode) : []

  const tabButtonStyle = (isActive: boolean) => ({
    padding: '0.5rem 0.75rem',
    border: 'none',
    backgroundColor: 'transparent',
    color: isActive ? '#e2e8f0' : '#94a3b8',
    cursor: 'pointer',
    fontSize: '0.875rem',
    borderBottom: isActive ? '2px solid #6366f1' : 'none',
    fontWeight: isActive ? 600 : 400,
    transition: 'color 0.2s',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, minHeight: 0, backgroundColor: '#1e293b', color: '#e2e8f0' }}>
      {/* Workbench Header */}
      <div style={{ borderBottom: '1px solid #334155', padding: '1.5rem', backgroundColor: '#0f172a' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Workbench Editor</h2>
        <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
          {selectedAffix ? `${selectedAffix.icon} ${selectedAffix.name}` : 'Select a gem to view details'}
        </p>
      </div>

      {selectedNode && selectedAffix && (
        <>
          {/* Tabs */}
          <div style={{ padding: '0 1.5rem', marginTop: '1rem', display: 'flex', gap: '0.5rem', borderBottom: '1px solid #334155' }}>
            <button
              onClick={() => setActiveTab('affixes')}
              style={tabButtonStyle(activeTab === 'affixes') as React.CSSProperties}
            >
              Affixes
            </button>
            <button
              onClick={() => setActiveTab('recipes')}
              style={tabButtonStyle(activeTab === 'recipes') as React.CSSProperties}
            >
              Recipes
            </button>
            <button
              onClick={() => setActiveTab('synergies')}
              style={tabButtonStyle(activeTab === 'synergies') as React.CSSProperties}
            >
              Synergies
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              style={tabButtonStyle(activeTab === 'stats') as React.CSSProperties}
            >
              Stats
            </button>
          </div>

          {/* Content Panel */}
          <div style={{ flex: 1, padding: '1.5rem', overflow: 'auto' }}>
            {activeTab === 'affixes' && (
              <div>
                {/* Description Section */}
                <div
                  style={{
                    backgroundColor: '#334155',
                    padding: '1.25rem',
                    borderRadius: '0.375rem',
                    marginBottom: '1.5rem',
                    borderLeft: '4px solid #6366f1',
                  }}
                >
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.75rem' }}>
                    {selectedAffix.categories.includes('compound') ? '✨ Compound Effect' : '⚔️ Effect Description'}
                  </h4>
                  <p style={{ color: '#e2e8f0', fontSize: '0.95rem', lineHeight: '1.6', margin: 0 }}>
                    {selectedAffix.description}
                  </p>
                </div>

                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '1rem' }}>Properties</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Name</p>
                    <p style={{ color: '#e2e8f0', fontWeight: 600 }}>{selectedAffix.name}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Rarity</p>
                    <p style={{ color: '#e2e8f0', textTransform: 'capitalize' }}>{selectedAffix.rarity}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Tier</p>
                    <p style={{ color: '#e2e8f0' }}>{selectedAffix.tier}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Categories</p>
                    <p style={{ color: '#e2e8f0' }}>{selectedAffix.categories.join(', ')}</p>
                  </div>
                  {selectedAffix.tags.length > 0 && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <p style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Tags</p>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {selectedAffix.tags.map((tag) => (
                          <span
                            key={tag}
                            style={{
                              padding: '0.25rem 0.5rem',
                              backgroundColor: '#334155',
                              borderRadius: '0.25rem',
                              fontSize: '0.75rem',
                              color: '#cbd5e1',
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {selectedAffix.tierEffects && Object.keys(selectedAffix.tierEffects).length > 0 && (
                  <>
                    <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '1rem' }}>Effects by Tier</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {Object.entries(selectedAffix.tierEffects).map(([tierKey, effects]) => (
                        <div
                          key={tierKey}
                          style={{
                            backgroundColor: '#334155',
                            padding: '1rem',
                            borderRadius: '0.375rem',
                            borderLeft: '3px solid #8b5cf6',
                          }}
                        >
                          <p style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.75rem', fontWeight: 600 }}>
                            Tier {tierKey}
                          </p>

                          {effects.weaponEffect.length > 0 && (
                            <div style={{ marginBottom: '0.75rem' }}>
                              <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.5rem' }}>Weapon</p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                {effects.weaponEffect.map((effect, idx) => (
                                  <p key={idx} style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>
                                    <span style={{ color: '#94a3b8' }}>{effect.stat}</span>: <span style={{ color: '#fbbf24' }}>
                                      {effect.op === 'flat' ? '+' : effect.op === 'percent' ? '+' : ''}{effect.value}{effect.op === 'percent' ? '%' : ''}
                                    </span>
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}

                          {effects.armorEffect.length > 0 && (
                            <div>
                              <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.5rem' }}>Armor</p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                {effects.armorEffect.map((effect, idx) => (
                                  <p key={idx} style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>
                                    <span style={{ color: '#94a3b8' }}>{effect.stat}</span>: <span style={{ color: '#34d399' }}>
                                      {effect.op === 'flat' ? '+' : effect.op === 'percent' ? '+' : ''}{effect.value}{effect.op === 'percent' ? '%' : ''}
                                    </span>
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}

                          {effects.valueRange && effects.valueRange[0] !== 0 && effects.valueRange[1] !== 0 && (
                            <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                              Range: {effects.valueRange[0]} - {effects.valueRange[1]}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'recipes' && (
              <div>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '1rem' }}>
                  Recipes ({relatedRecipes.length})
                </h3>
                {relatedRecipes.length === 0 ? (
                  <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No recipes involve this gem.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {relatedRecipes.map((recipe) => {
                      const inputAffixes = recipe.inputs.map((id) => affixes.find((a) => a.id === id)).filter(Boolean)
                      const outputAffix = affixes.find((a) => a.id === recipe.output)
                      const isProducer = recipe.output === selectedNode
                      const isIngredient = recipe.inputs.includes(selectedNode)

                      return (
                        <div
                          key={recipe.id}
                          style={{
                            backgroundColor: '#334155',
                            padding: '1rem',
                            borderRadius: '0.375rem',
                            borderLeft: '3px solid #6366f1',
                          }}
                        >
                          <p style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                            {isProducer ? 'Produces' : 'Uses as ingredient'}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                            {inputAffixes.map((affix, i) => (
                              <div key={affix!.id}>
                                <span style={{ fontSize: '1.5rem', marginRight: '0.25rem' }}>{affix!.icon}</span>
                                <span style={{ color: '#cbd5e1' }}>{affix!.name}</span>
                                {i < inputAffixes.length - 1 && <span style={{ color: '#64748b', margin: '0 0.5rem' }}>+</span>}
                              </div>
                            ))}
                            <span style={{ color: '#64748b' }}>→</span>
                            {outputAffix && (
                              <div>
                                <span style={{ fontSize: '1.5rem', marginRight: '0.25rem' }}>{outputAffix.icon}</span>
                                <span style={{ color: '#cbd5e1' }}>{outputAffix.name}</span>
                              </div>
                            )}
                          </div>
                          <p style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            Type: {recipe.type} • Depth: {recipe.depth} • Weight: {recipe.weight}
                          </p>
                          {recipe.notes && <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginTop: '0.5rem' }}>{recipe.notes}</p>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'synergies' && (
              <div>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '1rem' }}>
                  Synergies ({relatedSynergies.length})
                </h3>
                {relatedSynergies.length === 0 ? (
                  <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No synergies trigger from this gem.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {relatedSynergies.map((synergy) => (
                      <div
                        key={synergy.id}
                        style={{
                          backgroundColor: '#334155',
                          padding: '1rem',
                          borderRadius: '0.375rem',
                          borderLeft: '3px solid #f59e0b',
                        }}
                      >
                        <p style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                          {synergy.category}
                        </p>
                        <p style={{ color: '#cbd5e1', fontWeight: 600, marginBottom: '0.5rem' }}>{synergy.effect.description}</p>
                        {synergy.conditions && synergy.conditions.affixesPresent && synergy.conditions.affixesPresent.length > 0 && (
                          <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                            Requires: {synergy.conditions.affixesPresent.map((id) => affixes.find((a) => a.id === id)?.name || id).join(', ')}
                          </p>
                        )}
                        <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                          Strength: {synergy.strength} • Effect: {synergy.effect.type}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'stats' && (
              <StatsAnalyzer selectedAffix={selectedAffix} affixes={affixes} recipes={recipes} />
            )}
          </div>
        </>
      )}

      {!selectedNode && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#64748b', textAlign: 'center' }}>Select a gem from the tree to view details</p>
        </div>
      )}

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
