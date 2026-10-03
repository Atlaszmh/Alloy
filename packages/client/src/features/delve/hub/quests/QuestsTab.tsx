import { useEffect, useState, type CSSProperties, type ReactElement } from 'react';
import { Bar, Button, Panel, PixelSprite, type Binding } from '@/features/delve/kit';
import { useQuests } from '../../quests/useQuests';
import { Box } from '../../quests/QuestTracker';
import {
  MAX_TRACKED,
  QUEST_KIND,
  objectiveCount,
  type QuestKind,
  type QuestView,
} from '../../quests/types';
import type { HubTabProps } from '../types';

const COLUMNS = '400px minmax(0,1fr) 440px';
const KINDS: QuestKind[] = ['main', 'side', 'contract'];
export const TRACK_BINDING: Binding = { key: 'KeyG', pad: 'y' };
const DASHED: CSSProperties = { border: '3px dashed var(--k-steel-2)' };
const ROW: CSSProperties = { background: 'var(--k-well)', border: '3px solid var(--k-steel-1)' };

/**
 * The Quests tab: the journal by kind, the open quest (giver, story, objectives) and its rewards
 * with "Tracked on the HUD"; with no quests, the empty state in the same three panes.
 */
export function QuestsTab({ setPrompts, link }: HubTabProps): ReactElement {
  const { quests, setTracked } = useQuests();
  const [openId, setOpenId] = useState(link?.tab === 'quests' ? link.questId : undefined);
  const quest = quests.find((q) => q.id === openId) ?? quests[0];
  const trackedCount = quests.filter((q) => q.tracked).length;
  const canTrack = !!quest && (quest.tracked || trackedCount < MAX_TRACKED);

  useEffect(() => {
    if (link?.tab === 'quests' && link.questId) setOpenId(link.questId);
  }, [link]);

  useEffect(() => {
    setPrompts(
      quest
        ? [
            { id: 'select', label: 'Select', binding: { mouse: 'click', pad: 'a' } },
            {
              id: 'track',
              label: quest.tracked ? 'Untrack' : 'Track',
              binding: TRACK_BINDING,
              onPress: () => setTracked(quest.id, !quest.tracked),
              disabled: !canTrack,
            },
          ]
        : [],
    );
  }, [setPrompts, setTracked, quest, canTrack]);
  useEffect(() => () => setPrompts([]), [setPrompts]);

  return (
    <div
      className="box-border grid h-full gap-6 px-8 py-6"
      style={{ gridTemplateColumns: COLUMNS }}
    >
      {quest ? (
        <>
          <Journal quests={quests} open={quest.id} onOpen={setOpenId} tracked={trackedCount} />
          <Detail quest={quest} />
          <Rewards
            quest={quest}
            canTrack={canTrack}
            onToggle={() => setTracked(quest.id, !quest.tracked)}
          />
        </>
      ) : (
        <>
          <Panel title="Journal">
            <div className="flex-1" style={DASHED} />
          </Panel>
          <Panel aria-label="Quest">
            <p
              className="m-0 p-4 text-[16px] text-[var(--k-text-2)]"
              style={DASHED}
              data-testid="quests-empty"
            >
              Quests arrive in a later update. The journal and the HUD tracker are ready for them.
            </p>
          </Panel>
          <Panel title="Rewards">
            <div className="flex-1" style={DASHED} />
          </Panel>
        </>
      )}
    </div>
  );
}

