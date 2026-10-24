// An online room once the two peers are connected: the link both screens
// (character select, match, results) talk through until someone leaves.
//
// Game packets go over the unreliable channel, each tagged with its match
// number, so a late packet from the last match never reaches a rematch's
// session. Everything else is a ControlMessage on the reliable channel. A
// heartbeat keeps the round trip measured and notices a dead connection.

import type { MatchSetup } from '../sim/state';
import { simFingerprint } from './fingerprint';
import type { PeerChannels } from './peer';
import type { Transport } from './transports/transport';

export type ControlMessage =
  /** First message each way: both must run the same simulation. */
  | { t: 'hello'; fingerprint: number }
  | { t: 'ping'; at: number }
  | { t: 'pong'; at: number }
  /** Character select: where the sender's cursor is (sent on change, and now and then). */
  | { t: 'cursor'; index: number; locked: boolean }
  /** Host to guest: start a match (from character select or a rematch). */
  | { t: 'start'; match: number; setup: MatchSetup }
  /** Results: the sender wants a rematch. */
  | { t: 'rematch' }
  /** Results: back to character select, both players. */
  | { t: 'select' }
  | { t: 'leave' };

/** Why the link went down. */
export type LostReason = 'left' | 'dropped' | 'version';

/** The two channels, as plain callbacks (so tests can link two rooms in memory). */
export interface LinkChannels {
  sendGame(bytes: Uint8Array): void;
  onGame(cb: (bytes: Uint8Array) => void): void;
  sendControl(text: string): void;
  onControl(cb: (text: string) => void): void;
  /** The connection itself closed or failed. */
  onDown(cb: () => void): void;
  close(): void;
}

export const HEARTBEAT_MS = 500;
/** Nothing heard from the peer for this long and the link counts as dropped. */
export const LINK_TIMEOUT_MS = 3000;

export class OnlineLink {
  /** Round trip in ms (smoothed), or -1 before the first pong. */
  rttMs = -1;
  /** Set once, when the link goes down. */
  lost: LostReason | null = null;
  /** The peer said hello with the same simulation fingerprint. */
  verified = false;
  /** Called once when `lost` is set. */
  onLost: () => void = () => {};
  /** Resolves when the peer's hello arrives and matches, rejects if the link goes down first. */
  readonly ready: Promise<void>;

  private lastHeard: number;
  /** Where control messages (other than hello/ping/pong) go; while null they queue up. */
  private handler: ((msg: ControlMessage) => void) | null = null;
  private queued: ControlMessage[] = [];
  private gameHandler: ((bytes: Uint8Array) => void) | null = null;
  private gameMatch = -1;
  private matchCount = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private settleReady!: (error?: LostReason) => void;

  /**
   * `slot` is the player slot this side controls: 0 for the host, 1 for the guest.
   * `heartbeat`: run the heartbeat on a timer (tests call `heartbeat()` by hand).
   */
  constructor(
    private ch: LinkChannels,
    readonly slot: number,
    readonly code: string,
    private now: () => number = () => performance.now(),
    heartbeat = true,
  ) {
    this.lastHeard = now();
    this.ready = new Promise((resolve, reject) => {
      this.settleReady = (error) => (error ? reject(new Error(error)) : resolve());
    });
    this.ready.catch(() => {});
    ch.onControl((text) => this.receive(text));
    ch.onGame((bytes) => {
      this.lastHeard = this.now();
      if (bytes.length > 0 && bytes[0] === this.gameMatch && this.gameHandler) this.gameHandler(bytes.subarray(1));
    });
    ch.onDown(() => this.drop('dropped'));
    this.send({ t: 'hello', fingerprint: simFingerprint() });
    if (heartbeat) this.timer = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
  }

  get isHost(): boolean {
    return this.slot === 0;
  }

  /**
   * The screen in charge takes control messages from now on, starting with
   * any that queued up. `null` queues them for the next screen (a match
   * does, so a rematch vote sent during "GAME!" reaches the results).
   */
  listen(handler: ((msg: ControlMessage) => void) | null): void {
    this.handler = handler;
    while (this.handler && this.queued.length > 0) this.handler(this.queued.shift()!);
  }

