import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMatchStore } from '@/stores/matchStore';
import { LocalGateway } from './local-gateway';

describe('LocalGateway', () => {
  beforeEach(() => {
    useMatchStore.getState().reset();
  });

  it('has correct code property', () => {
    const gw = new LocalGateway('ai-test-123');
    expect(gw.code).toBe('ai-test-123');
    gw.destroy();
  });

  it('returns null state before match starts', () => {
    const gw = new LocalGateway('ai-test');
    expect(gw.getState()).toBeNull();
    gw.destroy();
  });

  it('returns match state after startLocalMatch', () => {
    useMatchStore.getState().startLocalMatch(42, 'quick', 1);
    const gw = new LocalGateway('ai-test');
    const state = gw.getState();
    expect(state).not.toBeNull();
    expect(state!.phase.kind).toBe('draft');
    gw.destroy();
  });

  it('dispatch applies a draft pick and returns ok result', async () => {
    useMatchStore.getState().startLocalMatch(42, 'quick', 1);
    const gw = new LocalGateway('ai-test');
    const state = gw.getState()!;
    const firstOrb = state.pool[0];

    const result = await gw.dispatch({
      kind: 'draft_pick',
      player: 0,
      orbUid: firstOrb.uid,
    });

    expect(result.ok).toBe(true);
    gw.destroy();
  });

  it('subscribe fires callback on state changes', async () => {
    const gw = new LocalGateway('ai-test');
    const callback = vi.fn();
    gw.subscribe(callback);

    useMatchStore.getState().startLocalMatch(42, 'quick', 1);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0].phase.kind).toBe('draft');
    gw.destroy();
  });

  it('destroy prevents further callbacks', () => {
    const gw = new LocalGateway('ai-test');
    const callback = vi.fn();
    gw.subscribe(callback);

    gw.destroy();

    useMatchStore.getState().startLocalMatch(42, 'quick', 1);
    expect(callback).not.toHaveBeenCalled();
  });
});
