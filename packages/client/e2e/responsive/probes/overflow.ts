import type { Probe, Finding } from './types';

const PROBE_X = 'overflow-x';
const PROBE_Y = 'overflow-y';

export const overflowX: Probe = async (page, ctx) => {
  const data = await page.evaluate((vw) => {
    const docW = document.documentElement.scrollWidth;
    if (docW <= vw) return { docW, offenders: [] as string[] };
    const offenders: string[] = [];
    document.querySelectorAll<HTMLElement>('*').forEach((el) => {
      if (offenders.length >= 5) return;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 0.5) {
        const id = el.id ? `#${el.id}` : '';
        const cls = el.className && typeof el.className === 'string'
          ? `.${el.className.split(/\s+/).slice(0, 2).join('.')}`
          : '';
        offenders.push(`${el.tagName.toLowerCase()}${id}${cls}`);
      }
    });
    return { docW, offenders };
  }, ctx.viewport.width);

  if (data.docW <= ctx.viewport.width) return [];
  const finding: Finding = {
    screen: ctx.screen,
    viewport: ctx.viewport.name,
    probe: PROBE_X,
    severity: 'fail',
    detail: `documentElement.scrollWidth=${data.docW} exceeds viewport ${ctx.viewport.width}; offenders: ${data.offenders.join(', ') || '(unidentified)'}`,
    measured: data.docW,
    expected: ctx.viewport.width,
  };
  return [finding];
};

export const overflowY: Probe = async (page, ctx) => {
  const data = await page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>('.app-frame');
    if (!frame) return null;
    const frameBottom = frame.getBoundingClientRect().bottom;
    const offenders: { selector: string; bottom: number }[] = [];
    frame.querySelectorAll<HTMLElement>('*').forEach((el) => {
      if (offenders.length >= 5) return;
      const r = el.getBoundingClientRect();
      if (r.bottom > frameBottom + 0.5) {
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
