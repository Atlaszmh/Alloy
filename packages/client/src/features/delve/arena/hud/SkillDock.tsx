import type { RefObject } from 'react';
import type { ArpgWorld } from '@alloy/engine';
import { useControlsStore } from '@/stores/controlsStore';
import type { ControlAction, ControlsConfig } from '@/features/controls/controls';
import { Glyph, Tooltip, type Binding } from '@/features/delve/kit';
import { manaStyle } from '../../format';
import { getDelveRegistry } from '../../registry';
import type { AbilityHud, ArenaHud } from '../useArena';
import { BuffRow } from './BuffRow';
import { Vitals } from './Vitals';
import { SkillTooltip } from './SkillTooltip';
import {
  BoundGlyph,
  GALVANIZE_SPARK,
  RuneDots,
  SLOT_STYLE,
  SkillSlot,
  TickBar,
  noFocus,
} from './SkillSlot';

export interface SkillDockProps {
  hud: ArenaHud | null;
  onCast: (slot: 0 | 1 | 2) => void;
  onDodge: () => void;
  onPotion: () => void;
  onAttack: () => void;
  /** The Attack slot's mode. */
  manualAttack: boolean;
  /** The fight's world, for the skill tooltip's numbers (3A's addition to the contract). */
  world?: RefObject<ArpgWorld | null>;
}

const SLOT_ACTION = ['primary', 'defensive', 'ultimate'] as const;

/** An action's key and pad button from the player's setup. */
const bindingOf = (cfg: ControlsConfig, action: ControlAction): Binding => ({
  key: cfg.keys[action] ?? undefined,
  pad: cfg.pad[action] ?? undefined,
});

/** The cost line under a skill's name: its mana (and a cast's wind-up), or its charge. */
function costText(ab: AbilityHud): string {
  if (ab.payment === 'charge') return `charge ${Math.floor((ab.charge ?? 0) * 100)}%`;
  return `${Math.round(ab.cost)} mana${ab.payment === 'cast' ? ' · cast' : ''}`;
}

/**
 * The HUD's bottom-left dock (Hades style, no box): Q, E and R stacked, each its slot, name,
 * chain-step bar and cost line, with its tooltip beside the row on hover, on focus, or while
 * its hold charges; then Dodge, Potion and Attack with the buff tiles; then the life and mana
 * bars. A skill the weapon doesn't carry has no row.
 */
