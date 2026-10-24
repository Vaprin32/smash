import { describe, expect, it } from 'vitest';
import { Action } from '../src/sim/actions';
import { FIGHTERS } from '../src/sim/fighters';
import { px } from '../src/sim/fixed';
import { Btn } from '../src/sim/input';
import { KO_RESPAWN_DELAY, RESPAWN_INVINCIBILITY } from '../src/sim/rules';
import { platformGroundIndex, STAGES } from '../src/sim/stage';
import { createMatch, FIGHTER_FIELDS, hashState, type MatchState } from '../src/sim/state';
import { step } from '../src/sim/step';

const stage = STAGES[0]!;
const st = FIGHTERS[0]!.stats;

function newMatch(): MatchState {
  return createMatch({ seed: 7, stageId: 0, chars: [0], stocks: 3 });
}

type InputFn = number | ((frame: number) => number);

/** Run `frames` frames for player 1; calls `each` after every frame. */
function run(s: MatchState, frames: number, input: InputFn, each?: (s: MatchState) => void): MatchState {
  for (let i = 0; i < frames; i++) {
    s = step(s, [typeof input === 'number' ? input : input(i)]);
    each?.(s);
  }
  return s;
}

/** Jump from stage center (below the high platform, out of full-hop reach) and track the apex. */
function apexOf(s: MatchState, input: InputFn, frames = 90): { apex: number; end: MatchState } {
  s.fighters[0]!.x = 0;
  let apex = s.fighters[0]!.y;
  const end = run(s, frames, input, (n) => (apex = Math.min(apex, n.fighters[0]!.y)));
  return { apex, end };
}

