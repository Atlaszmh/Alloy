import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { useMatchGateway } from '@/gateway';
import { PhaseErrorBoundary } from '@/components/PhaseErrorBoundary';
import { Draft } from './Draft';
import { Forge } from './Forge';
import { Duel } from './Duel';
import { Adapt } from './Adapt';
import { PostMatch } from './PostMatch';

export function PhaseRouter() {
  const { code } = useParams<{ code: string }>();
  const [, forceUpdate] = useState(0);

  // Always call hooks unconditionally — pass empty string if code is missing
  const gateway = useMatchGateway(code ?? '');

  useEffect(() => {
    return gateway.subscribe(() => forceUpdate((n) => n + 1));
  }, [gateway]);

  // After all hooks: handle missing code
  if (!code) {
    return <Navigate to="/queue" replace />;
  }

  const matchState = gateway.getState();

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

  function renderPhase() {
    switch (phase.kind) {
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
    <PhaseErrorBoundary resetKey={phase.kind}>
      {renderPhase()}
    </PhaseErrorBoundary>
  );
}
