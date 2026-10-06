import type { ReactElement } from 'react';
import type { BiomeDef, DiveState } from '@alloy/engine';
import { Glyph, Panel } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { formatNumber, manaStyle } from '../../format';
import { QuestTracker } from '../../quests/QuestTracker';
import type { QuestView } from '../../quests/types';
import type { ArenaHud } from '../useArenaCore';
import { FoundLog } from './FoundLog';
import { Minimap } from './Minimap';

export interface FloorColumnProps {
  dive: DiveState | null;
  biome: BiomeDef;
  hud: ArenaHud | null;
  quests: QuestView[];
  onInspect: (uid: string) => void;
  onJournal: () => void;
}

/** The well (`--k-well`) under `share` of `color`: an element's tile, its own colour reading at 4.5:1 or more at 18%. */
function tint(color: string, share = 0.18): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) =>
      Math.round(ch(color, i) * share + ch('#181425', i) * (1 - share))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/**
 * The HUD's right column: the floor panel (depth, biome, minimap, what the floor resists and is
 * weak to, a generated floor's rooms explored or the open room's foes left, the bounty), the
 * tracked quests, and "Found this floor".
 */
export function FloorColumn({
  dive,
  biome,
  hud,
  quests,
  onInspect,
  onJournal,
}: FloorColumnProps): ReactElement {
  const registry = getDelveRegistry();
  const weak = registry.getArpgData().weakness[biome.mana];
  const { resistFromDepth } = registry.getDelveBalance().monster;
  return (
    <aside className="flex h-full min-h-0 flex-col gap-4" aria-label="Floor, quests and finds">
      <Panel
        as="div"
        material="glass"
        scroll={false}
        className="pointer-events-auto"
        title={<span data-testid="depth-label">DEPTH {dive?.depth}</span>}
        aside={<span className="text-[16px] text-[var(--k-text-2)]">{biome.name}</span>}
      >
        <Minimap map={hud?.map ?? null} />
        <div className="grid grid-cols-2 gap-2 text-[16px]" data-testid="biome-element">
          {(
            [
              // The first biome's foes don't resist (the engine's `resistFromDepth`).
              ...((dive?.depth ?? 1) >= resistFromDepth ? [['Resists', biome.mana] as const] : []),
              ['Weak to', weak] as const,
            ] as const
          ).map(([label, mana]) => {
            const { color, name } = manaStyle(registry, mana);
            return (
              <span
                key={label}
                className="flex items-center gap-2 px-2 py-[6px]"
                style={{ color, backgroundColor: tint(color) }}
              >
                <Glyph id={mana} size={16} color={color} />
                {label} {name}
              </span>
            );
          })}
        </div>
        {hud?.map.floor && (
          <span className="text-[16px] text-[var(--k-text-3)]" data-testid="rooms-explored">
            Rooms explored{' '}
            <b className="k-disp text-[20px] text-[var(--k-text)]">
              {hud.map.floor.explored} / {hud.map.floor.total}
            </b>
          </span>
        )}
        <div className="flex items-baseline justify-between text-[16px] text-[var(--k-text-3)]">
          {hud && !hud.map.floor && (
            <span data-testid="monsters-left">
              <b className="k-disp text-[20px] text-[var(--k-text)]">{hud.monstersLeft}</b> foes
              left
            </span>
          )}
          <span className="ml-auto">
            <b className="k-disp text-[20px] text-[var(--k-hot-hi)]">
              {formatNumber(dive?.bounty ?? 0)}
            </b>{' '}
            bounty
          </span>
        </div>
      </Panel>
      <QuestTracker quests={quests} onJournal={onJournal} />
      <FoundLog onInspect={onInspect} />
    </aside>
  );
}
