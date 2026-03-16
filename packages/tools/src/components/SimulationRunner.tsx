import React, { useState } from 'react';
import type { AITier } from '@alloy/engine';
import type { SimulationConfig, SimulationResults } from '../types';
import { useSimulation } from '../hooks/useSimulation';

const AI_NAMES: Record<AITier, string> = {
  1: 'T1 - Apprentice',
  2: 'T2 - Journeyman',
  3: 'T3 - Artisan',
  4: 'T4 - Master',
  5: 'T5 - Alloy',
};

const card: React.CSSProperties = {
  background: '#1a1b23',
  border: '1px solid #27272a',
  borderRadius: '8px',
  padding: '24px',
  marginBottom: '16px',
};

const label: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  color: '#a1a1aa',
  marginBottom: '6px',
};

const input: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: '#0f1117',
  border: '1px solid #27272a',
  borderRadius: '6px',
  color: '#e4e4e7',
  fontSize: '14px',
  fontFamily: 'monospace',
};

const select: React.CSSProperties = {
  ...input,
  cursor: 'pointer',
};

const buttonStyle: React.CSSProperties = {
  padding: '10px 24px',
  background: '#6366f1',
  border: 'none',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'opacity 0.15s',
};

const progressBar: React.CSSProperties = {
  width: '100%',
  height: '8px',
  background: '#27272a',
  borderRadius: '4px',
  overflow: 'hidden',
  marginTop: '12px',
};

interface Props {
  onComplete: (results: SimulationResults) => void;
}

export default function SimulationRunner({ onComplete }: Props) {
  const [matchCount, setMatchCount] = useState(50);
  const [aiTier1, setAiTier1] = useState<AITier>(3);
  const [aiTier2, setAiTier2] = useState<AITier>(3);
  const [startingSeed, setStartingSeed] = useState(42);

  const sim = useSimulation();

  function handleRun() {
    const config: SimulationConfig = { matchCount, aiTier1, aiTier2, startingSeed };
    sim.run(config);
  }

  // Auto-switch to analytics on completion
  React.useEffect(() => {
    if (sim.results) {
      onComplete(sim.results);
    }
  }, [sim.results, onComplete]);

  const pct = sim.total > 0 ? (sim.progress / sim.total) * 100 : 0;

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>
        Run Batch Simulation
      </h2>

      <div style={{ ...card, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div>
          <span style={label}>Match Count</span>
          <input
            type="number"
            style={input}
            value={matchCount}
            min={1}
            max={1000}
            onChange={(e) => setMatchCount(Number(e.target.value))}
          />
        </div>

        <div>
          <span style={label}>Starting Seed</span>
          <input
            type="number"
            style={input}
            value={startingSeed}
            onChange={(e) => setStartingSeed(Number(e.target.value))}
          />
        </div>

        <div>
          <span style={label}>Player 0 AI Tier</span>
          <select
            style={select}
            value={aiTier1}
            onChange={(e) => setAiTier1(Number(e.target.value) as AITier)}
          >
            {([1, 2, 3, 4, 5] as AITier[]).map((t) => (
              <option key={t} value={t}>{AI_NAMES[t]}</option>
            ))}
          </select>
        </div>

        <div>
          <span style={label}>Player 1 AI Tier</span>
          <select
            style={select}
            value={aiTier2}
            onChange={(e) => setAiTier2(Number(e.target.value) as AITier)}
          >
            {([1, 2, 3, 4, 5] as AITier[]).map((t) => (
              <option key={t} value={t}>{AI_NAMES[t]}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={card}>
        <button
          style={{
            ...buttonStyle,
            opacity: sim.running ? 0.5 : 1,
            cursor: sim.running ? 'not-allowed' : 'pointer',
          }}
          onClick={handleRun}
          disabled={sim.running}
        >
          {sim.running ? 'Running...' : 'Run Simulation'}
        </button>

        {sim.running && (
          <>
            <button
              style={{
                ...buttonStyle,
                background: '#ef4444',
                marginLeft: '12px',
              }}
              onClick={sim.cancel}
            >
              Cancel
            </button>
            <div style={{ marginTop: '12px', fontSize: '14px', color: '#a1a1aa', fontFamily: 'monospace' }}>
              {sim.progress} / {sim.total} matches
            </div>
            <div style={progressBar}>
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: '#6366f1',
                  borderRadius: '4px',
                  transition: 'width 0.2s',
                }}
              />
            </div>
          </>
        )}

        {sim.error && (
          <div style={{ marginTop: '12px', color: '#ef4444', fontSize: '14px' }}>
            Error: {sim.error}
          </div>
        )}
      </div>
    </div>
  );
}
