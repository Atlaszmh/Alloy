import { forwardRef, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { BiomeDef, DiveState, Vec } from '@alloy/engine';
import { getDelveRegistry } from '../registry';
import { formatNumber, manaStyle } from '../format';
import { classifyPress, isCancelled } from './aim-gestures';
import type { AbilityHud, ArenaHud } from './useArena';

/** Button labels for the keyboard or a controller (Hades-style layout). */
export interface ButtonHints {
  abilities: [string, string, string];
  dodge: string;
  potion: string;
  attack: string;
}
export const KEYBOARD_HINTS: ButtonHints = {
  abilities: ['Q', 'E', 'R'],
  dodge: 'Space',
  potion: 'F',
  attack: 'Click',
};
export const PAD_HINTS: ButtonHints = {
  abilities: ['X', 'B', 'Y'],
  dodge: 'A',
  potion: 'LB',
  attack: 'RT',
};

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
          data-pad-menu
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
  if (!hud) return null;
  const frac = hud.hp / Math.max(1, hud.maxHp);
  const mana = hud.mana / Math.max(1, hud.manaMax);
  return (
    <div className="flex flex-col gap-1">
      <div className={`delve-hpbar ${frac < 0.3 ? 'animate-pulse' : ''}`} data-testid="hero-hp">
        <div className="fill" style={{ width: `${frac * 100}%`, background: hpGradient(frac) }} />
        <div className="text">
          {formatNumber(Math.max(0, hud.hp))} / {formatNumber(hud.maxHp)}
        </div>
      </div>
      <div
        className="relative h-2.5 overflow-hidden rounded-full bg-black/60"
        data-testid="mana-bar"
        aria-label={`Mana ${Math.floor(hud.mana)} of ${Math.round(hud.manaMax)}`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${mana * 100}%`,
            background: 'linear-gradient(90deg,#60a5fa,#a78bfa)',
            boxShadow: '0 0 6px #818cf8',
            transition: 'width 0.1s linear',
          }}
        />
      </div>
    </div>
  );
}

const SLOT_LABEL = ['Primary', 'Defensive', 'Ultimate'];

/**
 * One ability button. A quick tap auto-aims; dragging out shows the aim
 * marker in the arena and releasing casts there (release back on the button
 * to cancel).
 */
function AbilityButton({
  slot,
  ab,
  busy,
  hint,
  onCast,
  onAim,
}: {
  slot: number;
  ab: AbilityHud;
  busy: boolean;
  hint?: string;
  onCast: (slot: number, aim?: Vec | null) => void;
  onAim: (slot: number | null, at?: Vec) => void;
}) {
  const registry = getDelveRegistry();
  const press = useRef<{ id: number; t: number; x: number; y: number } | null>(null);
  const color = manaStyle(registry, ab.elements[0]).color;
  const color2 = manaStyle(registry, ab.elements[ab.elements.length - 1]).color;
  const cooling = ab.cooldown > 0.05;
  const cdFrac = cooling ? Math.min(1, ab.cooldown / ab.cooldownTotal) : 0;
  const size = slot === 2 ? 72 : 64;

  const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    press.current = { id: e.pointerId, t: performance.now(), x: e.clientX, y: e.clientY };
    onAim(slot, { x: e.clientX, y: e.clientY });
  };
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (press.current?.id === e.pointerId) onAim(slot, { x: e.clientX, y: e.clientY });
  };
  const up = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    press.current = null;
    onAim(null);
    const drag = Math.hypot(e.clientX - p.x, e.clientY - p.y);
    if (classifyPress(performance.now() - p.t, drag) === 'tap') return onCast(slot);
    const r = e.currentTarget.getBoundingClientRect();
    const button = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
    if (!isCancelled({ x: e.clientX, y: e.clientY }, button))
      onCast(slot, { x: e.clientX, y: e.clientY });
  };
  const cancel = () => {
    press.current = null;
    onAim(null);
  };

  return (
    <button
      type="button"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      aria-label={`${SLOT_LABEL[slot]}: ${ab.name}`}
      data-testid={`ability-${slot}`}
      data-ready={ab.ready}
      className="relative rounded-full border-0 p-[3px]"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${color}, ${color2})`,
        boxShadow: ab.ready ? `0 0 16px ${color}aa` : 'none',
        opacity: busy && ab.windup === null ? 0.5 : ab.affordable ? 1 : 0.55,
        touchAction: 'none',
      }}
    >
      <span
        className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-full"
        style={{ background: 'radial-gradient(circle at 50% 35%, #2c2c3c, #121219)' }}
      >
        <span className="text-2xl leading-none">{ab.icon}</span>
        {ab.charge !== null && ab.charge < 1 && (
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(transparent ${ab.charge * 360}deg, rgba(0,0,0,0.62) 0deg)`,
            }}
          />
        )}
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
            {ab.cooldown >= 10 ? Math.ceil(ab.cooldown) : ab.cooldown.toFixed(1)}
          </span>
        )}
        {!ab.affordable && !cooling && (
          <span className="absolute bottom-1.5 text-[8px] font-bold uppercase tracking-wide text-red-300">
            mana
          </span>
        )}
        {ab.charge !== null && ab.charge < 1 && !cooling && (
          <span className="delve-display absolute bottom-1 text-[10px] font-bold text-stone-200">
            {Math.floor(ab.charge * 100)}%
          </span>
        )}
      </span>
      {ab.comboLength > 1 && (
        <span className="absolute -bottom-1.5 left-1/2 flex -translate-x-1/2 gap-0.5" aria-hidden>
          {Array.from({ length: ab.comboLength }, (_, k) => (
            <span
              key={k}
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: k === ab.comboNext ? color : 'rgba(255,255,255,0.25)' }}
            />
          ))}
        </span>
      )}
      {ab.windup !== null && (
        <span className="absolute -top-2 left-1 right-1 h-1 overflow-hidden rounded-full bg-black/70">
          <span
            className="block h-full"
            style={{ width: `${ab.windup * 100}%`, background: color }}
          />
        </span>
      )}
      {hint && (
        <span className="absolute -top-1 right-0 rounded bg-black/70 px-1 text-[9px] text-stone-300">
          {hint}
        </span>
      )}
    </button>
  );
}

/**
 * Manual basic attacks on phones: hold to keep attacking, tap for one. Pips
 * show which hit of the melee combo comes next.
 */
export function AttackButton({
  hud,
  onAttack,
  hint,
}: {
  hud: ArenaHud | null;
  onAttack: (held: boolean) => void;
  hint?: string;
}) {
  const release = () => onAttack(false);
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already gone */
        }
        onAttack(true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      aria-label="Attack"
      data-testid="attack-button"
      className="relative h-[76px] w-[76px] rounded-full border-0 p-[3px]"
      style={{ background: 'linear-gradient(135deg,#e7e5e4,#a8a29e)', touchAction: 'none' }}
    >
      <span
        className="flex h-full w-full items-center justify-center rounded-full text-3xl"
        style={{ background: 'radial-gradient(circle at 50% 35%, #2c2c3c, #121219)' }}
      >
        ⚔️
      </span>
      {hint && (
        <span className="absolute -top-1 right-0 rounded bg-black/70 px-1 text-[9px] text-stone-300">
          {hint}
        </span>
      )}
      {hud?.melee && (
        <span className="absolute -bottom-1.5 left-1/2 flex -translate-x-1/2 gap-0.5" aria-hidden>
          {[0, 1, 2].map((k) => (
            <span
              key={k}
              data-combo={k === hud.basicComboNext ? 'next' : 'step'}
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: k === hud.basicComboNext ? '#fde047' : 'rgba(255,255,255,0.25)',
              }}
            />
          ))}
        </span>
      )}
    </button>
  );
}

/** Dodge: a pip per charge, an arc refilling the next one, a glow while the riposte is armed. */
function DodgeButton({
  hud,
  hint,
  onDodge,
}: {
  hud: ArenaHud | null;
  hint?: string;
  onDodge: () => void;
}) {
  const charges = hud?.dodgeCharges ?? 0;
  const max = hud?.dodgeMax ?? 2;
  const refilling = charges < max ? (hud?.dodgeRefill ?? 0) : 0;
  const riposte = !!hud?.riposte;
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        onDodge();
      }}
      aria-label="Dodge"
      data-testid="dodge-button"
      data-charges={charges}
      data-riposte={riposte}
      className="relative h-14 w-14 rounded-full border-0 p-[3px]"
      style={{
        background: refilling
          ? `conic-gradient(#e7e5e4 ${refilling * 360}deg, rgba(255,255,255,0.12) 0deg)`
          : charges > 0
            ? '#e7e5e4'
            : 'rgba(255,255,255,0.12)',
        boxShadow: riposte ? '0 0 18px #fde047, 0 0 6px #fde047' : 'none',
        opacity: charges > 0 ? 1 : 0.55,
        touchAction: 'none',
      }}
    >
      <span
        className="flex h-full w-full items-center justify-center rounded-full text-xl"
        style={{ background: 'radial-gradient(circle at 50% 35%, #2c2c3c, #121219)' }}
      >
        💨
      </span>
      <span className="absolute -bottom-1.5 left-1/2 flex -translate-x-1/2 gap-0.5" aria-hidden>
        {Array.from({ length: max }, (_, k) => (
          <span
            key={k}
            data-pip={k < charges ? 'full' : 'empty'}
            className="h-1.5 w-2.5 rounded-full"
            style={{ background: k < charges ? '#e7e5e4' : 'rgba(255,255,255,0.2)' }}
          />
        ))}
      </span>
      {hint && (
        <span className="absolute -top-1 right-0 rounded bg-black/70 px-1 text-[9px] text-stone-300">
          {hint}
        </span>
      )}
    </button>
  );
}

