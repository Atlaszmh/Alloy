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
import { Chip } from '@/features/delve/kit';
import { formatNumber, manaStyle } from '../format';
import { getDelveRegistry } from '../registry';
import { KIND_ICON, KIND_LABEL, listed } from './chain-text';

const KIND_HINT: Record<MoveKind, string> = {
  light: 'Quick and cheap.',
  medium: 'Balanced.',
  heavy: 'Harder and bigger, but dearer and slower.',
  hold: 'Hold the button to charge it, then let go: a tap is a medium hit, a full charge beyond heavy.',
};

function Heading({ children }: { children: string }) {
  return (
    <div className="delve-display text-xs font-bold uppercase tracking-widest text-amber-300/80">
      {children}
    </div>
  );
}

/** Seconds as the readout says them: 0.4, 1.04. */
const secs = (s: number) => `${+s.toFixed(2)}s`;

/**
 * Plain-language numbers for a resolved move (at its place in the chain) and
 * the beat after it; a hold's full charge too, with its time and its beat (by
 * the weapon's tempo). The price carries its runes' share (eased by the move's
 * attunement, which a line says), and a mana cost the pool can't hold warns.
 */
function Readout({
  ab,
  full,
  stats,
  pool,
}: {
  ab: ResolvedAbility;
  full: ResolvedAbility | null;
  stats: HeroStats;
  pool: number;
}) {
  const registry = getDelveRegistry();
  const bal = registry.getDelveBalance();
  // The engine's numbers: the hit it deals (a Ward's burst and an Armor's strike-back without
  // the step bonus), and the radius it uses.
  const { hit, radius } = moveNumbers(stats, bal, ab);
  const maxHp = stats.maxHp;
  const lines: string[] = [];
  const beat = (a: ResolvedAbility) => `then a ${secs(moveBeat(bal, a, stats.tempo))} beat`;
  const f = ab.form.id;
  if (f === 'ward')
    lines.push(
      `Absorbs ${formatNumber(maxHp * ab.effect)} for ${ab.duration}s`,
      `Bursts for ${formatNumber(hit)}`,
    );
  else if (f === 'armor')
    lines.push(
      `${Math.round(Math.min(0.75, ab.effect) * 100)}% less damage for ${ab.duration}s`,
      `Strikes back for ${formatNumber(hit)}`,
    );
  else if (f === 'surge')
    lines.push(`+${Math.round(ab.effect * 100)}% attack speed for ${ab.duration}s`);
  else if (f === 'blink')
    lines.push(
      `${ab.range} units, untouchable ${ab.effect.toFixed(2)}s`,
      `Trail hits for ${formatNumber(hit)}`,
    );
  else if (f === 'barrage') lines.push(`${ab.count} impacts of ${formatNumber(hit)}`);
  else if (f === 'maelstrom')
    lines.push(`${formatNumber(hit)} every ${ab.tick}s for ${ab.duration}s`);
  else
    lines.push(
      `Hits for ${formatNumber(hit)}${radius > 0 && f !== 'strike' ? ` · radius ${radius.toFixed(1)}` : ''}`,
    );
  const windup = ab.castTime > 0 ? ` · ${ab.castTime.toFixed(2)}s wind-up` : '';
  // The runes' share of the price, eased, in the payment's words (see the rune costs spec).
  const runed = ab.load > 0 ? ` (runes: ${loadText(registry, ab.load, ab.payment)})` : '';
  const pay =
    ab.payment === 'charge'
      ? `Charge ${Math.round(ab.chargeNeed)}${windup}${runed}`
      : `${Math.round(ab.cost)} mana${windup}${runed}`;
  // How much the move's attunement takes off its runes' load, and whether that is the cap.
  const ease =
    ab.load > 0 && ab.ease > 0
      ? `Attunement eases rune cost by ${Math.round(ab.ease * 100)}%${ab.ease >= bal.runes.load.easeCap ? ' (the most it can)' : ''}`
      : null;
  lines.push(
    `${pay} · ${ab.payment === 'charge' ? 'no cooldown' : `${ab.cooldown.toFixed(ab.cooldown < 2 ? 2 : 0)}s cooldown`}, ${beat(ab)}`,
    `${ab.stacks} ${ab.stacks === 1 ? 'stack' : 'stacks'} a hit`,
  );
  if (full)
    lines.push(
      `Fully charged (${secs(holdFull(bal, stats.tempo))}): hits for ${formatNumber(moveNumbers(stats, bal, full).hit)}, ${full.payment === 'charge' ? `Charge ${Math.round(full.chargeNeed)}` : `${Math.round(full.cost)} mana`}, ${beat(full)}`,
    );
  // A mana cost the pool can't hold: the move's, else a hold's full charge (the engine would
  // let go at the highest stage the pool pays).
  const holds = `your pool holds ${Math.round(pool)}.`;
  const warning =
    ab.cost > pool
      ? `Needs ${Math.round(ab.cost)} mana; ${holds}`
      : full && full.cost > pool
        ? `A full charge needs ${Math.round(full.cost)} mana; ${holds}`
        : null;
  return (
    <div className="delve-panel flex flex-col gap-0.5 p-3 text-sm" data-testid="ability-readout">
      <div
        className="delve-display text-lg font-bold"
        style={{ color: manaStyle(registry, ab.element).color }}
      >
        {ab.icon} {KIND_LABEL[ab.kind]} {ab.name}
      </div>
      {lines.map((l) => (
        <div key={l} className="text-stone-300">
          {l}
        </div>
      ))}
      {ease && (
        <div className="text-stone-300" data-testid="rune-ease">
          {ease}
        </div>
      )}
      {warning && (
        <div className="text-xs font-semibold text-red-300" data-testid="cost-warning">
          {warning}
        </div>
      )}
    </div>
  );
}

