import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { simFingerprint } from '../src/net/fingerprint';
import { HEARTBEAT_MS, LINK_TIMEOUT_MS, OnlineLink, type ControlMessage, type LinkChannels } from '../src/net/online';
import { Session } from '../src/net/session';
import { FRAME_MS } from '../src/net/sync';
import { MATCH_ON, matchWinner } from '../src/sim/outcome';
import { createMatch, hashState, type MatchSetup } from '../src/sim/state';
import { step } from '../src/sim/step';
import { masher } from './masher';

/** Two LinkChannels wired to each other in memory. Messages wait in a queue until `flush`. */
function channelPair() {
  type End = { game: ((b: Uint8Array) => void)[]; control: ((t: string) => void)[]; down: (() => void) | null; closed: boolean };
  const ends: End[] = [0, 1].map(() => ({ game: [], control: [], down: null, closed: false }));
  const queue: (() => void)[] = [];
  const make = (me: number): LinkChannels => {
    const other = ends[1 - me]!;
    return {
      sendGame: (bytes) => {
        const copy = bytes.slice();
        queue.push(() => !other.closed && other.game.forEach((cb) => cb(copy)));
      },
      onGame: (cb) => ends[me]!.game.push(cb),
      sendControl: (text) => queue.push(() => !other.closed && other.control.forEach((cb) => cb(text))),
      onControl: (cb) => ends[me]!.control.push(cb),
      onDown: (cb) => (ends[me]!.down = cb),
      close: () => {
        ends[me]!.closed = true;
        queue.push(() => other.down?.());
      },
    };
  };
  const flush = () => {
    while (queue.length > 0) queue.shift()!();
  };
  /** Deliver a raw control message as if the other side sent it. */
  const inject = (to: number, msg: unknown) => ends[to]!.control.forEach((cb) => cb(JSON.stringify(msg)));
  return { channels: [make(0), make(1)] as const, flush, inject };
}

let t = 0;
const now = () => t;

function linkedRoom() {
  const pair = channelPair();
  const host = new OnlineLink(pair.channels[0], 0, 'ABCDE', now, false);
  const guest = new OnlineLink(pair.channels[1], 1, 'ABCDE', now, false);
  pair.flush();
  return { host, guest, ...pair };
}

beforeEach(() => {
  t = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('online room link', () => {
  it('both sides verify the same simulation on hello', async () => {
    const { host, guest } = linkedRoom();
    await expect(host.ready).resolves.toBeUndefined();
    await expect(guest.ready).resolves.toBeUndefined();
    expect(host.isHost).toBe(true);
    expect(guest.isHost).toBe(false);
  });

  it('refuses a peer running a different simulation', async () => {
    const pair = channelPair();
    const host = new OnlineLink(pair.channels[0], 0, 'ABCDE', now, false);
    let lost = '';
    host.onLost = () => (lost = host.lost!);
    pair.inject(0, { t: 'hello', fingerprint: (simFingerprint() + 1) >>> 0 });
    await expect(host.ready).rejects.toThrow('version');
    expect(lost).toBe('version');
  });

  it('measures the round trip with heartbeats', () => {
    const { host, flush } = linkedRoom();
    host.heartbeat();
    t += 40; // the reply takes 40 ms
    flush();
    expect(host.rttMs).toBe(40);
  });

  it('drops the link when the peer goes quiet', () => {
    const { host } = linkedRoom();
    let lost = 0;
    host.onLost = () => lost++;
    t += LINK_TIMEOUT_MS - HEARTBEAT_MS;
    host.heartbeat();
    expect(host.lost).toBeNull();
    t += HEARTBEAT_MS * 2;
    host.heartbeat();
    expect(host.lost).toBe('dropped');
    expect(lost).toBe(1);
  });

  it('leaving tells the other side, which reports "left"', () => {
    const { host, guest, flush } = linkedRoom();
    let reason = '';
    host.onLost = () => (reason = host.lost!);
    guest.leave();
    flush();
    expect(reason).toBe('left');
    expect(guest.lost).toBe('left');
  });

  it('queues control messages while no screen listens, then hands them over in order', () => {
    const { host, guest, flush } = linkedRoom();
    host.listen(null);
    guest.send({ t: 'rematch' });
    guest.send({ t: 'select' });
    flush();
    const got: ControlMessage[] = [];
    host.listen((m) => got.push(m));
    expect(got).toEqual([{ t: 'rematch' }, { t: 'select' }]);
    guest.send({ t: 'cursor', index: 3, locked: true });
    flush();
    expect(got.at(-1)).toEqual({ t: 'cursor', index: 3, locked: true });
  });

  it("game packets of one match never reach another match's handler", () => {
    const { host, guest, flush } = linkedRoom();
    const oldSend = host.game(1);
    const received: number[] = [];
    guest.game(1).onMessage((b) => received.push(b[0]!));
    oldSend.send(new Uint8Array([11]));
    flush();
    expect(received).toEqual([11]);

    // Rematch: a late packet from match 1 arrives after both moved on to match 2.
    const late = new Uint8Array([12]);
    oldSend.send(late); // still in flight
    const newSend = host.game(2);
    guest.game(2).onMessage((b) => received.push(100 + b[0]!));
    flush();
    newSend.send(new Uint8Array([21]));
    oldSend.send(new Uint8Array([13])); // the old match's session can't send any more either
    flush();
    expect(received).toEqual([11, 121]);
  });

  it('a whole match played through the room confirms the same frames on both sides as an offline run', () => {
    const { host, guest, flush } = linkedRoom();
    const setup: MatchSetup = { seed: 42, stageId: 0, chars: [3, 6], stocks: 2 };
    const match = host.nextMatch();
    const confirmed: number[][] = [[], []];
    const sessions = [host, guest].map(
      (link, p) =>
        new Session({
          setup,
          localPlayer: p,
          transport: link.game(match),
          now,
          onConfirm: (_prev, next) => confirmed[p]!.push(hashState(next)),
        }),
    );
    const mash = [masher(5), masher(6)];
    for (let tick = 0; tick < 20000 && !sessions.every((s) => s.finished); tick++) {
      t += FRAME_MS;
      // Each side's masher plays from what that side currently shows.
      sessions.forEach((s, p) => s.tick(mash[p]!(s.state)[p]!));
      if (tick % 2 === 0) flush(); // a little latency
    }
    expect(sessions.every((s) => s.finished)).toBe(true);
    expect(sessions[0]!.desyncFrame).toBe(-1);
    expect(confirmed[0]).toEqual(confirmed[1]);

    // Same inputs, offline, give the same frames.
    let s = createMatch(setup);
    const offline: number[] = [];
    for (const inputs of sessions[0]!.replay.inputs) {
      s = step(s, inputs);
      offline.push(hashState(s));
    }
    expect(offline).toEqual(confirmed[0]);
    expect(matchWinner(s)).not.toBe(MATCH_ON);
  });
});
