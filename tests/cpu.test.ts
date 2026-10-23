import { describe, expect, it } from 'vitest';
import { CpuPlayer } from '../src/ai/cpu';
import { CPU_LEVELS } from '../src/ai/levels';
import { Action } from '../src/sim/actions';
import { FIGHTERS } from '../src/sim/fighters';
import { px } from '../src/sim/fixed';
import { DRAW, MATCH_ON, matchWinner } from '../src/sim/outcome';
import { newReplay, recordStep, ReplayPlayer } from '../src/sim/replay';
import { STAGES } from '../src/sim/stage';
import { createMatch, hashState, type MatchState } from '../src/sim/state';
import { step } from '../src/sim/step';
import { matchResult, MatchStats } from '../src/ui/results';

const [EASY, NORMAL, HARD] = [0, 1, 2].map((i) => CPU_LEVELS[i]!);
const MINUTE = 60 * 60;

/** Play a match where `levels[i]` (or null: an idle dummy) controls slot i. */
function play(chars: number[], levels: (typeof EASY | null)[], seed: number, maxFrames: number) {
  let s = createMatch({ seed, stageId: 0, chars, stocks: 3 });
  const cpus = levels.map((lv, i) => (lv ? new CpuPlayer(i, lv, seed) : null));
  const stats = new MatchStats(chars.length);
  const replay = newReplay({ seed, stageId: 0, chars, stocks: 3 });
  let selfDestructs = 0;
  while (s.frame < maxFrames && matchWinner(s) === MATCH_ON) {
    const prev = s;
    s = recordStep(replay, s, cpus.map((c) => c?.think(s) ?? 0));
    stats.onStep(prev, s);
    s.fighters.forEach((f, i) => {
      if (f.stocks < prev.fighters[i]!.stocks && f.lastHitBy < 0) selfDestructs++;
    });
  }
  return { s, stats, replay, selfDestructs };
}

