// One peer's side of a 1v1 rollback match (GGPO-style, kept small).
//
// Each tick:
//  1. If a remote input arrived that differs from what we predicted for its
//     frame, rewind to that frame (the last MAX_ROLLBACK states are kept) and
//     re-simulate to the present with the real input.
//  2. Unless we have to wait, schedule the local input `inputDelay` frames
//     ahead and simulate the next frame right away, predicting that the
//     remote player still holds their last known input.
//  3. Confirm the frames that now have both players' real inputs: they go
//     into the replay, and every CHECKSUM_INTERVAL frames their hash is
//     compared with the peer's.
//  4. Send every local input the peer hasn't acknowledged yet.
// We wait (don't advance) when we are MAX_ROLLBACK frames past the last remote
// input we have, and now and then when time sync says we are ahead.

import type { InputBits } from '../sim/input';
import { MATCH_ON, matchWinner } from '../sim/outcome';
import { CHECKSUM_INTERVAL, newReplay, type Replay } from '../sim/replay';
import { createMatch, hashBytes, serializeState, type MatchSetup, type MatchState } from '../sim/state';
import { step } from '../sim/step';
import { DesyncDetector } from './desync';
import { decodeMessage, encodeInputPacket, encodeStateDump, MAX_PACKET_INPUTS, MsgType } from './protocol';
import { TimeSync } from './sync';
import type { Transport } from './transports/transport';

export const MAX_ROLLBACK = 8;
export const DEFAULT_INPUT_DELAY = 2;
export const MAX_INPUT_DELAY = 4;
/** No packet from the peer for this long ends the match. */
export const DISCONNECT_MS = 3000;
/** Saved states: the present frame and the MAX_ROLLBACK before it. */
const RING = MAX_ROLLBACK + 1;
const TICKS_PER_SECOND = 60;

export interface SessionOptions {
  setup: MatchSetup;
  /** The player slot this peer controls (0 or 1). */
  localPlayer: number;
  transport: Transport;
  /** Clock in ms, for ping and disconnect detection. */
  now: () => number;
  inputDelay?: number;
  /** Every simulated frame, re-simulated ones too (`resim`): for effects that dedupe by frame. */
  onStep?: (prev: MatchState, next: MatchState, resim: boolean) => void;
  /** Every frame once it is confirmed, in order. */
  onConfirm?: (prev: MatchState, next: MatchState) => void;
}

export interface NetStats {
  /** Round trip in ms (smoothed), or -1 before the first measure. */
  pingMs: number;
  /** Rollbacks, and the frames they re-simulated, in the whole match. */
  rollbacks: number;
  rollbackFrames: number;
  /** Frames re-simulated during the last second. */
  rollbackFramesPerSec: number;
  /** Deepest rollback during the last second, and in the whole match. */
  rollbackDepth: number;
  maxRollbackDepth: number;
  /** Ticks spent waiting because the peer's inputs were MAX_ROLLBACK frames behind. */
  stalls: number;
  /** Frames skipped by time sync to let the peer catch up. */
  skips: number;
}

export class Session {
  /** Latest simulated state. Frames after `confirmed` used predicted remote input. */
  state: MatchState;
  /** Latest state simulated with both players' real inputs. It never changes again. */
  confirmed: MatchState;
  /** The confirmed frames as a replay, so both peers record the same one. */
  readonly replay: Replay;
  readonly stats: NetStats = {
    pingMs: -1,
    rollbacks: 0,
    rollbackFrames: 0,
    rollbackFramesPerSec: 0,
    rollbackDepth: 0,
    maxRollbackDepth: 0,
    stalls: 0,
    skips: 0,
  };
  /** The confirmed state has a winner. We stop advancing but keep talking, so the peer can confirm it too. */
  finished = false;
  /** No packet from the peer for DISCONNECT_MS; the session has stopped. */
  disconnected = false;
  /** The last tick couldn't advance: the peer's inputs are MAX_ROLLBACK frames behind. */
  waiting = false;
  readonly localPlayer: number;
  readonly remotePlayer: number;

  private delay: number;
  /** inputs[player][frame]. Local: up to the present frame + delay. Remote: real ones only, no gaps. */
  private inputs: InputBits[][] = [[], []];
  /** predicted[frame % RING]: the remote input a not yet confirmed frame was simulated with. */
  private predicted = new Array<InputBits>(RING).fill(0);
  private states = new Array<MatchState | undefined>(RING);
  /** Earliest frame simulated with a wrong prediction since the last rollback, or -1. */
  private rollbackFrom = -1;
  /** The peer has our inputs up to this frame. */
  private remoteAck = -1;
  /** Newest frame the peer reported being at. */
  private remoteFrame = -1;
  /** The peer's latest ping, and our clock when it arrived. */
  private peerPing = -1;
  private peerPingAt = 0;
  private readonly t0: number;
  private lastHeard: number;
  private sync = new TimeSync();
  private desync: DesyncDetector;
  private second = { ticks: 0, frames: 0, depth: 0 };

