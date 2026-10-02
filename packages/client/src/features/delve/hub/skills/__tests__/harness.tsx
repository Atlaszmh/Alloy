import { useChainEditor, type ChainEditorProps } from '../../../chains/useChainEditor';
import { ChainLane } from '../ChainLane';
import { SkillList } from '../SkillList';
import type { AnvilChains } from '../useAnvilChains';

/** The Skills panes over any chains (no store draft, nothing to buy), as the Anvil draws them. */
export function Panes(props: ChainEditorProps) {
  const ed = useChainEditor(props);
  const anvil: AnvilChains = {
    editor: props,
    weapon: null,
    changed: {},
    slotOffer: () => ({ price: null, why: null }),
    buySlot: () => {},
  };
  return (
    <>
      <SkillList ed={ed} anvil={anvil} onMana={() => {}} />
      <ChainLane ed={ed} anvil={anvil} carrying={false} />
    </>
  );
}
