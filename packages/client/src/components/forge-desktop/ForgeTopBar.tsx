import { HapticButton } from '@/components/HapticButton';

interface ForgeTopBarProps {
  lives: number;
  maxLives: number;
  opponentLabel: string;   // e.g. "VS AI T2"
  round: number;
  totalRounds: number;
  streak: number;          // star badge
  round1: boolean;         // true when current round === 1 → show "R1" pill
  onDone: () => void;
  onOpenGemLibrary: () => void;
}

/**
 * Desktop HUD top banner. Layout translated from the v2 mockup's `.topbar`:
 *   [ hearts · lives ]  |  [ vs · round · streak ]   FORGE PHASE  R1   [ Library ] [ DONE ]
 *
 * Height pulled from the shared `--hud-topbar-h` token so the rest of the HUD
 * (rails, center stage, workbench, stockpile) can line up beneath.
 */
export function ForgeTopBar({
  lives,
  maxLives,
  opponentLabel,
  round,
  totalRounds,
  streak,
  round1,
  onDone,
  onOpenGemLibrary,
}: ForgeTopBarProps) {
  const hearts = Array.from({ length: maxLives }, (_, i) => i < lives);

  return (
    <header
      role="banner"
      style={{
        position: 'relative',
        height: 'var(--hud-topbar-h)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--gap-lg)',
        padding: '0 var(--gap-lg)',
        background:
          'linear-gradient(180deg, var(--color-surface-900) 0%, rgba(10,10,15,0.85) 100%)',
        borderBottom: '1px solid var(--color-surface-600)',
        zIndex: 10,
      }}
    >
      {/* Decorative gold underline (topbar::after in mockup) */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: '-1px',
          height: '1px',
          background:
            'linear-gradient(90deg, transparent, var(--color-accent-500) 20%, var(--color-accent-500) 80%, transparent)',
          opacity: 0.4,
          pointerEvents: 'none',
        }}
      />

      {/* Lives block */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--gap-md)',
        }}
      >
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-xs)' }}
          aria-label={`${lives} of ${maxLives} lives remaining`}
        >
          {hearts.map((filled, i) => (
            <Heart key={i} filled={filled} />
          ))}
        </div>
        <span
          style={{
            fontFamily: 'var(--font-family-display)',
            fontWeight: 600,
            color: 'var(--color-bronze-400)',
            fontSize: 'var(--text-xs)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {lives} Lives
        </span>
      </div>

      {/* Separator */}
      <span
        aria-hidden="true"
        style={{
          width: '1px',
          height: '28px',
          background: 'var(--color-surface-600)',
        }}
      />

      {/* VS / Round / Streak */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--gap-md)',
          fontFamily: 'var(--font-family-display)',
          fontWeight: 600,
          fontSize: 'var(--text-xs)',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
        }}
      >
        <span style={{ color: 'var(--color-bronze-500)' }}>
          VS <span style={{ color: 'white', marginLeft: 6 }}>{opponentLabel}</span>
        </span>
        <span style={{ color: 'var(--color-bronze-500)' }}>
          Round{' '}
          <span style={{ color: 'white', marginLeft: 6 }}>
            {round}
            <span
              style={{ color: 'var(--color-surface-300)', marginLeft: 4, fontWeight: 500 }}
            >
              /{totalRounds}
            </span>
          </span>
        </span>
        <span style={{ color: 'var(--color-accent-300)' }}>★ {streak}</span>
      </div>

      {/* Phase label — centered between blocks */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 'var(--gap-md)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-family-display)',
            fontWeight: 700,
            fontSize: 'var(--text-md)',
            letterSpacing: '0.28em',
            color: 'var(--color-accent-300)',
            textShadow: '0 0 12px rgba(236, 208, 106, 0.4)',
          }}
        >
          FORGE PHASE
        </span>
        {round1 && (
          <span
            style={{
              padding: '4px 12px',
              background: 'var(--color-surface-700)',
              border: '1px solid var(--color-surface-500)',
              fontFamily: 'var(--font-family-display)',
              fontWeight: 700,
              fontSize: 'var(--text-2xs)',
              color: 'var(--color-bronze-300)',
              letterSpacing: '0.12em',
            }}
          >
            R1
          </span>
        )}
      </div>

      {/* Right cluster */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-md)' }}>
        <button
          type="button"
          onClick={onOpenGemLibrary}
          style={{
            padding: '6px 14px',
            background: 'transparent',
            border: '1px solid var(--color-surface-500)',
            fontFamily: 'var(--font-family-display)',
            fontWeight: 600,
            fontSize: 'var(--text-2xs)',
            color: 'var(--color-bronze-400)',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          {'\u25C8'} Gem Library
        </button>
        <HapticButton
          variant="primary"
          size="sm"
          onClick={onDone}
          style={{
            letterSpacing: '0.24em',
            fontSize: 'var(--text-sm)',
          }}
        >
          Done {'\u25B6'}
        </HapticButton>
      </div>
    </header>
  );
}

/* ── Heart (lives pip) ───────────────────────────────────────────── */
function Heart({ filled }: { filled: boolean }) {
  // Two rotated rounded rectangles form the heart lobes (mockup .heart::before/::after).
  const lobeBase: React.CSSProperties = {
    content: '""',
    position: 'absolute',
    width: '10px',
    height: '14px',
    borderRadius: '10px 10px 0 0',
  };
  const lobeFilled: React.CSSProperties = {
    background: 'var(--color-fire)',
    boxShadow: '0 0 8px rgba(232, 85, 58, 0.6)',
  };
  const lobeEmpty: React.CSSProperties = {
    background: 'transparent',
    border: '1.5px solid var(--color-surface-400)',
  };
  const lobeStyle = filled ? lobeFilled : lobeEmpty;

  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        position: 'relative',
        width: '18px',
        height: '16px',
      }}
    >
      <span
        style={{
          ...lobeBase,
          ...lobeStyle,
          left: 0,
          transform: 'rotate(-35deg)',
          transformOrigin: '50% 80%',
        }}
      />
      <span
        style={{
          ...lobeBase,
          ...lobeStyle,
          right: 0,
          transform: 'rotate(35deg)',
          transformOrigin: '50% 80%',
        }}
      />
    </span>
  );
}
