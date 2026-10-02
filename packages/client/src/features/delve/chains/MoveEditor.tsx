import {
  MOVE_KINDS,
  blowNumbers,
  holdFull,
  loadText,
  moveBeat,
  moveNumbers,
  takesElements,
  type AbilitySlot,
  type Blow,
  type HeroBlow,
  type HeroStats,
  type ManaType,
  type Move,
  type MoveKind,
  type ResolvedAbility,
  runeFits,
  socketsOf,
  type FormId,
} from '@alloy/engine';
import { Chip, Glyph } from '@/features/delve/kit';
import { formatNumber, manaStyle } from '../format';
import { getDelveRegistry } from '../registry';
import { KIND_ICON, KIND_LABEL, listed } from './chain-text';

/** What each kind means, under its choice. */
export const KIND_HINT: Record<MoveKind, string> = {
  light: 'Quick and cheap.',
  medium: 'Balanced.',
  heavy: 'Harder and bigger, but dearer and slower.',
  hold: 'Hold the button to charge it, then let go: a tap is a medium hit, a full charge beyond heavy.',
};

function Heading({ children }: { children: string }) {
  return <h3 className="k-label m-0">{children}</h3>;
}

/** An element's glyph in its colour. */
function ManaGlyph({ mana }: { mana: ManaType }) {
  return <Glyph id={mana} size={16} color={manaStyle(getDelveRegistry(), mana).color} />;
}

/** Seconds as the readout says them: 0.4s, 1.04s. */
const secs = (s: number) => `${+s.toFixed(2)}s`;

/** One line of a move's numbers: "Beat after · 0.25s". */
export interface NumberRow {
  id: string;
  label: string;
  value: string;
}

/**
 * A resolved move's numbers (at its place in the chain), from the engine's `moveNumbers` and
 * `moveBeat`: what it does, its price (with its runes' share, eased by the move's attunement,
 * which `ease` says), its wind-up, cooldown and beat, its stacks, and a hold's full charge.
 * `warning`: a mana cost the pool can't hold.
 */
export function moveRows(
  ab: ResolvedAbility,
  full: ResolvedAbility | null,
  stats: HeroStats,
  pool: number,
): { rows: NumberRow[]; ease: string | null; warning: string | null } {
  const registry = getDelveRegistry();
  const bal = registry.getDelveBalance();
  // The engine's numbers: the hit it deals (a Ward's burst and an Armor's strike-back without
  // the step bonus), and the radius it uses.
  const { hit, radius } = moveNumbers(stats, bal, ab);
  const rows: NumberRow[] = [];
  const row = (id: string, label: string, value: string) => rows.push({ id, label, value });
  const f = ab.form.id;
  if (f === 'ward') {
    row('absorbs', 'Absorbs', `${formatNumber(stats.maxHp * ab.effect)} for ${ab.duration}s`);
    row('hit', 'Bursts for', formatNumber(hit));
  } else if (f === 'armor') {
    row(
      'reduction',
      'Less damage',
      `${Math.round(Math.min(0.75, ab.effect) * 100)}% for ${ab.duration}s`,
    );
    row('hit', 'Strikes back', formatNumber(hit));
  } else if (f === 'surge')
    row('speed', 'Attack speed', `+${Math.round(ab.effect * 100)}% for ${ab.duration}s`);
  else if (f === 'blink') {
    row('blink', 'Blink', `${ab.range} units, untouchable ${ab.effect.toFixed(2)}s`);
    row('hit', 'Trail hits for', formatNumber(hit));
  } else if (f === 'barrage') row('hit', 'Hit', `${ab.count} × ${formatNumber(hit)}`);
  else if (f === 'maelstrom')
    row('hit', 'Hit', `${formatNumber(hit)} every ${ab.tick}s for ${ab.duration}s`);
  else {
    row('hit', 'Hit', formatNumber(hit));
    if (radius > 0 && f !== 'strike') row('radius', 'Radius', radius.toFixed(1));
  }
  // The runes' share of the price, eased, in the payment's words (see the rune costs spec).
  const runed = ab.load > 0 ? ` (runes: ${loadText(registry, ab.load, ab.payment)})` : '';
  const charge = ab.payment === 'charge';
  row(
    'cost',
    'Cost',
    charge ? `Charge ${Math.round(ab.chargeNeed)}${runed}` : `${Math.round(ab.cost)} mana${runed}`,
  );
  if (ab.castTime > 0) row('windup', 'Wind-up', `${ab.castTime.toFixed(2)}s`);
  row('cooldown', 'Cooldown', charge ? 'none' : `${ab.cooldown.toFixed(ab.cooldown < 2 ? 2 : 0)}s`);
  row('beat', 'Beat after', secs(moveBeat(bal, ab, stats.tempo)));
  row('stacks', 'Stacks', `${ab.stacks} a hit`);
  if (full)
    row(
      'full',
      'Full charge',
      `${secs(holdFull(bal, stats.tempo))}: hits for ${formatNumber(moveNumbers(stats, bal, full).hit)}, ${full.payment === 'charge' ? `Charge ${Math.round(full.chargeNeed)}` : `${Math.round(full.cost)} mana`}, then a ${secs(moveBeat(bal, full, stats.tempo))} beat`,
    );
  // How much the move's attunement takes off its runes' load, and whether that is the cap.
  const ease =
    ab.load > 0 && ab.ease > 0
      ? `Attunement eases rune cost by ${Math.round(ab.ease * 100)}%${ab.ease >= bal.runes.load.easeCap ? ' (the most it can)' : ''}`
      : null;
  // A mana cost the pool can't hold: the move's, else a hold's full charge (the engine would
  // let go at the highest stage the pool pays).
  const holds = `your pool holds ${Math.round(pool)}.`;
  const warning =
    ab.cost > pool
      ? `Needs ${Math.round(ab.cost)} mana; ${holds}`
      : full && full.cost > pool
        ? `A full charge needs ${Math.round(full.cost)} mana; ${holds}`
        : null;
  return { rows, ease, warning };
}

