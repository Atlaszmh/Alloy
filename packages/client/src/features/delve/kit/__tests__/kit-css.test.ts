import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, '../kit.css'), 'utf8');
const legacy = readFileSync(resolve(__dirname, '../../delve.css'), 'utf8');
const pub = resolve(__dirname, '../../../../../public');

/** The body of a top-level rule, e.g. `.delve-btn { … }`. */
function rule(sheet: string, selector: string): string {
  const at = sheet.indexOf(`\n${selector} {`);
  return at < 0 ? '' : sheet.slice(at, sheet.indexOf('}', at));
}

describe('kit.css', () => {
  it('self-hosts its three fonts, each beside its licence', () => {
    const faces = [...css.matchAll(/font-family: '([^']+)';\s+src: url\('([^']+)'\)/g)];
    expect(faces.map((f) => f[1])).toEqual(['Jersey 10', 'Pixelify Sans', 'Silkscreen']);
    for (const [, family, url] of faces) {
      const file = resolve(pub, `.${url}`);
      expect(readFileSync(file).subarray(0, 4).toString('latin1'), family).toBe('wOF2');
      expect(readFileSync(resolve(dirname(file), 'OFL.txt'), 'utf8')).toMatch(
        /SIL OPEN FONT LICENSE Version 1\.1/,
      );
    }
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });

  it('keeps the zoom off .delve-ui, on its own two classes', () => {
    expect(rule(css, '.delve-zoom')).toContain('zoom: var(--ui-scale, 1);');
    expect(rule(css, '.delve-hud-zoom')).toContain('zoom: var(--hud-scale, 1);');
    for (const [, body] of css.matchAll(/\n\.delve-ui \{([^}]*)\}/g)) {
      expect(body).not.toMatch(/zoom/);
    }
  });

  it('re-skins the legacy classes square in the forge materials, and loads the kit with them', () => {
    expect(legacy).toMatch(/^@import '\.\/kit\/kit\.css';\r?$/m);
    const looks: [string, string][] = [
      ['.delve-btn', 'repeating-linear-gradient(0deg, #733e39 0 10px, #6a3934 10px 12px)'],
      ['.delve-btn-gold', 'background: #feae34;'],
      ['.delve-panel', 'border: 6px solid #733e39;'],
      ['.delve-tile', 'border: 3px solid;'],
      ['.delve-chip', 'background: #3a4466;'],
      ['.delve-sheet', 'border: 4px solid #3a4466;'],
      ['.delve-hpbar', 'background: #181425;'],
    ];
    for (const [selector, look] of looks) {
      const body = rule(legacy, selector);
      expect(body, selector).toContain(look);
      expect(body, selector).not.toMatch(/border-radius: (?!0;)/);
    }
    expect(legacy).not.toMatch(/linear-gradient\(180deg/);
  });
});
