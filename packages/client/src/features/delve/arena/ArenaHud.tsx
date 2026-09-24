import { forwardRef } from 'react';
import { MANA_TYPES, type BiomeDef, type DiveState } from '@alloy/engine';
import { getDelveRegistry } from '../registry';
import { formatNumber, manaStyle } from '../format';
import type { ArenaHud } from './useArena';

const KEY_HINTS = ['Q', 'E', 'R'];

function hpGradient(frac: number): string {
  if (frac > 0.6) return 'linear-gradient(180deg,#4ade80,#16a34a)';
  if (frac > 0.3) return 'linear-gradient(180deg,#facc15,#ca8a04)';
  return 'linear-gradient(180deg,#f87171,#b91c1c)';
}

export const TopHud = forwardRef<
  HTMLDivElement,
  { dive: DiveState; biome: BiomeDef; hud: ArenaHud | null; onMenu: () => void }
>(function TopHud({ dive, biome, hud, onMenu }, ref) {
  const registry = getDelveRegistry();
  const own = manaStyle(registry, biome.mana);
  const weak = manaStyle(registry, registry.getArpgData().weakness[biome.mana]);
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-2"
      style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.75), rgba(0,0,0,0))' }}
    >
      <div className="mx-auto flex max-w-[640px] items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="delve-display text-2xl font-bold leading-none" data-testid="depth-label">
            DEPTH {dive.depth}
          </div>
          <div
            className="delve-display text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: biome.accent }}
          >
            {biome.name}
            {dive.door && dive.door.id !== 'winding' ? ` · ${dive.door.name}` : ''}
          </div>
          <div className="mt-0.5 text-[10px] text-stone-300" data-testid="biome-element">
            Resists {own.icon} · weak to {weak.icon} {weak.name}
          </div>
        </div>
        {hud && (
          <div className="flex flex-col items-center" data-testid="monsters-left">
            <span className="delve-display text-lg font-bold leading-none text-stone-100">
              {hud.cleared ? '✓' : hud.monstersLeft}
            </span>
            <span className="text-[9px] uppercase tracking-widest text-stone-400">
              {hud.cleared ? 'clear' : 'foes'}
            </span>
          </div>
        )}
        <div className="flex flex-col items-end">
          <span className="delve-display text-base font-bold text-amber-300" data-testid="bounty">
            ⚙ {formatNumber(dive.bounty)}
          </span>
          <span className="text-[9px] uppercase tracking-widest text-stone-400">bounty</span>
        </div>
        <button
          className="delve-btn pointer-events-auto ml-1 px-2.5 py-1.5 text-sm"
          aria-label="Dive menu"
          onClick={onMenu}
        >
          ⋯
        </button>
      </div>
    </div>
  );
});

export function BossBar({ hud }: { hud: ArenaHud | null }) {
  if (!hud?.boss) return null;
  const { boss } = hud;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-[74px] z-20 px-6"
      data-testid="boss-bar"
    >
      <div className="mx-auto max-w-[420px]">
        <div className="delve-display mb-0.5 text-center text-sm font-bold tracking-wider text-red-300">
          {boss.icon} {boss.name}
        </div>
        <div className="delve-hpbar" style={{ height: 12 }}>
          <div
            className="fill"
            style={{
              width: `${(boss.hp / boss.maxHp) * 100}%`,
              background: 'linear-gradient(180deg,#ef4444,#7f1d1d)',
            }}
          />
          <div className="text">
            {formatNumber(Math.max(0, boss.hp))} / {formatNumber(boss.maxHp)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Vitals({ hud }: { hud: ArenaHud | null }) {
  const registry = getDelveRegistry();
  if (!hud) return null;
  const frac = hud.hp / Math.max(1, hud.maxHp);
  const pools = MANA_TYPES.filter((m) => hud.manaMax[m] > 0);
  return (
    <div className="flex flex-col gap-1">
      <div className={`delve-hpbar ${frac < 0.3 ? 'animate-pulse' : ''}`} data-testid="hero-hp">
        <div className="fill" style={{ width: `${frac * 100}%`, background: hpGradient(frac) }} />
        <div className="text">
          {formatNumber(Math.max(0, hud.hp))} / {formatNumber(hud.maxHp)}
        </div>
      </div>
      <div className="flex gap-1" data-testid="mana-pools">
        {pools.map((m) => {
          const style = manaStyle(registry, m);
          const pct = (hud.mana[m] / hud.manaMax[m]) * 100;
          return (
            <div key={m} className="flex flex-1 items-center gap-1" data-mana={m}>
              <span className="text-[11px] leading-none">{style.icon}</span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-black/60">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: style.color,
                    boxShadow: `0 0 6px ${style.color}`,
                    transition: 'width 0.1s linear',
                  }}
                />
              </div>
            </div>
          );
        })}
        {pools.length === 0 && (
          <span className="text-[10px] text-stone-500">
            No mana: equip attuned gear to cast spells
          </span>
        )}
      </div>
    </div>
  );
}

