import { Glyph } from '@/features/delve/kit';
import { formatNumber } from '../../format';
import type { ArenaHud } from '../useArena';

const BOSS_LIFE = 'repeating-linear-gradient(90deg, #e43b44 0 12px, #a22633 12px 14px)';

/**
 * The boss's name and life, only while a boss lives: in `HudGrid`'s centre slot, which lays it
 * under the top bar (and under Hesta's strip), centred in the middle column.
 */
export function BossBar({ hud }: { hud: ArenaHud | null }) {
  if (!hud?.boss) return null;
  const { boss } = hud;
  return (
    <div
      className="flex w-[420px] flex-col gap-2"
      data-testid="boss-bar"
    >
      <div className="k-disp flex items-center justify-center gap-2 text-[22px] text-[var(--k-bad-text)]">
        <Glyph id="skull" size={20} />
        {boss.name}
      </div>
      <div className="k-bar k-lifeframe" style={{ height: 16 }}>
        <div
          className="k-bar-fill"
          style={{
            left: 0,
            width: `${(Math.max(0, boss.hp) / Math.max(1, boss.maxHp)) * 100}%`,
            background: BOSS_LIFE,
          }}
        />
        <span className="k-bar-label k-disp text-[14px]">
          {formatNumber(Math.max(0, boss.hp))} / {formatNumber(boss.maxHp)}
        </span>
      </div>
    </div>
  );
}
