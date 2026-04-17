import type { Probe, Finding } from './types';

const PROBE = 'min-size';

// Mirrors clamp() floors in packages/client/src/index.css.
// If those clamps change, update this table in the same commit.
const MIN_GEM_SIZE = 90;
const MIN_SOCKET_SIZE = 40;
const MIN_TEXT_PX = 8;

export const minSize: Probe = async (page, ctx) => {
  const data = await page.evaluate(() => {
    const elementMin = (selector: string) => {
      return Array.from(document.querySelectorAll<HTMLElement>(selector)).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          id: el.id || el.tagName.toLowerCase(),
          width: r.width,
          height: r.height,
        };
      });
    };
    const texts: { id: string; size: number }[] = [];
    document.querySelectorAll<HTMLElement>('[data-screen-section]').forEach((section) => {
      section.querySelectorAll<HTMLElement>('*').forEach((el) => {
        if (el.textContent && el.textContent.trim().length > 0) {
          const fs = parseFloat(window.getComputedStyle(el).fontSize);
          if (Number.isFinite(fs)) {
            texts.push({ id: el.id || el.tagName.toLowerCase(), size: fs });
          }
        }
      });
    });
    return {
      gems: elementMin('[data-gem]'),
      sockets: elementMin('.forge-socket'),
      texts,
    };
  });

  const findings: Finding[] = [];
  for (const g of data.gems) {
    if (g.width > 0 && g.height > 0 && (g.width < MIN_GEM_SIZE || g.height < MIN_GEM_SIZE)) {
      findings.push({
        screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
        severity: 'fail',
        detail: `gem ${g.id} ${g.width.toFixed(1)}×${g.height.toFixed(1)} below ${MIN_GEM_SIZE}px floor`,
        measured: Math.min(g.width, g.height),
        expected: MIN_GEM_SIZE,
      });
    }
  }
  for (const s of data.sockets) {
    if (s.width > 0 && s.height > 0 && (s.width < MIN_SOCKET_SIZE || s.height < MIN_SOCKET_SIZE)) {
      findings.push({
        screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
        severity: 'fail',
        detail: `socket ${s.id} ${s.width.toFixed(1)}×${s.height.toFixed(1)} below ${MIN_SOCKET_SIZE}px floor`,
        measured: Math.min(s.width, s.height),
        expected: MIN_SOCKET_SIZE,
      });
    }
  }
  for (const t of data.texts) {
    if (t.size < MIN_TEXT_PX) {
      findings.push({
        screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
        severity: 'fail',
        detail: `${t.id} font-size ${t.size.toFixed(1)}px below ${MIN_TEXT_PX}px floor`,
        measured: t.size,
        expected: MIN_TEXT_PX,
      });
    }
  }
  return findings;
};
