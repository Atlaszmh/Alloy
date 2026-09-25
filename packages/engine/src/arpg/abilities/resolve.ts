import type { DataRegistry } from '../../data/registry.js';
import type {
  AbilityBuild,
  AbilityBuilds,
  AbilitySlot,
  Knobs,
  ResolvedAbility,
} from '../../types/ability.js';
import type { ManaType } from '../../types/mana.js';
import type { HeroStats } from '../../types/delve.js';

const NEUTRAL: Knobs = {
  power: 1,
  area: 1,
  applies: [],
  chain: 0,
  pierce: false,
  knockback: 0,
  lifesteal: 0,
  zone: null,
  pull: false,
  execute: 0,
  scatter: 0,
  spread: false,
};

/** Combine knob sets: multipliers multiply, counts add, flags OR, statuses union, the longer zone wins. */
export function mergeKnobs(...parts: Partial<Knobs>[]): Knobs {
  const k: Knobs = { ...NEUTRAL, applies: [] };
  for (const p of parts) {
    if (p.power !== undefined) k.power *= p.power;
    if (p.area !== undefined) k.area *= p.area;
    for (const s of p.applies ?? []) if (!k.applies.includes(s)) k.applies.push(s);
    k.chain += p.chain ?? 0;
    k.pierce ||= p.pierce ?? false;
    k.knockback += p.knockback ?? 0;
    k.lifesteal += p.lifesteal ?? 0;
    if (p.zone && (!k.zone || p.zone.seconds > k.zone.seconds)) k.zone = { ...p.zone };
    k.pull ||= p.pull ?? false;
    k.execute = Math.max(k.execute, p.execute ?? 0);
    k.scatter = Math.max(k.scatter, p.scatter ?? 0);
    k.spread ||= p.spread ?? false;
  }
  return k;
}

/** Compile a build into the numbers and knobs the combat code reads. */
export function resolveAbility(
  registry: DataRegistry,
  slot: AbilitySlot,
  build: AbilityBuild,
  stats: HeroStats,
): ResolvedAbility {
  const data = registry.getArpgData();
  const bal = registry.getDelveBalance();
  const ab = bal.abilities;
  const form = registry.getForm(build.form);
  if (form.slot !== slot) throw new Error(`${form.name} is not a ${slot} form`);
  const [element, second] = build.elements;
  const fusion =
    second && second !== element ? (registry.getFusion(element, second) ?? null) : null;
  const L = stats.legendaries;

  const legendary: Partial<Knobs>[] = [];
  if (L.stormcaller && build.elements.includes('storm'))
    legendary.push({ chain: Math.round(L.stormcaller) });
  if (L.bedrock && build.elements.includes('earth'))
    legendary.push({ area: 1.4, applies: ['stagger'] });
  if (L.rimeheart && build.form === 'nova' && build.elements.includes('frost')) {
    legendary.push({ zone: { seconds: 3, tickPower: 0.15 } });
  }
  const knobs = mergeKnobs(
    ...build.elements.map((e) => data.elementTraits[e].knobs),
    fusion?.knobs ?? {},
    ...legendary,
  );

  const w = build.weight;
  const W = ab.weight;
  const s = ab.slots[slot];
  const cast = build.payment === 'cast';
  const payPower = cast ? ab.castPowerMult : 1;
  const avgAttune =
    build.elements.reduce((sum, e) => sum + stats.attunement[e], 0) / build.elements.length;
  // Gear `<Element> Damage` applies per hit by damage element (hitMonster), not here.
  const attunePower = 1 + bal.mana.powerPerAttune * avgAttune;
  const manaCost = s.cost * (1 + W.cost * w) * (1 - (L.manaweaver ?? 0) / 100);
  const size = 1 + W.size * w;

  return {
    slot,
    build,
    form,
    name: `${fusion ? fusion.name : data.mana[element].name} ${form.name}`,
    icon: form.icon,
    element,
    elements: [...build.elements],
    fusion,
    power: form.power * (1 + W.power * w) * payPower * knobs.power * attunePower,
    effect: (form.effect ?? 0) * (1 + W.power * w) * payPower,
    cost: build.payment === 'charge' ? 0 : cast ? manaCost * ab.castManaMult : manaCost,
    cooldown:
      build.payment === 'charge'
        ? ab.chargeLockout
        : s.cooldown * (1 + W.cooldown * w) * stats.cooldownMult,
    castTime: cast ? s.castTime * (1 + W.castTime * w) : 0,
    chargeNeed: build.payment === 'charge' ? s.cost * (1 + W.cost * w) * ab.chargeRatio : 0,
    range: form.range ?? 0,
    radius: (form.radius ?? 0) * size * knobs.area,
    speed: (form.speed ?? 0) * (1 - W.speed * w),
    count: form.count ?? 1,
    duration: form.duration ?? 0,
    tick: form.tick ?? 0.5,
    arc: form.arc ?? 360,
    combo: form.combo ?? [1],
    comboCount: form.comboCount ?? null,
    knobs,
  };
}

/** Builds for a new (or migrated) profile, `element` being the weapon's. */
export function defaultAbilities(element: ManaType): AbilityBuilds {
  return {
    primary: { form: 'bolt', elements: [element], weight: 0, payment: 'mana' },
    defensive: { form: 'ward', elements: ['frost'], weight: 0, payment: 'mana' },
    ultimate: { form: 'nova', elements: [element], weight: 0, payment: 'charge' },
  };
}
