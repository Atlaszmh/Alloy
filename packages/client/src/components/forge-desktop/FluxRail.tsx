import { HapticButton } from '@/components/HapticButton';

interface FluxRailProps {
  currentFlux: number;
  maxFlux: number;
  onBoost: () => void;            // -3 flux, boosts next combine
  onReroll: () => void;           // -5 flux, rerolls pool
  onGuaranteeRarity: () => void;  // -4 flux, guarantees rare
}

const BOOST_COST = 3;
const REROLL_COST = 5;
const RARITY_COST = 4;

/**
 * Right HUD rail — 20-pip flux meter + three spend CTAs.
 *
 * Visual inspiration: `.right-rail` / `.flux-bar` in the v2 mockup, with the
 * horizontal pip bar preserved. Button costs are rendered as inline teal pills
 * matching `.flux-btn .cost`. Width pulled from `--hud-rail-w`.
 */
export function FluxRail({
  currentFlux,
  maxFlux,
  onBoost,
  onReroll,
  onGuaranteeRarity,
}: FluxRailProps) {
  const pips = Array.from({ length: maxFlux }, (_, i) => i < currentFlux);
  const fullyCharged = currentFlux >= maxFlux;

  return (
    <aside
      style={{
        width: 'var(--hud-rail-w)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--gap-md)',
      }}
      aria-label="Flux meter and spend actions"
    >
      <section
        style={{
          position: 'relative',
          background:
            'linear-gradient(180deg, rgba(17,17,24,0.92) 0%, rgba(10,10,15,0.92) 100%)',
          border: '1px solid var(--color-surface-600)',
        }}
      >
        {/* Bronze underline above header (mockup .panel::before) */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: -1,
            left: 12,
            right: 12,
            height: 1,
            background:
              'linear-gradient(90deg, transparent, var(--color-bronze-500), transparent)',
          }}
        />
        <header
          style={{
            padding: '8px 12px',
            fontFamily: 'var(--font-family-display)',
            fontWeight: 700,
            fontSize: 'var(--text-2xs)',
            letterSpacing: '0.22em',
            color: 'var(--color-bronze-500)',
            textTransform: 'uppercase',
            borderBottom: '1px solid var(--color-surface-700)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>Flux Meter</span>
          <span
            style={{
              color: 'var(--color-surface-300)',
              fontWeight: 500,
              letterSpacing: '0.12em',
            }}
          >
            ABILITY
          </span>
        </header>

        {/* Pip bar */}
        <div
          role="meter"
          aria-valuenow={currentFlux}
          aria-valuemin={0}
          aria-valuemax={maxFlux}
          aria-label={`${currentFlux} of ${maxFlux} flux`}
          style={{
            display: 'flex',
            gap: 2,
            padding: 12,
          }}
        >
          {pips.map((filled, i) => (
            <span
              key={i}
              aria-hidden="true"
              style={{
                flex: 1,
                height: 22,
                background: filled
                  ? (fullyCharged
                    ? 'linear-gradient(180deg, var(--color-accent-300), var(--color-accent-500))'
                    : 'linear-gradient(180deg, var(--color-teal-500), #1a8a7a)')
                  : 'linear-gradient(180deg, var(--color-surface-900) 0%, var(--color-surface-950) 100%)',
                border: filled
                  ? (fullyCharged
                    ? '1px solid var(--color-accent-300)'
                    : '1px solid var(--color-teal-500)')
                  : '1px solid var(--color-surface-700)',
                boxShadow: filled
                  ? (fullyCharged
                    ? '0 0 8px rgba(236, 208, 106, 0.55)'
                    : '0 0 8px rgba(45, 212, 191, 0.5)')
                  : 'none',
              }}
            />
          ))}
        </div>

        {/* Count + label */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 12px 10px',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-family-display)',
              fontWeight: 600,
              fontSize: 'var(--text-2xs)',
              color: 'var(--color-surface-300)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            Charged
          </span>
          <span
            style={{
              fontFamily: 'var(--font-family-display)',
              fontWeight: 700,
              fontSize: 'var(--text-sm)',
              color: fullyCharged
                ? 'var(--color-accent-300)'
                : 'var(--color-teal-500)',
              letterSpacing: '0.08em',
            }}
          >
            {currentFlux}
            <span style={{ color: 'var(--color-surface-300)', fontWeight: 500 }}>
              /{maxFlux}
            </span>
          </span>
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--gap-xs)',
            padding: '0 12px 12px',
          }}
        >
          <FluxActionButton
            label="Boost"
            cost={BOOST_COST}
            currentFlux={currentFlux}
            onClick={onBoost}
          />
          <FluxActionButton
            label="Reroll"
            cost={REROLL_COST}
            currentFlux={currentFlux}
            onClick={onReroll}
          />
          <FluxActionButton
            label="Rarity"
            cost={RARITY_COST}
            currentFlux={currentFlux}
            onClick={onGuaranteeRarity}
          />
        </div>
      </section>
    </aside>
  );
}

/* ── Single flux-spend CTA row ────────────────────────────────── */
function FluxActionButton({
  label,
  cost,
  currentFlux,
  onClick,
}: {
  label: string;
  cost: number;
  currentFlux: number;
  onClick: () => void;
}) {
  const disabled = currentFlux < cost;
  return (
    <HapticButton
      variant="secondary"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      // Override the HapticButton default pill so the row matches the mockup's
      // segmented flux-btn layout (label left, cost pill right).
      className=""
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        background: 'linear-gradient(180deg, var(--color-surface-700), var(--color-surface-800))',
        border: '1px solid var(--color-surface-600)',
        borderRadius: 0,
        fontFamily: 'var(--font-family-display)',
        fontWeight: 600,
        fontSize: 'var(--text-2xs)',
        color: 'var(--color-bronze-300)',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
      }}
    >
      <span>{label}</span>
      <span
        style={{
          color: 'var(--color-teal-500)',
          fontWeight: 700,
          fontSize: 'var(--text-2xs)',
          padding: '2px 6px',
          background: 'rgba(45, 212, 191, 0.1)',
          border: '1px solid rgba(45, 212, 191, 0.25)',
        }}
      >
        {cost}
      </span>
    </HapticButton>
  );
}
