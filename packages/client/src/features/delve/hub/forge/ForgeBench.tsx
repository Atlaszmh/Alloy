import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  FLUX_GRADES,
  MANA_TYPES,
  METAL_IDS,
  inPair,
  previewForge,
  type FluxGrade,
  type ForgeRequest,
  type GearItem,
  type MaterialRef,
  type MetalId,
  type ShardRef,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Button, Panel, Price, Segmented, type Prompt } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { ItemIcon } from '../../ItemIcon';
import { LegendaryFanfare } from '../../LegendaryFanfare';
import { RARITY_LABEL, RARITY_TEXT, SLOT_LABEL, manaStyle } from '../../format';
import { SKILL_NAME } from '../../chains/chain-text';
import { PatternList } from './PatternList';
import { ShardPicker } from './ShardPicker';
import { materialLabel, pct, shardName, statRange, valueRange } from './materials-text';

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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="k-label">{label}</span>
      {children}
    </div>
  );
}

/**
 * The Forge bench: the pattern list (the left pane) and the forge (the centre):
 * a learned pattern, a bar, a flux (and with epic flux an essence), the element
 * and a shard for each line it should set, with the engine's live
 * `previewForge`: the lines' bands, the attunement floor, the implicits, a
 * weapon's skills, slots and sockets, the price and why it refuses. Forge
 * (Enter, or A on the button) makes it; a legendary plays the fanfare.
 */
