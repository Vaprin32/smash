// Player control for the "free" states (idle, walk, run, jump squat, air,
// landing): turns input into actions and velocity changes. Position
// integration and collision happen afterwards in physics.ts.

import { Action, setAction } from './actions';
import { tryStartAction } from './attacks';
import { approach, clamp, idiv } from './fixed';
import type { FighterDef, FighterStats } from './fighters/types';
import { Btn } from './input';
import { ACTION_BUFFER_FRAMES, JUMP_BUFFER_FRAMES } from './rules';
import { surfaceOf, type StageDef } from './stage';
import type { FighterState } from './state';

export function inputDirX(input: number): number {
  return (input & Btn.Right ? 1 : 0) - (input & Btn.Left ? 1 : 0);
}

/** Record fresh button presses into the jump and action buffers. */
export function readButtons(f: FighterState, pressed: number): void {
  if (pressed & Btn.Jump) f.jumpBuffer = JUMP_BUFFER_FRAMES;
  else if (f.jumpBuffer > 0) f.jumpBuffer--;

  const act = pressed & (Btn.Attack | Btn.Heavy | Btn.Dodge | Btn.Dash | Btn.Special);
  if (act) {
    f.actBuffer = act & -act; // lowest bit wins: Attack > Heavy > Dodge > Dash > Special
    f.actBufferTimer = ACTION_BUFFER_FRAMES;
  } else if (f.actBufferTimer > 0) {
    f.actBufferTimer--;
    if (f.actBufferTimer === 0) f.actBuffer = 0;
  }
}

export function controlFighter(f: FighterState, input: number, pressed: number, def: FighterDef, stage: StageDef): void {
  const dirX = inputDirX(input);
  if (f.ground >= 0) groundControl(f, input, pressed, dirX, def, stage);
  else airControl(f, input, pressed, dirX, def);
}

function groundControl(
  f: FighterState,
  input: number,
  pressed: number,
  dirX: number,
  def: FighterDef,
  stage: StageDef,
): void {
  const st = def.stats;
  if (f.action === Action.JumpSquat) {
    // Momentum carries through the squat into the jump.
    f.actionFrame++;
    if (f.actionFrame >= st.jumpSquat) launchJump(f, input, dirX, st);
    return;
  }
  if (f.action === Action.Landing) {
    f.actionFrame++;
    f.vx = approach(f.vx, 0, st.groundFriction);
    if (f.actionFrame < f.landLag) return;
    setAction(f, Action.Idle);
  }
  if (f.action === Action.Dash) {
    dashControl(f, input, pressed, dirX, def);
    return;
  }

  if (tryStartAction(f, input, pressed, def, true)) return;

  if (f.jumpBuffer > 0) {
    f.jumpBuffer = 0;
    setAction(f, Action.JumpSquat);
    return;
  }

  if (pressed & Btn.Down && surfaceOf(stage, f.ground).passThrough) {
    f.ground = -1;
    f.dropTimer = st.dropThroughFrames;
    f.vy = 0;
    f.hopOpen = 0;
    setAction(f, Action.Air);
    return;
  }

  if (dirX === 0) {
    if (f.action !== Action.Idle) setAction(f, Action.Idle);
    f.vx = approach(f.vx, 0, st.groundFriction);
    return;
  }

  if (dirX !== f.facing) {
    // Turning around: a running fighter skids into a run the other way.
    f.facing = dirX;
    setAction(f, f.action === Action.Run ? Action.Run : Action.Walk);
  } else if (f.action === Action.Walk) {
    f.actionFrame++;
    if (f.actionFrame >= st.runDelay) {
      setAction(f, Action.Run);
      if (f.vx * dirX < st.runSpeed) f.vx = dirX * st.runSpeed;
    }
  } else if (f.action === Action.Run) {
    f.actionFrame++;
  } else {
    setAction(f, Action.Walk);
  }

  const target = dirX * (f.action === Action.Run ? st.runSpeed : st.walkSpeed);
  let rate = st.groundAccel;
  if (f.vx * dirX < 0) rate = 2 * (st.groundAccel + st.groundFriction); // turning around
  else if (f.vx * dirX > target * dirX) rate = st.groundFriction; // over speed (e.g. run -> walk)
  f.vx = approach(f.vx, target, rate);
}

/**
 * Dash: speed decays from dashSpeed to runSpeed; can jump or act out of it,
 * and holding the other way turns it into a run that way.
 */
