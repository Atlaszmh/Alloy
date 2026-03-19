import React, { useState } from 'react';
import type { SimulationResults, TabId } from './types';
import SimulationPage from './pages/SimulationPage.js';
import SimulationRunner from './components/SimulationRunner';
import AggregateView from './components/AggregateView';
import MatchInspector from './components/MatchInspector';
import BalanceReport from './components/BalanceReport';
import MetaEvolutionPage from './pages/MetaEvolutionPage.js';
import MatchInspectorPage from './pages/MatchInspectorPage.js';

// Pages created by other agents — import with graceful fallback handled at build time.
// If these modules don't exist yet, the build will surface the error.
import OverviewPage from './pages/OverviewPage.js';
import BalancePage from './pages/BalancePage.js';
import RoundAnalysisPage from './pages/RoundAnalysisPage.js';
import DistributionsPage from './pages/DistributionsPage.js';
import ConfigEditorPage from './pages/ConfigEditorPage.js';

const tabs: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'simulation', label: 'Simulation' },
  { id: 'config', label: 'Config Editor' },
  { id: 'balance', label: 'Balance' },
  { id: 'rounds', label: 'Rounds' },
  { id: 'distributions', label: 'Distributions' },
  { id: 'meta', label: 'Meta Evolution' },
  { id: 'inspector', label: 'Inspector' },
  { id: 'quicksim', label: 'Quick Sim' },
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
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  title: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#6366f1',
    letterSpacing: '-0.5px',
    flexShrink: 0,
  } as React.CSSProperties,
  tabBar: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap' as const,
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
  placeholder: {
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: '8px',
    padding: '40px',
    textAlign: 'center' as const,
    color: '#a1a1aa',
    fontSize: '15px',
  } as React.CSSProperties,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
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
        {activeTab === 'overview' && <OverviewPage />}
        {activeTab === 'simulation' && <SimulationPage />}
        {activeTab === 'config' && <ConfigEditorPage />}
        {activeTab === 'balance' && <BalancePage />}
        {activeTab === 'rounds' && <RoundAnalysisPage />}
        {activeTab === 'distributions' && <DistributionsPage />}
        {activeTab === 'meta' && <MetaEvolutionPage />}
        {activeTab === 'inspector' && <MatchInspectorPage />}
        {activeTab === 'quicksim' && (
          <>
            <SimulationRunner onComplete={handleSimulationComplete} />
            {results && (
              <>
                <AggregateView results={results} />
                <MatchInspector results={results} />
                <BalanceReport results={results} />
              </>
            )}
          </>
        )}
        {activeTab === 'analytics' && <AggregateView results={results} />}
      </main>
    </div>
  );
}
