import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { rerollContract, type Contract, type ProfileActionResult } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import {
  Bar,
  Button,
  Panel,
  PixelSprite,
  Price,
  type Binding,
  type Prompt,
} from '@/features/delve/kit';
import { getDelveRegistry } from '../../registry';
import { useQuests } from '../../quests/useQuests';
import { Box } from '../../quests/QuestTracker';
import { rewardView } from '../../quests/quest-view';
import { QUEST_KIND, objectiveCount, type QuestView } from '../../quests/types';
import type { HubMode, HubTabProps } from '../types';

const COLUMNS = '400px minmax(0,1fr) 440px';
export const TRACK_BINDING: Binding = { key: 'KeyG', pad: 'y' };
/** Claim: Enter, or A on the focused button (the pad's A is never a prompt's). */
const CLAIM_BINDING: Binding = { key: 'Enter', pad: 'a' };
export const REROLL_BINDING: Binding = { key: 'KeyR', pad: 'x' };
const SELECT_PROMPT: Prompt = {
  id: 'select',
  label: 'Select',
  binding: { mouse: 'click', pad: 'a' },
};
const DASHED: CSSProperties = { border: '3px dashed var(--k-steel-2)' };
const ROW: CSSProperties = { background: 'var(--k-well)', border: '3px solid var(--k-steel-1)' };
/** The giver's sprite: 6 px a sprite pixel in its 180 px well. */
const GIVER_SCALE = 6;
/** Sprite pixels a giver's body sits left of its canvas's centre (Hesta's hammer takes the right), put back. */
const GIVER_NUDGE: Record<string, number> = { hesta: 3 };

/**
 * The Quests tab: the journal (Main, Side, the Contract board, and the claimed ones under a
 * collapsed Done), the open quest (Hesta, her line, the objectives) and its rewards with Claim,
 * Track and a contract's Reroll. Opening a quest marks it seen; the engine prices and refuses.
 */
