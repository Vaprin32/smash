import { describe, expect, it } from 'vitest';
import { Action } from '../src/sim/actions';
import { px } from '../src/sim/fixed';
import { Btn } from '../src/sim/input';
import { createMatch, type MatchState } from '../src/sim/state';
import { step } from '../src/sim/step';
import { awardsFor, matchResult, MatchStats, STAT_ROWS } from '../src/ui/results';

/** Wisp vs Wisp, 40 px apart, facing each other. */
function duel(): MatchState {
  const s = createMatch({ seed: 1, stageId: 0, chars: [0, 0], stocks: 3 });
  s.fighters[0]!.x = px(-20);
  s.fighters[1]!.x = px(20);
  s.fighters[1]!.facing = -1;
  return s;
}

function play(s: MatchState, frames: number, p1: (i: number) => number, p2: (i: number) => number, stats: MatchStats): MatchState {
  for (let i = 0; i < frames; i++) {
    const next = step(s, [p1(i), p2(i)]);
    stats.onStep(s, next);
    s = next;
  }
  return s;
}

describe('match stats', () => {
  it('counts hits, damage both ways, the strongest hit and combos', () => {
    const stats = new MatchStats(2);
    // Jab, jab, jab.
    const jabs = (i: number) => (i % 6 === 0 && i < 18 ? Btn.Attack : 0);
    const s = play(duel(), 60, jabs, () => 0, stats);
    expect(stats.hits[0]).toBeGreaterThanOrEqual(2);
    expect(stats.damageDealt[0]).toBe(s.fighters[1]!.damage);
    expect(stats.damageTaken[1]).toBe(s.fighters[1]!.damage);
    expect(stats.strongestHit[0]).toBeGreaterThan(0);
    // A combo only counts hits that land before the victim could act again.
    expect(stats.longestCombo[0]).toBeGreaterThanOrEqual(1);
    expect(stats.longestCombo[0]).toBeLessThanOrEqual(stats.hits[0]!);
    expect(stats.peakDamage[1]).toBe(s.fighters[1]!.damage);
    expect(stats.hits[1]).toBe(0);
  });

  it('counts attacks caught on a shield', () => {
    const stats = new MatchStats(2);
    play(duel(), 40, (i) => (i === 10 ? Btn.Attack : 0), () => Btn.Dodge, stats);
    expect(stats.shielded[1]).toBe(1);
    expect(stats.hits[0]).toBe(0);
  });

  it('counts ledge grabs and self-destructs', () => {
    const stats = new MatchStats(2);
    const s = duel();
    const f = s.fighters[0]!;
    f.x = px(380 + 40);
    f.y = px(50);
    f.ground = -1;
    f.action = Action.Air;
    let n = play(s, 30, () => 0, () => 0, stats);
    expect(stats.ledgeGrabs[0]).toBe(1);
    n = play(n, 200, (i) => (i === 10 ? Btn.Right : 0), () => 0, stats); // let go away from the stage, fall
    expect(stats.selfDestructs[0]).toBe(1);
    expect(stats.kos[1]).toBe(0);
  });
});

describe('results', () => {
  it('every stat row has one value per player, and awards go to whoever alone is best', () => {
    const stats = new MatchStats(2);
    const final = play(duel(), 1500, (i) => (i % 6 === 0 && i < 18 ? Btn.Attack : 0), () => 0, stats);
    const r = matchResult('cpu', [0, 0], final, stats);
    for (const row of STAT_ROWS) expect(row.values(r)).toHaveLength(2);
    const awards = awardsFor(r);
    expect(awards[0]).toBe('Untouchable'); // P2 took all the damage
    expect(awards[1]).toBeNull();
  });
});