  send(msg: ControlMessage): void {
    if (!this.lost) this.ch.sendControl(JSON.stringify(msg));
  }

  /** Host: the number for the next match. */
  nextMatch(): number {
    this.matchCount = (this.matchCount + 1) & 0xff;
    return this.matchCount;
  }

  /** The game channel for match `match`: packets of any other match are dropped both ways. */
  game(match: number): Transport {
    this.gameMatch = match & 0xff;
    this.gameHandler = null;
    return {
      send: (bytes) => {
        if (this.lost || this.gameMatch !== (match & 0xff)) return;
        const tagged = new Uint8Array(bytes.length + 1);
        tagged[0] = match & 0xff;
        tagged.set(bytes, 1);
        this.ch.sendGame(tagged);
      },
      onMessage: (cb) => {
        if (this.gameMatch === (match & 0xff)) this.gameHandler = cb;
      },
    };
  }

  /** Ping, and notice a peer that has gone quiet. */
  heartbeat(): void {
    if (this.lost) return;
    const now = this.now();
    if (now - this.lastHeard > LINK_TIMEOUT_MS) {
      this.drop('dropped');
      return;
    }
    this.send({ t: 'ping', at: now });
  }

  /** Leave the room: tell the peer, then close the connection. */
  leave(): void {
    if (this.lost) return;
    this.send({ t: 'leave' });
    this.drop('left', false);
  }

  private receive(text: string): void {
    if (this.lost) return;
    let msg: ControlMessage;
    try {
      msg = JSON.parse(text) as ControlMessage;
    } catch {
      return;
    }
    this.lastHeard = this.now();
    switch (msg.t) {
      case 'hello':
        if (msg.fingerprint !== simFingerprint()) {
          this.drop('version');
          return;
        }
        this.verified = true;
        this.settleReady();
        return;
      case 'ping':
        this.send({ t: 'pong', at: msg.at });
        return;
      case 'pong': {
        const rtt = this.now() - msg.at;
        if (rtt >= 0) this.rttMs = this.rttMs < 0 ? rtt : this.rttMs + (rtt - this.rttMs) * 0.2;
        return;
      }
      case 'leave':
        this.drop('left');
        return;
      default:
        if (this.handler) this.handler(msg);
        else this.queued.push(msg);
    }
  }

  /** `notify`: call onLost (not when we are the one leaving). */
  private drop(reason: LostReason, notify = true): void {
    if (this.lost) return;
    this.lost = reason;
    if (this.timer) clearInterval(this.timer);
    this.settleReady(reason);
    // Let the leave message go out before closing.
    setTimeout(() => this.ch.close(), reason === 'left' ? 200 : 0);
    if (notify) this.onLost();
  }
}

/** LinkChannels over a connected WebRTC peer. */
export function rtcChannels(p: PeerChannels): LinkChannels {
  let down: (() => void) | null = null;
  const fireDown = () => {
    const cb = down;
    down = null;
    cb?.();
  };
  p.pc.addEventListener('connectionstatechange', () => {
    if (p.pc.connectionState === 'failed' || p.pc.connectionState === 'closed') fireDown();
  });
  p.game.addEventListener('close', fireDown);
  p.control.addEventListener('close', fireDown);
  return {
    sendGame: (bytes) => {
      if (p.game.readyState === 'open') p.game.send(bytes as Uint8Array<ArrayBuffer>);
    },
    onGame: (cb) => p.game.addEventListener('message', (e) => cb(new Uint8Array(e.data as ArrayBuffer))),
    sendControl: (text) => {
      if (p.control.readyState === 'open') p.control.send(text);
    },
    onControl: (cb) => p.control.addEventListener('message', (e) => cb(String(e.data))),
    onDown: (cb) => (down = cb),
    close: () => {
      down = null;
      p.game.close();
      p.control.close();
      p.pc.close();
    },
  };
}
