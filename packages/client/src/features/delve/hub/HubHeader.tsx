import { cloneElement, isValidElement, useMemo, type ReactNode } from 'react';
import { profilePower } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { Glyph, Header, Price, type TabsProps } from '@/features/delve/kit';
import { getDelveRegistry } from '../registry';
import { useCountUp } from '../useCountUp';
import { formatNumber } from '../format';

/** The hub's tabs (its `Tabs`) carry their guided-start targets: `hub.tab.<id>`. */
function withTargets(nav: ReactNode): ReactNode {
  if (!isValidElement<TabsProps<string>>(nav) || !nav.props.tabs) return nav;
  const tabs = nav.props.tabs.map((t) => ({ ...t, tutorial: `hub.tab.${t.id}` }));
  return cloneElement(nav, { tabs });
}

/**
 * The hub's steel band: the anvil and "The Anvil", the deepest depth and the
 * legendaries found, the tabs (`nav`, each carrying its target), then the purse and Power.
 */
export function HubHeader({ nav }: { nav: ReactNode }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const power = useMemo(() => profilePower(registry, profile), [registry, profile]);
  const shownPower = useCountUp(power);
  const found = Object.keys(profile.codex).length;
  const legendaries = registry.getDelveData().legendaries.length;
  return (
    <Header
      title={
        <span className="flex items-center gap-3">
          <Glyph id="anvil" size={40} /> The Anvil
        </span>
      }
      subtitle={`Deepest ${profile.bestDepth} · ${found} of ${legendaries} legendaries`}
      nav={withTargets(nav)}
      aside={
        <>
          <span data-testid="scrap-count">
            <Price scrap={profile.scrap} />
          </span>
          <span data-testid="links-count">
            <Price links={profile.links} />
          </span>
          <span data-testid="dust-count">
            <Price dust={profile.manaDust} />
          </span>
          <span aria-hidden className="h-[30px] w-[2px] bg-[var(--k-steel-2)]" />
          <span className="flex items-baseline gap-2">
            <span
              className="text-[30px] text-[var(--k-hot-hi)] [font-family:var(--k-font-display)]"
              data-testid="hero-power"
            >
              {formatNumber(shownPower)}
            </span>
            <span className="text-[16px] uppercase tracking-[0.06em] text-[var(--k-text-3)] [font-family:var(--k-font-label)]">
              Power
            </span>
          </span>
        </>
      }
    />
  );
}
