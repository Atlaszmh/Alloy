import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fillWorkflow, placeholders, type Workflow } from '../src/workflow';

const WF: Workflow = {
  '1': { class_type: 'RandomNoise', inputs: { noise_seed: '{{seed}}' } },
  '2': {
    class_type: 'CLIPTextEncode',
    inputs: { text: 'pixel art, {{subject}}, {{size}}px', clip: ['3', 0] },
  },
  '3': { class_type: 'LoadImage', inputs: { image: '{{reference}}' } },
};
const VARS = { seed: 42, subject: 'a wolf', size: 16, reference: 'ref.png', prompt: 'p' };

describe('fillWorkflow', () => {
  it('keeps the type of a value that fills a whole input, so seeds stay numbers', () => {
    const out = fillWorkflow(WF, VARS);
    expect(out['1'].inputs.noise_seed).toBe(42);
    expect(out['3'].inputs.image).toBe('ref.png');
  });

  it('fills placeholders inside text and leaves node links alone', () => {
    const out = fillWorkflow(WF, VARS);
    expect(out['2'].inputs.text).toBe('pixel art, a wolf, 16px');
    expect(out['2'].inputs.clip).toEqual(['3', 0]);
  });

  it('does not change the workflow it was given', () => {
    fillWorkflow(WF, VARS);
    expect(WF['1'].inputs.noise_seed).toBe('{{seed}}');
  });

  it('names a placeholder it cannot fill', () => {
    expect(() => fillWorkflow(WF, { seed: 1 })).toThrow(/\{\{subject\}\}/);
  });
});

describe('placeholders', () => {
  it('lists the placeholders a workflow uses', () => {
    expect([...placeholders(WF)].sort()).toEqual(['reference', 'seed', 'size', 'subject']);
  });
});

describe('shipped workflows', () => {
  const dir = fileURLToPath(new URL('../workflows/', import.meta.url));
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it('exist', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s takes a seed and a prompt and has one image output', (file) => {
    const wf = JSON.parse(readFileSync(dir + file, 'utf8')) as Workflow;
    const used = placeholders(wf);
    expect(used.has('seed')).toBe(true);
    expect(used.has('prompt') || used.has('subject')).toBe(true);
    const outputs = Object.values(wf).filter((n) =>
      /^(PreviewImage|SaveImage)$/.test(n.class_type),
    );
    expect(outputs).toHaveLength(1);
    // Every link points at a node that exists.
    for (const node of Object.values(wf)) {
      for (const v of Object.values(node.inputs)) {
        if (Array.isArray(v)) expect(wf[v[0] as string], `${file}: link to ${v[0]}`).toBeDefined();
      }
    }
  });
});
