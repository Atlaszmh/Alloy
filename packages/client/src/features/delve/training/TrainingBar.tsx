import { useControlsStore } from '@/stores/controlsStore';
import { useSandboxStore } from '@/stores/sandboxStore';
import { Button, InputGlyph } from '@/features/delve/kit';
import { noFocus } from '../arena/hud/SkillSlot';
import { LabButton } from '../lab/dev-routes';
import { MeterChip } from './MeterView';
import type { MeterSummary } from './meter';

/** "Depth N", plus the slow-motion speed while it isn't 1×. */
export function DepthLabel() {
  const depth = useSandboxStore((s) => s.depth);
  const slowmo = useSandboxStore((s) => s.slowmo);
  return (
    <span className="k-disp flex items-center gap-2 whitespace-nowrap text-[20px]">
      <span data-testid="training-depth-label">Depth {depth}</span>
      {slowmo !== 1 && (
        <span className="text-[var(--k-mana)]" data-testid="training-slowmo">
          {slowmo}×
        </span>
      )}
    </span>
  );
}

/**
 * The Training Grounds' top bar (glass): "◂ Anvil", the depth and the meter, the DPS Lab (dev
 * builds), then Panel (`data-pad-journal`: the journal key and View press it) and Menu
 * (`data-pad-menu`: Esc and the pad's Menu press it), each with its binding.
 */
export function TrainingBar({
  meter,
  onResetMeter,
  panelOpen,
  onBack,
  onPanel,
  onMenu,
}: {
  meter: MeterSummary;
  onResetMeter: () => void;
  panelOpen: boolean;
  onBack: () => void;
  onPanel: () => void;
  onMenu: () => void;
}) {
  const config = useControlsStore((s) => s.config);
  return (
    <div
      className="k-glass pointer-events-auto flex h-full items-center gap-4 px-4"
      data-testid="training-bar"
    >
      <Button size="sm" onClick={onBack} aria-label="Back to the Anvil" testId="training-back">
        ◂ Anvil
      </Button>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-4">
        <DepthLabel />
        <MeterChip meter={meter} onReset={onResetMeter} />
      </div>
      <LabButton />
      <span className="flex items-center gap-4 whitespace-nowrap text-[14px] text-[var(--k-text-2)]">
        <button
          type="button"
          className="flex items-center gap-[6px]"
          aria-expanded={panelOpen}
          data-pad-journal
          onMouseDown={noFocus}
          onClick={onPanel}
          data-testid="training-panel-toggle"
        >
          <InputGlyph
            binding={{
              key: config.keys.journal ?? undefined,
              pad: config.pad.journal ?? undefined,
            }}
            size="sm"
          />
          Panel
        </button>
        <button
          type="button"
          className="flex items-center gap-[6px]"
          data-pad-menu
          onMouseDown={noFocus}
          onClick={onMenu}
          data-testid="training-menu"
        >
          <InputGlyph
            binding={{ key: config.keys.menu ?? undefined, pad: config.pad.menu ?? undefined }}
            size="sm"
          />
          Menu
        </button>
      </span>
    </div>
  );
}
