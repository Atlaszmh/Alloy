import { useEffect, useRef } from 'react';
import { Application, Container, Graphics, Text } from 'pixi.js';
import type { CombatLog, CombatEvent, DerivedStats, Element } from '@alloy/engine';
import { CooldownRing } from '@/features/duel/pixi/CooldownRing.js';
import { DamageNumbers } from '@/features/duel/pixi/DamageNumbers.js';

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
  currentTime: number;
  isPlaying: boolean;
  onTimeUpdate?: (time: number) => void;
}

export function DuelRenderer({ combatLog, stats, currentTime, isPlaying, onTimeUpdate }: DuelRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const stateRef = useRef({
    gladiators: null as [Container, Container] | null,
    hpBars: null as [Graphics, Graphics] | null,
    hpTexts: null as [Text, Text] | null,
    damageNumbers: null as DamageNumbers | null,
    particles: [] as Particle[],
    particleContainer: null as Container | null,
    hp: [0, 0] as [number, number],
    maxHp: [0, 0] as [number, number],
    tick: 0,
    lastProcessedTime: -1,
    cooldownRings: null as [CooldownRing, CooldownRing] | null,
    attackSpeeds: [1.0, 1.0] as [number, number],
    lastAttackTime: [0, 0] as [number, number],
    currentTime: 0,
  });

  // Initialize PixiJS
  useEffect(() => {
    if (!containerRef.current) return;

    const app = new Application();
    let destroyed = false;
    let ro: ResizeObserver | null = null;

    app.init({
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      background: 0x0a0a0f,
      antialias: true,
    }).then(() => {
      if (destroyed) { app.destroy(); return; }

      containerRef.current!.appendChild(app.canvas);
      appRef.current = app;

      // ResizeObserver scales the Pixi stage to fill the container
      ro = new ResizeObserver(([entry]) => {
        const { width } = entry.contentRect;
        if (width === 0) return; // container not visible yet
        const height = width / (15 / 8);
        app.renderer.resize(width, height);
        app.stage.scale.set(width / STAGE_WIDTH);
      });
      ro.observe(containerRef.current!);

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

      // Cooldown rings
      state.attackSpeeds = [stats[0].attackSpeed, stats[1].attackSpeed];
      const atkSec0 = stats[0].attackSpeed;
      const atkSec1 = stats[1].attackSpeed;
      const ring0 = new CooldownRing(40, 0x3b82f6, 'weapon', atkSec0);
      ring0.container.y = -25;
      g0.addChild(ring0.container);
      const ring1 = new CooldownRing(40, 0xef4444, 'weapon', atkSec1);
      ring1.container.y = -25;
      g1.addChild(ring1.container);
      state.cooldownRings = [ring0, ring1];

      // HP bars (in-canvas)
      const hpBar0 = new Graphics();
      const hpBar1 = new Graphics();
      app.stage.addChild(hpBar0);
      app.stage.addChild(hpBar1);
      state.hpBars = [hpBar0, hpBar1];

      // HP text (in-canvas)
      const hpText0 = new Text({ text: '', style: { fontFamily: 'monospace', fontSize: 12, fill: '#ffffff' } });
      hpText0.x = P0_X - 60;
      hpText0.y = 25;
      const hpText1 = new Text({ text: '', style: { fontFamily: 'monospace', fontSize: 12, fill: '#ffffff' } });
      hpText1.x = P1_X - 60;
      hpText1.y = 25;
      app.stage.addChild(hpText0);
      app.stage.addChild(hpText1);
      state.hpTexts = [hpText0, hpText1];

      // Particle container
      state.particleContainer = new Container();
      app.stage.addChild(state.particleContainer);

      // DamageNumbers (manages its own container on the stage)
      state.damageNumbers = new DamageNumbers(app.stage);

      drawHPBars(state);

      // Render loop
      app.ticker.add((time) => {
        // Update damage number animations
        state.damageNumbers?.update(time.deltaTime);

        updateParticles(state, time.deltaTime);

        // Update cooldown ring progress and animation
        if (state.cooldownRings) {
          for (const i of [0, 1] as const) {
            const elapsed = state.currentTime - state.lastAttackTime[i];
            const progress = Math.min(1, elapsed / state.attackSpeeds[i]);
            state.cooldownRings[i].setProgress(progress);
            state.cooldownRings[i].update(time.deltaTime);
          }
        }
      });
    });

    return () => {
      destroyed = true;
      ro?.disconnect();
      if (stateRef.current.damageNumbers) {
        stateRef.current.damageNumbers.destroy();
        stateRef.current.damageNumbers = null;
      }
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
    if (currentTime < state.lastProcessedTime) {
      state.hp = [...state.maxHp];
      state.lastProcessedTime = -1;
      state.lastAttackTime = [0, 0];
      state.currentTime = 0;
      // Clear damage numbers and particles
      state.damageNumbers?.clear();
      for (const p of state.particles) p.gfx.destroy();
      state.particles = [];
    }

    // Process all frames from last processed to current
    for (const frame of combatLog.frames) {
      if (frame.time <= state.lastProcessedTime) continue;
      if (frame.time > currentTime) break;

      state.currentTime = frame.time;
      for (const event of frame.events) {
        processEvent(state, event);
      }
    }

    state.currentTime = currentTime;
    state.lastProcessedTime = currentTime;
    drawHPBars(state);
  }, [currentTime, combatLog]);

  return (
    <div
      ref={containerRef}
      className="mx-auto overflow-hidden rounded-lg border border-surface-600"
      style={{ width: '100%', aspectRatio: '15 / 8' }}
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
  damageNumbers: DamageNumbers | null;
  particles: Particle[];
  particleContainer: Container | null;
  hp: [number, number];
  maxHp: [number, number];
  tick: number;
  lastProcessedTime: number;
  cooldownRings: [CooldownRing, CooldownRing] | null;
  attackSpeeds: [number, number];
  lastAttackTime: [number, number];
  currentTime: number;
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

function processEvent(state: StateType, event: CombatEvent) {
  const playerX = (p: 0 | 1) => p === 0 ? P0_X : P1_X;

  switch (event.type) {
    case 'attack': {
      const target: 0 | 1 = event.attacker === 0 ? 1 : 0;
      const targetX = playerX(target);
      const targetY = GLADIATOR_Y - 70;

      // Track attack timing for cooldown ring + trigger pulse
      state.lastAttackTime[event.attacker] = state.currentTime;
      if (state.cooldownRings) {
        state.cooldownRings[event.attacker].triggerPulse();
        state.cooldownRings[event.attacker].setProgress(0);
      }

      // Animate attack: jolt attacker forward
      const g = state.gladiators?.[event.attacker];
      if (g) {
        const origX = g.x;
        const dir = event.attacker === 0 ? 1 : -1;
        g.x += dir * 15;
        setTimeout(() => { if (g) g.x = origX; }, 100);
      }

      // Dodged?
      if (event.breakdown.dodged) {
        state.damageNumbers?.spawnDodge(targetX, targetY);
        break;
      }

      // Damage numbers from breakdown (multi-element cascade)
      if (event.breakdown.totalNet > 0) {
        state.damageNumbers?.spawnFromBreakdown(event.breakdown, targetX, targetY);
      }

      // Block text if any damage was blocked
      if (event.breakdown.blocked > 0) {
        state.damageNumbers?.spawnBlock(event.breakdown.blocked, targetX, targetY - 20);
      }

      // VFX particles for each element with non-zero damage
      if (event.breakdown.physical.net > 0) {
        spawnHitParticles(state, targetX, GLADIATOR_Y - 30, ELEMENT_COLORS.physical, event.breakdown.isCrit ? 6 : 3);
      }
      for (const [elem, elemBd] of Object.entries(event.breakdown.elemental) as [Element, { net: number } | undefined][]) {
        if (elemBd && elemBd.net > 0) {
          spawnHitParticles(state, targetX, GLADIATOR_Y - 30, ELEMENT_COLORS[elem] ?? 0xffffff, event.breakdown.isCrit ? 6 : 3);
        }
      }

      // Hit flash on target
      const targetG = state.gladiators?.[target];
      if (targetG) {
        targetG.alpha = 0.5;
        setTimeout(() => { if (targetG) targetG.alpha = 1; }, 80);
      }
      break;
    }

    case 'heal': {
      const isOverheal = event.breakdown.overheal > 0 && event.breakdown.effectiveHeal === 0;
      state.damageNumbers?.spawnHeal(
        event.breakdown.effectiveHeal > 0 ? event.breakdown.effectiveHeal : event.breakdown.overheal,
        playerX(event.player),
        GLADIATOR_Y - 90,
        isOverheal,
      );
      break;
    }

    // Legacy dodge event (deprecated but still emitted)
    case 'dodge': {
      state.damageNumbers?.spawnDodge(playerX(event.dodger), GLADIATOR_Y - 70);
      break;
    }

    // Legacy block event (deprecated but still emitted)
    case 'block': {
      state.damageNumbers?.spawnBlock(event.blockedDamage, playerX(event.blocker), GLADIATOR_Y - 70);
      break;
    }

    case 'dot_tick': {
      const elementColor = ELEMENT_COLORS[event.breakdown.element] ?? 0xff0000;
      state.damageNumbers?.spawn(
        `-${Math.round(event.breakdown.netDamage)}`,
        playerX(event.target),
        GLADIATOR_Y - 80,
        elementColor,
        { isDot: true },
      );
      spawnHitParticles(state, playerX(event.target), GLADIATOR_Y - 30, elementColor, 3);
      break;
    }

    // Legacy lifesteal event (deprecated, prefer heal event)
    case 'lifesteal': {
      state.damageNumbers?.spawnHeal(event.healed, playerX(event.player), GLADIATOR_Y - 90, false);
      break;
    }

    case 'thorns': {
      state.damageNumbers?.spawn(
        `${Math.round(event.damage)} thorns`,
        playerX(event.reflector === 0 ? 1 : 0),
        GLADIATOR_Y - 70,
        0x8b3ae8,
      );
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
      state.damageNumbers?.spawn('DEFEATED', playerX(event.player), GLADIATOR_Y - 90, 0xf87171);
      spawnHitParticles(state, playerX(event.player), GLADIATOR_Y - 20, 0xf87171, 15);
      break;
    }

    case 'stun': {
      state.damageNumbers?.spawn('STUNNED', playerX(event.target), GLADIATOR_Y - 80, 0xe8d03a);
      break;
    }

    case 'barrier_absorb': {
      state.damageNumbers?.spawn(
        `Shield ${Math.round(event.absorbed)}`,
        playerX(event.player),
        GLADIATOR_Y - 70,
        0x60a5fa,
      );
      break;
    }
  }
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
