import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CHAIN_SKILLS,
  FLUX_GRADES,
  MANA_TYPES,
  METAL_IDS,
  forgePowerRange,
  inPair,
  pairElements,
  previewForge,
  type FluxGrade,
  type ForgePowerRange,
  type ForgeRequest,
  type GearItem,
  type GearSlot,
  type MaterialRef,
  type MetalId,
  type ShardRef,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Button, Panel, Price, Stepper, type Prompt } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { ItemIcon } from '../../ItemIcon';
import { LegendaryFanfare } from '../../LegendaryFanfare';
import {
  RARITY_LABEL,
  RARITY_TEXT,
  SLOT_LABEL,
  UPGRADE_EPSILON,
  formatDelta,
  manaStyle,
} from '../../format';
import { classText, slotsText, type SlotPair } from '../../items/weapon-frame';
import { PatternList } from './PatternList';
import { ShardPicker, heldShards } from './ShardPicker';
import { useOnboarding } from '../../onboarding';
import {
  DROPS_FROM,
  materialLabel,
  pct,
  shardName,
  statRange,
  valueRange,
} from './materials-text';

export const SELECT_PROMPT: Prompt = {
  id: 'select',
  label: 'Select',
  binding: { mouse: 'click', pad: 'a' },
};
const BACK = { key: 'Escape', pad: 'b' } as const;

/** The forge's note while a dive is under way (both benches). */
export function ForgeLocked() {
  return (
    <p className="k-body-2" data-testid="forge-locked">
      A dive is under way: forge and salvage between dives.
    </p>
  );
}

/** The forge's Power against what is worn (the engine's `forgePowerRange`): "+3% to +8% Power against your chest". */
function PowerRange({ range, slot }: { range: ForgePowerRange; slot: GearSlot }) {
  const { low, high, random } = range;
  const span =
    formatDelta(low) === formatDelta(high)
      ? formatDelta(high)
      : `${formatDelta(low)} to ${formatDelta(high)}`;
  return (
    <p
      className="k-disp text-[22px]"
      style={{ color: low > UPGRADE_EPSILON ? 'var(--k-ok)' : 'var(--k-text)' }}
      data-testid="forge-power"
    >
      {span} Power against your {SLOT_LABEL[slot].toLowerCase()}
      {slot === 'weapon' && ', as a home for your moveset'}
      {random > 0 && (
        <span className="k-caption block">
          before {random} random line{random === 1 ? '' : 's'}
        </span>
      )}
    </p>
  );
}

/**
 * The Forge bench, in three columns: the patterns; the rows (Flux, Metal and Element steppers
 * over what the save holds, each with where what it lacks drops; with epic flux, Essence; a row
 * a line, opening the shard picker; Forge, Enter or A); and the preview (no stops): the engine's
 * `previewForge` (the lines' bands, the attunement floor, the implicits, a weapon's class, its slots against the ceiling
 * and sockets, what it uses) and its Power against what is worn as a range (`forgePowerRange`).
 * The chosen pattern is the tab's (`baseId`, `onBase`). A legendary plays the fanfare.
 */