function dashControl(f: FighterState, input: number, pressed: number, dirX: number, def: FighterDef): void {
  const st = def.stats;
  f.actionFrame++;
  if (tryStartAction(f, input, pressed, def, true)) return;
  if (f.jumpBuffer > 0) {
    f.jumpBuffer = 0;
    setAction(f, Action.JumpSquat);
    return;
  }
  if (dirX === -f.facing) {
    f.facing = dirX;
    setAction(f, Action.Run);
    f.vx = approach(f.vx, dirX * st.runSpeed, 2 * (st.groundAccel + st.groundFriction));
    return;
  }
  if (f.actionFrame < st.dashFrames) {
    const speed = st.dashSpeed - idiv((st.dashSpeed - st.runSpeed) * f.actionFrame, st.dashFrames);
    f.vx = f.facing * speed;
    return;
  }
  f.vx = f.facing * st.runSpeed;
  setAction(f, dirX === f.facing ? Action.Run : Action.Idle);
}

/** A running jump keeps up to this much more than air speed (percent). */
const JUMP_CARRY_PERCENT = 150;

function launchJump(f: FighterState, input: number, dirX: number, st: FighterStats): void {
  const held = (input & Btn.Jump) !== 0;
  f.vy = -(held ? st.fullHopSpeed : st.shortHopSpeed);
  f.hopOpen = held ? 1 : 0;
  // Ground speed carries into the air. Holding the other way (or nothing,
  // from a standstill) jumps at no more than air speed.
  const carry = dirX !== 0 && f.vx * dirX > 0 ? idiv(st.airMaxSpeed * JUMP_CARRY_PERCENT, 100) : st.airMaxSpeed;
  f.vx = clamp(f.vx, -carry, carry);
  if (dirX !== 0 && f.vx * dirX < 0) f.vx = 0; // jumping back out of a run
  f.ground = -1;
  setAction(f, Action.Air);
}

function airControl(f: FighterState, input: number, pressed: number, dirX: number, def: FighterDef): void {
  const st = def.stats;
  if (f.action !== Action.Air) setAction(f, Action.Air);
  f.actionFrame++;
  if (f.dropTimer > 0) f.dropTimer--;

  // Releasing jump early in a full hop turns it into a short hop: clamp the
  // upward speed to where a short hop would be on this airborne frame.
  if (f.hopOpen) {
    if (!(input & Btn.Jump)) {
      const shortHopVy = -st.shortHopSpeed + (f.actionFrame - 1) * st.gravity;
      if (f.vy < shortHopVy) f.vy = shortHopVy;
      f.hopOpen = 0;
    } else if (f.actionFrame >= st.shortHopWindow) {
      f.hopOpen = 0;
    }
  }

  if (tryStartAction(f, input, pressed, def, false)) return;

  if (pressed & Btn.Jump && f.jumpsLeft > 0) {
    f.jumpsLeft--;
    f.jumpBuffer = 0;
    f.vy = -st.doubleJumpSpeed;
    f.fastFall = 0;
    f.hopOpen = 0;
    if (dirX !== 0) f.vx = dirX * st.airMaxSpeed;
  }

  airMotion(f, input, pressed, st, true, true);
}

/** With no direction held, air drift slows this many times faster than air friction alone. */
const AIR_BRAKE = 5;

/** Air drift, fast-fall and gravity for one frame. */
export function airMotion(
  f: FighterState,
  input: number,
  pressed: number,
  st: FighterStats,
  drift: boolean,
  gravity: boolean,
): void {
  if (f.dropTimer > 0 && f.action !== Action.Air) f.dropTimer--;
  if (drift) {
    // Pressing down after the apex fast-falls. Outside attacks (where down aims
    // a down air), so does down held through the apex.
    const heldThroughApex = input & Btn.Down && f.vy < st.gravity && f.action === Action.Air;
    if (f.vy >= 0 && (pressed & Btn.Down || heldThroughApex)) f.fastFall = 1;
    const dirX = inputDirX(input);
    const target = dirX * st.airMaxSpeed;
    // Past air speed (a running jump), holding that way only bleeds speed slowly.
    // Letting go of the direction brakes harder than plain air friction.
    if (dirX !== 0 && f.vx * dirX > st.airMaxSpeed) f.vx = approach(f.vx, target, 2 * st.airFriction);
    else if (dirX !== 0) f.vx = approach(f.vx, target, st.airAccel);
    else f.vx = approach(f.vx, 0, AIR_BRAKE * st.airFriction);
  } else {
    f.vx = approach(f.vx, 0, st.airFriction);
  }
  if (!gravity) return;
  if (f.fastFall) f.vy = st.fastFallSpeed;
  else f.vy = Math.min(f.vy + st.gravity, st.maxFallSpeed);
}
