import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client.js';
import type { MatchListItem, MatchDetail } from '../api/client.js';

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page: {
    color: '#e4e4e7',
  } as React.CSSProperties,
  heading: {
    fontSize: '20px',
    fontWeight: 700,
    marginBottom: '20px',
    color: '#e4e4e7',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#a1a1aa',
    marginBottom: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  } as React.CSSProperties,
  card: {
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '16px',
  } as React.CSSProperties,
  filterBar: {
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: '8px',
    padding: '16px 20px',
    marginBottom: '16px',
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap' as const,
    alignItems: 'flex-end',
  } as React.CSSProperties,
  filterGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  } as React.CSSProperties,
  label: {
    fontSize: '12px',
    color: '#a1a1aa',
    fontWeight: 500,
  } as React.CSSProperties,
  input: {
    padding: '6px 10px',
    background: '#0f1117',
    border: '1px solid #27272a',
    borderRadius: '6px',
    color: '#e4e4e7',
    fontSize: '13px',
    width: '120px',
  } as React.CSSProperties,
  select: {
    padding: '6px 10px',
    background: '#0f1117',
    border: '1px solid #27272a',
    borderRadius: '6px',
    color: '#e4e4e7',
    fontSize: '13px',
  } as React.CSSProperties,
  btn: {
    padding: '6px 16px',
    background: '#6366f1',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    alignSelf: 'flex-end',
  } as React.CSSProperties,
  btnSecondary: {
    padding: '6px 14px',
    background: 'transparent',
    border: '1px solid #27272a',
    borderRadius: '6px',
    color: '#a1a1aa',
    cursor: 'pointer',
    fontSize: '13px',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
  } as React.CSSProperties,
  th: {
    padding: '8px 12px',
    textAlign: 'left' as const,
    borderBottom: '1px solid #27272a',
    color: '#a1a1aa',
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  } as React.CSSProperties,
  td: {
    padding: '8px 12px',
    borderBottom: '1px solid #27272a22',
    color: '#e4e4e7',
    fontFamily: 'monospace',
    verticalAlign: 'top' as const,
  } as React.CSSProperties,
  trHover: {
    cursor: 'pointer',
  } as React.CSSProperties,
  badge: (winner: number | null) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
    background: winner === 0 ? '#1e1e3a' : winner === 1 ? '#2e1010' : '#1a1a1a',
    color: winner === 0 ? '#6366f1' : winner === 1 ? '#ef4444' : '#71717a',
    border: `1px solid ${winner === 0 ? '#6366f1' : winner === 1 ? '#ef4444' : '#27272a'}`,
  }) as React.CSSProperties,
  detailOverlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '32px 16px',
    overflowY: 'auto' as const,
  } as React.CSSProperties,
  detailPanel: {
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: '10px',
    padding: '24px',
    width: '100%',
    maxWidth: '860px',
    position: 'relative' as const,
  } as React.CSSProperties,
  closeBtn: {
    position: 'absolute' as const,
    top: '16px',
    right: '16px',
    background: 'transparent',
    border: 'none',
    color: '#a1a1aa',
    cursor: 'pointer',
    fontSize: '20px',
    lineHeight: 1,
    padding: '4px 8px',
  } as React.CSSProperties,
  muted: {
    color: '#a1a1aa',
    fontSize: '14px',
  } as React.CSSProperties,
  affixChip: {
    display: 'inline-block',
    padding: '2px 6px',
    background: '#0f1117',
    border: '1px solid #27272a',
    borderRadius: '4px',
    fontSize: '11px',
    color: '#a1a1aa',
    marginRight: '4px',
    marginBottom: '2px',
    fontFamily: 'monospace',
  } as React.CSSProperties,
  roundCard: {
    background: '#0f1117',
    border: '1px solid #27272a',
    borderRadius: '6px',
    padding: '12px 16px',
    marginBottom: '8px',
  } as React.CSSProperties,
  paginationBar: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: '12px',
  } as React.CSSProperties,
};

const PAGE_SIZE = 50;

// ─── Detail panel ─────────────────────────────────────────────────────────────