/** A basic blow's numbers: its hit and its stacks (the engine's), and its time. */
export function blowRows(blow: HeroBlow, stats: HeroStats): NumberRow[] {
  const { hit, stacks } = blowNumbers(stats, getDelveRegistry().getDelveBalance(), blow);
  return [
    { id: 'hit', label: 'Hit', value: formatNumber(hit) },
    { id: 'time', label: 'Time', value: `${(stats.attackInterval * blow.time).toFixed(2)}s` },
    { id: 'stacks', label: 'Stacks', value: `${stacks} a hit` },
  ];
}

/** Numbers as a two-column table, each value `num-<id>`. */
export function NumberTable({ rows }: { rows: readonly NumberRow[] }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
      {rows.map((r) => (
        <div key={r.id} className="contents">
          <dt className="text-[var(--k-text-3)]">{r.label}</dt>
          <dd className="m-0 text-right font-semibold" data-testid={`num-${r.id}`}>
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A resolved move's numbers table, the attunement's easing and the pool warning. */
export function MoveNumbers(props: {
  ab: ResolvedAbility;
  full: ResolvedAbility | null;
  stats: HeroStats;
  pool: number;
}) {
  const { rows, ease, warning } = moveRows(props.ab, props.full, props.stats, props.pool);
  return (
    <>
      <NumberTable rows={rows} />
      {ease && (
        <div className="text-[14px] text-[var(--k-text-2)]" data-testid="rune-ease">
          {ease}
        </div>
      )}
      {warning && (
        <div
          className="text-[14px] font-semibold text-[var(--k-bad-text)]"
          data-testid="cost-warning"
        >
          {warning}
        </div>
      )}
    </>
  );
}

/** The resolved move's name and numbers (the one-column builder's readout). */
function Readout(props: {
  ab: ResolvedAbility;
  full: ResolvedAbility | null;
  stats: HeroStats;
  pool: number;
}) {
  const registry = getDelveRegistry();
  const { ab } = props;
  return (
    <div className="delve-panel flex flex-col gap-1 p-3 text-[16px]" data-testid="ability-readout">
      <div
        className="delve-display flex items-center gap-1.5 text-lg font-bold"
        style={{ color: manaStyle(registry, ab.element).color }}
      >
        <Glyph id={ab.form.id} size={18} /> {KIND_LABEL[ab.kind]} {ab.name}
      </div>
      <MoveNumbers {...props} />
    </div>
  );
}

/** A basic blow's name and numbers. */
function BlowReadout({ blow, stats }: { blow: HeroBlow; stats: HeroStats }) {
  const registry = getDelveRegistry();
  return (
    <div className="delve-panel flex flex-col gap-1 p-3 text-[16px]" data-testid="ability-readout">
      <div
        className="delve-display text-lg font-bold"
        style={{ color: manaStyle(registry, blow.element).color }}
      >
        {KIND_LABEL[blow.kind]} {manaStyle(registry, blow.element).name} blow
      </div>
      <NumberTable rows={blowRows(blow, stats)} />
    </div>
  );
}

/**
 * What a move may become: its own elements, those outside `elements` (off-pair: a drop's, kept,
 * which no other move can take), the elements to offer (the allowed, then its off-pair ones),
 * whether it may take an element set (never a new off-pair one: the engine refuses it), and the
 * socketed runes a form doesn't fit (the engine refuses that form: pull them to pick it).
 */
export function moveChoices(
  move: Move | Blow,
  slot: AbilitySlot | null,
  elements: readonly ManaType[],
): {
  own: ManaType[];
  off: ManaType[];
  shown: ManaType[];
  takes: (els: readonly ManaType[]) => boolean;
  misfits: (form: FormId) => string[];
  blocking: string[];
} {
  const registry = getDelveRegistry();
  const own = 'element' in move ? [move.element] : move.elements;
  const off = own.filter((m) => !elements.includes(m));
  const misfits = (form: FormId): string[] =>
    socketsOf(move).flatMap((r) => {
      const def = r ? registry.findRune(r.id) : undefined;
      return def && !runeFits(def, { form }) ? [def.name] : [];
    });
  return {
    own,
    off,
    shown: [...elements, ...off],
    takes: (els) => takesElements(elements, own, els),
    misfits,
    blocking: [
      ...new Set(
        registry
          .getArpgData()
          .forms.filter((f) => f.slot === slot)
          .flatMap((f) => misfits(f.id)),
      ),
    ],
  };
}

export interface MoveEditorProps {
  /** The ability slot the move belongs to, or null for a basic blow. */
  slot: AbilitySlot | null;
  move: Move | Blow;
  /** The move resolved at its place in the chain (a hold at stage 0), and a hold's full charge. */
  resolved: ResolvedAbility | null;
  full: ResolvedAbility | null;
  /** A blow as the hero swings it. */
  blow: HeroBlow | null;
  stats: HeroStats;
  pool: number;
  /** The elements it can take; one it holds outside them shows marked off-pair. */
  elements: readonly ManaType[];
  onChange: (next: Move | Blow) => void;
}

/** An element chip's label, marked when the element is off-pair. */
function ElementLabel({ mana, off }: { mana: ManaType; off: boolean }) {
  const st = manaStyle(getDelveRegistry(), mana);
  return (
    <>
      <ManaGlyph mana={mana} /> {st.name}
      {off && <span className="text-amber-300/80"> · off-pair</span>}
    </>
  );
}

/**
 * One move of a chain: its kind, its form (none for a blow), its element(s),
 * and its readout. An element it holds outside `elements` (a drop's, kept
 * from off the pair) shows as a marked chip: it still casts and reacts, but
 * draws no attunement, and no other move can take it.
 */
export function MoveEditor({
  slot,
  move,
  resolved,
  full,
  blow,
  stats,
  pool,
  elements,
  onChange,
}: MoveEditorProps) {
  const registry = getDelveRegistry();
  const data = registry.getArpgData();
  const set = (next: Partial<Move>) => onChange({ ...move, ...next } as Move | Blow);
  const trait = (m: ManaType) => data.elementTraits[m];
  const { off, shown, takes, misfits, blocking } = moveChoices(move, slot, elements);

  return (
    <div className="flex flex-col gap-3" data-testid="move-editor">
      <section className="flex flex-col gap-1.5">
        <Heading>Kind</Heading>
        <div className="flex flex-wrap gap-1.5">
          {MOVE_KINDS.map((k) => (
            <Chip
              key={k}
              pressed={move.kind === k}
              onClick={() => set({ kind: k })}
              testId={`kind-${k}`}
            >
              <span aria-hidden>{KIND_ICON[k]}</span> {KIND_LABEL[k]}
            </Chip>
          ))}
        </div>
        <div className="k-caption">
          {'form' in move
            ? KIND_HINT[move.kind]
            : move.kind === 'hold' &&
              'Hold the attack to charge it; automatic attacks swing it slow and hard.'}
        </div>
      </section>

      {'element' in move ? (
        <section className="flex flex-col gap-1.5">
          <Heading>Element</Heading>
          <div className="flex flex-wrap gap-1.5">
            {shown.map((m) => (
              <Chip
                key={m}
                pressed={move.element === m}
                onClick={() => onChange({ ...move, element: m })}
                testId={`element-${m}`}
                disabled={!takes([m])}
              >
                <ElementLabel mana={m} off={off.includes(m)} />
              </Chip>
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-1.5">
            <Heading>Form</Heading>
            <div className="flex flex-wrap gap-1.5">
              {data.forms
                .filter((f) => f.slot === slot)
                .map((f) => {
                  const out = f.id === move.form ? [] : misfits(f.id);
                  return (
                    <Chip
                      key={f.id}
                      pressed={move.form === f.id}
                      onClick={() => set({ form: f.id })}
                      testId={`form-${f.id}`}
                      disabled={out.length > 0}
                      title={out.length > 0 ? `${listed(out)} doesn't fit a ${f.name}` : undefined}
                    >
                      <Glyph id={f.id} size={16} /> {f.name}
                    </Chip>
                  );
                })}
            </div>
            {blocking.length > 0 && (
              <div className="text-[14px] text-amber-200/90" data-testid="form-rune-note">
                {listed(blocking)} {blocking.length > 1 ? "don't" : "doesn't"} fit every form: pull{' '}
                {blocking.length > 1 ? 'them' : 'it'} to pick another.
              </div>
            )}
            <div className="k-caption">{registry.getForm(move.form).text}</div>
          </section>

          <section className="flex flex-col gap-1.5">
            <Heading>Element</Heading>
            <div className="flex flex-wrap gap-1.5">
              {shown.map((m) => {
                const [main, infusion] = move.elements;
                const els = infusion && infusion !== m ? [m, infusion] : [m];
                return (
                  <Chip
                    key={m}
                    pressed={main === m}
                    onClick={() => set({ elements: els })}
                    testId={`element-${m}`}
                    title={trait(m).text}
                    disabled={!takes(els)}
                  >
                    <ElementLabel mana={m} off={off.includes(m)} />
                  </Chip>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="k-caption">Infuse with</span>
              <Chip
                pressed={move.elements.length === 1}
                onClick={() => set({ elements: [move.elements[0]] })}
                testId="infusion-none"
                disabled={!takes([move.elements[0]])}
              >
                None
              </Chip>
              {shown
                .filter((m) => m !== move.elements[0])
                .map((m) => (
                  <Chip
                    key={m}
                    pressed={move.elements[1] === m}
                    onClick={() => set({ elements: [move.elements[0], m] })}
                    testId={`infusion-${m}`}
                    disabled={!takes([move.elements[0], m])}
                    aria-label={`Infuse with ${manaStyle(registry, m).name}`}
                  >
                    <ManaGlyph mana={m} />
                  </Chip>
                ))}
              {move.elements.length > 1 && (
                <button
                  type="button"
                  className="delve-chip"
                  onClick={() => set({ elements: [move.elements[1], move.elements[0]] })}
                  aria-label="Swap the main element and the infusion"
                  data-testid="swap-elements"
                >
                  ⇄
                </button>
              )}
            </div>
            <div className="k-caption" data-testid="element-effect">
              {resolved?.fusion ? (
                <>
                  <b className="text-stone-200">
                    {move.elements.map((m) => (
                      <ManaGlyph key={m} mana={m} />
                    ))}{' '}
                    {resolved.fusion.name}:
                  </b>{' '}
                  {resolved.fusion.text} {manaStyle(registry, move.elements[0]).name} sets the
                  damage type.
                </>
              ) : slot === 'defensive' ? (
                trait(move.elements[0]).defensive
              ) : (
                trait(move.elements[0]).text
              )}
            </div>
          </section>
        </>
      )}

      {off.length > 0 && (
        <div className="text-[14px] text-amber-200/90" data-testid="off-pair-note">
          {off.map((m) => manaStyle(registry, m).name).join(' and ')} off-pair: no attunement. Keep
          it, or pick from your two elements.
        </div>
      )}
      {resolved && <Readout ab={resolved} full={full} stats={stats} pool={pool} />}
      {blow && <BlowReadout blow={blow} stats={stats} />}
    </div>
  );
}
