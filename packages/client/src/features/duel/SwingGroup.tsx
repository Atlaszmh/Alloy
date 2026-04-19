import type { DamageBreakdown, DotTickBreakdown, HealBreakdown, Element } from '@alloy/engine';
import type { SwingGroup } from './combat-log-grouper.js';
import { DAMAGE_CSS_COLORS, UI_COLORS } from './colors.js';

/* ---------- helpers ---------- */

function formatTime(time: number): string {
  return time.toFixed(1);
}

function pct(n: number): string {
  return `${Math.round(n)}%`;
}

const ELEMENT_EMOJI: Record<Element, string> = {
  fire: '\uD83D\uDD25',
  cold: '\u2744\uFE0F',
  lightning: '\u26A1',
  poison: '\u2620\uFE0F',
  shadow: '\uD83C\uDF11',
  chaos: '\uD83C\uDF00',
};

/* ---------- sub-renderers ---------- */

function AttackHeader({
  breakdown,
  time,
  attacker,
}: {
  breakdown: DamageBreakdown;
  time: number;
  attacker?: 0 | 1;
}) {
  const isPlayer = attacker === 0;
  const who = isPlayer ? 'You attack' : 'Enemy attacks';

  if (breakdown.dodged) {
    return (
      <div style={{ color: UI_COLORS.dodged, fontWeight: 600 }}>
        [{formatTime(time)}s] {'\u2694'} {who} — <span style={{ fontStyle: 'italic' }}>DODGED</span>
      </div>
    );
  }

  const label = breakdown.isCrit ? `${who} — CRIT!` : who;
  return (
    <div style={{ color: breakdown.isCrit ? UI_COLORS.crit : '#cbd5e1', fontWeight: 600 }}>
      [{formatTime(time)}s] {'\u2694'} {label}
    </div>
  );
}

function DamageRows({ breakdown }: { breakdown: DamageBreakdown }) {
  if (breakdown.dodged) return null;

  const rows: React.ReactNode[] = [];

  // Physical
  if (breakdown.physical.raw > 0) {
    const p = breakdown.physical;
    rows.push(
      <div key="phys" style={{ paddingLeft: 16, color: DAMAGE_CSS_COLORS.physical, fontSize: 13 }}>
        {Math.round(p.raw)} physical{' '}
        {p.mitigated > 0 && (
          <span style={{ color: UI_COLORS.muted }}>
            {'\u2192'} -{Math.round(p.mitigated)} armor ({pct(p.reductionPct)})
          </span>
        )}{' '}
        {'\u2192'} <strong>{Math.round(p.net)}</strong>
      </div>,
    );
  }

  // Elemental
  for (const [elem, eb] of Object.entries(breakdown.elemental) as [Element, { raw: number; net: number; mitigated: number; reductionPct: number } | undefined][]) {
    if (!eb || eb.raw === 0) continue;
    rows.push(
      <div key={elem} style={{ paddingLeft: 16, color: DAMAGE_CSS_COLORS[elem], fontSize: 13 }}>
        {Math.round(eb.raw)} {elem}{' '}
        {eb.mitigated > 0 && (
          <span style={{ color: UI_COLORS.muted }}>
            {'\u2192'} -{Math.round(eb.mitigated)} resist ({pct(eb.reductionPct)})
          </span>
        )}{' '}
        {'\u2192'} <strong>{Math.round(eb.net)}</strong>
      </div>,
    );
  }

  // Blocked
  if (breakdown.blocked > 0) {
    rows.push(
      <div key="blocked" style={{ paddingLeft: 16, color: UI_COLORS.blocked, fontSize: 13 }}>
        {'\uD83D\uDEE1'} Blocked {Math.round(breakdown.blocked)}
      </div>,
    );
  }

  // Barrier absorbed
  if (breakdown.barrierAbsorbed > 0) {
    rows.push(
      <div key="barrier" style={{ paddingLeft: 16, color: UI_COLORS.blocked, fontSize: 13 }}>
        {'\uD83D\uDFE6'} Barrier absorbed {Math.round(breakdown.barrierAbsorbed)}
      </div>,
    );
  }

  return <>{rows}</>;
}

