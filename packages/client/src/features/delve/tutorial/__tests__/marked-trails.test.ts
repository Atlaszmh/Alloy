import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TutorialStep } from '@alloy/engine';
import { findMarked, findTarget, findWay, isDone, type Marked } from '../marked';

// See the pad navigation and guidance spec, 2.3: keyed targets, done, the ways, the trail and
// the way out. The rule reads the DOM alone, so each test writes the page it needs.

const page = (html: string) => {
  document.body.innerHTML = html;
};
/** What is marked: its id and the element's. */
const at = (m: Marked | null) => m && [m.id, m.el.id];

beforeEach(() => {
  // jsdom has no layout: every element is a 10 px box on screen, one with `data-off` far off it.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const x = this.hasAttribute('data-off') ? 5000 : 0;
    return DOMRect.fromRect({ x, y: 0, width: 10, height: 10 });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('findTarget', () => {
  it("takes the first of a keyed target's controls, the last of a plain one's", () => {
    page(`<div data-pad-scope>
      <button id="a" data-tutorial="loadout.bag:chest.uncommon"></button>
      <button id="b" data-tutorial="loadout.bag:chest.uncommon"></button>
      <button id="c" data-tutorial="hub.delve"></button>
      <button id="d" data-tutorial="hub.delve"></button>
    </div>`);
    expect(findTarget('loadout.bag:chest.uncommon')?.id).toBe('a');
    expect(findTarget('hub.delve')?.id).toBe('d');
    expect(findTarget('loadout.bag:weapon.rare')).toBeNull();
  });

  it('sees nothing off screen, or outside the topmost pad scope', () => {
    page(`<div data-pad-scope>
      <button id="a" data-tutorial="forge.go"></button>
      <div data-pad-scope>
        <button id="b" data-off data-tutorial="forge.pattern:cuirass"></button>
        <button id="c" data-tutorial="forge.shard"></button>
      </div>
    </div>`);
    // Outside the topmost (nested) scope; off screen inside it; on screen inside it.
    expect(findTarget('forge.go')).toBeNull();
    expect(findTarget('forge.pattern:cuirass')).toBeNull();
    expect(findTarget('forge.shard')?.id).toBe('c');
  });
});

describe('isDone', () => {
  it.each(['aria-selected', 'aria-pressed', 'aria-checked', 'data-tutorial-done'])(
    '%s="true" is done; "false" or absent is not',
    (attr) => {
      page(`<button id="a" ${attr}="true"></button><button id="b" ${attr}="false"></button>
        <button id="c"></button>`);
      const done = (id: string) => isDone(document.getElementById(id)!);
      expect([done('a'), done('b'), done('c')]).toEqual([true, false, false]);
    },
  );
});

describe('findWay', () => {
  /** The Skills tab: the Primary's row, its first and last cards, and the elements if shown. */
  const skills = (o: { primary: boolean; last: boolean; elements?: boolean }) =>
    page(`<div data-pad-scope>
      <button id="tab" role="tab" aria-selected="true" data-tutorial="hub.tab.skills"></button>
      <button id="primary" role="tab" aria-selected="${o.primary}"
        data-tutorial="skills.primary"></button>
      <button id="first" aria-pressed="${!o.last}" data-tutorial="skills.card:first"></button>
      <button id="last" aria-pressed="${o.last}" data-tutorial="skills.card:last"></button>
      ${o.elements ? '<section id="elements" data-tutorial="skills.elements"></section>' : ''}
    </div>`);

  it('is the target itself while it is on screen', () => {
    skills({ primary: true, last: true, elements: true });
    expect(at(findWay('skills.elements'))).toEqual(['skills.elements', 'elements']);
  });

  it('else the control that shows it: a keyed way, the card to select', () => {
    skills({ primary: true, last: false });
    expect(at(findWay('skills.elements'))).toEqual(['skills.card:last', 'last']);
    // The first card is selected already, as are the skill's row and the tab: no way to show.
    expect(findWay('skills.socket')).toBeNull();
  });

  it('passes over a way that is done, by any done attribute, on to the next', () => {
    // The last card is selected already (`aria-pressed`): the way is the skill's row.
    skills({ primary: false, last: true });
    expect(at(findWay('skills.elements'))).toEqual(['skills.primary', 'primary']);
    // Every way open and the target still not showing: nothing to point at.
    skills({ primary: true, last: true });
    expect(findWay('skills.elements')).toBeNull();
  });

  it("looks a keyed target's way up without its key", () => {
    page(`<div data-pad-scope>
      <button id="tab" role="tab" aria-selected="false" data-tutorial="hub.tab.forge"></button>
    </div>`);
    expect(at(findWay('forge.pattern:cuirass'))).toEqual(['hub.tab.forge', 'tab']);
    expect(at(findWay('forge.refine:rusty'))).toEqual(['hub.tab.forge', 'tab']);
  });

  it("the Forge bench's controls go by its sub tab; the Materials bench's Refine by its own sub tab", () => {
    /** The Forge tab open, on one bench (nothing of any showing). */
    const forge = (on: 'forge' | 'temper' | 'materials') =>
      page(`<div data-pad-scope>
        <button id="tab" role="tab" aria-selected="true" data-tutorial="hub.tab.forge"></button>
        <button id="bench" role="tab" aria-selected="${on === 'forge'}"
          data-tutorial="forge.bench"></button>
        <button id="temper" role="tab" aria-selected="${on === 'temper'}"
          data-tutorial="forge.temper"></button>
        <button id="materials" role="tab" aria-selected="${on === 'materials'}"
          data-tutorial="forge.materials"></button>
      </div>`);
    forge('temper');
    for (const t of ['forge.pattern:cuirass', 'forge.bar:rusty', 'forge.flux:uncommon'] as const)
      expect(at(findWay(t))).toEqual(['forge.bench', 'bench']);
    expect(at(findWay('forge.shard'))).toEqual(['forge.bench', 'bench']);
    expect(at(findWay('forge.go'))).toEqual(['forge.bench', 'bench']);
    expect(at(findWay('forge.refine:rusty'))).toEqual(['forge.materials', 'materials']);
    // The Forge bench open already: its sub tab is done, and so is the tab.
    forge('forge');
    expect(findWay('forge.go')).toBeNull();
    expect(at(findWay('forge.refine:rusty'))).toEqual(['forge.materials', 'materials']);
    // On the Materials bench with no Refine showing: every way is open, nothing to point at.
    forge('materials');
    expect(findWay('forge.refine:rusty')).toBeNull();
  });

  it("Training's way is the footer's Delve while the Depart sheet is shut, and Training itself once it is open", () => {
    const hub = `<div data-pad-scope><button id="depart" data-tutorial="hub.delve"></button></div>`;
    page(hub);
    expect(at(findWay('hub.training'))).toEqual(['hub.delve', 'depart']);
    // The sheet over the hub, its own scope: its Delve and its Training.
    page(`${hub}<div data-pad-scope>
      <button id="delve" data-tutorial="hub.delve"></button>
      <button id="training" data-tutorial="hub.training"></button>
    </div>`);
    expect(at(findWay('hub.training'))).toEqual(['hub.training', 'training']);
    expect(at(findWay('hub.delve'))).toEqual(['hub.delve', 'delve']);
  });
});

describe('findMarked', () => {
  const step = (over: Partial<TutorialStep> = {}): TutorialStep => ({
    id: 'lesson',
    where: 'anvil',
    line: 'A line.',
    objective: 'Do it',
    trigger: { type: 'ack', count: 1 },
    ...over,
  });
  const FORGE = step({
    highlight: 'hub.tab.forge',
    trail: ['forge.pattern:cuirass', 'forge.flux:uncommon', 'forge.go'],
  });
  /** The Forge bench: the pattern picked or not, the flux chosen, off or neither, Forge on or off. */
  const bench = (o: { pattern?: boolean; flux?: boolean | 'off'; go?: 'off' } = {}) =>
    page(`<div data-pad-scope>
      <button id="tab" role="tab" aria-selected="true" data-tutorial="hub.tab.forge"></button>
      <button id="pattern" aria-pressed="${!!o.pattern}"
        data-tutorial="forge.pattern:cuirass"></button>
      <button id="flux" role="radio" aria-checked="${o.flux === true}"
        ${o.flux === 'off' ? 'disabled' : ''} data-tutorial="forge.flux:uncommon"></button>
      <button id="go" ${o.go ? 'disabled' : ''} data-tutorial="forge.go"></button>
    </div>`);

  it('marks the first entry of the trail still to do, a done one passed over', () => {
    bench();
    expect(at(findMarked(FORGE))).toEqual(['forge.pattern:cuirass', 'pattern']);
    bench({ pattern: true });
    expect(at(findMarked(FORGE))).toEqual(['forge.flux:uncommon', 'flux']);
    bench({ pattern: true, flux: true });
    expect(at(findMarked(FORGE))).toEqual(['forge.go', 'go']);
  });

  it('passes over a disabled entry', () => {
    bench({ pattern: true, flux: 'off' });
    expect(at(findMarked(FORGE))).toEqual(['forge.go', 'go']);
  });

  it("marks the step's highlight once the trail is done or passed over", () => {
    bench({ pattern: true, flux: true, go: 'off' });
    expect(at(findMarked(FORGE))).toEqual(['hub.tab.forge', 'tab']);
  });

  it('marks an entry that is not on screen by its way, and passes it over when no way shows', () => {
    // On another tab: the way to the first entry is the Forge tab.
    page(`<div data-pad-scope>
      <button id="tab" role="tab" aria-selected="false" data-tutorial="hub.tab.forge"></button>
    </div>`);
    expect(at(findMarked(FORGE))).toEqual(['hub.tab.forge', 'tab']);
    // On the tab, the pattern row not showing: its way is open, so the walk goes on to the flux.
    page(`<div data-pad-scope>
      <button id="tab" role="tab" aria-selected="true" data-tutorial="hub.tab.forge"></button>
      <button id="flux" role="radio" aria-checked="false"
        data-tutorial="forge.flux:uncommon"></button>
    </div>`);
    expect(at(findMarked(FORGE))).toEqual(['forge.flux:uncommon', 'flux']);
  });

  it('with the Temper bench open, marks the Forge sub tab: the way to every entry of the forge', () => {
    page(`<div data-pad-scope>
      <button id="tab" role="tab" aria-selected="true" data-tutorial="hub.tab.forge"></button>
      <button id="bench" role="tab" aria-selected="false" data-tutorial="forge.bench"></button>
      <button id="temper" role="tab" aria-selected="true" data-tutorial="forge.temper"></button>
    </div>`);
    expect(at(findMarked(FORGE))).toEqual(['forge.bench', 'bench']);
  });

  it('with no trail marks the highlight, as before; with neither, nothing', () => {
    bench();
    expect(at(findMarked(step({ highlight: 'forge.go' })))).toEqual(['forge.go', 'go']);
    expect(findMarked(step())).toBeNull();
  });

  describe('the way out', () => {
    const SKILLS = step({
      highlight: 'skills.addSlot',
      trail: ['skills.primary', 'skills.addSlot'],
    });
    /** The Skills tab with a view nested in it, holding `inside`. */
    const nested = (inside: string) =>
      page(`<div data-pad-scope>
        <button id="primary" role="tab" aria-selected="true" data-tutorial="skills.primary"></button>
        <button id="slot" data-tutorial="skills.addSlot"></button>
        <aside data-pad-scope><button id="back" data-pad-back></button>${inside}</aside>
      </div>`);

    it("marks the Back of a view nested in the screen that holds none of the step's controls", () => {
      nested('');
      expect(at(findMarked(SKILLS))).toEqual(['back', 'back']);
    });

    it("marks an entry the nested view does hold (a picker carries its field's target)", () => {
      nested('<div id="list" data-tutorial="skills.addSlot"></div>');
      expect(at(findMarked(SKILLS))).toEqual(['skills.addSlot', 'list']);
    });

    it('never out of a dialog (a scope not nested in another), nor for a step that marks nothing', () => {
      page(`<div data-pad-scope><button id="slot" data-tutorial="skills.addSlot"></button></div>
        <div data-pad-scope><button id="back" data-pad-back></button></div>`);
      expect(findMarked(SKILLS)).toBeNull();
      nested('');
      expect(findMarked(step())).toBeNull();
    });
  });
});