function Journal({
  quests,
  open,
  onOpen,
  tracked,
}: {
  quests: QuestView[];
  open: string;
  onOpen: (id: string) => void;
  tracked: number;
}) {
  return (
    <Panel
      title="Journal"
      testId="quest-journal"
      aside={
        <span className="k-caption" data-testid="quests-tracked">
          {tracked} tracked of {MAX_TRACKED}
        </span>
      }
    >
      {KINDS.map((kind) => {
        const group = quests.filter((q) => q.kind === kind);
        if (group.length === 0) return null;
        return (
          <div key={kind} className="flex flex-col gap-2">
            <h3 className="k-label m-0">{QUEST_KIND[kind].group}</h3>
            {group.map((q) => {
              const on = q.id === open;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => onOpen(q.id)}
                  aria-current={on}
                  data-testid={`quest-${q.id}`}
                  className="flex items-center gap-3 px-[14px] py-3 text-left"
                  style={{
                    background: on ? 'var(--k-wood-0)' : 'var(--k-well)',
                    border: `3px solid ${on ? 'var(--k-hot)' : 'var(--k-steel-1)'}`,
                  }}
                >
                  <span className="k-swatch" style={{ background: QUEST_KIND[kind].swatch }} />
                  <span className="flex min-w-0 flex-col gap-[2px]">
                    <span className="k-disp text-[19px]">{q.name}</span>
                    <span className="k-caption">{q.sub}</span>
                  </span>
                  {q.tracked && (
                    <span className="ml-auto text-[14px] text-[var(--k-ok)]">tracked</span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </Panel>
  );
}

function Detail({ quest }: { quest: QuestView }) {
  const kind = quest.kind === 'contract' ? 'Contract' : `${QUEST_KIND[quest.kind].tag} quest`;
  return (
    <Panel aria-label="Quest" testId="quest-detail">
      <div className="flex items-start gap-[22px]">
        {quest.giver && (
          <span className="k-well flex h-[180px] w-[180px] shrink-0 items-center justify-center">
            <PixelSprite id={quest.giver} scale={4} context="ui" />
          </span>
        )}
        <div className="flex flex-col gap-2">
          <span className="k-label" style={{ color: QUEST_KIND[quest.kind].text }}>
            {[kind, quest.chapter].filter(Boolean).join(' · ')}
          </span>
          <h2 className="k-disp m-0 text-[44px] text-[var(--k-hot-hi)]">{quest.name}</h2>
          {quest.story && (
            <p className="m-0 max-w-[640px] text-[16px] leading-[1.55] text-[var(--k-text-2)]">
              {quest.story}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-[10px]">
        <h3 className="k-label m-0">Objectives</h3>
        {quest.objectives.map((o) => (
          <div
            key={o.id}
            className="grid grid-cols-[18px_1fr_120px] items-center gap-[14px] px-[14px] py-3"
            style={ROW}
          >
            <Box done={o.done} size={14} />
            <span className="flex flex-col gap-[2px]">
              <span className={`text-[17px] ${o.done ? 'text-[var(--k-text-3)]' : ''}`}>
                {o.text}
              </span>
              {o.hint && <span className="k-caption">{o.hint}</span>}
            </span>
            <span className="flex flex-col items-end gap-1">
              <b
                className="k-disp text-[20px]"
                style={{ color: o.done ? 'var(--k-ok)' : 'var(--k-hot-hi)' }}
              >
                {o.done ? 'Done' : objectiveCount(o)}
              </b>
              {!o.done && o.progress && (
                <span className="w-[120px]">
                  <Bar kind="progress" value={o.progress.value} max={o.progress.max} height={6} />
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Rewards({
  quest,
  canTrack,
  onToggle,
}: {
  quest: QuestView;
  canTrack: boolean;
  onToggle: () => void;
}) {
  return (
    <Panel title="Rewards" testId="quest-rewards">
      {quest.rewards.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-[14px] px-[14px] py-3"
          style={{ ...ROW, borderColor: r.color }}
        >
          <span
            className="h-10 w-10 shrink-0"
            style={{ background: r.color, boxShadow: 'inset 0 0 0 4px rgba(24,20,37,.45)' }}
          />
          <span className="flex flex-col gap-[2px]">
            <span className="k-disp text-[19px]">{r.name}</span>
            {r.sub && <span className="k-caption">{r.sub}</span>}
          </span>
        </div>
      ))}
      <div className="mt-auto flex flex-col gap-[10px]">
        <Button
          variant={quest.tracked ? 'primary' : 'secondary'}
          size="lg"
          binding={TRACK_BINDING}
          aria-pressed={quest.tracked}
          disabled={!canTrack}
          title={canTrack ? undefined : `Up to ${MAX_TRACKED} quests show on the HUD`}
          onClick={onToggle}
          testId="quest-track"
        >
          {quest.tracked ? 'Tracked on the HUD' : 'Track on the HUD'}
        </Button>
        <span className="k-caption text-center">
          Up to three quests show under the minimap during a dive.
        </span>
      </div>
    </Panel>
  );
}
