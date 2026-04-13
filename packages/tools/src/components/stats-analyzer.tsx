import React from 'react'
import { Affix, Recipe } from '../store/types'

interface StatsAnalyzerProps {
  selectedAffix: Affix
  affixes: Affix[]
  recipes: Recipe[]
}

interface StatAggregate {
  stat: string
  totalValue: number
  average: number
  min: number
  max: number
  weaponCount: number
  armorCount: number
}

export const StatsAnalyzer: React.FC<StatsAnalyzerProps> = ({ selectedAffix, affixes, recipes }) => {
  // Extract all stats and their values across tiers
  const getAggregateStats = (): StatAggregate[] => {
    if (!selectedAffix.tierEffects) return []

    const statMap = new Map<string, StatAggregate>()

    Object.values(selectedAffix.tierEffects).forEach((tier) => {
      ;[...tier.weaponEffect, ...tier.armorEffect].forEach((effect) => {
        const key = effect.stat
        if (!statMap.has(key)) {
          statMap.set(key, {
            stat: key,
            totalValue: 0,
            average: 0,
            min: Infinity,
            max: -Infinity,
            weaponCount: 0,
            armorCount: 0,
          })
        }
        const stat = statMap.get(key)!
        const absValue = Math.abs(effect.value)
        stat.totalValue += absValue
        stat.min = Math.min(stat.min, absValue)
        stat.max = Math.max(stat.max, absValue)
        if (tier.weaponEffect.includes(effect)) stat.weaponCount++
        if (tier.armorEffect.includes(effect)) stat.armorCount++
      })
    })

    const aggregates = Array.from(statMap.values())
    aggregates.forEach((stat) => {
      stat.average = stat.totalValue / (stat.weaponCount + stat.armorCount || 1)
    })

    return aggregates.sort((a, b) => b.totalValue - a.totalValue)
  }

  // Get recipes using this gem
  const getRecipesWithGem = () => {
    return recipes.filter((r) => r.inputs.includes(selectedAffix.id) || r.output === selectedAffix.id)
  }

  // Get combination impact - what stats result from recipes using this gem
  const getCombinationStats = () => {
    const recipesWithGem = getRecipesWithGem()
    const combinationAffixes = new Map<string, Affix>()

    recipesWithGem.forEach((recipe) => {
      if (recipe.output !== selectedAffix.id) {
        const outputAffix = affixes.find((a) => a.id === recipe.output)
        if (outputAffix) {
          combinationAffixes.set(recipe.output, outputAffix)
        }
      }
    })

    return Array.from(combinationAffixes.values())
  }

  const aggregateStats = getAggregateStats()
  const combinationAffixes = getCombinationStats()
  const recipesWithGem = getRecipesWithGem()

  const getStatColor = (value: number) => {
    if (value > 50) return '#dc2626' // Red for high
    if (value > 30) return '#f97316' // Orange
    if (value > 15) return '#eab308' // Yellow
    if (value > 5) return '#22c55e' // Green
    return '#6b7280' // Gray for low
  }

  const getStatCategory = (stat: string): string => {
    const lower = stat.toLowerCase()
    if (lower.includes('damage') || lower.includes('crit') || lower.includes('attack')) return '⚔️'
    if (lower.includes('defense') || lower.includes('armor') || lower.includes('resist')) return '🛡️'
    if (lower.includes('life') || lower.includes('regen') || lower.includes('heal')) return '💚'
    if (lower.includes('speed') || lower.includes('attack speed')) return '⚡'
    return '✨'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Stat Heatmap */}
      <div>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '1rem' }}>
          Stat Distribution
        </h3>
        {aggregateStats.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No stats available</p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {aggregateStats.map((stat) => (
              <div
                key={stat.stat}
                style={{
                  backgroundColor: '#334155',
                  padding: '0.75rem',
                  borderRadius: '0.375rem',
                  borderLeft: `3px solid ${getStatColor(stat.totalValue)}`,
                  transition: 'all 0.2s',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLDivElement).style.backgroundColor = '#475569'
                  ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLDivElement).style.backgroundColor = '#334155'
                  ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span>{getStatCategory(stat.stat)}</span>
                  <p style={{ fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 600, flex: 1 }}>{stat.stat}</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.7rem' }}>
                  <div>
                    <p style={{ color: '#64748b' }}>Total</p>
                    <p style={{ color: getStatColor(stat.totalValue), fontWeight: 600 }}>+{Math.round(stat.totalValue)}</p>
                  </div>
                  <div>
                    <p style={{ color: '#64748b' }}>Avg</p>
                    <p style={{ color: '#94a3b8' }}>+{stat.average.toFixed(1)}</p>
                  </div>
                  <div>
                    <p style={{ color: '#64748b' }}>Min</p>
                    <p style={{ color: '#94a3b8' }}>{Math.round(stat.min)}</p>
                  </div>
                  <div>
                    <p style={{ color: '#64748b' }}>Max</p>
                    <p style={{ color: '#94a3b8' }}>{Math.round(stat.max)}</p>
                  </div>
                </div>
                <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.5rem' }}>
                  W: {stat.weaponCount} • A: {stat.armorCount}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stat Profile Radar */}
      <div>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '1rem' }}>
          Power Profile
        </h3>
        <div
          style={{
            backgroundColor: '#334155',
            padding: '1.5rem',
            borderRadius: '0.375rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <svg width="100%" height="200" viewBox="0 0 300 200" style={{ overflow: 'visible' }}>
            {/* Grid background */}
            <defs>
              <linearGradient id="statGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#ec4899" stopOpacity="0.3" />
              </linearGradient>
            </defs>

            {/* Axes */}
            <line x1="150" y1="20" x2="150" y2="180" stroke="#475569" strokeWidth="1" />
            <line x1="30" y1="100" x2="270" y2="100" stroke="#475569" strokeWidth="1" />

            {/* Grid circles */}
            {[50, 100, 150].map((r) => (
              <circle key={r} cx="150" cy="100" r={r} fill="none" stroke="#334155" strokeWidth="0.5" opacity="0.5" />
            ))}

            {/* Data visualization */}
            {aggregateStats.length > 0 && (
              <g>
                {aggregateStats.map((stat, i) => {
                  const angle = (i / aggregateStats.length) * Math.PI * 2 - Math.PI / 2
                  const r = Math.min((stat.totalValue / 100) * 150, 150)
                  const x = 150 + r * Math.cos(angle)
                  const y = 100 + r * Math.sin(angle)
                  return (
                    <g key={i}>
                      <line x1="150" y1="100" x2={x} y2={y} stroke="#6366f1" strokeWidth="2" opacity="0.6" />
                      <circle cx={x} cy={y} r="4" fill={getStatColor(stat.totalValue)} />
                    </g>
                  )
                })}
              </g>
            )}
          </svg>

          <p style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'center' }}>
            {aggregateStats.length} stats tracked across all tiers
          </p>
        </div>
      </div>

      {/* Combination Analyzer */}
      {combinationAffixes.length > 0 && (
        <div>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '1rem' }}>
            Combination Impacts ({combinationAffixes.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {combinationAffixes.map((combo) => {
              const recipe = recipesWithGem.find((r) => r.output === combo.id)
              const inputAffixes = recipe
                ? recipe.inputs.map((id) => affixes.find((a) => a.id === id)).filter(Boolean)
                : []
              const comboStats = combo.tierEffects ? Object.values(combo.tierEffects)[0] : null
              const statCount = comboStats ? comboStats.weaponEffect.length + comboStats.armorEffect.length : 0

              return (
                <div
                  key={combo.id}
                  style={{
                    backgroundColor: '#334155',
                    padding: '1rem',
                    borderRadius: '0.375rem',
                    borderLeft: '3px solid #a78bfa',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '1.25rem' }}>{combo.icon}</span>
                      <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{combo.name}</span>
                      <span style={{ color: '#64748b', fontSize: '0.75rem' }}>({combo.rarity})</span>
                    </div>
                    {inputAffixes.length > 0 && (
                      <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        From: {inputAffixes.map((a) => a?.name || '?').join(' + ')}
                      </p>
                    )}
                  </div>
                  {comboStats && (
                    <div
                      style={{
                        padding: '0.5rem 0.75rem',
                        backgroundColor: '#1e293b',
                        borderRadius: '0.25rem',
                        textAlign: 'right',
                      }}
                    >
                      <p style={{ fontSize: '0.7rem', color: '#64748b' }}>Stats</p>
                      <p style={{ fontSize: '0.875rem', color: '#fbbf24', fontWeight: 600 }}>
                        {statCount} effects
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div
        style={{
          backgroundColor: '#334155',
          padding: '1rem',
          borderRadius: '0.375rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem',
        }}
      >
        <div>
          <p style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
            Unique Stats
          </p>
          <p style={{ fontSize: '1.5rem', color: '#fbbf24', fontWeight: 600 }}>{aggregateStats.length}</p>
        </div>
        <div>
          <p style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
            Recipes
          </p>
          <p style={{ fontSize: '1.5rem', color: '#34d399', fontWeight: 600 }}>{recipesWithGem.length}</p>
        </div>
        <div>
          <p style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
            Combinations
          </p>
          <p style={{ fontSize: '1.5rem', color: '#a78bfa', fontWeight: 600 }}>{combinationAffixes.length}</p>
        </div>
      </div>
    </div>
  )
}
