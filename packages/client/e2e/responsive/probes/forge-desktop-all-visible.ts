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
    const stockRect = stockpile?.getBoundingClientRect() ?? null;

    // Placement contract: weapon panel is left of armor panel, NOT stacked above.
    // Regression guard — the pre-0.6.1 build accidentally stacked them vertically
    // and the probe passed because both panels still existed inside forge-gear.
    const weapon = frame.querySelector<HTMLElement>('[data-item-card="weapon"]');
    const armor = frame.querySelector<HTMLElement>('[data-item-card="armor"]');
    let placement: null | { reason: string; w: DOMRect; a: DOMRect } = null;
    if (weapon && armor) {
      const w = weapon.getBoundingClientRect();
      const a = armor.getBoundingClientRect();
      // Allow up to 2px of subpixel overlap; require armor starts at or past
      // weapon's right edge.
      if (a.left + 2 < w.right) {
        placement = { reason: 'armor not to the right of weapon', w, a };
      }
      // And the two panels must share roughly the same top — not stacked.
      if (Math.abs(w.top - a.top) > 20) {
        placement = { reason: 'weapon/armor stacked vertically (top delta > 20px)', w, a };
      }
    } else if (!weapon || !armor) {
      placement = {
        reason: `missing gear panel(s): weapon=${!!weapon}, armor=${!!armor}`,
        w: weapon?.getBoundingClientRect() ?? new DOMRect(),
        a: armor?.getBoundingClientRect() ?? new DOMRect(),
      };
    }

    // Containment contract: stockpile cells must sit entirely inside the
    // stockpile section. Regression guard — the pre-0.6.1 build let gem rows
    // extend below the section bottom and visually collide with the tabbar.
    const overflowingCells: { bottom: number }[] = [];
    if (stockpile && stockRect) {
      stockpile.querySelectorAll<HTMLElement>('[data-stockpile-cell]').forEach((cell) => {
        const cr = cell.getBoundingClientRect();
        if (cr.bottom > stockRect.bottom + 2) {
          overflowingCells.push({ bottom: cr.bottom });
        }
      });
    }

    return {
      missing, clipped, scrollbars, stockpileCells,
      frameBottom: frameRect.bottom,
      placement,
      stockRect: stockRect ? { bottom: stockRect.bottom } : null,
      overflowingCells,
    };
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
      detail: `stockpile rendered ${data.stockpileCells} cells; expected at least 10 (5×2 grid minimum)`,
      measured: data.stockpileCells, expected: 10,
    });
  }
  if (data.placement) {
    const { reason, w, a } = data.placement;
    findings.push({
      screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE, severity: 'fail',
      detail: `gear placement: ${reason} (weapon=${w.left.toFixed(0)},${w.top.toFixed(0)} ${w.width.toFixed(0)}×${w.height.toFixed(0)}; armor=${a.left.toFixed(0)},${a.top.toFixed(0)} ${a.width.toFixed(0)}×${a.height.toFixed(0)})`,
    });
  }
  if (data.overflowingCells.length > 0 && data.stockRect) {
    const maxBottom = Math.max(...data.overflowingCells.map(c => c.bottom));
    findings.push({
      screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE, severity: 'fail',
      detail: `${data.overflowingCells.length} stockpile cell(s) overflow their section (max bottom=${maxBottom.toFixed(1)}, section bottom=${data.stockRect.bottom.toFixed(1)})`,
      measured: maxBottom, expected: data.stockRect.bottom,
    });
  }
  return findings;
};
