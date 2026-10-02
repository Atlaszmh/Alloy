import type { Probe, Finding } from './types';
import { CLICK_TARGETS } from './min-size';

const PROBE_X = 'overflow-x';
const PROBE_X_DOC = 'overflow-x-doc';
const PROBE_X_INNER = 'overflow-x-inner';
const PROBE_Y = 'overflow-y';
const PROBE_PAGE = 'page-scroll';

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

  // Tertiary: horizontal scrollbars inside the frame. The primary probe skips
  // elements clipped by an overflow-x auto/scroll/hidden ancestor, so a grid
  // that overflows its parent column generates a scrollbar inside the ancestor
  // without tripping the frame-relative check. Flag any scroll ancestor whose
  // scrollWidth exceeds its clientWidth inside the frame.
  const inner = await page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>('.app-frame');
    if (!frame) return [] as { selector: string; scrollWidth: number; clientWidth: number }[];
    const offenders: { selector: string; scrollWidth: number; clientWidth: number }[] = [];
    frame.querySelectorAll<HTMLElement>('*').forEach((el) => {
      if (offenders.length >= 5) return;
      const s = getComputedStyle(el);
      const scrolls =
        s.overflowX === 'auto' || s.overflowX === 'scroll' ||
        s.overflow === 'auto' || s.overflow === 'scroll';
      if (!scrolls) return;
      // 2px tolerance: subpixel rendering + border/scrollbar widths can push
      // scrollWidth 1px past clientWidth without a visible scrollbar.
      if (el.scrollWidth > el.clientWidth + 2) {
        const id = el.id ? `#${el.id}` : '';
        const screenSection = el.getAttribute('data-screen-section');
        const marker = screenSection ? `[data-screen-section="${screenSection}"]` : '';
        const cls = el.className && typeof el.className === 'string'
          ? `.${el.className.split(/\s+/).slice(0, 2).join('.')}`
          : '';
        offenders.push({
          selector: `${el.tagName.toLowerCase()}${id}${marker}${cls}`,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        });
      }
    });
    return offenders;
  });

  for (const off of inner) {
    findings.push({
      screen: ctx.screen,
      viewport: ctx.viewport.name,
      probe: PROBE_X_INNER,
      severity: 'fail',
      detail: `scroll container has horizontal scrollbar: ${off.selector} (scrollWidth=${off.scrollWidth} > clientWidth=${off.clientWidth})`,
      measured: off.scrollWidth,
      expected: off.clientWidth,
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

/**
 * The Delve's overflow rule: the page never scrolls, panes may. The document must fit the
 * window, and no click target may be cut off (outside the window, or outside an ancestor that
 * clips it) unless a scrolling pane between them can bring it into view, and that pane must
 * itself fit the window and every ancestor that clips it.
 */
export const pageScroll: Probe = async (page, ctx) => {
  const data = await page.evaluate((targets) => {
    const doc = document.documentElement;
    const clips = (s: CSSStyleDeclaration) => s.overflowX !== 'visible' || s.overflowY !== 'visible';
    // A pane scrolls only on an axis whose overflow is auto/scroll and whose content overflows it:
    // overflow-x:hidden alone computes overflow-y to auto, and a pane that grew to its content
    // (the usual missing min-h-0) can't scroll; both only clip.
    const scrolls = (p: HTMLElement, s: CSSStyleDeclaration) =>
      (['auto', 'scroll'].includes(s.overflowY) && p.scrollHeight > p.clientHeight + 1) ||
      (['auto', 'scroll'].includes(s.overflowX) && p.scrollWidth > p.clientWidth + 1);
    // The box `el` must fit: each clipping ancestor up to the first that scrolls (returned too, as
    // what can bring `el` into view), or else up to the window.
    const clipBox = (el: HTMLElement) => {
      let top = -Infinity, left = -Infinity, right = Infinity, bottom = Infinity;
      let scroller: HTMLElement | null = null;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (!clips(s)) continue;
        if (scrolls(p, s)) { scroller = p; break; }
        const pr = p.getBoundingClientRect();
        top = Math.max(top, pr.top); left = Math.max(left, pr.left);
        right = Math.min(right, pr.right); bottom = Math.min(bottom, pr.bottom);
      }
      if (!scroller) {
        top = Math.max(top, 0); left = Math.max(left, 0);
        right = Math.min(right, innerWidth); bottom = Math.min(bottom, innerHeight);
      }
      return { top, left, right, bottom, scroller };
    };
    const describe = (el: Element) => {
      const tid = el.getAttribute('data-testid');
      const section = el.getAttribute('data-screen-section');
      const cls = typeof el.className === 'string' && el.className
        ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
      if (tid) return `[data-testid="${tid}"]${text ? ` "${text}"` : ''}`;
      if (section) return `[data-screen-section="${section}"]`;
      return `${el.tagName.toLowerCase()}${cls}${text ? ` "${text}"` : ''}`;
    };
    const cut: string[] = [];
    const checked = new Set<HTMLElement>();
    document.querySelectorAll<HTMLElement>(targets).forEach((el) => {
      if (cut.length >= 5) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return;
      // The control against its box; then each pane that scrolls it against the pane's own box.
      for (let node: HTMLElement = el; ;) {
        const b = clipBox(node);
        const nr = node.getBoundingClientRect();
        if (nr.top < b.top - 1 || nr.left < b.left - 1 || nr.right > b.right + 1 || nr.bottom > b.bottom + 1) {
          cut.push(node === el
            ? describe(el)
            : `scrolling pane ${describe(node).slice(0, 60)} (cut off by an ancestor, so is its content: ${describe(el)})`);
          return;
        }
        if (!b.scroller || checked.has(b.scroller)) return;
        checked.add(b.scroller);
        node = b.scroller;
      }
    });
    return { scrollW: doc.scrollWidth, scrollH: doc.scrollHeight, cut };
  }, CLICK_TARGETS);

  const findings: Finding[] = [];
  const { width, height } = ctx.viewport;
  if (data.scrollW > width + 0.5 || data.scrollH > height + 0.5) {
    findings.push({
      screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE_PAGE,
      severity: 'fail',
      detail: `the page scrolls: document ${data.scrollW}×${data.scrollH} exceeds the window ${width}×${height}`,
    });
  }
  if (data.cut.length > 0) {
    findings.push({
      screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE_PAGE,
      severity: 'fail',
      detail: `controls cut off outside any scrolling pane: ${data.cut.join(', ')}`,
    });
  }
  return findings;
};
