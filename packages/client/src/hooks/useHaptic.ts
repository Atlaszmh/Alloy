export function useHaptic() {
  return (style: 'light' | 'medium' | 'heavy' = 'light') => {
    if (!navigator.vibrate) return;
    const duration = style === 'light' ? 10 : style === 'medium' ? 25 : 50;
    navigator.vibrate(duration);
  };
}
