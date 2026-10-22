import { beforeAll, describe, expect, it } from 'vitest';
import { Action } from '../src/sim/actions';
import { SimEvent } from '../src/sim/events';
import { FIGHTERS } from '../src/sim/fighters';
import { Btn } from '../src/sim/input';
import { CHECKSUM_INTERVAL, newReplay, recordStep, ReplayPlayer, type Replay } from '../src/sim/replay';
import {
  cloneState,
  createMatch,
  deserializeState,
  FIGHTER_FIELDS,
  hashState,
  serializeState,
  type MatchState,
} from '../src/sim/state';
import { step } from '../src/sim/step';
import { masher } from './masher';

const FRAMES = 12_000;
/** Covers all eight fighters, plus a mirror match. */
const PAIRS: [number, number][] = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [7, 7],
];
const SAVE_EVERY = 400;
/** Frames re-simulated after each restore: one rollback window and a longer stretch. */
const RESIM_SPANS = [8, 120];

interface Recording {
  replay: Replay;
  /** hashes[f] = hashState at frame f (hashes[0] is the initial state). */
  hashes: number[];
  /** First frame whose state held a non-int32 value, or -1. */
  nonInteger: number;
  /** First frame where step() changed the state it was given, or -1. */
  mutated: number;
  hits: number;
  kos: number;
  shieldHits: number;
  grabs: number;
  movesUsed: Set<number>;
}

function isInt32(v: number): boolean {
  return Number.isInteger(v) && v === (v | 0);
}

function allInt32(s: MatchState): boolean {
  if (![s.frame, s.rng, s.stageId].every(isInt32)) return false;
  return s.fighters.every((f) => FIGHTER_FIELDS.every((k) => isInt32(f[k])));
}

/** Play a random match for FRAMES frames, recording it and checking every frame on the way. */
function record(chars: [number, number]): Recording {
  const replay = newReplay({ seed: 0x5eed + chars[0] * 8 + chars[1], stageId: 0, chars, stocks: 99 });
  const input = masher(0xbeef + chars[0] * 8 + chars[1]);
  const rec: Recording = {
    replay,
    hashes: [],
    nonInteger: -1,
    mutated: -1,
    hits: 0,
    kos: 0,
    shieldHits: 0,
    grabs: 0,
    movesUsed: new Set(),
  };
  let s = createMatch(replay.setup);
  rec.hashes.push(hashState(s));
  for (let i = 0; i < FRAMES; i++) {
    const before = rec.hashes[i]!;
    const next = recordStep(replay, s, input(s));
    if (rec.mutated < 0 && hashState(s) !== before) rec.mutated = s.frame;
    s = next;
    rec.hashes.push(hashState(s));
    if (rec.nonInteger < 0 && !allInt32(s)) rec.nonInteger = s.frame;
    for (const f of s.fighters) {
      if (f.event === SimEvent.Hit) rec.hits++;
      if (f.event === SimEvent.KO) rec.kos++;
      if (f.event === SimEvent.ShieldHit) rec.shieldHits++;
      if (f.event === SimEvent.Grab) rec.grabs++;
      if (f.action === Action.Attack) rec.movesUsed.add(f.charId * 64 + f.move);
    }
  }
  return rec;
}

/** First frame (from `from`) where re-simulating `count` frames of `rec` disagrees with it, or -1. */
function firstMismatch(rec: Recording, start: MatchState, count: number): number {
  let s = start;
  if (hashState(s) !== rec.hashes[s.frame]) return s.frame;
  for (let i = 0; i < count && s.frame < rec.replay.inputs.length; i++) {
    s = step(s, rec.replay.inputs[s.frame]!);
    if (hashState(s) !== rec.hashes[s.frame]) return s.frame;
  }
  return -1;
}

const pairName = ([a, b]: [number, number]) => `${FIGHTERS[a]!.name} vs ${FIGHTERS[b]!.name}`;

