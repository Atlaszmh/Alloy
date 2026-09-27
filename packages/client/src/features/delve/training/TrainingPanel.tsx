import {
  memo,
  useRef,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  MANA_TYPES,
  RARITY_ORDER,
  itemStatLines,
  type DummyLayout,
  type MonsterKind,
  type SandboxToggles,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import {
  MAX_DEPTH,
  MAX_DUMMY_GROUPS,
  MAX_EXTRA_ATTUNE,
  SLOWMO_SPEEDS,
  sandboxEquipped,
  useSandboxStats,
  useSandboxStore,
  type WeaponChoice,
} from '@/stores/sandboxStore';
import { getDelveRegistry } from '../registry';
import { RARITY_COLOR, RARITY_LABEL, formatStat, legendaryText, manaStyle } from '../format';
import { AbilityEditor, AttunementBars, Chip } from '../AbilitiesPanel';
import type { MeterSummary } from './meter';
import { MeterTab } from './MeterView';
import type { TrainingActions } from './useTrainingArena';

export type PanelLayout = 'dock' | 'sheet';
export type TrainingTab = 'loadout' | 'abilities' | 'targets' | 'toggles' | 'meter';

/** The docked panel's width in px (the arena narrows by this). */
export const DOCK_WIDTH = 360;
/** From this page width, with mouse and keyboard, the panel docks beside the fight. */
const DOCK_MIN_WIDTH = 1024;

/**
 * Decided when the panel opens and kept until it closes: docked (the fight runs
 * on) when the page itself is wide enough (the app frame letterboxes, so not
 * the window) and mouse and keyboard are in use; otherwise a sheet that pauses it.
 */
export function openLayout(page: HTMLElement | null): PanelLayout {
  return (page?.clientWidth ?? 0) >= DOCK_MIN_WIDTH &&
    useInputDeviceStore.getState().device === 'keyboard'
    ? 'dock'
    : 'sheet';
}

/** The top bar's "Depth N", plus the slow-motion speed while it isn't 1×. */
export function DepthLabel() {
  const depth = useSandboxStore((s) => s.depth);
  const slowmo = useSandboxStore((s) => s.slowmo);
  return (
    <span className="delve-display flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold uppercase tracking-widest text-stone-400">
      <span data-testid="training-depth-label">Depth {depth}</span>
      {slowmo !== 1 && (
        <span className="text-sky-300" data-testid="training-slowmo">
          {slowmo}×
        </span>
      )}
    </span>
  );
}

const TABS: [TrainingTab, string][] = [
  ['loadout', 'Loadout'],
  ['abilities', 'Abilities'],
  ['targets', 'Targets'],
  ['toggles', 'Toggles'],
  ['meter', 'Meter'],
];
const LAYOUTS: [DummyLayout, string][] = [
  ['single', '🎯 One'],
  ['row', '▮ Row of 5'],
  ['clump', '⁂ Clump of 5'],
];
const KINDS: [MonsterKind, string][] = [
  ['normal', 'Normal'],
  ['elite', 'Elite'],
  ['boss', 'Boss'],
];
const SWITCHES: [keyof SandboxToggles, string, string][] = [
  ['infiniteMana', 'Infinite mana', 'The pool refills every moment.'],
  [
    'noCooldowns',
    'No cooldowns',
    'An ability can go again as soon as it lands; charge refills as it lands.',
  ],
  [
    'invulnerable',
    'Invulnerable',
    'Hits show in grey but take no life. Off: you get up at once when you fall.',
  ],
];

/**
 * A button, switch or slider lets go of focus once the pointer does, so the
 * arena's keys keep working; focus reached with Tab stays. (Lists are handled
 * in the panel: blurring one on pointer-up would close it.)
 */
export function blurOnPointerUp(e: ReactPointerEvent<HTMLElement>): void {
  const el = (e.target as Element).closest('button, input');
  if (el instanceof HTMLElement) el.blur();
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="delve-display text-xs font-bold uppercase tracking-widest text-amber-300/80">
        {title}
      </div>
      {children}
    </section>
  );
}

const SELECT = 'rounded-lg border border-white/10 bg-black/60 px-2 py-1.5 text-sm text-stone-200';

