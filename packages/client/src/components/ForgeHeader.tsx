import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { ActiveSynergy, DataRegistry, DerivedStats } from '@alloy/engine';
import { ALL_ELEMENTS } from '@alloy/engine';
import { HapticButton } from '@/components/HapticButton';
import { SynergyBanner } from '@/components/SynergyBanner';
import { Timer } from '@/components/Timer';
import { ELEMENT_COLORS } from '@/shared/utils/element-theme';
import type { GemDamageContribution } from '@/shared/utils/gem-damage-breakdown';

interface ForgeHeaderProps {
  round: number;
  stats: DerivedStats | null;
  /**
   * Per-type damage totals sourced from equipped gems. Drives both the
   * breakdown tooltip (which attributes every point shown to a specific
   * damage type) and the poison/shadow top-up on the headline DMG value.
   */
  gemDamage: GemDamageContribution[];
  activeSynergies?: ActiveSynergy[];
  registry?: DataRegistry;
  timerDurationMs?: number;
  onTimerExpire?: () => void;
  onDone: () => void;
}

const DISPLAY_FONT = 'var(--font-family-display)';

/**
 * Headline DMG = engine-derived physical + elemental (already accounts for
 * weapon base, base-stat scaling, and gems for those types) + poison/shadow
 * from equipped gems. Poison/shadow use duel-engine-only keys that never
 * land on DerivedStats, so we top them up here to keep "total character
 * damage" honest.
 */
function computeTotalDamage(
  stats: DerivedStats | null,
  gemDamage: GemDamageContribution[],
): number {
  if (!stats) return 0;
  let total = stats.physicalDamage;
  for (const el of ALL_ELEMENTS) total += stats.elementalDamage[el];
  for (const row of gemDamage) {
    if (row.type === 'poison' || row.type === 'shadow') total += row.value;
  }
  return total;
}

export function ForgeHeader({
  round,
  stats,
  gemDamage,
  activeSynergies,
  registry,
  timerDurationMs,
  onTimerExpire,
  onDone,
}: ForgeHeaderProps) {
  const showTimer = timerDurationMs !== undefined && onTimerExpire !== undefined;
  const navigate = useNavigate();
  const totalDamage = computeTotalDamage(stats, gemDamage);

  return (
    <div
      className="shrink-0"
      data-screen-section="forge-header"
      style={{
        backgroundColor: 'var(--color-surface-900)',
        borderBottom: '1px solid var(--color-surface-600)',
      }}
    >
      {/* Row 1: Header bar */}
      <div className="flex items-center gap-2 px-3 py-1" style={{ minHeight: 'var(--text-lg)' }}>
        <span
          style={{
            fontFamily: DISPLAY_FONT,
            fontWeight: 700,
            fontSize: 'var(--text-md)',
            letterSpacing: '0.04em',
            color: 'var(--color-accent-500)',
          }}
        >
          FORGE PHASE
        </span>

        {/* Round pill */}
        <span
          className="rounded-full px-1.5"
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: 'var(--text-xs)',
            lineHeight: 1.5,
            color: 'var(--color-bronze-light)',
            backgroundColor: 'var(--color-surface-600)',
            border: '1px solid var(--color-surface-500)',
          }}
        >
          R{round}
        </span>

        {/* Timer — push to the right side (omitted in online run since it's async) */}
        {showTimer && (
          <div className="ml-auto">
            <Timer durationMs={timerDurationMs} onExpire={onTimerExpire} />
          </div>
        )}

        {/* Gem Library shortcut */}
        <button
          onClick={() => navigate('/gems')}
          className={`text-xs text-surface-400 hover:text-accent-400 ${showTimer ? '' : 'ml-auto'}`}
          style={{ fontFamily: 'var(--font-family-body)' }}
        >
          Gem Library
        </button>

        {/* Done button */}
        <HapticButton
          variant="primary"
          size="sm"
          onClick={onDone}
          data-primary-action="done-forging"
          className="min-h-[36px]"
        >
          DONE
        </HapticButton>
      </div>

      {/* Row 2: Stats row (flux moved inline into the Flux Actions block) */}
      <div
        className="flex items-center justify-center gap-3 px-3 py-1"
      >
        <StatItem label="HP" value={stats?.maxHP ?? 0} color="var(--color-success)" />
        <DamageStatItem gemDamage={gemDamage} value={totalDamage} />
        <StatItem
          label="ARM"
          value={`${stats?.armor ?? 0}%`}
          color="var(--color-teal-500)"
        />
        <StatItem
          label="CRT"
          value={`${stats?.critChance ?? 0}%`}
          color={(stats?.critChance ?? 0) === 0 ? 'var(--color-danger)' : 'white'}
        />
      </div>

      {/* Row 3: Active/pending synergy chips */}
      {registry && activeSynergies && activeSynergies.length > 0 && (
        <SynergyBanner synergies={activeSynergies} registry={registry} />
      )}
    </div>
  );
}

