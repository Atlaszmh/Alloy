import type { ActiveSynergy, DataRegistry, SynergyDef } from '@alloy/engine';

interface SynergyBannerProps {
  synergies: ActiveSynergy[];
  registry: DataRegistry;
}

// Safe lookup — real DataRegistry.getSynergy() throws on miss, test stubs may return
// undefined. Callers shouldn't crash either way: fall back to rendering the raw id.
function safeGetSynergy(registry: DataRegistry, id: string): SynergyDef | undefined {
  try {
    return registry.getSynergy(id);
  } catch {
    return undefined;
  }
}

export function SynergyBanner({ synergies, registry }: SynergyBannerProps) {
  // Show: active synergies (green) first, then one-away (yellow).
  // Ignore synergies missing 2+ affixes — too noisy.
  const list = synergies ?? [];
  const active = list.filter((s) => s.isActive);
  const pending = list.filter((s) => !s.isActive && s.missingCount === 1);

  if (active.length === 0 && pending.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 px-3 py-1"
      data-screen-section="forge-synergies"
      style={{ background: 'var(--color-surface-900)' }}
    >
      {active.map((s) => {
        const def = safeGetSynergy(registry, s.synergyId);
        return (
          <span
            key={s.synergyId}
            data-testid={`synergy-chip-${s.synergyId}`}
            data-state="active"
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
            style={{
              fontFamily: 'var(--font-family-display)',
              letterSpacing: '0.06em',
              background: 'rgba(74, 222, 128, 0.15)',
              color: 'var(--color-success)',
              border: '1px solid rgba(74, 222, 128, 0.4)',
              boxShadow: '0 0 8px rgba(74, 222, 128, 0.25)',
            }}
            title={def?.description ?? ''}
          >
            ✦ {def?.name ?? s.synergyId}
          </span>
        );
      })}
      {pending.map((s) => {
        const def = safeGetSynergy(registry, s.synergyId);
        return (
          <span
            key={s.synergyId}
            data-testid={`synergy-chip-${s.synergyId}`}
            data-state="pending"
            className="rounded-full px-2 py-0.5 text-[10px] uppercase"
            style={{
              fontFamily: 'var(--font-family-display)',
              letterSpacing: '0.06em',
              background: 'rgba(252, 211, 77, 0.08)',
              color: 'var(--color-warning)',
              border: '1px dashed rgba(252, 211, 77, 0.3)',
            }}
            title={def?.description ?? ''}
          >
            {def?.name ?? s.synergyId} · 1 more
          </span>
        );
      })}
    </div>
  );
}
