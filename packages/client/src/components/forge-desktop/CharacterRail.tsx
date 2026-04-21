import type { ActiveSynergy, BaseStat, DataRegistry, DerivedStats } from '@alloy/engine';
import { SynergyBanner } from '@/components/SynergyBanner';

const BASE_STATS: BaseStat[] = ['STR', 'INT', 'DEX', 'VIT'];

type StatKey = 'maxHP' | 'physicalDamage' | 'armor' | 'critChance';

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
    key: 'physicalDamage',
    label: 'DMG',
    pct: (v) => clamp01(v / 40),
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

interface CharacterRailProps {
  stats: DerivedStats | null;
  /** Optional green +N overlays rendered under the value (mockup .stat-delta). */
  statDeltas?: Partial<Record<StatKey, number>>;
  weaponStats: [BaseStat, BaseStat];
  armorStats: [BaseStat, BaseStat];
  onWeaponStatChange: (index: 0 | 1, stat: BaseStat) => void;
  onArmorStatChange: (index: 0 | 1, stat: BaseStat) => void;
  /** Selectors are only editable in round 1, matching the portrait Forge. */
  round: number;
  /**
   * Active + pending synergy chips — mirrors portrait ForgeHeader feature.
   * Rendered between the character readout and the forge-tuning dials so the
   * character-level state all sits in one rail.
   */
  activeSynergies?: ActiveSynergy[];
  registry?: DataRegistry;
}

/**
 * Left HUD rail. Two stacked panels:
 *   1. Character Readout — HP/DMG/ARM/CRT cells with value, optional green
 *      +delta, and a colour-graded progress bar.
 *   2. Forge Tuning — weapon + armor base-stat pair selectors (STR/INT/DEX/VIT).
 *
 * Width pulled from `--hud-rail-w`.
 */
export function CharacterRail({
  stats,
  statDeltas,
  weaponStats,
  armorStats,
  onWeaponStatChange,
  onArmorStatChange,
  round,
  activeSynergies,
  registry,
}: CharacterRailProps) {
  const disabled = round > 1;
  const showSynergies =
    !!registry && !!activeSynergies && activeSynergies.length > 0;

  return (
    <aside
      style={{
        width: 'var(--hud-rail-w)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--gap-md)',
      }}
      aria-label="Character readout and base stat tuning"
    >
      {/* ── Panel 1: Character Readout ────────────────────────── */}
      <Panel title="Character Readout" accent="LIVE">
        <div
          style={{
            padding: 'var(--gap-md)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--gap-sm)',
          }}
        >
          {STAT_ROWS.map((row) => {
            const rawValue = stats ? stats[row.key] : 0;
            const delta = statDeltas?.[row.key];
            const hasValue = (stats && rawValue > 0) || delta !== undefined;
            return (
              <div
                key={row.key}
                style={{
                  background: 'var(--color-surface-900)',
                  border: '1px solid var(--color-surface-700)',
                  padding: '10px 10px 8px',
                  position: 'relative',
                }}
              >
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
                    fontSize: 'var(--text-lg)',
                    lineHeight: 1,
                    marginTop: 4,
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
                    marginTop: 6,
                    height: 3,
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
              </div>
            );
          })}
        </div>
      </Panel>

      {/* ── Active / pending synergies (mirrors portrait ForgeHeader) ── */}
      {showSynergies && (
        <SynergyBanner synergies={activeSynergies!} registry={registry!} />
      )}

      {/* ── Panel 2: Forge Tuning ─────────────────────────────── */}
      <Panel title="Forge Tuning" accent="BASE">
        <div
          style={{
            padding: '10px 12px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <BaseStatRow
            label="Weapon"
            pair={weaponStats}
            onChange={onWeaponStatChange}
            disabled={disabled}
          />
          <BaseStatRow
            label="Armor"
            pair={armorStats}
            onChange={onArmorStatChange}
            disabled={disabled}
          />
        </div>
      </Panel>
    </aside>
  );
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

/* ── Weapon/Armor base-stat selector row ──────────────────────── */
function BaseStatRow({
  label,
  pair,
  onChange,
  disabled,
}: {
  label: string;
  pair: [BaseStat, BaseStat];
  onChange: (index: 0 | 1, stat: BaseStat) => void;
  disabled: boolean;
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface-900)',
        border: '1px solid var(--color-surface-700)',
        padding: '8px 10px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-family-display)',
            fontWeight: 600,
            fontSize: 'var(--text-2xs)',
            color: 'var(--color-bronze-400)',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-family-display)',
            fontWeight: 700,
            fontSize: 'var(--text-2xs)',
            color: 'var(--color-surface-300)',
            letterSpacing: '0.14em',
            padding: '2px 6px',
            background: 'var(--color-surface-700)',
          }}
        >
          DIAL
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          gap: 'var(--gap-xs)',
        }}
      >
        {([0, 1] as const).map((idx) => (
          <select
            key={idx}
            value={pair[idx]}
            disabled={disabled}
            onChange={(e) => onChange(idx, e.target.value as BaseStat)}
            aria-label={`${label} base stat slot ${idx + 1}`}
            style={{
              flex: 1,
              padding: '7px 4px',
              textAlign: 'center',
              textAlignLast: 'center',
              background: 'var(--color-surface-950)',
              border: '1px solid var(--color-surface-600)',
              color: 'var(--color-accent-300)',
              fontFamily: 'var(--font-family-display)',
              fontWeight: 700,
              fontSize: 'var(--text-2xs)',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              cursor: disabled ? 'not-allowed' : 'pointer',
              appearance: 'none',
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {BASE_STATS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ))}
      </div>
    </div>
  );
}
