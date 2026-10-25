import { describe, expect, it } from 'vitest';
import { Action } from '../src/sim/actions';
import { knockback } from '../src/sim/combat';
import { FIGHTERS } from '../src/sim/fighters';
import { px } from '../src/sim/fixed';
import { Btn } from '../src/sim/input';
import { MoveId } from '../src/sim/moves/types';
import { DRAW, MATCH_ON, matchWinner } from '../src/sim/outcome';
import { STAGES } from '../src/sim/stage';
import { createMatch, FIGHTER_FIELDS, hashState, type MatchState } from '../src/sim/state';
import { step } from '../src/sim/step';

const stage = STAGES[0]!;
const byName = (name: string) => {
  const i = FIGHTERS.findIndex((f) => f.name === name);
  expect(i, name).toBeGreaterThanOrEqual(0);
  return i;
};

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

/** P1 (char `a`) at -gap/2 facing right, P2 (char `b`, idle dummy) at +gap/2. */
function duel(a: number, b: number, gap = 40, dummyDamage = 0): MatchState {
  const s = createMatch({ seed: 1, stageId: 0, chars: [a, b], stocks: 3 });
  const [p1, p2] = s.fighters as [MatchState['fighters'][0], MatchState['fighters'][0]];
  p1.x = px(-gap / 2);
  p1.facing = 1;
  p2.x = px(gap / 2);
  p2.facing = -1;
  p2.damage = dummyDamage;
  return s;
}

const SPECIALS = [MoveId.NSpecial, MoveId.SideSpecial, MoveId.UpSpecial, MoveId.DownSpecial];

