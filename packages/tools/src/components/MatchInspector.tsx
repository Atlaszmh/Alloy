import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import type { CombatLog, TickEvent } from '@alloy/engine';
import type { SimulationResults } from '../types';

const card: React.CSSProperties = {
  background: '#1a1b23',
  border: '1px solid #27272a',
  borderRadius: '8px',
  padding: '20px',
  marginBottom: '16px',
};

const sectionTitle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  marginBottom: '16px',
  color: '#e4e4e7',
};

const mono: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '13px',
};

const PIE_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#71717a'];

function extractHPCurves(log: CombatLog): { tick: number; hp0: number; hp1: number }[] {
  const points: { tick: number; hp0: number; hp1: number }[] = [];
  let hp0 = -1;
  let hp1 = -1;

  for (const tickData of log.ticks) {
    for (const event of tickData.events) {
      if (event.type === 'hp_change') {
        if (hp0 < 0) {
          // Initialize from maxHP on first encounter
          hp0 = event.player === 0 ? event.oldHP : hp0;
          hp1 = event.player === 1 ? event.oldHP : hp1;
        }
        if (event.player === 0) hp0 = event.newHP;
        else hp1 = event.newHP;
      }
    }
    if (hp0 >= 0 && hp1 >= 0) {
      points.push({ tick: tickData.tick, hp0: Math.max(0, hp0), hp1: Math.max(0, hp1) });
    }
  }

  return points;
}

function extractDamageBreakdown(log: CombatLog, player: 0 | 1): { name: string; value: number }[] {
  const dmg = new Map<string, number>();
  for (const tickData of log.ticks) {
    for (const event of tickData.events) {
      if (event.type === 'attack' && event.attacker === player) {
        const key = event.damageType;
        dmg.set(key, (dmg.get(key) ?? 0) + event.damage);
      }
      if (event.type === 'dot_tick' && event.target !== player) {
        const key = `${event.element} (DOT)`;
        dmg.set(key, (dmg.get(key) ?? 0) + event.damage);
      }
      if (event.type === 'thorns' && event.reflector === player) {
        dmg.set('thorns', (dmg.get('thorns') ?? 0) + event.damage);
      }
    }
  }
  return Array.from(dmg.entries())
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);
}

const EVENT_FILTER_TYPES = [
  'attack', 'block', 'dodge', 'dot_apply', 'dot_tick',
  'lifesteal', 'thorns', 'barrier_absorb', 'trigger_proc',
  'synergy_proc', 'stun', 'hp_change', 'death',
] as const;

function formatEvent(tick: number, event: TickEvent): string {
  switch (event.type) {
    case 'attack':
      return `[${tick}] P${event.attacker} attacks for ${event.damage.toFixed(1)} ${event.damageType}${event.isCrit ? ' (CRIT)' : ''}`;
    case 'block':
      return `[${tick}] P${event.blocker} blocks ${event.blockedDamage.toFixed(1)} damage`;
    case 'dodge':
      return `[${tick}] P${event.dodger} dodges`;
    case 'dot_apply':
      return `[${tick}] P${event.target} receives ${event.element} DOT (${event.dps}/tick, ${event.durationTicks} ticks)`;
    case 'dot_tick':
      return `[${tick}] P${event.target} takes ${event.damage.toFixed(1)} ${event.element} DOT`;
    case 'lifesteal':
      return `[${tick}] P${event.player} heals ${event.healed.toFixed(1)} (lifesteal)`;
    case 'thorns':
      return `[${tick}] P${event.reflector} reflects ${event.damage.toFixed(1)} thorns`;
    case 'barrier_absorb':
      return `[${tick}] P${event.player} barrier absorbs ${event.absorbed.toFixed(1)} (${event.remaining.toFixed(0)} left)`;
    case 'trigger_proc':
      return `[${tick}] P${event.player} trigger: ${event.triggerId} - ${event.effectDescription}`;
    case 'synergy_proc':
      return `[${tick}] P${event.player} synergy: ${event.synergyId} - ${event.effectDescription}`;
    case 'stun':
      return `[${tick}] P${event.target} stunned for ${event.durationTicks} ticks`;
    case 'hp_change':
      return `[${tick}] P${event.player} HP: ${event.oldHP.toFixed(0)} -> ${event.newHP.toFixed(0)} / ${event.maxHP}`;
    case 'death':
      return `[${tick}] P${event.player} DIES`;
  }
}

