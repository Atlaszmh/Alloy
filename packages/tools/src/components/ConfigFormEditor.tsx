import React, { useState, useMemo } from 'react';
import type { GameConfig, AffixDef, AffixCategory, AffixTier, StatModifier, CompoundAffixDef, SynergyDef, BaseItemDef } from '@alloy/engine';
import { defaultConfig } from '@alloy/engine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConfigFormEditorProps {
  config: GameConfig;
  baselineConfig?: GameConfig;
  onChange: (updated: GameConfig) => void;
}

type TreeSelection =
  | { kind: 'affix'; id: string }
  | { kind: 'combination'; id: string }
  | { kind: 'synergy'; id: string }
  | { kind: 'baseItem'; id: string }
  | { kind: 'balance' }
  | null;

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = {
  root: {
    display: 'flex',
    height: '100%',
    minHeight: '600px',
    border: '1px solid #27272a',
    borderRadius: '8px',
    overflow: 'hidden',
    background: '#18181b',
  } as React.CSSProperties,

  sidebar: {
    width: '250px',
    minWidth: '250px',
    borderRight: '1px solid #27272a',
    overflowY: 'auto' as const,
    padding: '8px 0',
    background: '#18181b',
  } as React.CSSProperties,

  sidebarSection: {
    marginBottom: '4px',
  } as React.CSSProperties,

  sidebarSectionHeader: (_expanded: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: '#71717a',
    cursor: 'pointer',
    userSelect: 'none' as const,
    transition: 'color 0.15s',
  }) as React.CSSProperties,

  sidebarCategoryHeader: (_expanded: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 12px 4px 20px',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: '#52525b',
    cursor: 'pointer',
    userSelect: 'none' as const,
  }) as React.CSSProperties,

  sidebarItem: (selected: boolean, _changed: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '5px 12px 5px 28px',
    fontSize: '13px',
    color: selected ? '#e4e4e7' : '#a1a1aa',
    background: selected ? '#27272a' : 'transparent',
    cursor: 'pointer',
    borderLeft: selected ? '2px solid #6366f1' : '2px solid transparent',
    transition: 'all 0.1s',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }) as React.CSSProperties,

  sidebarItemLeaf: (selected: boolean, _changed: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '5px 12px 5px 20px',
    fontSize: '13px',
    color: selected ? '#e4e4e7' : '#a1a1aa',
    background: selected ? '#27272a' : 'transparent',
    cursor: 'pointer',
    borderLeft: selected ? '2px solid #6366f1' : '2px solid transparent',
    transition: 'all 0.1s',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }) as React.CSSProperties,

  changeDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#eab308',
    flexShrink: 0,
    marginLeft: '6px',
  } as React.CSSProperties,

  panel: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '24px',
  } as React.CSSProperties,

  panelTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#e4e4e7',
    marginBottom: '4px',
  } as React.CSSProperties,

  panelSubtitle: {
    fontSize: '12px',
    color: '#71717a',
    marginBottom: '20px',
  } as React.CSSProperties,

  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#52525b',
    fontSize: '14px',
  } as React.CSSProperties,

  fieldRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
  } as React.CSSProperties,

  fieldLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#a1a1aa',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    minWidth: '120px',
  } as React.CSSProperties,

  input: (changed: boolean) => ({
    padding: '6px 10px',
    background: '#27272a',
    border: `1px solid ${changed ? '#eab308' : '#3f3f46'}`,
    borderRadius: '5px',
    color: '#e4e4e7',
    fontSize: '13px',
    outline: 'none',
    minWidth: '160px',
  }) as React.CSSProperties,

  numberInput: (changed: boolean) => ({
    padding: '6px 10px',
    background: '#27272a',
    border: `1px solid ${changed ? '#eab308' : '#3f3f46'}`,
    borderRadius: '5px',
    color: '#e4e4e7',
    fontSize: '13px',
    outline: 'none',
    width: '100px',
  }) as React.CSSProperties,

  select: (changed: boolean) => ({
    padding: '6px 10px',
    background: '#27272a',
    border: `1px solid ${changed ? '#eab308' : '#3f3f46'}`,
    borderRadius: '5px',
    color: '#e4e4e7',
    fontSize: '13px',
    outline: 'none',
    cursor: 'pointer',
    minWidth: '140px',
  }) as React.CSSProperties,

  divider: {
    height: '1px',
    background: '#27272a',
    margin: '16px 0',
  } as React.CSSProperties,

  tierCard: {
    background: '#0f1117',
    border: '1px solid #27272a',
    borderRadius: '6px',
    padding: '14px 16px',
    marginBottom: '12px',
  } as React.CSSProperties,

  tierTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#a1a1aa',
    marginBottom: '10px',
  } as React.CSSProperties,

  effectRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  } as React.CSSProperties,

  effectLabel: {
    fontSize: '11px',
    color: '#52525b',
    minWidth: '60px',
  } as React.CSSProperties,

  rangeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '8px',
  } as React.CSSProperties,

  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
  } as React.CSSProperties,

  toggleLabel: {
    fontSize: '13px',
    color: '#a1a1aa',
  } as React.CSSProperties,

  toggle: (on: boolean) => ({
    position: 'relative' as const,
    display: 'inline-flex',
    width: '36px',
    height: '20px',
    background: on ? '#6366f1' : '#3f3f46',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'background 0.2s',
    flexShrink: 0,
  }) as React.CSSProperties,

  toggleKnob: (on: boolean) => ({
    position: 'absolute' as const,
    top: '3px',
    left: on ? '19px' : '3px',
    width: '14px',
    height: '14px',
    background: '#fff',
    borderRadius: '50%',
    transition: 'left 0.2s',
  }) as React.CSSProperties,

  addBtn: {
    padding: '4px 10px',
    background: 'transparent',
    border: '1px dashed #3f3f46',
    borderRadius: '5px',
    color: '#71717a',
    fontSize: '12px',
    cursor: 'pointer',
    marginTop: '6px',
  } as React.CSSProperties,

  removeBtn: {
    padding: '3px 7px',
    background: 'transparent',
    border: '1px solid #3f3f46',
    borderRadius: '4px',
    color: '#71717a',
    fontSize: '11px',
    cursor: 'pointer',
    flexShrink: 0,
  } as React.CSSProperties,

  changedBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    background: '#422006',
    border: '1px solid #78350f',
    borderRadius: '4px',
    fontSize: '11px',
    color: '#fbbf24',
    marginBottom: '12px',
  } as React.CSSProperties,

  sectionLabel: {
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: '#52525b',
    marginBottom: '10px',
    marginTop: '16px',
  } as React.CSSProperties,

  balanceGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginBottom: '16px',
  } as React.CSSProperties,

  balanceField: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  } as React.CSSProperties,

  chevron: (expanded: boolean) => ({
    fontSize: '10px',
    color: '#52525b',
    transform: expanded ? 'rotate(90deg)' : 'rotate(0)',
    transition: 'transform 0.15s',
    flexShrink: 0,
    width: '10px',
    display: 'inline-block',
    textAlign: 'center' as const,
  }) as React.CSSProperties,
};

