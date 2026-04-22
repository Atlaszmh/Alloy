interface TransplantTutorialTooltipProps {
  /** Which gem to anchor to (visually) */
  targetGemUid: string;
}

export function TransplantTutorialTooltip({ targetGemUid }: TransplantTutorialTooltipProps) {
  return (
    <div
      role="tooltip"
      data-testid="transplant-tutorial-tooltip"
      data-anchor-uid={targetGemUid}
      className="transplant-tutorial-tooltip"
      style={{
        position: 'absolute',
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginBottom: 8,
        padding: '8px 12px',
        background: 'var(--color-surface-800, #1a1a22)',
        border: '1px solid var(--color-accent-500, #d4a834)',
        borderRadius: 4,
        color: 'var(--color-text-primary, #e9e4d0)',
        fontSize: 12,
        width: 220,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        zIndex: 10,
        pointerEvents: 'none',
        whiteSpace: 'normal',
        lineHeight: 1.4,
      }}
    >
      Drop another gem onto the Workbench with this one to transplant its affix into the empty
      slot.
    </div>
  );
}
