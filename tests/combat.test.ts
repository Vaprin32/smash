import { describe, expect, it } from 'vitest';
import { Action } from '../src/sim/actions';
import { knockback } from '../src/sim/combat';
import { FIGHTERS } from '../src/sim/fighters';
import { px } from '../src/sim/fixed';
import { Btn } from '../src/sim/input';
import { MoveId } from '../src/sim/moves/types';
import { createMatch, FIGHTER_FIELDS, type MatchState } from '../src/sim/state';
import { step } from '../src/sim/step';
import { icos, isin, TRIG_ONE } from '../src/sim/trig';

const wisp = FIGHTERS[0]!;

/** P1 at x = -gap/2 facing right, P2 (the dummy) at +gap/2 facing left, both grounded. */
function duel(gap = 40, dummyDamage = 0): MatchState {
  const s = createMatch({ seed: 1, stageId: 0, chars: [0, 0], stocks: 3 });
  const [a, b] = s.fighters as [MatchState['fighters'][0], MatchState['fighters'][0]];
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

describe('integer trig', () => {
  it('matches known values', () => {
    expect(isin(0)).toBe(0);
    expect(isin(30)).toBe(TRIG_ONE / 2);
    expect(isin(90)).toBe(TRIG_ONE);
    expect(isin(270)).toBe(-TRIG_ONE);
    expect(icos(0)).toBe(TRIG_ONE);
    expect(icos(180)).toBe(-TRIG_ONE);
    expect(isin(-90)).toBe(-TRIG_ONE);
    expect(isin(450)).toBe(TRIG_ONE);
  });
});

describe('move data', () => {
  it('every fighter has a full, integer moveset', () => {
    for (const def of FIGHTERS) {
      expect(def.moves.length).toBe(Object.keys(MoveId).length);
      for (const m of def.moves) {
        for (const h of m.hitboxes) {
          expect(h.start).toBeGreaterThanOrEqual(1);
          expect(h.end).toBeGreaterThanOrEqual(h.start);
          expect(h.end).toBeLessThanOrEqual(m.total);
          for (const v of Object.values(h)) expect(Number.isInteger(v)).toBe(true);
        }
      }
    }
  });
});

describe('hitting the dummy', () => {
  it('jab hits once per use, adds damage, and causes hitstun', () => {
    let s = run(duel(), 4, tap(Btn.Attack));
    expect(s.fighters[1]!.damage).toBe(3);
    expect(s.fighters[1]!.action).toBe(Action.Hitstun);
    expect(s.fighters[0]!.hitMask & 2).toBe(2);
    s = run(s, 30, 0);
    expect(s.fighters[1]!.damage).toBe(3); // didn't hit twice
  });

  it('hitlag freezes both fighters, then the victim launches', () => {
    let s = run(duel(), 4, tap(Btn.Attack));
    const lag = s.fighters[1]!.hitlag;
    expect(lag).toBeGreaterThan(0);
    expect(s.fighters[0]!.hitlag).toBe(lag);
    const x = s.fighters[1]!.x;
    const atkFrame = s.fighters[0]!.actionFrame;
    s = run(s, lag, 0);
    expect(s.fighters[1]!.x).toBe(x);
    expect(s.fighters[0]!.actionFrame).toBe(atkFrame);
    s = run(s, 2, 0);
    expect(s.fighters[1]!.x).toBeGreaterThan(x);
  });

  it('knockback sends the victim away from the attacker', () => {
    const s = duel();
    // Swap sides: P1 on the right facing left.
    s.fighters[0]!.x = px(20);
    s.fighters[0]!.facing = -1;
    s.fighters[1]!.x = px(-20);
    const n = run(s, 8, tap(Btn.Attack | Btn.Left));
    expect(n.fighters[1]!.vx).toBeLessThan(0);
  });

  it('flies further at higher damage', () => {
    const distance = (startDamage: number) => {
      const s0 = duel(50, startDamage);
      const x0 = s0.fighters[1]!.x;
      let maxDx = 0;
      run(s0, 120, tap(Btn.Attack | Btn.Right), 0, (s) => {
        maxDx = Math.max(maxDx, s.fighters[1]!.x - x0);
      });
      return maxDx;
    };
    const d0 = distance(0);
    const d50 = distance(50);
    const d100 = distance(100);
    expect(d0).toBeGreaterThan(0);
    expect(d50).toBeGreaterThan(d0);
    expect(d100).toBeGreaterThan(d50);
  });

  it('knockback formula grows with damage and shrinks with weight', () => {
    const h = wisp.moves[MoveId.FTilt]!.hitboxes[0]!;
    expect(knockback(h, 100, 100)).toBeGreaterThan(knockback(h, 0, 100));
    expect(knockback(h, 50, 80)).toBeGreaterThan(knockback(h, 50, 120));
  });

  it('down air spikes an airborne victim', () => {
    const s = duel(0);
    for (const f of s.fighters) {
      f.ground = -1;
      f.action = Action.Air;
      f.vy = 0;
    }
    s.fighters[0]!.y = px(-300);
    s.fighters[1]!.y = px(-240);
    let spiked = false;
    run(s, 14, tap(Btn.Attack | Btn.Down), 0, (n) => {
      if (n.fighters[1]!.action === Action.Hitstun && n.fighters[1]!.vy > 0) spiked = true;
    });
    expect(spiked).toBe(true);
  });

  it('simultaneous hits trade', () => {
    const s = run(duel(), 6, tap(Btn.Attack), tap(Btn.Attack));
    expect(s.fighters[0]!.damage).toBe(3);
    expect(s.fighters[1]!.damage).toBe(3);
  });
});

describe('dodges and invincibility', () => {
  it('a spot dodge makes the dummy intangible', () => {
    const s = run(duel(), 10, (i) => (i === 2 ? Btn.Attack : 0), tap(Btn.Dodge));
    expect(s.fighters[1]!.damage).toBe(0);
  });

  it('a roll moves and is intangible mid-roll', () => {
    const s0 = duel(120);
    const x0 = s0.fighters[1]!.x;
    const s = run(s0, 25, 0, tap(Btn.Dodge | Btn.Right));
    expect(s.fighters[1]!.x - x0).toBeGreaterThan(px(50));
    expect(s.fighters[1]!.action).toBe(Action.Idle);
  });

  it('respawn invincibility blocks hits', () => {
    const s = duel();
    s.fighters[1]!.invincible = 60;
    const n = run(s, 10, tap(Btn.Attack));
    expect(n.fighters[1]!.damage).toBe(0);
  });

  it('air dodge works once per airtime and resets on landing', () => {
    const s0 = duel(300);
    let s = run(s0, 10, (i) => (i < 8 ? Btn.Jump : 0));
    s = run(s, 1, Btn.Dodge);
    expect(s.fighters[0]!.action).toBe(Action.AirDodge);
    s = run(s, wisp.stats.airDodgeFrames + 1, 0);
    expect(s.fighters[0]!.airDodgeUsed).toBe(1);
    s = run(s, 1, Btn.Dodge);
    expect(s.fighters[0]!.action).not.toBe(Action.AirDodge);
    s = run(s, 120, 0);
    expect(s.fighters[0]!.ground).toBeGreaterThanOrEqual(0);
    expect(s.fighters[0]!.airDodgeUsed).toBe(0);
  });
});

describe('specials and aerials', () => {
  it('up special rises, ends helpless, then has special-fall landing lag', () => {
    const s0 = duel(300);
    s0.fighters[0]!.x = 0;
    let minY = 0;
    let sawHelpless = false;
    let landLag = -1;
    run(s0, 200, tap(Btn.Special | Btn.Up), 0, (n) => {
      const f = n.fighters[0]!;
      minY = Math.min(minY, f.y);
      if (f.action === Action.SpecialFall) sawHelpless = true;
      if (sawHelpless && f.action === Action.Landing && landLag < 0) landLag = f.landLag;
    });
    expect(minY).toBeLessThan(px(-150));
    expect(sawHelpless).toBe(true);
    expect(landLag).toBe(wisp.stats.specialFallLanding);
  });

  it('helpless fighters cannot jump or attack', () => {
    const s0 = duel(300);
    s0.fighters[0]!.x = px(-350); // clear of platforms, drifting off the left edge
    s0.fighters[0]!.facing = -1;
    let s = run(s0, 45, tap(Btn.Special | Btn.Up));
    expect(s.fighters[0]!.action).toBe(Action.SpecialFall);
    s = run(s, 1, Btn.Jump | Btn.Attack);
    expect(s.fighters[0]!.action).toBe(Action.SpecialFall);
  });

  it('side special works once per airtime', () => {
    const s0 = duel(300);
    let s = run(s0, 10, (i) => (i < 8 ? Btn.Jump : 0));
    s = run(s, 1, Btn.Special | Btn.Right);
    expect(s.fighters[0]!.move).toBe(MoveId.SideSpecial);
    s = run(s, wisp.moves[MoveId.SideSpecial]!.total + 1, 0);
    s = run(s, 1, Btn.Special | Btn.Right);
    expect(s.fighters[0]!.action).not.toBe(Action.Attack);
  });

  it('landing mid-aerial uses the move landing lag', () => {
    const s0 = duel(300);
    s0.fighters[0]!.x = 0;
    let s = run(s0, 10, tap(Btn.Jump)); // short hop
    let landLag = -1;
    s = run(s, 60, (i) => (i === 10 ? Btn.Attack | Btn.Right : 0), 0, (n) => {
      if (n.fighters[0]!.action === Action.Landing && landLag < 0) landLag = n.fighters[0]!.landLag;
    });
    expect(landLag).toBe(wisp.moves[MoveId.FAir]!.landingLag);
  });

  it('a buffered attack comes out right after landing lag', () => {
    const s0 = duel(300);
    s0.fighters[0]!.x = 0;
    // Find the frame a short hop lands on.
    let s = run(s0, 1, Btn.Jump);
    let landedAt = -1;
    s = run(s, 80, 0, 0, (n) => {
      if (landedAt < 0 && n.fighters[0]!.action === Action.Landing) landedAt = n.frame;
    });
    expect(landedAt).toBeGreaterThan(0);
    // Re-run up to the landing frame, press attack on it, and check Jab starts when lag ends.
    let r = run(s0, 1, Btn.Jump);
    r = run(r, landedAt - 1, 0);
    expect(r.fighters[0]!.action).toBe(Action.Landing);
    r = run(r, wisp.stats.landingLag, (i) => (i === 0 ? Btn.Attack : 0));
    expect(r.fighters[0]!.action).toBe(Action.Attack);
    expect(r.fighters[0]!.move).toBe(MoveId.Jab);
  });
});

describe('combat determinism', () => {
  it('random two-player brawls replay identically with integer state', () => {
    const play = () => {
      let rng = 0x2468ace;
      let s = createMatch({ seed: 5, stageId: 0, chars: [0, 0], stocks: 3 });
      s.fighters[1]!.x = px(-100);
      let a = 0, b = 0;
      let hits = 0;
      for (let i = 0; i < 5000; i++) {
        rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5;
        if ((rng & 7) === 0) a = (rng >>> 8) & 0xff;
        if (((rng >>> 3) & 7) === 0) b = (rng >>> 16) & 0xff;
        const before = s.fighters[0]!.damage + s.fighters[1]!.damage;
        s = step(s, [a, b]);
        if (s.fighters[0]!.damage + s.fighters[1]!.damage > before) hits++;
      }
      return { s, hits };
    };
    const r1 = play();
    const r2 = play();
    expect(r2.s).toEqual(r1.s);
    expect(r1.hits).toBeGreaterThan(0);
    for (const f of r1.s.fighters) for (const k of FIGHTER_FIELDS) expect(Number.isInteger(f[k]), k).toBe(true);
  });
});
