import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import {
  baseDisplayName,
  isBossDepth,
  type DataRegistry,
  type DiveState,
  type Haul,
  type TutorialEvent,
} from '@alloy/engine';
import { useControlsStore } from '@/stores/controlsStore';
import { useDelveStore } from '@/stores/delveStore';
import { Button, Dialog, Footer, Glyph, Screen, usePrompts, type Prompt } from '../kit';
import { getDelveRegistry } from '../registry';
import { ItemIcon } from '../ItemIcon';
import { deltaMark } from '../ItemTile';
import { ItemTooltip } from '../items/ItemTooltip';
import { RARITY_COLOR, RARITY_LABEL, RARITY_TEXT, formatNumber } from '../format';
import { FAMILY_STYLE, runeName } from '../runes/rune-style';
import { MARK, countUpgrades, useFloorFinds } from '../arena/hud/FoundLog';
import { haulRows, materialCount, type HaulRow } from '../materials/material-style';
import { StopPanel } from '../StopPanel';
import { TutorialPanel } from '../tutorial/TutorialPanel';
import { SHOWN_AT } from '../tutorial/tutorial-view';
import { DoorPane } from './DoorPane';

/** A stop step's "Skip this step" (a stop has no beats): to the save. */
const sendTutorial = (event: TutorialEvent): void =>
  useDelveStore.getState().tutorialEvents([event]);

/** How long after it mounts the stop ignores presses: one carried from the fight never skips or takes a door. */
export const ARM_MS = 450;

const ROW = 'flex w-full flex-none items-center gap-3 bg-[var(--k-well)] px-3 py-[10px] text-left';

const CAPTION: Record<HaulRow['group'], string> = {
  material: 'Material',
  essence: 'Forges a legendary',
  rune: 'Rune',
  currency: 'Currency',
};

/** A material, an essence or a currency of the floor's haul: its swatch, "Iron bar ×3" and what it is. */
function HaulStopRow({ row }: { row: HaulRow }): ReactElement {
  return (
    <div className={ROW} data-testid={`loot-${row.group}`}>
      <span
        className="flex size-9 flex-none items-center justify-center border-2"
        style={{ borderColor: row.color }}
      >
        <span aria-hidden className="size-4" style={{ background: row.color }} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span style={row.group === 'essence' ? { color: RARITY_TEXT.legendary } : undefined}>
          {row.name}
          {row.count > 1 && ` ×${formatNumber(row.count)}`}
        </span>
        <span className="k-caption">{CAPTION[row.group]}</span>
      </span>
    </div>
  );
}

type FloorFinds = ReturnType<typeof useFloorFinds>;

/**
 * The finds sheet's list: this floor's materials and currencies grouped, its items newest first
 * with their marks (each opens the pause on it), its essences, then its runes grouped.
 */
