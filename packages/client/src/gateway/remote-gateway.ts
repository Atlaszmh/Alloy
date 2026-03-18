import type { MatchState, GameAction, ActionResult } from '@alloy/engine';
import type { MatchGateway, MatchEvent } from './types';
import { getSupabase } from '@/shared/utils/supabase';
import { useAuthStore } from '@/stores/authStore';

type StateCallback = (state: MatchState) => void;
type EventCallback = (event: MatchEvent) => void;

export class RemoteGateway implements MatchGateway {
  readonly code: string;
  private state: MatchState | null = null;
  private playerIndex: 0 | 1 = 0;
  private destroyed = false;
  private stateListeners = new Set<StateCallback>();
  private eventListeners = new Set<EventCallback>();
  private channel: ReturnType<ReturnType<typeof getSupabase & (() => NonNullable<ReturnType<typeof getSupabase>>)>['channel']> | null = null;
  private playerId: string;

  constructor(code: string) {
    this.code = code;
    this.playerId = useAuthStore.getState().playerId;
    this.setupChannel();
  }

  private setupChannel(): void {
    const supabase = getSupabase();
    if (!supabase) return;

    this.channel = supabase.channel(`match:${this.code}`);

    this.channel
      .on('broadcast', { event: 'draft_pick' }, () => {
        this.fetchState();
      })
      .on('broadcast', { event: 'phase_changed' }, (payload) => {
        this.emitEvent({ kind: 'phase_changed', phase: payload.payload?.phase });
        this.fetchState();
      })
      .on('broadcast', { event: 'forge_submitted' }, (payload) => {
        this.emitEvent({
          kind: 'opponent_action',
          action: payload.payload?.action,
          result: payload.payload?.result,
        });
      })
      .on('broadcast', { event: 'match_started' }, () => {
        this.fetchState();
      })
      .on('broadcast', { event: 'match_forfeited' }, (payload) => {
        this.emitEvent({
          kind: 'match_forfeited',
          winner: payload.payload?.winner,
        });
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        // Only emit if a different player left
        const otherLeft = leftPresences.some(
          (p: { user_id?: string }) => p.user_id !== this.playerId,
        );
        if (otherLeft) {
          this.emitEvent({ kind: 'opponent_disconnected' });
        }
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        // Only emit if a different player joined back
        const otherJoined = newPresences.some(
          (p: { user_id?: string }) => p.user_id !== this.playerId,
        );
        if (otherJoined) {
          this.emitEvent({ kind: 'opponent_reconnected' });
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await this.channel?.track({
            user_id: this.playerId,
            online_at: new Date().toISOString(),
          });
        }
      });
  }

  async fetchState(): Promise<MatchState | null> {
    if (this.destroyed) return null;

    const supabase = getSupabase();
    if (!supabase) return null;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const jwt = session?.access_token;
      if (!jwt) {
        this.emitEvent({ kind: 'error', message: 'No auth session' });
        return null;
      }

      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(
        `${baseUrl}/functions/v1/match-state?roomCode=${encodeURIComponent(this.code)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!res.ok) {
        const text = await res.text();
        this.emitEvent({ kind: 'error', message: `Failed to fetch state: ${text}` });
        return null;
      }

      const data = await res.json();
      this.state = data.state;
      this.playerIndex = data.playerIndex ?? 0;

      if (this.state) {
        for (const cb of this.stateListeners) {
          cb(this.state);
        }
      }

      return this.state;
    } catch (err) {
      this.emitEvent({ kind: 'error', message: `Fetch error: ${err}` });
      return null;
    }
  }

  getState(): MatchState | null {
    return this.state;
  }

  getPlayerIndex(): 0 | 1 {
    return this.playerIndex;
  }

  async dispatch(action: GameAction): Promise<ActionResult> {
    const supabase = getSupabase();
    if (!supabase) {
      return { ok: false, error: 'No Supabase client' };
    }

    try {
      if (action.kind === 'draft_pick') {
        const { error } = await supabase.functions.invoke('draft-pick', {
          body: { roomCode: this.code, orbUid: action.orbUid },
        });
        if (error) return { ok: false, error: error.message };
      } else if (action.kind === 'forge_action') {
        // Forge actions are applied locally as a preview; the final state is
        // submitted to the server when forge_complete is dispatched.
        if (this.state) {
          return { ok: true, state: this.state };
        }
        return { ok: false, error: 'No local state for forge_action preview' };
      } else if (action.kind === 'forge_complete') {
        const loadout = this.state?.players[this.playerIndex]?.loadout;
        const { error } = await supabase.functions.invoke('forge-submit', {
          body: { roomCode: this.code, loadout },
        });
        if (error) return { ok: false, error: error.message };
      } else if (action.kind === 'advance_phase') {
        // Phase advancement for PvP is handled server-side (e.g., in forge-submit).
        // This is a no-op on the client; just return current state.
        if (this.state) {
          return { ok: true, state: this.state };
        }
        return { ok: false, error: 'No local state for advance_phase' };
      } else {
        return { ok: false, error: `Unsupported action kind for remote: ${action.kind}` };
      }

      // Re-fetch state after successful dispatch
      const newState = await this.fetchState();
      if (newState) {
        return { ok: true, state: newState };
      }
      return { ok: false, error: 'Failed to fetch updated state' };
    } catch (err) {
      return { ok: false, error: `Dispatch failed: ${err}` };
    }
  }

  subscribe(callback: StateCallback): () => void {
    this.stateListeners.add(callback);
    return () => {
      this.stateListeners.delete(callback);
    };
  }

  onEvent(callback: EventCallback): () => void {
    this.eventListeners.add(callback);
    return () => {
      this.eventListeners.delete(callback);
    };
  }

  destroy(): void {
    this.destroyed = true;
    if (this.channel) {
      const supabase = getSupabase();
      if (supabase) {
        supabase.removeChannel(this.channel);
      }
      this.channel = null;
    }
    this.stateListeners.clear();
    this.eventListeners.clear();
  }

  private emitEvent(event: MatchEvent): void {
    if (this.destroyed) return;
    for (const cb of this.eventListeners) {
      cb(event);
    }
  }
}
