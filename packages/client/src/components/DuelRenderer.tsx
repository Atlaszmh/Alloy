import { useEffect, useRef, useCallback } from 'react';
import { Application, Container, Graphics, Text } from 'pixi.js';
import type { CombatLog, TickEvent, DerivedStats, Element } from '@alloy/engine';

const ELEMENT_COLORS: Record<Element | 'physical', number> = {
  fire: 0xe85d3a,
  cold: 0x3a9be8,
  lightning: 0xe8d03a,
  poison: 0x4ae83a,
  shadow: 0x8b3ae8,
  chaos: 0xe83a8b,
  physical: 0xc0c0c0,
};

const STAGE_WIDTH = 600;
const STAGE_HEIGHT = 320;
const GLADIATOR_Y = 200;
const P0_X = 150;
const P1_X = 450;

interface FloatingText {
  text: Text;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

interface Particle {
  gfx: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: number;
}

interface DuelRendererProps {
  combatLog: CombatLog;
  stats: [DerivedStats, DerivedStats];
  currentTick: number;
  isPlaying: boolean;
  onTickUpdate?: (tick: number) => void;
}

export function DuelRenderer({ combatLog, stats, currentTick, isPlaying, onTickUpdate }: DuelRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const stateRef = useRef({
    gladiators: null as [Container, Container] | null,
    hpBars: null as [Graphics, Graphics] | null,
    hpTexts: null as [Text, Text] | null,
    floatingTexts: [] as FloatingText[],
    particles: [] as Particle[],
    particleContainer: null as Container | null,
    floatContainer: null as Container | null,
    hp: [0, 0] as [number, number],
    maxHp: [0, 0] as [number, number],
    tick: 0,
    lastProcessedTick: -1,
  });

  // Initialize PixiJS
  useEffect(() => {
    if (!containerRef.current) return;

    const app = new Application();
    let destroyed = false;

    app.init({
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      background: 0x0a0a0f,
      antialias: true,
    }).then(() => {
      if (destroyed) { app.destroy(); return; }

      containerRef.current!.appendChild(app.canvas);
      appRef.current = app;

      const state = stateRef.current;
      state.maxHp = [stats[0].maxHP, stats[1].maxHP];
      state.hp = [...state.maxHp];

      // Arena floor
      const floor = new Graphics();
      floor.rect(0, GLADIATOR_Y + 40, STAGE_WIDTH, 80);
      floor.fill({ color: 0x1a1a26 });
      app.stage.addChild(floor);

      // Create gladiators
      const g0 = createGladiator(0xc8a84e, 'You');
      g0.x = P0_X;
      g0.y = GLADIATOR_Y;

      const g1 = createGladiator(0xe85d3a, 'AI');
      g1.x = P1_X;
      g1.y = GLADIATOR_Y;

      app.stage.addChild(g0);
      app.stage.addChild(g1);
      state.gladiators = [g0, g1];

      // HP bars
      const hpBar0 = new Graphics();
      const hpBar1 = new Graphics();
      app.stage.addChild(hpBar0);
      app.stage.addChild(hpBar1);
      state.hpBars = [hpBar0, hpBar1];

      // HP text
      const hpText0 = new Text({ text: '', style: { fontFamily: 'monospace', fontSize: 12, fill: '#ffffff' } });
      hpText0.x = P0_X - 60;
      hpText0.y = 25;
      const hpText1 = new Text({ text: '', style: { fontFamily: 'monospace', fontSize: 12, fill: '#ffffff' } });
      hpText1.x = P1_X - 60;
      hpText1.y = 25;
      app.stage.addChild(hpText0);
      app.stage.addChild(hpText1);
      state.hpTexts = [hpText0, hpText1];

      // Containers for particles and floating text
      state.particleContainer = new Container();
      app.stage.addChild(state.particleContainer);
      state.floatContainer = new Container();
      app.stage.addChild(state.floatContainer);

      drawHPBars(state);

      // Render loop
      app.ticker.add((time) => {
        updateFloatingTexts(state, time.deltaTime);
        updateParticles(state, time.deltaTime);
      });
    });

    return () => {
      destroyed = true;
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
      }
    };
  }, [combatLog, stats]);

