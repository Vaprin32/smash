import { describe, expect, it } from 'vitest';
import { Action } from '../src/sim/actions';
import { isIntangible } from '../src/sim/combat';
import { FIGHTERS } from '../src/sim/fighters';
import { px } from '../src/sim/fixed';
import { Btn } from '../src/sim/input';
import { hangPosition } from '../src/sim/ledges';
import { MoveId } from '../src/sim/moves/types';
import { LEDGE_ACTIONABLE, LEDGE_CLIMB_FRAMES, LEDGE_MAX_HANG, LEDGE_REGRAB_COOLDOWN } from '../src/sim/rules';
import { ledgeOf, STAGES } from '../src/sim/stage';
import { createMatch, type MatchState } from '../src/sim/state';
import { step } from '../src/sim/step';

const stage = STAGES[0]!;
/** The main stage's right corner. */
const RIGHT = 1;
const right = ledgeOf(stage, RIGHT);

type InputFn = number | ((frame: number) => number);
const val = (f: InputFn, i: number) => (typeof f === 'number' ? f : f(i));

function run(s: MatchState, frames: number, p1: InputFn, p2: InputFn = 0): MatchState {
  for (let i = 0; i < frames; i++) s = step(s, [val(p1, i), val(p2, i)]);
  return s;
}

/** P1 (fighter `c`) in the air just off the right edge, a little above it, falling; P2 far away on the stage. */
function offEdge(c = 0, other = 1): MatchState {
  const s = createMatch({ seed: 1, stageId: 0, chars: [c, other], stocks: 3 });
  const f = s.fighters[0]!;
  f.x = right.x + px(20) + (FIGHTERS[c]!.stats.width >> 1);
  f.y = right.y - px(10) + FIGHTERS[c]!.stats.height;
  f.ground = -1;
  f.action = Action.Air;
  f.vy = px(2);
  f.jumpsLeft = 0;
  f.airDodgeUsed = 1;
  f.facing = 1; // facing away from the stage
  s.fighters[1]!.x = px(-200);
  return s;
}

/** P1 hanging from the right ledge, ready to act. */
function hanging(c = 0): MatchState {
  const s = run(offEdge(c), 30, 0);
  expect(s.fighters[0]!.action).toBe(Action.LedgeHang);
  return run(s, LEDGE_ACTIONABLE, 0);
}

