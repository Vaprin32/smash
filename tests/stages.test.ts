import { describe, expect, it } from 'vitest';
import { CpuPlayer } from '../src/ai/cpu';
import { CPU_LEVELS } from '../src/ai/levels';
import { Action } from '../src/sim/actions';
import { FIGHTERS } from '../src/sim/fighters';
import { px } from '../src/sim/fixed';
import { MATCH_ON, matchWinner } from '../src/sim/outcome';
import { newReplay, recordStep, ReplayPlayer } from '../src/sim/replay';
import { ledgeCount, platformAt, platformGroundIndex, STAGES } from '../src/sim/stage';
import { createMatch, hashState, type MatchState } from '../src/sim/state';
import { step } from '../src/sim/step';
import { masher } from './masher';

const BRIDGE = STAGES.findIndex((s) => s.name === 'Sunset Bridge');
const bridge = STAGES[BRIDGE]!;
const LIFT = bridge.platforms.findIndex((p) => p.sway);

describe('stages', () => {
  it('every stage has spawns for 1-4 players, respawns, ledges and a blast zone around everything', () => {
    for (const st of STAGES) {
      expect(st.name.length).toBeGreaterThan(0);
      for (let n = 1; n <= 4; n++) expect(st.spawns[n - 1]).toHaveLength(n);
      expect(st.respawns.length).toBeGreaterThanOrEqual(4);
      expect(ledgeCount(st)).toBeGreaterThanOrEqual(2);
      for (const b of st.blocks) {
        expect(b.left).toBeGreaterThan(st.blast.left);
        expect(b.right).toBeLessThan(st.blast.right);
      }
    }
  });

  it('the bridge lift moves smoothly back and forth, and only depends on the frame', () => {
    const at = (f: number) => platformAt(bridge, LIFT, f).left;
    const period = bridge.platforms[LIFT]!.sway!.period;
    expect(at(0)).toBe(bridge.platforms[LIFT]!.left);
    expect(at(period / 4)).toBe(bridge.platforms[LIFT]!.left + bridge.platforms[LIFT]!.sway!.dx);
    expect(at(period)).toBe(at(0));
    for (let f = 1; f < period; f++) expect(Math.abs(at(f) - at(f - 1))).toBeLessThanOrEqual(px(3));
  });

  it('standing on the lift rides along with it', () => {
    let s = createMatch({ seed: 1, stageId: BRIDGE, chars: [0, 1], stocks: 3 });
    const f = s.fighters[0]!;
    const lift = platformAt(bridge, LIFT, 0);
    f.x = (lift.left + lift.right) >> 1;
    f.y = lift.top;
    f.ground = platformGroundIndex(bridge, LIFT);
    const offset = f.x - lift.left;
    for (let i = 0; i < 120; i++) {
      s = step(s, [0, 0]);
      const now = platformAt(bridge, LIFT, s.frame);
      expect(s.fighters[0]!.ground).toBe(platformGroundIndex(bridge, LIFT));
      expect(s.fighters[0]!.x - now.left).toBe(offset);
      expect(s.fighters[0]!.y).toBe(now.top);
    }
  });

  it('falling onto the lift lands on it wherever it has moved to', () => {
    let s = createMatch({ seed: 1, stageId: BRIDGE, chars: [0, 1], stocks: 3 });
    s.frame = 150; // the lift is at its right end
    const lift = platformAt(bridge, LIFT, 170);
    const f = s.fighters[0]!;
    f.x = (lift.left + lift.right) >> 1;
    f.y = lift.top - px(60);
    f.ground = -1;
    f.action = Action.Air;
    for (let i = 0; i < 40 && s.fighters[0]!.ground < 0; i++) s = step(s, [0, 0]);
    expect(s.fighters[0]!.ground).toBe(platformGroundIndex(bridge, LIFT));
  });

  it('random brawls on every stage replay identically', () => {
    STAGES.forEach((_, stageId) => {
      const setup = { seed: 9, stageId, chars: [4, 6], stocks: 99 };
      const inputs = masher(31 + stageId);
      let s: MatchState = createMatch(setup);
      const replay = newReplay(setup);
      for (let i = 0; i < 4000; i++) s = recordStep(replay, s, inputs(s));
      const player = new ReplayPlayer(replay);
      while (!player.done) player.step();
      expect(hashState(player.state)).toBe(hashState(s));
    });
  });

  it('on the bridge, a CPU beats an idle dummy without falling off by itself', () => {
    FIGHTERS.forEach((def, c) => {
      let s = createMatch({ seed: 5 + c, stageId: BRIDGE, chars: [c, (c + 5) % 8], stocks: 3 });
      const cpu = new CpuPlayer(0, CPU_LEVELS[1]!, 5 + c);
      while (s.frame < 4 * 60 * 60 && matchWinner(s) === MATCH_ON) s = step(s, [cpu.think(s), 0]);
      expect(matchWinner(s), def.name).toBe(0);
      expect(s.fighters[0]!.stocks, `${def.name} self-destructed`).toBe(3);
    });
  });
});
