// Visual effects derived from sim state transitions. Each event is keyed by
// (frame, fighter, event) so re-simulating frames after a rollback never
// triggers it twice.

import { Action } from '../sim/actions';
import { FIGHTERS } from '../sim/fighters';
import { ONE } from '../sim/fixed';
import type { MatchState } from '../sim/state';
import type { Sfx } from '../audio/sfx';

interface Spark {
  x: number;
  y: number;
  size: number;
  ageMs: number;
}

const SPARK_LIFE_MS = 220;
const STRONG_HIT_SPEED = 12 * ONE; // launch speed (|vx| + |vy|) that shakes the screen
const KEY_MEMORY_FRAMES = 600;

export class Effects {
  private sparks: Spark[] = [];
  private seen = new Map<string, number>();
  private shakeMag = 0;
  shakeX = 0;
  shakeY = 0;

  constructor(private sfx: Sfx) {}

  /** Call once per simulated frame with the state before and after it. */
  onStep(prev: MatchState, next: MatchState): void {
    next.fighters.forEach((b, i) => {
      const a = prev.fighters[i];
      if (!a) return;
      if (b.damage > a.damage && b.action === Action.Hitstun) {
        if (!this.once(next.frame, i, 'hit')) return;
        const st = FIGHTERS[b.charId]!.stats;
        const dmg = b.damage - a.damage;
        const speed = Math.abs(b.vx) + Math.abs(b.vy);
        this.sparks.push({ x: b.x / ONE, y: (b.y - st.height / 2) / ONE, size: 14 + dmg * 3, ageMs: 0 });
        if (speed > STRONG_HIT_SPEED) this.shakeMag = Math.max(this.shakeMag, Math.min(18, speed / ONE - 6));
        this.sfx.hit(dmg, speed / ONE);
      }
      if ((b.action === Action.KO || b.action === Action.Out) && a.action !== b.action) {
        if (!this.once(next.frame, i, 'ko')) return;
        this.shakeMag = 22;
        this.sfx.ko();
      }
    });
    for (const [k, frame] of this.seen) if (frame < next.frame - KEY_MEMORY_FRAMES) this.seen.delete(k);
  }

  private once(frame: number, fighter: number, event: string): boolean {
    const key = `${frame}:${fighter}:${event}`;
    if (this.seen.has(key)) return false;
    this.seen.set(key, frame);
    return true;
  }

  update(dtMs: number): void {
    for (const s of this.sparks) s.ageMs += dtMs;
    this.sparks = this.sparks.filter((s) => s.ageMs < SPARK_LIFE_MS);
    this.shakeMag *= Math.pow(0.0005, dtMs / 1000);
    if (this.shakeMag < 0.3) this.shakeMag = 0;
    this.shakeX = (Math.random() * 2 - 1) * this.shakeMag;
    this.shakeY = (Math.random() * 2 - 1) * this.shakeMag;
  }

  /** Draw in world space (camera transform already applied). */
  draw(ctx: CanvasRenderingContext2D): void {
    for (const s of this.sparks) {
      const t = s.ageMs / SPARK_LIFE_MS;
      const r = s.size * (0.4 + t);
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#fff6b0';
      ctx.lineWidth = 4 * (1 - t) + 1;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2 + 0.3;
        ctx.moveTo(s.x + Math.cos(ang) * r * 0.35, s.y + Math.sin(ang) * r * 0.35);
        ctx.lineTo(s.x + Math.cos(ang) * r, s.y + Math.sin(ang) * r);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
}
