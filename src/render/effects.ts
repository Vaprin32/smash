// Visual effects derived from sim state: hit sparks, shockwaves, debris,
// KO blasts, launch smoke, and dust from landings, jumps and dashes. Each
// effect is keyed by (frame, fighter, kind), so re-simulating frames after a
// rollback never spawns it twice. Render-only: floats and Math.random are fine.

import { Action } from '../sim/actions';
import { SimEvent } from '../sim/events';
import { FIGHTERS } from '../sim/fighters';
import { ONE } from '../sim/fixed';
import type { FighterState, MatchState } from '../sim/state';
import type { Sfx } from '../audio/sfx';
import { gfx, settings } from './quality';
import { fighterColor } from './renderer';

type ParticleKind = 'spark' | 'debris' | 'smoke' | 'dust' | 'star' | 'shard';

interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  /** World px per ms. */
  vx: number;
  vy: number;
  /** World px per ms². */
  gravity: number;
  /** Fraction of speed kept per ms. */
  drag: number;
  size: number;
  /** Size gained per ms (smoke billows). */
  grow: number;
  color: string;
  age: number;
  life: number;
  angle: number;
  spin: number;
}

interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  width: number;
  color: string;
  age: number;
  life: number;
  dashed?: boolean;
}

/** A bright impact core with streaks. */
interface Burst {
  x: number;
  y: number;
  size: number;
  rays: number;
  turn: number;
  color: string;
  age: number;
  life: number;
}

/** Smash-style KO streak, from where the fighter left toward the middle of the stage. */
interface Beam {
  x: number;
  y: number;
  angle: number;
  color: string;
  age: number;
  life: number;
}

