import { useEffect, useRef, useState } from 'react';
import type { EquippedSlot } from '@alloy/engine';

interface SocketGridProps {
  /** Desired column count at comfortable density. Adaptively reduced if narrow. */
  cols: number;
  slots: (EquippedSlot | null)[];
  renderFilledSocket: (slot: EquippedSlot, index: number) => React.ReactNode;
  onEmptyClick: (index: number) => void;
  isDragging?: boolean;
  /** Optional override for the minimum socket size. Defaults to 48px. */
  minSocketSize?: number;
}

export function SocketGrid({
  cols: maxCols,
  slots,
  renderFilledSocket,
  onEmptyClick,
  isDragging,
  minSocketSize = 48,
}: SocketGridProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [socket, setSocket] = useState<{ size: number; cols: number } | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      const styles = getComputedStyle(el);
      const parentGem = parseFloat(styles.getPropertyValue('--gem-size')) || 100;
      const gap = parseFloat(styles.getPropertyValue('--gap-sm')) || 6;
      // Pick the largest col count that fits at >= minSocketSize.
      let nextCols = 1;
      let nextSize = Math.max(minSocketSize, Math.min(parentGem, width));
      for (let c = maxCols; c >= 1; c--) {
        const fit = Math.floor((width - (c - 1) * gap) / c);
        if (fit >= minSocketSize || c === 1) {
          nextCols = c;
          nextSize = Math.max(minSocketSize, Math.min(parentGem, fit));
          break;
        }
      }
      setSocket({ size: nextSize, cols: nextCols });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxCols, minSocketSize]);

  const cols = socket?.cols ?? maxCols;
  const localGemStyle: React.CSSProperties = socket
    ? ({
        '--gem-size': `${socket.size}px`,
        '--gem-radius': `${socket.size * 0.16}px`,
      } as React.CSSProperties)
    : {};

  return (
    <div
      ref={rootRef}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, var(--gem-size))`,
        gap: 'var(--gap-sm)',
        justifyContent: 'center',
        animation: isDragging ? 'orb-glow 1.5s ease-in-out infinite' : 'none',
        ...localGemStyle,
      }}
    >
      {slots.map((slot, index) => {
        if (slot === null) {
          return (
            <button
              key={index}
              data-forge-socket={index}
              onClick={() => onEmptyClick(index)}
              style={{
                width: 'var(--gem-size)',
                height: 'var(--gem-size)',
                borderRadius: 'var(--gem-radius)',
                background: 'var(--color-surface-800)',
                border: isDragging
                  ? '1.5px dashed var(--color-bronze-light)'
                  : '1.5px dashed var(--color-empty-socket)',
                boxShadow: isDragging
                  ? '0 0 12px rgba(212,168,52,0.4), inset 0 2px 4px rgba(0,0,0,0.5)'
                  : 'inset 0 2px 4px rgba(0,0,0,0.5)',
                cursor: 'pointer',
                touchAction: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                transition: 'box-shadow 0.2s, border-color 0.2s',
              }}
              aria-label={`Empty socket ${index + 1}`}
            />
          );
        }
        return (
          <div
            key={index}
            data-forge-socket={index}
            style={{ display: 'flex', justifyContent: 'center' }}
          >
            {renderFilledSocket(slot, index)}
          </div>
        );
      })}
    </div>
  );
}