export function ForgeBench({
  locked,
  setPrompts,
  baseId,
  onBase,
}: {
  locked: boolean;
  setPrompts: (prompts: Prompt[]) => void;
  baseId: string | null;
  onBase: (baseId: string | null) => void;
}) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const pad = useInputDeviceStore((s) => s.device === 'gamepad');
  const { metals, flux: fluxHeld, essences } = profile.materials;
  // The picks follow the stock: a bar or a flux grade picked while held, else the
  // first held (a flux none); an essence while held, else none (forged away).
  const [metalPick, setMetal] = useState<MetalId>(METAL_IDS[0]);
  const metal =
    metals[metalPick] > 0 ? metalPick : (METAL_IDS.find((m) => metals[m] > 0) ?? metalPick);
  const [fluxPick, setFlux] = useState<FluxGrade | null>(null);
  const flux =
    fluxPick === null || fluxHeld[fluxPick] > 0
      ? fluxPick
      : (FLUX_GRADES.find((g) => fluxHeld[g] > 0) ?? null);
  const [essencePick, setEssence] = useState<string | null>(null);
  const essence = essencePick && essences[essencePick] ? essencePick : null;
  const [element, setElement] = useState(profile.pair.primary ?? MANA_TYPES[0]);
  const [shards, setShards] = useState<ShardRef[]>([]);
  const [picking, setPicking] = useState<number | null>(null);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const [fanfare, setFanfare] = useState<{ item: GearItem; firstTime: boolean } | null>(null);
  const endFanfare = useCallback(() => setFanfare(null), []);
  const id = useId();
  // A first visit's line rides the forge prompt (under the pad, Select: A on Forge forges).
  const { hint, done } = useOnboarding('forge', !locked);
  // What the save holds none of folds to one line (a guided save, which Hesta leads through the
  // Flux row and a line's shard, folds nothing).
  const guided = useDelveStore((s) => s.profile.tutorial !== null);
  const anyFlux = guided || FLUX_GRADES.some((g) => fluxHeld[g] > 0);
  const anyShard =
    guided || Object.values(profile.materials.shards).some((ns) => ns?.some((n) => n > 0));

  const request = (f: FluxGrade | null, e: string | null, s: ShardRef[]): ForgeRequest => ({
    baseId: baseId!,
    metal,
    element,
    shards: s,
    ...(f && { flux: f }),
    ...(f === 'epic' && e && { essence: e }),
  });
  const req = baseId ? request(flux, essence, shards) : null;
  const preview = req && previewForge(registry, profile, req);

  // A pattern picked puts the focus on the Flux row (folded, the first row). A shard picked puts it on Forge, so Enter
  // or A forges next; refused, on its line (the reason under Forge). A step never moves it.
  const rowsRef = useRef<HTMLDivElement>(null);
  const focusTo = useRef<'rows' | number | null>(null);
  useEffect(() => {
    const to = focusTo.current;
    if (to === null) return;
    focusTo.current = null;
    const el =
      to === 'rows'
        ? rowsRef.current?.querySelector<HTMLElement>('[data-testid="forge-flux"], [role="spinbutton"]')
        : preview && !preview.refused
          ? document.getElementById(`${id}-forge`)
          : rowsRef.current?.querySelector<HTMLElement>(`[data-testid="shard-slot-${to}"]`);
    el?.focus({ preventScroll: true });
  });

  const say = (text: string, good: boolean) => setMessage({ text, good });
  // A rarity's line count doesn't depend on the shards: a lower one keeps the first that fit.
  const pickIngot = (f: FluxGrade | null, e: string | null) => {
    const lines = previewForge(registry, profile, request(f, e, [])).lines.length;
    setFlux(f);
    setEssence(e);
    setShards((s) => s.slice(0, lines));
  };
  // Line i takes `shard`, or (null) rolls at random: the shards come first, in order.
  const setLine = (i: number, shard: ShardRef | null) => {
    focusTo.current = shard ? Math.min(i, shards.length) : i;
    setShards((s) =>
      shard
        ? i < s.length
          ? s.map((x, j) => (j === i ? shard : x))
          : [...s, shard]
        : s.filter((_, j) => j !== i),
    );
    setPicking(null);
  };

  const onForge = () => {
    if (!req || !preview) return say('Pick a pattern first', false);
    if (preview.refused) {
      playSound('combineFail');
      return say(preview.refused.reason, false);
    }
    const res = useDelveStore.getState().forge(req);
    if (!res.ok || !res.item) {
      playSound('combineFail');
      return say(res.reason ?? 'Cannot forge', false);
    }
    const item = res.item;
    done();
    setShards([]);
    if (item.legendary) {
      playSound('lootLegendary');
      vibrate('heavy');
      setFanfare({ item, firstTime: res.profile.codex[item.legendary.id]?.count === 1 });
    } else {
      playSound('combineMerge');
      vibrate('success');
    }
    say(`Forged ${item.name}: it waits in your bag`, true);
  };
  // Enter forges (A presses the focused Forge button: the pad's A is never a prompt's).
  const forgeNow = useRef(onForge);
  useLayoutEffect(() => {
    forgeNow.current = onForge;
  });
  useEffect(() => {
    if (locked) return; // the Forge tab shows Select alone
    setPrompts(
      pad
        ? [{ ...SELECT_PROMPT, hint }]
        : [
            SELECT_PROMPT,
            {
              id: 'forge',
              label: 'Forge',
              binding: { key: ['Enter', 'NumpadEnter'] },
              onPress: () => forgeNow.current(),
              hint,
            },
          ],
    );
  }, [pad, locked, setPrompts, hint]);

  // The bench's last word: beside the Forge button (where a forge leaves the eye), else on top.
  const status = message && !locked && (
    <p
      role="status"
      className="text-[18px]"
      style={{ color: message.good ? 'var(--k-ok)' : 'var(--k-bad-text)' }}
    >
      {message.text}
    </p>
  );
  const offPairDust = registry.getDelveBalance().crafting.offPairDust;
  const legend = preview?.legendary ? registry.getLegendary(preview.legendary.id) : null;
  const uses: MaterialRef[] = req
    ? [
        { kind: 'metal', metal },
        ...(req.flux ? [{ kind: 'flux' as const, grade: req.flux }] : []),
        ...(req.essence ? [{ kind: 'essence' as const, essence: req.essence }] : []),
        ...shards.map((s) => ({ kind: 'shard' as const, ...s })),
      ]
    : [];
  // The guided start's trail: the Lines are done once one holds a shard, or at once when no
  // shard held fits the item, or it rolls no lines (the forge needs none), so the marker goes on
  // to Forge.
  const linesDone =
    shards.length > 0 ||
    (!!preview && preview.lines.length === 0) ||
    (!!preview && heldShards(registry, profile.materials.shards, preview.slot, []).length === 0);

  const heldMetals = METAL_IDS.filter((m) => metals[m] > 0);
  const elements = [
    ...pairElements(profile.pair),
    ...MANA_TYPES.filter((m) => !inPair(profile, m)),
  ];
  const heldEssences = Object.entries(essences).filter(([, n]) => n > 0);
  const range = req && forgePowerRange(registry, profile, req);

  return (
    <>
      <PatternList
        known={profile.patterns}
        selected={baseId}
        essence={flux === 'epic' ? essence : null}
        onSelect={(b) => {
          playSound('orbSelect');
          focusTo.current = 'rows';
          onBase(b);
          setShards([]);
          setPicking(null);
          setMessage(null);
        }}
      />
      <Panel aria-label="Forge" testId="forge-bench">
        {(!preview || picking !== null) && status}
        {locked ? (
          <ForgeLocked />
        ) : !preview ? (
          <p className="k-body-2" data-testid="forge-empty">
            Pick a pattern to forge.
          </p>
        ) : picking !== null ? (
          <div className="flex flex-col gap-3" data-pad-scope data-testid="shard-pick">
            <div className="flex items-center justify-between">
              <span className="k-label">Line {picking + 1}: pick a shard</span>
              <Button
                variant="quiet"
                size="sm"
                binding={BACK}
                data-pad-back
                onClick={() => setPicking(null)}
                testId="shard-back"
              >
                Back
              </Button>
            </div>
            <Button
              size="sm"
              data-pad-first
              onClick={() => setLine(picking, null)}
              testId="shard-random"
            >
              Random line
            </Button>
            <ShardPicker
              slot={preview.slot}
              exclude={shards.filter((_, j) => j !== picking).map((s) => s.stat)}
              selected={shards[picking] ?? null}
              onPick={(s) => setLine(picking, s)}
            />
          </div>
        ) : (
          <div ref={rowsRef} className="flex flex-col gap-4">
            {anyFlux ? (
              <Stepper
                label="Flux"
                testId="forge-flux"
                tutorial="forge.flux"
                done={flux !== null}
                value={flux ?? 'none'}
                onChange={(f) => pickIngot(f === 'none' ? null : f, essence)}
                options={[
                  { id: 'none' as const, label: 'None · common', text: 'None' },
                  ...FLUX_GRADES.filter((g) => fluxHeld[g] > 0).map((g) => {
                    const text = `${RARITY_LABEL[g]} ×${fluxHeld[g]}`;
                    return { id: g, label: text, text };
                  }),
                ]}
                note={FLUX_GRADES.some((g) => fluxHeld[g] === 0) ? DROPS_FROM.flux : undefined}
              />
            ) : (
              <p className="k-note" data-testid="forge-flux-none">
                Flux: none held. {DROPS_FROM.flux}
              </p>
            )}
            {heldMetals.length > 0 ? (
              <Stepper
                label="Metal"
                testId="forge-metal"
                tutorial="forge.bar"
                done={metals[metal] > 0}
                value={metal}
                onChange={setMetal}
                options={heldMetals.map((m) => {
                  const text = `${materialLabel(registry, { kind: 'metal', metal: m })} ×${metals[m]}`;
                  return { id: m, label: text, text };
                })}
                note={heldMetals.length < METAL_IDS.length ? DROPS_FROM.metal : undefined}
              />
            ) : (
              <p className="k-note" data-tutorial="forge.bar" data-tutorial-done="false">
                Metal: none held. {DROPS_FROM.metal}
              </p>
            )}
            <Stepper
              label="Element"
              testId="forge-element"
              value={element}
              onChange={setElement}
              options={elements.map((m) => {
                const name = manaStyle(registry, m).name;
                return inPair(profile, m)
                  ? { id: m, label: name, text: name }
                  : {
                      id: m,
                      // One wrapping run, so a narrow cell breaks it between the name and the price.
                      label: (
                        <span>
                          {name} · <Price dust={offPairDust} />
                        </span>
                      ),
                      text: `${name} · ${offPairDust} Mana Dust`,
                    };
              })}
            />
            {flux === 'epic' && (
              <Stepper
                label="Essence"
                testId="forge-essence"
                value={essence ?? 'none'}
                onChange={(e) => pickIngot('epic', e === 'none' ? null : e)}
                options={[
                  { id: 'none', label: 'None · epic', text: 'None' },
                  ...heldEssences.map(([e, n]) => {
                    const text = `${registry.getLegendary(e).name} ×${n}`;
                    return { id: e, label: text, text };
                  }),
                ]}
                note={heldEssences.length === 0 ? DROPS_FROM.essence : undefined}
              />
            )}
            <div
              className="flex flex-col gap-2"
              data-tutorial="forge.shard"
              data-tutorial-done={linesDone}
            >
              <span className="k-label">Lines</span>
              {preview.lines.length === 0 && (
                <p className="k-note">A common item rolls no lines: add flux for some.</p>
              )}
              {preview.lines.map((l, i) => {
                const text = (
                  <>
                    <span className="text-[16px]">
                      Line {i + 1} ·{' '}
                      {l.shard
                        ? `${shardName(registry, l.shard)}: ${
                            l.range ? valueRange(registry, l.shard.stat, l.range[0], l.range[1]) : ''
                          }`
                        : 'Random'}
                    </span>
                    <span className="k-caption">
                      rolls {pct(l.band[0])}–{pct(l.band[1])}
                    </span>
                  </>
                );
                // No shard held: a line is text, not a way into an empty picker.
                return anyShard ? (
                  <button
                    key={i}
                    type="button"
                    className="k-well flex items-center justify-between gap-3 p-2 text-left"
                    onClick={() => setPicking(i)}
                    data-testid={`shard-slot-${i}`}
                  >
                    {text}
                  </button>
                ) : (
                  <p
                    key={i}
                    className="k-well flex items-center justify-between gap-3 p-2"
                    data-testid={`forge-line-${i}`}
                  >
                    {text}
                  </p>
                );
              })}
              {!anyShard && preview.lines.length > 0 && (
                <p className="k-note" data-testid="forge-lines-none">
                  Shards set a line: {DROPS_FROM.shard}
                </p>
              )}
            </div>
            <Button
              id={`${id}-forge`}
              variant="primary"
              size="lg"
              binding={{ key: 'Enter', pad: 'a' }}
              disabled={!!preview.refused}
              aria-describedby={preview.refused ? `${id}-why` : undefined}
              onClick={onForge}
              data-tutorial="forge.go"
              testId="forge-button"
            >
              Forge · <Price scrap={preview.price.scrap} dust={preview.price.dust || undefined} />
            </Button>
            {status}
            {preview.refused && (
              <p
                id={`${id}-why`}
                className="k-note"
                style={{ color: 'var(--k-bad-text)' }}
                data-testid="forge-refused"
              >
                {preview.refused.reason}
              </p>
            )}
          </div>
        )}
      </Panel>
      <Panel aria-label="The item" testId="forge-preview" scroll={false}>
        {/* No stops: the right stick scrolls it. */}
        <div
          className="k-scroll flex min-h-0 flex-1 flex-col gap-4"
          data-pad-scroll
          data-pad-skip=""
        >
          {!preview || locked ? (
            <p className="k-body-2">The item you forge shows here.</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="k-socket flex h-14 w-14 flex-none items-center justify-center"
                >
                  <ItemIcon baseId={preview.baseId} rarity={preview.rarity} size={28} />
                </span>
                <span className="flex flex-col gap-1">
                  <span
                    className="text-[20px]"
                    style={{ color: RARITY_TEXT[preview.rarity] }}
                    data-testid="forge-title"
                  >
                    {RARITY_LABEL[preview.rarity]} {registry.getGearBase(preview.baseId).name}
                  </span>
                  <span className="k-caption">
                    {SLOT_LABEL[preview.slot]} · item level {preview.ilvl}
                  </span>
                </span>
              </div>
              {range && <PowerRange range={range} slot={preview.slot} />}
              <div className="flex flex-col gap-1" data-testid="forge-implicits">
                <span className="k-label">Implicits</span>
                {preview.implicits.map((im) => (
                  <span key={im.stat} className="text-[16px]">
                    {statRange(registry, im.stat, im.min, im.max)}
                  </span>
                ))}
              </div>
              {preview.floor > 0 && (
                <p className="k-note" data-testid="forge-floor">
                  Your {manaStyle(registry, preview.element).name} attunement lifts every roll: each
                  starts at least {pct(preview.floor)} up its band.
                </p>
              )}
              {legend && (
                <p className="text-[18px]" data-testid="forge-legendary">
                  <span style={{ color: RARITY_TEXT.legendary }}>{legend.name}:</span>{' '}
                  {legend.text.replace('{v}', preview.legendary!.range.join('–'))}
                </p>
              )}
              {preview.weapon && (
                <p className="k-note" data-testid="forge-weapon">
                  {classText(preview.weapon.class)} ·{' '}
                  {slotsText(CHAIN_SKILLS.map((s): SlotPair => [s, ...preview.weapon!.slots[s]]))}
                  {preview.weapon.sockets > 0 &&
                    ` · ${preview.weapon.sockets} open socket${preview.weapon.sockets === 1 ? '' : 's'}`}
                </p>
              )}
              <p className="k-note" data-testid="forge-uses">
                Uses {uses.map((u) => materialLabel(registry, u)).join(', ')}
              </p>
              <div className="k-caption flex items-center gap-2" data-testid="forge-purse">
                In hand: <Price scrap={profile.scrap} dust={profile.manaDust} />
              </div>
            </>
          )}
        </div>
      </Panel>
      {fanfare &&
        createPortal(
          <LegendaryFanfare
            item={fanfare.item}
            firstTime={fanfare.firstTime}
            onDone={endFanfare}
          />,
          document.body,
        )}
    </>
  );
}
