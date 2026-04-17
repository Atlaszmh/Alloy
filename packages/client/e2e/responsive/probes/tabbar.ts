import type { Probe, Finding } from './types';

const PROBE = 'tabbar-visibility';

export const tabBarVisibility: Probe = async (page, ctx) => {
  const result = await page.evaluate(() => {
    const tabbar = document.querySelector<HTMLElement>('[data-tabbar]');
    if (!tabbar) return { missing: true } as const;
    const r = tabbar.getBoundingClientRect();
    const styles = window.getComputedStyle(tabbar);
    const visible =
      styles.display !== 'none' &&
      styles.visibility !== 'hidden' &&
      parseFloat(styles.opacity) > 0 &&
      r.width > 0 &&
      r.height > 0;
    const inViewport =
      r.top < window.innerHeight && r.bottom > 0 &&
      r.left < window.innerWidth && r.right > 0;

    const overlaps: string[] = [];
    document.querySelectorAll<HTMLElement>('[data-primary-action]').forEach((el) => {
      const er = el.getBoundingClientRect();
      const intersects =
        er.right > r.left && er.left < r.right &&
        er.bottom > r.top && er.top < r.bottom;
      if (intersects) {
        overlaps.push(el.id ? `#${el.id}` : el.tagName.toLowerCase());
      }
    });
    return { missing: false, visible, inViewport, overlaps, rect: { top: r.top, bottom: r.bottom } };
  });

  const findings: Finding[] = [];
  if (result.missing) {
    findings.push({
      screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
      severity: 'fail', detail: '[data-tabbar] element missing from DOM',
    });
    return findings;
  }
  if (!result.visible) {
    findings.push({
      screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
      severity: 'fail', detail: 'tab bar present but not visible (display/opacity/zero size)',
    });
  }
  if (!result.inViewport) {
    findings.push({
      screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
      severity: 'fail', detail: 'tab bar rect outside viewport',
    });
  }
  if (result.overlaps && result.overlaps.length > 0) {
    findings.push({
      screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
      severity: 'fail',
      detail: `tab bar overlaps primary action(s): ${result.overlaps.join(', ')}`,
    });
  }
  return findings;
};
