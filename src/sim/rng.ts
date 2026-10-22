// xorshift32. The RNG state lives in MatchState.rng so rollback restores it.

import type { MatchState } from './state';

/** Turn any integer seed into a valid (non-zero) xorshift32 state. */
export function seedRng(seed: number): number {
  const s = seed | 0;
  return s === 0 ? 0x2545f491 : s;
}

/** Advance the state's RNG and return an unsigned 32-bit integer. */
export function nextRandom(state: MatchState): number {
  let x = state.rng | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rng = x | 0;
  return x >>> 0;
}

/** Random integer in [0, n). */
export function randomInt(state: MatchState, n: number): number {
  return nextRandom(state) % n;
}