// ─── Constants ────────────────────────────────────────────────────────────────

const AFFIX_CATEGORIES: AffixCategory[] = ['offensive', 'defensive', 'sustain', 'utility', 'trigger'];
const CATEGORY_LABELS: Record<AffixCategory, string> = {
  offensive: 'Offensive',
  defensive: 'Defensive',
  sustain: 'Sustain',
  utility: 'Utility',
  trigger: 'Trigger',
};

const STAT_OPTIONS = [
  'attackDamage', 'attackSpeed', 'critChance', 'critMultiplier',
  'armor', 'magicResist', 'healthRegen', 'maxHP',
  'lifesteal', 'spellPower', 'cooldownReduction', 'tenacity',
  'dodgeChance', 'penetration', 'thorns', 'shield',
];

const OP_OPTIONS: StatModifier['op'][] = ['flat', 'percent', 'override'];

const TIERS: AffixTier[] = [1, 2, 3, 4];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isStatModifierChanged(a: StatModifier, b: StatModifier): boolean {
  return a.stat !== b.stat || a.op !== b.op || a.value !== b.value;
}

function areEffectsChanged(a: StatModifier[], b: StatModifier[]): boolean {
  if (a.length !== b.length) return true;
  return a.some((m, i) => isStatModifierChanged(m, b[i]));
}

function isAffixChanged(a: AffixDef, b: AffixDef): boolean {
  if (a.name !== b.name || a.category !== b.category) return true;
  for (const tier of TIERS) {
    const ta = a.tiers[tier];
    const tb = b.tiers[tier];
    if (areEffectsChanged(ta.weaponEffect, tb.weaponEffect)) return true;
    if (areEffectsChanged(ta.armorEffect, tb.armorEffect)) return true;
    if (ta.valueRange[0] !== tb.valueRange[0] || ta.valueRange[1] !== tb.valueRange[1]) return true;
  }
  return false;
}

function isCombinationChanged(a: CompoundAffixDef, b: CompoundAffixDef): boolean {
  return (
    a.name !== b.name ||
    a.fluxCost !== b.fluxCost ||
    a.slotCost !== b.slotCost ||
    areEffectsChanged(a.weaponEffect, b.weaponEffect) ||
    areEffectsChanged(a.armorEffect, b.armorEffect)
  );
}

function isSynergyChanged(a: SynergyDef, b: SynergyDef): boolean {
  return (
    a.name !== b.name ||
    a.description !== b.description ||
    areEffectsChanged(a.bonusEffects, b.bonusEffects) ||
    a.requiredAffixes.join(',') !== b.requiredAffixes.join(',')
  );
}

function isBaseItemChanged(a: BaseItemDef, b: BaseItemDef): boolean {
  return (
    a.name !== b.name ||
    a.type !== b.type ||
    a.unlockLevel !== b.unlockLevel ||
    areEffectsChanged(a.inherentBonuses, b.inherentBonuses)
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={S.toggle(value)} onClick={() => onChange(!value)}>
      <div style={S.toggleKnob(value)} />
    </div>
  );
}

