import { describe, it, expect } from 'vitest';
import * as kit from '../index';

/** Every component and hook of the spec's kit contract, as screens import them. */
const CONTRACT = [
  'usePrompts',
  'topScope',
  'scopedLast',
  'useUiScale',
  'Keycap',
  'PadGlyph',
  'InputGlyph',
  'Glyph',
  'Price',
  'PromptBar',
  'Panel',
  'Screen',
  'Header',
  'Footer',
  'Dialog',
  'uiLayer',
  'layerZoom',
  'hasZoomedAncestor',
  'Button',
  'Tabs',
  'Chip',
  'Segmented',
  'Stepper',
  'Bar',
  'Tile',
  'Tooltip',
  'TooltipCard',
  'PixelSprite',
] as const;

describe('the kit index', () => {
  it('exports every component and hook of the kit contract', () => {
    const missing = CONTRACT.filter((name) => typeof kit[name] !== 'function');
    expect(missing).toEqual([]);
  });
});
