// Vibration API wrapper for mobile haptic feedback

export type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'selection';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 50,
  success: [10, 50, 20],
  error: [30, 50, 30, 50, 30],
  selection: 5,
};

let hapticEnabled = true;

export function setHapticEnabled(enabled: boolean) {
  hapticEnabled = enabled;
}

export function vibrate(pattern: HapticPattern = 'light') {
  if (!hapticEnabled) return;
  if (!navigator.vibrate) return;

  const p = PATTERNS[pattern];
  navigator.vibrate(p);
}

// Convenience functions
export const haptics = {
  orbPick: () => vibrate('medium'),
  forgePlace: () => vibrate('light'),
  synergyActivated: () => vibrate('success'),
  duelHit: () => vibrate('light'),
  critStrike: () => vibrate('heavy'),
  matchResult: (won: boolean) => vibrate(won ? 'success' : 'error'),
  buttonTap: () => vibrate('selection'),
};
