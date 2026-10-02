import { useId, useState, type ReactNode } from 'react';
import {
  AFFIX_FAMILIES,
  FLUX_GRADES,
  METAL_IDS,
  fusePrice,
  refineCost,
  shardTiersOf,
  type HeroStatKey,
  type MaterialRef,
  type RuneRef,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';
import { Button, Chip, Panel, Price } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { runeName } from '../../runes/rune-style';
import { RunePane } from './RunePane';
import { affixLabel, materialLabel } from './materials-text';

const FAMILY_LABEL = {
  offense: 'Offense',
  defense: 'Defense',
  sustain: 'Sustain',
  utility: 'Utility',
  element: 'Element',
} as const;

/** A material's key in test ids: "metal-iron", "flux-rare", "shard-armor-2", "essence-prism". */
function keyOf(ref: MaterialRef): string {
  switch (ref.kind) {
    case 'metal':
      return `metal-${ref.metal}`;
    case 'flux':
      return `flux-${ref.grade}`;
    case 'shard':
      return `shard-${ref.stat}-${ref.tier}`;
    case 'essence':
      return `essence-${ref.essence}`;
    default:
      return ref.kind;
  }
}

/** One material held: its name and count, and Refine at the engine's price where it refines and enough are held. */
function MaterialRow({
  what,
  n,
  scrap,
  locked,
  onRefine,
}: {
  what: MaterialRef;
  n: number;
  scrap: number;
  locked: boolean;
  onRefine: (what: MaterialRef, count: number) => void;
}) {
  const registry = getDelveRegistry();
  const id = useId();
  const key = keyOf(what);
  const cost = refineCost(registry, what);
  const can = cost !== null && n >= cost.count;
  const short = can && cost.scrap > scrap;
  return (
    <div className="flex flex-col gap-1" data-testid={`material-${key}`}>
      <span className="text-[16px] text-[var(--k-text)]">
        {materialLabel(registry, what)} ×{n}
      </span>
      {can && (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            size="sm"
            disabled={locked || short}
            onClick={() => onRefine(what, cost.count)}
            aria-describedby={short && !locked ? id : undefined}
            testId={`refine-${key}`}
          >
            Refine {cost.count} → 1 · <Price scrap={cost.scrap} />
          </Button>
          {short && !locked && (
            <span id={id} className="k-caption">
              Needs <Price scrap={cost.scrap} />
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function Section({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <Panel material="well" title={title} testId={testId}>
      <div className="flex flex-col gap-3">{children}</div>
    </Panel>
  );
}

/**
 * The Forge tab's Materials pane, beside both benches: bars, flux, shards (by
 * family, each affix by tier), essences and runes, each with its count and
 * Refine 3 → 1 (the runes' Fuse) at the engine's price (none at the top
 * grade), then the shard bench (buy a tier I shard). Locked mid-dive.
 */
export function MaterialsPane({ locked }: { locked: boolean }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const { metals, flux, shards, essences } = profile.materials;
  const [buying, setBuying] = useState<HeroStatKey | null>(null);
  const id = useId();
  const families = registry.getCraftingData().families;
  const affixes = registry.getDelveData().affixes;
  const bench = registry.getDelveBalance().crafting.shardBench;
  const benchShort = bench.scrap > profile.scrap || bench.dust > profile.manaDust;
  const fuseCount = registry.getDelveBalance().runes.fuseCount;

  const onRefine = (what: MaterialRef, count: number) => {
    const res = useDelveStore.getState().refine(what);
    if (!res.ok) {
      playSound('combineFail');
      showToast(res.reason ?? 'Cannot refine');
      return;
    }
    playSound('combineMerge');
    vibrate('success');
    showToast(`Refined ${count} × ${materialLabel(registry, what)}`);
  };
  const onBuy = () => {
    if (!buying) return;
    const res = useDelveStore.getState().buyShard(buying);
    if (!res.ok) {
      playSound('combineFail');
      showToast(res.reason ?? 'Cannot buy');
      return;
    }
    playSound('combineMerge');
    showToast(`Bought ${materialLabel(registry, { kind: 'shard', stat: buying, tier: 1 })}`);
  };
  const onFuseRunes = (ref: RuneRef) => {
    const res = useDelveStore.getState().fuseRunes(ref);
    if (!res.ok) {
      playSound('combineFail');
      showToast(res.reason ?? 'Cannot fuse');
      return;
    }
    playSound('combineMerge');
    vibrate('success');
    showToast(
      `Fused ${fuseCount} ${runeName(registry, ref)} into ${runeName(registry, res.runes![0])}`,
    );
  };

  const row = (what: MaterialRef, n: number) => (
    <MaterialRow
      key={keyOf(what)}
      what={what}
      n={n}
      scrap={profile.scrap}
      locked={locked}
      onRefine={onRefine}
    />
  );
  const bars = METAL_IDS.filter((m) => metals[m] > 0);
  const grades = FLUX_GRADES.filter((g) => flux[g] > 0);
  const held = Object.entries(essences).filter(([, n]) => n > 0);

  return (
    <Panel
      title="Materials"
      testId="materials-pane"
      aside={<Price scrap={profile.scrap} dust={profile.manaDust} />}
    >
      <div className="flex flex-col gap-4">
        {locked && (
          <p className="k-body-2" data-testid="materials-locked">
            A dive is under way: refine and buy between dives.
          </p>
        )}
        <Section title="Bars" testId="materials-bars">
          {bars.length === 0 && <p className="k-caption">None yet: foes drop them.</p>}
          {bars.map((m) => row({ kind: 'metal', metal: m }, metals[m]))}
        </Section>
        <Section title="Flux" testId="materials-flux">
          {grades.length === 0 && <p className="k-caption">None yet: elites and bosses drop it.</p>}
          {grades.map((g) => row({ kind: 'flux', grade: g }, flux[g]))}
        </Section>
        <Section title="Shards" testId="materials-shards">
          {AFFIX_FAMILIES.map((family) => {
            const rows = affixes
              .filter((a) => families[a.stat] === family)
              .flatMap((a) =>
                shardTiersOf(registry, a.stat).flatMap(({ tier }) => {
                  const n = shards[a.stat]?.[tier - 1] ?? 0;
                  return n > 0 ? [row({ kind: 'shard', stat: a.stat, tier }, n)] : [];
                }),
              );
            return (
              rows.length > 0 && (
                <div key={family} className="flex flex-col gap-3" data-testid={`shards-${family}`}>
                  <span className="k-label">{FAMILY_LABEL[family]}</span>
                  {rows}
                </div>
              )
            );
          })}
          {Object.values(shards).every((ns) => !ns?.some((n) => n > 0)) && (
            <p className="k-caption">None yet: foes drop them, and salvage gives them.</p>
          )}
        </Section>
        <Section title="Essences" testId="materials-essences">
          {held.length === 0 && <p className="k-caption">None yet: bosses drop them.</p>}
          {held.map(([e, n]) => row({ kind: 'essence', essence: e }, n))}
        </Section>
        <RunePane
          pouch={profile.runes}
          fuseCount={fuseCount}
          fusePrice={(ref) => fusePrice(registry, ref)}
          scrap={profile.scrap}
          locked={locked}
          onFuse={onFuseRunes}
        />
        <Section title="Shard bench" testId="shard-bench">
          <p className="k-caption">
            Buy a tier I shard of any affix: <Price scrap={bench.scrap} dust={bench.dust} />
          </p>
          <div className="flex flex-wrap gap-2">
            {affixes.map((a) => (
              <Chip
                key={a.stat}
                pressed={buying === a.stat}
                onClick={() => setBuying(a.stat)}
                testId={`bench-affix-${a.stat}`}
              >
                {affixLabel(registry, a.stat)}
              </Chip>
            ))}
          </div>
          <Button
            variant="primary"
            disabled={locked || !buying || benchShort}
            onClick={onBuy}
            aria-describedby={benchShort && !locked ? `${id}-bench` : undefined}
            testId="bench-buy"
          >
            {buying ? (
              <>
                Buy {materialLabel(registry, { kind: 'shard', stat: buying, tier: 1 })} ·{' '}
                <Price scrap={bench.scrap} dust={bench.dust} />
              </>
            ) : (
              'Pick an affix'
            )}
          </Button>
          {benchShort && !locked && (
            <span id={`${id}-bench`} className="k-caption">
              Needs <Price scrap={bench.scrap} dust={bench.dust} />
            </span>
          )}
        </Section>
      </div>
    </Panel>
  );
}
