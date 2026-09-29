import { forwardRef, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { BiomeDef, DiveState, Vec } from '@alloy/engine';
import { getDelveRegistry } from '../registry';
import { formatNumber, manaStyle } from '../format';
import { KIND_ICON, moveText } from '../chains/chain-text';
import { DRAG_PX, classifyPress, isOverButton } from './aim-gestures';
import { keyLabel, padHint, type ControlsConfig } from '@/features/controls/controls';
import type { AbilityHud, ArenaHud } from './useArena';

/** Button labels for the keyboard or a controller. */
export interface ButtonHints {
  abilities: [string, string, string];
  dodge: string;
  potion: string;
  attack: string;
}
/** Hints for the keyboard from the player's bindings (the mouse attacks when no key is bound). */
export function keyHints(cfg: ControlsConfig): ButtonHints {
  const k = cfg.keys;
  return {
    abilities: [keyLabel(k.primary), keyLabel(k.defensive), keyLabel(k.ultimate)],
    dodge: keyLabel(k.dodge),
    potion: keyLabel(k.potion),
    attack: k.attack ? keyLabel(k.attack) : 'Click',
  };
}

/** Hints for the controller from the player's bindings. */
export function padHints(cfg: ControlsConfig): ButtonHints {
  const p = cfg.pad;
  return {
    abilities: [padHint(p.primary), padHint(p.defensive), padHint(p.ultimate)],
    dodge: padHint(p.dodge),
    potion: padHint(p.potion),
    attack: padHint(p.attack),
  };
}

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
  // Obsidian's barrier: a pale segment after the life (over its end when there's no room).
  const barrier = hud.barrier ? Math.min(1, hud.barrier.hp / Math.max(1, hud.maxHp)) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className={`delve-hpbar ${frac < 0.3 ? 'animate-pulse' : ''}`} data-testid="hero-hp">
        <div className="fill" style={{ width: `${frac * 100}%`, background: hpGradient(frac) }} />
        {hud.barrier && (
          <div
            className="absolute inset-y-0"
            data-testid="hp-barrier"
            style={{
              left: `${Math.min(frac, 1 - barrier) * 100}%`,
              width: `${barrier * 100}%`,
              background: 'rgba(254, 215, 170, 0.6)',
            }}
          />
        )}
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

/** Seconds the buttons still cooling down spark after Galvanize. */
const GALVANIZE_SPARK = 0.4;

/**
 * A hold's charge filling above its button over a track that shows on any
 * floor, ticked at the stages (`data-stage`: the stage reached). The fill
 * glides between the HUD's refreshes.
 */
function HoldBar({ hold, color }: { hold: { charge: number; stage: number }; color: string }) {
  const stages = getDelveRegistry().getDelveBalance().chains.holdStages;
  return (
    <span
      className="absolute -top-2 left-1 right-1 h-1 overflow-hidden rounded-full bg-black/60 ring-1 ring-white/30"
      data-hold
      data-stage={hold.stage}
    >
      <span
        className="block h-full"
        style={{
          width: `${hold.charge * 100}%`,
          background: color,
          opacity: 0.55 + 0.225 * hold.stage,
          transition: 'width 80ms linear',
        }}
      />
      {stages.map((s) => (
        <span
          key={s}
          className="absolute inset-y-0 w-px bg-white/70"
          style={{ left: `${s * 100}%` }}
        />
      ))}
    </span>
  );
}

/** A chain's step dots under its button, the next one lit (`data-chain`: next or step). */
function ChainDots({ step, length, color }: { step: number; length: number; color: string }) {
  if (length < 2) return null;
  return (
    <span className="absolute -bottom-1.5 left-1/2 flex -translate-x-1/2 gap-0.5" aria-hidden>
      {Array.from({ length }, (_, k) => (
        <span
          key={k}
          data-chain={k === step ? 'next' : 'step'}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: k === step ? color : 'rgba(255,255,255,0.25)' }}
        />
      ))}
    </span>
  );
}

/**
 * A press on an ability button: its slot and pointer, where and when it
 * began, where it is now (`at`, `on` its button), and whether it has been off
 * the button since (`left`: back on it, that's a cancel).
 */
interface Press {
  slot: number;
  id: number;
  t: number;
  x: number;
  y: number;
  at: Vec;
  on: boolean;
  left: boolean;
}

/**
 * One ability button: its chain's next move, the step dots, that move's kind
 * and a hold's charge. A tap, or a press let go in place, casts auto-aimed;
 * dragging out shows the aim marker in the arena and releasing casts there;
 * out and back onto the button cancels (a charging hold unpaid). While it's
 * held a hold move charges. The bar's buttons share one press (`press`), as
 * the aim holds one slot: another button's press lets it go where it is (as a
 * second key does), and its pointer does nothing more.
 */
