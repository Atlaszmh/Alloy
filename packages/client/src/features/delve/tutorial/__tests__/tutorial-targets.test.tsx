import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { TUTORIAL_TARGETS, type TutorialTarget } from '@alloy/engine';
import { getDelveRegistry } from '../../registry';
import { WAY_TO } from '../marked';
import { HubHeader } from '../../hub/HubHeader';
import { Tabs } from '../../kit';

// See the tutorial spec's highlights: every target a step can name sits on a control.

const src = resolve(__dirname, '../../../..');
/** Every client source file but the tests, as text. */
const sources = readdirSync(src, { recursive: true, encoding: 'utf8' })
  .filter((f) => /\.tsx?$/.test(f) && !/__tests__|\.test\./.test(f))
  .map((f) => readFileSync(resolve(src, f), 'utf8'));
const placed = (t: string) => sources.some((s) => s.includes(`'${t}'`) || s.includes(`"${t}"`));

describe("the guided start's targets", () => {
  it("every target is placed by name (the hub's tabs by HubHeader, Temper's Hone by its bench)", () => {
    const named = TUTORIAL_TARGETS.filter((t) => !t.startsWith('hub.tab.') && t !== 'temper.hone');
    expect(named.filter((t) => !placed(t))).toEqual([]);
  });

  it("every step's target is on the screen its step shows on, or a way there is (a hub tab, a view)", () => {
    const screenOf = { floor: 'hud.', stop: 'stop.', anvil: 'hub.', training: 'hub.' } as const;
    /** The target, then each way to it (`WAY_TO`), to the one on the screen itself. */
    const ways = (t: TutorialTarget): string[] => [t, ...(WAY_TO[t] ? ways(WAY_TO[t]!) : [])];
    const bad = getDelveRegistry()
      .getTutorialData()
      .steps.filter((s) => s.highlight)
      .filter((s) => !ways(s.highlight!).at(-1)!.startsWith(screenOf[s.where]))
      .map((s) => `${s.id}: ${ways(s.highlight!).join(' < ')}`);
    expect(bad).toEqual([]);
    // Every target behind the hub's tabs has its way to one.
    const behind = TUTORIAL_TARGETS.filter((t) => !/^(hud|stop|hub)\./.test(t));
    expect(behind.filter((t) => !ways(t).at(-1)!.startsWith('hub.tab.'))).toEqual([]);
  });

  it("the hub's tabs carry hub.tab.<id>", () => {
    const ids = ['loadout', 'skills', 'forge', 'codex', 'quests'];
    render(
      <HubHeader
        nav={
          <Tabs
            aria-label="The Anvil"
            level="top"
            value="loadout"
            onChange={() => {}}
            tabs={ids.map((id) => ({ id, label: id }))}
          />
        }
      />,
    );
    expect(screen.getAllByRole('tab').map((t) => t.dataset.tutorial)).toEqual(
      ids.map((id) => `hub.tab.${id}`),
    );
  });
});
