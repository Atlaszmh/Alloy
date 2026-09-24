import { useMemo, useState } from 'react';
import {
  MANA_TYPES,
  SKILL_SLOT_COUNT,
  computeHeroStats,
  isSkillUnlocked,
  manaPools,
  skillCost,
  type ManaMap,
  type ManaType,
  type SkillDef,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { getDelveRegistry } from './registry';
import { manaStyle } from './format';

const KEY_HINTS = ['Q', 'E', 'R'];

/** Attunement per mana type with its 1 / 3 / 10 thresholds. */
export function AttunementBars({ attunement }: { attunement: ManaMap }) {
  const registry = getDelveRegistry();
  const bal = registry.getDelveBalance().mana;
  const masteries = registry.getArpgData().masteries;
  const scale = Math.max(bal.masteryThreshold + 2, ...MANA_TYPES.map((m) => attunement[m] + 1));
  const stats = useDelveStore((s) => s.profile.equipped);
  const pools = useMemo(
    () => manaPools(computeHeroStats(stats, registry), registry),
    [stats, registry],
  );

  return (
    <div className="flex flex-col gap-2">
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
                {[1, bal.comboThreshold, bal.masteryThreshold].map((t) => (
                  <span
                    key={t}
                    className="absolute -top-0.5 h-3.5 w-0.5 rounded"
                    style={{
                      left: `${(t / scale) * 100}%`,
                      background: a >= t ? '#fff' : 'rgba(255,255,255,0.25)',
                    }}
                  />
                ))}
              </div>
              <span className="delve-display w-6 text-right text-sm font-bold text-stone-100">
                {a}
              </span>
            </div>
            <div className="pl-7 text-[10px] leading-snug text-stone-500">
              {a > 0 && (
                <span className="text-stone-400">
                  {Math.round(pools.max[m])} mana · +{pools.regen[m].toFixed(1)}/s ·{' '}
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

function ElementIcons({ elements }: { elements: ManaType[] }) {
  const registry = getDelveRegistry();
  return (
    <span className="inline-flex gap-0.5">
      {elements.map((e) => (
        <span key={e}>{manaStyle(registry, e).icon}</span>
      ))}
    </span>
  );
}

function SpellCard({
  skill,
  unlocked,
  slotted,
  attunement,
  onPick,
}: {
  skill: SkillDef;
  unlocked: boolean;
  slotted: number;
  attunement: ManaMap;
  onPick: () => void;
}) {
  const registry = getDelveRegistry();
  const bal = registry.getDelveBalance().mana;
  const need = skill.elements.length > 1 ? bal.comboThreshold : 1;
  const c1 = manaStyle(registry, skill.elements[0]).color;
  const c2 = manaStyle(registry, skill.elements[skill.elements.length - 1]).color;
  const cost = Object.entries(skill.cost) as [ManaType, number][];
  return (
    <button
      type="button"
      className="delve-panel flex w-full items-start gap-2.5 p-2 text-left"
      style={{
        opacity: unlocked ? 1 : 0.5,
        borderColor: slotted >= 0 ? c1 : undefined,
        boxShadow: slotted >= 0 ? `0 0 10px ${c1}44` : undefined,
      }}
      onClick={onPick}
      disabled={!unlocked}
      data-testid={`spell-${skill.id}`}
      data-locked={!unlocked}
    >
      <span
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full p-[2px]"
        style={{
          background: unlocked ? `linear-gradient(135deg, ${c1}, ${c2})` : 'rgba(255,255,255,0.1)',
        }}
      >
        <span className="flex h-full w-full items-center justify-center rounded-full bg-[#15151e] text-xl">
          {unlocked ? skill.icon : '🔒'}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="delve-display truncate text-sm font-bold text-stone-100">
            {skill.name}
          </span>
          <span className="text-[11px]">
            <ElementIcons elements={skill.elements} />
          </span>
          {slotted >= 0 && (
            <span className="ml-auto rounded bg-white/10 px-1 text-[9px] font-bold text-stone-200">
              SLOT {KEY_HINTS[slotted]}
            </span>
          )}
        </span>
        <span className="block text-[11px] leading-snug text-stone-400">{skill.text}</span>
        <span className="mt-0.5 block text-[10px] text-stone-500">
          {unlocked ? (
            <>
              {cost.map(([m, v]) => `${Math.round(v)} ${manaStyle(registry, m).icon}`).join(' + ')}{' '}
              · {skill.cooldown}s cooldown
            </>
          ) : (
            <>
              Needs{' '}
              {skill.elements
                .map(
                  (e) => `${manaStyle(registry, e).icon} ${Math.min(attunement[e], need)}/${need}`,
                )
                .join('  ')}{' '}
              attunement
            </>
          )}
        </span>
      </span>
    </button>
  );
}

/**
 * The hero's magic: attunement from gear, the 3-slot spell bar, every spell
 * (locked ones show what they need) and the reactions found so far.
 */
export function SpellbookPanel() {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const arpg = registry.getArpgData();
  const stats = useMemo(
    () => computeHeroStats(profile.equipped, registry),
    [profile.equipped, registry],
  );
  const attunement = stats.attunement;
  const [slot, setSlot] = useState(() => {
    const empty = profile.skillSlots.indexOf(null);
    return empty >= 0 ? empty : 0;
  });

  const signature = arpg.skills.filter((s) => s.elements.length === 1);
  const combos = arpg.skills.filter((s) => s.elements.length > 1);
  const unlockedCount = arpg.skills.filter((s) => isSkillUnlocked(s, attunement, registry)).length;

  const pick = (skill: SkillDef) => {
    useDelveStore.getState().setSkillSlot(slot, skill.id);
    playSound('orbPlace');
    setSlot((slot + 1) % SKILL_SLOT_COUNT);
  };

  const card = (s: SkillDef) => (
    <SpellCard
      key={s.id}
      skill={s}
      unlocked={isSkillUnlocked(s, attunement, registry)}
      slotted={profile.skillSlots.indexOf(s.id)}
      attunement={attunement}
      onPick={() => pick(s)}
    />
  );

  return (
    <div className="flex flex-col gap-4" data-testid="spellbook-panel">
      <section className="delve-panel p-3">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="delve-display text-sm font-bold uppercase tracking-widest text-violet-300">
            Mana attunement
          </span>
          <span className="text-[10px] text-stone-500">from equipped gear</span>
        </div>
        <AttunementBars attunement={attunement} />
        <p className="mt-2 text-[10.5px] leading-snug text-stone-500">
          Every item carries a mana. Equip it to attune: <b className="text-stone-300">1</b> unlocks
          that element's spell,{' '}
          <b className="text-stone-300">{registry.getDelveBalance().mana.comboThreshold}</b> in two
          elements unlocks their combo,{' '}
          <b className="text-stone-300">{registry.getDelveBalance().mana.masteryThreshold}</b>{' '}
          grants mastery.
        </p>
      </section>

      <section>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="delve-display text-sm font-bold uppercase tracking-widest text-stone-300">
            Spell bar
          </span>
          <span className="text-[10px] text-stone-500">Tap a slot, then a spell</span>
        </div>
        <div className="flex justify-center gap-3">
          {profile.skillSlots.map((id, i) => {
            const skill = id ? registry.findSkill(id) : undefined;
            const live = skill && isSkillUnlocked(skill, attunement, registry);
            const color = skill ? manaStyle(registry, skill.elements[0]).color : '#444';
            const cost = skill ? skillCost(skill, stats) : {};
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSlot(i)}
                aria-pressed={slot === i}
                className="flex w-24 flex-col items-center gap-1 rounded-xl p-1.5"
                style={{
                  background: slot === i ? 'rgba(212,168,52,0.14)' : 'transparent',
                  outline: slot === i ? '1.5px solid #d4a834' : '1px dashed rgba(255,255,255,0.12)',
                }}
                data-testid={`spell-slot-${i}`}
                data-skill={id ?? ''}
              >
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-full text-2xl"
                  style={{
                    background: skill
                      ? `radial-gradient(circle at 50% 35%, #2c2c3c, #121219)`
                      : 'rgba(255,255,255,0.03)',
                    boxShadow: skill ? `0 0 0 3px ${color}, 0 0 14px ${color}66` : undefined,
                    opacity: skill && !live ? 0.4 : 1,
                  }}
                >
                  {skill ? skill.icon : ''}
                </span>
                <span className="delve-display truncate text-[11px] font-bold text-stone-200">
                  {skill ? skill.name : 'Empty'}
                </span>
                <span className="text-[9px] text-stone-500">
                  {KEY_HINTS[i]}
                  {skill && !live && ' · locked'}
                  {skill &&
                    live &&
                    ` · ${Object.values(cost)
                      .map((v) => Math.round(v as number))
                      .join('+')} mana`}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="delve-display text-sm font-bold uppercase tracking-widest text-stone-300">
            Spells
          </span>
          <span className="text-[10px] text-stone-500">
            {unlockedCount}/{arpg.skills.length} unlocked
          </span>
        </div>
        <div className="text-[10px] uppercase tracking-widest text-stone-500">Signature</div>
        {signature.map(card)}
        <div className="mt-1 text-[10px] uppercase tracking-widest text-stone-500">
          Combos · two elements
        </div>
        {combos.map(card)}
      </section>

      <section className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="delve-display text-sm font-bold uppercase tracking-widest text-fuchsia-300">
            Reactions
          </span>
          <span className="text-[10px] text-stone-500">
            {profile.reactionsSeen.length}/{arpg.reactions.length} discovered
          </span>
        </div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {arpg.reactions.map((r) => {
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
