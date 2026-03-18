import type { MatchState, GameAction, ActionResult, MatchPhase } from '@alloy/engine';
import { useMatchStore } from '@/stores/matchStore';
import type { MatchGateway, MatchEvent } from './types';

export class LocalGateway implements MatchGateway {
  readonly code: string;
  private destroyed = false;
  private unsubscribers: (() => void)[] = [];

  constructor(code: string) {
    this.code = code;
  }

  getState(): MatchState | null {
    return useMatchStore.getState().state;
  }

  async dispatch(action: GameAction): Promise<ActionResult> {
    return useMatchStore.getState().dispatch(action);
  }

  subscribe(callback: (state: MatchState) => void): () => void {
    const unsub = useMatchStore.subscribe((store) => {
      if (!this.destroyed && store.state) {
        callback(store.state);
      }
    });
    this.unsubscribers.push(unsub);
    return unsub;
  }

  onEvent(callback: (event: MatchEvent) => void): () => void {
    let previousPhaseKind: MatchPhase['kind'] | null =
      useMatchStore.getState().state?.phase.kind ?? null;

    const unsub = useMatchStore.subscribe((store) => {
      if (this.destroyed) return;

      const currentPhaseKind = store.state?.phase.kind ?? null;
      if (currentPhaseKind && currentPhaseKind !== previousPhaseKind) {
        previousPhaseKind = currentPhaseKind;
        callback({ kind: 'phase_changed', phase: store.state!.phase });
      }
    });
    this.unsubscribers.push(unsub);
    return unsub;
  }

  destroy(): void {
    this.destroyed = true;
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
  }
}