function StatRow({ label, v0, v1 }: { label: string; v0: string; v1: string }) {
  return (
    <tr>
      <td style={{ padding: '4px 12px', textAlign: 'right', color: '#a1a1aa' }}>{v0}</td>
      <td style={{ padding: '4px 12px', textAlign: 'center', color: '#6366f1', fontWeight: 600, fontSize: '12px' }}>{label}</td>
      <td style={{ padding: '4px 12px', textAlign: 'left', color: '#a1a1aa' }}>{v1}</td>
    </tr>
  );
}

function formatStat(value: number, isPercent = false): string {
  if (isPercent) return `${(value * 100).toFixed(1)}%`;
  return value.toFixed(1);
}

interface Props {
  results: SimulationResults | null;
}

export default function MatchInspector({ results }: Props) {
  const [selectedMatch, setSelectedMatch] = useState(0);
  const [selectedRound, setSelectedRound] = useState(0);
  const [eventFilter, setEventFilter] = useState<string>('all');

  const match = results?.matches[selectedMatch] ?? null;
  const log = match?.duelLogs[selectedRound] ?? null;

  const hpCurves = useMemo(() => {
    if (!log) return [];
    return extractHPCurves(log);
  }, [log]);

  const p0Damage = useMemo(() => log ? extractDamageBreakdown(log, 0) : [], [log]);
  const p1Damage = useMemo(() => log ? extractDamageBreakdown(log, 1) : [], [log]);

  const filteredEvents = useMemo(() => {
    if (!log) return [];
    const items: string[] = [];
    for (const tickData of log.ticks) {
      for (const event of tickData.events) {
        if (eventFilter === 'all' || event.type === eventFilter) {
          items.push(formatEvent(tickData.tick, event));
        }
      }
    }
    return items;
  }, [log, eventFilter]);

  if (!results) {
    return (
      <div style={card}>
        <p style={{ color: '#71717a' }}>Run a simulation first to inspect matches.</p>
      </div>
    );
  }

  const p0Stats = match?.player0Stats;
  const p1Stats = match?.player1Stats;

  return (
    <div>
      <h2 style={{ ...sectionTitle, fontSize: '20px', marginBottom: '16px' }}>Match Inspector</h2>

      <div style={{ ...card, display: 'flex', gap: '16px', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: '13px', color: '#a1a1aa', marginRight: '8px' }}>Match:</span>
          <select
            style={{
              padding: '6px 10px', background: '#0f1117', border: '1px solid #27272a',
              borderRadius: '6px', color: '#e4e4e7', fontSize: '13px', fontFamily: 'monospace',
            }}
            value={selectedMatch}
            onChange={(e) => { setSelectedMatch(Number(e.target.value)); setSelectedRound(0); }}
          >
            {results.matches.map((m, i) => (
              <option key={i} value={i}>
                #{i} (seed {m.seed}) - Winner: {m.winner === 'draw' ? 'Draw' : `P${m.winner}`}
              </option>
            ))}
          </select>
        </div>

        {match && match.duelLogs.length > 1 && (
          <div>
            <span style={{ fontSize: '13px', color: '#a1a1aa', marginRight: '8px' }}>Round:</span>
            <select
              style={{
                padding: '6px 10px', background: '#0f1117', border: '1px solid #27272a',
                borderRadius: '6px', color: '#e4e4e7', fontSize: '13px', fontFamily: 'monospace',
              }}
              value={selectedRound}
              onChange={(e) => setSelectedRound(Number(e.target.value))}
            >
              {match.duelLogs.map((_, i) => (
                <option key={i} value={i}>Round {i + 1}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* HP Curves */}
      {log && hpCurves.length > 0 && (
        <div style={card}>
          <h3 style={sectionTitle}>HP Over Time (Round {selectedRound + 1})</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={hpCurves}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="tick" stroke="#71717a" fontSize={12} label={{ value: 'Tick', position: 'insideBottom', offset: -5, fill: '#71717a' }} />
              <YAxis stroke="#71717a" fontSize={12} />
              <Tooltip
                contentStyle={{ background: '#1a1b23', border: '1px solid #27272a', borderRadius: '6px' }}
                labelStyle={{ color: '#e4e4e7' }}
              />
              <Legend />
              <Line type="monotone" dataKey="hp0" name="Player 0 HP" stroke="#6366f1" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="hp1" name="Player 1 HP" stroke="#ef4444" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Damage Breakdown */}
      {log && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={card}>
            <h3 style={sectionTitle}>P0 Damage Dealt</h3>
            {p0Damage.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={p0Damage} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(e) => `${e.name}: ${e.value}`}>
                    {p0Damage.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1a1b23', border: '1px solid #27272a', borderRadius: '6px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p style={{ color: '#71717a', fontSize: '13px' }}>No damage data</p>}
          </div>
          <div style={card}>
            <h3 style={sectionTitle}>P1 Damage Dealt</h3>
            {p1Damage.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={p1Damage} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(e) => `${e.name}: ${e.value}`}>
                    {p1Damage.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1a1b23', border: '1px solid #27272a', borderRadius: '6px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p style={{ color: '#71717a', fontSize: '13px' }}>No damage data</p>}
          </div>
        </div>
      )}

      {/* Stats Comparison */}
      {p0Stats && p1Stats && (
        <div style={card}>
          <h3 style={sectionTitle}>Stats Comparison</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', ...mono }}>
            <thead>
              <tr>
                <th style={{ padding: '6px 12px', textAlign: 'right', color: '#6366f1' }}>Player 0</th>
                <th style={{ padding: '6px 12px', textAlign: 'center', color: '#71717a' }}>Stat</th>
                <th style={{ padding: '6px 12px', textAlign: 'left', color: '#ef4444' }}>Player 1</th>
              </tr>
            </thead>
            <tbody>
              <StatRow label="Max HP" v0={formatStat(p0Stats.maxHP)} v1={formatStat(p1Stats.maxHP)} />
              <StatRow label="Physical Dmg" v0={formatStat(p0Stats.physicalDamage)} v1={formatStat(p1Stats.physicalDamage)} />
              <StatRow label="Attack Interval" v0={formatStat(p0Stats.attackInterval)} v1={formatStat(p1Stats.attackInterval)} />
              <StatRow label="Armor" v0={formatStat(p0Stats.armor, true)} v1={formatStat(p1Stats.armor, true)} />
              <StatRow label="Crit Chance" v0={formatStat(p0Stats.critChance, true)} v1={formatStat(p1Stats.critChance, true)} />
              <StatRow label="Crit Multi" v0={formatStat(p0Stats.critMultiplier)} v1={formatStat(p1Stats.critMultiplier)} />
              <StatRow label="Lifesteal" v0={formatStat(p0Stats.lifestealPercent, true)} v1={formatStat(p1Stats.lifestealPercent, true)} />
              <StatRow label="Block" v0={formatStat(p0Stats.blockChance, true)} v1={formatStat(p1Stats.blockChance, true)} />
              <StatRow label="Dodge" v0={formatStat(p0Stats.dodgeChance, true)} v1={formatStat(p1Stats.dodgeChance, true)} />
              <StatRow label="Thorns" v0={formatStat(p0Stats.thornsDamage)} v1={formatStat(p1Stats.thornsDamage)} />
              <StatRow label="Barrier" v0={formatStat(p0Stats.barrierAmount)} v1={formatStat(p1Stats.barrierAmount)} />
              <StatRow label="HP Regen" v0={formatStat(p0Stats.hpRegen)} v1={formatStat(p1Stats.hpRegen)} />
              <StatRow label="Armor Pen" v0={formatStat(p0Stats.armorPenetration, true)} v1={formatStat(p1Stats.armorPenetration, true)} />
              <StatRow label="Stun Chance" v0={formatStat(p0Stats.stunChance, true)} v1={formatStat(p1Stats.stunChance, true)} />
              <StatRow label="DOT Multi" v0={formatStat(p0Stats.dotMultiplier)} v1={formatStat(p1Stats.dotMultiplier)} />
            </tbody>
          </table>
        </div>
      )}

      {/* Event Log */}
      {log && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ ...sectionTitle, marginBottom: 0 }}>Event Log</h3>
            <select
              style={{
                padding: '6px 10px', background: '#0f1117', border: '1px solid #27272a',
                borderRadius: '6px', color: '#e4e4e7', fontSize: '13px',
              }}
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
            >
              <option value="all">All Events</option>
              {EVENT_FILTER_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div style={{
            maxHeight: '400px',
            overflowY: 'auto',
            background: '#0f1117',
            border: '1px solid #27272a',
            borderRadius: '6px',
            padding: '12px',
            ...mono,
            fontSize: '12px',
            lineHeight: '1.6',
          }}>
            {filteredEvents.length === 0 ? (
              <p style={{ color: '#71717a' }}>No events match the filter.</p>
            ) : (
              filteredEvents.map((line, i) => (
                <div key={i} style={{
                  color: line.includes('CRIT') ? '#eab308' :
                    line.includes('DIES') ? '#ef4444' :
                    line.includes('heals') ? '#22c55e' :
                    line.includes('block') ? '#3b82f6' :
                    '#a1a1aa',
                }}>
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