  // Process events for current tick
  useEffect(() => {
    const state = stateRef.current;
    if (!appRef.current || !state.gladiators) return;

    // Reset if we went backwards
    if (currentTick < state.lastProcessedTick) {
      state.hp = [...state.maxHp];
      state.lastProcessedTick = -1;
      // Clear floating texts and particles
      for (const ft of state.floatingTexts) ft.text.destroy();
      state.floatingTexts = [];
      for (const p of state.particles) p.gfx.destroy();
      state.particles = [];
    }

    // Process all ticks from last processed to current
    for (const tickData of combatLog.ticks) {
      if (tickData.tick <= state.lastProcessedTick) continue;
      if (tickData.tick > currentTick) break;

      for (const event of tickData.events) {
        processEvent(state, event, appRef.current);
      }
    }

    state.lastProcessedTick = currentTick;
    drawHPBars(state);
  }, [currentTick, combatLog]);

  return (
    <div
      ref={containerRef}
      className="mx-auto overflow-hidden rounded-lg border border-surface-600"
      style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT }}
    />
  );
}

function createGladiator(color: number, label: string): Container {
  const container = new Container();

  // Body
  const body = new Graphics();
  body.roundRect(-20, -50, 40, 50, 5);
  body.fill({ color });
  container.addChild(body);

  // Head
  const head = new Graphics();
  head.circle(0, -62, 12);
  head.fill({ color });
  container.addChild(head);

  // Weapon arm
  const arm = new Graphics();
  arm.rect(20, -45, 25, 4);
  arm.fill({ color: 0x8a8a8a });
  container.addChild(arm);

  // Shield arm
  const shield = new Graphics();
  shield.roundRect(-35, -45, 15, 25, 3);
  shield.fill({ color: 0x3a3a4e });
  container.addChild(shield);

  // Label
  const nameText = new Text({ text: label, style: { fontFamily: 'sans-serif', fontSize: 11, fill: '#ffffff' } });
  nameText.anchor = { x: 0.5, y: 0 } as any;
  nameText.x = 0;
  nameText.y = 8;
  container.addChild(nameText);

  return container;
}

// Shared renderer state type
type StateType = {
  gladiators: [Container, Container] | null;
  hpBars: [Graphics, Graphics] | null;
  hpTexts: [Text, Text] | null;
  floatingTexts: FloatingText[];
  particles: Particle[];
  particleContainer: Container | null;
  floatContainer: Container | null;
  hp: [number, number];
  maxHp: [number, number];
  tick: number;
  lastProcessedTick: number;
};

function drawHPBars(state: StateType) {
  if (!state.hpBars || !state.hpTexts) return;

  for (const i of [0, 1] as const) {
    const bar = state.hpBars[i];
    const pct = Math.max(0, state.hp[i] / state.maxHp[i]);
    const x = i === 0 ? P0_X - 60 : P1_X - 60;
    const barWidth = 120;

    bar.clear();

    // Background
    bar.rect(x, 40, barWidth, 10);
    bar.fill({ color: 0x242432 });

    // Fill
    const fillColor = pct < 0.3 ? 0xf87171 : pct < 0.6 ? 0xfbbf24 : 0x34d399;
    bar.rect(x, 40, barWidth * pct, 10);
    bar.fill({ color: fillColor });

    // Border
    bar.rect(x, 40, barWidth, 10);
    bar.stroke({ color: 0x3a3a4e, width: 1 });

    // Text
    state.hpTexts[i].text = `${Math.round(Math.max(0, state.hp[i]))} / ${Math.round(state.maxHp[i])}`;
  }
}

