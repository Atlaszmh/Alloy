export const DRAG_THRESHOLD = 8;    // px
export const HOLD_THRESHOLD = 300;  // ms

export function classifyGesture(
  startPos: { x: number; y: number },
  endPos: { x: number; y: number },
  holdDurationMs: number,
): 'tap' | 'drag' | 'hold' {
  const dx = endPos.x - startPos.x;
  const dy = endPos.y - startPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist >= DRAG_THRESHOLD) return 'drag';
  if (holdDurationMs >= HOLD_THRESHOLD) return 'hold';
  return 'tap';
}