describe.each(PAIRS.map((p) => [pairName(p), p] as const))('determinism, %s', (_name, chars) => {
  let rec: Recording;
  beforeAll(() => {
    rec = record(chars);
  });

  it(`the random run is a real fight (hits, shields or grabs, KOs, many moves) over ${FRAMES} frames`, () => {
    expect(rec.replay.inputs.length).toBe(FRAMES);
    expect(rec.hits).toBeGreaterThan(30);
    expect(rec.shieldHits + rec.grabs).toBeGreaterThan(1);
    expect(rec.kos).toBeGreaterThan(1);
    // Distinct (fighter, move) pairs used; a mirror match has one fighter's moves.
    expect(rec.movesUsed.size).toBeGreaterThan(chars[0] === chars[1] ? 15 : 30);
  });

  it('state stays all int32 integers, and step() never mutates its input', () => {
    expect(rec.nonInteger).toBe(-1);
    expect(rec.mutated).toBe(-1);
  });

  it('(a) the recorded replay plays back identically, twice, and after a JSON round-trip', () => {
    const copy = JSON.parse(JSON.stringify(rec.replay)) as Replay;
    for (const replay of [rec.replay, rec.replay, copy]) {
      const player = new ReplayPlayer(replay);
      let mismatch = -1;
      while (!player.done) {
        const s = player.step();
        if (mismatch < 0 && hashState(s) !== rec.hashes[s.frame]) mismatch = s.frame;
      }
      expect(mismatch).toBe(-1);
      expect(player.desyncFrame).toBe(-1);
      expect(player.state.frame).toBe(FRAMES);
    }
    expect(rec.replay.checksums.length).toBe(Math.floor(FRAMES / CHECKSUM_INTERVAL));
  });

  it('(b) two runs of the random inputs, stepped side by side, hash identically every frame', () => {
    let a = createMatch(rec.replay.setup);
    let b = createMatch(rec.replay.setup);
    let mismatch = -1;
    for (const inputs of rec.replay.inputs) {
      a = step(a, inputs);
      b = step(b, inputs);
      const h = hashState(a);
      if (mismatch < 0 && (h !== hashState(b) || h !== rec.hashes[a.frame])) mismatch = a.frame;
    }
    expect(mismatch).toBe(-1);
    expect(a.frame).toBe(FRAMES);
  });

  it('(c) save at N, simulate to M, restore N, re-simulate to M: identical, from a clone or from bytes', () => {
    let s = createMatch(rec.replay.setup);
    const saves: { clone: MatchState; bytes: Uint8Array }[] = [];
    for (const inputs of rec.replay.inputs) {
      if (s.frame % SAVE_EVERY === 0) saves.push({ clone: cloneState(s), bytes: serializeState(s) });
      s = step(s, inputs);
    }
    expect(saves.length).toBe(FRAMES / SAVE_EVERY);

    let diverged = 0;
    for (const { clone, bytes } of saves) {
      const n = clone.frame;
      for (const span of RESIM_SPANS) {
        expect(firstMismatch(rec, cloneState(clone), span), `clone of frame ${n}, +${span}`).toBe(-1);
        expect(firstMismatch(rec, deserializeState(bytes), span), `bytes of frame ${n}, +${span}`).toBe(-1);
      }
      // A rollback: branch off the saved state on mispredicted (random) inputs,
      // then go back to it and replay the real inputs.
      const wrong = masher(n + 1);
      let ahead = clone;
      for (let i = 0; i < 8; i++) ahead = step(ahead, wrong(ahead));
      if (hashState(ahead) !== rec.hashes[n + 8]) diverged++;
      expect(firstMismatch(rec, clone, 8), `rollback to frame ${n}`).toBe(-1);
      // The saved state itself was never touched.
      expect(hashState(clone)).toBe(rec.hashes[n]);
    }
    expect(diverged).toBeGreaterThan(saves.length / 2);
  });
});

/** A 600-frame random 3-stock match, and the hash of every frame. */
function shortReplay(seed: number): { replay: Replay; hashes: number[] } {
  const replay = newReplay({ seed, stageId: 0, chars: [0, 1], stocks: 3 });
  const input = masher(seed);
  let s = createMatch(replay.setup);
  const hashes = [hashState(s)];
  for (let i = 0; i < 600; i++) {
    s = recordStep(replay, s, input(s));
    hashes.push(hashState(s));
  }
  return { replay, hashes };
}

describe('replay player', () => {
  it('playback flags the first checksum after a tampered input', () => {
    const { replay } = shortReplay(7);
    const clean = new ReplayPlayer(replay);
    while (!clean.done) clean.step();
    expect(clean.desyncFrame).toBe(-1);

    // P1 walks right for frames 10-49 instead: the first checksum (frame 60) must catch it.
    const tampered: Replay = { ...replay, inputs: replay.inputs.map((f) => [...f]) };
    for (let i = 10; i < 50; i++) tampered.inputs[i]![0] = Btn.Right;
    const player = new ReplayPlayer(tampered);
    while (!player.done) player.step();
    expect(player.desyncFrame).toBe(CHECKSUM_INTERVAL);
  });

  it('seeking back and forth lands on the same states as playing straight through', () => {
    const { replay, hashes } = shortReplay(11);
    const player = new ReplayPlayer(replay);
    for (const target of [450, 130, 131, 599, 0, 600, 59, 61, 60, 1000, -5, 300]) {
      const frame = Math.max(0, Math.min(600, target));
      const s = player.seek(target);
      expect(s.frame, `seek ${target}`).toBe(frame);
      expect(hashState(s), `seek ${target}`).toBe(hashes[frame]);
    }
    expect(player.desyncFrame).toBe(-1);
  });

  it('records the setup by value', () => {
    const chars = [2, 5];
    const replay = newReplay({ seed: 1, stageId: 0, chars, stocks: 3 });
    chars[0] = 7;
    expect(replay.setup.chars).toEqual([2, 5]);
  });
});
