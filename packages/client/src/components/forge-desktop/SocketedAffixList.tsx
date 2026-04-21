import type { AffixDef, DataRegistry, EquippedSlot } from '@alloy/engine';
import { ELEMENT_COLORS, ELEMENT_EMOJIS } from '@/shared/utils/element-theme';
import { getStatLabel } from '@/shared/utils/stat-label';

const ELEMENTS = ['fire', 'cold', 'lightning', 'poison', 'shadow', 'chaos'] as const;

interface SocketedAffixListProps {
  slots: (EquippedSlot | null)[];
  cardId: 'weapon' | 'armor';
  registry: DataRegistry;
}

/**
 * Per-socket affix rows below the `SocketGrid` on a gear panel.
 *
 * Visual reference: mockup-c-hud-v2-filled.html `.affix-list` — a 2-column
 * grid where each row maps 1:1 to a socket in reading order (left→right,
 * top→bottom). Empty sockets render as dim placeholder rows so the list
 * shape stays constant as gems are socketed. Rows expose `data-testid` and
 * `data-empty` anchors for the Chunk 5 unit + E2E smoke coverage.
 */
export function SocketedAffixList({ slots, cardId, registry }: SocketedAffixListProps) {
  const allEmpty = slots.every((slot) => slot === null);

  if (allEmpty) {
    return (
      <div
        data-socketed-affix-list={cardId}
        data-all-empty="true"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '10px 0 6px',
          flex: 1,
          fontFamily: 'var(--font-family-display)',
          fontWeight: 500,
          fontSize: 'var(--text-2xs)',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--color-surface-300)',
          fontStyle: 'italic',
        }}
      >
        — no gems socketed —
      </div>
    );
  }

  return (
    <div
      data-socketed-affix-list={cardId}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '4px 14px',
        padding: '10px 0 6px',
        flex: 1,
      }}
    >
      {slots.map((slot, index) => {
        if (!slot) {
          return <EmptyRow key={index} />;
        }
        const affix = registry.findAffix(slot.gem.affixId);
        if (!affix) {
          // Registry miss — still render the slot so socket/row mapping
          // stays 1:1. Shows unknown id and "?" value.
          return (
            <FilledRow
              key={index}
              affixName={slot.gem.affixId}
              statLabel="?"
              element="physical"
              isRare={false}
            />
          );
        }
        const element = getPrimaryElement(affix);
        const statLabel = getStatLabel(affix, slot.gem, cardId);
        const isRare =
          slot.gem.rarity === 'rare' ||
          slot.gem.rarity === 'epic' ||
          slot.gem.rarity === 'legendary';
        return (
          <FilledRow
            key={index}
            affixName={affix.name}
            statLabel={statLabel}
            element={element}
            isRare={isRare}
          />
        );
      })}
    </div>
  );
}

/* ── Rows ─────────────────────────────────────────────────────── */

function FilledRow({
  affixName,
  statLabel,
  element,
  isRare,
}: {
  affixName: string;
  statLabel: string;
  element: string;
  isRare: boolean;
}) {
  const color = isRare ? '#facc15' : (ELEMENT_COLORS[element] ?? ELEMENT_COLORS.physical);
  const dotSymbol = ELEMENT_EMOJIS[element] ?? '\u25CF';

  return (
    <div
      data-testid="affix-row"
      data-empty="false"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--font-family-body)',
        fontSize: 'var(--text-2xs)',
        lineHeight: 1.2,
        minWidth: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontSize: 'var(--text-2xs)',
          lineHeight: 1,
          flexShrink: 0,
          width: 14,
          textAlign: 'center',
          color,
          filter: 'drop-shadow(0 0 3px currentColor)',
        }}
      >
        {dotSymbol}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-family-display)',
          fontWeight: 600,
          fontSize: 'var(--text-2xs)',
          letterSpacing: '0.04em',
          color,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          flex: 1,
          minWidth: 0,
        }}
      >
        {affixName}
        {isRare && (
          <span
            style={{
              fontFamily: 'var(--font-family-display)',
              fontWeight: 700,
              fontSize: '8px',
              color: '#1a1308',
              background: '#facc15',
              padding: '1px 4px',
              letterSpacing: '0.14em',
              marginLeft: 4,
            }}
          >
            R
          </span>
        )}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-family-display)',
          fontWeight: 700,
          fontSize: 'var(--text-2xs)',
          color,
          letterSpacing: '0.02em',
          textShadow: isRare
            ? '0 0 6px rgba(250, 204, 21, 0.5)'
            : undefined,
          flexShrink: 0,
        }}
      >
        {statLabel}
      </span>
    </div>
  );
}

function EmptyRow() {
  return (
    <div
      data-testid="affix-row"
      data-empty="true"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--font-family-body)',
        fontSize: 'var(--text-2xs)',
        lineHeight: 1.2,
        borderLeft: '2px dashed var(--color-surface-500)',
        paddingLeft: 6,
        color: 'var(--color-surface-300)',
        fontStyle: 'italic',
        minWidth: 0,
      }}
    >
      <span aria-hidden="true" style={{ width: 14 }} />
      <span
        style={{
          fontFamily: 'var(--font-family-display)',
          fontWeight: 500,
          fontSize: 'var(--text-2xs)',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          flex: 1,
          minWidth: 0,
        }}
      >
        — empty —
      </span>
    </div>
  );
}

function getPrimaryElement(affix: AffixDef): string {
  return (
    affix.tags.find((t) => (ELEMENTS as readonly string[]).includes(t)) ??
    'physical'
  );
}
