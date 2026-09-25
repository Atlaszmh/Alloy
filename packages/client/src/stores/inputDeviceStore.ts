import { createHmrStore } from './hmr-store';

/** Which kind of input the player used last: decides the button hints and the focus ring. */
export type InputDevice = 'keyboard' | 'touch' | 'gamepad';

interface InputDeviceStore {
  device: InputDevice;
  setDevice: (device: InputDevice) => void;
}

export const useInputDeviceStore = createHmrStore<InputDeviceStore>(
  'inputDeviceStore',
  (set, get) => ({
    device: 'keyboard',
    setDevice: (device) => {
      if (typeof document !== 'undefined') document.documentElement.dataset.input = device;
      if (get().device !== device) set({ device });
    },
  }),
);
