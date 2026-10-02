import { useState, type ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PromptBar, usePrompts, type Prompt } from '@/features/delve/kit';
import { useChainEditor, type ChainEditorProps } from '../../../chains/useChainEditor';
import type { HubLink, HubMode } from '../../types';
import { ChainLane } from '../ChainLane';
import { MoveInspector } from '../MoveInspector';
import { SkillList } from '../SkillList';
import { SkillsTab } from '../SkillsTab';
import type { AnvilChains } from '../useAnvilChains';

/** SkillsTab in a stand-in hub: it draws and binds the tab's prompts and shows its footer group. */
function Hub({ mode, link }: { mode: HubMode; link?: HubLink }) {
  const [footer, setFooter] = useState<ReactNode>(null);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  usePrompts(prompts);
  return (
    <MemoryRouter>
      <SkillsTab
        mode={mode}
        setPrompts={setPrompts}
        setFooterAction={setFooter}
        go={() => {}}
        link={link}
      />
      <footer data-testid="hub-footer">
        <PromptBar prompts={prompts} />
        {footer}
      </footer>
    </MemoryRouter>
  );
}

export function renderSkills(opts: { mode?: HubMode; link?: HubLink } = {}): RenderResult {
  return render(<Hub mode={opts.mode ?? 'anvil'} link={opts.link} />);
}

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
      <MoveInspector ed={ed} anvil={anvil} />
    </>
  );
}
