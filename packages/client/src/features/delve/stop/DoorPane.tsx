import type { CSSProperties, ReactElement, ReactNode } from 'react';
import {
  RARITY_ORDER,
  isBossDepth,
  type DiveState,
  type DoorMods,
  type TutorialState,
  type TutorialStopDef,
  type TutorialTarget,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Glyph, PixelSprite } from '../kit';
import { getDelveRegistry } from '../registry';
import { formatNumber } from '../format';

/*
 * Short screens: under 810 px tall the UI scale sits at its 0.75 floor, so the 1080-high design
 * has less than 1080 px. There the plates tighten and the doorways shrink to 64×72 (art at 3/4),
 * so three doors, Extract and the potion fit across at 1280×720.
 */

/** The 84×96 doorway each choice's art stands in (64×72 on short screens). */
function Doorway({ fill, children }: { fill: string; children: ReactNode }): ReactElement {
  const frame: CSSProperties = {
    background: fill,
    border: '4px solid var(--k-steel-2)',
    borderBottom: 0,
    boxShadow: 'inset 0 0 0 3px var(--k-well), 0 -4px 0 var(--k-steel-1)',
  };
  return (
    <span
      className="flex h-24 w-[84px] flex-none items-end justify-center overflow-hidden [@media(max-height:809px)]:h-[72px] [@media(max-height:809px)]:w-16"
      style={frame}
    >
      <span className="flex origin-bottom [@media(max-height:809px)]:scale-75">{children}</span>
    </span>
  );
}

function DoorButton({
  art,
  title,
  lines,
  first,
  primary,
  tutorial,
  onClick,
  testId,
}: {
  art: ReactNode;
  title: ReactNode;
  lines: ReactNode;
  first?: boolean;
  /** The first door: the responsive harness's reachability probe checks it. */
  primary?: boolean;
  tutorial?: TutorialTarget;
  onClick: () => void;
  testId: string;
}): ReactElement {
  return (
    <button
      type="button"
      className="k-plate flex min-w-0 flex-1 basis-0 flex-col items-center gap-2 p-5 text-center text-[var(--k-text)] [@media(max-height:809px)]:p-3"
      onClick={onClick}
      data-tutorial={tutorial}
      data-door
      data-pad-first={first || undefined}
      data-primary-action={primary ? 'door' : undefined}
      data-testid={testId}
    >
      {art}
      <span className="k-disp text-[24px]">{title}</span>
      {lines}
    </button>
  );
}

/** A door's terms in words, for its two lines: what it costs (red, "Cost: …") and what it gives (green, "Gain: …"). */
export interface DoorTerms {
  cost: string[];
  gain: string[];
}

const pct = (v: number) => `${Math.round(Math.abs(v) * 100)}%`;

/**
 * A door's mods as words (the pad-first spec, 3: each door's cost and gain on separate lines,
 * worded as well as coloured). A harder or longer road is a cost, a richer or kinder one a gain;
 * a loot multiplier under 1 is a cost ("Materials ×0.5"). A door with neither (the Winding Path)
 * shows its own text instead.
 */
export function doorTerms(mods: DoorMods): DoorTerms {
  const cost: string[] = [];
  const gain: string[] = [];
  if (mods.skip) cost.push(`${mods.skip} depths deeper`);
  if (mods.monsterHp)
    (mods.monsterHp > 0 ? cost : gain).push(
      `Foes ${mods.monsterHp > 0 ? '+' : '−'}${pct(mods.monsterHp)} life`,
    );
  if (mods.monsterDmg)
    (mods.monsterDmg > 0 ? cost : gain).push(
      `Foes hit ${pct(mods.monsterDmg)} ${mods.monsterDmg > 0 ? 'harder' : 'softer'}`,
    );
  if (mods.eliteChance)
    cost.push(
      mods.eliteChance >= 1 ? 'An elite leads every pack' : `Elite packs ${pct(mods.eliteChance)}`,
    );
  if (mods.packs && mods.packs !== 1)
    (mods.packs > 1 ? cost : gain).push(
      `${pct(mods.packs - 1)} ${mods.packs > 1 ? 'more' : 'fewer'} foes`,
    );
  if (mods.healFull) gain.push('Heal to full');
  if (mods.potions) gain.push(`+${mods.potions} potion${mods.potions === 1 ? '' : 's'}`);
  if (mods.bountyMult && mods.bountyMult !== 1) gain.push(`Bounty ×${mods.bountyMult}`);
  const times: [number | undefined, string][] = [
    [mods.materials, 'Materials'],
    [mods.runes, 'Runes'],
    [mods.gear, 'Gear'],
    [mods.flux, 'Flux'],
    [mods.essence, 'Essences'],
  ];
  for (const [v, label] of times)
    if (v !== undefined && v !== 1) (v > 1 ? gain : cost).push(`${label} ×${v}`);
  if (mods.find) gain.push(`Find +${mods.find}%`);
  if (mods.shardTier) gain.push(`Tier up ${pct(mods.shardTier)}`);
  return { cost, gain };
}

