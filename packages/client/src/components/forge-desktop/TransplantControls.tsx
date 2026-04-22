import type { DataRegistry, GemInstance, TransplantPreview } from '@alloy/engine';

interface TransplantControlsProps {
  host: GemInstance;
  source: GemInstance;
  preview: TransplantPreview;
  registry: DataRegistry;
  chosenAffix: 'primary' | 'secondary' | null;
  onChooseAffix: (val: 'primary' | 'secondary' | null) => void;
  canAffordFlux: boolean;
}

export function TransplantControls({
  source,
  preview,
  registry,
  chosenAffix,
  onChooseAffix,
  canAffordFlux,
}: TransplantControlsProps) {
  const sourceHasSecondary = source.secondary !== undefined;

  const pillBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '2px 8px',
    borderRadius: '999px',
    border: '1px solid var(--color-surface-500)',
    background: 'var(--color-surface-700)',
    color: 'var(--color-surface-200)',
    fontSize: 'var(--text-xs)',
    fontFamily: 'var(--font-family-display)',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s, color 0.15s',
  };

  const pillPicked: React.CSSProperties = {
    ...pillBase,
    background: 'rgba(212,168,52,0.18)',
    borderColor: 'var(--color-accent-500)',
    color: 'var(--color-bronze-light)',
  };

  return (
    <div
      className="transplant-controls"
      data-testid="transplant-controls"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        marginTop: '6px',
      }}
    >
      <div
        className="transplant-picker-row"
        style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}
      >
        <button
          type="button"
          data-testid="transplant-pick-random"
          aria-pressed={chosenAffix === null}
          style={chosenAffix === null ? pillPicked : pillBase}
          onClick={() => onChooseAffix(null)}
        >
          🎲 Random
        </button>

        <button
          type="button"
          data-testid="transplant-pick-primary"
          aria-pressed={chosenAffix === 'primary'}
          style={chosenAffix === 'primary' ? pillPicked : pillBase}
          disabled={!canAffordFlux && chosenAffix !== 'primary'}
          onClick={() => onChooseAffix('primary')}
        >
          {registry.findAffix(source.affixId)?.name ?? source.affixId}
        </button>

        {sourceHasSecondary && (
          <button
            type="button"
            data-testid="transplant-pick-secondary"
            aria-pressed={chosenAffix === 'secondary'}
            style={chosenAffix === 'secondary' ? pillPicked : pillBase}
            disabled={!canAffordFlux && chosenAffix !== 'secondary'}
            onClick={() => onChooseAffix('secondary')}
          >
            {registry.findAffix(source.secondary!.affixId)?.name ?? source.secondary!.affixId}
          </button>
        )}
      </div>

      {chosenAffix !== null && preview.fluxCost > 0 && (
        <div
          className="transplant-flux-cost"
          data-testid="transplant-flux-cost"
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-surface-300)',
            fontStyle: 'italic',
          }}
        >
          − {preview.fluxCost} flux
        </div>
      )}
    </div>
  );
}