describe('movement', () => {
  it('starts grounded and idle on the main stage', () => {
    const f = newMatch().fighters[0]!;
    expect(f.ground).toBe(0);
    expect(f.action).toBe(Action.Idle);
  });

  it('step is pure', () => {
    const s = newMatch();
    const before = hashState(s);
    step(s, [Btn.Right | Btn.Jump]);
    expect(hashState(s)).toBe(before);
  });

  it('walks, then runs after holding a direction', () => {
    let s = run(newMatch(), 3, Btn.Right);
    expect(s.fighters[0]!.action).toBe(Action.Walk);
    s = run(s, st.runDelay + 2, Btn.Right);
    expect(s.fighters[0]!.action).toBe(Action.Run);
    expect(s.fighters[0]!.vx).toBe(st.runSpeed);
  });

  it('friction brings the fighter to a stop', () => {
    let s = run(newMatch(), 20, Btn.Right);
    s = run(s, 30, 0);
    expect(s.fighters[0]!.vx).toBe(0);
    expect(s.fighters[0]!.action).toBe(Action.Idle);
  });

  it('turning around faces the other way immediately', () => {
    let s = run(newMatch(), 2, Btn.Right);
    s = run(s, 1, Btn.Left);
    expect(s.fighters[0]!.facing).toBe(-1);
    expect(s.fighters[0]!.action).toBe(Action.Walk);
  });

  it('turning around out of a run keeps running, and gets up to speed the other way quickly', () => {
    let s = run(newMatch(), 20, Btn.Right);
    expect(s.fighters[0]!.action).toBe(Action.Run);
    s = run(s, 1, Btn.Left);
    expect(s.fighters[0]!.facing).toBe(-1);
    expect(s.fighters[0]!.action).toBe(Action.Run);
    s = run(s, 8, Btn.Left);
    expect(s.fighters[0]!.vx).toBe(-st.runSpeed);
  });

  it('reaches full run speed within a few frames of holding a direction', () => {
    const s = run(newMatch(), st.runDelay + 1, Btn.Right);
    expect(s.fighters[0]!.vx).toBe(st.runSpeed);
  });

  it('holding the other way during a dash turns it into a run that way', () => {
    let s = run(newMatch(), 1, Btn.Right | Btn.Dash);
    expect(s.fighters[0]!.action).toBe(Action.Dash);
    s = run(s, 3, Btn.Right);
    s = run(s, 1, Btn.Left);
    expect(s.fighters[0]!.action).toBe(Action.Run);
    expect(s.fighters[0]!.facing).toBe(-1);
  });

  it('a running jump keeps more speed than a standing one', () => {
    let run1 = run(newMatch(), 20, Btn.Right);
    run1 = run(run1, st.jumpSquat + 2, Btn.Right | Btn.Jump);
    expect(run1.fighters[0]!.ground).toBe(-1);
    expect(run1.fighters[0]!.vx).toBeGreaterThan(st.airMaxSpeed);
  });

  it('letting go of the direction in the air stops the drift quickly', () => {
    let s = run(newMatch(), st.jumpSquat + 12, (i) => Btn.Jump | (i > st.jumpSquat ? Btn.Right : 0));
    expect(s.fighters[0]!.vx).toBe(st.airMaxSpeed);
    s = run(s, 14, Btn.Jump);
    expect(s.fighters[0]!.vx).toBe(0);
  });

  it('down held through the apex fast-falls', () => {
    const s0 = newMatch();
    s0.fighters[0]!.x = 0;
    let s = run(s0, 8, Btn.Jump);
    s = run(s, 24, Btn.Down);
    expect(s.fighters[0]!.fastFall).toBe(1);
  });

  it('short hop (tap) is lower than full hop (hold), and both land', () => {
    const tap = apexOf(newMatch(), (i) => (i === 0 ? Btn.Jump : 0));
    const hold = apexOf(newMatch(), (i) => (i < 30 ? Btn.Jump : 0));
    expect(tap.apex).toBeLessThan(0);
    expect(hold.apex).toBeLessThan(tap.apex - px(40));
    expect(tap.end.fighters[0]!.ground).toBe(0);
    expect(hold.end.fighters[0]!.ground).toBe(0);
  });

  it('releasing within the short-hop window right after takeoff still gives a short hop', () => {
    const tap = apexOf(newMatch(), (i) => (i === 0 ? Btn.Jump : 0));
    const late = apexOf(newMatch(), (i) => (i < st.jumpSquat + st.shortHopWindow - 1 ? Btn.Jump : 0));
    expect(Math.abs(late.apex - tap.apex)).toBeLessThan(px(16));
  });

  it('has exactly one double jump', () => {
    let s = run(newMatch(), 25, (i) => (i < 20 ? Btn.Jump : 0)); // full hop, near apex
    expect(s.fighters[0]!.jumpsLeft).toBe(1);
    s = run(s, 1, Btn.Jump);
    expect(s.fighters[0]!.jumpsLeft).toBe(0);
    expect(s.fighters[0]!.vy).toBeLessThan(0);
    s = run(s, 30, 0); // falling now
    const vyBefore = s.fighters[0]!.vy;
    s = run(s, 1, Btn.Jump);
    expect(s.fighters[0]!.vy).toBeGreaterThanOrEqual(vyBefore);
  });

  it('fast-falls only after the apex', () => {
    const s0 = newMatch();
    s0.fighters[0]!.x = 0;
    let s = run(s0, 8, Btn.Jump); // full hop
    s = run(s, 1, Btn.Jump | Btn.Down); // still rising: ignored
    expect(s.fighters[0]!.fastFall).toBe(0);
    s = run(s, 26, Btn.Jump); // past the apex
    expect(s.fighters[0]!.vy).toBeGreaterThanOrEqual(0);
    s = run(s, 1, Btn.Down);
    expect(s.fighters[0]!.fastFall).toBe(1);
    expect(s.fighters[0]!.vy).toBe(st.fastFallSpeed);
  });

  it('caps fall speed', () => {
    const s = newMatch();
    const f = s.fighters[0]!;
    f.ground = -1;
    f.action = Action.Air;
    f.y = px(-600);
    let maxVy = 0;
    run(s, 60, 0, (n) => (maxVy = Math.max(maxVy, n.fighters[0]!.vy)));
    expect(maxVy).toBe(st.maxFallSpeed);
  });

  it('drops through a pass-through platform with down', () => {
    const s = newMatch();
    const p = stage.platforms[0]!;
    const f = s.fighters[0]!;
    f.x = (p.left + p.right) >> 1;
    f.y = p.top;
    f.ground = platformGroundIndex(stage, 0);
    let n = run(s, 5, 0);
    expect(n.fighters[0]!.ground).toBe(platformGroundIndex(stage, 0));
    n = run(n, 1, Btn.Down);
    n = run(n, 40, 0);
    expect(n.fighters[0]!.y).toBeGreaterThan(p.top);
    expect(n.fighters[0]!.ground).toBe(0);
  });

  it('jumps up through a platform and lands on top of it', () => {
    const s = newMatch();
    const p = stage.platforms[0]!;
    s.fighters[0]!.x = (p.left + p.right) >> 1;
    const n = run(s, 80, (i) => (i < 30 ? Btn.Jump : 0));
    expect(n.fighters[0]!.ground).toBe(platformGroundIndex(stage, 0));
    expect(n.fighters[0]!.y).toBe(p.top);
  });

  it('bonks its head on the underside of the solid stage', () => {
    const s = newMatch();
    const b = stage.blocks[0]!;
    const f = s.fighters[0]!;
    f.ground = -1;
    f.action = Action.Air;
    f.y = b.bottom + st.height + px(20);
    f.vy = -px(12);
    let minY = f.y;
    run(s, 10, 0, (n) => (minY = Math.min(minY, n.fighters[0]!.y)));
    expect(minY).toBeGreaterThanOrEqual(b.bottom + st.height);
  });

  it('walking off the edge into the bottom blast zone costs a stock, then respawns invincible', () => {
    let koFrame = -1;
    const walkOff = (i: number) => (i < 120 ? Btn.Right : 0);
    const s = run(newMatch(), 400, walkOff, (n) => {
      if (koFrame < 0 && n.fighters[0]!.action === Action.KO) koFrame = n.frame;
    });
    expect(koFrame).toBeGreaterThan(0);
    const f = s.fighters[0]!;
    expect(f.stocks).toBe(2);
    expect(f.action).not.toBe(Action.KO);

    // Respawn floats until input, then counts down invincibility.
    let r = newMatch();
    r = run(r, koFrame + KO_RESPAWN_DELAY, walkOff);
    expect(r.fighters[0]!.action).toBe(Action.Respawn);
    expect(r.fighters[0]!.x).toBe(stage.respawns[0]!.x);
    r = run(r, 10, 0);
    expect(r.fighters[0]!.action).toBe(Action.Respawn);
    r = run(r, 1, Btn.Left);
    expect(r.fighters[0]!.action).toBe(Action.Air);
    expect(r.fighters[0]!.invincible).toBe(RESPAWN_INVINCIBILITY - 1);
  });

  it('runs out of stocks after three KOs', () => {
    let s = newMatch();
    for (let i = 0; i < 1200 && s.fighters[0]!.action !== Action.Out; i++) {
      // Walk right off the stage whenever possible.
      s = step(s, [Btn.Right]);
    }
    expect(s.fighters[0]!.action).toBe(Action.Out);
    expect(s.fighters[0]!.stocks).toBe(0);
  });
});

describe('determinism smoke test', () => {
  function randomRun(frames: number): { hashes: number[]; end: MatchState } {
    let rng = 0x1234567;
    let s = createMatch({ seed: 99, stageId: 0, chars: [0, 0], stocks: 3 });
    let a = 0, b = 0;
    const hashes: number[] = [];
    for (let i = 0; i < frames; i++) {
      rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5;
      if ((rng & 7) === 0) a = (rng >>> 8) & 0xff;
      if (((rng >>> 3) & 7) === 0) b = (rng >>> 16) & 0xff;
      s = step(s, [a, b]);
      hashes.push(hashState(s));
    }
    return { hashes, end: s };
  }

  it('same inputs give identical hashes every frame, and state stays integer', () => {
    const r1 = randomRun(3000);
    const r2 = randomRun(3000);
    expect(r1.hashes).toEqual(r2.hashes);
    for (const f of r1.end.fighters) {
      for (const k of FIGHTER_FIELDS) expect(Number.isInteger(f[k]), k).toBe(true);
    }
  });
});
