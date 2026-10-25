// Builds a fighter's moveset from a template moveset: every template move is
// rescaled by the fighter's MoveTuning, then the fighter's own hand-written
// moves (its signature specials) replace template slots. Runs once at load;
// every value it produces is an integer.

import { MoveId, type HitboxDef, type MoveDef, type MoveIdValue } from './types';

/** Percentages relative to the template (100 = unchanged). */
export interface MoveTuning {
  /** Frame timings: startup, active frames, total, landing lag. 120 = 20% slower. */
  frames: number;
  /** Hitbox and grab box offsets and radii; follows body height. */
  size: number;
  /** Extra horizontal reach on top of `size` (disjointed weapons). */
  reach: number;
  damage: number;
  knockback: number;
}

const pct = (v: number, p: number) => Math.round((v * p) / 100);

export function deriveMoves(
  template: readonly MoveDef[],
  tuning: MoveTuning,
  own: Partial<Record<MoveIdValue, MoveDef>>,
): readonly MoveDef[] {
  return Object.values(MoveId).map((id) => own[id] ?? scaleMove(template[id]!, tuning));
}

function scaleMove(m: MoveDef, t: MoveTuning): MoveDef {
  const fr = (frame: number) => Math.max(1, pct(frame, t.frames));
  const span = (a: number, b: number): [number, number] => [fr(a), Math.max(fr(a), fr(b))];
  const reachX = (t.size * t.reach) / 100;
  const strength = (h: HitboxDef): HitboxDef => ({
    ...h,
    x: h.fixed ? h.x : pct(h.x, reachX),
    y: h.fixed ? h.y : pct(h.y, t.size),
    r: h.fixed ? h.r : pct(h.r, t.size),
    damage: Math.max(1, pct(h.damage, t.damage)),
    baseKb: pct(h.baseKb, t.knockback),
    kbGrowth: pct(h.kbGrowth, t.knockback),
  });

  const out: MoveDef = {
    ...m,
    total: fr(m.total),
    hitboxes: m.hitboxes.map((h) => {
      const [start, end] = span(h.start, h.end);
      return { ...strength(h), start, end };
    }),
  };
  if (m.landingLag !== undefined) out.landingLag = fr(m.landingLag);
  if (m.impulses) out.impulses = m.impulses.map((i) => ({ ...i, frame: fr(i.frame) }));
  if (m.noGravity) out.noGravity = span(m.noGravity[0], m.noGravity[1]);
  if (m.chargeFrame !== undefined) out.chargeFrame = fr(m.chargeFrame);
  if (m.next) out.next = { move: m.next.move, from: fr(m.next.from), to: fr(m.next.to) };
  if (m.grabbox) {
    const g = m.grabbox;
    const [start, end] = span(g.start, g.end);
    out.grabbox = { start, end, x: pct(g.x, t.size), y: pct(g.y, t.size), r: pct(g.r, t.size) };
  }
  if (m.pummel) out.pummel = { frame: fr(m.pummel.frame), damage: Math.max(1, pct(m.pummel.damage, t.damage)) };
  if (m.throw) out.throw = { frame: fr(m.throw.frame), hit: strength(m.throw.hit) };
  if (m.projectile) {
    const p = m.projectile;
    out.projectile = { ...p, frame: fr(p.frame), x: pct(p.x, t.size), y: pct(p.y, t.size), hit: strength(p.hit) };
  }
  if (m.counter) out.counter = span(m.counter[0], m.counter[1]);
  if (m.jumpCancel !== undefined) out.jumpCancel = fr(m.jumpCancel);
  if (m.turnUntil !== undefined) out.turnUntil = fr(m.turnUntil);
  return out;
}
