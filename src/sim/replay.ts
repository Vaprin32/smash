// A match recorded as its setup (seed, stage, fighters, stocks) plus every
// frame's inputs. step() is deterministic, so that is all it takes to
// reproduce the match exactly. Replays are plain data (JSON-safe).

import { clamp, idiv } from './fixed';
import type { InputBits } from './input';
import { createMatch, hashState, type MatchSetup, type MatchState } from './state';
import { step } from './step';

/** A replay stores hashState every this many frames, so playback can check itself. */
export const CHECKSUM_INTERVAL = 60;

export interface Replay {
  setup: MatchSetup;
  /** inputs[f][player]: the input for the step from frame f to frame f + 1. */
  inputs: InputBits[][];
  /** checksums[i] = hashState at frame (i + 1) * CHECKSUM_INTERVAL. */
  checksums: number[];
}

export function newReplay(setup: MatchSetup): Replay {
  return { setup: { ...setup, chars: [...setup.chars] }, inputs: [], checksums: [] };
}

/**
 * Advance `state` (which must be the replay's latest frame) by one frame and
 * append that frame to the replay. Returns the new state.
 */
export function recordStep(replay: Replay, state: MatchState, inputs: readonly InputBits[]): MatchState {
  const next = step(state, inputs);
  replay.inputs.push([...inputs]);
  if (next.frame % CHECKSUM_INTERVAL === 0) replay.checksums.push(hashState(next));
  return next;
}

/** Plays a replay back one frame at a time and checks it against the recorded checksums. */
export class ReplayPlayer {
  state: MatchState;
  /** First frame whose hash differed from the recording, or -1 while all match. */
  desyncFrame = -1;
  /**
   * snapshots[i] = the state at frame i * CHECKSUM_INTERVAL, once reached.
   * step() never mutates a state, so keeping references is safe.
   */
  private snapshots: MatchState[];

  constructor(readonly replay: Replay) {
    this.state = createMatch(replay.setup);
    this.snapshots = [this.state];
  }

  get length(): number {
    return this.replay.inputs.length;
  }

  get done(): boolean {
    return this.state.frame >= this.length;
  }

  /** Simulate the next recorded frame (no-op once done). Returns the new state. */
  step(): MatchState {
    if (this.done) return this.state;
    const s = step(this.state, this.replay.inputs[this.state.frame]!);
    this.state = s;
    if (s.frame % CHECKSUM_INTERVAL === 0) {
      const i = idiv(s.frame, CHECKSUM_INTERVAL);
      this.snapshots[i] = s;
      const expected = this.replay.checksums[i - 1];
      if (this.desyncFrame < 0 && expected !== undefined && expected !== hashState(s)) this.desyncFrame = s.frame;
    }
    return s;
  }

  /** Go to `frame` (clamped to the replay): back to the nearest snapshot, then simulate forward. */
  seek(frame: number): MatchState {
    const target = clamp(frame, 0, this.length);
    if (target < this.state.frame) this.state = this.snapshots[idiv(target, CHECKSUM_INTERVAL)]!;
    while (this.state.frame < target) this.step();
    return this.state;
  }
}
