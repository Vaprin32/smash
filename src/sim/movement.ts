// Player control: turns input into actions and velocity changes. Position
// integration and collision happen afterwards in physics.ts.

import { Action, setAction } from './actions';
import { approach, clamp } from './fixed';
import type { FighterStats } from './fighters/types';
import { Btn } from './input';
import { JUMP_BUFFER_FRAMES } from './rules';
import { surfaceOf, type StageDef } from './stage';
import type { FighterState } from './state';

export function controlFighter(f: FighterState, input: number, st: FighterStats, stage: StageDef): void {
  const pressed = input & ~f.prevInput;
  const dirX = (input & Btn.Right ? 1 : 0) - (input & Btn.Left ? 1 : 0);

  if (pressed & Btn.Jump) f.jumpBuffer = JUMP_BUFFER_FRAMES;
  else if (f.jumpBuffer > 0) f.jumpBuffer--;

  if (f.ground >= 0) groundControl(f, input, pressed, dirX, st, stage);
  else airControl(f, input, pressed, dirX, st);
}

function groundControl(
  f: FighterState,
  input: number,
  pressed: number,
  dirX: number,
  st: FighterStats,
  stage: StageDef,
): void {
  if (f.action === Action.JumpSquat) {
    f.actionFrame++;
    f.vx = approach(f.vx, 0, st.groundFriction);
    if (f.actionFrame >= st.jumpSquat) launchJump(f, input, st);
    return;
  }
  if (f.action === Action.Landing) {
    f.actionFrame++;
    f.vx = approach(f.vx, 0, st.groundFriction);
    if (f.actionFrame < st.landingLag) return;
    setAction(f, Action.Idle);
  }

  if (f.jumpBuffer > 0) {
    f.jumpBuffer = 0;
    setAction(f, Action.JumpSquat);
    f.vx = approach(f.vx, 0, st.groundFriction);
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
    f.facing = dirX;
    setAction(f, Action.Walk);
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
  if (f.vx * dirX < 0) rate = st.groundAccel + st.groundFriction; // turning around
  else if (f.vx * dirX > target * dirX) rate = st.groundFriction; // over speed (e.g. run -> walk)
  f.vx = approach(f.vx, target, rate);
}

function launchJump(f: FighterState, input: number, st: FighterStats): void {
  const held = (input & Btn.Jump) !== 0;
  f.vy = -(held ? st.fullHopSpeed : st.shortHopSpeed);
  f.hopOpen = held ? 1 : 0;
  f.vx = clamp(f.vx, -st.airMaxSpeed, st.airMaxSpeed);
  f.ground = -1;
  setAction(f, Action.Air);
}

function airControl(f: FighterState, input: number, pressed: number, dirX: number, st: FighterStats): void {
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

  if (pressed & Btn.Jump && f.jumpsLeft > 0) {
    f.jumpsLeft--;
    f.jumpBuffer = 0;
    f.vy = -st.doubleJumpSpeed;
    f.fastFall = 0;
    f.hopOpen = 0;
    if (dirX !== 0) f.vx = dirX * st.airMaxSpeed;
  }

  if (pressed & Btn.Down && f.vy >= 0) f.fastFall = 1;

  if (dirX !== 0) f.vx = approach(f.vx, dirX * st.airMaxSpeed, st.airAccel);
  else f.vx = approach(f.vx, 0, st.airFriction);

  if (f.fastFall) f.vy = st.fastFallSpeed;
  else f.vy = Math.min(f.vy + st.gravity, st.maxFallSpeed);
}
