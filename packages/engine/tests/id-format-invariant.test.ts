import { describe, it, expect } from 'vitest';
import { loadAndValidateData } from '../src/data/loader.js';

describe('Data ID format invariant', () => {
  const data = loadAndValidateData();

  it('no affix ID contains "+"', () => {
    const offenders = data.affixes.filter(a => a.id.includes('+'));
    expect(offenders).toHaveLength(0);
  });

  it('no recipe ID contains "+"', () => {
    const offenders = data.recipes.filter(r => r.id.includes('+'));
    expect(offenders).toHaveLength(0);
  });

  it('no compound ID contains "+"', () => {
    const offenders = data.combinations.filter(c => c.id.includes('+'));
    expect(offenders).toHaveLength(0);
  });
});