function HealRow({ breakdown }: { breakdown: HealBreakdown }) {
  return (
    <div style={{ paddingLeft: 16, color: UI_COLORS.healing, fontSize: 13 }}>
      +{Math.round(breakdown.effectiveHeal)} {breakdown.source}
      {breakdown.overheal > 0 && (
        <span style={{ color: UI_COLORS.overheal }}> ({Math.round(breakdown.overheal)} overheal)</span>
      )}
    </div>
  );
}

function DotHeader({
  breakdown,
  time,
}: {
  breakdown: DotTickBreakdown;
  time: number;
}) {
  const emoji = ELEMENT_EMOJI[breakdown.element] ?? '\uD83D\uDD25';
  return (
    <div style={{ color: DAMAGE_CSS_COLORS[breakdown.element], fontWeight: 600 }}>
      [{formatTime(time)}s] {emoji}{' '}
      {breakdown.element.charAt(0).toUpperCase() + breakdown.element.slice(1)}
      {breakdown.stacks > 1 && ` \u00D7${breakdown.stacks}`}
    </div>
  );
}

function DotDamageRow({ breakdown }: { breakdown: DotTickBreakdown }) {
  return (
    <div style={{ paddingLeft: 16, color: DAMAGE_CSS_COLORS[breakdown.element], fontSize: 13 }}>
      {Math.round(breakdown.rawTotal)} raw{' '}
      {breakdown.reductionPct > 0 && (
        <span style={{ color: UI_COLORS.muted }}>
          {'\u2192'} -{Math.round(breakdown.rawTotal - breakdown.netDamage)} resist ({pct(breakdown.reductionPct)})
        </span>
      )}{' '}
      {'\u2192'} <strong>{Math.round(breakdown.netDamage)}</strong>
    </div>
  );
}

function AttackSummary({
  breakdown,
  hpEvent,
}: {
  breakdown: DamageBreakdown;
  hpEvent?: { type: 'hp_change'; player: 0 | 1; newHP: number; maxHP: number };
}) {
  if (breakdown.dodged) return null;
  return (
    <div style={{ paddingLeft: 16, fontSize: 13, color: UI_COLORS.muted, marginTop: 2 }}>
      {breakdown.isCrit && (
        <span style={{ color: UI_COLORS.crit, marginRight: 8 }}>{'\u2605'} CRIT</span>
      )}
      <span>{Math.round(breakdown.totalNet)} total</span>
      {hpEvent && (
        <span>
          {' '}
          | {hpEvent.player === 0 ? 'You' : 'Enemy'}:{' '}
          <span style={{ color: hpEvent.player === 0 ? UI_COLORS.playerHP : UI_COLORS.enemyHP }}>
            {Math.round(hpEvent.newHP)} HP
          </span>
        </span>
      )}
    </div>
  );
}

/* ---------- background tint ---------- */

