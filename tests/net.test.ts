import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_INPUT_DELAY, DISCONNECT_MS, MAX_ROLLBACK, Session } from '../src/net/session';
import { FRAME_MS } from '../src/net/sync';
import { FakeNetwork, type NetConditions } from '../src/net/transports/fakeNetwork';
import { LoopbackTransport } from '../src/net/transports/loopback';
import type { Transport } from '../src/net/transports/transport';
import { Btn, type InputBits } from '../src/sim/input';
import { MATCH_ON, matchWinner } from '../src/sim/outcome';
import { ReplayPlayer, type Replay } from '../src/sim/replay';
import { createMatch, hashState, type MatchSetup } from '../src/sim/state';
import { step } from '../src/sim/step';
import { masher, type InputSource } from './masher';

const SETUP: MatchSetup = { seed: 77, stageId: 0, chars: [0, 1], stocks: 99 };
/** The M5 target: playable at 100 ms (one way) and 5% loss. */
const TARGET: NetConditions = { latencyMs: 100, jitterMs: 10, lossPercent: 5 };

interface RigOptions {
  /** Network conditions; none means a perfect loopback link. */
  conditions?: NetConditions;
  setups?: [MatchSetup, MatchSetup];
  delays?: [number, number];
  seed?: number;
  /** Wrap each end of the link (e.g. to duplicate packets). */
  wrap?: (t: Transport) => Transport;
}

/** Both peers of a match in one process, on a virtual clock. */
class Rig {
  t = 0;
  readonly net: FakeNetwork | null;
  readonly sessions: [Session, Session];
  /** confirmedHashes[peer][i]: hashState of that peer's confirmed frame i + 1. */
  readonly confirmedHashes: [number[], number[]] = [[], []];
  private mashers: [InputSource, InputSource];

  constructor(o: RigOptions = {}) {
    const now = () => this.t;
    const seed = o.seed ?? 1;
    this.net = o.conditions ? new FakeNetwork({ ...o.conditions }, now, seed) : null;
    let ends: Transport[] = this.net ? this.net.ends : LoopbackTransport.pair();
    if (o.wrap) ends = ends.map(o.wrap);
    this.sessions = [0, 1].map(
      (p) =>
        new Session({
          setup: o.setups?.[p] ?? SETUP,
          localPlayer: p,
          transport: ends[p]!,
          now,
          inputDelay: o.delays?.[p],
          onConfirm: (_prev, next) => this.confirmedHashes[p]!.push(hashState(next)),
        }),
    ) as [Session, Session];
    this.mashers = [masher(seed * 2 + 1), masher(seed * 2 + 2)];
  }

  /** One 60 Hz tick: deliver due packets, then tick each peer (null: that peer is frozen this tick). */
  tick(inputs: readonly (InputBits | null)[]): void {
    this.t += FRAME_MS;
    this.net?.pump();
    this.sessions.forEach((s, p) => {
      const input = inputs[p];
      if (input !== null && input !== undefined) s.tick(input);
    });
  }

  /** Each peer mashes, deciding from what it sees: its own, partly predicted, state. */
  mash(ticks: number, each?: (tick: number) => void): void {
    for (let i = 0; i < ticks; i++) {
      each?.(i);
      this.tick(this.sessions.map((s, p) => this.mashers[p]!(s.state)[p]!));
    }
  }

  /** Both peers confirmed the same match, frame for frame identical to an offline run of its inputs. */
  expectAgreement(minFrames: number): void {
    const [a, b] = this.sessions;
    expect(a.desyncFrame).toBe(-1);
    expect(b.desyncFrame).toBe(-1);
    const n = Math.min(a.replay.inputs.length, b.replay.inputs.length);
    expect(n).toBeGreaterThanOrEqual(minFrames);
    expect(firstDifference(a.replay.inputs, b.replay.inputs, n)).toBe(-1);
    const sums = Math.min(a.replay.checksums.length, b.replay.checksums.length);
    expect(sums).toBeGreaterThan(0);
    expect(a.replay.checksums.slice(0, sums)).toEqual(b.replay.checksums.slice(0, sums));
    expect(Math.min(a.checksumsMatched, b.checksumsMatched)).toBeGreaterThanOrEqual(sums - 2);

    const offline = offlineHashes(a.replay);
    this.confirmedHashes.forEach((hashes) => {
      expect(firstDifference(hashes, offline.slice(1), hashes.length)).toBe(-1);
    });
    expect(new ReplayPlayer(a.replay).seek(n)).toBeTruthy();
  }
}

/** hashState at every frame of an offline playback (index = frame); also checks the replay's own checksums. */
function offlineHashes(replay: Replay): number[] {
  const player = new ReplayPlayer(replay);
  const hashes = [hashState(player.state)];
  while (!player.done) hashes.push(hashState(player.step()));
  expect(player.desyncFrame).toBe(-1);
  return hashes;
}