/** A basic blow's numbers: its hit and its stacks (the engine's), and its time. */
function BlowReadout({ blow, stats }: { blow: HeroBlow; stats: HeroStats }) {
  const registry = getDelveRegistry();
  const { hit, stacks } = blowNumbers(stats, registry.getDelveBalance(), blow);
  return (
    <div className="delve-panel flex flex-col gap-0.5 p-3 text-sm" data-testid="ability-readout">
      <div
        className="delve-display text-lg font-bold"
        style={{ color: manaStyle(registry, blow.element).color }}
      >
        {KIND_LABEL[blow.kind]} {manaStyle(registry, blow.element).name} blow
      </div>
      <div className="text-stone-300">Hits for {formatNumber(hit)}</div>
      <div className="text-stone-300">
        {(stats.attackInterval * blow.time).toFixed(2)}s · {stacks}{' '}
        {stacks === 1 ? 'stack' : 'stacks'} a hit
      </div>
    </div>
  );
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
      {st.icon} {st.name}
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
  const own = 'element' in move ? [move.element] : move.elements;
  const off = own.filter((m) => !elements.includes(m));
  const shown = [...elements, ...off];
  // A move may keep its off-pair set, but never take a new one (the engine refuses it).
  const takes = (els: readonly ManaType[]) => takesElements(elements, own, els);
  // A form a socketed rune doesn't fit is off (the engine refuses it): pull the rune to pick it.
  const misfits = (form: FormId): string[] =>
    socketsOf(move).flatMap((r) => {
      const def = r ? registry.findRune(r.id) : undefined;
      return def && !runeFits(def, { form }) ? [def.name] : [];
    });
  const blocking = [
    ...new Set(data.forms.filter((f) => f.slot === slot).flatMap((f) => misfits(f.id))),
  ];

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
        <div className="text-[11px] text-stone-500">
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
                      {f.icon} {f.name}
                    </Chip>
                  );
                })}
            </div>
            {blocking.length > 0 && (
              <div className="text-[11px] text-amber-200/90" data-testid="form-rune-note">
                {listed(blocking)} {blocking.length > 1 ? "don't" : "doesn't"} fit every form: pull{' '}
                {blocking.length > 1 ? 'them' : 'it'} to pick another.
              </div>
            )}
            <div className="text-xs text-stone-400">{registry.getForm(move.form).text}</div>
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
              <span className="text-[11px] text-stone-500">Infuse with</span>
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
                  >
                    {manaStyle(registry, m).icon}
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
            <div className="text-xs text-stone-400" data-testid="element-effect">
              {resolved?.fusion ? (
                <>
                  <b className="text-stone-200">
                    {resolved.fusion.icon} {resolved.fusion.name}:
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
        <div className="text-[11px] text-amber-200/90" data-testid="off-pair-note">
          {off.map((m) => manaStyle(registry, m).name).join(' and ')} off-pair: no attunement. Keep
          it, or pick from your two elements.
        </div>
      )}
      {resolved && <Readout ab={resolved} full={full} stats={stats} pool={pool} />}
      {blow && <BlowReadout blow={blow} stats={stats} />}
    </div>
  );
}
