import { useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { useMatchGateway, GatewayProvider } from '@/gateway';
import { PhaseErrorBoundary } from '@/components/PhaseErrorBoundary';
import { Draft } from './Draft';
import { Forge } from './Forge';
import { Duel } from './Duel';
import { Adapt } from './Adapt';
import { PostMatch } from './PostMatch';

// Duration to keep Draft mounted after draft completes (for end-of-draft animation)
const DRAFT_END_HOLD_MS = 6000;
const SLIDE_OUT_MS = 400;
const SLIDE_IN_MS = 400;
const SLIDE_GAP_MS = 150;

export function PhaseRouter() {
  const { code } = useParams<{ code: string }>();
  const [, forceUpdate] = useState(0);
  const [transitionLabel, setTransitionLabel] = useState<string | null>(null);
  const prevPhaseRef = useRef<string | null>(null);
  // Delayed phase: keeps rendering the previous phase component during transitions
  const [heldPhase, setHeldPhase] = useState<string | null>(null);
  // Slide transition: 'out' = old screen sliding left, 'in' = new screen sliding in from right
  const [slideState, setSlideState] = useState<'idle' | 'out' | 'gap' | 'in'>('idle');

  // Always call hooks unconditionally — pass empty string if code is missing
  const gateway = useMatchGateway(code ?? '');

  useEffect(() => {
    return gateway.subscribe(() => forceUpdate((n) => n + 1));
  }, [gateway]);

  const matchState = gateway.getState();

  useEffect(() => {
    const currentKind = matchState?.phase.kind ?? null;
    const prevKind = prevPhaseRef.current;
    prevPhaseRef.current = currentKind;

    if (prevKind && currentKind && prevKind !== currentKind) {
      // When leaving draft, hold the draft component mounted for the end animation,
      // then slide out the draft screen and slide in the forge screen
      if (prevKind === 'draft' && currentKind === 'forge') {
        setHeldPhase('draft');
        const timers: ReturnType<typeof setTimeout>[] = [];

        // After the forge card animation finishes, start the slide-out
        timers.push(setTimeout(() => {
          setSlideState('out');
        }, DRAFT_END_HOLD_MS));

        // After slide-out completes, brief gap (blank)
        timers.push(setTimeout(() => {
          setSlideState('gap');
          setHeldPhase(null); // swap to forge component
        }, DRAFT_END_HOLD_MS + SLIDE_OUT_MS));

        // After gap, slide in the forge screen
        timers.push(setTimeout(() => {
          setSlideState('in');
        }, DRAFT_END_HOLD_MS + SLIDE_OUT_MS + SLIDE_GAP_MS));

        // Reset to idle after slide-in completes
        timers.push(setTimeout(() => {
          setSlideState('idle');
        }, DRAFT_END_HOLD_MS + SLIDE_OUT_MS + SLIDE_GAP_MS + SLIDE_IN_MS));

        return () => timers.forEach(clearTimeout);
      }

      const labels: Record<string, string> = {
        forge: 'FORGE',
        draft: 'DRAFT',
        duel: 'DUEL',
        adapt: 'ADAPT',
      };
      const label = labels[currentKind];
      if (label) {
        setTransitionLabel(label);
        const timer = setTimeout(() => setTransitionLabel(null), 1200);
        return () => clearTimeout(timer);
      }
    }
  }, [matchState?.phase.kind]);

  // After all hooks: handle missing code
  if (!code) {
    return <Navigate to="/queue" replace />;
  }

  // Loading: gateway not ready yet
  if (!matchState) {
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

  const phase = matchState.phase;
  // Use held phase if active (keeps Draft mounted during end-of-draft animation)
  const displayPhase = heldPhase ?? phase.kind;

  function renderPhase() {
    switch (displayPhase) {
      case 'draft':
        return <Draft />;
      case 'forge':
        return <Forge />;
      case 'duel':
        return <Duel />;
      case 'adapt':
        return <Adapt />;
      case 'complete':
        return <PostMatch />;
      default:
        console.warn('[PhaseRouter] Unknown phase:', phase);
        return <Navigate to="/queue" replace />;
    }
  }

  return (
    <GatewayProvider value={gateway}>
      <PhaseErrorBoundary resetKey={phase.kind}>
        {transitionLabel && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/80"
            style={{ animation: 'fadeInOut 1.2s ease-in-out forwards' }}
          >
            <h1
              className="text-4xl font-black text-accent-400"
              style={{
                fontFamily: 'var(--font-family-display)',
                textShadow: '0 0 30px rgba(212, 168, 52, 0.5)',
                animation: 'phase-scale-in 0.3s ease-out',
              }}
            >
              {transitionLabel}
            </h1>
          </div>
        )}
        <div
          style={{
            height: '100%',
            ...(slideState === 'out' ? {
              animation: `slide-out-left ${SLIDE_OUT_MS}ms cubic-bezier(0.4, 0, 1, 1) forwards`,
            } : slideState === 'gap' ? {
              opacity: 0,
            } : slideState === 'in' ? {
              animation: `slide-in-right ${SLIDE_IN_MS}ms cubic-bezier(0, 0, 0.2, 1) forwards`,
            } : undefined),
          }}
        >
          {renderPhase()}
        </div>
      </PhaseErrorBoundary>
    </GatewayProvider>
  );
}