function FindsList({
  registry,
  materials,
  essences,
  items,
  runes,
  onInspect,
}: {
  registry: DataRegistry;
  materials: HaulRow[];
  essences: HaulRow[];
  items: FloorFinds['items'];
  runes: FloorFinds['runes'];
  onInspect: (uid: string) => void;
}): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      {items.length + runes.length + materials.length + essences.length === 0 && (
        <span className="k-caption">Nothing found on this floor.</span>
      )}
      {materials.length > 0 && (
        <div className="flex flex-col gap-4" data-testid="loot-materials">
          {materials.map((r) => (
            <HaulStopRow key={r.key} row={r} />
          ))}
        </div>
      )}
      {items.map(({ item, delta, asIs }) => {
        const mark = deltaMark(delta, asIs);
        return (
          <ItemTooltip key={item.uid} uid={item.uid} placement="right">
            <button
              type="button"
              className={ROW}
              aria-label={mark ? `${item.name}, ${MARK[mark].label}` : item.name}
              onClick={() => onInspect(item.uid)}
              data-uid={item.uid}
              data-testid="loot-item"
            >
              <span
                className="size-9 flex-none border-2 p-[2px]"
                style={{ borderColor: RARITY_COLOR[item.rarity] }}
              >
                <ItemIcon baseId={item.baseId} rarity={item.rarity} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate" style={{ color: RARITY_TEXT[item.rarity] }}>
                  {item.name}
                </span>
                <span className="k-caption">
                  {RARITY_LABEL[item.rarity]} {baseDisplayName(registry, item)}
                </span>
              </span>
              {mark && (
                <span className="ml-auto" style={{ color: MARK[mark].color }}>
                  {MARK[mark].text}
                </span>
              )}
            </button>
          </ItemTooltip>
        );
      })}
      {essences.map((r) => (
        <HaulStopRow key={r.key} row={r} />
      ))}
      {runes.length > 0 && (
        <div className="flex flex-col gap-4" data-testid="loot-runes">
          {runes.map(({ rune, count }) => {
            const color = FAMILY_STYLE[registry.getRune(rune.id).family].color;
            return (
              <div key={`${rune.id}-${rune.tier}`} className={ROW} data-testid="loot-rune">
                <span
                  className="flex size-9 flex-none items-center justify-center border-2"
                  style={{ borderColor: color }}
                >
                  <Glyph id="rune" size={20} color={color} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span>
                    {runeName(registry, rune)}
                    {count > 1 && ` ×${count}`}
                  </span>
                  <span className="k-caption">Rune, to your pouch</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The finds line's words (the pad-first spec, 3): the bounty, then what else the floor found,
 * leaving out what it found none of: "26 scrap bounty · 18 materials · 1 rune · ▲ 1 upgrade waiting".
 */
export function findsSummary(n: {
  bounty: number;
  materials: number;
  items: number;
  runes: number;
  upgrades: number;
}): string {
  const some = (k: number, one: string) => `${formatNumber(k)} ${one}${k === 1 ? '' : 's'}`;
  return [
    `${formatNumber(n.bounty)} scrap bounty`,
    n.materials > 0 && some(n.materials, 'material'),
    n.items > 0 && some(n.items, 'item'),
    n.runes > 0 && some(n.runes, 'rune'),
    n.upgrades > 0 && `▲ ${some(n.upgrades, 'upgrade')} waiting`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export interface StopScreenProps {
  dive: DiveState;
  /** The floor's haul as the clear banked it; null after a reload (then its items and runes show). */
  haul: Haul | null;
  onChoose: (doorId: string) => void;
  onExtract: () => void;
  onPotion: () => void;
  /** The footer's Menu (Esc, the pad's Menu): the pause, over the stop. */
  onMenu: () => void;
  /** A find picked in the finds sheet: the pause's Loadout, on that item. */
  onInspect: (uid: string) => void;
}

/**
 * The stop between depths, over the dimmed arena, in two steps (the pad-first spec, 3). The
 * header, on both: "Depth N cleared", the risk line (the dive's banked haul and the share a death
 * loses), Hesta's strip on a guided stop, and the finds line, which A or a click opens as a sheet
 * of this floor's finds (an item in it opens the pause on that item). Step 1, while a power-up is
 * on offer: the cards (`StopPanel`, each expanding in place to its picker); A takes, X (or S)
 * skips, but not a guided stop's required one, which holds the step. Step 2: the roads
 * (`DoorPane`); B (or Backspace) goes back to the cards while nothing was taken. Each move between
 * the steps puts the focus on the new step's first control. There is no back at the top level:
 * Esc (or the menu key) and the pad's Menu are its Menu prompt, which opens the pause over it; it
 * is no `[data-pad-menu]`, so Enter with nothing focused never opens the pause. Y does nothing here.
 */
export const StopScreen = memo(function StopScreen({
  dive,
  haul,
  onChoose,
  onExtract,
  onPotion,
  onMenu,
  onInspect,
}: StopScreenProps): ReactElement {
  const registry = getDelveRegistry();
  const biome = registry.getBiomeForDepth(dive.depth);
  const { items, runes } = useFloorFinds();
  const found = haul ? haulRows(registry, haul) : [];
  const materials = found.filter((r) => r.group === 'material' || r.group === 'currency');
  const essences = found.filter((r) => r.group === 'essence');
  const deathLoss = Math.round(registry.getDelveBalance().crafting.deathLoss * 100);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), ARM_MS);
    return () => clearTimeout(t);
  }, []);
  const mainRef = useRef<HTMLDivElement>(null);
  const stop = dive.stop;
  const offering = !!stop && !stop.taken;
  // A guided stop's required power-up holds step 1 (the engine refuses a door until it's taken).
  const required = !!stop?.required && !stop.taken;
  /** X's move to the road; B undoes it while nothing was taken. */
  const [skipped, setSkipped] = useState(false);
  const step: 'powerup' | 'road' = offering && !skipped ? 'powerup' : 'road';
  const [findsOpen, setFindsOpen] = useState(false);
  const runeCount = runes.reduce((n, r) => n + r.count, 0);
  const menuKey = useControlsStore((s) => s.config.keys.menu);
  const tutorial = useDelveStore((s) => s.profile.tutorial);

  // A move between the steps (a skip, a take, a back) puts the focus on the new step's first
  // control: the first card, or the first road. The first step's own first focus is the screen's.
  const shown = useRef(step);
  useLayoutEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    mainRef.current?.querySelector<HTMLElement>('[data-pad-first]')?.focus();
  }, [step]);

  const prompts: Prompt[] =
    step === 'powerup'
      ? [
          { id: 'take', label: 'Take', binding: { mouse: 'click', pad: 'a' } },
          {
            id: 'skip',
            label: 'Skip power-up',
            binding: { key: 'KeyS', pad: 'x' },
            onPress: () => setSkipped(true),
            disabled: !armed || required,
            asButton: true,
          },
        ]
      : [
          { id: 'choose', label: 'Choose', binding: { mouse: 'click', pad: 'a' } },
          ...(offering && skipped
            ? [
                {
                  id: 'back',
                  label: 'Power-ups',
                  binding: { key: 'Backspace', pad: 'b' },
                  onPress: () => setSkipped(false),
                  disabled: !armed,
                  asButton: true,
                } satisfies Prompt,
              ]
            : []),
        ];
  // Drawn as the footer's Menu button, not in the prompt bar.
  const menu: Prompt = {
    id: 'menu',
    label: 'Menu',
    binding: { key: menuKey && menuKey !== 'Escape' ? ['Escape', menuKey] : 'Escape', pad: 'menu' },
    onPress: onMenu,
    disabled: !armed,
  };
  usePrompts([...prompts, menu], mainRef);

  const note = stop?.taken ? (
    <span data-testid="stop-taken">Power-up taken.</span>
  ) : skipped ? (
    <span data-testid="stop-skipped">Power-up skipped.</span>
  ) : !stop ? (
    <span data-testid="stop-none">No power-up at this stop.</span>
  ) : null;

  return (
    <Screen
      backdrop="arena-stop"
      headerStyle="bare"
      testId="door-choice"
      header={null}
      footer={
        <Footer prompts={prompts}>
          <Button
            variant="quiet"
            size="sm"
            binding={{ key: 'Escape', pad: 'menu' }}
            onClick={onMenu}
            tabIndex={-1}
            data-pad-skip
          >
            Menu
          </Button>
        </Footer>
      }
    >
      <div ref={mainRef} className="box-border flex h-full flex-col gap-8 px-[72px]" inert={!armed}>
        <div className="flex items-end justify-between gap-6">
          <div className="flex flex-none flex-col gap-[6px]">
            <span className="k-label" style={{ color: 'var(--k-mana)' }}>
              {biome.name}
            </span>
            <h1 className="k-display m-0">Depth {dive.depth} cleared</h1>
            {isBossDepth(registry, dive.depth) && (
              <span className="k-section text-[var(--k-hot-hi)]" data-testid="boss-slain">
                Boss slain · checkpoint at depth {dive.depth + 1}
              </span>
            )}
            <span
              className="text-[16px] text-[var(--k-text-3)]"
              data-testid="risk-line"
              data-tutorial="stop.risk"
            >
              Banked this dive · dying loses {deathLoss}% of it
            </span>
          </div>
          {/* Hesta's strip: a stop's steps only (it gives way when the row is short). */}
          {tutorial && (
            <TutorialPanel
              state={tutorial}
              where={SHOWN_AT.stop}
              place="stop"
              onEvent={sendTutorial}
            />
          )}
          <button
            type="button"
            className="k-well flex flex-none items-center gap-3 px-4 py-3 text-[18px] text-[var(--k-text-2)]"
            aria-haspopup="dialog"
            onClick={() => setFindsOpen(true)}
            data-testid="stop-finds"
          >
            {findsSummary({
              bounty: dive.bounty,
              materials: haul ? materialCount(haul) : 0,
              items: items.length,
              runes: runeCount,
              upgrades: countUpgrades(items),
            })}
          </button>
        </div>
        {step === 'powerup' ? (
          <div
            className="flex min-h-0 flex-1 flex-col gap-4"
            data-tutorial="stop.powerup"
            data-testid="stop-powerup"
          >
            {required && (
              <span className="text-[16px] text-[var(--k-hot)]" data-testid="roads-held">
                Take the power-up to go on
              </span>
            )}
            <StopPanel stop={stop!} />
          </div>
        ) : (
          <section
            aria-label="Choose your road"
            className="flex min-h-0 flex-1 flex-col gap-4"
            data-testid="stop-road"
          >
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="k-section m-0 text-[26px]">
                {dive.doorChoices.length > 0 ? 'Choose your road' : 'The way home'}
              </h2>
              {note && <span className="text-[16px] text-[var(--k-text-3)]">{note}</span>}
            </div>
            <DoorPane dive={dive} onChoose={onChoose} onExtract={onExtract} onPotion={onPotion} />
          </section>
        )}
      </div>
      {findsOpen && (
        <Dialog
          title="Found this floor"
          onClose={() => setFindsOpen(false)}
          width={640}
          testId="floor-finds"
        >
          <FindsList
            registry={registry}
            materials={materials}
            essences={essences}
            items={items}
            runes={runes}
            onInspect={(uid) => {
              // The sheet goes first: the pause opens over the stop, never under a dialog.
              setFindsOpen(false);
              onInspect(uid);
            }}
          />
        </Dialog>
      )}
    </Screen>
  );
});
