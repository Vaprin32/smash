import { describe, expect, it } from 'vitest';
import { nextRandom } from '../src/sim/rng';
import {
  cloneState,
  createMatch,
  deserializeState,
  FIGHTER_FIELDS,
  hashState,
  serializeState,
} from '../src/sim/state';

const setup = { seed: 1234, stageId: 0, chars: [0, 0], stocks: 3 };

describe('MatchState', () => {
  it('FIGHTER_FIELDS lists every fighter field exactly once', () => {
    const f = createMatch(setup).fighters[0]!;
    expect([...FIGHTER_FIELDS].sort()).toEqual(Object.keys(f).sort());
  });

  it('serialize/deserialize round-trips', () => {
    const s = createMatch(setup);
    s.fighters[1]!.vx = -1234;
    expect(deserializeState(serializeState(s))).toEqual(s);
  });

  it('hash is stable and sensitive to every change', () => {
    const a = createMatch(setup);
    const b = createMatch(setup);
    expect(hashState(a)).toBe(hashState(b));
    b.fighters[0]!.prevInput = 1;
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('cloneState is deep', () => {
    const a = createMatch(setup);
    const b = cloneState(a);
    b.fighters[0]!.x += 1;
    expect(a.fighters[0]!.x).not.toBe(b.fighters[0]!.x);
  });

  it('rng is seeded, deterministic and stored in state', () => {
    const a = createMatch(setup);
    const b = createMatch(setup);
    const seqA = [nextRandom(a), nextRandom(a), nextRandom(a)];
    const seqB = [nextRandom(b), nextRandom(b), nextRandom(b)];
    expect(seqA).toEqual(seqB);
    expect(new Set(seqA).size).toBe(3);
    expect(a.rng).toBe(b.rng);
  });
});
