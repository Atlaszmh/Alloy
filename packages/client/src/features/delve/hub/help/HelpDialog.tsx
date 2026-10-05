import { useState, type ReactElement } from 'react';
import { playSound } from '@/shared/utils/sound-manager';
import { Dialog, Tabs } from '@/features/delve/kit';
import { HELP_TOPICS, HelpPage, type HelpTopicId } from './help-topics';

/**
 * Help as a dialog (the pad-first spec, 4): How to delve, its topics a sub tab list (LT/RT, or a
 * click), one page at a time, the page scrolling on the right stick. From the system menu, the
 * pause, and once for a Jump in save as its mana is chosen.
 */
export function HelpDialog({
  onClose,
  topic = 'controls',
}: {
  onClose: () => void;
  topic?: HelpTopicId;
}): ReactElement {
  const [on, setOn] = useState<HelpTopicId>(topic);
  return (
    <Dialog title="How to delve" onClose={onClose} width={880} testId="help-dialog">
      <div className="flex flex-col gap-4">
        <Tabs
          aria-label="Help topics"
          level="sub"
          size="md"
          glyphs
          value={on}
          onChange={(t) => {
            playSound('buttonClick');
            setOn(t);
          }}
          tabs={HELP_TOPICS.map((t) => ({ id: t.id, label: t.title, testId: `help-topic-${t.id}` }))}
        />
        <div className="k-scroll max-h-[60vh] min-h-0" data-pad-scroll>
          <HelpPage topic={on} />
        </div>
      </div>
    </Dialog>
  );
}
