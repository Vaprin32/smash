// Visual effects driven by FighterState.event. Each event is keyed by
// (frame, fighter, event) so re-simulating frames after a rollback never
// triggers it twice.

import { SimEvent } from '../sim/events';
import { FIGHTERS } from '../sim/fighters';
import { ONE } from '../sim/fixed';
import type { MatchState } from '../sim/state';
import type { Sfx } from '../audio/sfx';

type SparkKind = 'hit' | 'shield' | 'parry' | 'break';

interface Spark {
  kind: SparkKind;
  x: number;
  y: number;
  size: number;
  ageMs: number;
}

const LIFE_MS: Record<SparkKind, number> = { hit: 220, shield: 180, parry: 380, break: 520 };
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
      if (b.event === SimEvent.None || !this.once(next.frame, i, b.event)) return;
      const st = FIGHTERS[b.charId]!.stats;
      const x = b.x / ONE;
      const y = (b.y - st.height / 2) / ONE;
      const dmg = b.damage - (prev.fighters[i]?.damage ?? b.damage);
      switch (b.event) {
        case SimEvent.Hit: {
          const speed = Math.abs(b.vx) + Math.abs(b.vy);
          this.sparks.push({ kind: 'hit', x, y, size: 14 + dmg * 3, ageMs: 0 });
          if (speed > STRONG_HIT_SPEED) this.shake(Math.min(18, speed / ONE - 6));
          this.sfx.hit(dmg, speed / ONE);
          break;
        }
        case SimEvent.ShieldHit:
          this.sparks.push({ kind: 'shield', x, y, size: 26, ageMs: 0 });
          this.sfx.shield();
          break;
        case SimEvent.Parry:
          this.sparks.push({ kind: 'parry', x, y, size: 40, ageMs: 0 });
          this.shake(4);
          this.sfx.parry();
          break;
        case SimEvent.ShieldBreak:
          this.sparks.push({ kind: 'break', x, y, size: 60, ageMs: 0 });
          this.shake(14);
          this.sfx.shieldBreak();
          break;
        case SimEvent.KO:
          this.shake(22);
          this.sfx.ko();
          break;
      }
    });
    for (const [k, frame] of this.seen) if (frame < next.frame - KEY_MEMORY_FRAMES) this.seen.delete(k);
  }

  private shake(mag: number): void {
    this.shakeMag = Math.max(this.shakeMag, mag);
  }

  private once(frame: number, fighter: number, event: number): boolean {
    const key = `${frame}:${fighter}:${event}`;
    if (this.seen.has(key)) return false;
    this.seen.set(key, frame);
    return true;
  }

  update(dtMs: number): void {
    for (const s of this.sparks) s.ageMs += dtMs;
    this.sparks = this.sparks.filter((s) => s.ageMs < LIFE_MS[s.kind]);
    this.shakeMag *= Math.pow(0.0005, dtMs / 1000);
    if (this.shakeMag < 0.3) this.shakeMag = 0;
    this.shakeX = (Math.random() * 2 - 1) * this.shakeMag;
    this.shakeY = (Math.random() * 2 - 1) * this.shakeMag;
  }

  /** Draw in world space (camera transform already applied). */
  draw(ctx: CanvasRenderingContext2D): void {
    for (const s of this.sparks) {
      const t = s.ageMs / LIFE_MS[s.kind];
      ctx.save();
      ctx.globalAlpha = 1 - t;
      if (s.kind === 'hit' || s.kind === 'shield') {
        const r = s.size * (0.4 + t);
        ctx.strokeStyle = s.kind === 'hit' ? '#fff6b0' : '#9fe8ff';
        ctx.lineWidth = 4 * (1 - t) + 1;
        ctx.beginPath();
        const rays = s.kind === 'hit' ? 8 : 6;
        for (let k = 0; k < rays; k++) {
          const ang = (k / rays) * Math.PI * 2 + 0.3;
          ctx.moveTo(s.x + Math.cos(ang) * r * 0.35, s.y + Math.sin(ang) * r * 0.35);
          ctx.lineTo(s.x + Math.cos(ang) * r, s.y + Math.sin(ang) * r);
        }
        ctx.stroke();
      } else {
        // Expanding ring: white for a parry, shattered pink for a shield break.
        ctx.strokeStyle = s.kind === 'parry' ? '#ffffff' : '#ff8ad8';
        ctx.lineWidth = s.kind === 'parry' ? 5 * (1 - t) + 1 : 8 * (1 - t) + 1;
        if (s.kind === 'break') ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * (0.3 + t * 1.2), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