function getBackgroundTint(group: SwingGroup): string {
  if (group.type === 'death') return 'rgba(239, 68, 68, 0.10)';
  if (group.type === 'heal') return 'rgba(52, 211, 153, 0.08)';
  if (group.type === 'dot_tick') {
    const dotEvent = group.events[0]?.event;
    if (dotEvent && dotEvent.type === 'dot_tick') {
      const elem = dotEvent.breakdown.element;
      const hex = DAMAGE_CSS_COLORS[elem];
      return hex.replace('#', 'rgba(') ? `${hexToRgba(hex, 0.08)}` : 'rgba(249, 115, 22, 0.08)';
    }
    return 'rgba(249, 115, 22, 0.08)';
  }
  if (group.type === 'attack') {
    if (group.attacker === 1) return 'rgba(239, 68, 68, 0.06)';
    return 'rgba(148, 163, 184, 0.04)';
  }
  return 'transparent';
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ---------- main component ---------- */

export interface SwingGroupProps {
  group: SwingGroup;
}

export function SwingGroupComponent({ group }: SwingGroupProps) {
  const bg = getBackgroundTint(group);

  const containerStyle: React.CSSProperties = {
    padding: '6px 10px',
    borderBottom: `1px solid ${UI_COLORS.separator}`,
    background: bg,
    lineHeight: 1.5,
  };

  // Death
  if (group.type === 'death') {
    const deathEvent = group.events[0]?.event as { type: 'death'; player: 0 | 1 };
    const who = deathEvent.player === 0 ? 'You' : 'Enemy';
    return (
      <div style={containerStyle}>
        <div style={{ color: UI_COLORS.enemyHP, fontWeight: 700, fontSize: 14 }}>
          [{formatTime(group.time)}s] {'\uD83D\uDC80'} {who} died!
        </div>
      </div>
    );
  }

  // DOT tick
  if (group.type === 'dot_tick') {
    const dotEvent = group.events[0]?.event;
    if (dotEvent && dotEvent.type === 'dot_tick') {
      return (
        <div style={containerStyle}>
          <DotHeader breakdown={dotEvent.breakdown} time={group.time} />
          <DotDamageRow breakdown={dotEvent.breakdown} />
        </div>
      );
    }
  }

  // Standalone heal
  if (group.type === 'heal') {
    const healEvents = group.events.filter((e) => e.event.type === 'heal');
    const hpEvent = group.events.find((e) => e.event.type === 'hp_change');
    return (
      <div style={containerStyle}>
        <div style={{ color: UI_COLORS.healing, fontWeight: 600 }}>
          [{formatTime(group.time)}s] {'\u2764\uFE0F'} Heal
        </div>
        {healEvents.map((e, i) => {
          const he = e.event as { type: 'heal'; breakdown: HealBreakdown };
          return <HealRow key={i} breakdown={he.breakdown} />;
        })}
        {hpEvent && hpEvent.event.type === 'hp_change' && (
          <div style={{ paddingLeft: 16, fontSize: 13, color: UI_COLORS.muted }}>
            {hpEvent.event.player === 0 ? 'You' : 'Enemy'}:{' '}
            <span style={{ color: hpEvent.event.player === 0 ? UI_COLORS.playerHP : UI_COLORS.enemyHP }}>
              {Math.round(hpEvent.event.newHP)} HP
            </span>
          </div>
        )}
      </div>
    );
  }

  // Attack group
  const attackEvent = group.events.find((e) => e.event.type === 'attack');
  const healEvents = group.events.filter((e) => e.event.type === 'heal');
  const hpEvents = group.events.filter((e) => e.event.type === 'hp_change');
  const triggerEvents = group.events.filter((e) => e.event.type === 'trigger_proc' || e.event.type === 'synergy_proc');
  const compoundTriggers = group.events.filter((e) => e.event.type === 'compound_trigger');

  if (!attackEvent || attackEvent.event.type !== 'attack') {
    return (
      <div style={containerStyle}>
        <div style={{ color: UI_COLORS.muted, fontSize: 13 }}>
          [{formatTime(group.time)}s] ...
        </div>
      </div>
    );
  }

  const bd = attackEvent.event.breakdown;
  const targetHp = hpEvents.find((e) => {
    if (e.event.type !== 'hp_change') return false;
    return e.event.player === group.target;
  });

  return (
    <div style={containerStyle}>
      <AttackHeader
        breakdown={bd}
        time={group.time}
        attacker={group.attacker}
      />
      <DamageRows breakdown={bd} />
      {healEvents.map((e, i) => {
        if (e.event.type !== 'heal') return null;
        return <HealRow key={`heal-${i}`} breakdown={e.event.breakdown} />;
      })}
      {triggerEvents.map((e, i) => {
        if (e.event.type !== 'trigger_proc' && e.event.type !== 'synergy_proc') return null;
        return (
          <div key={`trig-${i}`} style={{ paddingLeft: 16, color: '#a78bfa', fontSize: 13 }}>
            {'\u2728'} {e.event.effectDescription}
          </div>
        );
      })}
      {compoundTriggers.map((e, i) => {
        if (e.event.type !== 'compound_trigger') return null;
        const who = e.event.player === 0 ? 'You' : 'Enemy';
        return (
          <div
            key={`compound-${i}`}
            style={{
              paddingLeft: 8,
              color: '#fbbf24',
              fontWeight: 700,
              letterSpacing: '0.06em',
              fontSize: 14,
              textShadow: '0 0 4px rgba(251, 191, 36, 0.35)',
            }}
          >
            {'\u2605'} {who} triggered {e.event.displayName}
          </div>
        );
      })}
      <AttackSummary
        breakdown={bd}
        hpEvent={
          targetHp && targetHp.event.type === 'hp_change'
            ? (targetHp.event as { type: 'hp_change'; player: 0 | 1; newHP: number; maxHP: number })
            : undefined
        }
      />
    </div>
  );
}
