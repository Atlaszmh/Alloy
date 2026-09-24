import { isBossDepth, type DiveState } from '@alloy/engine';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { getDelveRegistry } from './registry';
import { formatNumber } from './format';

interface DoorChoiceProps {
  dive: DiveState;
  onChoose: (doorId: string) => void;
  onExtract: () => void;
}

export function DoorChoice({ dive, onChoose, onExtract }: DoorChoiceProps) {
  const registry = getDelveRegistry();
  const doors = dive.doorChoices.map((id) => registry.getDoor(id));

  return (
    <div
      className="absolute inset-0 z-30 overflow-y-auto px-3"
      style={{
        background: 'radial-gradient(ellipse at 50% 40%, rgba(20,16,10,0.9), rgba(0,0,0,0.95))',
      }}
      data-testid="door-choice"
    >
      <div
        className="flex min-h-full flex-col items-center gap-2.5 py-3"
        style={{ justifyContent: 'safe center' }}
      >
        <div className="text-center">
          <div
            className="delve-display text-2xl font-bold text-amber-300"
            style={{ textShadow: '0 0 20px rgba(212,168,52,0.4)' }}
          >
            DEPTH {dive.depth} CLEARED
          </div>
          <div className="mt-0.5 text-xs text-stone-300">
            Bounty <span className="font-bold text-amber-300">⚙ {formatNumber(dive.bounty)}</span> ·{' '}
            {dive.potions} 🧪 · {Math.round(dive.heroHpFrac * 100)}% life
          </div>
        </div>

        <div className="delve-display text-[11px] uppercase tracking-[0.3em] text-stone-500">
          Choose your path
        </div>

        <div className="flex w-full max-w-[520px] flex-col gap-2">
          {doors.map((door) => {
            const nextDepth = dive.depth + 1 + (door.mods.skip ?? 0);
            const boss = isBossDepth(registry, nextDepth);
            return (
              <button
                key={door.id}
                className="delve-panel delve-door flex items-center gap-3 px-3 py-2"
                onClick={() => {
                  playSound('phaseTransition');
                  vibrate('medium');
                  onChoose(door.id);
                }}
                data-testid={`door-${door.id}`}
              >
                <span className="text-2xl">{door.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="delve-display block text-base font-bold leading-tight text-stone-100">
                    {door.name}
                  </span>
                  <span className="block text-[11px] leading-snug text-stone-400">{door.text}</span>
                </span>
                <span className="flex flex-col items-end text-[11px]">
                  <span className="delve-display font-bold text-stone-300">Depth {nextDepth}</span>
                  {boss && <span className="font-bold text-red-400">☠ Boss</span>}
                </span>
              </button>
            );
          })}
        </div>

        <button
          className="delve-btn delve-btn-gold mt-1 w-full max-w-[520px] py-2.5 text-base"
          onClick={() => {
            playSound('victory');
            vibrate('success');
            onExtract();
          }}
          data-testid="extract-button"
        >
          ⛏ EXTRACT · CLAIM ⚙ {formatNumber(dive.bounty)}
        </button>
      </div>
    </div>
  );
}
