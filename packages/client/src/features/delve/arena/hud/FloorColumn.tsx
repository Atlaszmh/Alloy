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

/**
 * The HUD's right column: the floor panel (depth, biome, minimap, what the floor resists and is
 * weak to, foes left, the bounty), the tracked quests, and "Found this floor".
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
  return (
    <aside className="flex h-full min-h-0 flex-col gap-4" aria-label="Floor, quests and finds">
      <Panel
        as="div"
        material="glass"
        scroll={false}
        className="pointer-events-auto"
        title={<span data-testid="depth-label">DEPTH {dive?.depth}</span>}
        aside={<span className="text-[14px] text-[var(--k-text-2)]">{biome.name}</span>}
      >
        <Minimap map={hud?.map ?? null} />
        <div className="grid grid-cols-2 gap-2 text-[14px]" data-testid="biome-element">
          {(
            [
              ['Resists', biome.mana],
              ['Weak to', weak],
            ] as const
          ).map(([label, mana]) => (
            <span key={label} className="flex items-center gap-2 bg-[var(--k-well)] px-2 py-[6px]">
              <Glyph id={mana} size={16} />
              {label} {manaStyle(registry, mana).name}
            </span>
          ))}
        </div>
        <div className="flex items-baseline justify-between text-[15px] text-[var(--k-text-3)]">
          {hud && (
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
