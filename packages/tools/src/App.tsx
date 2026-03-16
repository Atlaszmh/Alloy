import React, { useState } from 'react';
import type { SimulationResults, TabId } from './types';
import SimulationRunner from './components/SimulationRunner';
import AggregateView from './components/AggregateView';
import MatchInspector from './components/MatchInspector';
import BalanceReport from './components/BalanceReport';

const tabs: { id: TabId; label: string }[] = [
  { id: 'simulation', label: 'Simulation' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'inspector', label: 'Match Inspector' },
  { id: 'balance', label: 'Balance Report' },
];

const styles = {
  container: {
    minHeight: '100vh',
    background: '#0f1117',
    color: '#e4e4e7',
  } as React.CSSProperties,
  header: {
    padding: '16px 24px',
    borderBottom: '1px solid #27272a',
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
  } as React.CSSProperties,
  title: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#6366f1',
    letterSpacing: '-0.5px',
  } as React.CSSProperties,
  tabBar: {
    display: 'flex',
    gap: '4px',
  } as React.CSSProperties,
  tab: (active: boolean) => ({
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    background: active ? '#6366f1' : 'transparent',
    color: active ? '#fff' : '#a1a1aa',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: active ? 600 : 400,
    transition: 'all 0.15s',
  }) as React.CSSProperties,
  content: {
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto',
  } as React.CSSProperties,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('simulation');
  const [results, setResults] = useState<SimulationResults | null>(null);

  function handleSimulationComplete(r: SimulationResults) {
    setResults(r);
    setActiveTab('analytics');
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <span style={styles.title}>Alloy Balance Dashboard</span>
        <nav style={styles.tabBar}>
          {tabs.map((t) => (
            <button
              key={t.id}
              style={styles.tab(activeTab === t.id)}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main style={styles.content}>
        {activeTab === 'simulation' && (
          <SimulationRunner onComplete={handleSimulationComplete} />
        )}
        {activeTab === 'analytics' && (
          <AggregateView results={results} />
        )}
        {activeTab === 'inspector' && (
          <MatchInspector results={results} />
        )}
        {activeTab === 'balance' && (
          <BalanceReport results={results} />
        )}
      </main>
    </div>
  );
}
