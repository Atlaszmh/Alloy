import type { Probe, Finding } from './types';

const PROBE = 'min-size';

// Mirrors clamp() floors in packages/client/src/index.css plus the explicit
// 80px floor in ForgeGemTray.computeTrayGemSize() (see
// packages/client/src/components/ForgeGemTray.tsx). If those floors change,
// update this table in the same commit.
//
// NOTE: the forge stockpile tray computes its own local --gem-size via
// ResizeObserver (5 gems per row, clamped to [80, 140]), so gems there can
// render at 80px even when the root --gem-size clamp would give ≥90px. 80px
// is still comfortably above WCAG 44×44 and Google 48×48 tap-target floors.
const MIN_GEM_SIZE = 80;
const MIN_SOCKET_SIZE = 40;
const MIN_TEXT_PX = 8;

export const minSize: Probe = async (page, ctx) => {
  // Wait for any in-flight CSS/Web animations (e.g., Framer Motion entrance
  // transitions, rarity shimmers are infinite so we filter them) so the probe
  // doesn't catch mid-animation transforms (scale 0.7 → 1.0) and report them
  // as undersized elements.
  try {
    await page.evaluate(async () => {
      const deadline = performance.now() + 1200;
      while (performance.now() < deadline) {
        const running = document.getAnimations().filter((a) => {
          // Skip infinite loops (rarity shimmers, pulse-glow, etc.) — those
          // never "finish" but they don't change transforms drastically.
          const effect = a.effect as KeyframeEffect | null;
          const timing = effect?.getComputedTiming();
          const iter = timing?.iterations;
          if (iter === Infinity) return false;
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
    // Navigation or context destruction during settle — safe to continue;
    // subsequent probe evaluate will either succeed in the new context or
    // surface its own error.
  }

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
    // Walk text nodes (not elements) so we only check elements that directly
    // contain visible text. Walking descendants by `textContent` flooded reports
    // because every ancestor reports its children's text recursively.
    const texts: { id: string; size: number }[] = [];
    const seen = new Set<HTMLElement>();
    document.querySelectorAll<HTMLElement>('[data-screen-section]').forEach((section) => {
      const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
      let node: Node | null = walker.nextNode();
      while (node) {
        if (node.textContent && node.textContent.trim().length > 0) {
          const parent = node.parentElement;
          if (parent && !seen.has(parent)) {
            seen.add(parent);
            const fs = parseFloat(window.getComputedStyle(parent).fontSize);
            if (Number.isFinite(fs)) {
              texts.push({ id: parent.id || parent.tagName.toLowerCase(), size: fs });
            }
          }
        }
        node = walker.nextNode();
      }
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
