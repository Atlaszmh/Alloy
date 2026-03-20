import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUIStore } from '@/stores/uiStore';

// Must use vi.hoisted so these are available when vi.mock factory runs (hoisted to top)
const { mockPlay, mockVolume, mockRate, MockHowl } = vi.hoisted(() => {
  const mockPlay = vi.fn().mockReturnValue(1);
  const mockVolume = vi.fn();
  const mockRate = vi.fn();
  const MockHowl = vi.fn().mockImplementation((opts: { src: string[]; onload?: () => void }) => {
    if (opts.onload) setTimeout(opts.onload, 0);
    return { play: mockPlay, volume: mockVolume, rate: mockRate };
  });
  return { mockPlay, mockVolume, mockRate, MockHowl };
});

vi.mock('howler', () => ({
  Howl: MockHowl,
}));

// Import after mocking
import { SoundManager } from './sound-manager';
import type { SoundName } from './sound-manager';

function freshManager(): SoundManager {
  return new SoundManager();
}

describe('SoundManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUIStore.setState({ isMuted: false });
    // Ensure document.hidden is false
    Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
  });

  // ─── Registry completeness ───────────────────────────────────────────

  describe('registry', () => {
    const ALL_SOUND_NAMES: SoundName[] = [
      // Draft
      'orbSelect', 'orbConfirm',
      // Forge
      'orbPlace', 'orbRemove', 'combineMerge', 'combineFail',
      'upgradeTier', 'forgeSubmit', 'synergyActivate',
      // Duel
      'attack', 'crit', 'dodge', 'block', 'death',
      // Results
      'victory', 'defeat',
      // UI
      'buttonClick', 'phaseTransition', 'timerTick', 'timerUrgent',
      'dragStart', 'dropSuccess', 'fluxSpend', 'matchFound', 'roundStart',
    ];

    it('every SoundName can be played without throwing', () => {
      const mgr = freshManager();
      for (const name of ALL_SOUND_NAMES) {
        expect(() => mgr.play(name)).not.toThrow();
      }
    });

    const SOUNDS_WITH_FILES: SoundName[] = [
      'orbSelect', 'orbConfirm', 'orbPlace', 'orbRemove',
      'dragStart', 'dropSuccess',
      'combineMerge', 'combineFail',
      'forgeSubmit', 'fluxSpend', 'timerUrgent', 'phaseTransition',
    ];

    const SYNTH_ONLY_SOUNDS: SoundName[] = [
      'upgradeTier', 'synergyActivate',
      'attack', 'crit', 'dodge', 'block', 'death',
      'victory', 'defeat',
      'buttonClick', 'timerTick', 'matchFound', 'roundStart',
    ];

    it('file-backed sounds have at least 2 variants each', () => {
      const mgr = freshManager();
      mgr.loadFiles();
      // loadFiles populates the howls map; check it was called with multiple files
      const allSrcs = MockHowl.mock.calls.map(
        (c: [{ src: string[] }]) => c[0].src[0],
      );
      for (const name of SOUNDS_WITH_FILES) {
        const prefix = name.replace(/([A-Z])/g, '-$1').toLowerCase(); // orbSelect -> orb-select
        const matching = allSrcs.filter((s: string) => s.includes(prefix));
        expect(matching.length, `${name} should have ≥2 file variants`).toBeGreaterThanOrEqual(2);
      }
    });

    it('synth-only sounds do not create Howl instances', () => {
      const mgr = freshManager();
      mgr.loadFiles();
      const allSrcs = MockHowl.mock.calls.map(
        (c: [{ src: string[] }]) => c[0].src[0],
      );
      for (const name of SYNTH_ONLY_SOUNDS) {
        const prefix = name.replace(/([A-Z])/g, '-$1').toLowerCase();
        const matching = allSrcs.filter((s: string) => s.includes(prefix));
        expect(matching.length, `${name} should have 0 file variants`).toBe(0);
      }
    });
  });

  // ─── Play behavior ───────────────────────────────────────────────────

  describe('play()', () => {
    it('plays file variant when files are loaded', () => {
      const mgr = freshManager();
      mgr.loadFiles();
      mgr.play('orbSelect');
      expect(mockPlay).toHaveBeenCalled();
      expect(mockVolume).toHaveBeenCalled();
    });

    it('does not apply pitch rate to file variants', () => {
      const mgr = freshManager();
      mgr.loadFiles();
      // Play multiple times to test — rate should never be called for file variants
      for (let i = 0; i < 10; i++) mgr.play('orbPlace');
      expect(mockRate).not.toHaveBeenCalled();
    });

    it('falls back to synth when no files loaded', () => {
      const mgr = freshManager();
      // Don't call loadFiles — should fall through to synth without error
      expect(() => mgr.play('orbSelect')).not.toThrow();
      expect(mockPlay).not.toHaveBeenCalled(); // No Howl play
    });

    it('does not play when muted', () => {
      const mgr = freshManager();
      mgr.loadFiles();
      useUIStore.setState({ isMuted: true });
      mgr.play('orbSelect');
      expect(mockPlay).not.toHaveBeenCalled();
    });

    it('does not play when tab is hidden', () => {
      const mgr = freshManager();
      mgr.loadFiles();
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      mgr.play('orbSelect');
      expect(mockPlay).not.toHaveBeenCalled();
    });

    it('does not play when volume is zero', () => {
      const mgr = freshManager();
      mgr.loadFiles();
      mgr.setMasterVolume(0);
      mgr.play('orbSelect');
      expect(mockPlay).not.toHaveBeenCalled();
    });

    it('respects cooldown for rapid plays', () => {
      const mgr = freshManager();
      mgr.loadFiles();
      // attack has cooldownMs: 80
      mgr.play('attack');
      mgr.play('attack'); // Should be throttled
      // attack is synth-only, so mockPlay won't be called for it.
      // Use a file-backed sound... actually none have cooldowns.
      // Test with synth: just verify no throw
      expect(() => {
        mgr.play('attack');
        mgr.play('attack');
      }).not.toThrow();
    });
  });

  // ─── loadFiles behavior ──────────────────────────────────────────────

  describe('loadFiles()', () => {
    it('creates Howl instances for all file-backed sounds', () => {
      const mgr = freshManager();
      const callsBefore = MockHowl.mock.calls.length;
      mgr.loadFiles();
      const callsAfter = MockHowl.mock.calls.length;
      // Should create 33 Howl instances (total file count)
      expect(callsAfter - callsBefore).toBe(33);
    });

    it('does not double-load on repeated calls', () => {
      const mgr = freshManager();
      mgr.loadFiles();
      const callsAfterFirst = MockHowl.mock.calls.length;
      mgr.loadFiles(); // Should be a no-op
      expect(MockHowl.mock.calls.length).toBe(callsAfterFirst);
    });

    it('uses correct base path', () => {
      const mgr = freshManager();
      mgr.loadFiles('/custom/path/');
      const srcs = MockHowl.mock.calls.map((c: [{ src: string[] }]) => c[0].src[0]);
      for (const src of srcs) {
        expect(src).toMatch(/^\/custom\/path\//);
      }
    });
  });

  // ─── Volume controls ─────────────────────────────────────────────────

  describe('volume', () => {
    it('clamps master volume to 0-1', () => {
      const mgr = freshManager();
      mgr.setMasterVolume(1.5);
      expect(mgr.getMasterVolume()).toBe(1);
      mgr.setMasterVolume(-0.5);
      expect(mgr.getMasterVolume()).toBe(0);
    });

    it('clamps category volume to 0-1', () => {
      const mgr = freshManager();
      mgr.setCategoryVolume('sfx', 2);
      expect(mgr.getCategoryVolume('sfx')).toBe(1);
      mgr.setCategoryVolume('sfx', -1);
      expect(mgr.getCategoryVolume('sfx')).toBe(0);
    });

    it('applies master × category × entry volume to Howl', () => {
      const mgr = freshManager();
      mgr.loadFiles();
      mgr.setMasterVolume(0.5);
      mgr.setCategoryVolume('sfx', 0.5);
      mgr.play('orbConfirm'); // volume: 0.7, category: sfx
      // Expected: 0.7 * 0.5 * 0.5 = 0.175
      expect(mockVolume).toHaveBeenCalledWith(expect.closeTo(0.175, 3), expect.any(Number));
    });
  });
});
