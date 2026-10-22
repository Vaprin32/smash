import { Action, setAction } from './actions';
import { FIGHTERS } from './fighters';
import type { FighterStats } from './fighters/types';
import type { InputBits } from './input';
import { controlFighter } from './movement';
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
  s.frame++;
  return s;
}

function updateFighter(f: FighterState, slot: number, input: number, stage: StageDef): void {
  const st = FIGHTERS[f.charId]!.stats;

  if (f.action === Action.Out) return;
  if (f.action === Action.KO) {
    f.actionFrame++;
    if (f.actionFrame >= KO_RESPAWN_DELAY) respawn(f, slot, st, stage);
    return;
  }
  if (f.action === Action.Respawn) {
    f.actionFrame++;
    const pressed = input & ~f.prevInput;
    if (pressed === 0 && f.actionFrame < RESPAWN_MAX_WAIT) return;
    setAction(f, Action.Air);
  }

  if (f.invincible > 0) f.invincible--;
  controlFighter(f, input, st, stage);
  moveFighter(f, st, stage);

  if (outsideBlastZone(f, stage)) {
    f.stocks--;
    f.vx = 0;
    f.vy = 0;
    f.ground = -1;
    setAction(f, f.stocks > 0 ? Action.KO : Action.Out);
  }
}

function respawn(f: FighterState, slot: number, st: FighterStats, stage: StageDef): void {
  const p = stage.respawns[slot % stage.respawns.length]!;
  f.x = p.x;
  f.y = p.y;
  f.vx = 0;
  f.vy = 0;
  f.ground = -1;
  f.damage = 0;
  f.jumpsLeft = st.airJumps;
  f.fastFall = 0;
  f.dropTimer = 0;
  f.hopOpen = 0;
  f.jumpBuffer = 0;
  f.hitstun = 0;
  f.hitlag = 0;
  f.invincible = RESPAWN_INVINCIBILITY;
  setAction(f, Action.Respawn);
}
