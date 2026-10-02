/** The viewer asks for less motion (`prefers-reduced-motion: reduce`): WAAPI flourishes skip or shorten. */
export function reducedMotion(): boolean {
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