export function ForgeBench({
  locked,
  setPrompts,
}: {
  locked: boolean;
  setPrompts: (prompts: Prompt[]) => void;
}) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const pad = useInputDeviceStore((s) => s.device === 'gamepad');
  const { metals, flux: fluxHeld, essences } = profile.materials;
  const [baseId, setBaseId] = useState<string | null>(null);
  // The picks follow the stock: a bar picked while held, else the first held;
  // an essence while held, else none (forged away).
  const [metalPick, setMetal] = useState<MetalId>(METAL_IDS[0]);
  const metal =
    metals[metalPick] > 0 ? metalPick : (METAL_IDS.find((m) => metals[m] > 0) ?? metalPick);
  const [flux, setFlux] = useState<FluxGrade | null>(null);
  const [essencePick, setEssence] = useState<string | null>(null);
  const essence = essencePick && essences[essencePick] ? essencePick : null;
  const [element, setElement] = useState(profile.pair.primary ?? MANA_TYPES[0]);
  const [shards, setShards] = useState<ShardRef[]>([]);
  const [picking, setPicking] = useState<number | null>(null);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const [fanfare, setFanfare] = useState<{ item: GearItem; firstTime: boolean } | null>(null);
  const endFanfare = useCallback(() => setFanfare(null), []);
  const id = useId();

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

  // After a pick the focus goes to Forge, so Enter or A forges next; a refused
  // forge leaves it where it was, by the reason.
  const picked = useRef(false);
  const pick = () => {
    picked.current = true;
  };
  useEffect(() => {
    if (!picked.current) return;
    picked.current = false;
    if (preview && !preview.refused)
      document.getElementById(`${id}-forge`)?.focus({ preventScroll: true });
  });

  const say = (text: string, good: boolean) => setMessage({ text, good });
  // A rarity's line count doesn't depend on the shards: a lower one keeps the first that fit.
  const pickIngot = (f: FluxGrade | null, e: string | null) => {
    pick();
    const lines = previewForge(registry, profile, request(f, e, [])).lines.length;
    setFlux(f);
    setEssence(e);
    setShards((s) => s.slice(0, lines));
  };
  // Line i takes `shard`, or (null) rolls at random: the shards come first, in order.
  const setLine = (i: number, shard: ShardRef | null) => {
    pick();
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
        ? [SELECT_PROMPT]
        : [
            SELECT_PROMPT,
            {
              id: 'forge',
              label: 'Forge',
              binding: { key: ['Enter', 'NumpadEnter'] },
              onPress: () => forgeNow.current(),
            },
          ],
    );
  }, [pad, locked, setPrompts]);

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
  const extras = preview?.weapon
    ? Object.entries(preview.weapon.slots)
        .filter(([, n]) => n > 0)
        .map(([s, n]) => `${SKILL_NAME[s as keyof typeof SKILL_NAME]} +${n}`)
    : [];

  return (
    <>
      <PatternList
        known={profile.patterns}
        selected={baseId}
        essence={flux === 'epic' ? essence : null}
        onSelect={(b) => {
          playSound('orbSelect');
          pick();
          setBaseId(b);
          setShards([]);
          setPicking(null);
          setMessage(null);
        }}
      />
      <Panel aria-label="Forge" testId="forge-bench">
        {message && !locked && (
          <p
            role="status"
            className="text-[16px]"
            style={{ color: message.good ? 'var(--k-ok)' : 'var(--k-bad-text)' }}
          >
            {message.text}
          </p>
        )}
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
          <div className="flex flex-col gap-4">
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
            <div className="k-caption flex items-center gap-2" data-testid="forge-purse">
              In hand: <Price scrap={profile.scrap} dust={profile.manaDust} />
            </div>
            <Field label="Metal">
              <Segmented
                aria-label="Metal"
                columns={4}
                value={metal}
                onChange={(m) => {
                  pick();
                  setMetal(m);
                }}
                options={METAL_IDS.map((m) => ({
                  id: m,
                  label: `${materialLabel(registry, { kind: 'metal', metal: m })} ×${metals[m]}`,
                  disabled: metals[m] === 0,
                  testId: `metal-${m}`,
                }))}
              />
            </Field>
            <Field label="Flux">
              <Segmented
                aria-label="Flux"
                columns={5}
                value={flux ?? 'none'}
                onChange={(f) => pickIngot(f === 'none' ? null : f, essence)}
                options={[
                  { id: 'none' as const, label: 'None', testId: 'flux-none' },
                  ...FLUX_GRADES.map((g) => ({
                    id: g,
                    label: `${RARITY_LABEL[g]} ×${fluxHeld[g]}`,
                    disabled: fluxHeld[g] === 0,
                    testId: `flux-${g}`,
                  })),
                ]}
              />
            </Field>
            {flux === 'epic' && (
              <Field label="Essence">
                <Segmented
                  aria-label="Essence"
                  value={essence ?? 'none'}
                  onChange={(e) => pickIngot('epic', e === 'none' ? null : e)}
                  options={[
                    { id: 'none', label: 'None · epic', testId: 'essence-none' },
                    ...Object.entries(essences)
                      .filter(([, n]) => n > 0)
                      .map(([e, n]) => ({
                        id: e,
                        label: `${registry.getLegendary(e).name} ×${n}`,
                        testId: `essence-${e}`,
                      })),
                  ]}
                />
              </Field>
            )}
            <Field label="Element">
              <Segmented
                aria-label="Element"
                columns={3}
                value={element}
                onChange={(m) => {
                  pick();
                  setElement(m);
                }}
                options={MANA_TYPES.map((m) => {
                  const st = manaStyle(registry, m);
                  return {
                    id: m,
                    color: st.color,
                    label: inPair(profile, m) ? (
                      st.name
                    ) : (
                      // One wrapping run, so a narrow cell breaks it between the name and the price.
                      <span>
                        {st.name} · <Price dust={offPairDust} />
                      </span>
                    ),
                    testId: `element-${m}`,
                  };
                })}
              />
            </Field>
            <Field label="Lines">
              {preview.lines.length === 0 && (
                <p className="k-caption">A common item rolls no lines: add flux for some.</p>
              )}
              {preview.lines.map((l, i) => (
                <button
                  key={i}
                  type="button"
                  className="k-well flex items-center justify-between gap-3 p-2 text-left"
                  onClick={() => setPicking(i)}
                  data-testid={`shard-slot-${i}`}
                >
                  <span className="text-[16px]">
                    {l.shard
                      ? `${shardName(registry, l.shard)}: ${
                          l.range ? valueRange(registry, l.shard.stat, l.range[0], l.range[1]) : ''
                        }`
                      : 'Random line'}
                  </span>
                  <span className="k-caption">
                    rolls {pct(l.band[0])}–{pct(l.band[1])}
                  </span>
                </button>
              ))}
            </Field>
            {preview.floor > 0 && (
              <p className="k-caption" data-testid="forge-floor">
                Your {manaStyle(registry, preview.element).name} attunement lifts every roll: each
                starts at least {pct(preview.floor)} up its band.
              </p>
            )}
            <Field label="Implicits">
              <div className="flex flex-col gap-1" data-testid="forge-implicits">
                {preview.implicits.map((im) => (
                  <span key={im.stat} className="text-[16px]">
                    {statRange(registry, im.stat, im.min, im.max)}
                  </span>
                ))}
              </div>
            </Field>
            {legend && (
              <p className="text-[16px]" data-testid="forge-legendary">
                <span style={{ color: RARITY_TEXT.legendary }}>{legend.name}:</span>{' '}
                {legend.text.replace('{v}', preview.legendary!.range.join('–'))}
              </p>
            )}
            {preview.weapon && (
              <p className="k-caption" data-testid="forge-weapon">
                Carries {preview.weapon.carries.map((s) => SKILL_NAME[s]).join(', ')}
                {extras.length > 0 && ` · extra slots: ${extras.join(', ')}`}
                {preview.weapon.sockets > 0 &&
                  ` · ${preview.weapon.sockets} open socket${preview.weapon.sockets === 1 ? '' : 's'}`}
              </p>
            )}
            <p className="k-caption" data-testid="forge-uses">
              Uses {uses.map((u) => materialLabel(registry, u)).join(', ')}
            </p>
            <Button
              id={`${id}-forge`}
              variant="primary"
              size="lg"
              binding={{ key: 'Enter', pad: 'a' }}
              disabled={!!preview.refused}
              aria-describedby={preview.refused ? `${id}-why` : undefined}
              onClick={onForge}
              testId="forge-button"
            >
              Forge · <Price scrap={preview.price.scrap} dust={preview.price.dust || undefined} />
            </Button>
            {preview.refused && (
              <p
                id={`${id}-why`}
                className="k-caption"
                style={{ color: 'var(--k-bad-text)' }}
                data-testid="forge-refused"
              >
                {preview.refused.reason}
              </p>
            )}
          </div>
        )}
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