function StatModifierRow({
  modifier,
  baseline,
  onChange,
  onRemove,
}: {
  modifier: StatModifier;
  baseline: StatModifier | undefined;
  onChange: (m: StatModifier) => void;
  onRemove: () => void;
}) {
  const statChanged = baseline ? modifier.stat !== baseline.stat : false;
  const opChanged = baseline ? modifier.op !== baseline.op : false;
  const valChanged = baseline ? modifier.value !== baseline.value : false;

  return (
    <div style={S.effectRow}>
      <select
        style={S.select(statChanged)}
        value={modifier.stat}
        onChange={(e) => onChange({ ...modifier, stat: e.target.value })}
      >
        {STAT_OPTIONS.includes(modifier.stat) ? null : (
          <option value={modifier.stat}>{modifier.stat}</option>
        )}
        {STAT_OPTIONS.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <select
        style={S.select(opChanged)}
        value={modifier.op}
        onChange={(e) => onChange({ ...modifier, op: e.target.value as StatModifier['op'] })}
      >
        {OP_OPTIONS.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <input
        type="number"
        style={S.numberInput(valChanged)}
        value={modifier.value}
        step={0.01}
        onChange={(e) => onChange({ ...modifier, value: Number(e.target.value) })}
      />
      <button style={S.removeBtn} onClick={onRemove} title="Remove effect">✕</button>
    </div>
  );
}

function EffectList({
  label,
  effects,
  baselineEffects,
  onChange,
}: {
  label: string;
  effects: StatModifier[];
  baselineEffects: StatModifier[] | undefined;
  onChange: (effects: StatModifier[]) => void;
}) {
  function handleChange(i: number, m: StatModifier) {
    const next = [...effects];
    next[i] = m;
    onChange(next);
  }

  function handleRemove(i: number) {
    const next = effects.filter((_, idx) => idx !== i);
    onChange(next);
  }

  function handleAdd() {
    onChange([...effects, { stat: 'attackDamage', op: 'flat', value: 0 }]);
  }

  return (
    <div>
      <div style={S.effectLabel}>{label}</div>
      {effects.map((m, i) => (
        <StatModifierRow
          key={i}
          modifier={m}
          baseline={baselineEffects?.[i]}
          onChange={(updated) => handleChange(i, updated)}
          onRemove={() => handleRemove(i)}
        />
      ))}
      <button style={S.addBtn} onClick={handleAdd}>+ Add effect</button>
    </div>
  );
}

// ─── Affix Panel ─────────────────────────────────────────────────────────────

function AffixPanel({
  affix,
  baseline,
  disabledIds,
  onChange,
  onToggleDisabled,
}: {
  affix: AffixDef;
  baseline: AffixDef | undefined;
  disabledIds: Set<string>;
  onChange: (updated: AffixDef) => void;
  onToggleDisabled: (id: string) => void;
}) {
  const isDisabled = disabledIds.has(affix.id);
  const nameChanged = baseline ? affix.name !== baseline.name : false;
  const catChanged = baseline ? affix.category !== baseline.category : false;

  function updateTierWeapon(tier: AffixTier, effects: StatModifier[]) {
    const next = { ...affix, tiers: { ...affix.tiers, [tier]: { ...affix.tiers[tier], weaponEffect: effects } } };
    onChange(next);
  }

  function updateTierArmor(tier: AffixTier, effects: StatModifier[]) {
    const next = { ...affix, tiers: { ...affix.tiers, [tier]: { ...affix.tiers[tier], armorEffect: effects } } };
    onChange(next);
  }

  function updateValueRange(tier: AffixTier, idx: 0 | 1, val: number) {
    const cur = affix.tiers[tier].valueRange;
    const range: [number, number] = idx === 0 ? [val, cur[1]] : [cur[0], val];
    const next = { ...affix, tiers: { ...affix.tiers, [tier]: { ...affix.tiers[tier], valueRange: range } } };
    onChange(next);
  }

  const anyChanged = baseline ? isAffixChanged(affix, baseline) : false;

  return (
    <div>
      <div style={S.panelTitle}>{affix.name}</div>
      <div style={S.panelSubtitle}>ID: {affix.id} · {affix.category}</div>

      {anyChanged && (
        <div style={S.changedBadge}>
          <span style={{ fontSize: '8px', lineHeight: 1 }}>●</span>
          Modified from baseline
        </div>
      )}

      <div style={S.toggleRow}>
        <Toggle value={!isDisabled} onChange={() => onToggleDisabled(affix.id)} />
        <span style={S.toggleLabel}>{isDisabled ? 'Disabled (will not appear in draft)' : 'Enabled'}</span>
      </div>

      <div style={S.divider} />

      <div style={S.fieldRow}>
        <span style={S.fieldLabel}>Name</span>
        <input
          style={S.input(nameChanged)}
          value={affix.name}
          onChange={(e) => onChange({ ...affix, name: e.target.value })}
        />
      </div>

      <div style={S.fieldRow}>
        <span style={S.fieldLabel}>Category</span>
        <select
          style={S.select(catChanged)}
          value={affix.category}
          onChange={(e) => onChange({ ...affix, category: e.target.value as AffixCategory })}
        >
          {AFFIX_CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </div>

      <div style={S.divider} />

      {TIERS.map((tier) => {
        const td = affix.tiers[tier];
        const bt = baseline?.tiers[tier];
        const tierChanged = bt
          ? areEffectsChanged(td.weaponEffect, bt.weaponEffect) ||
            areEffectsChanged(td.armorEffect, bt.armorEffect) ||
            td.valueRange[0] !== bt.valueRange[0] ||
            td.valueRange[1] !== bt.valueRange[1]
          : false;

        return (
          <div key={tier} style={{ ...S.tierCard, border: `1px solid ${tierChanged ? '#78350f' : '#27272a'}` }}>
            <div style={S.tierTitle}>
              Tier {tier}
              {tierChanged && <span style={{ color: '#eab308', marginLeft: '8px', fontSize: '11px' }}>● modified</span>}
            </div>

            <EffectList
              label="Weapon Effects"
              effects={td.weaponEffect}
              baselineEffects={bt?.weaponEffect}
              onChange={(effects) => updateTierWeapon(tier, effects)}
            />

            <div style={{ marginTop: '12px' }}>
              <EffectList
                label="Armor Effects"
                effects={td.armorEffect}
                baselineEffects={bt?.armorEffect}
                onChange={(effects) => updateTierArmor(tier, effects)}
              />
            </div>

            <div style={S.rangeRow}>
              <span style={S.effectLabel}>Value Range</span>
              <input
                type="number"
                style={S.numberInput(bt ? td.valueRange[0] !== bt.valueRange[0] : false)}
                value={td.valueRange[0]}
                onChange={(e) => updateValueRange(tier, 0, Number(e.target.value))}
                placeholder="min"
              />
              <span style={{ color: '#52525b', fontSize: '12px' }}>–</span>
              <input
                type="number"
                style={S.numberInput(bt ? td.valueRange[1] !== bt.valueRange[1] : false)}
                value={td.valueRange[1]}
                onChange={(e) => updateValueRange(tier, 1, Number(e.target.value))}
                placeholder="max"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Combination Panel ────────────────────────────────────────────────────────

function CombinationPanel({
  combo,
  baseline,
  disabledIds,
  onChange,
  onToggleDisabled,
}: {
  combo: CompoundAffixDef;
  baseline: CompoundAffixDef | undefined;
  disabledIds: Set<string>;
  onChange: (updated: CompoundAffixDef) => void;
  onToggleDisabled: (id: string) => void;
}) {
  const isDisabled = disabledIds.has(combo.id);
  const anyChanged = baseline ? isCombinationChanged(combo, baseline) : false;
  const nameChanged = baseline ? combo.name !== baseline.name : false;
  const fluxChanged = baseline ? combo.fluxCost !== baseline.fluxCost : false;
  const slotChanged = baseline ? combo.slotCost !== baseline.slotCost : false;

  return (
    <div>
      <div style={S.panelTitle}>{combo.name}</div>
      <div style={S.panelSubtitle}>ID: {combo.id} · Components: {combo.components.join(' + ')}</div>

      {anyChanged && (
        <div style={S.changedBadge}>
          <span style={{ fontSize: '8px', lineHeight: 1 }}>●</span>
          Modified from baseline
        </div>
      )}

      <div style={S.toggleRow}>
        <Toggle value={!isDisabled} onChange={() => onToggleDisabled(combo.id)} />
        <span style={S.toggleLabel}>{isDisabled ? 'Disabled' : 'Enabled'}</span>
      </div>

      <div style={S.divider} />

      <div style={S.fieldRow}>
        <span style={S.fieldLabel}>Name</span>
        <input
          style={S.input(nameChanged)}
          value={combo.name}
          onChange={(e) => onChange({ ...combo, name: e.target.value })}
        />
      </div>

      <div style={S.fieldRow}>
        <span style={S.fieldLabel}>Flux Cost</span>
        <input
          type="number"
          style={S.numberInput(fluxChanged)}
          value={combo.fluxCost}
          min={0}
          onChange={(e) => onChange({ ...combo, fluxCost: Number(e.target.value) })}
        />
      </div>

      <div style={S.fieldRow}>
        <span style={S.fieldLabel}>Slot Cost</span>
        <input
          type="number"
          style={S.numberInput(slotChanged)}
          value={combo.slotCost}
          min={1}
          onChange={(e) => onChange({ ...combo, slotCost: Number(e.target.value) })}
        />
      </div>

      <div style={S.divider} />

      <div style={S.tierCard}>
        <EffectList
          label="Weapon Effects"
          effects={combo.weaponEffect}
          baselineEffects={baseline?.weaponEffect}
          onChange={(effects) => onChange({ ...combo, weaponEffect: effects })}
        />
        <div style={{ marginTop: '12px' }}>
          <EffectList
            label="Armor Effects"
            effects={combo.armorEffect}
            baselineEffects={baseline?.armorEffect}
            onChange={(effects) => onChange({ ...combo, armorEffect: effects })}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Synergy Panel ─────────────────────────────────────────────────────────────

function SynergyPanel({
  synergy,
  baseline,
  disabledIds,
  onChange,
  onToggleDisabled,
}: {
  synergy: SynergyDef;
  baseline: SynergyDef | undefined;
  disabledIds: Set<string>;
  onChange: (updated: SynergyDef) => void;
  onToggleDisabled: (id: string) => void;
}) {
  const isDisabled = disabledIds.has(synergy.id);
  const anyChanged = baseline ? isSynergyChanged(synergy, baseline) : false;
  const nameChanged = baseline ? synergy.name !== baseline.name : false;
  const descChanged = baseline ? synergy.description !== baseline.description : false;
  const reqChanged = baseline
    ? synergy.requiredAffixes.join(',') !== baseline.requiredAffixes.join(',')
    : false;

  function updateRequired(val: string) {
    onChange({ ...synergy, requiredAffixes: val.split(',').map((s) => s.trim()).filter(Boolean) });
  }

  return (
    <div>
      <div style={S.panelTitle}>{synergy.name}</div>
      <div style={S.panelSubtitle}>ID: {synergy.id}</div>

      {anyChanged && (
        <div style={S.changedBadge}>
          <span style={{ fontSize: '8px', lineHeight: 1 }}>●</span>
          Modified from baseline
        </div>
      )}

      <div style={S.toggleRow}>
        <Toggle value={!isDisabled} onChange={() => onToggleDisabled(synergy.id)} />
        <span style={S.toggleLabel}>{isDisabled ? 'Disabled' : 'Enabled'}</span>
      </div>

      <div style={S.divider} />

      <div style={S.fieldRow}>
        <span style={S.fieldLabel}>Name</span>
        <input
          style={S.input(nameChanged)}
          value={synergy.name}
          onChange={(e) => onChange({ ...synergy, name: e.target.value })}
        />
      </div>

      <div style={S.fieldRow}>
        <span style={S.fieldLabel}>Description</span>
        <input
          style={{ ...S.input(descChanged), minWidth: '260px' }}
          value={synergy.description}
          onChange={(e) => onChange({ ...synergy, description: e.target.value })}
        />
      </div>

      <div style={S.fieldRow}>
        <span style={S.fieldLabel}>Required Affixes</span>
        <input
          style={{ ...S.input(reqChanged), minWidth: '260px', fontFamily: 'monospace' }}
          value={synergy.requiredAffixes.join(', ')}
          onChange={(e) => updateRequired(e.target.value)}
          placeholder="Comma-separated affix IDs or tags"
        />
      </div>

      <div style={S.divider} />

      <div style={S.tierCard}>
        <EffectList
          label="Bonus Effects"
          effects={synergy.bonusEffects}
          baselineEffects={baseline?.bonusEffects}
          onChange={(effects) => onChange({ ...synergy, bonusEffects: effects })}
        />
      </div>
    </div>
  );
}

// ─── Base Item Panel ──────────────────────────────────────────────────────────

function BaseItemPanel({
  item,
  baseline,
  disabledIds,
  onChange,
  onToggleDisabled,
}: {
  item: BaseItemDef;
  baseline: BaseItemDef | undefined;
  disabledIds: Set<string>;
  onChange: (updated: BaseItemDef) => void;
  onToggleDisabled: (id: string) => void;
}) {
  const isDisabled = disabledIds.has(item.id);
  const anyChanged = baseline ? isBaseItemChanged(item, baseline) : false;
  const nameChanged = baseline ? item.name !== baseline.name : false;
  const typeChanged = baseline ? item.type !== baseline.type : false;
  const levelChanged = baseline ? item.unlockLevel !== baseline.unlockLevel : false;

  return (
    <div>
      <div style={S.panelTitle}>{item.name}</div>
      <div style={S.panelSubtitle}>ID: {item.id} · {item.type}</div>

      {anyChanged && (
        <div style={S.changedBadge}>
          <span style={{ fontSize: '8px', lineHeight: 1 }}>●</span>
          Modified from baseline
        </div>
      )}

      <div style={S.toggleRow}>
        <Toggle value={!isDisabled} onChange={() => onToggleDisabled(item.id)} />
        <span style={S.toggleLabel}>{isDisabled ? 'Disabled' : 'Enabled'}</span>
      </div>

      <div style={S.divider} />

      <div style={S.fieldRow}>
        <span style={S.fieldLabel}>Name</span>
        <input
          style={S.input(nameChanged)}
          value={item.name}
          onChange={(e) => onChange({ ...item, name: e.target.value })}
        />
      </div>

      <div style={S.fieldRow}>
        <span style={S.fieldLabel}>Type</span>
        <select
          style={S.select(typeChanged)}
          value={item.type}
          onChange={(e) => onChange({ ...item, type: e.target.value as 'weapon' | 'armor' })}
        >
          <option value="weapon">Weapon</option>
          <option value="armor">Armor</option>
        </select>
      </div>

      <div style={S.fieldRow}>
        <span style={S.fieldLabel}>Unlock Level</span>
        <input
          type="number"
          style={S.numberInput(levelChanged)}
          value={item.unlockLevel}
          min={0}
          onChange={(e) => onChange({ ...item, unlockLevel: Number(e.target.value) })}
        />
      </div>

      <div style={S.divider} />

      <div style={S.tierCard}>
        <EffectList
          label="Inherent Bonuses"
          effects={item.inherentBonuses}
          baselineEffects={baseline?.inherentBonuses}
          onChange={(effects) => onChange({ ...item, inherentBonuses: effects })}
        />
      </div>
    </div>
  );
}

// ─── Balance Panel ─────────────────────────────────────────────────────────────

function BalanceNumField({
  label,
  value,
  baselineValue,
  onChange,
  step,
  min,
}: {
  label: string;
  value: number;
  baselineValue: number | undefined;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
}) {
  const changed = baselineValue !== undefined && value !== baselineValue;
  return (
    <div style={S.balanceField}>
      <span style={{ ...S.fieldLabel, minWidth: 'unset' }}>{label}</span>
      <input
        type="number"
        style={S.numberInput(changed)}
        value={value}
        step={step ?? 1}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function BalancePanel({
  config,
  baseline,
  onChange,
}: {
  config: GameConfig;
  baseline: GameConfig | undefined;
  onChange: (updated: GameConfig) => void;
}) {
  const bal = config.balance;
  const bbl = baseline?.balance;

  function update<K extends keyof typeof bal>(key: K, value: (typeof bal)[K]) {
    onChange({ ...config, balance: { ...bal, [key]: value } });
  }

  function updateFlux(idx: 0 | 1 | 2, val: number) {
    const next: [number, number, number] = [...bal.fluxPerRound] as [number, number, number];
    next[idx] = val;
    update('fluxPerRound', next);
  }

  function updateDraftPool(idx: 0 | 1 | 2, val: number) {
    const next: [number, number, number] = [...bal.draftPoolPerRound] as [number, number, number];
    next[idx] = val;
    update('draftPoolPerRound', next);
  }

  function updateDraftPicks(idx: 0 | 1 | 2, val: number) {
    const next: [number, number, number] = [...bal.draftPicksPerPlayer] as [number, number, number];
    next[idx] = val;
    update('draftPicksPerPlayer', next);
  }

  function updateTierDist(tier: AffixTier, val: number) {
    update('tierDistribution', { ...bal.tierDistribution, [tier]: val });
  }

  function updateFluxCost(key: keyof typeof bal.fluxCosts, val: number) {
    update('fluxCosts', { ...bal.fluxCosts, [key]: val });
  }

  return (
    <div>
      <div style={S.panelTitle}>Balance Configuration</div>
      <div style={S.panelSubtitle}>Core numeric parameters that govern match pacing and power budgets.</div>

      <div style={S.sectionLabel}>Combat</div>
      <div style={S.balanceGrid}>
        <BalanceNumField label="Base HP" value={bal.baseHP} baselineValue={bbl?.baseHP} onChange={(v) => update('baseHP', v)} />
        <BalanceNumField label="Ticks/Second" value={bal.ticksPerSecond} baselineValue={bbl?.ticksPerSecond} onChange={(v) => update('ticksPerSecond', v)} min={1} />
        <BalanceNumField label="Max Duel Ticks" value={bal.maxDuelTicks} baselineValue={bbl?.maxDuelTicks} onChange={(v) => update('maxDuelTicks', v)} min={1} />
        <BalanceNumField label="Base Crit Mult" value={bal.baseCritMultiplier} baselineValue={bbl?.baseCritMultiplier} onChange={(v) => update('baseCritMultiplier', v)} step={0.1} />
        <BalanceNumField label="Min Attack Interval (ticks)" value={bal.minAttackInterval} baselineValue={bbl?.minAttackInterval} onChange={(v) => update('minAttackInterval', v)} min={1} />
      </div>

      <div style={S.sectionLabel}>Flux</div>
      <div style={S.balanceGrid}>
        <BalanceNumField label="Flux Round 1" value={bal.fluxPerRound[0]} baselineValue={bbl?.fluxPerRound[0]} onChange={(v) => updateFlux(0, v)} min={0} />
        <BalanceNumField label="Flux Round 2" value={bal.fluxPerRound[1]} baselineValue={bbl?.fluxPerRound[1]} onChange={(v) => updateFlux(1, v)} min={0} />
        <BalanceNumField label="Flux Round 3" value={bal.fluxPerRound[2]} baselineValue={bbl?.fluxPerRound[2]} onChange={(v) => updateFlux(2, v)} min={0} />
        <BalanceNumField label="Quick Match Flux" value={bal.quickMatchFlux} baselineValue={bbl?.quickMatchFlux} onChange={(v) => update('quickMatchFlux', v)} min={0} />
      </div>

      <div style={S.sectionLabel}>Flux Costs</div>
      <div style={S.balanceGrid}>
        <BalanceNumField label="Assign Orb" value={bal.fluxCosts.assignOrb} baselineValue={bbl?.fluxCosts.assignOrb} onChange={(v) => updateFluxCost('assignOrb', v)} min={0} />
        <BalanceNumField label="Combine Orbs" value={bal.fluxCosts.combineOrbs} baselineValue={bbl?.fluxCosts.combineOrbs} onChange={(v) => updateFluxCost('combineOrbs', v)} min={0} />
        <BalanceNumField label="Upgrade Tier" value={bal.fluxCosts.upgradeTier} baselineValue={bbl?.fluxCosts.upgradeTier} onChange={(v) => updateFluxCost('upgradeTier', v)} min={0} />
        <BalanceNumField label="Swap Orb" value={bal.fluxCosts.swapOrb} baselineValue={bbl?.fluxCosts.swapOrb} onChange={(v) => updateFluxCost('swapOrb', v)} min={0} />
        <BalanceNumField label="Remove Orb" value={bal.fluxCosts.removeOrb} baselineValue={bbl?.fluxCosts.removeOrb} onChange={(v) => updateFluxCost('removeOrb', v)} min={0} />
      </div>

      <div style={S.sectionLabel}>Draft</div>
      <div style={S.balanceGrid}>
        <BalanceNumField label="Pool Round 1" value={bal.draftPoolPerRound[0]} baselineValue={bbl?.draftPoolPerRound[0]} onChange={(v) => updateDraftPool(0, v)} min={1} />
        <BalanceNumField label="Pool Round 2" value={bal.draftPoolPerRound[1]} baselineValue={bbl?.draftPoolPerRound[1]} onChange={(v) => updateDraftPool(1, v)} min={1} />
        <BalanceNumField label="Pool Round 3" value={bal.draftPoolPerRound[2]} baselineValue={bbl?.draftPoolPerRound[2]} onChange={(v) => updateDraftPool(2, v)} min={1} />
        <BalanceNumField label="Picks Round 1" value={bal.draftPicksPerPlayer[0]} baselineValue={bbl?.draftPicksPerPlayer[0]} onChange={(v) => updateDraftPicks(0, v)} min={1} />
        <BalanceNumField label="Picks Round 2" value={bal.draftPicksPerPlayer[1]} baselineValue={bbl?.draftPicksPerPlayer[1]} onChange={(v) => updateDraftPicks(1, v)} min={1} />
        <BalanceNumField label="Picks Round 3" value={bal.draftPicksPerPlayer[2]} baselineValue={bbl?.draftPicksPerPlayer[2]} onChange={(v) => updateDraftPicks(2, v)} min={1} />
        <BalanceNumField label="Quick Pool Min" value={bal.draftPoolSizeQuick.min} baselineValue={bbl?.draftPoolSizeQuick.min} onChange={(v) => update('draftPoolSizeQuick', { ...bal.draftPoolSizeQuick, min: v })} min={1} />
        <BalanceNumField label="Quick Pool Max" value={bal.draftPoolSizeQuick.max} baselineValue={bbl?.draftPoolSizeQuick.max} onChange={(v) => update('draftPoolSizeQuick', { ...bal.draftPoolSizeQuick, max: v })} min={1} />
        <BalanceNumField label="Draft Timer (sec)" value={bal.draftTimerSeconds} baselineValue={bbl?.draftTimerSeconds} onChange={(v) => update('draftTimerSeconds', v)} min={5} />
        <BalanceNumField label="Archetype Min Orbs" value={bal.archetypeMinOrbs} baselineValue={bbl?.archetypeMinOrbs} onChange={(v) => update('archetypeMinOrbs', v)} min={1} />
      </div>

      <div style={S.sectionLabel}>Forge Timers</div>
      <div style={S.balanceGrid}>
        <BalanceNumField label="Forge Timer Round 1 (sec)" value={bal.forgeTimerSeconds.round1} baselineValue={bbl?.forgeTimerSeconds.round1} onChange={(v) => update('forgeTimerSeconds', { ...bal.forgeTimerSeconds, round1: v })} min={5} />
        <BalanceNumField label="Forge Timer Subsequent (sec)" value={bal.forgeTimerSeconds.subsequent} baselineValue={bbl?.forgeTimerSeconds.subsequent} onChange={(v) => update('forgeTimerSeconds', { ...bal.forgeTimerSeconds, subsequent: v })} min={5} />
      </div>

      <div style={S.sectionLabel}>Tier Distribution</div>
      <div style={S.balanceGrid}>
        {TIERS.map((tier) => (
          <BalanceNumField
            key={tier}
            label={`Tier ${tier} Weight`}
            value={bal.tierDistribution[tier]}
            baselineValue={bbl?.tierDistribution[tier]}
            onChange={(v) => updateTierDist(tier, v)}
            step={0.01}
            min={0}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function SidebarSection({
  title,
  defaultExpanded = true,
  children,
}: {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div style={S.sidebarSection}>
      <div style={S.sidebarSectionHeader(expanded)} onClick={() => setExpanded(!expanded)}>
        <span style={S.chevron(expanded)}>▶</span>
        {title}
      </div>
      {expanded && <div>{children}</div>}
    </div>
  );
}

function SidebarCategoryGroup({
  category,
  affixes,
  baselineAffixes,
  selected,
  onSelect,
}: {
  category: AffixCategory;
  affixes: AffixDef[];
  baselineAffixes: AffixDef[];
  selected: TreeSelection;
  onSelect: (sel: TreeSelection) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const baselineMap = useMemo(() => {
    const m = new Map<string, AffixDef>();
    for (const a of baselineAffixes) m.set(a.id, a);
    return m;
  }, [baselineAffixes]);

  return (
    <div>
      <div style={S.sidebarCategoryHeader(expanded)} onClick={() => setExpanded(!expanded)}>
        <span style={S.chevron(expanded)}>▶</span>
        {CATEGORY_LABELS[category]}
        <span style={{ marginLeft: 'auto', color: '#3f3f46', fontSize: '11px' }}>{affixes.length}</span>
      </div>
      {expanded && affixes.map((a) => {
        const isSelected = selected?.kind === 'affix' && selected.id === a.id;
        const bl = baselineMap.get(a.id);
        const changed = bl ? isAffixChanged(a, bl) : false;
        return (
          <div
            key={a.id}
            style={S.sidebarItem(isSelected, changed)}
            onClick={() => onSelect({ kind: 'affix', id: a.id })}
            title={a.name}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
            {changed && <span style={S.changeDot} title="Modified from baseline" />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ConfigFormEditor({ config, baselineConfig, onChange }: ConfigFormEditorProps) {
  const baseline = baselineConfig ?? defaultConfig();

  const [selected, setSelected] = useState<TreeSelection>(null);
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());

  const affixesByCategory = useMemo(() => {
    const map = new Map<AffixCategory, AffixDef[]>();
    for (const cat of AFFIX_CATEGORIES) map.set(cat, []);
    for (const a of config.affixes) map.get(a.category)?.push(a);
    return map;
  }, [config.affixes]);

  const baselineAffixMap = useMemo(() => {
    const m = new Map<string, AffixDef>();
    for (const a of baseline.affixes) m.set(a.id, a);
    return m;
  }, [baseline.affixes]);

  const baselineComboMap = useMemo(() => {
    const m = new Map<string, CompoundAffixDef>();
    for (const c of baseline.combinations) m.set(c.id, c);
    return m;
  }, [baseline.combinations]);

  const baselineSynergyMap = useMemo(() => {
    const m = new Map<string, SynergyDef>();
    for (const s of baseline.synergies) m.set(s.id, s);
    return m;
  }, [baseline.synergies]);

  const baselineItemMap = useMemo(() => {
    const m = new Map<string, BaseItemDef>();
    for (const i of baseline.baseItems) m.set(i.id, i);
    return m;
  }, [baseline.baseItems]);

  function toggleDisabled(id: string) {
    setDisabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateAffix(updated: AffixDef) {
    onChange({ ...config, affixes: config.affixes.map((a) => (a.id === updated.id ? updated : a)) });
  }

  function updateCombination(updated: CompoundAffixDef) {
    onChange({ ...config, combinations: config.combinations.map((c) => (c.id === updated.id ? updated : c)) });
  }

  function updateSynergy(updated: SynergyDef) {
    onChange({ ...config, synergies: config.synergies.map((s) => (s.id === updated.id ? updated : s)) });
  }

  function updateBaseItem(updated: BaseItemDef) {
    onChange({ ...config, baseItems: config.baseItems.map((i) => (i.id === updated.id ? updated : i)) });
  }

  // ─── Render panel based on selection ─────────────────────────────────────

  let panelContent: React.ReactNode = (
    <div style={S.emptyState}>Select an item from the tree to edit</div>
  );

  if (selected?.kind === 'affix') {
    const affix = config.affixes.find((a) => a.id === selected.id);
    if (affix) {
      panelContent = (
        <AffixPanel
          affix={affix}
          baseline={baselineAffixMap.get(affix.id)}
          disabledIds={disabledIds}
          onChange={updateAffix}
          onToggleDisabled={toggleDisabled}
        />
      );
    }
  } else if (selected?.kind === 'combination') {
    const combo = config.combinations.find((c) => c.id === selected.id);
    if (combo) {
      panelContent = (
        <CombinationPanel
          combo={combo}
          baseline={baselineComboMap.get(combo.id)}
          disabledIds={disabledIds}
          onChange={updateCombination}
          onToggleDisabled={toggleDisabled}
        />
      );
    }
  } else if (selected?.kind === 'synergy') {
    const syn = config.synergies.find((s) => s.id === selected.id);
    if (syn) {
      panelContent = (
        <SynergyPanel
          synergy={syn}
          baseline={baselineSynergyMap.get(syn.id)}
          disabledIds={disabledIds}
          onChange={updateSynergy}
          onToggleDisabled={toggleDisabled}
        />
      );
    }
  } else if (selected?.kind === 'baseItem') {
    const item = config.baseItems.find((i) => i.id === selected.id);
    if (item) {
      panelContent = (
        <BaseItemPanel
          item={item}
          baseline={baselineItemMap.get(item.id)}
          disabledIds={disabledIds}
          onChange={updateBaseItem}
          onToggleDisabled={toggleDisabled}
        />
      );
    }
  } else if (selected?.kind === 'balance') {
    panelContent = (
      <BalancePanel config={config} baseline={baseline} onChange={onChange} />
    );
  }

  return (
    <div style={S.root}>
      {/* Sidebar */}
      <nav style={S.sidebar}>
        {/* Affixes */}
        <SidebarSection title="Affixes">
          {AFFIX_CATEGORIES.map((cat) => (
            <SidebarCategoryGroup
              key={cat}
              category={cat}
              affixes={affixesByCategory.get(cat) ?? []}
              baselineAffixes={baseline.affixes.filter((a) => a.category === cat)}
              selected={selected}
              onSelect={setSelected}
            />
          ))}
        </SidebarSection>

        {/* Combinations */}
        <SidebarSection title="Combinations" defaultExpanded={false}>
          {config.combinations.map((c) => {
            const isSelected = selected?.kind === 'combination' && selected.id === c.id;
            const bl = baselineComboMap.get(c.id);
            const changed = bl ? isCombinationChanged(c, bl) : false;
            return (
              <div
                key={c.id}
                style={S.sidebarItemLeaf(isSelected, changed)}
                onClick={() => setSelected({ kind: 'combination', id: c.id })}
                title={c.name}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                {changed && <span style={S.changeDot} title="Modified from baseline" />}
              </div>
            );
          })}
        </SidebarSection>

        {/* Synergies */}
        <SidebarSection title="Synergies" defaultExpanded={false}>
          {config.synergies.map((s) => {
            const isSelected = selected?.kind === 'synergy' && selected.id === s.id;
            const bl = baselineSynergyMap.get(s.id);
            const changed = bl ? isSynergyChanged(s, bl) : false;
            return (
              <div
                key={s.id}
                style={S.sidebarItemLeaf(isSelected, changed)}
                onClick={() => setSelected({ kind: 'synergy', id: s.id })}
                title={s.name}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                {changed && <span style={S.changeDot} title="Modified from baseline" />}
              </div>
            );
          })}
        </SidebarSection>

        {/* Base Items */}
        <SidebarSection title="Base Items" defaultExpanded={false}>
          {config.baseItems.map((item) => {
            const isSelected = selected?.kind === 'baseItem' && selected.id === item.id;
            const bl = baselineItemMap.get(item.id);
            const changed = bl ? isBaseItemChanged(item, bl) : false;
            return (
              <div
                key={item.id}
                style={S.sidebarItemLeaf(isSelected, changed)}
                onClick={() => setSelected({ kind: 'baseItem', id: item.id })}
                title={item.name}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
                {changed && <span style={S.changeDot} title="Modified from baseline" />}
              </div>
            );
          })}
        </SidebarSection>

        {/* Balance */}
        <SidebarSection title="Balance" defaultExpanded={false}>
          <div
            style={S.sidebarItemLeaf(selected?.kind === 'balance', false)}
            onClick={() => setSelected({ kind: 'balance' })}
          >
            <span>Balance Config</span>
          </div>
        </SidebarSection>
      </nav>

      {/* Right panel */}
      <div style={S.panel}>
        {panelContent}
      </div>
    </div>
  );
}