const LoadoutTab = memo(function LoadoutTab() {
  const registry = getDelveRegistry();
  const s = useSandboxStore();
  const stats = useSandboxStats();
  const weapon = sandboxEquipped(registry, s).weapon;
  const choice = s.weapon;
  const pick = (next: Partial<WeaponChoice>) =>
    s.setWeapon({ baseId: 'sword', mana: 'fire', rarity: 'rare', ...(choice ?? {}), ...next });

  return (
    <div className="flex flex-col gap-4" data-testid="loadout-tab">
      <Section title="Weapon">
        <div className="flex flex-wrap gap-1.5">
          {registry.getGearBasesForSlot('weapon').map((b) => (
            <Chip
              key={b.id}
              pressed={choice?.baseId === b.id}
              onClick={() => pick({ baseId: b.id })}
              testId={`weapon-base-${b.id}`}
            >
              {b.name}
            </Chip>
          ))}
          <Chip pressed={!choice} onClick={() => s.setWeapon(null)} testId="weapon-base-none">
            Unarmed
          </Chip>
        </div>
        <fieldset
          disabled={!choice}
          className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0"
          style={{ opacity: choice ? 1 : 0.5 }}
        >
          <div className="flex flex-wrap gap-1.5">
            {MANA_TYPES.map((m) => (
              <Chip
                key={m}
                pressed={choice?.mana === m}
                onClick={() => pick({ mana: m })}
                testId={`weapon-mana-${m}`}
              >
                {manaStyle(registry, m).icon} {manaStyle(registry, m).name}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {RARITY_ORDER.map((r) => (
              <Chip
                key={r}
                pressed={choice?.rarity === r}
                onClick={() => pick({ rarity: r })}
                testId={`weapon-rarity-${r}`}
              >
                <span style={{ color: RARITY_COLOR[r] }}>{RARITY_LABEL[r]}</span>
              </Chip>
            ))}
          </div>
        </fieldset>
        <div className="delve-panel flex flex-col gap-0.5 p-2.5 text-sm" data-testid="weapon-lines">
          <div
            className="delve-display font-bold"
            style={{ color: weapon ? RARITY_COLOR[weapon.rarity] : '#d6d3d1' }}
            data-testid="weapon-name"
          >
            {weapon ? weapon.name : 'Unarmed'}
          </div>
          {weapon &&
            itemStatLines(weapon, registry).map((l, i) => (
              <div key={i} className="text-stone-300">
                {formatStat(registry, l.stat, l.value)}
              </div>
            ))}
          {weapon?.legendary && (
            <div className="text-orange-300">
              {legendaryText(registry, weapon.legendary.id, weapon.legendary.value)}
            </div>
          )}
          {s.loadedWeapon ? (
            <div className="text-[11px] text-stone-500">
              Your own weapon, from Load my build. Change any option for a clean one.
            </div>
          ) : (
            weapon && (
              <div className="text-[11px] text-stone-500">
                A clean weapon: its base line, scaled by rarity and depth. Powers are below.
              </div>
            )
          )}
        </div>
      </Section>

      <Section title="Legendary powers">
        <div className="flex flex-col gap-1.5">
          {registry.getDelveData().legendaries.map((l) => {
            const on = l.id in s.legendaries;
            // Worn on the loaded gear: on, at the gear's roll, and switched by changing the gear.
            const fromGear = !on && l.id in stats.legendaries;
            const lit = on || fromGear;
            return (
              <button
                key={l.id}
                type="button"
                className="delve-panel flex flex-col items-start gap-0.5 p-2 text-left"
                style={{ borderColor: lit ? '#fb923c' : undefined }}
                aria-pressed={lit}
                disabled={fromGear}
                onClick={() => s.setLegendary(l.id, !on)}
                data-testid={`legendary-${l.id}`}
              >
                <span
                  className="delve-display text-sm font-bold"
                  style={{ color: lit ? '#fb923c' : '#d6d3d1' }}
                >
                  {lit ? '★' : '☆'} {l.name}
                  {fromGear && (
                    <span className="ml-1.5 text-[10px] font-normal normal-case text-stone-400">
                      from your gear
                    </span>
                  )}
                </span>
                <span className="text-[11px] leading-snug text-stone-400">
                  {legendaryText(registry, l.id, fromGear ? stats.legendaries[l.id] : l.max)}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Attunement">
        <AttunementBars stats={stats} />
        <div className="flex flex-col gap-1" data-testid="extra-attunement">
          {MANA_TYPES.map((m) => {
            const extra = s.attunement[m] ?? 0;
            const style = manaStyle(registry, m);
            return (
              <label key={m} className="flex items-center gap-2 text-xs">
                <span className="w-20 shrink-0" style={{ color: style.color }}>
                  {style.icon} {style.name}
                </span>
                <input
                  type="range"
                  min={0}
                  max={MAX_EXTRA_ATTUNE}
                  step={1}
                  value={extra}
                  onChange={(e) => s.setAttunement(m, Number(e.currentTarget.value))}
                  className="min-w-0 flex-1"
                  data-testid={`extra-attune-${m}`}
                />
                <span className="w-24 shrink-0 text-right text-stone-400">
                  {stats.attunement[m] - extra} + {extra} ={' '}
                  <b className="text-stone-100">{stats.attunement[m]}</b>
                </span>
              </label>
            );
          })}
        </div>
      </Section>

      <button
        type="button"
        className="delve-btn delve-btn-gold text-base"
        onClick={() => s.loadMyBuild(useDelveStore.getState().profile)}
        data-testid="load-my-build"
      >
        Load my build
      </button>
      <p className="text-[11px] text-stone-500">
        Copies your equipped gear and abilities in. Nothing here ever changes your save.
      </p>
    </div>
  );
});

/** The Anvil's editor, bound to the sandbox (never locked, every reaction named: it's a testing tool). */
const TrainingAbilities = memo(function TrainingAbilities() {
  const builds = useSandboxStore((s) => s.abilities);
  const stats = useSandboxStats();
  const all = getDelveRegistry()
    .getArpgData()
    .reactions.map((r) => r.id);
  return (
    <AbilityEditor
      builds={builds}
      stats={stats}
      reactionsSeen={all}
      locked={false}
      onChange={(slot, build) => useSandboxStore.getState().setAbility(slot, build)}
    />
  );
});

const TargetsTab = memo(function TargetsTab({ actions }: { actions: TrainingActions }) {
  const registry = getDelveRegistry();
  const biomes = registry.getDelveData().biomes;
  const dummyElement = useSandboxStore((s) => s.dummyElement);
  const full = useSandboxStore((s) => s.dummies.length >= MAX_DUMMY_GROUPS);
  const depth = useSandboxStore((s) => s.depth);
  // In the store (not saved), so the picks survive tab switches.
  const { biomeId, defId, kind, count } = useSandboxStore((s) => s.spawn);
  const biome = biomes.find((b) => b.id === biomeId) ?? biomes[0];
  const defs = [...biome.monsters, biome.boss];
  const def = defs.find((d) => d.id === defId) ?? defs[0];
  const store = useSandboxStore.getState;
  const weakness = registry.getArpgData().weakness;

  return (
    <div className="flex flex-col gap-4" data-testid="targets-tab">
      <Section title="Training dummies">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-stone-500">Resists</span>
          <Chip
            pressed={dummyElement === null}
            onClick={() => store().setDummyElement(null)}
            testId="dummy-element-none"
          >
            Neutral
          </Chip>
          {MANA_TYPES.map((m) => (
            <Chip
              key={m}
              pressed={dummyElement === m}
              onClick={() => store().setDummyElement(m)}
              testId={`dummy-element-${m}`}
              title={`Resists ${manaStyle(registry, m).name} · weak to ${manaStyle(registry, weakness[m]).name}`}
            >
              {manaStyle(registry, m).icon}
            </Chip>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {LAYOUTS.map(([layout, label]) => (
            <button
              key={layout}
              type="button"
              className="delve-btn px-2 py-2 text-xs"
              disabled={full}
              onClick={() => actions.addDummies(layout)}
              data-testid={`add-dummy-${layout}`}
            >
              {label}
            </button>
          ))}
        </div>
        {full && (
          <div className="text-[11px] text-amber-200" data-testid="dummies-full">
            {MAX_DUMMY_GROUPS} groups at most: clear the dummies to add more.
          </div>
        )}
        <button
          type="button"
          className="delve-btn text-sm"
          onClick={actions.resetDummies}
          data-testid="reset-dummies"
        >
          ↺ Reset dummies
        </button>
      </Section>

      <Section title="Monsters">
        <select
          className={SELECT}
          value={biome.id}
          onChange={(e) => {
            const next = biomes.find((b) => b.id === e.currentTarget.value) ?? biomes[0];
            store().setSpawn({ biomeId: next.id, defId: next.monsters[0].id });
          }}
          aria-label="Biome"
          data-testid="spawn-biome"
        >
          {biomes.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          className={SELECT}
          value={def.id}
          onChange={(e) => store().setSpawn({ defId: e.currentTarget.value })}
          aria-label="Monster"
          data-testid="spawn-monster"
        >
          {defs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.icon} {d.name}
              {d.id === biome.boss.id ? ' (boss)' : ''}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map(([k, label]) => (
            <Chip
              key={k}
              pressed={kind === k}
              onClick={() => store().setSpawn({ kind: k })}
              testId={`spawn-kind-${k}`}
            >
              {label}
            </Chip>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-stone-300">
          Count
          <input
            type="range"
            min={1}
            max={8}
            step={1}
            value={count}
            onChange={(e) => store().setSpawn({ count: Number(e.currentTarget.value) })}
            className="min-w-0 flex-1"
            data-testid="spawn-count"
          />
          <b className="w-4 text-right">{count}</b>
        </label>
        <button
          type="button"
          className="delve-btn text-sm"
          onClick={() => actions.spawn(def.id, kind, count)}
          data-testid="spawn-button"
        >
          Spawn {count} × {def.name}
        </button>
      </Section>

      <Section title="Clear">
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            className="delve-btn px-2 text-xs"
            onClick={() => actions.clear('monsters')}
            data-testid="clear-monsters"
          >
            Monsters
          </button>
          <button
            type="button"
            className="delve-btn px-2 text-xs"
            onClick={() => actions.clear('dummies')}
            data-testid="clear-dummies"
          >
            Dummies
          </button>
          <button
            type="button"
            className="delve-btn delve-btn-danger px-2 text-xs"
            onClick={() => actions.clear('all')}
            data-testid="clear-all"
          >
            All
          </button>
        </div>
      </Section>

      <Section title="Depth">
        <label className="flex items-center gap-2 text-sm text-stone-300">
          <select
            className={SELECT}
            value={depth}
            onChange={(e) => store().setDepth(Number(e.currentTarget.value))}
            aria-label="Depth"
            data-testid="training-depth"
          >
            {Array.from({ length: MAX_DEPTH }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <span className="text-xs text-stone-400">
            {registry.getBiomeForDepth(depth).name}: monsters, dummies and your weapon&apos;s item
            level follow depth. A new depth restarts the arena (dummies come back, spawned monsters
            don&apos;t).
          </span>
        </label>
      </Section>
    </div>
  );
});

const TogglesTab = memo(function TogglesTab({
  actions,
  onOpenControls,
}: {
  actions: TrainingActions;
  onOpenControls: () => void;
}) {
  const toggles = useSandboxStore((s) => s.toggles);
  const slowmo = useSandboxStore((s) => s.slowmo);
  const manual = useDelveStore((s) => s.manualAttack);
  const store = useSandboxStore.getState;

  return (
    <div className="flex flex-col gap-4" data-testid="toggles-tab">
      <Section title="Rules">
        {SWITCHES.map(([key, label, text]) => (
          <button
            key={key}
            type="button"
            className="delve-panel flex items-center justify-between gap-3 p-2.5 text-left"
            aria-pressed={toggles[key]}
            onClick={() => store().setToggles({ ...toggles, [key]: !toggles[key] })}
            data-testid={`toggle-${key}`}
          >
            <span className="min-w-0">
              <span className="delve-display block text-sm font-bold text-stone-100">{label}</span>
              <span className="block text-[11px] text-stone-400">{text}</span>
            </span>
            <span
              className="delve-display shrink-0 text-xs font-bold"
              style={{ color: toggles[key] ? '#4ade80' : '#78716c' }}
            >
              {toggles[key] ? 'ON' : 'OFF'}
            </span>
          </button>
        ))}
        <button
          type="button"
          className="delve-btn text-sm"
          onClick={actions.fillCharge}
          data-testid="fill-charge"
        >
          ⚡ Fill charge
        </button>
      </Section>

      <Section title="Slow motion">
        <div className="flex flex-wrap gap-1.5">
          {SLOWMO_SPEEDS.map((v) => (
            <Chip
              key={v}
              pressed={slowmo === v}
              onClick={() => store().setSlowmo(v)}
              testId={`slowmo-${v}`}
            >
              {v}×
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Controls">
        <button
          type="button"
          className="delve-btn text-sm"
          onClick={() => useDelveStore.getState().setManualAttack(!manual)}
          data-testid="training-attack-mode"
        >
          Basic attack: {manual ? 'Manual' : 'Auto'} ⇄
        </button>
        <button
          type="button"
          className="delve-btn text-sm"
          onClick={onOpenControls}
          data-testid="training-open-controls"
        >
          🎮 Controls
        </button>
      </Section>
    </div>
  );
});

/**
 * The Training panel: docked beside the running fight (wide pages with mouse
 * and keyboard) or a sheet over the paused fight (phones, or a controller), as
 * the page decided when it opened. The sheet keeps the controller's focus
 * (`data-pad-scope`), its Close answers B (`data-pad-back`), LB/RB step the
 * tabs (`data-pad-tabs`), and Back to the Anvil (no marker) lets a controller
 * player leave from inside it. Memoised, with memoised tabs, so the HUD's and
 * the meter's refreshes don't re-render every tab.
 */
export const TrainingPanel = memo(function TrainingPanel({
  layout,
  tab,
  onTab,
  onClose,
  onExit,
  actions,
  meter,
  onOpenControls,
}: {
  layout: PanelLayout;
  tab: TrainingTab;
  onTab: (tab: TrainingTab) => void;
  onClose: () => void;
  onExit: () => void;
  actions: TrainingActions;
  meter: MeterSummary;
  onOpenControls: () => void;
}) {
  // A list picked with the pointer lets go of focus once it changes; one worked with keys keeps it.
  const pointerList = useRef<HTMLSelectElement | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    pointerList.current = (e.target as Element).closest('select');
  };
  // A pointer-opened list closed without a change lets go on the next key, so WASD reach the fight.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.target === pointerList.current) (e.target as HTMLElement).blur();
    pointerList.current = null;
  };
  const onChange = (e: FormEvent<HTMLElement>) => {
    if (e.target instanceof HTMLSelectElement && e.target === pointerList.current) {
      pointerList.current = null;
      e.target.blur();
    }
  };

  const body = (
    <div
      className="flex flex-col gap-3"
      onPointerDown={onPointerDown}
      onPointerUp={blurOnPointerUp}
      onKeyDown={onKeyDown}
      onChange={onChange}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="delve-display text-lg font-bold uppercase tracking-widest text-amber-300">
          🎯 Training
        </span>
        <span className="flex gap-1.5">
          <button
            type="button"
            className="delve-btn px-3 py-1 text-sm"
            onClick={onExit}
            data-testid="training-panel-exit"
          >
            ◂ Anvil
          </button>
          {layout === 'sheet' && (
            <button
              type="button"
              className="delve-btn px-3 py-1 text-sm"
              onClick={onClose}
              data-pad-back
              data-testid="training-panel-close"
            >
              Close
            </button>
          )}
        </span>
      </div>
      <div className="flex gap-1 rounded-xl bg-black/30 p-1" role="tablist" data-pad-tabs>
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTab(id)}
            className="delve-display flex-1 rounded-lg py-1.5 text-[11px] font-bold uppercase tracking-wide"
            style={{
              background: tab === id ? 'linear-gradient(180deg,#2c2c3e,#1f1f2c)' : 'transparent',
              color: tab === id ? '#fde68a' : '#8a8a9a',
            }}
            data-testid={`training-tab-${id}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'loadout' && <LoadoutTab />}
      {tab === 'abilities' && <TrainingAbilities />}
      {tab === 'targets' && <TargetsTab actions={actions} />}
      {tab === 'toggles' && <TogglesTab actions={actions} onOpenControls={onOpenControls} />}
      {tab === 'meter' && <MeterTab meter={meter} onReset={actions.resetMeter} />}
    </div>
  );

  if (layout === 'dock')
    return (
      <aside
        className="absolute inset-y-0 right-0 z-30 overflow-y-auto border-l border-white/10 p-3"
        style={{ width: DOCK_WIDTH, background: 'linear-gradient(180deg,#16161f,#0e0e14)' }}
        aria-label="Training"
        data-testid="training-panel"
        data-layout="dock"
      >
        {body}
      </aside>
    );
  return (
    <div
      className="absolute inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center"
      data-pad-scope
    >
      <div
        className="delve-panel max-h-[88%] w-full max-w-[560px] overflow-y-auto p-3"
        style={{ paddingBottom: 'calc(12px + var(--spacing-safe-bottom))' }}
        role="dialog"
        aria-modal="true"
        aria-label="Training"
        data-testid="training-panel"
        data-layout="sheet"
      >
        {body}
      </div>
    </div>
  );
});
