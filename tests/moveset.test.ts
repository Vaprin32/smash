import { describe, expect, it } from 'vitest';
import { Action } from '../src/sim/actions';
import { SimEvent } from '../src/sim/events';
import { FIGHTERS } from '../src/sim/fighters';
import { px } from '../src/sim/fixed';
import { Btn } from '../src/sim/input';
import { MoveId } from '../src/sim/moves/types';
import { GRAB_HOLD_BASE, MAX_SMASH_CHARGE } from '../src/sim/rules';
import { createMatch, type FighterState, type MatchState } from '../src/sim/state';
import { step } from '../src/sim/step';

const wisp = FIGHTERS[0]!;

/** P1 at -gap/2 facing right, P2 (dummy) at +gap/2 facing left, both grounded. */
function duel(gap = 40, dummyDamage = 0): MatchState {
  const s = createMatch({ seed: 1, stageId: 0, chars: [0, 0], stocks: 3 });
  const [a, b] = s.fighters as [FighterState, FighterState];
  a.x = px(-gap / 2);
  a.facing = 1;
  b.x = px(gap / 2);
  b.facing = -1;
  b.damage = dummyDamage;
  return s;
}

type InputFn = number | ((frame: number) => number);
const val = (f: InputFn, i: number) => (typeof f === 'number' ? f : f(i));
function run(s: MatchState, frames: number, p1: InputFn, p2: InputFn = 0, each?: (s: MatchState) => void) {
  for (let i = 0; i < frames; i++) {
    s = step(s, [val(p1, i), val(p2, i)]);
    each?.(s);
  }
  return s;
}
const tap = (bits: number) => (i: number) => (i === 0 ? bits : 0);

/** Put P1 in the air at the apex of a jump, away from the dummy and platforms. */
function airborne(): MatchState {
  const s = duel(400);
  s.fighters[0]!.x = 0;
  return run(s, 8, Btn.Jump);
}

function moveAfter(s: MatchState, input: number): number {
  const n = run(s, 1, input);
  return n.fighters[0]!.action === Action.Attack ? n.fighters[0]!.move : -1;
}

describe('input → move table (Smash Ultimate layout)', () => {
  const ground: [string, number, number][] = [
    ['J', Btn.Attack, MoveId.Jab1],
    ['J + side', Btn.Attack | Btn.Right, MoveId.FTilt],
    ['J + up', Btn.Attack | Btn.Up, MoveId.UTilt],
    ['J + down', Btn.Attack | Btn.Down, MoveId.DTilt],
    ['K', Btn.Heavy, MoveId.FSmash],
    ['K + side', Btn.Heavy | Btn.Left, MoveId.FSmash],
    ['K + up', Btn.Heavy | Btn.Up, MoveId.USmash],
    ['K + down', Btn.Heavy | Btn.Down, MoveId.DSmash],
    ['I', Btn.Special, MoveId.NSpecial],
    ['I + side', Btn.Special | Btn.Right, MoveId.SideSpecial],
    ['I + up', Btn.Special | Btn.Up, MoveId.UpSpecial],
    ['I + down', Btn.Special | Btn.Down, MoveId.DownSpecial],
    ['shield + J', Btn.Dodge | Btn.Attack, MoveId.Grab],
  ];
  for (const [name, input, move] of ground) {
    it(`ground ${name}`, () => expect(moveAfter(duel(300), input)).toBe(move));
  }

  const air: [string, number, number][] = [
    ['J', Btn.Attack, MoveId.NAir],
    ['J + forward', Btn.Attack | Btn.Right, MoveId.FAir],
    ['J + back', Btn.Attack | Btn.Left, MoveId.BAir],
    ['J + up', Btn.Attack | Btn.Up, MoveId.UAir],
    ['J + down', Btn.Attack | Btn.Down, MoveId.DAir],
    ['K', Btn.Heavy, MoveId.NSpecial],
    ['K + up', Btn.Heavy | Btn.Up, MoveId.UpSpecial],
    ['K + down', Btn.Heavy | Btn.Down, MoveId.DownSpecial],
    ['K + side', Btn.Heavy | Btn.Right, MoveId.SideSpecial],
    ['I + up', Btn.Special | Btn.Up, MoveId.UpSpecial],
  ];
  for (const [name, input, move] of air) {
    it(`air ${name}`, () => expect(moveAfter(airborne(), input)).toBe(move));
  }

  it('J while running is a dash attack', () => {
    const s = run(duel(400), 14, Btn.Right);
    expect(s.fighters[0]!.action).toBe(Action.Run);
    expect(moveAfter(s, Btn.Right | Btn.Attack)).toBe(MoveId.DashAttack);
  });

  it('J out of a dash is a dash attack', () => {
    const s = run(duel(400), 2, tap(Btn.Dash));
    expect(moveAfter(s, Btn.Attack)).toBe(MoveId.DashAttack);
  });

  it('back air keeps facing; forward smash with a direction turns around', () => {
    const b = run(airborne(), 1, Btn.Attack | Btn.Left);
    expect(b.fighters[0]!.facing).toBe(1);
    const f = run(duel(300), 1, Btn.Heavy | Btn.Left);
    expect(f.fighters[0]!.facing).toBe(-1);
  });

  it('every move id has a move with a name', () => {
    expect(wisp.moves.length).toBe(Object.keys(MoveId).length);
    for (const m of wisp.moves) expect(m.name.length).toBeGreaterThan(0);
  });
});

