import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { RARITY_ORDER, isBossDepth, type DiveState } from '@alloy/engine';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Button, Glyph, PixelSprite } from '../kit';
import { getDelveRegistry } from '../registry';
import { formatNumber } from '../format';

/** The 84×96 doorway each choice's art stands in. */
function Doorway({ fill, children }: { fill: string; children: ReactNode }): ReactElement {
  const frame: CSSProperties = {
    background: fill,
    border: '4px solid var(--k-steel-2)',
    borderBottom: 0,
    boxShadow: 'inset 0 0 0 3px var(--k-well), 0 -4px 0 var(--k-steel-1)',
  };
  return (
    <span
      className="flex h-24 w-[84px] flex-none items-end justify-center overflow-hidden"
      style={frame}
    >
      {children}
    </span>
  );
}

function DoorButton({
  art,
  title,
  body,
  aside,
  first,
  onClick,
  testId,
}: {
  art: ReactNode;
  title: ReactNode;
  body: ReactNode;
  aside?: ReactNode;
  first?: boolean;
  onClick: () => void;
  testId: string;
}): ReactElement {
  return (
    <button
      type="button"
      className="k-plate flex flex-none items-center gap-4 p-5 text-left text-[var(--k-text)]"
      onClick={onClick}
      data-door
      data-pad-first={first || undefined}
      data-testid={testId}
    >
      {art}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="k-disp text-[22px]">{title}</span>
        <span className="text-[14px] text-[var(--k-text-3)]">{body}</span>
      </span>
      {aside}
    </button>
  );
}

/**
 * "Choose your path": each door as a plate with its art in a doorway (the next depth's first
 * monster, or the chest for a door that raises Magic Find), its depth and a boss mark; Extract,
 * with the hero leaving; then the hero's life and potions, and a potion to drink. With
 * `padFirst`, the first door is the pad's first focus (not while a power-up is on offer).
 */
export function DoorPane({
  dive,
  padFirst,
  onChoose,
  onExtract,
  onPotion,
}: {
  dive: DiveState;
  padFirst: boolean;
  onChoose: (doorId: string) => void;
  onExtract: () => void;
  onPotion: () => void;
}): ReactElement {
  const registry = getDelveRegistry();
  const finds = RARITY_ORDER.reduce((n, r) => n + dive.found[r], 0);
  return (
    <section aria-label="Doors" className="flex min-h-0 flex-col gap-4">
      <h2 className="k-section m-0 text-[26px]">Choose your path</h2>
      <div className="k-scroll flex min-h-0 flex-col gap-4">
        {dive.doorChoices.map((id, i) => {
          const door = registry.getDoor(id);
          const next = dive.depth + 1 + (door.mods.skip ?? 0);
          const monster = registry.getBiomeForDepth(next).monsters[0];
          const treasure = (door.mods.magicFind ?? 0) > 0;
          return (
            <DoorButton
              key={id}
              first={padFirst && i === 0}
              testId={`door-${id}`}
              art={
                <Doorway fill={treasure ? 'var(--k-wood-0)' : 'var(--k-mana-2)'}>
                  {treasure ? (
                    <span className="pb-[6px]">
                      <Glyph id="chest" size={60} />
                    </span>
                  ) : (
                    <PixelSprite id={monster.id} scale={4} context="ui" label={monster.name} />
                  )}
                </Doorway>
              }
              title={door.name}
              body={door.text}
              aside={
                <span className="flex flex-none flex-col items-end gap-1 text-[14px]">
                  <span className="k-disp text-[18px] text-[var(--k-text-2)]">Depth {next}</span>
                  {isBossDepth(registry, next) && (
                    <span className="flex items-center gap-1 text-[var(--k-bad-text)]">
                      <Glyph id="skull" size={14} /> Boss
                    </span>
                  )}
                </span>
              }
              onClick={() => {
                playSound('phaseTransition');
                vibrate('medium');
                onChoose(id);
              }}
            />
          );
        })}
      </div>
      <DoorButton
        testId="extract-button"
        art={
          <Doorway fill="var(--k-steel)">
            <PixelSprite id="hero" scale={4} context="ui" label="Your hero leaving" />
          </Doorway>
        }
        title="Extract"
        body={`Leave with ${formatNumber(dive.bounty)} scrap and ${finds} finds.`}
        onClick={() => {
          playSound('victory');
          vibrate('success');
          onExtract();
        }}
      />
      <div className="mt-auto flex items-center justify-between gap-3">
        <span className="text-[16px] text-[var(--k-text-2)]">
          Life {Math.round(dive.heroHpFrac * 100)}% · {dive.potions} potion
          {dive.potions === 1 ? '' : 's'}
        </span>
        <Button
          size="sm"
          onClick={onPotion}
          disabled={dive.potions <= 0 || dive.heroHpFrac >= 1}
          testId="door-potion"
        >
          <Glyph id="potion" size={18} /> Drink potion
        </Button>
      </div>
    </section>
  );
}
