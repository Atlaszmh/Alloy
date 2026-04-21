import type {
  BaseStat,
  CombinePreview,
  DataRegistry,
  DerivedStats,
  ForgePlan,
  GemInstance,
} from '@alloy/engine';
import { AmbientBackdrop } from './AmbientBackdrop';
import { CharacterRail } from './CharacterRail';
import { CombineDock } from './CombineDock';
import { FluxRail } from './FluxRail';
import { ForgeTopBar } from './ForgeTopBar';
import { GearWorkspace } from './GearWorkspace';
import { StockpileStrip } from './StockpileStrip';

export interface ForgeDesktopProps {
  // Run + phase state
  round: 1 | 2 | 3;
  lives: number;
  maxLives: number;
  opponentLabel: string;
  streak: number;
  totalRounds: number;

  // Stats
  derivedStats: DerivedStats | null;

  // Plan (loadout + stockpile)
  plan: ForgePlan;
  registry: DataRegistry;

  // Flux
  currentFlux: number;
  maxFlux: number;
  /** Flux action costs — sourced from engine balance by Forge.tsx. */
  boostCost: number;
  rerollCost: number;
  rarityCost: number;

  // Combo state
  comboSlots: [GemInstance | null, GemInstance | null, GemInstance | null];
  combinePreview: CombinePreview | null;
  canAffordCombine: boolean;

  // Base stats
  weaponStats: [BaseStat, BaseStat];
  armorStats: [BaseStat, BaseStat];

  // Callbacks (all existing, already dispatched from Forge.tsx)
  onDone: () => void;
  onOpenGemLibrary: () => void;
  onBoost: () => void;
  onReroll: () => void;
  onGuaranteeRarity: () => void;
  onWeaponStatChange: (index: 0 | 1, stat: BaseStat) => void;
  onArmorStatChange: (index: 0 | 1, stat: BaseStat) => void;
  onSocketClick: (card: 'weapon' | 'armor', slotIndex: number) => void;
  onSocketRemove: (card: 'weapon' | 'armor', slotIndex: number) => void;
  onComboSlotClick: (index: number) => void;
  onCombine: () => void;
  onClearComboSlots: () => void;
  onSelectOrb: (uid: string) => void;
  onGemPointerDown: (uid: string, e: React.PointerEvent) => void;
  selectedOrbUid: string | null;

  // Drag flag (passed through from Forge.tsx drag state)
  isDragging: boolean;

  // Derived UID sets for stockpile rendering
  equippedUids: Set<string>;
  stagedUids: Set<string>;

  /** Round-aware pool capacity for "Gems Held X / Y" — driven by engine pool schedule. */
  maxStockpileCapacity: number;
}

/**
 * Desktop Forge HUD composition.
 *
 * Lays out the Chunk 3 region components in a CSS grid that mirrors the v2
 * mockup: topbar across the full width, character rail on the left, gear
 * workspace in the center, flux rail on the right, combine dock below, then
 * the stockpile strip at the bottom.
 *
 * Region size tokens are declared on `:root` in index.css — `--hud-topbar-h`,
 * `--hud-rail-w`, `--hud-workbench-h`, `--hud-stockpile-h`.
 */
export function ForgeDesktop(props: ForgeDesktopProps) {
  return (
    <div
      data-screen="forge-desktop"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateColumns: 'var(--hud-rail-w) 1fr var(--hud-rail-w)',
        gridTemplateRows:
          'var(--hud-topbar-h) 1fr var(--hud-workbench-h) var(--hud-stockpile-h)',
        gridTemplateAreas: `
          "topbar  topbar  topbar"
          "left    center  right"
          "dock    dock    dock"
          "stock   stock   stock"
        `,
        gap: 'var(--gap-sm)',
        padding: 'var(--gap-sm) var(--gap-md)',
        background: 'var(--color-surface-950)',
      }}
    >
      <AmbientBackdrop />

      <div style={{ gridArea: 'topbar', zIndex: 1 }}>
        <ForgeTopBar
          lives={props.lives}
          maxLives={props.maxLives}
          opponentLabel={props.opponentLabel}
          round={props.round}
          totalRounds={props.totalRounds}
          streak={props.streak}
          round1={props.round === 1}
          onDone={props.onDone}
          onOpenGemLibrary={props.onOpenGemLibrary}
        />
      </div>

      <div style={{ gridArea: 'left', zIndex: 1, overflow: 'hidden' }}>
        <CharacterRail
          stats={props.derivedStats}
          weaponStats={props.weaponStats}
          armorStats={props.armorStats}
          onWeaponStatChange={props.onWeaponStatChange}
          onArmorStatChange={props.onArmorStatChange}
          round={props.round}
        />
      </div>

      <div
        style={{ gridArea: 'center', zIndex: 1, overflow: 'hidden' }}
        data-screen-section="forge-gear"
      >
        <GearWorkspace
          plan={props.plan}
          registry={props.registry}
          selectedOrbUid={props.selectedOrbUid}
          isDragging={props.isDragging}
          onSocketClick={props.onSocketClick}
          onSocketRemove={props.onSocketRemove}
          onGemPointerDown={props.onGemPointerDown}
        />
      </div>

      <div style={{ gridArea: 'right', zIndex: 1, overflow: 'hidden' }}>
        <FluxRail
          currentFlux={props.currentFlux}
          maxFlux={props.maxFlux}
          boostCost={props.boostCost}
          rerollCost={props.rerollCost}
          rarityCost={props.rarityCost}
          onBoost={props.onBoost}
          onReroll={props.onReroll}
          onGuaranteeRarity={props.onGuaranteeRarity}
        />
      </div>

      <div
        style={{ gridArea: 'dock', zIndex: 1 }}
        data-screen-section="forge-combine"
      >
        <CombineDock
          comboSlots={props.comboSlots}
          registry={props.registry}
          canAfford={props.canAffordCombine}
          preview={props.combinePreview}
          isDragging={props.isDragging}
          onSlotClick={props.onComboSlotClick}
          onCombine={props.onCombine}
          onClearAll={props.onClearComboSlots}
          onPointerDown={props.onGemPointerDown}
        />
      </div>

      <div
        style={{ gridArea: 'stock', zIndex: 1 }}
        data-screen-section="forge-tray"
      >
        <StockpileStrip
          stockpile={props.plan.stockpile}
          registry={props.registry}
          selectedOrbUid={props.selectedOrbUid}
          equippedUids={props.equippedUids}
          stagedUids={props.stagedUids}
          maxCapacity={props.maxStockpileCapacity}
          onSelectOrb={props.onSelectOrb}
          onPointerDown={props.onGemPointerDown}
        />
      </div>
    </div>
  );
}
