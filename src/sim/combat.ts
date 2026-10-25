// Hit, projectile and grab resolution. Everything in a frame is detected
// against the same post-movement state, then applied (hits before grabs), so
// fighter order can't matter.

import { Action, isLedgeAction, setAction } from './actions';
import { startMove } from './attacks';
import { SimEvent } from './events';
import { approach, idiv, ONE } from './fixed';
import { FIGHTERS } from './fighters';
import type { FighterStats } from './fighters/types';
import { MoveId, type HitboxDef } from './moves/types';
import {
  CHARGE_DEN,
  MAX_SMASH_CHARGE,
  COUNTER_FREEZE,
  GRAB_HOLD_BASE,
  GRAB_HOLD_DAMAGE_DIVISOR,
  GRAB_HOLD_MAX,
  HITLAG_BASE,
  HITLAG_DAMAGE_DIVISOR,
  HITLAG_MAX,
  HITSTUN_DEN,
  HITSTUN_NUM,
  KNOCKBACK_DECAY,
  MAX_DAMAGE,
  PARRY_ATTACKER_LAG,
  PARRY_WINDOW,
  SHIELD_DAMAGE_PER_PERCENT,
  SHIELD_PUSH_BASE,
  SHIELD_PUSH_PER_PERCENT,
  SHIELDSTUN_BASE,
  SHIELDSTUN_DEN,
  SHIELDSTUN_NUM,
} from './rules';
import { breakShield, isShieldAction } from './shield';
import { placeHeld, releaseGrab } from './grabs';
import type { FighterState, MatchState } from './state';
import { icos, isin, TRIG_ONE } from './trig';

function within(frame: number, span: readonly [number, number]): boolean {
  return frame >= span[0] && frame <= span[1];
}

/** True if attacks and grabs pass through this fighter right now. */
export function isIntangible(f: FighterState, st: FighterStats): boolean {
  if (f.invincible > 0) return true;
  switch (f.action) {
    case Action.KO:
    case Action.Out:
    case Action.Respawn:
    case Action.Held:
      return true;
    case Action.Roll:
      return within(f.actionFrame, st.rollIntangible);
    case Action.SpotDodge:
      return within(f.actionFrame, st.spotDodgeIntangible);
    case Action.AirDodge:
      return within(f.actionFrame, st.airDodgeIntangible);
  }
  return false;
}

/** Hitboxes of `f`'s current move that are active this frame (empty if none). */
export function activeHitboxes(f: FighterState): readonly HitboxDef[] {
  if (f.action !== Action.Attack) return [];
  const m = FIGHTERS[f.charId]!.moves[f.move]!;
  return m.hitboxes.filter((h) => f.actionFrame >= h.start && f.actionFrame <= h.end);
}

