// Ultimate-style shield: hold to block, it drains while held and from hits,
// breaks at zero. Out of shield you can jump, up special, roll or spot dodge.
// Letting go has SHIELD_DROP_FRAMES of lag, the first PARRY_WINDOW of which parry.

import { Action, setAction } from './actions';
import { startRoll, tryStartAction } from './attacks';
import { approach } from './fixed';
import type { FighterDef } from './fighters/types';
import { Btn } from './input';
import { airMotion, inputDirX } from './movement';
import { SHIELD_BREAK_POP, SHIELD_BREAK_RESET, SHIELD_BREAK_STUN, SHIELD_DECAY, SHIELD_DROP_FRAMES } from './rules';
import type { FighterState } from './state';

export function isShieldAction(action: number): boolean {
  return action === Action.Shield || action === Action.ShieldStun;
}

export function updateShield(f: FighterState, input: number, pressed: number, def: FighterDef): void {
  const st = def.stats;
  f.actionFrame++;
  f.vx = approach(f.vx, 0, st.groundFriction);

  switch (f.action) {
    case Action.Shield: {
      f.shieldHp -= SHIELD_DECAY;
      if (f.shieldHp <= 0) {
        breakShield(f);
        return;
      }
      if (f.jumpBuffer > 0) {
        f.jumpBuffer = 0;
        setAction(f, Action.JumpSquat);
        return;
      }
      // Out of shield: J grabs, K+up up smash, I+up up special. Other presses wait.
      if (f.actBufferTimer > 0) {
        const b = f.actBuffer;
        if (b === Btn.Attack || ((b === Btn.Heavy || b === Btn.Special) && input & Btn.Up)) {
          tryStartAction(f, input, pressed, def, true);
          return;
        }
      }
      const rollDir = inputDirX(pressed);
      if (rollDir !== 0) {
        startRoll(f, rollDir, def);
        return;
      }
      if (pressed & Btn.Down) {
        setAction(f, Action.SpotDodge);
        return;
      }
      if (!(input & Btn.Dodge)) setAction(f, Action.ShieldDrop);
      return;
    }
    case Action.ShieldStun:
      if (f.hitstun > 0) f.hitstun--;
      if (f.hitstun === 0) setAction(f, input & Btn.Dodge ? Action.Shield : Action.ShieldDrop);
      return;
    case Action.ShieldDrop:
      if (f.actionFrame >= SHIELD_DROP_FRAMES) setAction(f, Action.Idle);
      return;
  }
}

export function breakShield(f: FighterState): void {
  setAction(f, Action.ShieldBreak);
  f.shieldHp = SHIELD_BREAK_RESET;
  f.hitstun = SHIELD_BREAK_STUN;
  f.vx = 0;
  f.vy = -SHIELD_BREAK_POP;
  f.ground = -1;
}

/** Popped into the air, then dizzy on the ground until the stun runs out. */
export function updateShieldBreak(f: FighterState, def: FighterDef): void {
  f.actionFrame++;
  if (f.ground < 0) {
    airMotion(f, 0, 0, def.stats, false, true);
    return;
  }
  f.vx = approach(f.vx, 0, def.stats.groundFriction);
  if (f.hitstun > 0) f.hitstun--;
  if (f.hitstun === 0) setAction(f, Action.Idle);
}
