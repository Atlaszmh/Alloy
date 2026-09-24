import { describe, it, expect } from 'vitest';
import { appPromptsDoc } from '../src/app-prompts';
import type { AssetSpec, StyleGuide } from '../src/style';

const STYLE: StyleGuide = {
  name: 'test',
  palette: { name: 'p', colors: ['#000000'] },
  outline: '#000000',
  background: '#ff00ff',
  pixelUnit: 0.1,
  maxColors: 8,
  model: 'm',
  prompt: ['A {size}x{size} sprite of {subject}.'],
};

const ASSETS: AssetSpec[] = [
  { id: 'frost_wolf', size: 16, source: 'ai', subject: 'a white wolf' },
  { id: 'hollow_king', size: 32, source: 'ai', subject: 'a skeletal king' },
];

describe('appPromptsDoc', () => {
  const doc = appPromptsDoc(STYLE, ASSETS, 'reference.png');

  it('gives every asset its own copyable prompt', () => {
    expect(doc).toContain('## frost_wolf');
    expect(doc).toContain('A 16x16 sprite of a white wolf.');
    expect(doc).toContain('## hollow_king');
    expect(doc).toContain('A 32x32 sprite of a skeletal king.');
    expect(doc.match(/```/g)?.length).toBe(4);
  });

  it('asks the model to use the attached sprites for style only', () => {
    expect(doc).toContain('reference.png');
    expect(doc).toMatch(/draw only the new creature/);
  });

  it('says how to name the saved files', () => {
    expect(doc).toContain('frost_wolf-2.png');
  });
});