export function QuestsTab({ mode, setPrompts, link }: HubTabProps): ReactElement {
  const registry = getDelveRegistry();
  const { quests, setTracked } = useQuests();
  const profile = useDelveStore((s) => s.profile);
  const markQuestSeen = useDelveStore((s) => s.markQuestSeen);
  const pad = useInputDeviceStore((s) => s.device === 'gamepad');
  const [openId, setOpenId] = useState(link?.tab === 'quests' ? link.questId : undefined);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const quest = quests.find((q) => q.id === openId) ?? quests[0];
  const { maxTracked, contracts } = registry.getDelveBalance().quests;
  const trackedCount = quests.filter((q) => q.tracked).length;
  const canTrack = !!quest && (quest.tracked || trackedCount < maxTracked);
  const board = profile.quests.board;
  const slot = quest ? board.findIndex((c) => c?.id === quest.id) : -1;
  // The open contract's reroll as the engine's dry run: whether it can go, and why not.
  const reroll = useMemo(
    () => (slot >= 0 ? rerollContract(registry, profile, slot) : null),
    [registry, profile, slot],
  );

  const open = (id: string) => {
    setOpenId(id);
    setMessage(null);
  };
  const onClaim = () => {
    if (!quest) return;
    const res = useDelveStore.getState().claimQuest(quest.id);
    playSound(res.ok ? 'upgradeTier' : 'combineFail');
    if (res.ok) vibrate('success');
    const got = (res.rewards ?? []).map((r, i) => rewardView(registry, r, String(i)).name);
    setMessage(
      res.ok
        ? { good: true, text: `Claimed ${quest.name}: ${got.join(', ')}` }
        : { good: false, text: res.reason ?? '' },
    );
  };
  const onReroll = () => {
    if (slot < 0) return;
    const res = useDelveStore.getState().rerollContract(slot);
    playSound(res.ok ? 'combineMerge' : 'combineFail');
    if (res.ok) setOpenId(res.profile.quests.board[slot]?.id);
    setMessage(res.ok ? null : { good: false, text: res.reason ?? '' });
  };
  // The prompts call the latest handlers.
  const act = useRef({ onClaim, onReroll });
  useLayoutEffect(() => {
    act.current = { onClaim, onReroll };
  });

  useEffect(() => {
    if (link?.tab === 'quests' && link.questId) setOpenId(link.questId);
  }, [link]);

  // Opening a quest marks it seen: NEW no more.
  useEffect(() => {
    if (quest?.isNew) markQuestSeen(quest.id);
  }, [quest?.id, quest?.isNew, markQuestSeen]);

  const hasReroll = !!reroll;
  const rerollOk = !!reroll?.ok;
  useEffect(() => {
    if (!quest) {
      setPrompts([]);
      return;
    }
    const prompts: Prompt[] = [SELECT_PROMPT];
    // On the pad, A presses the focused Claim button.
    if (quest.status === 'complete' && !pad)
      prompts.push({
        id: 'claim',
        label: 'Claim',
        binding: { key: ['Enter', 'NumpadEnter'] },
        onPress: () => act.current.onClaim(),
        disabled: mode === 'pause',
      });
    if (quest.status !== 'claimed')
      prompts.push({
        id: 'track',
        label: quest.tracked ? 'Untrack' : 'Track',
        binding: TRACK_BINDING,
        onPress: () => setTracked(quest.id, !quest.tracked),
        disabled: !canTrack,
      });
    if (hasReroll)
      prompts.push({
        id: 'reroll',
        label: 'Reroll',
        binding: REROLL_BINDING,
        onPress: () => act.current.onReroll(),
        disabled: !rerollOk,
      });
    setPrompts(prompts);
  }, [setPrompts, setTracked, quest, canTrack, pad, mode, hasReroll, rerollOk]);
  useEffect(() => () => setPrompts([]), [setPrompts]);

  return (
    <div
      className="box-border grid h-full gap-6 px-8 py-6"
      style={{ gridTemplateColumns: COLUMNS }}
    >
      {quest ? (
        <>
          <Journal
            quests={quests}
            board={board}
            open={quest.id}
            onOpen={open}
            tracked={trackedCount}
            maxTracked={maxTracked}
          />
          <Detail quest={quest} />
          <Rewards
            quest={quest}
            mode={mode}
            maxTracked={maxTracked}
            canTrack={canTrack}
            onToggle={() => setTracked(quest.id, !quest.tracked)}
            onClaim={onClaim}
            reroll={reroll}
            rerollScrap={contracts.rerollScrap}
            onReroll={onReroll}
            message={message}
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
  board,
  open,
  onOpen,
  tracked,
  maxTracked,
}: {
  quests: QuestView[];
  board: (Contract | null)[];
  open: string;
  onOpen: (id: string) => void;
  tracked: number;
  maxTracked: number;
}) {
  const [showDone, setShowDone] = useState(false);
  const done = quests.filter((q) => q.status === 'claimed');
  // The open quest's group stays open (a quest just claimed moves into Done).
  const doneOpen = showDone || done.some((q) => q.id === open);
  const row = (q: QuestView) => (
    <QuestRow key={q.id} quest={q} on={q.id === open} onOpen={onOpen} />
  );
  return (
    <Panel
      title="Journal"
      testId="quest-journal"
      aside={
        <span className="k-caption" data-testid="quests-tracked">
          {tracked} tracked of {maxTracked}
        </span>
      }
    >
      {(['main', 'side'] as const).map((kind) => {
        const group = quests.filter((q) => q.kind === kind && q.status !== 'claimed');
        return (
          group.length > 0 && (
            <Group key={kind} title={QUEST_KIND[kind].group} testId={`quest-group-${kind}`}>
              {group.map(row)}
            </Group>
          )
        );
      })}
      {board.length > 0 && (
        <Group title={QUEST_KIND.contract.group} testId="quest-group-contract">
          {board.map((c, i) => {
            const q = c && quests.find((x) => x.id === c.id);
            return q ? (
              <div key={q.id} className="flex flex-col" data-testid={`contract-slot-${i}`}>
                {row(q)}
              </div>
            ) : (
              <p
                key={`empty-${i}`}
                className="k-caption m-0 px-[14px] py-3"
                style={DASHED}
                data-testid={`contract-slot-${i}`}
              >
                New contract after your next dive
              </p>
            );
          })}
        </Group>
      )}
      {done.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="quest-group-done">
          <h3 className="k-label m-0">
            <button
              type="button"
              className="k-label min-h-8"
              aria-expanded={doneOpen}
              onClick={() => setShowDone(!doneOpen)}
              data-testid="quest-done-toggle"
            >
              {doneOpen ? '▾' : '▸'} Done · {done.length}
            </button>
          </h3>
          {doneOpen && done.map(row)}
        </div>
      )}
    </Panel>
  );
}

function Group({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <h3 className="k-label m-0">{title}</h3>
      {children}
    </div>
  );
}

/** A journal row: its kind's swatch, its name and line, NEW until opened, DONE while it waits to be claimed. */
function QuestRow({
  quest: q,
  on,
  onOpen,
}: {
  quest: QuestView;
  on: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <button
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
      <span className="k-swatch" style={{ background: QUEST_KIND[q.kind].swatch }} />
      <span className="flex min-w-0 flex-col gap-[2px]">
        <span
          className="k-disp text-[19px]"
          style={q.status === 'claimed' ? { color: 'var(--k-text-3)' } : undefined}
        >
          {q.name}
        </span>
        <span className="k-caption">{q.sub}</span>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {q.isNew && (
          <span className="k-tab-badge" data-testid="quest-new">
            NEW
          </span>
        )}
        {q.status === 'complete' && (
          <span
            className="k-tab-badge"
            style={{ background: 'var(--k-ok)' }}
            data-testid="quest-done"
          >
            DONE
          </span>
        )}
        {q.tracked && <span className="text-[14px] text-[var(--k-ok)]">tracked</span>}
      </span>
    </button>
  );
}

function Detail({ quest }: { quest: QuestView }) {
  const kind = quest.kind === 'contract' ? 'Contract' : `${QUEST_KIND[quest.kind].tag} quest`;
  const status = { active: undefined, complete: 'Complete', claimed: 'Claimed' }[quest.status];
  return (
    <Panel aria-label="Quest" testId="quest-detail">
      <div className="flex items-start gap-[22px]">
        {quest.giver && (
          <span className="k-well flex h-[180px] w-[180px] shrink-0 items-center justify-center">
            <span
              className="relative"
              style={{ left: (GIVER_NUDGE[quest.giver] ?? 0) * GIVER_SCALE }}
              data-testid="quest-giver"
            >
              <PixelSprite id={quest.giver} scale={GIVER_SCALE} context="ui" />
            </span>
          </span>
        )}
        <div className="flex flex-col gap-2">
          <span className="k-label" style={{ color: QUEST_KIND[quest.kind].text }}>
            {[kind, quest.chapter, status].filter(Boolean).join(' · ')}
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
  mode,
  maxTracked,
  canTrack,
  onToggle,
  onClaim,
  reroll,
  rerollScrap,
  onReroll,
  message,
}: {
  quest: QuestView;
  mode: HubMode;
  maxTracked: number;
  canTrack: boolean;
  onToggle: () => void;
  onClaim: () => void;
  /** The open contract's reroll, as the engine's dry run; null for a quest. */
  reroll: ProfileActionResult | null;
  rerollScrap: number;
  onReroll: () => void;
  message: { text: string; good: boolean } | null;
}) {
  const pause = mode === 'pause';
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
        {quest.status === 'complete' && (
          <Button
            variant="go"
            size="lg"
            binding={CLAIM_BINDING}
            disabled={pause}
            onClick={onClaim}
            testId="quest-claim"
          >
            {pause ? 'Claim at the Anvil' : 'Claim'}
          </Button>
        )}
        {message && (
          <p
            role="status"
            className="m-0 text-[16px]"
            style={{ color: message.good ? 'var(--k-ok)' : 'var(--k-bad-text)' }}
            data-testid="quest-message"
          >
            {message.text}
          </p>
        )}
        {quest.status !== 'claimed' && (
          <>
            <Button
              variant={quest.tracked ? 'primary' : 'secondary'}
              size="lg"
              binding={TRACK_BINDING}
              aria-pressed={quest.tracked}
              disabled={!canTrack}
              title={canTrack ? undefined : `Up to ${maxTracked} quests show on the HUD`}
              onClick={onToggle}
              testId="quest-track"
            >
              {quest.tracked ? 'Tracked on the HUD' : 'Track on the HUD'}
            </Button>
            <span className="k-caption text-center">
              Up to {maxTracked} quests show under the minimap during a dive.
            </span>
          </>
        )}
        {reroll && (
          <>
            <Button
              binding={REROLL_BINDING}
              disabled={!reroll.ok}
              onClick={onReroll}
              testId="quest-reroll"
            >
              Reroll · <Price scrap={rerollScrap} />
            </Button>
            {!reroll.ok && (
              <span className="k-caption text-center" data-testid="quest-reroll-why">
                {reroll.reason}
              </span>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
