// Hit detection and hit resolution. All hits in a frame are detected against
// the same post-movement state, then applied, so fighter order can't matter.

import { Action, setAction } from './actions';
import { approach, idiv, ONE } from './fixed';
import { FIGHTERS } from './fighters';
import type { FighterStats } from './fighters/types';
import type { HitboxDef } from './moves/types';
import { SimEvent } from './events';
import {
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
import type { FighterState, MatchState } from './state';
import { icos, isin, TRIG_ONE } from './trig';

function within(frame: number, span: readonly [number, number]): boolean {
  return frame >= span[0] && frame <= span[1];
}

/** True if attacks pass through this fighter right now. */
export function isIntangible(f: FighterState, st: FighterStats): boolean {
  if (f.invincible > 0) return true;
  switch (f.action) {
    case Action.KO:
    case Action.Out:
    case Action.Respawn:
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

/** Circle (hitbox) vs. the victim's hurtbox rectangle. */
function touches(a: FighterState, h: HitboxDef, v: FighterState, vst: FighterStats): boolean {
  const cx = a.x + a.facing * h.x;
  const cy = a.y + h.y;
  const hw = vst.width >> 1;
  const nx = cx < v.x - hw ? v.x - hw : cx > v.x + hw ? v.x + hw : cx;
  const ny = cy < v.y - vst.height ? v.y - vst.height : cy > v.y ? v.y : cy;
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= h.r * h.r;
}

export function resolveHits(s: MatchState): void {
  const hits: { a: number; v: number; h: HitboxDef }[] = [];
  for (let ai = 0; ai < s.fighters.length; ai++) {
    const a = s.fighters[ai]!;
    if (a.hitlag > 0) continue;
    const boxes = activeHitboxes(a);
    if (boxes.length === 0) continue;
    for (let vi = 0; vi < s.fighters.length; vi++) {
      if (vi === ai || a.hitMask & (1 << vi)) continue;
      const v = s.fighters[vi]!;
      const vst = FIGHTERS[v.charId]!.stats;
      if (isIntangible(v, vst)) continue;
      const h = boxes.find((b) => touches(a, b, v, vst));
      if (h) hits.push({ a: ai, v: vi, h });
    }
  }
  for (const hit of hits) {
    const a = s.fighters[hit.a]!;
    const v = s.fighters[hit.v]!;
    if (isShieldAction(v.action)) applyShieldHit(a, v, hit.v, hit.h);
    else if (v.action === Action.ShieldDrop && v.actionFrame <= PARRY_WINDOW) applyParry(a, v, hit.v, hit.h);
    else applyHit(a, v, hit.v, hit.h);
  }
}

function hitlagFor(h: HitboxDef): number {
  return Math.min(HITLAG_MAX, HITLAG_BASE + idiv(h.damage, HITLAG_DAMAGE_DIVISOR));
}

/** Launch speed (fixed px/frame) a hitbox would give a victim already at `damage` (post-hit) %. */
export function knockback(h: HitboxDef, damage: number, weight: number): number {
  const kb = h.baseKb + idiv(damage * h.kbGrowth, 100);
  return idiv(kb * 100, weight);
}

function applyHit(a: FighterState, v: FighterState, victimIndex: number, h: HitboxDef): void {
  const vst = FIGHTERS[v.charId]!.stats;
  v.damage = Math.min(MAX_DAMAGE, v.damage + h.damage);
  const kb = knockback(h, v.damage, vst.weight);

  setAction(v, Action.Hitstun);
  v.vx = a.facing * idiv(kb * icos(h.angle), TRIG_ONE);
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
  v.jumpsLeft = vst.airJumps;

  const lag = hitlagFor(h);
  v.hitlag = lag;
  a.hitlag = lag;
  a.hitMask |= 1 << victimIndex;
  v.event = SimEvent.Hit;
}

function applyShieldHit(a: FighterState, v: FighterState, victimIndex: number, h: HitboxDef): void {
  const lag = hitlagFor(h);
  v.hitlag = lag;
  a.hitlag = lag;
  a.hitMask |= 1 << victimIndex;
  v.shieldHp -= h.damage * SHIELD_DAMAGE_PER_PERCENT;
  if (v.shieldHp <= 0) {
    breakShield(v);
    v.event = SimEvent.ShieldBreak;
    return;
  }
  setAction(v, Action.ShieldStun);
  v.hitstun = idiv(h.damage * SHIELDSTUN_NUM, SHIELDSTUN_DEN) + SHIELDSTUN_BASE;
  const away = v.x > a.x ? 1 : v.x < a.x ? -1 : a.facing;
  v.vx = away * (SHIELD_PUSH_BASE + h.damage * SHIELD_PUSH_PER_PERCENT);
  v.event = SimEvent.ShieldHit;
}

/** Released shield just before the hit: no damage, defender acts at once, attacker freezes longer. */
function applyParry(a: FighterState, v: FighterState, victimIndex: number, h: HitboxDef): void {
  const lag = hitlagFor(h);
  setAction(v, Action.Idle);
  v.hitlag = lag;
  a.hitlag = lag + PARRY_ATTACKER_LAG;
  a.hitMask |= 1 << victimIndex;
  v.event = SimEvent.Parry;
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
