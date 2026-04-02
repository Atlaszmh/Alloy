import { useRef, useEffect, useMemo } from 'react';
import type { TickEvent } from '@alloy/engine';
import { groupEventsIntoSwings } from './combat-log-grouper.js';
import { SwingGroupComponent } from './SwingGroup.js';
import { UI_COLORS } from './colors.js';

export interface CombatLogPanelProps {
  events: Array<{ tick: number; event: TickEvent }>;
  ticksPerSecond: number;
}

export function CombatLogPanel({ events, ticksPerSecond }: CombatLogPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => groupEventsIntoSwings(events), [events]);

  // Reversed so newest is on top
  const reversed = useMemo(() => [...groups].reverse(), [groups]);

  // Auto-scroll to top (newest) when new events arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events.length]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#0f172a',
        borderRadius: 8,
        border: `1px solid ${UI_COLORS.separator}`,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: `1px solid ${UI_COLORS.separator}`,
          background: '#1e293b',
          color: '#94a3b8',
          fontWeight: 700,
          fontSize: 13,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          flexShrink: 0,
        }}
      >
        Combat Log
      </div>

      {/* Scrollable event list */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          fontSize: 14,
        }}
      >
        {reversed.length === 0 && (
          <div
            style={{
              padding: 16,
              textAlign: 'center',
              color: UI_COLORS.muted,
              fontSize: 13,
            }}
          >
            Waiting for combat...
          </div>
        )}
        {reversed.map((group, i) => (
          <SwingGroupComponent key={`${group.tick}-${i}`} group={group} ticksPerSecond={ticksPerSecond} />
        ))}
      </div>
    </div>
  );
}