/** Circle vs. the victim's hurtbox rectangle. */
function circleTouches(cx: number, cy: number, r: number, v: FighterState, vst: FighterStats): boolean {
  const hw = vst.width >> 1;
  const nx = cx < v.x - hw ? v.x - hw : cx > v.x + hw ? v.x + hw : cx;
  const ny = cy < v.y - vst.height ? v.y - vst.height : cy > v.y ? v.y : cy;
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

/** A smash attack's charge scales damage and base knockback (up to 1.4x). */
function charged(a: FighterState, h: HitboxDef): HitboxDef {
  if (a.charge === 0) return h;
  const k = CHARGE_DEN + Math.min(a.charge, MAX_SMASH_CHARGE); // held past full charge: no extra power
  return { ...h, damage: idiv(h.damage * k, CHARGE_DEN), baseKb: idiv(h.baseKb * k, CHARGE_DEN) };
}

interface PendingHit {
  a: number;
  v: number;
  h: HitboxDef;
  /** Launch direction (1 / -1). */
  dir: number;
  /** false for projectiles: the owner isn't frozen. */
  melee: boolean;
}

export function resolveHits(s: MatchState): void {
  const hits: PendingHit[] = [];
  const grabs: { a: number; v: number }[] = [];

  for (let ai = 0; ai < s.fighters.length; ai++) {
    const a = s.fighters[ai]!;
    const am = a.action === Action.Attack ? FIGHTERS[a.charId]!.moves[a.move]! : undefined;

    // Melee hitboxes.
    const boxes = a.hitlag > 0 ? [] : activeHitboxes(a);
    // Projectile.
    const proj = a.projLife > 0 ? projectileHit(a) : undefined;
    // Grab box.
    const gb = am?.grabbox;
    const grabbing = gb && a.hitlag === 0 && a.grabTarget < 0 && within(a.actionFrame, [gb.start, gb.end]);

    for (let vi = 0; vi < s.fighters.length; vi++) {
      if (vi === ai) continue;
      const v = s.fighters[vi]!;
      const vst = FIGHTERS[v.charId]!.stats;
      if (isIntangible(v, vst)) continue;

      if (boxes.length > 0 && !(a.hitMask & (1 << vi))) {
        const h = boxes.find((b) => circleTouches(a.x + a.facing * b.x, a.y + b.y, b.r, v, vst));
        if (h) hits.push({ a: ai, v: vi, h: charged(a, h), dir: a.facing, melee: true });
      }
      if (proj && a.projLife > 0 && circleTouches(a.projX, a.projY, proj.r, v, vst)) {
        hits.push({ a: ai, v: vi, h: proj, dir: a.projVx >= 0 ? 1 : -1, melee: false });
        a.projLife = 0; // consumed
      }
      if (grabbing && circleTouches(a.x + a.facing * gb.x, a.y + gb.y, gb.r, v, vst)) {
        grabs.push({ a: ai, v: vi });
      }
    }
  }

  for (const hit of hits) {
    const a = s.fighters[hit.a]!;
    const v = s.fighters[hit.v]!;
    if (isCountering(v)) applyCounter(a, v, hit);
    else if (isShieldAction(v.action)) applyShieldHit(a, v, hit);
    else if (v.action === Action.ShieldDrop && v.actionFrame <= PARRY_WINDOW) applyParry(a, v, hit);
    else applyHit(a, hit.a, v, hit.v, hit.h, hit.dir, hit.melee);
  }

  for (const g of grabs) {
    const a = s.fighters[g.a]!;
    const v = s.fighters[g.v]!;
    // A grab whiffs if the grabber got hit this frame or the target is already held.
    if (a.action !== Action.Attack || a.move !== MoveId.Grab || v.action === Action.Held || isLedgeAction(v.action)) continue;
    // Both grabbed each other: bounce apart.
    const mutual = grabs.some((o) => o.a === g.v && o.v === g.a);
    if (mutual) {
      a.grabTarget = g.v;
      v.heldBy = g.a;
      releaseGrab(a, v);
      continue;
    }
    applyGrab(a, v, g.a, g.v);
  }
}

function projectileHit(a: FighterState): HitboxDef | undefined {
  return FIGHTERS[a.charId]!.moves[MoveId.NSpecial]!.projectile?.hit;
}

function isCountering(v: FighterState): boolean {
  if (v.action !== Action.Attack) return false;
  const c = FIGHTERS[v.charId]!.moves[v.move]!.counter;
  return c !== undefined && within(v.actionFrame, c);
}

function hitlagFor(h: HitboxDef): number {
  return Math.min(HITLAG_MAX, HITLAG_BASE + idiv(h.damage, HITLAG_DAMAGE_DIVISOR));
}

/** Launch speed (fixed px/frame) a hitbox would give a victim already at `damage` (post-hit) %. */
export function knockback(h: HitboxDef, damage: number, weight: number): number {
  const kb = h.baseKb + idiv(damage * h.kbGrowth, 100);
  return idiv(kb * 100, weight);
}

/**
 * Damage and launch `v`. `dir` is the horizontal direction the hitbox angle is
 * measured from (attacker facing, or the projectile's travel direction).
 */
export function applyHit(
  a: FighterState,
  attackerIndex: number,
  v: FighterState,
  victimIndex: number,
  h: HitboxDef,
  dir: number,
  melee: boolean,
): void {
  const vst = FIGHTERS[v.charId]!.stats;
  v.damage = Math.min(MAX_DAMAGE, v.damage + h.damage);
  v.lastHitBy = attackerIndex;
  const kb = knockback(h, v.damage, vst.weight);

  setAction(v, Action.Hitstun);
  v.vx = dir * idiv(kb * icos(h.angle), TRIG_ONE);
  v.vy = -idiv(kb * isin(h.angle), TRIG_ONE);
  if (v.vy < 0) v.ground = -1;
  else if (v.ground >= 0) v.vy = 0; // spiked while grounded: slide instead
  v.hitstun = Math.max(1, idiv(kb * HITSTUN_NUM, HITSTUN_DEN * ONE));
  v.fastFall = 0;
  v.hopOpen = 0;
  v.jumpBuffer = 0;
  v.actBuffer = 0;
  v.actBufferTimer = 0;
  v.airDodgeUsed = 0;
  v.oncePerAirUsed = 0;
  v.jumpsLeft = vst.airJumps;
  v.charge = 0;

  const lag = hitlagFor(h);
  v.hitlag = lag;
  if (melee) {
    a.hitlag = lag;
    a.hitMask |= 1 << victimIndex;
  }
  v.event = SimEvent.Hit;
}

function applyShieldHit(a: FighterState, v: FighterState, hit: PendingHit): void {
  const h = hit.h;
  const lag = hitlagFor(h);
  v.hitlag = lag;
  if (hit.melee) {
    a.hitlag = lag;
    a.hitMask |= 1 << hit.v;
  }
  v.shieldHp -= h.damage * SHIELD_DAMAGE_PER_PERCENT;
  if (v.shieldHp <= 0) {
    breakShield(v);
    v.event = SimEvent.ShieldBreak;
    return;
  }
  setAction(v, Action.ShieldStun);
  v.hitstun = idiv(h.damage * SHIELDSTUN_NUM, SHIELDSTUN_DEN) + SHIELDSTUN_BASE;
  const away = !hit.melee ? hit.dir : v.x > a.x ? 1 : v.x < a.x ? -1 : a.facing;
  v.vx = away * (SHIELD_PUSH_BASE + h.damage * SHIELD_PUSH_PER_PERCENT);
  v.event = SimEvent.ShieldHit;
}

/** Released shield just before the hit: no damage, defender acts at once, attacker freezes longer. */
function applyParry(a: FighterState, v: FighterState, hit: PendingHit): void {
  const lag = hitlagFor(hit.h);
  setAction(v, Action.Idle);
  v.hitlag = lag;
  if (hit.melee) {
    a.hitlag = lag + PARRY_ATTACKER_LAG;
    a.hitMask |= 1 << hit.v;
  }
  v.event = SimEvent.Parry;
}

/** Hit during a counter window: no damage, the attacker freezes, the counterer strikes back. */
function applyCounter(a: FighterState, v: FighterState, hit: PendingHit): void {
  const toward = a.x > v.x ? 1 : a.x < v.x ? -1 : v.facing;
  startMove(v, MoveId.CounterStrike, toward);
  if (hit.melee) {
    a.hitlag = COUNTER_FREEZE;
    a.hitMask |= 1 << hit.v;
  }
  v.event = SimEvent.Counter;
}

function applyGrab(a: FighterState, v: FighterState, ai: number, vi: number): void {
  setAction(a, Action.Holding);
  a.grabTarget = vi;
  a.vx = 0;
  setAction(v, Action.Held);
  v.heldBy = ai;
  v.grabTimer = Math.min(GRAB_HOLD_MAX, GRAB_HOLD_BASE + idiv(v.damage, GRAB_HOLD_DAMAGE_DIVISOR));
  v.hitstun = 0;
  v.charge = 0;
  v.fastFall = 0;
  v.actBuffer = 0;
  v.actBufferTimer = 0;
  v.jumpBuffer = 0;
  placeHeld(a, v);
  v.event = SimEvent.Grab;
}

export function updateHitstun(f: FighterState, st: FighterStats): void {
  f.actionFrame++;
  if (f.hitstun > 0) f.hitstun--;
  if (f.ground >= 0) {
    f.vx = approach(f.vx, 0, st.groundFriction);
  } else {
    f.vx = approach(f.vx, 0, KNOCKBACK_DECAY);
    if (f.vy > st.maxFallSpeed) f.vy = approach(f.vy, st.maxFallSpeed, KNOCKBACK_DECAY);
    else f.vy = Math.min(f.vy + st.gravity, st.maxFallSpeed);
  }
  if (f.hitstun === 0) setAction(f, f.ground >= 0 ? Action.Idle : Action.Air);
}