describe('CPU players', () => {
  it('every fighter gets back to the stage from all around it', () => {
    const stage = STAGES[0]!;
    const edge = stage.blocks[0]!.right;
    // [px past the edge (negative: left side), y, vx, vy]
    const starts = [[100, -40, 0, 0], [200, 0, 0, 0], [150, 60, 0, 0], [300, -200, 0, 0], [60, 120, 0, 0], [-250, -100, 0, 0], [250, -50, 6, -4]];
    FIGHTERS.forEach((def, c) => {
      for (const [dx, y, vx, vy] of starts as [number, number, number, number][]) {
        let s = createMatch({ seed: 3, stageId: 0, chars: [c, 0], stocks: 3 });
        const f = s.fighters[0]!;
        const side = Math.sign(dx);
        f.x = side * (edge + px(Math.abs(dx)));
        f.y = px(y);
        f.vx = side * px(vx);
        f.vy = px(vy);
        f.ground = -1;
        f.action = Action.Air;
        f.facing = side; // facing away from the stage, the harder case
        s.fighters[1]!.x = -side * px(200);
        const cpu = new CpuPlayer(0, NORMAL, 5);
        for (let i = 0; i < 600 && s.fighters[0]!.ground < 0 && s.fighters[0]!.action !== Action.KO; i++) s = step(s, [cpu.think(s), 0]);
        expect(s.fighters[0]!.ground, `${def.name} from ${dx}px out, y ${y}`).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it('at every level, every fighter beats an idle dummy without falling off by itself', () => {
    for (const level of [EASY, NORMAL, HARD]) {
      FIGHTERS.forEach((def, c) => {
        const { s } = play([c, (c + 3) % FIGHTERS.length], [level, null], 11 + c, (level === EASY ? 4 : 3) * MINUTE);
        expect(matchWinner(s), `${level.name} ${def.name}`).toBe(0);
        expect(s.fighters[0]!.stocks, `${level.name} ${def.name} self-destructed`).toBe(3);
      });
    }
  });

  it('harder levels beat easier ones', () => {
    const wins = (a: typeof EASY, b: typeof EASY) => {
      let n = 0;
      for (let c = 0; c < FIGHTERS.length; c++) {
        const chars = [c, (c + 5) % FIGHTERS.length];
        // Each pairing plays from both sides.
        if (matchWinner(play(chars, [a, b], 7 + c, 7 * MINUTE).s) === 0) n++;
        if (matchWinner(play(chars, [b, a], 7 + c, 7 * MINUTE).s) === 1) n++;
      }
      return n;
    };
    expect(wins(HARD, NORMAL)).toBeGreaterThanOrEqual(12);
    expect(wins(NORMAL, EASY)).toBeGreaterThanOrEqual(12);
  });

  it('four CPUs play a free-for-all to the end, and it replays exactly', () => {
    for (let g = 0; g < 3; g++) {
      const chars = [g, (g + 2) % 8, (g + 4) % 8, (g + 7) % 8];
      const { s, stats, replay, selfDestructs } = play(chars, [NORMAL, NORMAL, NORMAL, NORMAL], 100 + g, 6 * MINUTE);
      const winner = matchWinner(s);
      expect(winner === MATCH_ON || winner === DRAW, `game ${g} still on after ${s.frame} frames`).toBe(false);
      // Every lost stock is either a KO credited to someone or a self-destruct.
      const kos = stats.kos.reduce((a, b) => a + b, 0);
      expect(kos + selfDestructs).toBe(9 + (3 - s.fighters[winner]!.stocks));
      expect(selfDestructs).toBeLessThanOrEqual(1);

      const result = matchResult('cpu', chars, s, stats);
      expect(result.places[winner]).toBe(1);
      expect([...result.places].sort()).toEqual([1, 2, 3, 4]);

      // CPU inputs are recorded like anyone's, so the replay reproduces the match.
      const player = new ReplayPlayer(replay);
      while (!player.done) player.step();
      expect(hashState(player.state)).toBe(hashState(s));
      expect(player.desyncFrame).toBe(-1);
    }
  });

  it('presses the same buttons given the same match, and never touches the state', () => {
    const run = () => {
      let s: MatchState = createMatch({ seed: 42, stageId: 0, chars: [1, 6, 3], stocks: 3 });
      const cpus = [0, 1, 2].map((i) => new CpuPlayer(i, HARD, 42));
      const inputs: number[] = [];
      for (let f = 0; f < 1500; f++) {
        const before = hashState(s);
        const frame = cpus.map((c) => c.think(s));
        expect(hashState(s)).toBe(before);
        inputs.push(...frame);
        s = step(s, frame);
      }
      return inputs;
    };
    expect(run()).toEqual(run());
  });
});

describe('free-for-all bookkeeping', () => {
  it('3- and 4-player matches start everyone on the stage, apart, facing the middle', () => {
    for (const n of [3, 4]) {
      const s = createMatch({ seed: 1, stageId: 0, chars: new Array<number>(n).fill(0), stocks: 3 });
      const xs = s.fighters.map((f) => f.x);
      expect(new Set(xs).size).toBe(n);
      s.fighters.forEach((f) => {
        expect(f.ground).toBe(0);
        expect(f.facing).toBe(f.x > 0 ? -1 : 1);
      });
      const sorted = [...xs].sort((a, b) => a - b);
      for (let i = 1; i < n; i++) expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(px(150));
    }
    expect(new Set(STAGES[0]!.respawns.map((p) => p.x)).size).toBe(4);
  });

  it('places go by who lasted longest; the 2-player layout is unchanged', () => {
    const s = createMatch({ seed: 1, stageId: 0, chars: [0, 1], stocks: 3 });
    expect(s.fighters.map((f) => f.x)).toEqual([px(-180), px(180)]);

    const four = createMatch({ seed: 1, stageId: 0, chars: [0, 1, 2, 3], stocks: 3 });
    const stats = new MatchStats(4);
    stats.outFrame.splice(0, 4, 900, -1, 400, 900); // P2 still in, P1 and P4 out together
    four.fighters.forEach((f, i) => (f.action = i === 1 ? Action.Idle : Action.Out));
    const r = matchResult('cpu', [0, 1, 2, 3], four, stats);
    expect(r.winner).toBe(1);
    expect(r.places).toEqual([2, 1, 4, 2]);
  });

  it('credits damage and KOs to whoever landed the hit', () => {
    const { s, stats } = play([1, 0], [HARD, null], 9, 3 * MINUTE);
    expect(matchWinner(s)).toBe(0);
    expect(stats.kos).toEqual([3, 0]);
    expect(stats.damageDealt[0]).toBeGreaterThan(0);
    expect(stats.damageDealt[1]).toBe(0);
  });
});
