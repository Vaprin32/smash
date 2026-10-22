import { Action, setAction } from './actions';
import { updateAttack, updateDodge, updateSpecialFall } from './attacks';
import { resolveHits, updateHitstun } from './combat';
import { FIGHTERS } from './fighters';
import type { FighterDef } from './fighters/types';
import type { InputBits } from './input';
import { controlFighter, readButtons } from './movement';
import { moveFighter, outsideBlastZone } from './physics';
import { KO_RESPAWN_DELAY, RESPAWN_INVINCIBILITY, RESPAWN_MAX_WAIT } from './rules';
import { STAGES, type StageDef } from './stage';
import { cloneState, type FighterState, type MatchState } from './state';

/**
 * Advance one frame. Pure: returns a new state and never mutates `prev`.
 * `inputs[i]` is player i's input bitmask for this frame.
 */
export function step(prev: MatchState, inputs: readonly InputBits[]): MatchState {
  const s = cloneState(prev);
  const stage = STAGES[s.stageId]!;
  for (let i = 0; i < s.fighters.length; i++) {
    const f = s.fighters[i]!;
    const input = (inputs[i] ?? 0) | 0;
    updateFighter(f, i, input, stage);
    f.prevInput = input;
  }
  resolveHits(s);
  s.frame++;
  return s;
}

function updateFighter(f: FighterState, slot: number, input: number, stage: StageDef): void {
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
  readButtons(f, pressed);

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
    default:
      controlFighter(f, input, pressed, def, stage);
      // An attack or dodge started this frame runs its first frame now.
      if (f.action === Action.Attack) updateAttack(f, input, pressed, def);
      else if (f.action === Action.Roll || f.action === Action.SpotDodge || f.action === Action.AirDodge) {
        updateDodge(f, input, pressed, def);
      }
  }

  moveFighter(f, def, stage);

  if (outsideBlastZone(f, stage)) {
    f.stocks--;
    f.vx = 0;
    f.vy = 0;
    f.ground = -1;
    f.hitstun = 0;
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
  f.sideSpecialUsed = 0;
  f.hitstun = 0;
  f.hitlag = 0;
  f.invincible = RESPAWN_INVINCIBILITY;
  setAction(f, Action.Respawn);
}