  constructor(private opts: SessionOptions) {
    if (opts.setup.chars.length !== 2) throw new Error('rollback sessions are 1v1');
    this.localPlayer = opts.localPlayer;
    this.remotePlayer = 1 - opts.localPlayer;
    this.delay = clampDelay(opts.inputDelay ?? DEFAULT_INPUT_DELAY);
    this.state = this.confirmed = createMatch(opts.setup);
    this.save(this.state);
    this.replay = newReplay(opts.setup);
    // Nothing was pressed before the match: the first `delay` frames have no input.
    for (let f = 0; f < this.delay; f++) this.mine.push(0);
    this.t0 = this.lastHeard = opts.now();
    this.desync = new DesyncDetector((frame, bytes) => opts.transport.send(encodeStateDump(frame, bytes)));
    opts.transport.onMessage((bytes) => this.receive(bytes));
  }

  /** Frames between sampling a local input and the frame it applies to (0 to MAX_INPUT_DELAY). Can change mid-match. */
  get inputDelay(): number {
    return this.delay;
  }

  set inputDelay(frames: number) {
    this.delay = clampDelay(frames);
  }

  /** Newest frame we have the remote player's real input for (-1: none). */
  get remoteConfirmed(): number {
    return this.theirs.length - 1;
  }

  /** First frame whose checksums disagreed, or -1. */
  get desyncFrame(): number {
    return this.desync.frame;
  }

  get checksumsMatched(): number {
    return this.desync.matched;
  }

  /** Average frame advantage as we measure it, and as the peer measures theirs. */
  get localAdvantage(): number {
    return this.sync.localAverage;
  }

  get remoteAdvantage(): number {
    return this.sync.remoteAverage;
  }

  /** One 60 Hz tick. `input` is what the local player holds right now. */
  tick(input: InputBits): void {
    if (this.disconnected) return;
    const now = this.opts.now();
    if (now - this.lastHeard > DISCONNECT_MS) {
      this.disconnected = true;
      return;
    }
    this.rollback();
    if (this.mayAdvance()) {
      while (this.mine.length <= this.state.frame + this.delay) this.mine.push(input & 0xffff);
      this.simulate(false);
    }
    this.confirm();
    this.sync.measure(this.state.frame, this.remoteFrame, this.stats.pingMs);
    this.send(now);
    this.countSecond();
  }

  /**
   * Debugging aid: knock this peer's simulation off course (P1 gains 1% from
   * the confirmed frame on), so the next checksum comparison reports a desync.
   */
  corruptState(): void {
    for (const s of this.states) if (s && s.frame >= this.confirmed.frame) s.fighters[0]!.damage++;
  }

  private get mine(): InputBits[] {
    return this.inputs[this.localPlayer]!;
  }

  private get theirs(): InputBits[] {
    return this.inputs[this.remotePlayer]!;
  }

  private mayAdvance(): boolean {
    this.waiting = false;
    if (this.finished) return false;
    if (this.state.frame - this.remoteConfirmed > MAX_ROLLBACK) {
      this.waiting = true;
      this.stats.stalls++;
      return false;
    }
    if (this.sync.shouldWait()) {
      this.stats.skips++;
      return false;
    }
    return true;
  }

  /** Simulate the frame `state` is at: with the real remote input if we have it, else a prediction. */
  private simulate(resim: boolean): void {
    const prev = this.state;
    const f = prev.frame;
    let remote: InputBits;
    if (f < this.theirs.length) {
      remote = this.theirs[f]!;
    } else {
      remote = this.theirs[this.theirs.length - 1] ?? 0; // they still hold what they held last
      this.predicted[f % RING] = remote;
    }
    const local = this.mine[f]!;
    const next = step(prev, this.localPlayer === 0 ? [local, remote] : [remote, local]);
    this.save(next);
    this.state = next;
    this.opts.onStep?.(prev, next, resim);
  }