describe('smash attacks', () => {
  it('up smash is a vertical attack that stays on the ground', () => {
    let left = false;
    const s = run(duel(300), 45, tap(Btn.Heavy | Btn.Up), 0, (n) => {
      if (n.fighters[0]!.ground < 0) left = true;
    });
    expect(left).toBe(false);
    expect(s.fighters[0]!.y).toBe(0);
  });

  it('up smash hits a fighter standing right next to you', () => {
    const s = run(duel(20), 20, tap(Btn.Heavy | Btn.Up));
    expect(s.fighters[1]!.damage).toBeGreaterThan(0);
    expect(s.fighters[1]!.vy).toBeLessThan(0);
  });

  it('down smash hits both in front and behind', () => {
    const front = duel(60);
    const f = run(front, 30, tap(Btn.Heavy | Btn.Down));
    expect(f.fighters[1]!.damage).toBeGreaterThan(0);
    expect(f.fighters[1]!.vx).toBeGreaterThan(0); // sent away (forward)

    const behind = duel(60);
    behind.fighters[0]!.facing = -1; // dummy is now behind P1
    const b = run(behind, 30, tap(Btn.Heavy | Btn.Down));
    expect(b.fighters[1]!.damage).toBeGreaterThan(0);
    expect(b.fighters[1]!.vx).toBeGreaterThan(0); // sent away (backward from P1's facing)
  });

  it('holding K charges the smash for more damage', () => {
    const tapDmg = run(duel(60), 40, tap(Btn.Heavy)).fighters[1]!.damage;
    let charged = run(duel(60), MAX_SMASH_CHARGE + 10, Btn.Heavy);
    charged = run(charged, 30, 0);
    expect(charged.fighters[1]!.damage).toBeGreaterThan(tapDmg);
  });
});

describe('ground normals', () => {
  it('pressing J three times does the full jab combo', () => {
    let move = -1;
    const s = run(duel(40), 60, (i) => (i % 6 === 0 && i < 30 ? Btn.Attack : 0), 0, (n) => {
      if (n.fighters[0]!.action === Action.Attack) move = Math.max(move, n.fighters[0]!.move);
    });
    expect(move).toBe(MoveId.Jab3);
    expect(s.fighters[1]!.damage).toBe(2 + 2 + 4);
  });

  it('a single J is only one jab', () => {
    let move = -1;
    run(duel(300), 40, tap(Btn.Attack), 0, (n) => {
      if (n.fighters[0]!.action === Action.Attack) move = Math.max(move, n.fighters[0]!.move);
    });
    expect(move).toBe(MoveId.Jab1);
  });

  it('up tilt hits upward', () => {
    const s = run(duel(20), 14, tap(Btn.Attack | Btn.Up));
    expect(s.fighters[1]!.damage).toBe(6);
  });
});

describe('aerials', () => {
  it('back air sends the victim backward', () => {
    const s = duel(0);
    for (const f of s.fighters) {
      f.ground = -1;
      f.action = Action.Air;
      f.y = px(-200);
    }
    s.fighters[0]!.x = px(30); // dummy is behind P1 (P1 faces right, dummy on its left)
    s.fighters[1]!.x = px(0);
    const n = run(s, 10, tap(Btn.Attack | Btn.Left));
    expect(n.fighters[1]!.damage).toBe(11);
    expect(n.fighters[1]!.vx).toBeLessThan(0);
  });
});