/**
 * A guided start's stop (see the tutorial spec's gates): the `stop` its step's floor names
 * (`tutorial.json`), or undefined at an ordinary stop.
 */
function tutorialStop(state: TutorialState | null): TutorialStopDef | undefined {
  const steps = getDelveRegistry().getTutorialData().steps;
  const now = state && steps.find((s) => s.id === state.step);
  if (now?.where !== 'stop') return undefined;
  return steps.find((s) => s.where === 'stop' && s.floor === now.floor && s.stop)?.stop;
}

/**
 * Step 2's row (the pad-first spec, 3): each door as a plate with its art in a doorway (the next
 * depth's first monster, or the chest for a door that raises gear or essences), its depth, a boss
 * mark, and its cost and gain on their own lines (`doorTerms`), or its own text when it has
 * neither; Extract, with the hero leaving; and, while life is below full and a potion is left, the
 * potion. The first road is the pad's first focus (Extract, with no doors). A guided stop that
 * doesn't extract hides Extract.
 */
export function DoorPane({
  dive,
  onChoose,
  onExtract,
  onPotion,
}: {
  dive: DiveState;
  onChoose: (doorId: string) => void;
  onExtract: () => void;
  onPotion: () => void;
}): ReactElement {
  const registry = getDelveRegistry();
  const finds = RARITY_ORDER.reduce((n, r) => n + dive.found[r], 0);
  const tutorial = useDelveStore((s) => s.profile.tutorial);
  const extract = tutorialStop(tutorial)?.extract ?? true;
  const doors = dive.doorChoices.length > 0;
  const thirsty = dive.potions > 0 && dive.heroHpFrac < 1;
  return (
    <div className="flex min-h-0 items-stretch gap-5 [@media(max-height:809px)]:gap-3">
      <div
        className="flex min-w-0 flex-[3] items-stretch gap-5 [@media(max-height:809px)]:gap-3"
        data-testid="door-list"
        data-tutorial="stop.doors"
      >
        {dive.doorChoices.map((id, i) => {
          const door = registry.getDoor(id);
          const next = dive.depth + 1 + (door.mods.skip ?? 0);
          const monster = registry.getBiomeForDepth(next).monsters[0];
          const treasure = (door.mods.gear ?? 1) > 1 || (door.mods.essence ?? 1) > 1;
          const { cost, gain } = doorTerms(door.mods);
          return (
            <DoorButton
              key={id}
              first={i === 0}
              primary={i === 0}
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
              lines={
                <>
                  <span className="flex items-center gap-2 text-[18px] text-[var(--k-text-2)]">
                    Depth {next}
                    {isBossDepth(registry, next) && (
                      <span className="flex items-center gap-1 text-[var(--k-bad-text)]">
                        <Glyph id="skull" size={14} /> Boss
                      </span>
                    )}
                  </span>
                  {cost.length > 0 && (
                    <span
                      className="text-[18px] leading-tight text-[var(--k-bad-text)]"
                      data-door-cost
                    >
                      Cost: {cost.join(' · ')}
                    </span>
                  )}
                  {gain.length > 0 && (
                    <span className="text-[18px] leading-tight text-[var(--k-ok)]" data-door-gain>
                      Gain: {gain.join(' · ')}
                    </span>
                  )}
                  {cost.length + gain.length === 0 && (
                    <span className="text-[18px] leading-tight text-[var(--k-text-3)]">
                      {door.text}
                    </span>
                  )}
                </>
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
      {extract && (
        <DoorButton
          testId="extract-button"
          tutorial="stop.extract"
          first={!doors}
          art={
            <Doorway fill="var(--k-steel)">
              <PixelSprite id="hero" scale={4} context="ui" label="Your hero leaving" />
            </Doorway>
          }
          title="Extract"
          lines={
            <span className="text-[18px] leading-tight text-[var(--k-ok)]">
              Leave with {formatNumber(dive.bounty)} scrap and {finds} finds.
            </span>
          }
          onClick={() => {
            playSound('victory');
            vibrate('success');
            onExtract();
          }}
        />
      )}
      {thirsty && (
        <button
          type="button"
          className="k-plate flex w-[220px] flex-none flex-col items-center justify-center gap-2 p-5 text-center text-[var(--k-text)] [@media(max-height:809px)]:p-3"
          onClick={onPotion}
          data-testid="door-potion"
        >
          <Glyph id="potion" size={40} />
          <span className="k-disp text-[22px]">Drink a potion</span>
          <span className="text-[18px] text-[var(--k-text-2)]">
            Life {Math.round(dive.heroHpFrac * 100)}% · {dive.potions} potion
            {dive.potions === 1 ? '' : 's'}
          </span>
        </button>
      )}
    </div>
  );
}