  /** Re-simulate from the earliest mispredicted frame to the present. */
  private rollback(): void {
    const from = this.rollbackFrom;
    const to = this.state.frame;
    this.rollbackFrom = -1;
    if (from < 0 || from >= to) return;
    this.state = this.load(from);
    while (this.state.frame < to) this.simulate(true);
    const depth = to - from;
    const st = this.stats;
    st.rollbacks++;
    st.rollbackFrames += depth;
    st.maxRollbackDepth = Math.max(st.maxRollbackDepth, depth);
    this.second.frames += depth;
    this.second.depth = Math.max(this.second.depth, depth);
  }

  /** Advance `confirmed` as far as both players' real inputs reach. */
  private confirm(): void {
    let target = Math.min(this.state.frame, this.theirs.length);
    if (this.rollbackFrom >= 0) target = Math.min(target, this.rollbackFrom); // not re-simulated yet
    while (!this.finished && this.confirmed.frame < target) {
      const prev = this.confirmed;
      const f = prev.frame;
      const next = this.load(f + 1);
      const mine = this.mine[f]!, theirs = this.theirs[f]!;
      this.replay.inputs.push(this.localPlayer === 0 ? [mine, theirs] : [theirs, mine]);
      this.confirmed = next;
      this.opts.onConfirm?.(prev, next);
      if (next.frame % CHECKSUM_INTERVAL === 0) {
        const bytes = serializeState(next);
        const hash = hashBytes(bytes);
        this.replay.checksums.push(hash);
        this.desync.addLocal(next.frame, hash, bytes);
      }
      if (matchWinner(next) !== MATCH_ON) this.finished = true;
    }
  }

  private send(now: number): void {
    const start = this.remoteAck + 1;
    const packet = encodeInputPacket({
      frame: this.state.frame,
      ack: this.remoteConfirmed,
      advantage: this.sync.advantage,
      ping: now - this.t0,
      pong: this.peerPing < 0 ? -1 : this.peerPing + (now - this.peerPingAt),
      hashFrame: this.desync.latest.frame,
      hash: this.desync.latest.hash,
      start,
      inputs: this.mine.slice(start, start + MAX_PACKET_INPUTS),
    });
    this.opts.transport.send(packet);
  }

  private receive(bytes: Uint8Array): void {
    if (this.disconnected) return;
    const msg = decodeMessage(bytes);
    if (!msg) return;
    const now = this.opts.now();
    this.lastHeard = now;
    if (msg.type === MsgType.StateDump) {
      this.desync.onRemoteState(msg.frame, msg.bytes);
      return;
    }
    this.remoteAck = Math.max(this.remoteAck, msg.ack);
    this.remoteFrame = Math.max(this.remoteFrame, msg.frame);
    this.sync.onRemote(msg.advantage);
    if (msg.ping > this.peerPing) {
      this.peerPing = msg.ping;
      this.peerPingAt = now;
    }
    if (msg.pong >= 0) this.measurePing(now - this.t0 - msg.pong);
    this.addRemoteInputs(msg.start, msg.inputs);
    this.desync.addRemote(msg.hashFrame, msg.hash);
  }

  /** Append the remote inputs that extend what we have; note the earliest one we mispredicted. */
  private addRemoteInputs(start: number, inputs: readonly InputBits[]): void {
    const theirs = this.theirs;
    for (let i = Math.max(0, theirs.length - start); i < inputs.length; i++) {
      const f = start + i;
      if (f !== theirs.length) break; // a gap; the peer resends until we acknowledge
      const input = inputs[i]!;
      theirs.push(input);
      const mispredicted = f < this.state.frame && input !== this.predicted[f % RING];
      if (mispredicted && (this.rollbackFrom < 0 || f < this.rollbackFrom)) this.rollbackFrom = f;
    }
  }

  private measurePing(rtt: number): void {
    if (rtt < 0 || rtt > DISCONNECT_MS) return;
    const st = this.stats;
    st.pingMs = st.pingMs < 0 ? rtt : st.pingMs + (rtt - st.pingMs) * 0.1;
  }

  private countSecond(): void {
    if (++this.second.ticks < TICKS_PER_SECOND) return;
    this.stats.rollbackFramesPerSec = this.second.frames;
    this.stats.rollbackDepth = this.second.depth;
    this.second = { ticks: 0, frames: 0, depth: 0 };
  }

  private save(s: MatchState): void {
    this.states[s.frame % RING] = s;
  }

  private load(frame: number): MatchState {
    const s = this.states[frame % RING];
    if (!s || s.frame !== frame) throw new Error(`no saved state for frame ${frame}`);
    return s;
  }
}

function clampDelay(frames: number): number {
  return Math.max(0, Math.min(MAX_INPUT_DELAY, Math.round(frames)));
}