describe('specials', () => {
  it('neutral special fires a projectile that hits at range', () => {
    let fired = false;
    const s = run(duel(300), 80, tap(Btn.Special), 0, (n) => {
      if (n.fighters[0]!.projLife > 0) fired = true;
    });
    expect(fired).toBe(true);
    expect(s.fighters[1]!.damage).toBe(5);
    expect(s.fighters[0]!.projLife).toBe(0);
  });

  it('the projectile is blocked by shield', () => {
    const s = run(duel(300), 80, tap(Btn.Special), Btn.Dodge);
    expect(s.fighters[1]!.damage).toBe(0);
    expect(s.fighters[1]!.shieldHp).toBeLessThan(5000 - 80 * 15);
  });

  it('down special counters a hit and strikes back', () => {
    let event = 0;
    // Dummy counters on frame 0 (window frames 6-24); P1 jabs on frame 6, hits on 8.
    const s = run(duel(40), 30, (i) => (i === 6 ? Btn.Attack : 0), tap(Btn.Special | Btn.Down), (n) => {
      event = Math.max(event, n.fighters[1]!.event);
    });
    expect(event).toBe(SimEvent.Counter);
    expect(s.fighters[1]!.damage).toBe(0);
    expect(s.fighters[0]!.damage).toBe(12);
  });

  it('side special works once per airtime', () => {
    let s = airborne();
    s = run(s, 1, Btn.Special | Btn.Right);
    expect(s.fighters[0]!.move).toBe(MoveId.SideSpecial);
    s = run(s, wisp.moves[MoveId.SideSpecial]!.total + 1, 0);
    s = run(s, 1, Btn.Special | Btn.Right);
    expect(s.fighters[0]!.action).not.toBe(Action.Attack);
  });
});

describe('grabs and throws', () => {
  function grabbed(): MatchState {
    const s = run(duel(40), 10, tap(Btn.Dodge | Btn.Attack));
    expect(s.fighters[0]!.action).toBe(Action.Holding);
    expect(s.fighters[1]!.action).toBe(Action.Held);
    return s;
  }

  it('shield + J grabs, and the held fighter stays in front', () => {
    const s = grabbed();
    expect(s.fighters[1]!.heldBy).toBe(0);
    expect(s.fighters[0]!.grabTarget).toBe(1);
    expect(s.fighters[1]!.x).toBeGreaterThan(s.fighters[0]!.x);
  });

  it('grabs beat shields', () => {
    const s = run(duel(40), 10, (i) => (i === 3 ? Btn.Dodge | Btn.Attack : 0), Btn.Dodge);
    expect(s.fighters[1]!.action).toBe(Action.Held);
  });

  it('grabbing from shield works', () => {
    let s = run(duel(40), 4, Btn.Dodge);
    expect(s.fighters[0]!.action).toBe(Action.Shield);
    s = run(s, 10, (i) => (i === 0 ? Btn.Dodge | Btn.Attack : 0));
    expect(s.fighters[1]!.action).toBe(Action.Held);
  });

  it('J pummels while holding', () => {
    let s = grabbed();
    s = run(s, 20, (i) => (i === 0 ? Btn.Attack : 0));
    expect(s.fighters[1]!.damage).toBe(1);
    expect(s.fighters[1]!.action).toBe(Action.Held);
  });

  const throws: [string, number, number, (vx: number, vy: number) => boolean][] = [
    ['forward', Btn.Right, 7, (vx) => vx > 0],
    ['back', Btn.Left, 9, (vx) => vx < 0],
    ['up', Btn.Up, 6, (_vx, vy) => vy < 0],
    ['down', Btn.Down, 5, (_vx, vy) => vy < 0],
  ];
  for (const [name, dir, dmg, launched] of throws) {
    it(`${name} throw launches the right way`, () => {
      let s = grabbed();
      s = run(s, 3, 0);
      let ok = false;
      s = run(s, 40, dir, 0, (n) => {
        const v = n.fighters[1]!;
        if (v.action === Action.Hitstun && v.hitlag === 0 && launched(v.vx, v.vy)) ok = true;
      });
      expect(s.fighters[1]!.damage).toBe(dmg);
      expect(ok).toBe(true);
      expect(s.fighters[0]!.grabTarget).toBe(-1);
      expect(s.fighters[1]!.heldBy).toBe(-1);
    });
  }

  it('the held fighter breaks free after a while, faster by mashing', () => {
    const free = (p2: InputFn) => {
      let frames = 0;
      let s = grabbed();
      while (s.fighters[1]!.action === Action.Held && frames < 500) {
        s = run(s, 1, 0, val(p2, frames));
        frames++;
      }
      return frames;
    };
    const idle = free(0);
    const mash = free((i) => (i % 2 === 0 ? Btn.Jump : 0));
    expect(idle).toBeGreaterThanOrEqual(GRAB_HOLD_BASE - 12);
    expect(mash).toBeLessThan(idle);
  });
});