function processEvent(state: StateType, event: TickEvent, app: Application) {
  const playerX = (p: 0 | 1) => p === 0 ? P0_X : P1_X;

  switch (event.type) {
    case 'attack': {
      // Animate attack: jolt attacker forward
      const g = state.gladiators?.[event.attacker];
      if (g) {
        const origX = g.x;
        const dir = event.attacker === 0 ? 1 : -1;
        g.x += dir * 15;
        setTimeout(() => { if (g) g.x = origX; }, 100);
      }

      // Damage number
      const color = event.isCrit ? 0xfbbf24 : event.damageType === 'physical' ? 0xffffff : ELEMENT_COLORS[event.damageType];
      const target: 0 | 1 = event.attacker === 0 ? 1 : 0;
      spawnFloatingText(state, `${event.isCrit ? 'CRIT ' : ''}${Math.round(event.damage)}`, playerX(target), GLADIATOR_Y - 70, color);

      // Hit particles
      spawnHitParticles(state, playerX(target), GLADIATOR_Y - 30, ELEMENT_COLORS[event.damageType] ?? 0xffffff, event.isCrit ? 8 : 4);

      // Hit flash
      const targetG = state.gladiators?.[target];
      if (targetG) {
        targetG.alpha = 0.5;
        setTimeout(() => { if (targetG) targetG.alpha = 1; }, 80);
      }
      break;
    }

    case 'dodge': {
      spawnFloatingText(state, 'DODGE', playerX(event.dodger), GLADIATOR_Y - 70, 0x60a5fa);
      break;
    }

    case 'block': {
      spawnFloatingText(state, `BLOCK ${Math.round(event.blockedDamage)}`, playerX(event.blocker), GLADIATOR_Y - 70, 0x8a8a8a);
      break;
    }

    case 'dot_tick': {
      const elementColor = ELEMENT_COLORS[event.element] ?? 0xff0000;
      spawnFloatingText(state, `${Math.round(event.damage)}`, playerX(event.target), GLADIATOR_Y - 80, elementColor);
      spawnHitParticles(state, playerX(event.target), GLADIATOR_Y - 30, elementColor, 3);
      break;
    }

    case 'lifesteal': {
      spawnFloatingText(state, `+${Math.round(event.healed)}`, playerX(event.player), GLADIATOR_Y - 90, 0x34d399);
      break;
    }

    case 'thorns': {
      spawnFloatingText(state, `${Math.round(event.damage)} thorns`, playerX(event.reflector === 0 ? 1 : 0), GLADIATOR_Y - 70, 0x8b3ae8);
      break;
    }

    case 'hp_change': {
      state.hp[event.player] = event.newHP;
      break;
    }

    case 'death': {
      const deadG = state.gladiators?.[event.player];
      if (deadG) {
        deadG.alpha = 0.3;
        deadG.y = GLADIATOR_Y + 10;
      }
      spawnFloatingText(state, 'DEFEATED', playerX(event.player), GLADIATOR_Y - 90, 0xf87171);
      spawnHitParticles(state, playerX(event.player), GLADIATOR_Y - 20, 0xf87171, 15);
      break;
    }

    case 'stun': {
      spawnFloatingText(state, 'STUNNED', playerX(event.target), GLADIATOR_Y - 80, 0xe8d03a);
      break;
    }

    case 'barrier_absorb': {
      spawnFloatingText(state, `Shield ${Math.round(event.absorbed)}`, playerX(event.player), GLADIATOR_Y - 70, 0x60a5fa);
      break;
    }
  }
}

function spawnFloatingText(state: StateType, text: string, x: number, y: number, color: number) {
  if (!state.floatContainer) return;

  const t = new Text({
    text,
    style: {
      fontFamily: 'monospace',
      fontSize: text.includes('CRIT') ? 16 : 13,
      fill: color,
      fontWeight: text.includes('CRIT') || text.includes('DEFEATED') ? 'bold' : 'normal',
    },
  });
  t.anchor = { x: 0.5, y: 0.5 } as any;
  t.x = x + (Math.random() - 0.5) * 30;
  t.y = y;
  state.floatContainer.addChild(t);

  state.floatingTexts.push({
    text: t,
    vx: (Math.random() - 0.5) * 0.5,
    vy: -1.5,
    life: 60,
    maxLife: 60,
  });
}

function spawnHitParticles(state: StateType, x: number, y: number, color: number, count: number) {
  if (!state.particleContainer) return;

  for (let i = 0; i < count; i++) {
    const gfx = new Graphics();
    const size = 2 + Math.random() * 3;
    gfx.circle(0, 0, size);
    gfx.fill({ color });
    gfx.x = x;
    gfx.y = y;
    state.particleContainer.addChild(gfx);

    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    state.particles.push({
      gfx,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      life: 30 + Math.random() * 20,
      maxLife: 50,
      color,
    });
  }
}

function updateFloatingTexts(state: StateType, dt: number) {
  for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
    const ft = state.floatingTexts[i];
    ft.text.x += ft.vx * dt;
    ft.text.y += ft.vy * dt;
    ft.life -= dt;
    ft.text.alpha = Math.max(0, ft.life / ft.maxLife);

    if (ft.life <= 0) {
      ft.text.destroy();
      state.floatingTexts.splice(i, 1);
    }
  }
}

function updateParticles(state: StateType, dt: number) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 0.1 * dt; // gravity
    p.gfx.x = p.x;
    p.gfx.y = p.y;
    p.life -= dt;
    p.gfx.alpha = Math.max(0, p.life / p.maxLife);

    if (p.life <= 0) {
      p.gfx.destroy();
      state.particles.splice(i, 1);
    }
  }
}
