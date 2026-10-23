// A rough forward model for the CPU: where a fighter, a move's hitboxes or a
// projectile will be over the next few frames. Straight-line motion with
// friction, gravity, move impulses, hitlag and landing on the stage, but no
// input and no fighter-vs-fighter collisions, so it is cheap enough to try
// every move every few frames. It only ever reads sim state.

import { Action } from '../sim/actions';
import { approach } from '../sim/fixed';
import { FIGHTERS } from '../sim/fighters';
import type { FighterStats } from '../sim/fighters/types';
import type { HitboxDef, MoveDef } from '../sim/moves/types';
import { KNOCKBACK_DECAY } from '../sim/rules';
import type { StageDef } from '../sim/stage';
import type { FighterState } from '../sim/state';

/** A fighter's feet and speed (fixed point), moved one frame at a time. */
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  /** Frames left frozen in hitlag. */
  frozen: number;
}

export function bodyOf(f: FighterState): Body {
  return { x: f.x, y: f.y, vx: f.vx, vy: f.vy, grounded: f.ground >= 0, frozen: f.hitlag };
}

/** One frame with no input: friction on the ground; drag, gravity and landing in the air. */
export function coast(b: Body, st: FighterStats, stage: StageDef, hitstun = false, gravity = true): void {
  if (b.frozen > 0) {
    b.frozen--;
    return;
  }
  if (b.grounded) {
    b.vx = approach(b.vx, 0, st.groundFriction);
    b.x += b.vx;
    return;
  }
  b.vx = approach(b.vx, 0, hitstun ? KNOCKBACK_DECAY : st.airFriction);
  if (gravity) {
    if (b.vy > st.maxFallSpeed) b.vy = approach(b.vy, st.maxFallSpeed, KNOCKBACK_DECAY);
    else b.vy = Math.min(b.vy + st.gravity, st.maxFallSpeed);
  }
  const prevY = b.y;
  b.x += b.vx;
  b.y += b.vy;
  if (b.vy > 0) land(b, prevY, stage);
}

function land(b: Body, prevY: number, stage: StageDef): void {
  for (const s of [...stage.blocks, ...stage.platforms]) {
    if (prevY <= s.top && b.y >= s.top && b.x >= s.left && b.x <= s.right) {
      b.y = s.top;
      b.vy = 0;
      b.grounded = true;
      return;
    }
  }
}

/** Circle vs. a hurtbox standing at `b` (the same test the sim uses). */
export function touches(cx: number, cy: number, r: number, b: { x: number; y: number }, st: FighterStats): boolean {
  const hw = st.width >> 1;
  const nx = Math.max(b.x - hw, Math.min(b.x + hw, cx));
  const ny = Math.max(b.y - st.height, Math.min(b.y, cy));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

/** Frames before attacks can touch `f` again (0 = hittable now, Infinity = not this stock). */
export function untouchableFor(f: FighterState): number {
  const st = FIGHTERS[f.charId]!.stats;
  const left = (span: readonly [number, number]) => (f.actionFrame <= span[1] ? span[1] - f.actionFrame + 1 : 0);
  let n = f.invincible;
  switch (f.action) {
    case Action.KO:
    case Action.Out:
    case Action.Held:
      return Infinity;
    case Action.Respawn:
      return Math.max(n, 30); // invincible from the moment it drops
    case Action.Roll:
      n = Math.max(n, left(st.rollIntangible));
      break;
    case Action.SpotDodge:
      n = Math.max(n, left(st.spotDodgeIntangible));
      break;
    case Action.AirDodge:
      n = Math.max(n, left(st.airDodgeIntangible));
      break;
  }
  return n;
}

export interface Hit {
  /** Frames from now until it connects. */
  wait: number;
  /** The hitbox that connects (a grab gets a 0-damage stand-in). */
  box: HitboxDef;
}

const GRAB_STAND_IN: HitboxDef = { start: 0, end: 0, x: 0, y: 0, r: 0, damage: 0, baseKb: 0, kbGrowth: 0, angle: 0 };

/**
 * When `att`'s `move`, done facing `facing` and picked up after move frame
 * `from` (0 = starting it now), would first touch `target` if both coast,
 * looking at most `horizon` frames ahead. Covers hitboxes, grab boxes and
 * projectiles.
 */
export function firstHit(
  att: FighterState,
  move: MoveDef,
  facing: number,
  from: number,
  target: FighterState,
  stage: StageDef,
  horizon = 45,
): Hit | undefined {
  const ast = FIGHTERS[att.charId]!.stats;
  const tst = FIGHTERS[target.charId]!.stats;
  const a = bodyOf(att);
  const t = bodyOf(target);
  if (from === 0) a.frozen = 0;
  const safeAfter = untouchableFor(target);
  const tHitstun = target.action === Action.Hitstun;
  const pr = move.projectile;
  let proj: { x: number; y: number; vx: number; life: number } | undefined;

  for (let wait = 1; wait <= horizon; wait++) {
    const k = from + wait; // move frame
    const inMove = k <= move.total;
    if (inMove && a.frozen === 0) {
      for (const imp of move.impulses ?? []) {
        if (imp.frame !== k) continue;
        if (imp.vx !== undefined) a.vx = facing * imp.vx;
        if (imp.vy !== undefined) {
          a.vy = imp.vy;
          if (imp.vy < 0) a.grounded = false;
        }
        if (imp.airVy !== undefined && !a.grounded) a.vy = imp.airVy;
      }
    }
    const g = move.noGravity;
    coast(a, ast, stage, false, !(inMove && g && k >= g[0] && k <= g[1]));
    coast(t, tst, stage, tHitstun);
    const canHit = wait > safeAfter;

    if (inMove && canHit) {
      for (const h of move.hitboxes) {
        if (k >= h.start && k <= h.end && touches(a.x + facing * h.x, a.y + h.y, h.r, t, tst)) return { wait, box: h };
      }
      const gb = move.grabbox;
      if (gb && k >= gb.start && k <= gb.end && touches(a.x + facing * gb.x, a.y + gb.y, gb.r, t, tst)) {
        return { wait, box: GRAB_STAND_IN };
      }
    }
    if (pr && k === pr.frame) proj = { x: a.x + facing * pr.x, y: a.y + pr.y, vx: facing * pr.speed, life: pr.life };
    if (proj) {
      if (proj.life-- <= 0) return undefined;
      proj.x += proj.vx;
      if (canHit && touches(proj.x, proj.y, pr!.hit.r, t, tst)) return { wait, box: pr!.hit };
    } else if (!inMove) {
      return undefined;
    }
  }
  return undefined;
}

/** Where `f` ends up once `move` (done facing `facing`) is over, if it coasts. */
export function moveEnd(f: FighterState, move: MoveDef, facing: number, stage: StageDef): Body {
  const st = FIGHTERS[f.charId]!.stats;
  const b = bodyOf(f);
  b.frozen = 0;
  for (let k = 1; k <= move.total; k++) {
    for (const imp of move.impulses ?? []) {
      if (imp.frame !== k) continue;
      if (imp.vx !== undefined) b.vx = facing * imp.vx;
      if (imp.vy !== undefined) {
        b.vy = imp.vy;
        if (imp.vy < 0) b.grounded = false;
      }
      if (imp.airVy !== undefined && !b.grounded) b.vy = imp.airVy;
    }
    const g = move.noGravity;
    coast(b, st, stage, false, !(g && k >= g[0] && k <= g[1]));
  }
  return b;
}
