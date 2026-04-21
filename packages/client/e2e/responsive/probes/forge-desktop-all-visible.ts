import type { Probe, Finding } from './types';

const PROBE = 'forge-desktop-all-visible';

/**
 * Desktop-HUD-only probe: verifies the three primary forge regions
 * (`forge-gear`, `forge-combine`, `forge-tray`) all fit inside the frame
 * without clipping or vertical scrollbars, and that the stockpile grid
 * renders the full 10 cells (5×2) regardless of stockpile size.
 *
 * Skips silently when the document is not in desktop frame mode — portrait
 * viewports use the existing Forge layout and are covered by the
 * `forge-equip` / `forge-combine` specs.
 */
export const forgeDesktopAllVisible: Probe = async (page, ctx) => {
  // Only meaningful on the desktop HUD forge screen. Skip when the page isn't
  // rendering the desktop forge tree (other screens at desktop aspect — Draft,
  // Duel, MainMenu — still report data-frame-mode=desktop but don't have the
  // forge-specific data-screen-section anchors).
  const applies = await page.evaluate(() => {
    const mode = document.documentElement.getAttribute('data-frame-mode');
    if (mode !== 'desktop') return false;
    return document.querySelector('[data-screen="forge-desktop"]') !== null;
  });
  if (!applies) return [];

  const data = await page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>('.app-frame');
    if (!frame) return null;
    const frameRect = frame.getBoundingClientRect();
    const required = [
      '[data-screen-section="forge-gear"]',
      '[data-screen-section="forge-combine"]',
      '[data-screen-section="forge-tray"]',
    ];
    const missing: string[] = [];
    const clipped: { selector: string; bottom: number; overflow: number }[] = [];
    const scrollbars: { selector: string; scrollHeight: number; clientHeight: number }[] = [];
    for (const sel of required) {
      const el = frame.querySelector<HTMLElement>(sel);
      if (!el) { missing.push(sel); continue; }
      const r = el.getBoundingClientRect();
      if (r.bottom > frameRect.bottom + 1) {
        clipped.push({ selector: sel, bottom: r.bottom, overflow: r.bottom - frameRect.bottom });
      }
      // Only flag a scrollbar when overflow-y is auto/scroll — that's what
      // actually produces a visible scrollbar. overflow: hidden/visible with
      // tall content may clip but does not scroll; those cases show up in
      // the `clipped` check when they spill past the frame.
      const overflowY = getComputedStyle(el).overflowY;
      const scrollable = overflowY === 'auto' || overflowY === 'scroll';
      if (scrollable && el.scrollHeight > el.clientHeight + 2) {
        scrollbars.push({ selector: sel, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
      }
    }
    // Also verify the full 2-row stockpile grid is laid out (not collapsed to 1 row)
    const stockpile = frame.querySelector<HTMLElement>('[data-screen-section="forge-tray"]');
    const stockpileCells = stockpile?.querySelectorAll('[data-stockpile-cell]').length ?? 0;
    return { missing, clipped, scrollbars, stockpileCells, frameBottom: frameRect.bottom };
  });

  if (!data) return [];
  const findings: Finding[] = [];
  if (data.missing.length) {
    findings.push({
      screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE, severity: 'fail',
      detail: `required sections missing: ${data.missing.join(', ')}`,
    });
  }
  for (const c of data.clipped) {
    findings.push({
      screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE, severity: 'fail',
      detail: `${c.selector} spills past frame (${c.overflow.toFixed(1)}px)`,
      measured: c.bottom, expected: data.frameBottom,
    });
  }
  for (const s of data.scrollbars) {
    findings.push({
      screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE, severity: 'fail',
      detail: `${s.selector} has vertical scrollbar (scrollHeight=${s.scrollHeight} > clientHeight=${s.clientHeight})`,
      measured: s.scrollHeight, expected: s.clientHeight,
    });
  }
  if (data.stockpileCells < 10) {
    findings.push({
      screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE, severity: 'fail',
      detail: `stockpile rendered ${data.stockpileCells} cells; expected 10 (5×2 grid)`,
      measured: data.stockpileCells, expected: 10,
    });
  }
  return findings;
};
