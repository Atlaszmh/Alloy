import type { ReactElement } from 'react';
import { Bar, Glyph, InputGlyph, Panel, type Binding } from '@/features/delve/kit';
import { MAX_TRACKED, QUEST_KIND, objectiveCount, type QuestView } from './types';

/** The dive's Journal hint (the controls' `journal` action arrives in Phase 3a). */
export const JOURNAL_BINDING: Binding = { key: 'KeyJ', pad: 'view' };

/** The HUD's quest tracker (Phase 3's right column): up to three tracked quests; nothing while none is. */
export function QuestTracker({ quests }: { quests: QuestView[] }): ReactElement | null {
  const shown = quests.filter((q) => q.tracked).slice(0, MAX_TRACKED);
  if (shown.length === 0) return null;
  return (
    <Panel
      as="div"
      material="glass"
      scroll={false}
      testId="quest-tracker"
      title={<span style={{ color: 'var(--k-hot-hi)' }}>Quests</span>}
      aside={
        <span className="flex items-center gap-2 text-[14px] text-[var(--k-text-3)]">
          <InputGlyph binding={JOURNAL_BINDING} size="sm" />
          Journal
        </span>
      }
    >
      {shown.map((q) => (
        <div key={q.id} className="flex flex-col gap-[6px]" data-testid={`tracked-${q.id}`}>
          <div className="flex items-baseline gap-2">
            <span className="k-label" style={{ color: QUEST_KIND[q.kind].text }}>
              {QUEST_KIND[q.kind].tag}
            </span>
            <span className="k-disp text-[19px]">{q.name}</span>
          </div>
          {q.objectives.map((o) => (
            <div key={o.id} className="flex flex-col gap-1">
              <div className="grid grid-cols-[12px_1fr_auto] items-center gap-2 text-[14px]">
                <Box done={o.done} size={10} />
                <span className={o.done ? 'text-[var(--k-text-3)]' : ''}>{o.text}</span>
                {o.done ? (
                  <Glyph id="check" size={14} color="#63c74d" title="Done" />
                ) : (
                  <b className="k-disp text-[16px] text-[var(--k-hot-hi)]">{objectiveCount(o)}</b>
                )}
              </div>
              {!o.done && o.progress && (
                <div className="ml-5">
                  <Bar
                    kind="progress"
                    value={o.progress.value}
                    max={o.progress.max}
                    height={6}
                    segmented
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </Panel>
  );
}

/** An objective's check box: filled green once done. */
export function Box({ done, size }: { done: boolean; size: number }): ReactElement {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        boxSizing: 'content-box',
        border: `${size > 10 ? 3 : 2}px solid ${done ? 'var(--k-ok)' : 'var(--k-text-2)'}`,
        background: done ? 'var(--k-ok)' : 'transparent',
      }}
    />
  );
}
