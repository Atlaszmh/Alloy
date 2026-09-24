/**
 * Imperative combat effects for the Delve stage, built on the Web Animations
 * API. Transient effect nodes (numbers, slashes, beams) are created in an
 * overlay layer and removed when their animation finishes; persistent
 * elements (monster, HUD) are animated in place.
 */

export interface Point {
  x: number;
  y: number;
}

let liveNodes = 0;
const MAX_LIVE_NODES = 60;

function spawn(
  layer: HTMLElement,
  className: string,
  style: Partial<CSSStyleDeclaration>,
): HTMLDivElement | null {
  if (liveNodes >= MAX_LIVE_NODES) return null;
  const el = document.createElement('div');
  el.className = className;
  Object.assign(el.style, style);
  layer.appendChild(el);
  liveNodes++;
  return el;
}

function retire(el: HTMLElement, anim: Animation): void {
  const done = () => {
    el.remove();
    liveNodes = Math.max(0, liveNodes - 1);
  };
  anim.finished.then(done, done);
}

/** Centre of `el` in `layer` coordinates. */
export function centerIn(layer: HTMLElement, el: HTMLElement | null, yBias = 0.5): Point {
  const l = layer.getBoundingClientRect();
  if (!el) return { x: l.width / 2, y: l.height / 3 };
  const r = el.getBoundingClientRect();
  return { x: r.left - l.left + r.width / 2, y: r.top - l.top + r.height * yBias };
}

export interface FloatOptions {
  color: string;
  size?: number;
  rise?: number;
  duration?: number;
  pop?: boolean;
  jitter?: number;
}

export function floatText(layer: HTMLElement, at: Point, text: string, opts: FloatOptions): void {
  const jitter = opts.jitter ?? 26;
  const x = at.x + (Math.random() - 0.5) * jitter * 2;
  const y = at.y + (Math.random() - 0.5) * jitter;
  const el = spawn(layer, 'delve-number', {
    left: `${x}px`,
    top: `${y}px`,
    color: opts.color,
    fontSize: `${opts.size ?? 20}px`,
    transform: 'translate(-50%, -50%)',
  });
  if (!el) return;
  el.textContent = text;
  const rise = opts.rise ?? 46;
  const drift = (Math.random() - 0.5) * 30;
  const frames: Keyframe[] = opts.pop
    ? [
        { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%,-60%) scale(1.45)', opacity: 1, offset: 0.15 },
        { transform: 'translate(-50%,-70%) scale(1)', opacity: 1, offset: 0.35 },
        {
          transform: `translate(calc(-50% + ${drift}px), calc(-50% - ${rise}px)) scale(0.9)`,
          opacity: 0,
        },
      ]
    : [
        { transform: 'translate(-50%,-50%) scale(0.6)', opacity: 0 },
        { transform: 'translate(-50%,-60%) scale(1.05)', opacity: 1, offset: 0.12 },
        {
          transform: `translate(calc(-50% + ${drift}px), calc(-50% - ${rise}px)) scale(0.85)`,
          opacity: 0,
        },
      ];
  retire(
    el,
    el.animate(frames, {
      duration: opts.duration ?? 850,
      easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
    }),
  );
}

/** A diagonal blade streak across a point. */
export function slash(layer: HTMLElement, at: Point, color: string, big = false): void {
  const len = big ? 190 : 120 + Math.random() * 40;
  const angle = -35 + (Math.random() - 0.5) * 50 + (Math.random() < 0.5 ? 0 : 70);
  const el = spawn(layer, '', {
    position: 'absolute',
    left: `${at.x + (Math.random() - 0.5) * 30}px`,
    top: `${at.y + (Math.random() - 0.5) * 30}px`,
    width: `${len}px`,
    height: big ? '6px' : '3px',
    borderRadius: '3px',
    background: `linear-gradient(90deg, transparent, ${color}, #ffffff, ${color}, transparent)`,
    boxShadow: `0 0 ${big ? 18 : 10}px ${color}`,
    transform: `translate(-50%, -50%) rotate(${angle}deg) scaleX(0)`,
  });
  if (!el) return;
  retire(
    el,
    el.animate(
      [
        { transform: `translate(-50%,-50%) rotate(${angle}deg) scaleX(0)`, opacity: 1 },
        {
          transform: `translate(-50%,-50%) rotate(${angle}deg) scaleX(1)`,
          opacity: 1,
          offset: 0.35,
        },
        { transform: `translate(-50%,-50%) rotate(${angle}deg) scaleX(1.1)`, opacity: 0 },
      ],
      { duration: big ? 380 : 240, easing: 'ease-out' },
    ),
  );
}

/** Expanding shockwave ring (slam, boss death). */
export function ring(layer: HTMLElement, at: Point, color: string, size = 220): void {
  const el = spawn(layer, '', {
    position: 'absolute',
    left: `${at.x}px`,
    top: `${at.y}px`,
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    border: `4px solid ${color}`,
    boxShadow: `0 0 24px ${color}, inset 0 0 24px ${color}`,
    transform: 'translate(-50%,-50%) scale(0.1)',
  });
  if (!el) return;
  retire(
    el,
    el.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0.1)', opacity: 1 },
        { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 0 },
      ],
      { duration: 520, easing: 'cubic-bezier(0.1, 0.7, 0.3, 1)' },
    ),
  );
}

