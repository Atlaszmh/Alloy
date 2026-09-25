import { useMemo, useState } from 'react';
import {
  ABILITY_SLOTS,
  MANA_TYPES,
  computeAttunement,
  computeHeroStats,
  manaPool,
  resolveAbility,
  type AbilityBuild,
  type AbilityPayment,
  type AbilitySlot,
  type AbilityWeight,
  type ManaMap,
  type ManaType,
  type ResolvedAbility,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { getDelveRegistry } from './registry';
import { formatNumber, manaStyle } from './format';

const KEY_HINTS = ['Q', 'E', 'R'];
const SLOT_NAME: Record<AbilitySlot, string> = {
  primary: 'Primary',
  defensive: 'Defensive',
  ultimate: 'Ultimate',
};
const WEIGHTS: [AbilityWeight, string][] = [
  [-2, 'Swift'],
  [-1, 'Quick'],
  [0, 'Balanced'],
  [1, 'Heavy'],
  [2, 'Crushing'],
];
const PAYMENTS: [AbilityPayment, string, string][] = [
  ['mana', 'Mana', 'Pay mana, then wait the cooldown.'],
  ['charge', 'Charge', 'No mana: fill a meter by dealing damage (and in lulls), then unleash it.'],
  ['cast', 'Cast', 'Half the mana and 20% more power, but you stand still while it winds up.'],
];

/** Attunement per element with the mastery threshold, and the one mana pool it feeds. */
export function AttunementBars({ attunement }: { attunement: ManaMap }) {
  const registry = getDelveRegistry();
  const bal = registry.getDelveBalance().mana;
  const masteries = registry.getArpgData().masteries;
  const scale = Math.max(bal.masteryThreshold + 2, ...MANA_TYPES.map((m) => attunement[m] + 1));
  const equipped = useDelveStore((s) => s.profile.equipped);
  const pool = useMemo(
    () => manaPool(computeHeroStats(equipped, registry), registry),
    [equipped, registry],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-stone-400" data-testid="mana-pool">
        Mana pool <b className="text-indigo-300">{Math.round(pool.max)}</b> · +
        {pool.regen.toFixed(1)}/s · every point of attunement adds {bal.poolPerAttune}
      </div>
      {MANA_TYPES.map((m) => {
        const style = manaStyle(registry, m);
        const a = attunement[m];
        const mastery = masteries.find((x) => x.mana === m);
        const mastered = a >= bal.masteryThreshold;
        return (
          <div key={m} className="flex flex-col gap-0.5" data-testid={`attune-${m}`} data-value={a}>
            <div className="flex items-center gap-2">
              <span className="w-5 text-center text-sm leading-none">{style.icon}</span>
              <span
                className="delve-display w-14 text-xs font-bold"
                style={{ color: a > 0 ? style.color : '#57534e' }}
              >
                {style.name}
              </span>
              <div className="relative h-2.5 flex-1 overflow-visible rounded-full bg-white/5">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${Math.min(1, a / scale) * 100}%`,
                    background: style.color,
                    boxShadow: a > 0 ? `0 0 8px ${style.color}88` : undefined,
                  }}
                />
                <span
                  className="absolute -top-0.5 h-3.5 w-0.5 rounded"
                  style={{
                    left: `${(bal.masteryThreshold / scale) * 100}%`,
                    background: mastered ? '#fff' : 'rgba(255,255,255,0.25)',
                  }}
                />
              </div>
              <span className="delve-display w-6 text-right text-sm font-bold text-stone-100">
                {a}
              </span>
            </div>
            <div className="pl-7 text-[10px] leading-snug text-stone-500">
              {a > 0 && (
                <span className="text-stone-400">
                  +{Math.round(a * bal.powerPerAttune * 100)}% to {style.name} abilities ·{' '}
                </span>
              )}
              {mastery &&
                (mastered ? (
                  <span style={{ color: style.color }}>
                    ★ {mastery.name}: {mastery.text}
                  </span>
                ) : (
                  <span>
                    At {bal.masteryThreshold}: {mastery.name}
                  </span>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Chip({
  pressed,
  onClick,
  children,
  testId,
  title,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="delve-chip"
      aria-pressed={pressed}
      onClick={onClick}
      data-testid={testId}
      title={title}
    >
      {children}
    </button>
  );
}

/** Plain-language numbers for a resolved ability. */
function Readout({
  ab,
  hit,
  maxHp,
  pool,
}: {
  ab: ResolvedAbility;
  hit: number;
  maxHp: number;
  pool: number;
}) {
  const lines: string[] = [];
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
      `Hits for ${formatNumber(hit)}${ab.radius > 0 && f !== 'strike' ? ` · radius ${ab.radius.toFixed(1)}` : ''}`,
    );
  const pay =
    ab.build.payment === 'charge'
      ? `Charge ${Math.round(ab.chargeNeed)}`
      : `${Math.round(ab.cost)} mana${ab.castTime > 0 ? ` · ${ab.castTime.toFixed(2)}s wind-up` : ''}`;
  lines.push(
    `${pay} · ${ab.build.payment === 'charge' ? 'no cooldown' : `${ab.cooldown.toFixed(ab.cooldown < 2 ? 2 : 0)}s cooldown`}`,
  );
  return (
    <div className="delve-panel flex flex-col gap-0.5 p-3 text-sm" data-testid="ability-readout">
      <div
        className="delve-display text-lg font-bold"
        style={{ color: manaStyle(getDelveRegistry(), ab.element).color }}
      >
        {ab.icon} {ab.name}
      </div>
      {lines.map((l) => (
        <div key={l} className="text-stone-300">
          {l}
        </div>
      ))}
      {ab.cost > pool && (
        <div className="text-xs font-semibold text-red-300" data-testid="cost-warning">
          Needs {Math.round(ab.cost)} mana; your pool holds {Math.round(pool)}.
        </div>
      )}
    </div>
  );
}

/**
 * The Abilities workshop: build the Primary, Defensive and Ultimate from a
 * form, one or two elements, a weight and a payment. Every part is open.
 */
export function AbilitiesPanel() {
  const registry = getDelveRegistry();
  const data = registry.getArpgData();
  const profile = useDelveStore((s) => s.profile);
  const [slot, setSlot] = useState<AbilitySlot>('primary');
  const stats = useMemo(
    () => computeHeroStats(profile.equipped, registry),
    [profile.equipped, registry],
  );
  const attunement = useMemo(
    () => computeAttunement(profile.equipped, registry),
    [profile.equipped, registry],
  );
  const pool = manaPool(stats, registry).max;
  const build = profile.abilities[slot];
  const resolved = ABILITY_SLOTS.map((s) =>
    resolveAbility(registry, s, profile.abilities[s], stats),
  );
  const ab = resolved[ABILITY_SLOTS.indexOf(slot)];
  const [main, infusion] = build.elements;

  const set = (next: Partial<AbilityBuild>) => {
    playSound('buttonClick');
    useDelveStore.getState().setAbility(slot, { ...build, ...next });
  };
  const setMain = (m: ManaType) =>
    set({ elements: infusion && infusion !== m ? [m, infusion] : [m] });
  const setInfusion = (m: ManaType | null) => set({ elements: m ? [main, m] : [main] });
  const trait = (m: ManaType) => data.elementTraits[m];

  return (
    <div className="flex flex-col gap-3" data-testid="abilities-panel">
      <div className="text-xs text-stone-400" data-testid="abilities-summary">
        {resolved.map((r, i) => (
          <span key={r.slot}>
            {i > 0 && ' · '}
            <b className="text-stone-300">{KEY_HINTS[i]}</b> {r.icon} {r.name}
          </span>
        ))}
      </div>

      <div className="flex gap-1.5" role="tablist">
        {ABILITY_SLOTS.map((s, i) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={slot === s}
            className="delve-panel flex flex-1 flex-col items-center gap-0.5 p-2"
            style={{ borderColor: slot === s ? '#fcd34d' : undefined }}
            onClick={() => setSlot(s)}
            data-testid={`ability-slot-${s}`}
          >
            <span className="text-[10px] uppercase tracking-widest text-stone-400">
              {SLOT_NAME[s]} · {KEY_HINTS[i]}
            </span>
            <span className="text-2xl leading-none">{resolved[i].icon}</span>
            <span className="text-center text-[11px] font-semibold leading-tight text-stone-200">
              {resolved[i].name}
            </span>
          </button>
        ))}
      </div>

      <section className="flex flex-col gap-1.5">
        <div className="delve-display text-xs font-bold uppercase tracking-widest text-amber-300/80">
          Form
        </div>
        <div className="flex flex-wrap gap-1.5">
          {data.forms
            .filter((f) => f.slot === slot)
            .map((f) => (
              <Chip
                key={f.id}
                pressed={build.form === f.id}
                onClick={() => set({ form: f.id })}
                testId={`form-${f.id}`}
              >
                {f.icon} {f.name}
              </Chip>
            ))}
        </div>
        <div className="text-xs text-stone-400">{ab.form.text}</div>
      </section>

      <section className="flex flex-col gap-1.5">
        <div className="delve-display text-xs font-bold uppercase tracking-widest text-amber-300/80">
          Element
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MANA_TYPES.map((m) => (
            <Chip
              key={m}
              pressed={main === m}
              onClick={() => setMain(m)}
              testId={`element-${m}`}
              title={trait(m).text}
            >
              {manaStyle(registry, m).icon} {manaStyle(registry, m).name}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-stone-500">Infuse with</span>
          <Chip pressed={!infusion} onClick={() => setInfusion(null)} testId="infusion-none">
            None
          </Chip>
          {MANA_TYPES.filter((m) => m !== main).map((m) => (
            <Chip
              key={m}
              pressed={infusion === m}
              onClick={() => setInfusion(m)}
              testId={`infusion-${m}`}
            >
              {manaStyle(registry, m).icon}
            </Chip>
          ))}
          {infusion && (
            <button
              type="button"
              className="delve-chip"
              onClick={() => set({ elements: [infusion, main] })}
              aria-label="Swap the main element and the infusion"
              data-testid="swap-elements"
            >
              ⇄
            </button>
          )}
        </div>
        <div className="text-xs text-stone-400" data-testid="element-effect">
          {ab.fusion ? (
            <>
              <b className="text-stone-200">
                {ab.fusion.icon} {ab.fusion.name}:
              </b>{' '}
              {ab.fusion.text} {manaStyle(registry, main).name} sets the damage type.
            </>
          ) : slot === 'defensive' ? (
            trait(main).defensive
          ) : (
            trait(main).text
          )}
        </div>
      </section>

      <section className="flex flex-col gap-1.5">
        <div className="delve-display text-xs font-bold uppercase tracking-widest text-amber-300/80">
          Weight
        </div>
        <div className="flex flex-wrap gap-1.5">
          {WEIGHTS.map(([w, label]) => (
            <Chip
              key={w}
              pressed={build.weight === w}
              onClick={() => set({ weight: w })}
              testId={`weight-${w}`}
            >
              {label}
            </Chip>
          ))}
        </div>
        <div className="text-[11px] text-stone-500">
          Heavier hits harder and bigger, but costs more and comes slower.
        </div>
      </section>

      <section className="flex flex-col gap-1.5">
        <div className="delve-display text-xs font-bold uppercase tracking-widest text-amber-300/80">
          Pay with
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PAYMENTS.map(([p, label]) => (
            <Chip
              key={p}
              pressed={build.payment === p}
              onClick={() => set({ payment: p })}
              testId={`payment-${p}`}
            >
              {label}
            </Chip>
          ))}
        </div>
        <div className="text-[11px] text-stone-500">
          {PAYMENTS.find(([p]) => p === build.payment)![2]}
        </div>
      </section>

      <Readout
        ab={ab}
        hit={stats.weaponDamage * stats.damageMult * ab.power}
        maxHp={stats.maxHp}
        pool={pool}
      />

      <section className="flex flex-col gap-1.5">
        <div className="delve-display text-xs font-bold uppercase tracking-widest text-amber-300/80">
          Attunement
        </div>
        <AttunementBars attunement={attunement} />
      </section>

      <section className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="delve-display text-xs font-bold uppercase tracking-widest text-fuchsia-300">
            Reactions
          </span>
          <span className="text-[10px] text-stone-500">
            {profile.reactionsSeen.length}/{data.reactions.length} discovered
          </span>
        </div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {data.reactions.map((r) => {
            const seen = profile.reactionsSeen.includes(r.id);
            return (
              <div
                key={r.id}
                className="delve-panel flex items-center gap-2.5 p-2"
                data-testid={seen ? `reaction-${r.id}` : 'reaction-unknown'}
                style={seen ? { borderColor: 'rgba(232,121,249,0.4)' } : undefined}
              >
                <span className="w-8 text-center text-2xl">{seen ? r.icon : '❔'}</span>
                <span className="min-w-0">
                  <span
                    className="delve-display block text-sm font-bold"
                    style={{ color: seen ? '#f0abfc' : '#57534e' }}
                  >
                    {seen ? r.name : '???'}
                  </span>
                  <span className="block text-[10.5px] leading-snug text-stone-400">
                    {seen ? r.text : 'Hit one foe with two different elements to discover.'}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
