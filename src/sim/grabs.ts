// Grab bookkeeping that involves two fighters at once. It runs once per frame
// after every fighter has updated, so fighter order doesn't matter.

import { Action, setAction } from './actions';
import { applyHit } from './combat';
import { SimEvent } from './events';
import { idiv } from './fixed';
import { FIGHTERS } from './fighters';
import { GRAB_HOLD_PERCENT, GRAB_RELEASE_SPEED } from './rules';
import type { FighterState, MatchState } from './state';
import { icos } from './trig';

const PUMMEL_HITLAG = 3;

/** Distance between holder and held fighter; bigger bodies are held further out. */
function holdDistance(h: FighterState, v: FighterState): number {
  const widths = FIGHTERS[h.charId]!.stats.width + FIGHTERS[v.charId]!.stats.width;
  return idiv(widths * GRAB_HOLD_PERCENT, 200);
}

/** Keep the held fighter in front of the holder, facing them. */
export function placeHeld(h: FighterState, v: FighterState): void {
  v.x = h.x + h.facing * holdDistance(h, v);
  v.y = h.y;
  v.ground = h.ground;
  v.vx = 0;
  v.vy = 0;
  v.facing = -h.facing;
}

/** Let go: both slide apart and can act again. */
export function releaseGrab(h: FighterState, v: FighterState): void {
  h.grabTarget = -1;
  v.heldBy = -1;
  setAction(h, h.ground >= 0 ? Action.Idle : Action.Air);
  setAction(v, v.ground >= 0 ? Action.Idle : Action.Air);
  const away = v.x >= h.x ? 1 : -1;
  h.vx = -away * GRAB_RELEASE_SPEED;
  v.vx = away * GRAB_RELEASE_SPEED;
}

function holderIsHolding(h: FighterState): boolean {
  if (h.action === Action.Holding) return true;
  if (h.action !== Action.Attack) return false;
  const m = FIGHTERS[h.charId]!.moves[h.move]!;
  return m.pummel !== undefined || m.throw !== undefined;
}

export function updateGrabs(s: MatchState): void {
  // Held fighters whose holder let go some other way (e.g. got hit) are freed.
  s.fighters.forEach((v, vi) => {
    if (v.action !== Action.Held) return;
    const h = s.fighters[v.heldBy];
    if (h && h.grabTarget === vi && holderIsHolding(h)) return;
    v.heldBy = -1;
    setAction(v, v.ground >= 0 ? Action.Idle : Action.Air);
  });

  s.fighters.forEach((h, hi) => {
    if (h.grabTarget < 0) return;
    const vi = h.grabTarget;
    const v = s.fighters[vi]!;
    if (!holderIsHolding(h) || v.action !== Action.Held || v.heldBy !== hi) {
      h.grabTarget = -1;
      return;
    }
    placeHeld(h, v);
    const bit = 1 << vi;

    if (h.action === Action.Attack && h.hitlag === 0 && !(h.hitMask & bit)) {
      const m = FIGHTERS[h.charId]!.moves[h.move]!;
      if (m.pummel && h.actionFrame >= m.pummel.frame) {
        h.hitMask |= bit;
        v.damage += m.pummel.damage;
        h.hitlag = PUMMEL_HITLAG;
        v.hitlag = PUMMEL_HITLAG;
        v.event = SimEvent.Hit;
        return;
      }
      if (m.throw && h.actionFrame >= m.throw.frame) {
        // Throws aimed backward release the victim behind the thrower.
        if (icos(m.throw.hit.angle) < 0) v.x = h.x - h.facing * holdDistance(h, v);
        h.grabTarget = -1;
        v.heldBy = -1;
        applyHit(h, v, vi, m.throw.hit, h.facing, true);
        return;
      }
    }

    if (v.grabTimer <= 0) releaseGrab(h, v);
  });
}