export function SkillBar({
  hud,
  onCast,
  onAim,
  onPotion,
  onDodge,
  hints,
}: {
  hud: ArenaHud | null;
  onCast: (slot: number, aim?: Vec | null) => void;
  onAim: (slot: number | null, at?: Vec) => void;
  onPotion: () => void;
  onDodge: () => void;
  /** Button labels to show, or null (touch). */
  hints: ButtonHints | null;
}) {
  return (
    <div className="flex items-end justify-center gap-2" data-testid="skill-bar">
      <DodgeButton hud={hud} hint={hints?.dodge} onDodge={onDodge} />
      <button
        type="button"
        className="delve-btn relative flex h-12 w-12 flex-col items-center justify-center p-0"
        onClick={onPotion}
        disabled={!hud || hud.potions <= 0}
        aria-label="Drink potion"
        data-testid="potion-button"
      >
        <span className="text-xl leading-none">🧪</span>
        <span className="delve-display text-xs">×{hud?.potions ?? 0}</span>
        {hints && (
          <span className="absolute -top-1.5 right-0.5 text-[9px] text-stone-400">
            {hints.potion}
          </span>
        )}
      </button>
      {hud?.abilities.map((ab, i) => (
        <AbilityButton
          key={i}
          slot={i}
          ab={ab}
          busy={hud.busy}
          hint={hints?.abilities[i]}
          onCast={onCast}
          onAim={onAim}
        />
      ))}
    </div>
  );
}
