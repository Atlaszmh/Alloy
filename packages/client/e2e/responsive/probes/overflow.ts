import type { Probe, Finding } from './types';

const PROBE_X = 'overflow-x';
const PROBE_X_DOC = 'overflow-x-doc';
const PROBE_Y = 'overflow-y';

export const overflowX: Probe = async (page, ctx) => {
  const data = await page.evaluate((vw) => {
    const frame = document.querySelector<HTMLElement>('.app-frame');
    if (!frame) return { frame: null as null | { frameRight: number; offenders: { selector: string; right: number }[] }, docW: document.documentElement.scrollWidth };
    const frameRight = frame.getBoundingClientRect().right;
    const offenders: { selector: string; right: number }[] = [];
    // An element only "spills" if it is actually visible past the frame right.
    // Skip elements that are clipped by an ancestor whose overflow-x is
    // auto/scroll/hidden — those represent internal scroll content, not spill.
    const isClippedByAncestor = (el: HTMLElement): boolean => {
      let p: HTMLElement | null = el.parentElement;
      while (p && p !== frame) {
        const s = getComputedStyle(p);
        if (s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'hidden' ||
            s.overflow === 'auto' || s.overflow === 'scroll' || s.overflow === 'hidden') {
          return true;
        }
        p = p.parentElement;
      }
      return false;
    };
    frame.querySelectorAll<HTMLElement>('*').forEach((el) => {
      if (offenders.length >= 5) return;
      const r = el.getBoundingClientRect();
      if (r.right > frameRight + 0.5) {
        if (isClippedByAncestor(el)) return;
        const id = el.id ? `#${el.id}` : '';
        const cls = el.className && typeof el.className === 'string'
          ? `.${el.className.split(/\s+/).slice(0, 2).join('.')}`
          : '';
        offenders.push({ selector: `${el.tagName.toLowerCase()}${id}${cls}`, right: r.right });
      }
    });
    return {
      frame: { frameRight, offenders },
      docW: document.documentElement.scrollWidth,
    };
  }, ctx.viewport.width);

  const findings: Finding[] = [];

  // Primary probe: frame-relative overflow. If .app-frame is missing we emit
  // nothing from this probe — run-all.ts already emits a frame-missing finding.
  if (data.frame && data.frame.offenders.length > 0) {
    const maxRight = Math.max(...data.frame.offenders.map(o => o.right));
    findings.push({
      screen: ctx.screen,
      viewport: ctx.viewport.name,
      probe: PROBE_X,
      severity: 'fail',
      detail: `descendants spill past .app-frame right (${data.frame.frameRight.toFixed(1)}): ${data.frame.offenders.map(o => `${o.selector}@${o.right.toFixed(1)}`).join(', ')}`,
      measured: maxRight,
      expected: data.frame.frameRight,
    });
  }

  // Secondary safety net: body-level horizontal scroll bleed (e.g., fixed/absolute
  // elements escaping the frame). Catches cases the frame-relative check misses
  // because .app-frame has overflow:hidden.
  if (data.docW > ctx.viewport.width + 0.5) {
    findings.push({
      screen: ctx.screen,
      viewport: ctx.viewport.name,
      probe: PROBE_X_DOC,
      severity: 'fail',
      detail: `documentElement.scrollWidth=${data.docW} exceeds viewport ${ctx.viewport.width}`,
      measured: data.docW,
      expected: ctx.viewport.width,
    });
  }

  return findings;
};

export const overflowY: Probe = async (page, ctx) => {
  const data = await page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>('.app-frame');
    if (!frame) return null;
    const frameBottom = frame.getBoundingClientRect().bottom;
    const offenders: { selector: string; bottom: number }[] = [];
    // An element only "spills" if it is actually visible past the frame bottom.
    // Skip elements that are clipped by an ancestor whose overflow-y is
    // auto/scroll/hidden — those represent internal scroll content, not spill.
    const isClippedByAncestor = (el: HTMLElement): boolean => {
      let p: HTMLElement | null = el.parentElement;
      while (p && p !== frame) {
        const s = getComputedStyle(p);
        if (s.overflowY === 'auto' || s.overflowY === 'scroll' || s.overflowY === 'hidden' ||
            s.overflow === 'auto' || s.overflow === 'scroll' || s.overflow === 'hidden') {
          return true;
        }
        p = p.parentElement;
      }
      // The frame itself has overflow:hidden — anything past it is visually clipped
      // too. But we still want to flag elements that are actually positioned outside
      // the frame (e.g., fixed/absolute escaping). Treat the frame as a clip only
      // if the element's offsetParent chain is inside the frame.
      return false;
    };
    frame.querySelectorAll<HTMLElement>('*').forEach((el) => {
      if (offenders.length >= 5) return;
      const r = el.getBoundingClientRect();
      if (r.bottom > frameBottom + 0.5) {
        if (isClippedByAncestor(el)) return;
        const id = el.id ? `#${el.id}` : '';
        const cls = el.className && typeof el.className === 'string'
          ? `.${el.className.split(/\s+/).slice(0, 2).join('.')}`
          : '';
        offenders.push({ selector: `${el.tagName.toLowerCase()}${id}${cls}`, bottom: r.bottom });
      }
    });
    return { frameBottom, offenders };
  });

  if (!data || data.offenders.length === 0) return [];
  return [{
    screen: ctx.screen,
    viewport: ctx.viewport.name,
    probe: PROBE_Y,
    severity: 'fail',
    detail: `descendants spill past .app-frame bottom (${data.frameBottom.toFixed(1)}): ${data.offenders.map(o => `${o.selector}@${o.bottom.toFixed(1)}`).join(', ')}`,
    measured: Math.max(...data.offenders.map(o => o.bottom)),
    expected: data.frameBottom,
  }];
};