/** Vertical pillar of light where a rare+ item dropped. */
export function beam(layer: HTMLElement, at: Point, color: string, duration = 1100): void {
  const el = spawn(layer, '', {
    position: 'absolute',
    left: `${at.x}px`,
    top: '0px',
    width: '46px',
    height: `${at.y + 30}px`,
    background: `linear-gradient(180deg, transparent 0%, ${color}22 30%, ${color}aa 85%, #ffffff 100%)`,
    filter: 'blur(3px)',
    transform: 'translateX(-50%) scaleX(0)',
    transformOrigin: 'bottom center',
    mixBlendMode: 'screen',
  });
  if (!el) return;
  retire(
    el,
    el.animate(
      [
        { transform: 'translateX(-50%) scaleX(0)', opacity: 0 },
        { transform: 'translateX(-50%) scaleX(1.3)', opacity: 1, offset: 0.15 },
        { transform: 'translateX(-50%) scaleX(0.8)', opacity: 0.9, offset: 0.7 },
        { transform: 'translateX(-50%) scaleX(0)', opacity: 0 },
      ],
      { duration, easing: 'ease-out' },
    ),
  );
}

/** Burst of small shards flying out from a point (monster death). */
export function shards(layer: HTMLElement, at: Point, color: string, count = 12): void {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = 60 + Math.random() * 70;
    const size = 4 + Math.random() * 6;
    const el = spawn(layer, '', {
      position: 'absolute',
      left: `${at.x}px`,
      top: `${at.y}px`,
      width: `${size}px`,
      height: `${size}px`,
      background: i % 3 === 0 ? '#ffffff' : color,
      borderRadius: i % 2 ? '50%' : '2px',
      boxShadow: `0 0 8px ${color}`,
    });
    if (!el) return;
    retire(
      el,
      el.animate(
        [
          { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
          {
            transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist + 30}px)) scale(0.2) rotate(${
              Math.random() * 360
            }deg)`,
            opacity: 0,
          },
        ],
        { duration: 600 + Math.random() * 300, easing: 'cubic-bezier(0.1, 0.8, 0.4, 1)' },
      ),
    );
  }
}

export function shake(el: HTMLElement | null, intensity = 6, duration = 260): void {
  if (!el) return;
  const i = intensity;
  el.animate(
    [
      { transform: 'translate(0,0)' },
      { transform: `translate(${-i}px, ${i * 0.5}px)` },
      { transform: `translate(${i}px, ${-i * 0.4}px)` },
      { transform: `translate(${-i * 0.6}px, ${-i * 0.3}px)` },
      { transform: `translate(${i * 0.4}px, ${i * 0.3}px)` },
      { transform: 'translate(0,0)' },
    ],
    { duration, easing: 'ease-out' },
  );
}

export function flash(
  el: HTMLElement | null,
  filter = 'brightness(2.6) saturate(0.2)',
  duration = 150,
): void {
  el?.animate([{ filter }, { filter: 'none' }], { duration, easing: 'ease-out' });
}

export function knock(el: HTMLElement | null, dx: number, dy = 0): void {
  el?.animate(
    [
      { transform: 'translate(0,0) scale(1)' },
      { transform: `translate(${dx}px, ${dy}px) scale(0.96)` },
      { transform: 'translate(0,0) scale(1)' },
    ],
    { duration: 140, easing: 'ease-out' },
  );
}

/** Monster lunges at the viewer. */
export function lunge(el: HTMLElement | null): void {
  el?.animate(
    [
      { transform: 'translateY(0) scale(1)' },
      { transform: 'translateY(-10px) scale(0.95)', offset: 0.3 },
      { transform: 'translateY(22px) scale(1.18)', offset: 0.55 },
      { transform: 'translateY(0) scale(1)' },
    ],
    { duration: 260, easing: 'ease-in-out' },
  );
}

/** Red (or other) edge vignette pulse on the whole stage. */
export function vignette(el: HTMLElement | null, color: string, strength = 0.6): void {
  el?.animate(
    [
      { boxShadow: `inset 0 0 0 0 ${color}00` },
      {
        boxShadow: `inset 0 0 90px 10px ${color}${Math.round(strength * 255)
          .toString(16)
          .padStart(2, '0')}`,
        offset: 0.2,
      },
      { boxShadow: `inset 0 0 0 0 ${color}00` },
    ],
    { duration: 420, easing: 'ease-out' },
  );
}

export function monsterEnter(el: HTMLElement | null, boss: boolean): void {
  el?.animate(
    [
      {
        transform: `translateY(${boss ? -80 : -40}px) scale(${boss ? 0.3 : 0.6})`,
        opacity: 0,
        filter: 'brightness(0)',
      },
      {
        transform: 'translateY(6px) scale(1.06)',
        opacity: 1,
        filter: 'brightness(1.4)',
        offset: 0.7,
      },
      { transform: 'translateY(0) scale(1)', opacity: 1, filter: 'brightness(1)' },
    ],
    { duration: boss ? 700 : 450, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)', fill: 'backwards' },
  );
}

export function monsterDeath(el: HTMLElement | null): Animation | undefined {
  return el?.animate(
    [
      { transform: 'scale(1) rotate(0)', opacity: 1, filter: 'brightness(1)' },
      {
        transform: 'scale(1.2) rotate(-6deg)',
        opacity: 1,
        filter: 'brightness(3) saturate(0)',
        offset: 0.25,
      },
      { transform: 'scale(0.1) rotate(30deg)', opacity: 0, filter: 'brightness(4) saturate(0)' },
    ],
    { duration: 480, easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)', fill: 'forwards' },
  );
}
