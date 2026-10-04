import { formatNumber } from '../../format';
import type { ArenaHud } from '../useArena';

const LIFE = 'repeating-linear-gradient(90deg, #63c74d 0 12px, #3e8948 12px 14px)';
const BARRIER = 'repeating-linear-gradient(90deg, #ead4aa 0 12px, #c28569 12px 14px)';
const MANA = 'repeating-linear-gradient(90deg, #2ce8f5 0 2px, #0099db 2px 12px, #124e89 12px 14px)';

const pct = (f: number) => `${f * 100}%`;

/**
 * The dock's two long bars: life (32 px green planks, Obsidian's barrier a pale segment after
 * it, over its end when there's no room) and mana (24 px, the stepped mana glow), each with its
 * numbers on it.
 */
export function Vitals({ hud }: { hud: ArenaHud | null }) {
  if (!hud) return null;
  const life = Math.max(0, hud.hp) / Math.max(1, hud.maxHp);
  const mana = hud.mana / Math.max(1, hud.manaMax);
  const barrier = hud.barrier ? Math.min(1, hud.barrier.hp / Math.max(1, hud.maxHp)) : 0;
  return (
    <div className="flex flex-col gap-[14px] pt-[10px]" data-tutorial="hud.vitals">
      <div
        className={`k-bar k-lifeframe ${life < 0.3 ? 'animate-pulse' : ''}`}
        style={{ height: 32 }}
        data-testid="hero-hp"
      >
        <div className="k-bar-fill" style={{ left: 0, width: pct(life), background: LIFE }} />
        {hud.barrier && (
          <div
            className="k-bar-fill"
            data-testid="hp-barrier"
            style={{
              left: pct(Math.min(life, 1 - barrier)),
              width: pct(barrier),
              background: BARRIER,
            }}
          />
        )}
        <span className="k-bar-label k-disp text-[22px]">
          {formatNumber(Math.max(0, hud.hp))} / {formatNumber(hud.maxHp)}
          {hud.barrier && ` · barrier ${formatNumber(hud.barrier.hp)}`}
        </span>
      </div>
      <div
        className="k-bar k-mana"
        style={{ height: 24 }}
        data-testid="mana-bar"
        aria-label={`Mana ${Math.floor(hud.mana)} of ${Math.round(hud.manaMax)}`}
      >
        <div
          className="k-bar-fill"
          style={{ left: 0, width: pct(mana), background: MANA, transition: 'width 0.1s linear' }}
        />
        <span className="k-bar-label k-disp text-[19px]">
          {formatNumber(Math.floor(hud.mana))} / {formatNumber(Math.round(hud.manaMax))}
        </span>
      </div>
    </div>
  );
}