function MatchDetailPanel({ matchId, onClose }: { matchId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.reports.matchDetail(matchId)
      .then(setDetail)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [matchId]);

  function renderLoadout(loadout: unknown, player: 0 | 1) {
    if (!loadout || typeof loadout !== 'object') {
      return <span style={S.muted}>No loadout data</span>;
    }
    const l = loadout as Record<string, unknown>;
    const sections: React.ReactNode[] = [];

    // Handle weapons array
    const weapons = l.weapons as unknown[] | undefined;
    if (Array.isArray(weapons) && weapons.length > 0) {
      sections.push(
        <div key="weapons" style={{ marginBottom: '8px' }}>
          <div style={{ ...S.label, marginBottom: '4px' }}>Weapons</div>
          {weapons.map((w, i) => {
            const weapon = w as Record<string, unknown>;
            const affixes = (weapon.affixes as string[] | undefined) ?? [];
            return (
              <div key={i} style={{ marginBottom: '4px' }}>
                <span style={{ color: '#6366f1', fontSize: '13px' }}>{String(weapon.id ?? weapon.name ?? `Weapon ${i + 1}`)}</span>
                {affixes.map((a) => <span key={a} style={S.affixChip}>{a}</span>)}
              </div>
            );
          })}
        </div>
      );
    }

    // Handle armor array
    const armor = l.armor as unknown[] | undefined;
    if (Array.isArray(armor) && armor.length > 0) {
      sections.push(
        <div key="armor" style={{ marginBottom: '8px' }}>
          <div style={{ ...S.label, marginBottom: '4px' }}>Armor</div>
          {armor.map((a, i) => {
            const piece = a as Record<string, unknown>;
            const affixes = (piece.affixes as string[] | undefined) ?? [];
            return (
              <div key={i} style={{ marginBottom: '4px' }}>
                <span style={{ color: '#22c55e', fontSize: '13px' }}>{String(piece.id ?? piece.name ?? `Piece ${i + 1}`)}</span>
                {affixes.map((af) => <span key={af} style={S.affixChip}>{af}</span>)}
              </div>
            );
          })}
        </div>
      );
    }

    // Fallback: render JSON keys
    if (sections.length === 0) {
      return (
        <pre style={{ ...S.muted, fontSize: '12px', fontFamily: 'monospace', overflow: 'auto' }}>
          {JSON.stringify(loadout, null, 2)}
        </pre>
      );
    }

    return <div><div style={{ color: player === 0 ? '#6366f1' : '#ef4444', fontWeight: 600, marginBottom: '6px', fontSize: '13px' }}>Player {player}</div>{sections}</div>;
  }

  return (
    <div style={S.detailOverlay} onClick={onClose}>
      <div style={S.detailPanel} onClick={(e) => e.stopPropagation()}>
        <button style={S.closeBtn} onClick={onClose} title="Close">×</button>
        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px', color: '#e4e4e7' }}>
          Match Detail
          <span style={{ color: '#a1a1aa', fontWeight: 400, fontSize: '13px', marginLeft: '10px', fontFamily: 'monospace' }}>
            {matchId.slice(0, 8)}
          </span>
        </h3>

        {loading && <div style={S.muted}>Loading…</div>}
        {error && <div style={{ color: '#ef4444' }}>{error}</div>}

        {detail && (
          <>
            {/* Summary row */}
            <div style={{ display: 'flex', gap: '24px', marginBottom: '16px', flexWrap: 'wrap', fontSize: '13px' }}>
              <span><span style={{ color: '#a1a1aa' }}>Seed: </span><span style={{ fontFamily: 'monospace' }}>{detail.seed}</span></span>
              <span>
                <span style={{ color: '#a1a1aa' }}>Winner: </span>
                <span style={S.badge(detail.winner)}>
                  {detail.winner === null ? 'Draw' : `P${detail.winner}`}
                </span>
              </span>
              <span><span style={{ color: '#a1a1aa' }}>Rounds: </span>{detail.rounds}</span>
              <span><span style={{ color: '#a1a1aa' }}>Duration: </span>{detail.duration_ms}ms</span>
            </div>

            {/* Loadouts */}
            {(detail.p0_loadout || detail.p1_loadout) && (
              <div style={S.card}>
                <div style={S.sectionTitle}>Player Loadouts</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>{renderLoadout(detail.p0_loadout, 0)}</div>
                  <div>{renderLoadout(detail.p1_loadout, 1)}</div>
                </div>
              </div>
            )}

            {/* Affixes */}
            {(detail.p0_affixes || detail.p1_affixes) && (
              <div style={S.card}>
                <div style={S.sectionTitle}>Affixes</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <div style={{ color: '#6366f1', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Player 0</div>
                    {(detail.p0_affixes ?? []).map((a) => <span key={a} style={S.affixChip}>{a}</span>)}
                    {(!detail.p0_affixes || detail.p0_affixes.length === 0) && <span style={S.muted}>None</span>}
                  </div>
                  <div>
                    <div style={{ color: '#ef4444', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Player 1</div>
                    {(detail.p1_affixes ?? []).map((a) => <span key={a} style={S.affixChip}>{a}</span>)}
                    {(!detail.p1_affixes || detail.p1_affixes.length === 0) && <span style={S.muted}>None</span>}
                  </div>
                </div>
              </div>
            )}

            {/* Round-by-round stats */}
            {detail.round_details && detail.round_details.length > 0 && (
              <div style={S.card}>
                <div style={S.sectionTitle}>Round-by-Round Stats</div>
                {detail.round_details.map((r) => (
                  <div key={r.round} style={S.roundCard}>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '13px' }}>
                      <span style={{ color: '#6366f1', fontWeight: 600 }}>Round {r.round}</span>
                      <span>
                        <span style={{ color: '#a1a1aa' }}>Winner: </span>
                        <span style={S.badge(r.winner)}>
                          {r.winner === null ? 'Draw' : `P${r.winner}`}
                        </span>
                      </span>
                      <span><span style={{ color: '#a1a1aa' }}>Duration: </span><span style={{ fontFamily: 'monospace' }}>{r.duration_ticks} ticks</span></span>
                      <span><span style={{ color: '#a1a1aa' }}>P0 Dmg: </span><span style={{ fontFamily: 'monospace', color: '#6366f1' }}>{r.p0_damage_dealt.toFixed(0)}</span></span>
                      <span><span style={{ color: '#a1a1aa' }}>P1 Dmg: </span><span style={{ fontFamily: 'monospace', color: '#ef4444' }}>{r.p1_damage_dealt.toFixed(0)}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Combat log */}
            {detail.combat_log === null && (
              <div style={{ ...S.muted, padding: '12px', background: '#0f1117', borderRadius: '6px', border: '1px solid #27272a' }}>
                Combat log not available
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MatchInspectorPage() {
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Filter state
  const [seedInput, setSeedInput] = useState('');
  const [winnerFilter, setWinnerFilter] = useState('');
  const [runIdInput, setRunIdInput] = useState('');

  // Detail view
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  const fetchMatches = useCallback(
    (newOffset: number, append: boolean) => {
      setLoading(true);
      setError(null);
      const params: Parameters<typeof api.reports.matches>[0] = {
        limit: PAGE_SIZE + 1,
        offset: newOffset,
      };
      if (seedInput.trim()) {
        const n = parseInt(seedInput.trim(), 10);
        if (!isNaN(n)) params.seed = n;
      }
      if (winnerFilter !== '') params.winner = parseInt(winnerFilter, 10);
      if (runIdInput.trim()) params.runId = runIdInput.trim();

      api.reports.matches(params)
        .then((rows) => {
          const hasNextPage = rows.length > PAGE_SIZE;
          const page = hasNextPage ? rows.slice(0, PAGE_SIZE) : rows;
          setMatches((prev) => append ? [...prev, ...page] : page);
          setHasMore(hasNextPage);
          setOffset(newOffset);
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setLoading(false));
    },
    [seedInput, winnerFilter, runIdInput],
  );

  // Initial load
  useEffect(() => {
    fetchMatches(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch() {
    fetchMatches(0, false);
  }

  function handleNextPage() {
    fetchMatches(offset + PAGE_SIZE, true);
  }

  function winnerLabel(w: number | null): string {
    if (w === null) return 'Draw';
    return `P${w}`;
  }

  return (
    <div style={S.page}>
      <h2 style={S.heading}>Match Inspector</h2>

      {/* Filter bar */}
      <div style={S.filterBar}>
        <div style={S.filterGroup}>
          <span style={S.label}>Seed</span>
          <input
            style={S.input}
            type="number"
            placeholder="e.g. 12345"
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <div style={S.filterGroup}>
          <span style={S.label}>Winner</span>
          <select
            style={S.select}
            value={winnerFilter}
            onChange={(e) => setWinnerFilter(e.target.value)}
          >
            <option value="">Any</option>
            <option value="0">Player 0</option>
            <option value="1">Player 1</option>
          </select>
        </div>
        <div style={S.filterGroup}>
          <span style={S.label}>Run ID</span>
          <input
            style={{ ...S.input, width: '180px' }}
            type="text"
            placeholder="run UUID"
            value={runIdInput}
            onChange={(e) => setRunIdInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <button style={S.btn} onClick={handleSearch} disabled={loading}>
          {loading ? 'Loading…' : 'Search'}
        </button>
      </div>

      {error && (
        <div style={{ ...S.card, borderColor: '#ef4444', color: '#ef4444', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {/* Match table */}
      <div style={S.card}>
        {matches.length === 0 && !loading ? (
          <div style={S.muted}>No matches found. Try adjusting your filters or run a simulation first.</div>
        ) : (
          <>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Seed</th>
                  <th style={S.th}>Winner</th>
                  <th style={S.th}>Rounds</th>
                  <th style={S.th}>Duration</th>
                  <th style={S.th}>P0 Affixes</th>
                  <th style={S.th}>P1 Affixes</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => (
                  <tr
                    key={m.id}
                    style={S.trHover}
                    onClick={() => setSelectedMatchId(m.id)}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background = '#27272a44';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background = '';
                    }}
                  >
                    <td style={S.td}>{m.seed}</td>
                    <td style={S.td}>
                      <span style={S.badge(m.winner)}>{winnerLabel(m.winner)}</span>
                    </td>
                    <td style={S.td}>{m.rounds}</td>
                    <td style={S.td}>{m.duration_ms}ms</td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                        {(m.p0_affixes ?? []).slice(0, 4).map((a) => (
                          <span key={a} style={S.affixChip}>{a}</span>
                        ))}
                        {(m.p0_affixes ?? []).length > 4 && (
                          <span style={{ ...S.affixChip, color: '#71717a' }}>
                            +{(m.p0_affixes ?? []).length - 4}
                          </span>
                        )}
                        {(!m.p0_affixes || m.p0_affixes.length === 0) && (
                          <span style={{ color: '#71717a', fontSize: '12px' }}>—</span>
                        )}
                      </div>
                    </td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                        {(m.p1_affixes ?? []).slice(0, 4).map((a) => (
                          <span key={a} style={S.affixChip}>{a}</span>
                        ))}
                        {(m.p1_affixes ?? []).length > 4 && (
                          <span style={{ ...S.affixChip, color: '#71717a' }}>
                            +{(m.p1_affixes ?? []).length - 4}
                          </span>
                        )}
                        {(!m.p1_affixes || m.p1_affixes.length === 0) && (
                          <span style={{ color: '#71717a', fontSize: '12px' }}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div style={S.paginationBar}>
              <span style={S.muted}>{matches.length} result{matches.length !== 1 ? 's' : ''} shown</span>
              {hasMore && (
                <button style={S.btnSecondary} onClick={handleNextPage} disabled={loading}>
                  {loading ? 'Loading…' : 'Load more'}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Detail overlay */}
      {selectedMatchId && (
        <MatchDetailPanel
          matchId={selectedMatchId}
          onClose={() => setSelectedMatchId(null)}
        />
      )}
    </div>
  );
}