export function SkillDock({
  hud,
  onCast,
  onDodge,
  onPotion,
  onAttack,
  manualAttack,
  world,
}: SkillDockProps) {
  const config = useControlsStore((s) => s.config);
  const registry = getDelveRegistry();
  const galvanized =
    !!hud && hud.galvanizedAt !== null && hud.t - hud.galvanizedAt < GALVANIZE_SPARK;
  const buffs = hud?.buffs ?? [];
  const charges = hud?.dodgeCharges ?? 0;
  const max = hud?.dodgeMax ?? 2;
  const refill = hud?.dodgeRefill ?? 0;
  const riposte = !!hud?.riposte;
  return (
    <div
      className="flex w-[600px] flex-col gap-4 [text-shadow:2px_2px_0_#181425]"
      data-testid="skill-bar"
      aria-label="Skills and vitals"
    >
      {hud?.abilities.map((ab, i) => {
        if (!ab) return null;
        const slot = i as 0 | 1 | 2;
        const color = manaStyle(registry, ab.elements[0]).color;
        return (
          <Tooltip
            key={slot}
            placement="right"
            portal={false}
            openWhile={ab.hold !== null}
            content={() => <SkillTooltip slot={slot} ab={ab} world={world?.current ?? null} />}
          >
            <div className="grid grid-cols-[76px_260px] items-center gap-[22px] self-start">
              <SkillSlot
                slot={slot}
                ab={ab}
                busy={hud.busy}
                galvanized={galvanized}
                binding={bindingOf(config, SLOT_ACTION[slot])}
                onCast={onCast}
              />
              <div className="flex flex-col gap-[6px]">
                <span className="k-disp text-[22px]">{ab.name}</span>
                <span className="flex gap-[3px]" aria-hidden>
                  {Array.from({ length: ab.chainLength }, (_, k) => (
                    <span
                      key={k}
                      data-chain={k === ab.chainStep ? 'next' : 'step'}
                      className="h-[5px] w-4"
                      style={{
                        background:
                          k < ab.chainStep
                            ? color
                            : k === ab.chainStep
                              ? 'var(--k-text)'
                              : 'var(--k-steel-1)',
                      }}
                    />
                  ))}
                </span>
                <span
                  className="text-[14px]"
                  data-testid={`ability-cost-${slot}`}
                  style={{
                    color: !ab.affordable
                      ? 'var(--k-hot)'
                      : ab.payment === 'charge'
                        ? 'var(--k-text-2)'
                        : 'var(--k-mana)',
                  }}
                >
                  {costText(ab)}
                </span>
              </div>
            </div>
          </Tooltip>
        );
      })}
      <div className="flex items-end gap-[22px] pt-1">
        <button
          type="button"
          className="pointer-events-auto relative flex h-14 w-14 items-center justify-center"
          style={{
            ...SLOT_STYLE,
            borderColor: riposte ? '#fee761' : '#5a6988',
            opacity: charges > 0 ? 1 : 0.55,
          }}
          aria-label="Dodge"
          data-testid="dodge-button"
          data-charges={charges}
          data-riposte={riposte}
          onMouseDown={noFocus}
          onClick={onDodge}
        >
          <Glyph id="dodge" size={28} />
          <span className="absolute inset-x-[6px] top-[5px] flex gap-[3px]" aria-hidden>
            {Array.from({ length: max }, (_, k) => (
              <span
                key={k}
                data-pip={k < charges ? 'full' : 'empty'}
                className="relative h-[5px] flex-1 bg-[var(--k-steel-1)]"
              >
                <span
                  className="absolute inset-y-0 left-0 bg-[var(--k-text)]"
                  style={{ width: k < charges ? '100%' : k === charges ? `${refill * 100}%` : 0 }}
                />
              </span>
            ))}
          </span>
          <BoundGlyph binding={bindingOf(config, 'dodge')} />
        </button>
        <button
          type="button"
          className="pointer-events-auto relative flex h-14 w-14 flex-col items-center justify-center"
          style={SLOT_STYLE}
          aria-label="Drink potion"
          data-testid="potion-button"
          disabled={!hud || hud.potions <= 0}
          onMouseDown={noFocus}
          onClick={onPotion}
        >
          <Glyph id="potion" size={22} />
          <span className="k-disp text-[16px]">×{hud?.potions ?? 0}</span>
          <BoundGlyph binding={bindingOf(config, 'potion')} />
        </button>
        <button
          type="button"
          className="pointer-events-auto relative flex h-14 w-14 items-center justify-center"
          style={{ ...SLOT_STYLE, opacity: manualAttack ? 1 : 0.5 }}
          aria-label="Attack"
          data-testid="attack-button"
          data-mode={manualAttack ? 'manual' : 'auto'}
          // Auto is a readout: no tab stop, and the pad's focus passes it by.
          aria-disabled={manualAttack ? undefined : true}
          tabIndex={manualAttack ? undefined : -1}
          data-pad-skip={manualAttack ? undefined : ''}
          onMouseDown={noFocus}
          onClick={manualAttack ? onAttack : undefined}
        >
          {manualAttack ? (
            <Glyph id="attack" size={28} />
          ) : (
            <span className="k-disp text-[18px]">Auto</span>
          )}
          {hud && <RuneDots runes={hud.basicRunes} />}
          {hud?.basicHold && (
            <TickBar value={hud.basicHold.charge} color="#fee761" stage={hud.basicHold.stage} />
          )}
          {manualAttack && (
            <BoundGlyph binding={{ ...bindingOf(config, 'attack'), mouse: 'lmb' }} />
          )}
        </button>
        <BuffRow buffs={buffs} />
      </div>
      <Vitals hud={hud} />
    </div>
  );
}
