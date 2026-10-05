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
  // `marked.ts` names targets as ways, not on controls.
  .filter((f) => /\.tsx?$/.test(f) && !/__tests__|\.test\.|tutorial[\\/]marked\.ts$/.test(f))
  .map((f) => readFileSync(resolve(src, f), 'utf8'));
const placed = (t: string) => sources.some((s) => s.includes(`'${t}'`) || s.includes(`"${t}"`));
/** The trails' new targets, until plan 03's tasks place them (Task 15 empties and removes this). */
const PENDING: TutorialTarget[] = [
  'stop.pick',
  'forge.bench',
  'temper.line',
  'temper.go',
  'mana.confirm',
  'skills.rune',
  'quests.done',
];

describe("the guided start's targets", () => {
  it("every target is placed by name (the hub's tabs by HubHeader, Temper's Hone by its bench)", () => {
    const named = TUTORIAL_TARGETS.filter(
      (t) => !t.startsWith('hub.tab.') && t !== 'temper.hone' && !PENDING.includes(t),
    );
    expect(named.filter((t) => !placed(t))).toEqual([]);
  });

  it("every step's target is on the screen its step shows on, or a way there is (a hub tab, a view)", () => {
    const screenOf = { floor: 'hud.', stop: 'stop.', anvil: 'hub.', training: 'hub.' } as const;
    /** The target, then each way to it (`WAY_TO`), to the one on the screen itself. */
    const ways = (t: string): string[] => {
      const next = WAY_TO[t.split(':')[0] as keyof typeof WAY_TO];
      return [t, ...(next ? ways(next) : [])];
    };
    // A step's highlight, and every entry of its trail.
    const bad = getDelveRegistry()
      .getTutorialData()
      .steps.flatMap((s) =>
        [...(s.highlight ? [s.highlight] : []), ...(s.trail ?? [])]
          .filter((t) => !ways(t).at(-1)!.startsWith(screenOf[s.where]))
          .map((t) => `${s.id}: ${ways(t).join(' < ')}`),
      );
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
