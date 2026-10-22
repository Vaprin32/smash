// Starting and running attacks, specials and dodges.

import { Action, setAction } from './actions';
import { approach } from './fixed';
import type { FighterDef } from './fighters/types';
import { Btn } from './input';
import { MoveId, type MoveIdValue } from './moves/types';
import { airMotion, inputDirX } from './movement';
import type { FighterState } from './state';

/** 1/sqrt(2) in 8-bit fixed point, for diagonal air dodges. */
const DIAGONAL = 181;

/**
 * Consume a buffered Attack / Special / Dodge press if the fighter can act.
 * Directions are read from the current input. Returns true if something started.
 */
export function tryStartAction(f: FighterState, input: number, def: FighterDef, grounded: boolean): boolean {
  if (f.actBufferTimer === 0) return false;
  const btn = f.actBuffer;
  f.actBuffer = 0;
  f.actBufferTimer = 0;

  const dirX = inputDirX(input);
  const up = (input & Btn.Up) !== 0;
  const down = (input & Btn.Down) !== 0;

  if (btn === Btn.Attack) {
    if (grounded) {
      if (down) startMove(f, MoveId.DTilt);
      else if (dirX !== 0) startMove(f, MoveId.FTilt, dirX);
      else startMove(f, MoveId.Jab);
    } else {
      if (up) startMove(f, MoveId.UAir);
      else if (down) startMove(f, MoveId.DAir);
      else if (dirX !== 0) startMove(f, MoveId.FAir, dirX);
      else startMove(f, MoveId.NAir);
    }
    return true;
  }

  if (btn === Btn.Special) {
    if (up) {
      startMove(f, MoveId.UpSpecial);
      return true;
    }
    if (!grounded) {
      if (f.sideSpecialUsed) return false;
      f.sideSpecialUsed = 1;
    }
    startMove(f, MoveId.SideSpecial, dirX);
    return true;
  }

  if (btn === Btn.Dodge) {
    const st = def.stats;
    if (grounded) {
      if (dirX !== 0) {
        setAction(f, Action.Roll);
        f.vx = dirX * st.rollSpeed;
      } else {
        setAction(f, Action.SpotDodge);
      }
      return true;
    }
    if (f.airDodgeUsed) return false;
    f.airDodgeUsed = 1;
    setAction(f, Action.AirDodge);
    const dirY = (down ? 1 : 0) - (up ? 1 : 0);
    const speed = dirX !== 0 && dirY !== 0 ? (st.airDodgeSpeed * DIAGONAL) >> 8 : st.airDodgeSpeed;
    f.vx = dirX * speed;
    f.vy = dirY * speed;
    f.fastFall = 0;
    f.hopOpen = 0;
    return true;
  }
  return false;
}

/** `turnTo` (if non-zero) makes the fighter face that way first. */
function startMove(f: FighterState, move: MoveIdValue, turnTo = 0): void {
  if (turnTo !== 0) f.facing = turnTo;
  setAction(f, Action.Attack);
  f.move = move;
  f.hitMask = 0;
  f.hopOpen = 0;
}

export function updateAttack(f: FighterState, input: number, pressed: number, def: FighterDef): void {
  const st = def.stats;
  const m = def.moves[f.move]!;
  f.actionFrame++;

  if (f.actionFrame > m.total) {
    if (f.ground >= 0) {
      setAction(f, Action.Idle);
      f.vx = approach(f.vx, 0, st.groundFriction);
    } else {
      setAction(f, m.helplessAfter ? Action.SpecialFall : Action.Air);
      airMotion(f, input, pressed, st, true, true);
    }
    return;
  }

  if (m.impulses) {
    for (const imp of m.impulses) {
      if (imp.frame !== f.actionFrame) continue;
      if (imp.vx !== undefined) f.vx = f.facing * imp.vx;
      if (imp.vy !== undefined) {
        f.vy = imp.vy;
        f.fastFall = 0;
        if (imp.vy < 0) f.ground = -1;
      }
      if (imp.airVy !== undefined && f.ground < 0) {
        f.vy = imp.airVy;
        f.fastFall = 0;
      }
    }
  }

  if (f.ground >= 0) {
    f.vx = approach(f.vx, 0, st.groundFriction);
    return;
  }
  const g = m.noGravity;
  const gravity = !g || f.actionFrame < g[0] || f.actionFrame > g[1];
  // Down+Attack aims a down air; that same press shouldn't also fast-fall.
  const ffPressed = f.actionFrame === 1 ? pressed & ~Btn.Down : pressed;
  airMotion(f, input, ffPressed, st, !m.noDrift, gravity);
}

export function updateDodge(f: FighterState, input: number, pressed: number, def: FighterDef): void {
  const st = def.stats;
  f.actionFrame++;

  if (f.action === Action.AirDodge) {
    if (f.actionFrame > st.airDodgeFrames) {
      setAction(f, Action.Air);
      airMotion(f, input, pressed, st, true, true);
    } else if (f.actionFrame <= st.airDodgeIntangible[1]) {
      f.vx = approach(f.vx, 0, st.airDodgeDecay);
      f.vy = approach(f.vy, 0, st.airDodgeDecay);
    } else {
      airMotion(f, input, pressed, st, true, true);
    }
    return;
  }

  const total = f.action === Action.Roll ? st.rollFrames : st.spotDodgeFrames;
  if (f.action !== Action.Roll || f.actionFrame > st.rollMoveFrames) {
    f.vx = approach(f.vx, 0, st.groundFriction);
  }
  if (f.ground < 0) airMotion(f, 0, 0, st, false, true); // rolled off an edge
  if (f.actionFrame >= total) setAction(f, f.ground >= 0 ? Action.Idle : Action.Air);
}

export function updateSpecialFall(f: FighterState, input: number, pressed: number, def: FighterDef): void {
  f.actionFrame++;
  airMotion(f, input, pressed, def.stats, true, true);
}