describe('roster', () => {
  it('has eight fighters with unique names', () => {
    expect(FIGHTERS.length).toBe(8);
    expect(new Set(FIGHTERS.map((f) => f.name)).size).toBe(8);
  });

  it('every fighter has its own signature specials (down special is the shared drill dive, except Rook)', () => {
    const names = FIGHTERS.flatMap((f) => SPECIALS.filter((id) => id !== MoveId.DownSpecial).map((id) => f.moves[id]!.name));
    expect(new Set(names).size).toBe(names.length);
    for (const f of FIGHTERS) expect(f.moves[MoveId.DownSpecial]!.name).toBe(f.name === 'Rook' ? 'Riposte' : 'Drill Dive');
  });

  it('stats really differ: every pair differs in at least three key stats', () => {
    const key = (i: number) => {
      const s = FIGHTERS[i]!.stats;
      return [s.weight, s.height, s.width, s.runSpeed, s.gravity, s.fullHopSpeed, s.airJumps, s.airMaxSpeed];
    };
    for (let a = 0; a < FIGHTERS.length; a++) {
      for (let b = a + 1; b < FIGHTERS.length; b++) {
        const ka = key(a), kb = key(b);
        const diffs = ka.filter((v, i) => v !== kb[i]).length;
        expect(diffs, `${FIGHTERS[a]!.name} vs ${FIGHTERS[b]!.name}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('archetypes hold: giant, featherweight, fast-faller, floaty zoner, long reach', () => {
    const stats = FIGHTERS.map((f) => f.stats);
    const max = (pick: (i: number) => number) => FIGHTERS.reduce((best, _f, i) => (pick(i) > pick(best) ? i : best), 0);
    const min = (pick: (i: number) => number) => max((i) => -pick(i));
    expect(max((i) => stats[i]!.weight)).toBe(byName('Basalt'));
    expect(max((i) => stats[i]!.height)).toBe(byName('Basalt'));
    expect(min((i) => stats[i]!.weight)).toBe(byName('Pip'));
    expect(min((i) => stats[i]!.height)).toBe(byName('Pip'));
    expect(max((i) => stats[i]!.airJumps)).toBe(byName('Pip'));
    expect(max((i) => stats[i]!.gravity)).toBe(byName('Kestrel'));
    expect(min((i) => stats[i]!.gravity)).toBe(byName('Lumen'));
    // Reach of the side tilt, measured from the front of the body.
    const reach = (i: number) => {
      const h = FIGHTERS[i]!.moves[MoveId.FTilt]!.hitboxes[0]!;
      return h.x + h.r - stats[i]!.width / 2;
    };
    expect(max(reach)).toBe(byName('Sable'));
    // Heavies hit harder and slower than the lightweights.
    const brick = FIGHTERS[byName('Brick')]!.moves[MoveId.FSmash]!;
    const wisp = FIGHTERS[byName('Wisp')]!.moves[MoveId.FSmash]!;
    expect(brick.hitboxes[0]!.damage).toBeGreaterThan(wisp.hitboxes[0]!.damage);
    expect(brick.hitboxes[0]!.start).toBeGreaterThan(wisp.hitboxes[0]!.start);
  });
});

describe('move data is valid for every fighter', () => {
  for (const def of FIGHTERS) {
    it(def.name, () => {
      expect(def.moves.length).toBe(Object.keys(MoveId).length);
      def.moves.forEach((m, id) => {
        const where = `${def.name} ${m.name}`;
        expect(m.name.length, where).toBeGreaterThan(0);
        expect(m.total, where).toBeGreaterThanOrEqual(1);
        const within = (f: number) => f >= 1 && f <= m.total;
        for (const h of m.hitboxes) {
          expect(h.start, where).toBeGreaterThanOrEqual(1);
          expect(h.end, where).toBeGreaterThanOrEqual(h.start);
          expect(h.end, where).toBeLessThanOrEqual(m.total);
          expect(h.r, where).toBeGreaterThan(0);
          expect(h.damage, where).toBeGreaterThan(0);
          for (const [k, v] of Object.entries(h)) if (k !== 'fixed') expect(Number.isInteger(v), `${where} ${k}`).toBe(true);
        }
        if (m.chargeFrame !== undefined) {
          expect(m.chargeFrame, where).toBeLessThan(Math.min(...m.hitboxes.map((h) => h.start)));
        }
        if (m.next) expect(within(m.next.from) && within(m.next.to) && m.next.from <= m.next.to, where).toBe(true);
        for (const i of m.impulses ?? []) expect(within(i.frame), where).toBe(true);
        if (m.noGravity) expect(within(m.noGravity[0]) && m.noGravity[0] <= m.noGravity[1], where).toBe(true);
        if (m.counter) expect(within(m.counter[0]) && within(m.counter[1]), where).toBe(true);
        if (m.landingLag !== undefined) expect(Number.isInteger(m.landingLag), where).toBe(true);
        // Mechanics are only read from the slots that use them.
        if (m.projectile) {
          expect(id, where).toBe(MoveId.NSpecial);
          expect(within(m.projectile.frame), where).toBe(true);
          expect(m.projectile.hit.r, where).toBeGreaterThan(0);
        }
        if (m.grabbox) expect(id, where).toBe(MoveId.Grab);
        if (m.pummel) expect(id, where).toBe(MoveId.Pummel);
        if (m.throw) expect([MoveId.FThrow, MoveId.BThrow, MoveId.UThrow, MoveId.DThrow], where).toContain(id);
        if (m.oncePerAir) expect(SPECIALS, where).toContain(id);
        if (m.counter) expect(id, where).toBe(MoveId.DownSpecial);
      });
      expect(def.moves[MoveId.UpSpecial]!.helplessAfter, `${def.name} up special`).toBe(true);
    });
  }
});

describe('every fighter plays', () => {
  const ground = [
    Btn.Attack, Btn.Attack | Btn.Right, Btn.Attack | Btn.Up, Btn.Attack | Btn.Down,
    Btn.Heavy, Btn.Heavy | Btn.Up, Btn.Heavy | Btn.Down,
    Btn.Special, Btn.Special | Btn.Right, Btn.Special | Btn.Up, Btn.Special | Btn.Down,
    Btn.Dodge | Btn.Attack,
  ];
  const air = [
    Btn.Attack, Btn.Attack | Btn.Right, Btn.Attack | Btn.Left, Btn.Attack | Btn.Up, Btn.Attack | Btn.Down,
    Btn.Special, Btn.Special | Btn.Right, Btn.Special | Btn.Down,
  ];

  FIGHTERS.forEach((def, c) => {
    it(`${def.name}: every ground and air move starts and ends`, () => {
      for (const input of ground) {
        let s = run(duel(c, c, 400), 1, input);
        expect(s.fighters[0]!.action, `${def.name} ground ${input}`).toBe(Action.Attack);
        s = run(s, 200, 0);
        expect(s.fighters[0]!.action, `${def.name} ground ${input}`).toBe(Action.Idle);
      }
      for (const input of air) {
        const s0 = duel(c, c, 400);
        s0.fighters[0]!.x = 0;
        let s = run(s0, def.stats.jumpSquat + 4, Btn.Jump);
        expect(s.fighters[0]!.ground, def.name).toBe(-1);
        s = run(s, 1, input);
        expect(s.fighters[0]!.action, `${def.name} air ${input}`).toBe(Action.Attack);
        s = run(s, 300, 0);
        expect(s.fighters[0]!.ground, `${def.name} air ${input} lands`).toBe(0);
        expect(s.fighters[0]!.action, `${def.name} air ${input}`).toBe(Action.Idle);
      }
    });

    it(`${def.name}: full hop reaches the side platforms, short hop is lower`, () => {
      const apex = (input: InputFn) => {
        const s0 = duel(c, c, 400);
        s0.fighters[0]!.x = 0; // under the high platform, out of full-hop reach
        let top = 0;
        run(s0, 60, input, 0, (n) => (top = Math.min(top, n.fighters[0]!.y)));
        return top;
      };
      const full = apex(Btn.Jump);
      const short = apex(tap(Btn.Jump));
      expect(full, def.name).toBeLessThan(stage.platforms[0]!.top - px(4));
      expect(short, def.name).toBeGreaterThan(full + px(30));
    });

    it(`${def.name}: recovers to the stage from just off the edge`, () => {
      for (const [dx, y] of [[100, -40], [70, 40]] as const) {
        const s0 = createMatch({ seed: 1, stageId: 0, chars: [c], stocks: 3 });
        const f = s0.fighters[0]!;
        f.x = stage.blocks[0]!.left - px(dx);
        f.y = px(y);
        f.ground = -1;
        f.action = Action.Air;
        f.facing = 1;
        // Double jump toward the stage, then up special once falling again.
        let s = s0;
        let usedUpB = false;
        for (let i = 0; i < 400 && s.fighters[0]!.ground < 0 && s.fighters[0]!.action !== Action.KO; i++) {
          const me = s.fighters[0]!;
          let input = Btn.Right;
          if (i === 0) input |= Btn.Jump;
          else if (!usedUpB && i > 4 && me.vy >= 0) {
            input |= Btn.Special | Btn.Up;
            usedUpB = true;
          }
          s = step(s, [input]);
        }
        // Landing on the main stage or one of its platforms both count.
        expect(s.fighters[0]!.ground, `${def.name} from ${dx}px out, y ${y}`).toBeGreaterThanOrEqual(0);
      }
    });
  });
});

describe('weight and launch distance', () => {
  it('the knockback formula favors heavier fighters', () => {
    const h = FIGHTERS[0]!.moves[MoveId.FSmash]!.hitboxes[0]!;
    const sorted = [...FIGHTERS].sort((a, b) => a.stats.weight - b.stats.weight);
    for (let i = 1; i < sorted.length; i++) {
      expect(knockback(h, 80, sorted[i]!.stats.weight)).toBeLessThanOrEqual(knockback(h, 80, sorted[i - 1]!.stats.weight));
    }
  });

  it('the same hit launches Pip much further than Basalt', () => {
    const rook = byName('Rook');
    const distance = (victim: number) => {
      const s0 = duel(rook, victim, 60, 80);
      const x0 = s0.fighters[1]!.x;
      let maxDx = 0;
      run(s0, 90, tap(Btn.Heavy), 0, (s) => (maxDx = Math.max(maxDx, s.fighters[1]!.x - x0)));
      return maxDx;
    };
    const pip = distance(byName('Pip'));
    const basalt = distance(byName('Basalt'));
    expect(basalt).toBeGreaterThan(0);
    expect(pip).toBeGreaterThan(basalt * 1.5);
  });
});

describe('every fighter has their own moves', () => {
  const SMASHES = [MoveId.FSmash, MoveId.USmash, MoveId.DSmash];
  it('smash attacks (K) are hand-written per fighter: no two fighters share one', () => {
    const names = FIGHTERS.flatMap((def) => SMASHES.map((id) => def.moves[id]!.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it("no special (I) repeats one of the same fighter's smash attacks", () => {
    for (const def of FIGHTERS) {
      const smashNames = SMASHES.map((id) => def.moves[id]!.name);
      for (const id of SPECIALS) expect(smashNames, def.name).not.toContain(def.moves[id]!.name);
      // Same shape check: a special whose hitboxes sit where a smash's do (same spots, same angles) is a copy.
      const shape = (id: number) => def.moves[id]!.hitboxes.map((h) => [Math.round(h.x / 2560), Math.round(h.y / 2560), h.angle].join()).sort().join('|');
      for (const sm of SMASHES) for (const sp of SPECIALS) if (shape(sp)) expect(shape(sp), `${def.name} ${def.moves[sp]!.name}`).not.toBe(shape(sm));
    }
  });
});

describe('specials', () => {
  it('fighters with a projectile hit a dummy at range', () => {
    FIGHTERS.forEach((def, c) => {
      if (!def.moves[MoveId.NSpecial]!.projectile) return;
      const s = run(duel(c, 0, 180), 120, tap(Btn.Special));
      expect(s.fighters[1]!.damage, def.name).toBeGreaterThan(0);
    });
  });

  it('once-per-airtime specials work once until landing (Pip drill dive, high up)', () => {
    const pip = byName('Pip');
    const s0 = duel(pip, pip, 400);
    s0.fighters[0]!.x = 0;
    s0.fighters[0]!.y = px(-400);
    s0.fighters[0]!.ground = -1;
    let s = run(s0, 8, Btn.Jump);
    s = run(s, 1, Btn.Special | Btn.Down);
    expect(s.fighters[0]!.move).toBe(MoveId.DownSpecial);
    s = run(s, FIGHTERS[pip]!.moves[MoveId.DownSpecial]!.total + 1, 0);
    expect(s.fighters[0]!.ground).toBe(-1);
    s = run(s, 1, Btn.Special | Btn.Down);
    expect(s.fighters[0]!.action).not.toBe(Action.Attack);
  });

  it('Rook counters like Wisp', () => {
    const rook = byName('Rook');
    const s = run(duel(0, rook, 40), 30, (i) => (i === 6 ? Btn.Attack : 0), tap(Btn.Special | Btn.Down));
    expect(s.fighters[1]!.damage).toBe(0);
    expect(s.fighters[0]!.damage).toBeGreaterThan(0);
  });

  it('grabbing holds bigger fighters further out', () => {
    const held = (holder: number, victim: number) => {
      const s = run(duel(holder, victim, 40), 12, tap(Btn.Dodge | Btn.Attack));
      expect(s.fighters[1]!.action).toBe(Action.Held);
      return s.fighters[1]!.x - s.fighters[0]!.x;
    };
    expect(held(byName('Basalt'), byName('Basalt'))).toBeGreaterThan(held(byName('Pip'), byName('Pip')));
  });
});

describe('match outcome', () => {
  it('is on until one fighter is out, then names the winner', () => {
    const s = createMatch({ seed: 1, stageId: 0, chars: [0, 1], stocks: 1 });
    expect(matchWinner(s)).toBe(MATCH_ON);
    s.fighters[0]!.action = Action.Out;
    expect(matchWinner(s)).toBe(1);
    s.fighters[1]!.action = Action.Out;
    expect(matchWinner(s)).toBe(DRAW);
  });

  it('a full match plays out to a winner', () => {
    // P2 walks off the stage three times; P1 stands still.
    let s = createMatch({ seed: 3, stageId: 0, chars: [byName('Basalt'), byName('Pip')], stocks: 3 });
    let frames = 0;
    while (matchWinner(s) === MATCH_ON && frames < 3000) {
      s = step(s, [0, Btn.Right]);
      frames++;
    }
    expect(matchWinner(s)).toBe(0);
  });
});

describe('determinism with every fighter', () => {
  it('random brawls for every pairing replay identically', () => {
    const play = (a: number, b: number) => {
      let rng = 0x13579bd ^ (a * 977 + b * 131);
      let s = createMatch({ seed: 5 + a, stageId: 0, chars: [a, b], stocks: 3 });
      let ia = 0, ib = 0;
      const hashes: number[] = [];
      for (let i = 0; i < 1500; i++) {
        rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5;
        if ((rng & 7) === 0) ia = (rng >>> 8) & 0x3ff;
        if (((rng >>> 3) & 7) === 0) ib = (rng >>> 16) & 0x3ff;
        s = step(s, [ia, ib]);
        if (i % 50 === 0) hashes.push(hashState(s));
      }
      return { s, hashes };
    };
    for (let a = 0; a < FIGHTERS.length; a++) {
      const b = (a + 3) % FIGHTERS.length;
      const r1 = play(a, b);
      const r2 = play(a, b);
      expect(r2.hashes, `${FIGHTERS[a]!.name} vs ${FIGHTERS[b]!.name}`).toEqual(r1.hashes);
      for (const f of r1.s.fighters) for (const k of FIGHTER_FIELDS) expect(Number.isInteger(f[k]), k).toBe(true);
    }
  });
});