function firstDifference<T>(a: readonly T[], b: readonly T[], n: number): number {
  for (let i = 0; i < n; i++) if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return i;
  return -1;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('rollback session', () => {
  it('over a perfect link, both peers confirm exactly what an offline run of the same inputs produces', () => {
    const rig = new Rig();
    rig.mash(3000);
    rig.expectAgreement(2990);
    for (const s of rig.sessions) {
      expect(s.stats.stalls).toBe(0);
      expect(s.stats.skips).toBe(0);
    }
  });

  it(`at ${TARGET.latencyMs} ms latency, ${TARGET.jitterMs} ms jitter and ${TARGET.lossPercent}% loss: no desync, shallow rollbacks, no waiting`, () => {
    const rig = new Rig({ conditions: TARGET });
    rig.mash(7200);
    rig.expectAgreement(7150);
    expect(rig.net!.lost).toBeGreaterThan(500);
    for (const s of rig.sessions) {
      expect(s.stats.rollbacks).toBeGreaterThan(300);
      expect(s.stats.maxRollbackDepth).toBeLessThanOrEqual(MAX_ROLLBACK);
      expect(s.stats.stalls).toBeLessThanOrEqual(5);
      expect(s.stats.skips).toBeLessThanOrEqual(5);
      expect(s.state.frame).toBeGreaterThanOrEqual(7190);
      expect(s.stats.pingMs).toBeGreaterThan(200);
      expect(s.stats.pingMs).toBeLessThan(260);
    }
  });

  it('stays in sync through heavy jitter (packets out of order) and duplicated packets', () => {
    const doubled = (t: Transport): Transport => ({
      send: (bytes) => {
        t.send(bytes);
        t.send(bytes);
      },
      onMessage: (cb) => t.onMessage(cb),
    });
    const rig = new Rig({ conditions: { latencyMs: 40, jitterMs: 80, lossPercent: 10 }, wrap: doubled, seed: 5 });
    rig.mash(3000);
    rig.expectAgreement(2950);
  });

  it('stays in sync while the input delay changes mid-match, and with different delays on each side', () => {
    const rig = new Rig({ conditions: { latencyMs: 60, jitterMs: 20, lossPercent: 5 }, delays: [0, 4], seed: 3 });
    const plan = [2, 4, 0, 3, 1, 4];
    rig.mash(3000, (i) => {
      if (i % 500 === 0) rig.sessions[0].inputDelay = plan[i / 500]!;
    });
    rig.expectAgreement(2950);
    expect(rig.sessions[1].inputDelay).toBe(4);
  });

  it('applies a local input `inputDelay` frames after it is pressed', () => {
    const rig = new Rig({ delays: [3, 0] });
    expect(rig.sessions[0].inputDelay).toBe(3);
    for (let i = 0; i < 10; i++) rig.tick([0, 0]);
    rig.tick([Btn.Jump, Btn.Attack]); // both peers are at frame 10
    for (let i = 0; i < 20; i++) rig.tick([0, 0]);
    const p1 = rig.sessions[0].replay.inputs.map((f) => f[0]);
    const p2 = rig.sessions[1].replay.inputs.map((f) => f[1]);
    expect(p1.indexOf(Btn.Jump)).toBe(13);
    expect(p1.filter((v) => v !== 0).length).toBe(1);
    expect(p2.indexOf(Btn.Attack)).toBe(10);
    expect(p2.filter((v) => v !== 0).length).toBe(1);
  });

  it('predicts the remote player holds their last input, and rewinds to the exact frame a late input changed', () => {
    // 45 ms one way: a packet sent on one tick arrives three ticks later.
    const rig = new Rig({ conditions: { latencyMs: 45, jitterMs: 0, lossPercent: 0 }, delays: [0, 0] });
    const [a, b] = rig.sessions;
    for (let i = 0; i < 30; i++) rig.tick([0, 0]);
    expect(b.state.frame).toBe(30);
    for (let i = 0; i < 40; i++) rig.tick([0, Btn.Right]); // P2 walks right from frame 30 on

    // P1 simulated frames 30-32 before hearing about it, then rolled back to 30 once.
    // From then on "still holding right" was the right guess: no more rollbacks.
    expect(a.stats.rollbacks).toBe(1);
    expect(a.stats.maxRollbackDepth).toBe(3);
    let s = createMatch(SETUP);
    while (s.frame < a.state.frame) s = step(s, [0, s.frame >= 30 ? Btn.Right : 0]);
    expect(hashState(a.state)).toBe(hashState(s));
    expect(b.stats.rollbacks).toBe(0); // P1 never pressed anything: always predicted right
  });

  it(`never runs more than MAX_ROLLBACK frames past the remote's inputs; time sync then brings the peers together`, () => {
    const rig = new Rig({ conditions: { latencyMs: 30, jitterMs: 0, lossPercent: 0 } });
    const [a, b] = rig.sessions;
    for (let i = 0; i < 40; i++) rig.tick([0, null]); // P2's machine hasn't started yet
    expect(a.state.frame).toBe(MAX_ROLLBACK);
    expect(a.waiting).toBe(true);
    expect(a.stats.stalls).toBe(40 - MAX_ROLLBACK);

    rig.mash(1200);
    expect(a.stats.skips).toBeGreaterThan(2);
    expect(b.stats.skips).toBe(0);
    expect(Math.abs(a.state.frame - b.state.frame)).toBeLessThanOrEqual(1);
    expect(Math.abs(a.localAdvantage - b.localAdvantage)).toBeLessThan(2);
    rig.expectAgreement(1150);
  });

  it(`gives up after ${DISCONNECT_MS} ms without a packet`, () => {
    const rig = new Rig();
    const a = rig.sessions[0];
    for (let i = 0; i < 170; i++) rig.tick([0, null]);
    expect(a.disconnected).toBe(false);
    for (let i = 0; i < 20; i++) rig.tick([0, null]);
    expect(a.disconnected).toBe(true);
    const frame = a.state.frame;
    rig.tick([0, 0]);
    expect(a.state.frame).toBe(frame);
  });

  it('peers whose simulations differ both report DESYNC at the first checksum and log both states', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Different seeds: the states differ (in the RNG) from frame 0 on.
    const rig = new Rig({ setups: [SETUP, { ...SETUP, seed: SETUP.seed + 1 }] });
    rig.mash(200);
    expect(rig.sessions.map((s) => s.desyncFrame)).toEqual([60, 60]);
    expect(errors).toHaveBeenCalledTimes(2);
    expect(String(errors.mock.calls[0]![0])).toContain('DESYNC at frame 60');
    const logged = logs.mock.calls.map((c) => String(c[0]));
    expect(logged.filter((l) => l.startsWith('Local state at frame 60')).length).toBe(2);
    // The state is sent several times in case one is lost; repeats aren't logged again.
    expect(logged.filter((l) => l.startsWith('Remote state at frame 60')).length).toBe(2);
    const diffs = logs.mock.calls.filter((c) => String(c[0]).startsWith('Differences')).map((c) => c[1] as string[]);
    expect(diffs.length).toBe(2);
    for (const diff of diffs) {
      expect(diff.length).toBe(1);
      expect(diff[0]).toMatch(/^rng: /);
    }
  });

  it('corruptState() is caught by the next checksum on both sides, over a lossy link', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
    const rig = new Rig({ conditions: { ...TARGET, lossPercent: 20 } });
    rig.mash(300);
    expect(rig.sessions[0].desyncFrame).toBe(-1);
    rig.sessions[1].corruptState();
    rig.mash(200);
    for (const s of rig.sessions) {
      expect(s.desyncFrame).toBeGreaterThanOrEqual(300);
      expect(s.desyncFrame).toBeLessThanOrEqual(360);
    }
    const diffs = logs.mock.calls.filter((c) => String(c[0]).startsWith('Differences')).map((c) => c[1] as string[]);
    expect(diffs.length).toBe(2);
    for (const diff of diffs) expect(diff.some((d) => d.startsWith('P1.damage: '))).toBe(true);
  });

  it('a finished match stops both peers on the same frame with identical replays', () => {
    const rig = new Rig({ conditions: TARGET, setups: [{ ...SETUP, stocks: 1 }, { ...SETUP, stocks: 1 }], seed: 4 });
    const [a, b] = rig.sessions;
    let ticks = 0;
    while (!(a.finished && b.finished) && ticks < 20000) {
      rig.mash(1);
      ticks++;
    }
    expect(a.finished && b.finished).toBe(true);
    rig.mash(60);
    expect(a.confirmed.frame).toBe(b.confirmed.frame);
    expect(a.replay).toEqual(b.replay);
    expect(matchWinner(a.confirmed)).not.toBe(MATCH_ON);
    expect(matchWinner(a.confirmed)).toBe(matchWinner(b.confirmed));
    // The replay ends on the deciding frame, like a local match's.
    const player = new ReplayPlayer(a.replay);
    while (!player.done) player.step();
    expect(hashState(player.state)).toBe(hashState(a.confirmed));
    expect(player.desyncFrame).toBe(-1);
    const frame = a.state.frame;
    rig.mash(30);
    expect(a.state.frame).toBe(frame);
  });

  it('defaults to a 2-frame input delay and clamps it to 0-4', () => {
    const rig = new Rig();
    const a = rig.sessions[0];
    expect(a.inputDelay).toBe(DEFAULT_INPUT_DELAY);
    a.inputDelay = 9;
    expect(a.inputDelay).toBe(4);
    a.inputDelay = -1;
    expect(a.inputDelay).toBe(0);
  });
});
