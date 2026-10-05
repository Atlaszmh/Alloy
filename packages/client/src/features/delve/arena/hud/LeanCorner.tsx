import type { ReactElement } from 'react';
import type { BiomeDef, DiveState } from '@alloy/engine';
import { useControlsStore } from '@/stores/controlsStore';
import { InputGlyph, Panel } from '../../kit';
import { QuestTracker } from '../../quests/QuestTracker';
import type { QuestView } from '../../quests/types';
import type { HudMap } from '../useArenaCore';
import { Minimap } from './Minimap';
import { noFocus } from './SkillSlot';

/**
 * The lean HUD's top right (the pad-first spec, 3): the depth and biome, the minimap, the first
 * tracked quest's next objective on one line, and small buttons for the mouse: Journal
 * (`data-pad-journal`) and Menu ("Dive menu", `data-pad-menu`), which the fight's View and Menu
 * press. The camera takes no inset for it (`HudGrid`'s `insetRight`).
 */
export function LeanCorner({
  dive,
  biome,
  quests,
  map,
  onMenu,
  onJournal,
}: {
  dive: DiveState;
  biome: BiomeDef;
  quests: QuestView[];
  map: HudMap | null;
  onMenu: () => void;
  onJournal: () => void;
}): ReactElement {
  const config = useControlsStore((s) => s.config);
  const small = 'flex min-h-8 items-center gap-[6px]';
  return (
    <aside aria-label="Floor" className="pointer-events-auto" data-testid="lean-corner">
      <Panel
        as="div"
        material="glass"
        scroll={false}
        title={<span data-testid="depth-label">DEPTH {dive.depth}</span>}
        aside={<span className="text-[14px] text-[var(--k-text-2)]">{biome.name}</span>}
      >
        <Minimap map={map} />
        <QuestTracker quests={quests} compact />
        <div className="flex items-center justify-end gap-4 text-[14px] text-[var(--k-text-2)]">
          <button
            type="button"
            className={small}
            data-pad-journal
            onMouseDown={noFocus}
            onClick={onJournal}
          >
            <InputGlyph
              binding={{ key: config.keys.journal ?? undefined, pad: config.pad.journal ?? undefined }}
              size="sm"
            />
            Journal
          </button>
          <button
            type="button"
            className={small}
            aria-label="Dive menu"
            data-pad-menu
            onMouseDown={noFocus}
            onClick={onMenu}
          >
            <InputGlyph
              binding={{ key: config.keys.menu ?? undefined, pad: config.pad.menu ?? undefined }}
              size="sm"
            />
            Menu
          </button>
        </div>
      </Panel>
    </aside>
  );
}
