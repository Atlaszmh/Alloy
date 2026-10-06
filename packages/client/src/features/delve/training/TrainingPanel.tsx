import {
  memo,
  useMemo,
  useRef,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  MANA_TYPES,
  MAX_CHAIN,
  MAX_SOCKETS,
  RARITY_ORDER,
  itemStatLines,
  type DummyLayout,
  type ManaType,
  type MonsterKind,
  type SandboxToggles,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
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
import { RARITY_LABEL, RARITY_TEXT, formatStat, legendaryText, manaStyle } from '../format';
import { Button, Chip, Glyph, Panel, Tabs, type TabsProps } from '@/features/delve/kit';
import { AttunementBars } from '../items/AttunementBars';
import { ChainEditor, type ChainRunes } from '../chains/ChainEditor';
import { ReactionsGrid } from '../hub/codex/ReactionsGrid';
import type { MeterSummary } from './meter';
import { MeterTab } from './MeterView';
import type { TrainingActions } from './useTrainingArena';

export type TrainingTab = 'loadout' | 'abilities' | 'targets' | 'toggles' | 'meter';

const TABS: TabsProps<TrainingTab>['tabs'] = (
  [
    ['loadout', 'Loadout'],
    ['abilities', 'Abilities'],
    ['targets', 'Targets'],
    ['toggles', 'Toggles'],
    ['meter', 'Meter'],
  ] as const
).map(([id, label]) => ({ id, label, testId: `training-tab-${id}` }));
const LAYOUTS: [DummyLayout, string][] = [
  ['single', 'One'],
  ['row', 'Row of 5'],
  ['clump', 'Clump of 5'],
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
    'Cooldowns are off and charge stays full; each move still waits its beat.',
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
function blurOnPointerUp(e: ReactPointerEvent<HTMLElement>): void {
  const el = (e.target as Element).closest('button, input');
  if (el instanceof HTMLElement) el.blur();
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="k-label m-0">{title}</h3>
      {children}
    </section>
  );
}

/** An element's glyph and name, in its colour. */
function ManaName({ mana }: { mana: ManaType }) {
  const style = manaStyle(getDelveRegistry(), mana);
  return (
    <>
      <Glyph id={mana} size={16} color={style.color} /> {style.name}
    </>
  );
}

const SELECT = 'k-well px-2 py-1.5 text-[16px] text-[var(--k-text)]';

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
        <div className="flex flex-wrap gap-2">
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
          className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0"
          style={{ opacity: choice ? 1 : 0.5 }}
        >
          <div className="flex flex-wrap gap-2">
            {MANA_TYPES.map((m) => (
              <Chip
                key={m}
                pressed={choice?.mana === m}
                onClick={() => pick({ mana: m })}
                testId={`weapon-mana-${m}`}
              >
                <ManaName mana={m} />
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {RARITY_ORDER.map((r) => (
              <Chip
                key={r}
                pressed={choice?.rarity === r}
                onClick={() => pick({ rarity: r })}
                testId={`weapon-rarity-${r}`}
              >
                <span style={{ color: RARITY_TEXT[r] }}>{RARITY_LABEL[r]}</span>
              </Chip>
            ))}
          </div>
        </fieldset>
        <div className="k-well flex flex-col gap-1 p-3 text-[16px]" data-testid="weapon-lines">
          <div
            className="k-disp text-[20px]"
            style={{ color: weapon ? RARITY_TEXT[weapon.rarity] : 'var(--k-text)' }}
            data-testid="weapon-name"
          >
            {weapon ? weapon.name : 'Unarmed'}
          </div>
          {weapon &&
            itemStatLines(weapon, registry).map((l, i) => (
              <div key={i} className="text-[var(--k-text-2)]">
                {formatStat(registry, l.stat, l.value)}
              </div>
            ))}
          {weapon?.legendary && (
            <div className="text-[var(--k-hot)]">
              {legendaryText(registry, weapon.legendary.id, weapon.legendary.value)}
            </div>
          )}
          {s.loadedWeapon ? (
            <div className="k-note">
              Your own weapon, from Load my build. Change any option for a clean one.
            </div>
          ) : (
            weapon && (
              <div className="k-note">
                A clean weapon: its base line, scaled by rarity and depth. Powers are below.
              </div>
            )
          )}
        </div>
      </Section>

      <Section title="Your primary">
        <div className="flex flex-wrap gap-2">
          {MANA_TYPES.map((m) => (
            <Chip
              key={m}
              pressed={s.primary === m}
              onClick={() => s.setPrimary(m)}
              testId={`sandbox-primary-${m}`}
            >
              <ManaName mana={m} />
            </Chip>
          ))}
        </div>
        <p className="k-note m-0">
          Your primary: your basic blows strike with it, except where they pick your secondary.
        </p>
      </Section>

      <Section title="Your secondary">
        <div className="flex flex-wrap gap-2">
          <Chip pressed={!s.secondary} onClick={() => s.setSecondary(null)} testId="secondary-none">
            None
          </Chip>
          {MANA_TYPES.map((m) => (
            <Chip
              key={m}
              pressed={s.secondary === m}
              disabled={m === s.primary}
              onClick={() => s.setSecondary(m)}
              testId={`secondary-${m}`}
            >
              <ManaName mana={m} />
            </Chip>
          ))}
        </div>
        <p className="k-note m-0">
          The second element your basic blows can pick (in Abilities, Basic). The default basic
          chain follows your weapon and pair, so binding one gives it the last blow; a chain you
          built keeps its blows.
        </p>
      </Section>

      <Section title="Legendary powers">
        <div className="flex flex-col gap-2">
          {registry.getDelveData().legendaries.map((l) => {
            const on = l.id in s.legendaries;
            // Worn on the loaded gear: on, at the gear's roll, and switched by changing the gear.
            const fromGear = !on && l.id in stats.legendaries;
            const lit = on || fromGear;
            return (
              <button
                key={l.id}
                type="button"
                className="k-socket flex flex-col items-start gap-1 p-3 text-left"
                style={{ borderColor: lit ? 'var(--k-hot)' : undefined }}
                aria-pressed={lit}
                disabled={fromGear}
                onClick={() => s.setLegendary(l.id, !on)}
                data-testid={`legendary-${l.id}`}
              >
                <span className="flex items-center gap-2">
                  {lit && <Glyph id="check" size={14} />}
                  <span
                    className="k-disp text-[18px]"
                    style={{ color: lit ? 'var(--k-hot)' : 'var(--k-text)' }}
                  >
                    {l.name}
                  </span>
                  {fromGear && <span className="k-caption">from your gear</span>}
                </span>
                <span className="k-note">
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
            return (
              <label key={m} className="flex items-center gap-2 text-[16px]">
                <span className="flex w-24 shrink-0 items-center gap-1">
                  <ManaName mana={m} />
                </span>
                <input
                  type="range"
                  min={0}
                  max={MAX_EXTRA_ATTUNE}
                  step={1}
                  value={extra}
                  onChange={(e) => s.setAttunement(m, Number(e.currentTarget.value))}
                  className="min-w-0 flex-1 accent-[#feae34]"
                  data-testid={`extra-attune-${m}`}
                />
                <span className="w-24 shrink-0 text-right text-[var(--k-text-2)]">
                  {stats.attunement[m] - extra} + {extra} ={' '}
                  <b className="text-[var(--k-text)]">{stats.attunement[m]}</b>
                </span>
              </label>
            );
          })}
        </div>
      </Section>

      <Button
        variant="primary"
        onClick={() => s.loadMyBuild(useDelveStore.getState().profile)}
        testId="load-my-build"
      >
        Load my build
      </Button>
      <p className="k-note m-0">
        Copies your equipped gear, your weapon's chains with their runes, and your pair in. Nothing
        here ever changes your save.
      </p>
    </div>
  );
});

const CAPS = { basic: MAX_CHAIN, primary: MAX_CHAIN, defensive: MAX_CHAIN, ultimate: MAX_CHAIN };

/**
 * The Anvil's chain builder, bound to the sandbox: never locked, any element for
 * an ability, the pair for a blow, and every rune at any tier in up to
 * MAX_SOCKETS sockets a move, free (it's a testing tool), picked in place; then
 * every reaction, named (the Codex's grid, all discovered).
 */
const TrainingAbilities = memo(function TrainingAbilities() {
  const chains = useSandboxStore((s) => s.chains);
  const primary = useSandboxStore((s) => s.primary);
  const secondary = useSandboxStore((s) => s.secondary);
  const baseId = useSandboxStore((s) => s.weapon?.baseId ?? null);
  const stats = useSandboxStats();
  const runes = useMemo<ChainRunes>(
    () => ({
      pouch: 'any',
      socketCap: MAX_SOCKETS,
      socketPrice: () => null,
      weaponBaseId: baseId,
      pullText: () => 'Pull · free',
    }),
    [baseId],
  );
  const reactions = getDelveRegistry().getArpgData().reactions;
  return (
    <div className="flex flex-col gap-6">
      <ChainEditor
        chains={chains}
        caps={CAPS}
        stats={stats}
        locked={false}
        onChange={(skill, chain) => useSandboxStore.getState().setChain(skill, chain)}
        blowElements={secondary ? [primary, secondary] : [primary]}
        runes={runes}
      />
      {/* The Codex's grid, one card a row in the dock. */}
      <div className="[&_.grid-cols-2]:grid-cols-1">
        <ReactionsGrid reactionsSeen={reactions.map((r) => r.id)} />
      </div>
    </div>
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="k-caption">Resists</span>
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
              aria-label={manaStyle(registry, m).name}
              title={`Resists ${manaStyle(registry, m).name} · weak to ${manaStyle(registry, weakness[m]).name}`}
            >
              <Glyph id={m} size={16} color={manaStyle(registry, m).color} />
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {LAYOUTS.map(([layout, label]) => (
            <Button
              key={layout}
              size="sm"
              disabled={full}
              onClick={() => actions.addDummies(layout)}
              testId={`add-dummy-${layout}`}
            >
              {label}
            </Button>
          ))}
        </div>
        {full && (
          <div className="k-note text-[var(--k-hot)]" data-testid="dummies-full">
            {MAX_DUMMY_GROUPS} groups at most: clear the dummies to add more.
          </div>
        )}
        <Button size="sm" onClick={actions.resetDummies} testId="reset-dummies">
          Reset dummies
        </Button>
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
              {d.name}
              {d.id === biome.boss.id ? ' (boss)' : ''}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
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
        <label className="flex items-center gap-2 text-[16px] text-[var(--k-text-2)]">
          Count
          <input
            type="range"
            min={1}
            max={8}
            step={1}
            value={count}
            onChange={(e) => store().setSpawn({ count: Number(e.currentTarget.value) })}
            className="min-w-0 flex-1 accent-[#feae34]"
            data-testid="spawn-count"
          />
          <b className="w-4 text-right text-[var(--k-text)]">{count}</b>
        </label>
        <Button size="sm" onClick={() => actions.spawn(def.id, kind, count)} testId="spawn-button">
          Spawn {count} × {def.name}
        </Button>
      </Section>

      <Section title="Clear">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => actions.clear('monsters')} testId="clear-monsters">
            Monsters
          </Button>
          <Button size="sm" onClick={() => actions.clear('dummies')} testId="clear-dummies">
            Dummies
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => actions.clear('all')}
            testId="clear-all"
          >
            All
          </Button>
        </div>
      </Section>

      <Section title="Depth">
        <label className="flex items-center gap-2">
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
          <span className="k-note">
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
  const store = useSandboxStore.getState;

  return (
    <div className="flex flex-col gap-4" data-testid="toggles-tab">
      <Section title="Rules">
        {SWITCHES.map(([key, label, text]) => (
          <button
            key={key}
            type="button"
            className="k-socket flex items-center justify-between gap-3 p-3 text-left"
            aria-pressed={toggles[key]}
            onClick={() => store().setToggles({ ...toggles, [key]: !toggles[key] })}
            data-testid={`toggle-${key}`}
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="k-disp text-[18px]">{label}</span>
              <span className="k-caption">{text}</span>
            </span>
            <span
              className="k-disp shrink-0 text-[18px]"
              style={{ color: toggles[key] ? 'var(--k-ok)' : 'var(--k-text-3)' }}
            >
              {toggles[key] ? 'ON' : 'OFF'}
            </span>
          </button>
        ))}
        <Button size="sm" onClick={actions.fillCharge} testId="fill-charge">
          Fill charge
        </Button>
      </Section>

      <Section title="Slow motion">
        <div className="flex flex-wrap gap-2">
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

      {/* The basic attack's Auto / Manual lives in the Controls editor (attack-mode-toggle). */}
      <Section title="Controls">
        <Button size="sm" onClick={onOpenControls} testId="training-open-controls">
          <Glyph id="controls" size={18} /> Controls
        </Button>
      </Section>
    </div>
  );
});

/**
 * The Training dock (glass, the HUD's right column): a heading with Close, the
 * kit's top-level tabs (LB/RB under the pad), and the open tab, which scrolls.
 * The page decides who has the pad's focus. Memoised, with memoised tabs, so
 * the HUD's and the meter's refreshes don't re-render every tab.
 */
export const TrainingPanel = memo(function TrainingPanel({
  tab,
  onTab,
  onClose,
  actions,
  meter,
  onOpenControls,
}: {
  tab: TrainingTab;
  onTab: (tab: TrainingTab) => void;
  onClose: () => void;
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

  return (
    <Panel
      as="aside"
      material="glass"
      aria-label="Training"
      className="min-h-0 flex-1"
      title={
        <span className="flex items-center gap-2">
          <Glyph id="training" size={20} /> Training
        </span>
      }
      aside={
        <Button size="sm" variant="quiet" onClick={onClose} testId="training-panel-close">
          Close
        </Button>
      }
      testId="training-panel"
      onPointerDown={onPointerDown}
      onPointerUp={blurOnPointerUp}
      onKeyDown={onKeyDown}
      onChange={onChange}
    >
      {/* Five tabs in the dock's 360 px: they wrap to a second row. */}
      <div className="[&_.k-tabs]:flex-wrap [&_.k-tabs]:gap-x-4 [&_.k-tabs]:gap-y-0">
        <Tabs
          tabs={TABS}
          value={tab}
          onChange={onTab}
          level="top"
          size="md"
          aria-label="Training"
        />
      </div>
      <div className="k-scroll -mr-2 min-h-0 flex-1 pr-2">
        {tab === 'loadout' && <LoadoutTab />}
        {tab === 'abilities' && <TrainingAbilities />}
        {tab === 'targets' && <TargetsTab actions={actions} />}
        {tab === 'toggles' && <TogglesTab actions={actions} onOpenControls={onOpenControls} />}
        {tab === 'meter' && <MeterTab meter={meter} onReset={actions.resetMeter} />}
      </div>
    </Panel>
  );
});