const STRONG_HIT_SPEED = 12 * ONE; // launch speed (|vx| + |vy|) that shakes the screen
/** Launched faster than this: a smoke trail follows. */
const TRAIL_SPEED = 9 * ONE;
const KEY_MEMORY_FRAMES = 600;
const MAX_PARTICLES = 700;
const TAU = Math.PI * 2;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Effects {
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private bursts: Burst[] = [];
  private beams: Beam[] = [];
  private seen = new Map<string, number>();
  private shakeMag = 0;
  shakeX = 0;
  shakeY = 0;
  /** Camera zoom punch (0..~0.1), decaying. */
  punch = 0;
  /** Screen flash strength (0..1) and color, decaying. */
  flash = 0;
  private flashColor = '255,255,255';

  constructor(private sfx: Sfx) {}

  /** Call once per simulated frame with the state before and after it. */
  onStep(prev: MatchState, next: MatchState): void {
    const chars = next.fighters.map((f) => f.charId);
    next.fighters.forEach((b, i) => {
      const a = prev.fighters[i];
      if (!a) return;
      const st = FIGHTERS[b.charId]!.stats;
      const x = b.x / ONE;
      const mid = (b.y - st.height / 2) / ONE;
      const feet = b.y / ONE;
      const w = st.width / ONE;

      if (b.event !== SimEvent.None && this.once(next.frame, i, `e${b.event}`)) {
        const dmg = b.damage - a.damage;
        const byColor = b.lastHitBy >= 0 ? fighterColor(chars, b.lastHitBy) : '#ffffff';
        switch (b.event) {
          case SimEvent.Hit: {
            const speed = Math.abs(b.vx) + Math.abs(b.vy);
            this.hit(x, mid, dmg, speed / ONE, byColor);
            if (speed > STRONG_HIT_SPEED) this.shake(Math.min(18, speed / ONE - 6));
            this.sfx.hit(dmg, speed / ONE);
            break;
          }
          case SimEvent.ShieldHit:
            this.ring(x, mid, 10, 46, 4, '#9fe8ff', 200);
            this.spray(x, mid, 6, 'spark', '#cff6ff', 0.25, 160);
            this.sfx.shield();
            break;
          case SimEvent.Parry:
            this.ring(x, mid, 12, 70, 6, '#ffffff', 380);
            this.spray(x, mid, 10, 'star', '#fff7c8', 0.22, 420);
            this.flashScreen(0.18, '255,255,255');
            this.shake(4);
            this.sfx.parry();
            break;
          case SimEvent.ShieldBreak:
            this.ring(x, mid, 20, 110, 8, '#ff8ad8', 520, true);
            this.spray(x, mid, 24, 'shard', '#ffb8ea', 0.35, 700);
            this.flashScreen(0.25, '255,160,220');
            this.shake(14);
            this.sfx.shieldBreak();
            break;
          case SimEvent.Counter:
            this.ring(x, mid, 14, 80, 6, '#ffffff', 420);
            this.burst(x, mid, 40, '#ffffff', 220);
            this.shake(6);
            this.sfx.counter();
            break;
          case SimEvent.Grab:
            this.ring(x, mid, 6, 26, 3, '#ffffff', 160);
            this.sfx.grab();
            break;
          case SimEvent.KO:
            this.ko(a, fighterColor(chars, i));
            this.shake(22);
            this.sfx.ko();
            break;
        }
      }
      this.motion(a, b, i, next.frame, x, feet, mid, w);
    });
    for (const [k, frame] of this.seen) if (frame < next.frame - KEY_MEMORY_FRAMES) this.seen.delete(k);
  }

  /** Dust and smoke from how fighters move (landings, jumps, dashes, launches, ledge grabs). */
  private motion(a: FighterState, b: FighterState, i: number, frame: number, x: number, feet: number, mid: number, w: number): void {
    if (b.action === Action.KO || b.action === Action.Out) return;
    const key = (k: string) => this.once(frame, i, k);
    // Landing: dust out to both sides, more after a long fall.
    if (a.ground < 0 && b.ground >= 0 && key('land')) {
      const hard = Math.min(1, Math.max(0.3, a.vy / ONE / 9));
      this.dust(x, feet, Math.round(8 * hard), w * 0.5, hard);
    }
    // Leaving the ground with a jump.
    if (a.action === Action.JumpSquat && b.action === Action.Air && key('jump')) this.dust(x, feet, 5, w * 0.3, 0.5);
    // Air jump: a little ring of air under the feet.
    if (b.ground < 0 && b.jumpsLeft < a.jumpsLeft && key('djump')) this.ring(x, feet + 4, 6, 26, 3, 'rgba(255,255,255,0.8)', 260);
    // Dash and run turnaround: a kick of dust behind.
    if ((b.action === Action.Dash && a.action !== Action.Dash) || (b.action === Action.Run && a.action === Action.Run && a.facing !== b.facing)) {
      if (key('dash')) this.kick(x - b.facing * w * 0.4, feet, -b.facing);
    }
    // Ledge grab: a glint at the hands.
    if (b.action === Action.LedgeHang && a.action !== Action.LedgeHang && key('ledge')) {
      this.spray(x + b.facing * w * 0.4, feet - (FIGHTERS[b.charId]!.stats.height / ONE) * 1.1, 5, 'star', '#fff3c4', 0.12, 300);
    }
    // Launched hard: a smoke trail behind.
    if (b.action === Action.Hitstun && b.hitlag === 0 && Math.abs(b.vx) + Math.abs(b.vy) > TRAIL_SPEED && key('trail')) {
      this.add({ kind: 'smoke', x: x + rand(-4, 4), y: mid + rand(-4, 4), vx: 0, vy: -0.01, gravity: 0, drag: 0.998, size: rand(7, 11), grow: 0.035, color: '#d8d2cc', life: rand(450, 650) });
    }
  }

  private hit(x: number, y: number, dmg: number, speed: number, color: string): void {
    const k = Math.min(1, (dmg + speed) / 30);
    this.burst(x, y, 20 + dmg * 2.6, color, 170 + k * 90);
    this.ring(x, y, 8, 30 + dmg * 3.5, 3 + k * 4, '#ffffff', 220 + k * 120);
    this.spray(x, y, 5 + dmg, 'spark', '#fff2b0', 0.3 + k * 0.25, 260);
    if (dmg >= 9) this.spray(x, y, Math.round(dmg / 2), 'debris', color, 0.25 + k * 0.2, 600);
    if (speed > 12) {
      this.punch = Math.max(this.punch, 0.035 + k * 0.05);
      this.flashScreen(0.12 + k * 0.12, '255,250,230');
    }
  }

  private ko(a: FighterState, color: string): void {
    // Where it left, and which way back to the middle of the stage.
    const x = a.x / ONE, y = a.y / ONE;
    const angle = Math.atan2(-120 - y, -x);
    this.beams.push({ x, y, angle, color, age: 0, life: 900 });
    this.flashScreen(0.35, '255,255,255');
    this.punch = Math.max(this.punch, 0.06);
  }

  private burst(x: number, y: number, size: number, color: string, life: number): void {
    this.bursts.push({ x, y, size, rays: 9, turn: Math.random() * TAU, color, age: 0, life });
  }

  private ring(x: number, y: number, r0: number, r1: number, width: number, color: string, life: number, dashed = false): void {
    this.rings.push({ x, y, r0, r1, width, color, age: 0, life, dashed });
  }

  /** `n` particles flying out from (x, y) at up to `speed` px/ms. */
  private spray(x: number, y: number, n: number, kind: ParticleKind, color: string, speed: number, life: number): void {
    const count = Math.max(1, Math.round(n * gfx.particles));
    for (let k = 0; k < count; k++) {
      const ang = Math.random() * TAU;
      const v = speed * rand(0.35, 1);
      const heavy = kind === 'debris' || kind === 'shard';
      this.add({
        kind,
        x,
        y,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v - (heavy ? 0.15 : 0),
        gravity: heavy ? 0.0012 : kind === 'star' ? 0.0002 : 0,
        drag: kind === 'spark' ? 0.992 : 0.996,
        size: kind === 'spark' ? rand(2, 3.5) : kind === 'star' ? rand(3, 5) : rand(2.5, 5),
        grow: 0,
        color,
        life: life * rand(0.6, 1),
      });
    }
  }

  /** Dust puffs rolling out sideways along the ground. */
  private dust(x: number, y: number, n: number, spread: number, strength: number): void {
    const count = Math.max(1, Math.round(n * gfx.particles));
    for (let k = 0; k < count; k++) {
      const side = k % 2 === 0 ? 1 : -1;
      this.add({
        kind: 'dust',
        x: x + side * rand(0, spread),
        y: y - rand(1, 4),
        vx: side * rand(0.04, 0.16) * strength,
        vy: -rand(0.005, 0.03),
        gravity: 0,
        drag: 0.995,
        size: rand(4, 7) * (0.6 + strength * 0.5),
        grow: 0.012,
        color: '#c9b9a0',
        life: rand(300, 500),
      });
    }
  }

  /** A kick of dust behind a dashing / turning fighter. */
  private kick(x: number, y: number, dir: number): void {
    const count = Math.max(1, Math.round(4 * gfx.particles));
    for (let k = 0; k < count; k++) {
      this.add({ kind: 'dust', x, y: y - 2, vx: dir * rand(0.05, 0.14), vy: -rand(0.02, 0.06), gravity: 0.0002, drag: 0.994, size: rand(3, 6), grow: 0.01, color: '#c9b9a0', life: rand(260, 420) });
    }
  }

  private add(p: Omit<Particle, 'age' | 'angle' | 'spin'>): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({ ...p, age: 0, angle: Math.random() * TAU, spin: rand(-0.02, 0.02) });
  }

  private flashScreen(strength: number, rgb: string): void {
    if (strength > this.flash) {
      this.flash = strength;
      this.flashColor = rgb;
    }
  }

  private shake(mag: number): void {
    if (settings.screenShake) this.shakeMag = Math.max(this.shakeMag, mag);
  }

  private once(frame: number, fighter: number, kind: string): boolean {
    const key = `${frame}:${fighter}:${kind}`;
    if (this.seen.has(key)) return false;
    this.seen.set(key, frame);
    return true;
  }

  update(dtMs: number): void {
    const dt = Math.min(dtMs, 50);
    for (const p of this.particles) {
      p.age += dt;
      const keep = Math.pow(p.drag, dt);
      p.vx *= keep;
      p.vy = p.vy * keep + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
      p.angle += p.spin * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < r.life);
    for (const b of this.bursts) b.age += dt;
    this.bursts = this.bursts.filter((b) => b.age < b.life);
    for (const b of this.beams) b.age += dt;
    this.beams = this.beams.filter((b) => b.age < b.life);

    this.shakeMag *= Math.pow(0.0005, dt / 1000);
    if (this.shakeMag < 0.3) this.shakeMag = 0;
    this.shakeX = (Math.random() * 2 - 1) * this.shakeMag;
    this.shakeY = (Math.random() * 2 - 1) * this.shakeMag;
    this.punch *= Math.pow(0.002, dt / 1000);
    if (this.punch < 0.001) this.punch = 0;
    this.flash *= Math.pow(0.0004, dt / 1000);
    if (this.flash < 0.01) this.flash = 0;
  }

  /** Draw in world space (camera transform already applied). */
  draw(ctx: CanvasRenderingContext2D): void {
    for (const b of this.beams) this.drawBeam(ctx, b);
    for (const p of this.particles) this.drawParticle(ctx, p);
    for (const r of this.rings) {
      const t = r.age / r.life;
      ctx.save();
      ctx.globalAlpha = (1 - t) * (1 - t);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - t) + 0.5;
      if (r.dashed) ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - (1 - t) * (1 - t)), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    for (const b of this.bursts) this.drawBurst(ctx, b);
  }

  /** Screen-space overlays (flash). Call after the world, before the HUD. */
  drawScreen(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.flash <= 0) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(${this.flashColor},${(this.flash * 0.8).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
  }

  private drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
    const t = p.age / p.life;
    ctx.globalAlpha = p.kind === 'smoke' || p.kind === 'dust' ? (1 - t) * 0.55 : 1 - t * t;
    ctx.fillStyle = p.color;
    switch (p.kind) {
      case 'spark': {
        // A short streak along its motion.
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const len = Math.min(14, sp * 40) + p.size;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * (1 - t * 0.6);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len);
        ctx.stroke();
        break;
      }
      case 'star': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        const s = p.size * (1 - t * 0.5);
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const r = k % 2 === 0 ? s : s * 0.35;
          const a = (k / 8) * TAU;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'debris':
      case 'shard':
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, (p.size * 2) / 3);
        ctx.restore();
        break;
      default:
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawBurst(ctx: CanvasRenderingContext2D, b: Burst): void {
    const t = b.age / b.life;
    const ease = 1 - (1 - t) * (1 - t);
    ctx.save();
    ctx.globalCompositeOperation = gfx.lights ? 'lighter' : 'source-over';
    // Hot core.
    const core = b.size * (0.5 + ease * 0.4);
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, core);
    g.addColorStop(0, `rgba(255,255,255,${(1 - t).toFixed(3)})`);
    g.addColorStop(0.4, `rgba(255,240,180,${(0.7 * (1 - t)).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, core, 0, TAU);
    ctx.fill();
    // Streaks: long thin wedges in the attacker's color, white-hot at the root.
    ctx.globalAlpha = 1 - t;
    for (let k = 0; k < b.rays; k++) {
      const ang = b.turn + (k / b.rays) * TAU + (k % 2) * 0.2;
      const len = b.size * (k % 2 === 0 ? 1.6 : 1.05) * (0.6 + ease * 0.7);
      const inner = b.size * 0.25 * ease;
      const wdt = b.size * 0.09 * (1 - t);
      const cx = Math.cos(ang), cy = Math.sin(ang);
      ctx.fillStyle = k % 2 === 0 ? '#ffffff' : b.color;
      ctx.beginPath();
      ctx.moveTo(b.x + cx * inner - cy * wdt, b.y + cy * inner + cx * wdt);
      ctx.lineTo(b.x + cx * len, b.y + cy * len);
      ctx.lineTo(b.x + cx * inner + cy * wdt, b.y + cy * inner - cx * wdt);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBeam(ctx: CanvasRenderingContext2D, b: Beam): void {
    const t = b.age / b.life;
    const grow = Math.min(1, b.age / 120);
    const len = 2400 * grow;
    const width = 90 * (1 - t) * (0.6 + grow * 0.4);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    ctx.globalCompositeOperation = gfx.lights ? 'lighter' : 'source-over';
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, `rgba(255,255,255,${(0.95 * (1 - t)).toFixed(3)})`);
    g.addColorStop(0.15, b.color);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -width * 0.15);
    ctx.lineTo(len, -width);
    ctx.lineTo(len, width);
    ctx.lineTo(0, width * 0.15);
    ctx.closePath();
    ctx.fill();
    // A thin white core along the middle.
    ctx.fillStyle = `rgba(255,255,255,${(0.9 * (1 - t)).toFixed(3)})`;
    ctx.fillRect(0, -width * 0.06, len * 0.8, width * 0.12);
    ctx.restore();
  }
}
