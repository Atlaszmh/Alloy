import { useMemo } from 'react';
import {
  compareItem,
  referenceDepth,
  salvageCandidates,
  rarityIndex,
  type Rarity,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';
import { getDelveRegistry } from './registry';
import { ItemTile } from './ItemTile';
import { RARITY_COLOR, RARITY_LABEL, UPGRADE_EPSILON, formatNumber } from './format';

const AUTO_RARITIES: Rarity[] = ['common', 'uncommon', 'magic', 'rare', 'epic'];

export function BagPanel({ onSelect }: { onSelect: (uid: string) => void }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const newUids = useDelveStore((s) => s.newUids);
  const bagSize = registry.getDelveBalance().loot.bagSize;
  const depth = referenceDepth(profile);

  const rows = useMemo(() => {
    return profile.bag
      .map((item) => ({
        item,
        delta: compareItem(profile.equipped, item, registry, depth).powerPct,
      }))
      .sort(
        (a, b) =>
          rarityIndex(b.item.rarity) - rarityIndex(a.item.rarity) ||
          b.delta - a.delta ||
          b.item.ilvl - a.item.ilvl,
      );
  }, [profile.bag, profile.equipped, registry, depth]);

  const upgrades = rows.filter((r) => r.delta > UPGRADE_EPSILON).length;
  const junk = useMemo(() => salvageCandidates(registry, profile, 'magic'), [registry, profile]);

  const onEquipBest = () => {
    const equipped = useDelveStore.getState().equipBest();
    if (equipped.length > 0) {
      playSound('orbConfirm');
      vibrate('success');
      showToast(`Equipped ${equipped.length} upgrade${equipped.length > 1 ? 's' : ''}`);
    }
  };

  const onSalvageJunk = () => {
    const scrap = useDelveStore.getState().salvage(junk);
    if (scrap > 0) {
      playSound('gemScatter');
      vibrate('medium');
      showToast(`Salvaged ${junk.length} items · +${formatNumber(scrap)} scrap`);
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="bag-panel">
      <div className="flex gap-2">
        <button
          className={`delve-btn flex-1 text-sm ${upgrades > 0 ? 'delve-btn-green' : ''}`}
          disabled={upgrades === 0}
          onClick={onEquipBest}
          data-testid="equip-best"
        >
          ▲ Equip best{upgrades > 0 ? ` (${upgrades})` : ''}
        </button>
        <button
          className="delve-btn flex-1 text-sm"
          disabled={junk.length === 0}
          onClick={onSalvageJunk}
          data-testid="salvage-junk"
        >
          Salvage junk{junk.length > 0 ? ` (${junk.length})` : ''}
        </button>
      </div>

      <div className="flex items-center justify-between text-xs text-stone-400">
        <span>
          Bag{' '}
          <span className={profile.bag.length >= bagSize ? 'text-red-400' : 'text-stone-200'}>
            {profile.bag.length}
          </span>
          /{bagSize}
        </span>
        <div className="flex items-center gap-1">
          <span className="mr-1">Auto-salvage</span>
          {AUTO_RARITIES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={profile.autoSalvage[r]}
              aria-label={`Auto-salvage ${RARITY_LABEL[r]}`}
              title={`Auto-salvage ${RARITY_LABEL[r]}`}
              onClick={() => useDelveStore.getState().setAutoSalvage(r, !profile.autoSalvage[r])}
              className="h-5 w-5 rounded-full border"
              style={{
                borderColor: RARITY_COLOR[r],
                background: profile.autoSalvage[r] ? RARITY_COLOR[r] : 'transparent',
                opacity: profile.autoSalvage[r] ? 1 : 0.55,
              }}
            />
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="delve-panel px-4 py-8 text-center text-sm text-stone-400">
          Your bag is empty. Monsters in the depths drop gear — go get some.
        </div>
      ) : (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))' }}
        >
          {rows.map(({ item, delta }) => (
            <div key={item.uid} className="flex justify-center">
              <ItemTile
                item={item}
                size={56}
                delta={delta}
                isNew={newUids[item.uid]}
                onClick={() => onSelect(item.uid)}
                testId="bag-item"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