export function SkillBar({
  hud,
  onCast,
  onPotion,
  showKeys,
}: {
  hud: ArenaHud | null;
  onCast: (slot: number) => void;
  onPotion: () => void;
  showKeys: boolean;
}) {
  const registry = getDelveRegistry();
  return (
    <div className="flex items-end justify-center gap-2.5">
      <button
        type="button"
        className="delve-btn relative flex h-14 w-14 flex-col items-center justify-center p-0"
        onClick={onPotion}
        disabled={!hud || hud.potions <= 0}
        aria-label="Drink potion"
        data-testid="potion-button"
      >
        <span className="text-xl leading-none">🧪</span>
        <span className="delve-display text-xs">×{hud?.potions ?? 0}</span>
        {showKeys && (
          <span className="absolute -top-1.5 right-0.5 text-[9px] text-stone-400">F</span>
        )}
      </button>
      {(hud?.slots ?? [null, null, null]).map((slot, i) => {
        const skill = slot?.skillId ? registry.getSkill(slot.skillId) : null;
        if (!skill || !slot) {
          return (
            <div
              key={i}
              className="flex h-[68px] w-[68px] items-center justify-center rounded-full border border-dashed border-white/15 text-[10px] text-stone-600"
              data-testid={`skill-${i}`}
            >
              empty
            </div>
          );
        }
        const color = manaStyle(registry, skill.elements[0]).color;
        const color2 = manaStyle(registry, skill.elements[skill.elements.length - 1]).color;
        const cooling = slot.cooldown > 0.05;
        const cdFrac = cooling && slot.cooldownTotal > 0 ? slot.cooldown / slot.cooldownTotal : 0;
        const ready = !cooling && slot.affordable;
        return (
          <button
            key={i}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              onCast(i);
            }}
            aria-label={skill.name}
            data-testid={`skill-${i}`}
            data-ready={ready}
            className="relative h-[68px] w-[68px] rounded-full border-0 p-[3px]"
            style={{
              background: `linear-gradient(135deg, ${color}, ${color2})`,
              boxShadow: ready ? `0 0 16px ${color}aa` : 'none',
              opacity: slot.affordable ? 1 : 0.55,
              touchAction: 'none',
            }}
          >
            <span
              className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-full"
              style={{ background: 'radial-gradient(circle at 50% 35%, #2c2c3c, #121219)' }}
            >
              <span className="text-2xl leading-none">{skill.icon}</span>
              {cdFrac > 0 && (
                <span
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `conic-gradient(rgba(0,0,0,0.72) ${cdFrac * 360}deg, transparent 0deg)`,
                  }}
                />
              )}
              {cooling && (
                <span className="delve-display absolute text-base font-bold text-white">
                  {slot.cooldown >= 10 ? Math.ceil(slot.cooldown) : slot.cooldown.toFixed(1)}
                </span>
              )}
              {!slot.affordable && !cooling && (
                <span className="absolute bottom-1.5 text-[8px] font-bold uppercase tracking-wide text-red-300">
                  mana
                </span>
              )}
            </span>
            {showKeys && (
              <span className="absolute -top-1 right-0 rounded bg-black/70 px-1 text-[9px] text-stone-300">
                {KEY_HINTS[i]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
