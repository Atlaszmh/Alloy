import { useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { useMatchGateway, GatewayProvider } from '@/gateway';
import { useMatchStore, selectIsRunMode, selectAiOpponentTier } from '@/stores/matchStore';
import { DiscoveryCounter } from '@/components/DiscoveryCounter';
import { PhaseErrorBoundary } from '@/components/PhaseErrorBoundary';
import { PhaseTransitionWrapper } from '@/animation/PhaseTransitionWrapper';
import { RunLivesDisplay } from '@/components/RunLivesDisplay';
import { RunRoundCounter } from '@/components/RunRoundCounter';
import { RunStatusOverlay } from '@/components/RunStatusOverlay';
import { ToastContainer } from '@/components/Toast';
import { useFrameMode } from '@/hooks/useFrameMode';
import { Draft } from './Draft';
import { Forge } from './Forge';
import { Duel } from './Duel';
import { PostMatch } from './PostMatch';

// How long to keep Draft mounted for the forge slam animation before sliding out
const DRAFT_EXIT_DELAY_MS = 5500;

export function PhaseRouter() {
  const { code } = useParams<{ code: string }>();
  const [, forceUpdate] = useState(0);
  const isRunMode = useMatchStore(selectIsRunMode);
  const aiOpponentTier = useMatchStore(selectAiOpponentTier);
  const frameMode = useFrameMode();

  const gateway = useMatchGateway(code ?? '');

  const matchState = gateway?.getState() ?? null;
  const phase = matchState?.phase ?? null;
  const phaseKey = phase ? phase.kind + ('round' in phase ? `-r${phase.round}` : '') : 'loading';

  // All hooks must be called unconditionally (Rules of Hooks)
  const [displayPhaseKey, setDisplayPhaseKey] = useState(phaseKey);
  const [displayPhaseKind, setDisplayPhaseKind] = useState(phase?.kind ?? 'draft');
  const prevPhaseKindRef = useRef(phase?.kind ?? 'draft');

  useEffect(() => {
    if (!gateway) return;
    return gateway.subscribe(() => forceUpdate((n) => n + 1));
  }, [gateway]);

  useEffect(() => {
    if (!phase) return;
    const prevKind = prevPhaseKindRef.current;
    prevPhaseKindRef.current = phase.kind;

    if (prevKind === 'draft' && phase.kind === 'forge') {
      // Delay the key update so Draft stays mounted for forge slam
      const timer = setTimeout(() => {
        setDisplayPhaseKey(phaseKey);
        setDisplayPhaseKind(phase.kind);
      }, DRAFT_EXIT_DELAY_MS);
      return () => clearTimeout(timer);
    }

    // For all other transitions, update immediately
    setDisplayPhaseKey(phaseKey);
    setDisplayPhaseKind(phase.kind);
  }, [phaseKey, phase?.kind]);

  if (!code) {
    return <Navigate to="/queue" replace />;
  }

  if (!gateway || !matchState || !phase) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
        <h2
          className="text-2xl font-bold text-accent-400"
          style={{ fontFamily: 'var(--font-family-display)' }}
        >
          Loading Match...
        </h2>
        <p className="animate-pulse text-sm text-surface-400">Please wait</p>
      </div>
    );
  }

  function renderPhase() {
    switch (displayPhaseKind) {
      case 'draft':
        return <Draft />;
      case 'forge':
        return <Forge />;
      case 'duel':
        return <Duel />;
      case 'complete':
        return <PostMatch />;
      default:
        console.warn('[PhaseRouter] Unknown phase:', phase);
        return <Navigate to="/queue" replace />;
    }
  }

  return (
    <GatewayProvider value={gateway}>
      <div className="flex h-full flex-col">
        {/* Run mode header bar.
         *
         * Desktop Forge HUD (ForgeTopBar) already renders lives + round + VS,
         * so suppress this top banner in desktop frame mode while on the forge
         * phase to avoid a duplicate "N Lives" heart row stacking above the
         * HUD. Portrait (and other desktop phases that have not yet been
         * HUD-ified, e.g. Duel) continue to show this banner. */}
        {isRunMode &&
          phase?.kind !== 'complete' &&
          !(frameMode === 'desktop' && phase?.kind === 'forge') && (
          <div
            className="flex shrink-0 items-center justify-between px-3 py-1.5"
            style={{
              background: 'var(--color-surface-900)',
              borderBottom: '1px solid var(--color-surface-700)',
            }}
          >
            <RunLivesDisplay />
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)' }}>
              {aiOpponentTier != null && (
                <span
                  data-testid="opponent-tier-chip"
                  style={{
                    fontFamily: 'var(--font-family-display)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-surface-300)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  vs AI T{aiOpponentTier}
                </span>
              )}
              <RunRoundCounter />
              {matchState.runState && (
                <DiscoveryCounter
                  count={matchState.discoveryState?.totalDiscoveryCount() ?? 0}
                />
              )}
            </div>
          </div>
        )}

        {/* Phase content */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <PhaseErrorBoundary resetKey={phase.kind}>
            <PhaseTransitionWrapper phaseKey={displayPhaseKey}>
              {renderPhase()}
            </PhaseTransitionWrapper>
          </PhaseErrorBoundary>
        </div>
      </div>

      {/* Run status overlay (shown when run ends) */}
      {isRunMode && <RunStatusOverlay />}

      {/* Global toast container (discovery + default toasts) */}
      <ToastContainer />
    </GatewayProvider>
  );
}
