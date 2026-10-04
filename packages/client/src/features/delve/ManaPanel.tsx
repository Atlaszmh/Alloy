import { useState } from 'react';
import {
  GEAR_SLOTS,
  MANA_TYPES,
  bindSecondary,
  isDiveActive,
  overtakeProgress,
  profilePower,
  type HeroStats,
  type ManaType,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { Button, Chip, Glyph, Panel, Price } from '@/features/delve/kit';
import { AttunementBars } from './items/AttunementBars';
import { getDelveRegistry } from './registry';
import { formatNumber, manaStyle } from './format';

/**
 * The Mana view, in the Skills tab's right pane (its own pad scope: Back, Esc
 * or B return to the move): your primary and secondary with their attunement,
 * how near the secondary is to overtaking, your Mana Dust, and binding a
 * second element or realigning the pair (between dives only). The rules are
 * the engine's (`bindSecondary`, `realign`, `overtakeProgress`).
 */
export function ManaPanel({ stats, onBack }: { stats: HeroStats; onBack: () => void }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const [binding, setBinding] = useState<ManaType | null>(null);
  const [target, setTarget] = useState<{ primary?: ManaType; secondary?: ManaType }>({});
  const [message, setMessage] = useState<string | null>(null);
  const { primary, secondary } = profile.pair;
  const back = (
    <Button size="sm" onClick={onBack} data-pad-back testId="mana-back">
      Back
    </Button>
  );
  if (!primary)
    return (
      <Panel as="aside" title="Your mana" aside={back} data-pad-scope testId="mana-view">
        <AttunementBars stats={stats} />
      </Panel>
    );

  const cost = registry.getDelveBalance().pair;
  const locked = isDiveActive(profile);
  const style = (m: ManaType) => manaStyle(registry, m);
  const glyph = (m: ManaType) => <Glyph id={m} size={16} color={style(m).color} />;
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
  // The guided start's bind (see the tutorial spec) offers any element: its hero owns no other.
  const candidates = MANA_TYPES.filter(
    (m) => m !== primary && (owned.has(m) || profile.tutorial !== null),
  );
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
    <Panel as="aside" title="Your mana" aside={back} data-pad-scope testId="mana-view">
      <div className="flex flex-col gap-1 text-[16px]">
        <span
          className="flex items-center gap-2"
          data-testid="pair-primary"
          style={{ color: style(primary).color }}
        >
          {glyph(primary)} {style(primary).name} · primary: your blows and abilities use it, except
          where you pick your secondary
        </span>
        <span
          className="flex items-center gap-2"
          data-testid="pair-secondary"
          style={{ color: secondary ? style(secondary).color : 'var(--k-text-3)' }}
        >
          {secondary ? (
            <>
              {glyph(secondary)} {style(secondary).name} · secondary: your blows and abilities can
              use it
            </>
          ) : (
            'No second element yet'
          )}
        </span>
      </div>
      <AttunementBars stats={stats} elements={secondary ? [primary, secondary] : [primary]} />
      {secondary && (
        <div
          className="flex flex-col gap-1 text-[14px] text-[var(--k-text-3)]"
          data-testid="overtake"
        >
          <span>
            {style(secondary).name} {overtake.have} / {overtake.need.toFixed(1)} to overtake{' '}
            {style(primary).name} (checked when a dive ends)
          </span>
          <div className="k-well h-2 overflow-hidden">
            <div
              className="h-full"
              style={{
                width: `${overtake.ready ? 100 : overtake.need > 0 ? Math.min(0.99, overtake.have / overtake.need) * 100 : 0}%`,
                background: style(secondary).color,
              }}
              data-testid="overtake-bar"
            />
          </div>
        </div>
      )}
      <div className="text-[14px] text-[var(--k-text-2)]" data-testid="mana-dust">
        <Price dust={profile.manaDust} /> · from salvaging gear outside your pair
      </div>
      {locked && (
        <div
          className="k-well p-2 text-center text-[14px] text-[var(--k-hot)]"
          data-testid="pair-locked"
        >
          A dive is under way: bind and realign between dives.
        </div>
      )}
      {!secondary && (
        <div className="flex flex-col gap-2" data-testid="bind-section" data-tutorial="mana.bind">
          <div className="text-[14px] text-[var(--k-text-3)]">
            Bind a second element: your moves and blows can use it, and your chains keep the ones
            they have (add the element in the chain builder). Power now{' '}
            {formatNumber(profilePower(registry, profile))}.
          </div>
          {candidates.length === 0 ? (
            <div className="text-[14px] text-[var(--k-text-3)]">
              Find gear of another element to bind it.
            </div>
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
                  {glyph(m)} {style(m).name} · Power {formatNumber(boundPower(m))}
                </Chip>
              ))}
            </div>
          )}
          {binding && !locked && (
            <div
              className="flex flex-wrap items-center gap-2 text-[14px]"
              data-testid="mana-bind-ask"
            >
              <span>Bind {style(binding).name}? After that, only a Realign changes it.</span>
              <Button
                variant="primary"
                size="sm"
                onClick={() => onBind(binding)}
                testId="mana-bind-confirm"
              >
                Bind
              </Button>
              <Button size="sm" onClick={() => setBinding(null)} testId="mana-bind-cancel">
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}
      {next && (
        <div className="flex flex-col gap-2" data-testid="realign-section">
          <div className="text-[14px] text-[var(--k-text-3)]">
            Realign: change your pair for{' '}
            <Price dust={cost.realignDust} scrap={cost.realignScrap} />. Gear stays as it is; your
            equipped weapon's moves and blows follow the new pair.
          </div>
          {(['primary', 'secondary'] as const).map((role) => (
            <div key={role} className="flex flex-wrap items-center gap-1.5">
              <span className="w-24 text-[14px] text-[var(--k-text-3)]">
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
                  aria-label={style(m).name}
                  title={style(m).name}
                  testId={`realign-${role}-${m}`}
                >
                  {glyph(m)}
                </Chip>
              ))}
            </div>
          ))}
          <Button
            variant="primary"
            disabled={locked || !changed}
            onClick={onRealign}
            testId="realign-button"
          >
            Realign · <Price dust={cost.realignDust} scrap={cost.realignScrap} />
          </Button>
        </div>
      )}
      {message && (
        <div className="text-[14px] font-semibold text-[var(--k-bad-text)]" role="status">
          {message}
        </div>
      )}
    </Panel>
  );
}
