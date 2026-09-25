import {
  DEFAULT_CONTROLS,
  bindKey,
  bindPad,
  parseControls,
  type ControlAction,
  type ControlsConfig,
  type KeyAction,
  type RepeatAction,
} from '@/features/controls/controls';
import type { PadButton } from '@/features/gamepad/gamepad';
import { createHmrStore } from './hmr-store';

/** The player's control setup on this device (see features/controls/controls.ts). */
export const CONTROLS_KEY = 'alloy:controls:v1';

function load(): ControlsConfig {
  try {
    const raw = localStorage.getItem(CONTROLS_KEY);
    return raw ? parseControls(JSON.parse(raw)) : DEFAULT_CONTROLS;
  } catch {
    return DEFAULT_CONTROLS;
  }
}

interface ControlsStore {
  config: ControlsConfig;
  setPad: (action: ControlAction, button: PadButton) => void;
  setKey: (action: KeyAction, code: string) => void;
  setRepeat: (action: RepeatAction, on: boolean) => void;
  setDeadzone: (stick: 'left' | 'right', value: number) => void;
  setAimReach: (value: number) => void;
  reset: () => void;
}

export const useControlsStore = createHmrStore<ControlsStore>('controlsStore', (set, get) => {
  const commit = (config: ControlsConfig) => {
    try {
      localStorage.setItem(CONTROLS_KEY, JSON.stringify(config));
    } catch {
      /* storage unavailable: keep it for this session */
    }
    set({ config });
  };
  return {
    config: load(),
    setPad: (action, button) => commit(bindPad(get().config, action, button)),
    setKey: (action, code) => commit(bindKey(get().config, action, code)),
    setRepeat: (action, on) =>
      commit({ ...get().config, repeat: { ...get().config.repeat, [action]: on } }),
    setDeadzone: (stick, value) =>
      commit(
        parseControls({ ...get().config, deadzone: { ...get().config.deadzone, [stick]: value } }),
      ),
    setAimReach: (value) => commit(parseControls({ ...get().config, aimReach: value })),
    reset: () => commit(DEFAULT_CONTROLS),
  };
});
