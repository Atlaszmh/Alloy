import { useState } from 'react';
import type { ActiveSynergy, DataRegistry, DerivedStats } from '@alloy/engine';
import { ALL_ELEMENTS } from '@alloy/engine';
import { SynergyBanner } from '@/components/SynergyBanner';
import { ELEMENT_COLORS } from '@/shared/utils/element-theme';
import type { GemDamageContribution } from '@/shared/utils/gem-damage-breakdown';

type StatKey = 'maxHP' | 'totalDamage' | 'armor' | 'critChance';

interface StatRow {
  key: StatKey;
  label: string;
  /** 0–1 fill — renders the ember-coloured progress bar. */
  pct: (value: number) => number;
  /** User-facing readout, e.g. "258", "12.5", "36%". */
  format: (value: number) => string;
  /** Rendered suffix (e.g. "%") — extracted for right-side dim colour. */
  suffix?: string;
  /** Bar-gradient flavour (matches the mockup `.stat-bar.{hp,dmg,arm,crt}`). */
  barGradient: string;
}

// DISPLAY-ONLY ceilings for the stat-bar fill ratios. These aren't engine
// caps — they're visual references chosen to make the bar read nicely at
// mid-progression values (HP ~400, DMG ~25, etc.). Revisit when stat
// soft-caps land in balance config; lifting into balance.display.statCeilings
// would be the cleanest promotion.
const STAT_ROWS: StatRow[] = [
  {
    key: 'maxHP',
    label: 'HP',
    pct: (v) => clamp01(v / 500),
    format: (v) => `${Math.round(v)}`,
    barGradient: 'linear-gradient(90deg, var(--color-fire), var(--color-accent-300))',
  },
  {
    key: 'totalDamage',
    label: 'DMG',
    pct: (v) => clamp01(v / 80),
    format: (v) => (Number.isInteger(v) ? `${v}` : v.toFixed(1)),
    barGradient: 'linear-gradient(90deg, #9a9a9a, #e5e5e5)',
  },
  {
    key: 'armor',
    label: 'ARM',
    pct: (v) => clamp01(v / 100),
    format: (v) => `${Math.round(v)}`,
    suffix: '%',
    barGradient: 'linear-gradient(90deg, var(--color-teal-500), var(--color-cold))',
  },
  {
    key: 'critChance',
    label: 'CRT',
    pct: (v) => clamp01(v / 100),
    format: (v) => `${Math.round(v)}`,
    suffix: '%',
    barGradient: 'linear-gradient(90deg, var(--color-accent-500), var(--color-accent-300))',
  },
];

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Compute the headline DMG. Starts from the engine-derived physical +
 * elemental totals (which include weapon base, base-stat scaling, and gem
 * contributions for every element the engine models) and then adds the
 * gem-sourced poison/shadow values — those use special duel-engine-only keys
 * (`dotDamage.poison`, `shadowDamage.percentHP`) so they never land on
 * DerivedStats, but the player still wants to see them counted.
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

function readStatValue(
  stats: DerivedStats,
  key: StatKey,
  gemDamage: GemDamageContribution[],
): number {
  if (key === 'totalDamage') return computeTotalDamage(stats, gemDamage);
  return stats[key];
}

interface CharacterRailProps {
  stats: DerivedStats | null;
  /** Optional green +N overlays rendered under the value (mockup .stat-delta). */
  statDeltas?: Partial<Record<StatKey, number>>;
  /**
   * Per-type damage totals sourced from equipped-gem weapon effects — drives
   * the DMG breakdown tooltip so the player can see exactly what each gem is
   * adding, including poison/shadow/chaos that the engine aggregates through
   * non-standard keys.
   */
  gemDamage: GemDamageContribution[];
  /**
   * Active + pending synergy chips — mirrors portrait ForgeHeader feature.
   * Rendered between the character readout and the forge-tuning dials so the
   * character-level state all sits in one rail.
   */
  activeSynergies?: ActiveSynergy[];
  registry?: DataRegistry;
}

/**
 * Left HUD rail. Single Character Readout panel (HP/DMG/ARM/CRT) with a
 * damage-breakdown tooltip on hover over the DMG cell so players can see
 * where each point of damage is coming from (physical vs. each element).
 *
 * Width pulled from `--hud-rail-w`.
 */
