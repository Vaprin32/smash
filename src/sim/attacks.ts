// Starting and running attacks, specials, grabs and dodges.
//
// Input layout (Smash Ultimate style):
//   J ground: jab combo / side, up, down tilt / dash attack (while dashing or running)
//   J air:    neutral / forward / back / up / down air (back air keeps facing)
//   K ground: forward / up / down smash (hold K to charge); nothing in the air
//   I anywhere: neutral / side / up / down special
//   Shield (E) + J: grab. While holding: J pummel, a direction throws that way.

import { Action, setAction } from './actions';
import { approach } from './fixed';
import type { FighterDef } from './fighters/types';
import { Btn } from './input';
import { MoveId, type MoveIdValue } from './moves/types';
import { airMotion, inputDirX } from './movement';
import { GRAB_MASH_FRAMES, MAX_SMASH_CHARGE, SMASH_HOLD_FRAMES } from './rules';
import type { FighterState } from './state';

/** 1/sqrt(2) in 8-bit fixed point, for diagonal air dodges. */
const DIAGONAL = 181;
/** Frames after a grab connects before a held direction throws. */
const THROW_INPUT_DELAY = 3;
/** A hitMask bit no fighter index uses: "this move has hit something" survives multi-hit resets. */
export const HIT_ANY = 1 << 8;

/**
 * Consume a buffered button press if the fighter can act. Directions are read
 * from the current input; `pressed` is this frame's fresh presses. Returns
 * true if something started.
 */
