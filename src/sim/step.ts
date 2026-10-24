import { Action, isLedgeAction, setAction } from './actions';
import { updateAttack, updateDodge, updateHeld, updateHolding, updateSpecialFall } from './attacks';
import { resolveHits, updateHitstun } from './combat';
import { FIGHTERS } from './fighters';
import type { FighterDef } from './fighters/types';
import type { InputBits } from './input';
import { controlFighter, readButtons } from './movement';
import { moveFighter, outsideBlastZone } from './physics';
import { SimEvent } from './events';
import {
  KO_RESPAWN_DELAY,
  RESPAWN_INVINCIBILITY,
  RESPAWN_MAX_WAIT,
  SHIELD_MAX,
  SHIELD_REGEN,
} from './rules';
import { isShieldAction, updateShield, updateShieldBreak } from './shield';
import { updateGrabs } from './grabs';
import { grabLedges, updateLedgeClimb, updateLedgeHang } from './ledges';
import { updateProjectiles } from './projectiles';
import { STAGES, type StageDef } from './stage';
import { cloneState, type FighterState, type MatchState } from './state';

/**
 * Advance one frame. Pure: returns a new state and never mutates `prev`.
 * `inputs[i]` is player i's input bitmask for this frame.
 */
export function step(prev: MatchState, inputs: readonly InputBits[]): MatchState {
  const s = cloneState(prev);
  const stage = STAGES[s.stageId]!;
  for (const f of s.fighters) f.event = SimEvent.None;
  for (let i = 0; i < s.fighters.length; i++) {
    const f = s.fighters[i]!;
    const input = (inputs[i] ?? 0) | 0;
    updateFighter(f, i, input, stage, s.frame + 1);
    f.prevInput = input;
  }
  grabLedges(s, stage, inputs);
  updateProjectiles(s, stage);
  updateGrabs(s);
  resolveHits(s);
  s.frame++;
  return s;
}

/** `frame` is the frame this step produces (where moving platforms are). */
function updateFighter(f: FighterState, slot: number, input: number, stage: StageDef, frame: number): void {
  const def = FIGHTERS[f.charId]!;
  const pressed = input & ~f.prevInput;

  if (f.action === Action.Out) return;
  if (f.action === Action.KO) {
    f.actionFrame++;
    if (f.actionFrame >= KO_RESPAWN_DELAY) respawn(f, slot, def, stage);
    return;
  }
  if (f.action === Action.Respawn) {
    f.actionFrame++;
    if (pressed === 0 && f.actionFrame < RESPAWN_MAX_WAIT) return;
    setAction(f, Action.Air);
  }
  if (f.hitlag > 0) {
    f.hitlag--; // frozen: no movement, timers or action progress
    return;
  }

  if (f.invincible > 0) f.invincible--;
  if (f.dashCooldown > 0) f.dashCooldown--;
  if (f.ledgeCooldown > 0) f.ledgeCooldown--;
  if (!isLedgeAction(f.action)) f.ledge = -1; // knocked off it
  if (!isShieldAction(f.action)) f.shieldHp = Math.min(SHIELD_MAX, f.shieldHp + SHIELD_REGEN);
  readButtons(f, pressed);

  if (f.action === Action.Held) {
    updateHeld(f, pressed); // positioned by the holder in updateGrabs
    return;
  }

  switch (f.action) {
    case Action.Hitstun:
      updateHitstun(f, def.stats);
      break;
    case Action.Attack:
      updateAttack(f, input, pressed, def);
      break;
    case Action.Roll:
    case Action.SpotDodge:
    case Action.AirDodge:
      updateDodge(f, input, pressed, def);
      break;
    case Action.SpecialFall:
      updateSpecialFall(f, input, pressed, def);
      break;
    case Action.Shield:
    case Action.ShieldStun:
    case Action.ShieldDrop:
      updateShield(f, input, pressed, def);
      break;
    case Action.ShieldBreak:
      updateShieldBreak(f, def);
      break;
    case Action.Holding:
      updateHolding(f, input, def);
      break;
    case Action.LedgeHang:
      updateLedgeHang(f, pressed, def, stage);
      break;
    case Action.LedgeClimb:
    case Action.LedgeClimbAttack:
    case Action.LedgeClimbRoll:
      updateLedgeClimb(f, def, stage);
      break;
    default:
      controlFighter(f, input, pressed, def, stage);
  }
  // An attack or dodge started this frame (from free movement or out of
  // shield) runs its first frame now. Their updates always advance actionFrame.
  if (f.actionFrame === 0) {
    if (f.action === Action.Attack) updateAttack(f, input, pressed, def);
    else if (f.action === Action.Roll || f.action === Action.SpotDodge || f.action === Action.AirDodge) {
      updateDodge(f, input, pressed, def);
    }
  }

  if (isLedgeAction(f.action)) return; // placed by the ledge, not by physics
  moveFighter(f, def, stage, input, frame);
  if (f.ground >= 0 && isStanding(f.action)) f.lastHitBy = -1;

  if (outsideBlastZone(f, stage)) {
    f.stocks--;
    f.vx = 0;
    f.vy = 0;
    f.ground = -1;
    f.hitstun = 0;
    f.event = SimEvent.KO;
    setAction(f, f.stocks > 0 ? Action.KO : Action.Out);
  }
}

function respawn(f: FighterState, slot: number, def: FighterDef, stage: StageDef): void {
  const p = stage.respawns[slot % stage.respawns.length]!;
  f.x = p.x;
  f.y = p.y;
  f.vx = 0;
  f.vy = 0;
  f.ground = -1;
  f.damage = 0;
  f.jumpsLeft = def.stats.airJumps;
  f.fastFall = 0;
  f.dropTimer = 0;
  f.hopOpen = 0;
  f.jumpBuffer = 0;
  f.actBuffer = 0;
  f.actBufferTimer = 0;
  f.airDodgeUsed = 0;
  f.shieldHp = SHIELD_MAX;
  f.dashCooldown = 0;
  f.oncePerAirUsed = 0;
  f.charge = 0;
  f.grabTarget = -1;
  f.heldBy = -1;
  f.grabTimer = 0;
  f.hitstun = 0;
  f.hitlag = 0;
  f.invincible = RESPAWN_INVINCIBILITY;
  f.lastHitBy = -1;
  f.ledge = -1;
  f.ledgeCooldown = 0;
  f.ledgeGrabs = 0;
  setAction(f, Action.Respawn);
}

/** Back on their feet and in control (the end of a combo, for KO credit). */
function isStanding(action: number): boolean {
  return action === Action.Idle || action === Action.Walk || action === Action.Run || action === Action.Dash;
}
