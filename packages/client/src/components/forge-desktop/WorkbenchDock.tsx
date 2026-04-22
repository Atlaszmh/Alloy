import type { CombinePreview, DataRegistry, GemInstance } from '@alloy/engine';
import { Workbench } from '@/components/Workbench';

interface WorkbenchDockProps {
  comboSlots: [GemInstance | null, GemInstance | null, GemInstance | null];
  registry: DataRegistry;
  canAfford: boolean;
  preview: CombinePreview | null;
  isDragging: boolean;
  onSlotClick: (index: number) => void;
  onCombine: () => void;
  onClearAll: () => void;
  onPointerDown: (uid: string, e: React.PointerEvent) => void;
}

/**
 * Desktop dock wrapper around `<Workbench layout="desktop-dock" />`.
 *
 * The mockup's `.workbench` bar sits between the center stage and the
 * stockpile strip. This dock supplies the chrome (surface gradient, top
 * bronze accent line, height token) while the existing Workbench
 * component keeps sole responsibility for the slot interactions, preview,
 * and CTAs.
 */
export function WorkbenchDock(props: WorkbenchDockProps) {
  return (
    <div
      role="toolbar"
      aria-label="Combine workbench"
      style={{
        position: 'relative',
        height: 'var(--hud-workbench-h)',
        background:
          'radial-gradient(ellipse 66% 72% at 50% 100%, rgba(212, 168, 52, 0.08), transparent 70%),' +
          'linear-gradient(180deg, rgba(17,17,24,0.95) 0%, rgba(10,10,15,0.95) 100%)',
        borderTop: '1px solid var(--color-surface-500)',
        borderBottom: '1px solid var(--color-surface-600)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Bronze accent at top (mockup .workbench::before) */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -1,
          left: '20%',
          right: '20%',
          height: 1,
          background:
            'linear-gradient(90deg, transparent, var(--color-accent-500), transparent)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          transform: 'scale(0.82)',
          transformOrigin: 'center center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Workbench layout="desktop-dock" {...props} />
      </div>
    </div>
  );
}
