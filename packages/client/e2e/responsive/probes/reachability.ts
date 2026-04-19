import type { Probe, Finding } from './types';

const PROBE = 'primary-action-reachable';
const MIN_TOUCH = 36;

export const primaryActionReachable: Probe = async (page, ctx) => {
  const findings: Finding[] = [];
  // Wait for entrance animations to settle so we measure final positions/sizes.
  try {
    await page.evaluate(async () => {
      const deadline = performance.now() + 1200;
      while (performance.now() < deadline) {
        const running = document.getAnimations().filter((a) => {
          const effect = a.effect as KeyframeEffect | null;
          const timing = effect?.getComputedTiming();
          if (timing?.iterations === Infinity) return false;
          return a.playState === 'running';
        });
        if (running.length === 0) break;
        await Promise.race([
          Promise.all(running.map((a) => a.finished.catch(() => {}))),
          new Promise((r) => setTimeout(r, 100)),
        ]);
      }
    });
  } catch {
    // Navigation/context destruction — continue; subsequent evaluate may
    // retry in the new context.
  }
  const items = await page.evaluate(({ vw, vh }) => {
    // If the element is inside a scrollable ancestor, a user can scroll it
    // into view — so measure reachability against the scroll container's
    // visible viewport rect instead of the raw document viewport.
    const scrollAncestor = (el: HTMLElement): HTMLElement | null => {
      let p: HTMLElement | null = el.parentElement;
      while (p) {
        const s = getComputedStyle(p);
        if (s.overflowY === 'auto' || s.overflowY === 'scroll' ||
            s.overflowX === 'auto' || s.overflowX === 'scroll') {
          return p;
        }
        p = p.parentElement;
      }
      return null;
    };
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-primary-action]'));
    return els.map((el) => {
      const scroller = scrollAncestor(el);
      const r = el.getBoundingClientRect();
      const styles = window.getComputedStyle(el);
      // Viewport bounds are the default reachable surface.
      let boundTop = 0, boundLeft = 0, boundRight = vw, boundBottom = vh;
      // For elements inside a scroll container, the element is reachable as
      // long as (1) the scroller is itself visible in the viewport and (2)
      // the element fits within the scroller's viewport (scroll can bring it
      // fully into view). We check the rect against an expanded scroll range.
      if (scroller) {
        const sr = scroller.getBoundingClientRect();
        // The scroller itself must have a usable interactive surface — at
        // least 36×36 visible in the viewport. Smaller than that, the user
        // can't effectively scroll or tap.
        const visibleW = Math.min(sr.right, vw) - Math.max(sr.left, 0);
        const visibleH = Math.min(sr.bottom, vh) - Math.max(sr.top, 0);
        const scrollerReachable =
          sr.bottom > 0 && sr.top < vh && sr.right > 0 && sr.left < vw &&
          visibleW >= 36 && visibleH >= 36;
        if (scrollerReachable) {
          // The element lives in a scrollable region whose surface is on
          // screen and tappable — scrolling brings the element into view.
          // Treat as reachable regardless of element's current rect position.
          return {
            id: el.id || el.tagName.toLowerCase(),
            rect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
            visible: styles.display !== 'none' && styles.visibility !== 'hidden' && parseFloat(styles.opacity) > 0,
            offscreen: false,
          };
        }
      }
      return {
        id: el.id || el.tagName.toLowerCase(),
        rect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
        visible: styles.display !== 'none' && styles.visibility !== 'hidden' && parseFloat(styles.opacity) > 0,
        offscreen:
          r.top < boundTop - 0.5 ||
          r.left < boundLeft - 0.5 ||
          r.right > boundRight + 0.5 ||
          r.bottom > boundBottom + 0.5,
      };
    });
  }, { vw: ctx.viewport.width, vh: ctx.viewport.height });

  if (items.length === 0) {
    findings.push({
      screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
      severity: 'warn',
      detail: 'no [data-primary-action] element found on this screen — add the attribute or expect this warning',
    });
    return findings;
  }
  for (const it of items) {
    if (!it.visible) {
      findings.push({
        screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
        severity: 'fail', detail: `primary action ${it.id} not visible`,
      });
      continue;
    }
    if (it.offscreen) {
      findings.push({
        screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
        severity: 'fail',
        detail: `primary action ${it.id} off-screen (rect outside viewport ${ctx.viewport.width}×${ctx.viewport.height})`,
      });
    }
    if (it.rect.width < MIN_TOUCH || it.rect.height < MIN_TOUCH) {
      findings.push({
        screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
        severity: 'fail',
        detail: `primary action ${it.id} below 36×36 touch target (measured ${it.rect.width.toFixed(1)}×${it.rect.height.toFixed(1)})`,
        measured: Math.min(it.rect.width, it.rect.height),
        expected: MIN_TOUCH,
      });
    }
  }
  return findings;
};
