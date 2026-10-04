import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { TUTORIAL_TARGETS } from '@alloy/engine';
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
