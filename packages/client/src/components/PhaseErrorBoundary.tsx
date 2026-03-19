import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { useMatchStore } from '@/stores/matchStore';
import { useForgeStore } from '@/stores/forgeStore';
import { useDraftStore } from '@/stores/draftStore';

interface Props {
  children: ReactNode;
  resetKey: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PhaseErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[PhaseErrorBoundary] Render error:', error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleReturnToQueue = () => {
    useMatchStore.getState().reset();
    useForgeStore.getState().reset();
    useDraftStore.getState().reset();
    window.location.href = '/queue';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
          <h2
            className="text-2xl font-bold text-accent-400"
            style={{ fontFamily: 'var(--font-family-display)' }}
          >
            Something went wrong
          </h2>
          <p className="max-w-md text-center text-sm text-surface-400">
            An error occurred during the match. You can try returning to the queue.
          </p>
          {this.state.error && (
            <pre className="max-w-md overflow-auto rounded bg-surface-800 p-3 text-xs text-red-400">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReturnToQueue}
            className="rounded-lg bg-accent-500 px-6 py-2 text-sm font-semibold text-surface-900 hover:bg-accent-400"
            style={{ fontFamily: 'var(--font-family-display)' }}
          >
            Return to Queue
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
