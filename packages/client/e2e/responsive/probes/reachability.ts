import type { Probe, Finding } from './types';

const PROBE = 'primary-action-reachable';
const MIN_TOUCH = 36;

export const primaryActionReachable: Probe = async (page, ctx) => {
  const findings: Finding[] = [];
  const items = await page.evaluate(({ vw, vh }) => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-primary-action]'));
    return els.map((el) => {
      const r = el.getBoundingClientRect();
      const styles = window.getComputedStyle(el);
      return {
        id: el.id || el.tagName.toLowerCase(),
        rect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
        visible: styles.display !== 'none' && styles.visibility !== 'hidden' && parseFloat(styles.opacity) > 0,
        offscreen: r.top < 0 || r.left < 0 || r.right > vw || r.bottom > vh,
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
