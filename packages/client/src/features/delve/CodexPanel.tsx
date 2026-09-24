import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from './registry';
import { ItemIcon } from './ItemIcon';
import { SLOT_LABEL } from './format';

const SLOT_BASE: Record<string, string> = {
  weapon: 'sword',
  helm: 'helm',
  chest: 'cuirass',
  gloves: 'gauntlets',
  boots: 'greaves',
  amulet: 'amulet',
  ring: 'ring',
};

export function CodexPanel() {
  const registry = getDelveRegistry();
  const codex = useDelveStore((s) => s.profile.codex);
  const legendaries = registry.getDelveData().legendaries;
  const found = legendaries.filter((l) => codex[l.id]).length;

  return (
    <div className="flex flex-col gap-3" data-testid="codex-panel">
      <div className="flex items-baseline justify-between">
        <span className="delve-display text-sm font-bold uppercase tracking-widest text-orange-300">
          Legendary Codex
        </span>
        <span className="delve-display text-sm text-stone-300">
          {found}/{legendaries.length}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full"
          style={{
            width: `${(found / legendaries.length) * 100}%`,
            background: 'linear-gradient(90deg,#9a3412,#fb923c,#fde68a)',
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {legendaries.map((l) => {
          const entry = codex[l.id];
          const icon = SLOT_BASE[l.slots[0]];
          return (
            <div
              key={l.id}
              className="delve-panel flex gap-2 p-2"
              style={
                entry
                  ? {
                      borderColor: 'rgba(251,146,60,0.45)',
                      boxShadow: '0 0 12px rgba(251,146,60,0.12)',
                    }
                  : undefined
              }
              data-testid={entry ? 'codex-found' : 'codex-unknown'}
            >
              <div className="h-9 w-9 flex-shrink-0">
                <ItemIcon baseId={icon} rarity="legendary" ghost={!entry} />
              </div>
              <div className="min-w-0">
                <div
                  className="delve-display truncate text-sm font-bold"
                  style={{ color: entry ? '#fb923c' : '#57534e' }}
                >
                  {entry ? l.name : '???'}
                </div>
                <div className="text-[10.5px] leading-snug text-stone-400">
                  {entry
                    ? l.text.replace('{v}', `${l.min}–${l.max}`)
                    : `Drops on: ${l.slots.map((s) => SLOT_LABEL[s]).join(', ')}`}
                </div>
                {entry && entry.count > 1 && (
                  <div className="text-[10px] text-stone-500">Found ×{entry.count}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