export function tryStartAction(
  f: FighterState,
  input: number,
  pressed: number,
  def: FighterDef,
  grounded: boolean,
): boolean {
  if (f.actBufferTimer === 0) return false;
  // Smash attacks are ground-only. In the air the press stays buffered, so
  // it still comes out if the fighter lands within the buffer window.
  if (f.actBuffer === Btn.Heavy && !grounded) return false;
  const btn = f.actBuffer;
  f.actBuffer = 0;
  f.actBufferTimer = 0;

  const dirX = inputDirX(input);
  const up = (input & Btn.Up) !== 0;
  const down = (input & Btn.Down) !== 0;
  const st = def.stats;

  if (btn === Btn.Attack) {
    if (grounded) {
      if (input & Btn.Dodge) startMove(f, MoveId.Grab);
      else if (f.action === Action.Run || f.action === Action.Dash) startMove(f, MoveId.DashAttack);
      else if (up) startMove(f, MoveId.UTilt);
      else if (down) startMove(f, MoveId.DTilt);
      else if (dirX !== 0) startMove(f, MoveId.FTilt, dirX);
      else startMove(f, MoveId.Jab1);
    } else {
      if (up) startMove(f, MoveId.UAir);
      else if (down) startMove(f, MoveId.DAir);
      else if (dirX === f.facing) startMove(f, MoveId.FAir);
      else if (dirX !== 0) startMove(f, MoveId.BAir);
      else startMove(f, MoveId.NAir);
    }
    return true;
  }

  if (btn === Btn.Heavy) {
    if (up) startMove(f, MoveId.USmash);
    else if (down) startMove(f, MoveId.DSmash);
    else startMove(f, MoveId.FSmash, dirX);
    return true;
  }

  if (btn === Btn.Special) return startSpecial(f, up, down, dirX, def, grounded);

  if (btn === Btn.Dash) {
    if (!grounded || f.dashCooldown > 0) return false;
    const dir = dirX !== 0 ? dirX : f.facing;
    f.facing = dir;
    setAction(f, Action.Dash);
    f.vx = dir * st.dashSpeed;
    f.dashCooldown = st.dashCooldown;
    return true;
  }

  if (btn === Btn.Dodge) {
    if (grounded) {
      // Pressing a direction together with the button rolls / spot dodges at
      // once; otherwise it's a shield (and you can roll out of it).
      const pressedX = inputDirX(pressed);
      if (pressedX !== 0) startRoll(f, pressedX, def);
      else if (pressed & Btn.Down) setAction(f, Action.SpotDodge);
      else setAction(f, Action.Shield);
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

function startSpecial(f: FighterState, up: boolean, down: boolean, dirX: number, def: FighterDef, grounded: boolean): boolean {
  const move = up ? MoveId.UpSpecial : down ? MoveId.DownSpecial : dirX !== 0 ? MoveId.SideSpecial : MoveId.NSpecial;
  if (!grounded && def.moves[move]!.oncePerAir) {
    const bit = 1 << move;
    if (f.oncePerAirUsed & bit) return false;
    f.oncePerAirUsed |= bit;
  }
  startMove(f, move, move === MoveId.SideSpecial ? dirX : 0);
  return true;
}

export function startRoll(f: FighterState, dir: number, def: FighterDef): void {
  setAction(f, Action.Roll);
  f.vx = dir * def.stats.rollSpeed;
}

/** `turnTo` (if non-zero) makes the fighter face that way first. */
export function startMove(f: FighterState, move: MoveIdValue, turnTo = 0): void {
  if (turnTo !== 0) f.facing = turnTo;
  setAction(f, Action.Attack);
  f.move = move;
  f.hitMask = 0;
  f.hopOpen = 0;
  f.charge = 0;
}

export function updateAttack(f: FighterState, input: number, pressed: number, def: FighterDef): void {
  const st = def.stats;
  const m = def.moves[f.move]!;

  // Smash charge: holding the heavy button freezes the move on its charge frame. Power stops
  // growing at MAX_SMASH_CHARGE; the fighter can keep holding it for SMASH_HOLD_FRAMES more.
  if (
    m.chargeFrame !== undefined &&
    f.actionFrame === m.chargeFrame &&
    input & Btn.Heavy &&
    f.charge < MAX_SMASH_CHARGE + SMASH_HOLD_FRAMES
  ) {
    f.charge++;
    f.vx = approach(f.vx, 0, st.groundFriction);
    return;
  }

  f.actionFrame++;

  if (f.actionFrame > m.total) {
    if (m.pummel && f.grabTarget >= 0) {
      setAction(f, Action.Holding);
    } else if (f.ground >= 0) {
      setAction(f, Action.Idle);
      f.vx = approach(f.vx, 0, st.groundFriction);
    } else {
      setAction(f, m.helplessAfter ? Action.SpecialFall : Action.Air);
      airMotion(f, input, pressed, st, true, true);
    }
    return;
  }

  // Multi-hit: let the same fighters be hit again, remembering that something was hit.
  if (m.rehit && f.hitMask !== 0 && f.actionFrame % m.rehit === 0) f.hitMask = HIT_ANY;

  // Whiffed (nothing hit yet, unless jumpCancelOnHit): a jump gets out of the move, using an
  // air jump if one is left.
  const whiffed = f.hitMask === 0 || m.jumpCancelOnHit;
  if (m.jumpCancel && f.actionFrame >= m.jumpCancel && whiffed && f.ground < 0 && f.jumpBuffer > 0) {
    f.jumpBuffer = 0;
    setAction(f, Action.Air);
    f.fastFall = 0;
    f.hopOpen = 0;
    if (f.jumpsLeft > 0) {
      f.jumpsLeft--;
      f.vy = -st.doubleJumpSpeed;
      const dirX = inputDirX(input);
      if (dirX !== 0) f.vx = dirX * st.airMaxSpeed;
    }
    return;
  }

  // Jab combo: attack pressed in the window continues into the next hit.
  if (
    m.next &&
    f.actionFrame >= m.next.from &&
    f.actionFrame <= m.next.to &&
    f.actBufferTimer > 0 &&
    f.actBuffer === Btn.Attack
  ) {
    f.actBuffer = 0;
    f.actBufferTimer = 0;
    startMove(f, m.next.move);
    return;
  }

  if (m.projectile && f.actionFrame === m.projectile.frame && f.projLife === 0) {
    const pr = m.projectile;
    f.projLife = pr.life;
    f.projX = f.x + f.facing * pr.x;
    f.projY = f.y + pr.y;
    f.projVx = f.facing * pr.speed;
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
      if (imp.groundVy !== undefined && f.ground >= 0) {
        f.vy = imp.groundVy;
        f.fastFall = 0;
        if (imp.groundVy < 0) f.ground = -1;
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

/** Holding a grabbed fighter: J pummels, a held direction throws that way. */
export function updateHolding(f: FighterState, input: number, def: FighterDef): void {
  f.actionFrame++;
  f.vx = approach(f.vx, 0, def.stats.groundFriction);
  if (f.actBufferTimer > 0 && f.actBuffer === Btn.Attack) {
    f.actBuffer = 0;
    f.actBufferTimer = 0;
    startMove(f, MoveId.Pummel);
    return;
  }
  if (f.actionFrame < THROW_INPUT_DELAY) return;
  const dirX = inputDirX(input);
  if (input & Btn.Up) startMove(f, MoveId.UThrow);
  else if (input & Btn.Down) startMove(f, MoveId.DThrow);
  else if (dirX === f.facing) startMove(f, MoveId.FThrow);
  else if (dirX !== 0) startMove(f, MoveId.BThrow);
}

/** Being held: count down to breaking free; every fresh press mashes it down faster. */
export function updateHeld(f: FighterState, pressed: number): void {
  f.actionFrame++;
  f.grabTimer -= pressed ? 1 + GRAB_MASH_FRAMES : 1;
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