export function CharacterRail({
  stats,
  statDeltas,
  gemDamage,
  activeSynergies,
  registry,
}: CharacterRailProps) {
  const showSynergies =
    !!registry && !!activeSynergies && activeSynergies.length > 0;

  return (
    <aside
      style={{
        width: 'var(--hud-rail-w)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--gap-sm)',
      }}
      aria-label="Character readout"
    >
      {/* ── Panel 1: Character Readout ────────────────────────── */}
      <Panel title="Character Readout" accent="LIVE">
        <div
          style={{
            padding: 'var(--gap-sm)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--gap-xs)',
          }}
        >
          {STAT_ROWS.map((row) => {
            const rawValue = stats ? readStatValue(stats, row.key, gemDamage) : 0;
            const delta = statDeltas?.[row.key];
            const hasValue = (stats && rawValue > 0) || delta !== undefined;
            const tile = (
              <>
                <div
                  style={{
                    fontFamily: 'var(--font-family-display)',
                    fontWeight: 600,
                    fontSize: 'var(--text-2xs)',
                    color: 'var(--color-surface-300)',
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                  }}
                >
                  {row.label}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-family-display)',
                    fontWeight: 700,
                    fontSize: 'var(--text-md)',
                    lineHeight: 1,
                    marginTop: 2,
                    color: hasValue ? 'var(--color-affix)' : 'white',
                    textShadow: hasValue
                      ? '0 0 6px rgba(30, 255, 0, 0.35)'
                      : undefined,
                  }}
                >
                  {row.format(rawValue)}
                  {row.suffix && (
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-surface-300)',
                        marginLeft: 2,
                      }}
                    >
                      {row.suffix}
                    </span>
                  )}
                </div>
                {delta !== undefined && (
                  <div
                    style={{
                      fontFamily: 'var(--font-family-display)',
                      fontWeight: 600,
                      fontSize: 'var(--text-2xs)',
                      color: 'var(--color-affix)',
                      letterSpacing: '0.04em',
                      marginTop: 3,
                      textShadow: '0 0 4px rgba(30, 255, 0, 0.3)',
                    }}
                  >
                    +{Number.isInteger(delta) ? delta : delta.toFixed(1)}
                  </div>
                )}
                {/* Progress bar */}
                <div
                  style={{
                    marginTop: 4,
                    height: 2,
                    background: 'var(--color-surface-700)',
                    position: 'relative',
                  }}
                  aria-hidden="true"
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      height: '100%',
                      width: `${row.pct(rawValue) * 100}%`,
                      background: row.barGradient,
                    }}
                  />
                </div>
              </>
            );

            if (row.key === 'totalDamage') {
              return (
                <DamageTile key={row.key} gemDamage={gemDamage}>
                  {tile}
                </DamageTile>
              );
            }

            return (
              <div
                key={row.key}
                style={{
                  background: 'var(--color-surface-900)',
                  border: '1px solid var(--color-surface-700)',
                  padding: '6px 8px 5px',
                  position: 'relative',
                }}
              >
                {tile}
              </div>
            );
          })}
        </div>
      </Panel>

      {/* ── Active / pending synergies (mirrors portrait ForgeHeader) ── */}
      {showSynergies && (
        <SynergyBanner synergies={activeSynergies!} registry={registry!} />
      )}
    </aside>
  );
}

/* ── DMG tile — wraps the stat cell with a gem-contribution tooltip ──
 *
 * Intentionally shows ONLY the per-type damage each equipped gem adds. The
 * weapon's base damage and base-stat scaling are already baked into the
 * headline DMG value next to it — the tooltip's job is to attribute "where
 * is the +N coming from?" to specific gems.
 */
function DamageTile({
  gemDamage,
  children,
}: {
  gemDamage: GemDamageContribution[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      style={{
        background: 'var(--color-surface-900)',
        border: '1px solid var(--color-surface-700)',
        padding: '6px 8px 5px',
        position: 'relative',
        cursor: 'help',
        outline: 'none',
      }}
      aria-label="Damage breakdown"
    >
      {children}
      {open && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 20,
            minWidth: 200,
            padding: '8px 10px',
            background: 'var(--color-surface-900)',
            border: '1px solid var(--color-surface-500)',
            boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
            fontFamily: 'var(--font-family-display)',
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
    </div>
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

/* ── Shared rail panel chrome ─────────────────────────────────── */
function Panel({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
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
          padding: '6px 10px',
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
        <span>{title}</span>
        <span
          style={{
            color: 'var(--color-surface-300)',
            fontWeight: 500,
            letterSpacing: '0.12em',
          }}
        >
          {accent}
        </span>
      </header>
      {children}
    </section>
  );
}
