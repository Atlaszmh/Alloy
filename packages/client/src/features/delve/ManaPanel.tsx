import { useState } from 'react';
import {
  GEAR_SLOTS,
  MANA_TYPES,
  basicLoadout,
  bindSecondary,
  isDefaultBasic,
  isDiveActive,
  overtakeProgress,
  profilePower,
  type HeroStats,
  type ManaType,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { AttunementBars, Chip } from './AbilitiesPanel';
import { getDelveRegistry } from './registry';
import { formatNumber, manaStyle } from './format';

/**
 * The Anvil's Mana view: your primary and secondary with their attunement, how
 * near the secondary is to overtaking, your Mana Dust, and binding a second
 * element or realigning the pair (between dives only). The rules are the
 * engine's (`bindSecondary`, `realign`, `overtakeProgress`).
 */
export function ManaPanel({ stats }: { stats: HeroStats }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const [binding, setBinding] = useState<ManaType | null>(null);
  const [target, setTarget] = useState<{ primary?: ManaType; secondary?: ManaType }>({});
  const [message, setMessage] = useState<string | null>(null);
  const { primary, secondary } = profile.pair;
  if (!primary) return <AttunementBars stats={stats} />;

  const cost = registry.getDelveBalance().pair;
  const locked = isDiveActive(profile);
  const style = (m: ManaType) => manaStyle(registry, m);
  // The Power once `m` is bound: mid-dive too (binding refuses then), at the dive's depth.
  const boundPower = (m: ManaType) =>
    profilePower(registry, {
      ...bindSecondary(registry, { ...profile, dive: null }, m).profile,
      dive: profile.dive,
    });
  const owned = new Set<ManaType>([
    ...GEAR_SLOTS.flatMap((s) => profile.equipped[s]?.mana ?? []),
    ...profile.bag.map((i) => i.mana),
  ]);
  const candidates = MANA_TYPES.filter((m) => m !== primary && owned.has(m));
  const overtake = overtakeProgress(registry, profile);
  // Realign always sends both elements: the engine refuses a lone primary equal to the secondary.
  const next = secondary
    ? { primary: target.primary ?? primary, secondary: target.secondary ?? secondary }
    : null;
  const changed =
    !!next &&
    next.primary !== next.secondary &&
    (next.primary !== primary || next.secondary !== secondary);

  const onBind = (mana: ManaType) => {
    const res = useDelveStore.getState().bindSecondary(mana);
    setBinding(null);
    playSound(res.ok ? 'upgradeTier' : 'combineFail');
    setMessage(res.ok ? null : (res.reason ?? 'Cannot bind'));
  };
  const onRealign = () => {
    if (!next) return;
    const res = useDelveStore.getState().realign(next);
    playSound(res.ok ? 'upgradeTier' : 'combineFail');
    setMessage(res.ok ? null : (res.reason ?? 'Cannot realign'));
    if (res.ok) setTarget({});
  };

  return (
    <section className="flex flex-col gap-2" data-testid="mana-view">
      <div className="delve-display text-xs font-bold uppercase tracking-widest text-amber-300/80">
        Your mana
      </div>
      <div className="flex flex-col gap-0.5 text-sm">
        <span data-testid="pair-primary" style={{ color: style(primary).color }}>
          {style(primary).icon} {style(primary).name} · primary: your blows and abilities use it,
          except where you pick your secondary
        </span>
        <span
          data-testid="pair-secondary"
          style={{ color: secondary ? style(secondary).color : '#78716c' }}
        >
          {secondary
            ? `${style(secondary).icon} ${style(secondary).name} · secondary: your blows and abilities can use it`
            : 'No second element yet'}
        </span>
      </div>
      <AttunementBars stats={stats} elements={secondary ? [primary, secondary] : [primary]} />
      {secondary && (
        <div className="flex flex-col gap-1 text-xs text-stone-400" data-testid="overtake">
          <span>
            {style(secondary).name} {overtake.have} / {overtake.need.toFixed(1)} to overtake{' '}
            {style(primary).name} (checked when a dive ends)
          </span>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full"
              style={{
                width: `${overtake.ready ? 100 : overtake.need > 0 ? Math.min(0.99, overtake.have / overtake.need) * 100 : 0}%`,
                background: style(secondary).color,
              }}
              data-testid="overtake-bar"
            />
          </div>
        </div>
      )}
      <div className="text-xs text-stone-300" data-testid="mana-dust">
        ✦ {formatNumber(profile.manaDust)} Mana Dust · from salvaging gear outside your pair
      </div>
      {locked && (
        <div
          className="delve-panel p-2 text-center text-xs text-amber-200"
          data-testid="pair-locked"
        >
          A dive is under way: bind and realign between dives.
        </div>
      )}
      {!secondary && (
        <div className="flex flex-col gap-1.5" data-testid="bind-section">
          <div className="text-xs text-stone-400">
            {isDefaultBasic(registry, profile.chains.basic, basicLoadout(profile)!)
              ? "Bind a second element: your basic chain's last blow strikes with it and your abilities can use it."
              : 'Bind a second element: your abilities can use it, and your basic chain keeps the blows you built (add the element on the Basic tab).'}{' '}
            Power now {formatNumber(profilePower(registry, profile))}.
          </div>
          {candidates.length === 0 ? (
            <div className="text-xs text-stone-500">Find gear of another element to bind it.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {candidates.map((m) => (
                <Chip
                  key={m}
                  pressed={binding === m}
                  disabled={locked}
                  onClick={() => setBinding(m)}
                  testId={`mana-bind-${m}`}
                >
                  {style(m).icon} {style(m).name} · Power {formatNumber(boundPower(m))}
                </Chip>
              ))}
            </div>
          )}
          {binding && !locked && (
            <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="mana-bind-ask">
              <span className="text-stone-300">
                Bind {style(binding).name}? After that, only a Realign changes it.
              </span>
              <button
                type="button"
                className="delve-btn delve-btn-gold px-2.5 py-1 text-xs"
                onClick={() => onBind(binding)}
                data-testid="mana-bind-confirm"
              >
                Bind
              </button>
              <button
                type="button"
                className="delve-btn px-2.5 py-1 text-xs"
                onClick={() => setBinding(null)}
                data-testid="mana-bind-cancel"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
      {next && (
        <div className="flex flex-col gap-1.5" data-testid="realign-section">
          <div className="text-xs text-stone-400">
            Realign: change your pair for ✦ {cost.realignDust} Mana Dust and ⚙ {cost.realignScrap}{' '}
            scrap. Gear stays as it is; abilities follow the new pair.
          </div>
          {(['primary', 'secondary'] as const).map((role) => (
            <div key={role} className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 text-[11px] text-stone-500">
                {role === 'primary' ? 'Primary' : 'Secondary'}
              </span>
              {MANA_TYPES.map((m) => (
                <Chip
                  key={m}
                  pressed={next[role] === m}
                  disabled={locked}
                  onClick={() =>
                    setTarget(
                      role === 'primary' ? { ...next, primary: m } : { ...next, secondary: m },
                    )
                  }
                  testId={`realign-${role}-${m}`}
                  title={style(m).name}
                >
                  {style(m).icon}
                </Chip>
              ))}
            </div>
          ))}
          <button
            type="button"
            className="delve-btn delve-btn-gold text-sm"
            disabled={locked || !changed}
            onClick={onRealign}
            data-testid="realign-button"
          >
            Realign · ✦ {cost.realignDust} · ⚙ {cost.realignScrap}
          </button>
        </div>
      )}
      {message && (
        <div className="text-xs font-semibold text-red-300" role="status">
          {message}
        </div>
      )}
    </section>
  );
}