function StatItem({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <span
        style={{
          fontFamily: DISPLAY_FONT,
          fontSize: 'var(--text-2xs)',
          textTransform: 'uppercase',
          color: 'var(--color-surface-300)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: DISPLAY_FONT,
          fontWeight: 700,
          fontSize: 'var(--text-xs)',
          color,
        }}
      >
        {value}
      </span>
    </span>
  );
}

/**
 * DMG stat item with a hover/tap tooltip listing only the damage each
 * equipped gem is contributing — so "where's my chaos damage coming from?"
 * answers itself.
 */
function DamageStatItem({
  gemDamage,
  value,
}: {
  gemDamage: GemDamageContribution[];
  value: number;
}) {
  const [open, setOpen] = useState(false);
  const display = Number.isInteger(value) ? `${value}` : value.toFixed(1);

  return (
    <span
      className="relative inline-flex items-baseline gap-0.5"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onClick={() => setOpen((v) => !v)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      aria-label="Damage breakdown"
      style={{ cursor: 'help' }}
    >
      <span
        style={{
          fontFamily: DISPLAY_FONT,
          fontSize: 'var(--text-2xs)',
          textTransform: 'uppercase',
          color: 'var(--color-surface-300)',
        }}
      >
        DMG
      </span>
      <span
        style={{
          fontFamily: DISPLAY_FONT,
          fontWeight: 700,
          fontSize: 'var(--text-xs)',
          color: 'white',
        }}
      >
        {display}
      </span>
      {open && (
        <div
          role="tooltip"
          className="absolute left-1/2 z-50 -translate-x-1/2"
          style={{
            top: 'calc(100% + 6px)',
            minWidth: 180,
            padding: '8px 10px',
            background: 'var(--color-surface-900)',
            border: '1px solid var(--color-surface-500)',
            boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
            fontFamily: DISPLAY_FONT,
            fontSize: 'var(--text-2xs)',
            letterSpacing: '0.04em',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              fontWeight: 700,
              color: 'var(--color-bronze-500)',
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              marginBottom: 6,
              borderBottom: '1px solid var(--color-surface-700)',
              paddingBottom: 4,
            }}
          >
            From Equipped Gems
          </div>
          {gemDamage.length === 0 ? (
            <div style={{ color: 'var(--color-surface-400)' }}>
              No damage gems socketed.
            </div>
          ) : (
            gemDamage.map((r, idx) => (
              <div
                key={r.source ? `${r.type}:${r.source}` : `${r.type}:${idx}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '2px 0',
                  color: ELEMENT_COLORS[r.type] ?? 'white',
                }}
              >
                <span style={{ textTransform: 'uppercase' }}>
                  {r.type}
                  {r.source ? (
                    <span
                      style={{
                        marginLeft: 6,
                        color: 'var(--color-surface-400)',
                        textTransform: 'none',
                        fontWeight: 500,
                      }}
                    >
                      from {formatCompoundName(r.source)}
                    </span>
                  ) : null}
                </span>
                <span style={{ fontWeight: 700 }}>
                  +{formatNumber(r.value)}
                  {r.suffix ? (
                    <span
                      style={{
                        marginLeft: 4,
                        color: 'var(--color-surface-400)',
                        fontWeight: 500,
                      }}
                    >
                      {r.suffix}
                    </span>
                  ) : null}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </span>
  );
}

function formatNumber(v: number): string {
  return Number.isInteger(v) ? `${v}` : v.toFixed(1);
}

/** Title-case a recipe id like "ignite" or "soul_rend" → "Ignite" / "Soul Rend". */
function formatCompoundName(id: string): string {
  return id
    .split('_')
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}