describe('ledges', () => {
  it('every fighter grabs the ledge falling past it, turned toward the stage, with jumps and air dodge back', () => {
    FIGHTERS.forEach((def, c) => {
      const s = run(offEdge(c), 30, 0);
      const f = s.fighters[0]!;
      expect(f.action, def.name).toBe(Action.LedgeHang);
      expect(f.ledge).toBe(RIGHT);
      expect(f.facing).toBe(-1);
      expect(f.jumpsLeft).toBe(def.stats.airJumps);
      expect(f.airDodgeUsed).toBe(0);
      const p = hangPosition(def, right);
      expect([f.x, f.y]).toEqual([p.x, p.y]);
    });
  });

  it('holding down falls past the ledge instead', () => {
    const s = run(offEdge(), 30, Btn.Down);
    expect(s.fighters[0]!.action).not.toBe(Action.LedgeHang);
    expect(s.fighters[0]!.y).toBeGreaterThan(right.y + px(100));
  });

  it('a helpless fighter after an up special can still grab it', () => {
    const s = offEdge();
    s.fighters[0]!.action = Action.SpecialFall;
    expect(run(s, 30, 0).fighters[0]!.action).toBe(Action.LedgeHang);
  });

  it('the first grab is intangible for a while, a regrab without landing is not', () => {
    let s = run(offEdge(), 30, 0);
    expect(isIntangible(s.fighters[0]!, FIGHTERS[0]!.stats)).toBe(true);
    // Let go (down), fall, and grab again once the cooldown is over.
    s = run(s, LEDGE_ACTIONABLE, 0);
    s = run(s, 1, Btn.Down);
    expect(s.fighters[0]!.action).toBe(Action.Air);
    s = run(s, LEDGE_REGRAB_COOLDOWN - 2, 0);
    expect(s.fighters[0]!.action).toBe(Action.Air); // no regrab during the cooldown
    const f = s.fighters[0]!;
    f.x = right.x + px(20) + (FIGHTERS[0]!.stats.width >> 1);
    f.y = right.y - px(10) + FIGHTERS[0]!.stats.height;
    f.vy = px(2);
    f.invincible = 0;
    s = run(s, 10, 0);
    expect(s.fighters[0]!.action).toBe(Action.LedgeHang);
    expect(s.fighters[0]!.ledgeGrabs).toBe(2);
    expect(s.fighters[0]!.invincible).toBe(0);
  });

  it('up or toward the stage climbs up, intangible, and ends standing at the edge', () => {
    for (const press of [Btn.Up, Btn.Left]) {
      let s = run(hanging(), 1, press);
      expect(s.fighters[0]!.action).toBe(Action.LedgeClimb);
      expect(isIntangible(s.fighters[0]!, FIGHTERS[0]!.stats)).toBe(true);
      s = run(s, LEDGE_CLIMB_FRAMES, 0);
      const f = s.fighters[0]!;
      expect(f.action).toBe(Action.Idle);
      expect(f.ground).toBe(0);
      expect(f.y).toBe(right.y);
      expect(f.x).toBeLessThan(right.x);
      expect(f.ledge).toBe(-1);
    }
  });

  it('jump leaps up from the ledge and keeps the air jumps', () => {
    const s = run(hanging(), 1, Btn.Jump);
    const f = s.fighters[0]!;
    expect(f.action).toBe(Action.Air);
    expect(f.vy).toBeLessThan(0);
    expect(f.jumpsLeft).toBe(FIGHTERS[0]!.stats.airJumps);
    const later = run(s, 70, Btn.Left);
    expect(later.fighters[0]!.ground).toBe(0); // lands on the stage
  });

  it('attack climbs up into the ledge attack, which hits someone at the edge', () => {
    const s = hanging();
    s.fighters[1]!.x = right.x - px(60);
    let hit = false;
    let n = run(s, 1, Btn.Attack);
    expect(n.fighters[0]!.action).toBe(Action.LedgeClimbAttack);
    for (let i = 0; i < LEDGE_CLIMB_FRAMES + 20; i++) {
      n = step(n, [0, 0]);
      if (n.fighters[0]!.move === MoveId.LedgeAttack) expect(n.fighters[0]!.facing).toBe(-1);
      if (n.fighters[1]!.action === Action.Hitstun) hit = true;
    }
    expect(hit).toBe(true);
  });

  it('shield rolls in onto the stage', () => {
    let s = run(hanging(), 1, Btn.Dodge);
    expect(s.fighters[0]!.action).toBe(Action.LedgeClimbRoll);
    s = run(s, LEDGE_CLIMB_FRAMES, 0);
    expect(s.fighters[0]!.action).toBe(Action.Roll);
    s = run(s, 30, 0);
    expect(s.fighters[0]!.x).toBeLessThan(right.x - px(60));
    expect(s.fighters[0]!.ground).toBe(0);
  });

  it('down or away lets go', () => {
    for (const press of [Btn.Down, Btn.Right]) {
      const s = run(hanging(), 1, press);
      expect(s.fighters[0]!.action).toBe(Action.Air);
      expect(s.fighters[0]!.ledgeCooldown).toBeGreaterThan(0);
    }
  });

  it('hanging too long lets go by itself', () => {
    const s = run(hanging(), LEDGE_MAX_HANG, 0);
    expect(s.fighters[0]!.action).not.toBe(Action.LedgeHang);
  });

  it('grabbing a ledge someone hangs from knocks them off it', () => {
    let s = hanging();
    const b = s.fighters[1]!;
    b.x = right.x + px(20) + (FIGHTERS[1]!.stats.width >> 1);
    b.y = right.y - px(10) + FIGHTERS[1]!.stats.height;
    b.ground = -1;
    b.action = Action.Air;
    b.vy = px(2);
    for (let i = 0; i < 20 && s.fighters[1]!.action !== Action.LedgeHang; i++) s = step(s, [0, 0]);
    expect(s.fighters[1]!.action).toBe(Action.LedgeHang);
    expect(s.fighters[0]!.action).toBe(Action.Air);
    expect(s.fighters[0]!.vx).toBeGreaterThan(0); // pushed away from the stage
    expect(s.fighters[0]!.ledgeCooldown).toBeGreaterThan(0);
  });

  it('can be hit off the ledge once the intangibility wears off', () => {
    let s = hanging();
    s = run(s, 60, 0);
    const a = s.fighters[1]!;
    a.x = right.x - px(20);
    a.facing = 1;
    s = run(s, 20, 0, (i) => (i === 0 ? Btn.Down | Btn.Attack : 0)); // down tilt at the edge
    expect([Action.Hitstun, Action.Air]).toContain(s.fighters[0]!.action);
    expect(s.fighters[0]!.ledge).toBe(-1);
  });
});