function AbilityButton({
  slot,
  ab,
  busy,
  galvanized,
  hint,
  press,
  onCast,
  onAim,
  onCancel,
}: {
  slot: number;
  ab: AbilityHud;
  /** An ability is channelling or a hold is charging (presses wait for it). */
  busy: boolean;
  /** Galvanize just fired: a cooling button sparks. */
  galvanized: boolean;
  hint?: string;
  press: RefObject<Press | null>;
  onCast: (slot: number, aim?: Vec | null) => void;
  onAim: (slot: number | null, at?: Vec, onButton?: boolean) => void;
  onCancel: () => void;
}) {
  const registry = getDelveRegistry();
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
    if (press.current && press.current.slot !== slot) letGo(press.current);
    const at = { x: e.clientX, y: e.clientY };
    const t = performance.now();
    press.current = { slot, id: e.pointerId, t, x: at.x, y: at.y, at, on: true, left: false };
    onAim(slot, at, true);
  };
  /** Whether the pointer is over the button: within its radius and the drag threshold (a thumb jitters). */
  const over = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const button = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 + DRAG_PX };
    return isOverButton({ x: e.clientX, y: e.clientY }, button);
  };
  /** This button's own press, following its pointer; null for any other pointer. */
  const follow = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (p?.id !== e.pointerId) return null;
    p.at = { x: e.clientX, y: e.clientY };
    p.on = over(e);
    if (!p.on) p.left = true;
    return p;
  };
  /**
   * Let a press go where it is: a tap, or let go in place, casts auto-aimed
   * (as a key does); off its button it casts there; out and back cancels.
   */
  const letGo = (p: Press) => {
    press.current = null;
    onAim(null);
    const drag = Math.hypot(p.at.x - p.x, p.at.y - p.y);
    if (classifyPress(performance.now() - p.t, drag) === 'tap') return onCast(p.slot);
    if (!p.on) return onCast(p.slot, p.at);
    if (!p.left) onCast(p.slot);
    else onCancel();
  };
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const p = follow(e);
    if (p) onAim(slot, p.at, p.on);
  };
  const up = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const p = follow(e);
    if (p) letGo(p);
  };
  const cancel = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (press.current?.id !== e.pointerId) return;
    press.current = null;
    onAim(null);
    onCancel();
  };

  return (
    <button
      type="button"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      aria-label={`${SLOT_LABEL[slot]}: ${moveText({ kind: ab.nextKind, name: ab.name })}`}
      data-testid={`ability-${slot}`}
      data-ready={ab.ready}
      className="relative rounded-full border-0 p-[3px]"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${color}, ${color2})`,
        boxShadow: ab.ready ? `0 0 16px ${color}aa` : 'none',
        opacity: busy && ab.windup === null && ab.hold === null ? 0.5 : ab.affordable ? 1 : 0.55,
        touchAction: 'none',
      }}
    >
      <span
        className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-full"
        style={{ background: 'radial-gradient(circle at 50% 35%, #2c2c3c, #121219)' }}
      >
        <span
          className="absolute top-1.5 text-[11px] leading-none text-stone-300"
          data-kind={ab.nextKind}
        >
          {KIND_ICON[ab.nextKind]}
        </span>
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
      <ChainDots step={ab.chainStep} length={ab.chainLength} color={color} />
      {ab.hold !== null && <HoldBar hold={ab.hold} color={color} />}
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
      {galvanized && cooling && (
        <span
          data-spark
          aria-hidden
          className="pointer-events-none absolute -left-1 -top-1 text-base"
          style={{ textShadow: '0 0 6px #d8f56a' }}
        >
          ⚡
        </span>
      )}
    </button>
  );
}

/**
 * Manual basic attacks on phones: hold to keep attacking, tap for one. Pips
 * show which blow of the basic chain lands next, a glyph its kind, and a bar
 * a held blow's charge.
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
        className="relative flex h-full w-full items-center justify-center rounded-full text-3xl"
        style={{ background: 'radial-gradient(circle at 50% 35%, #2c2c3c, #121219)' }}
      >
        ⚔️
        {hud && (
          <span
            className="absolute top-1.5 text-[11px] leading-none text-stone-300"
            data-kind={hud.basicNextKind}
          >
            {KIND_ICON[hud.basicNextKind]}
          </span>
        )}
      </span>
      {hint && (
        <span className="absolute -top-1 right-0 rounded bg-black/70 px-1 text-[9px] text-stone-300">
          {hint}
        </span>
      )}
      {hud && <ChainDots step={hud.basicChainStep} length={hud.basicChainLength} color="#fde047" />}
      {hud?.basicHold && <HoldBar hold={hud.basicHold} color="#fde047" />}
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
  onCancel,
  onPotion,
  onDodge,
  hints,
}: {
  hud: ArenaHud | null;
  onCast: (slot: number, aim?: Vec | null) => void;
  onAim: (slot: number | null, at?: Vec, onButton?: boolean) => void;
  /** An aim released back on its button: drop a charging hold unpaid. */
  onCancel: () => void;
  onPotion: () => void;
  onDodge: () => void;
  /** Button labels to show, or null (touch). */
  hints: ButtonHints | null;
}) {
  const galvanized =
    !!hud && hud.galvanizedAt !== null && hud.t - hud.galvanizedAt < GALVANIZE_SPARK;
  const press = useRef<Press | null>(null);
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
          galvanized={galvanized}
          hint={hints?.abilities[i]}
          press={press}
          onCast={onCast}
          onAim={onAim}
          onCancel={onCancel}
        />
      ))}
    </div>
  );
}
