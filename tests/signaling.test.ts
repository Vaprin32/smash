import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { iceServersFromEnv, startSignalingServer, type SignalingServer } from '../server/signaling';
import { normalizeRoomCode, ROOM_CODE_LENGTH, type ClientMessage, type ServerMessage } from '../src/net/signalMessages';

/** A test client: sends ClientMessages and awaits ServerMessages in order. */
class Client {
  private queue: ServerMessage[] = [];
  private waiters: ((m: ServerMessage) => void)[] = [];
  closed: Promise<void>;

  constructor(readonly ws: WebSocket) {
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw)) as ServerMessage;
      const w = this.waiters.shift();
      if (w) w(msg);
      else this.queue.push(msg);
    });
    this.closed = new Promise((done) => ws.on('close', () => done()));
  }

  static async connect(port: number): Promise<Client> {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const c = new Client(ws);
    await new Promise<void>((ok, fail) => {
      ws.once('open', () => ok());
      ws.once('error', fail);
    });
    return c;
  }

  send(msg: ClientMessage | Record<string, unknown>): void {
    this.ws.send(JSON.stringify(msg));
  }

  next(): Promise<ServerMessage> {
    const m = this.queue.shift();
    if (m) return Promise.resolve(m);
    return new Promise((ok) => this.waiters.push(ok));
  }
}

let server: SignalingServer;
const clients: Client[] = [];
const ICE = [{ urls: ['stun:stun.example.com:3478'] }];

async function connect(): Promise<Client> {
  const c = await Client.connect(server.port);
  clients.push(c);
  expect(await c.next()).toEqual({ t: 'hello', iceServers: ICE });
  return c;
}

/** A host with an open room, and its code. */
async function openRoom(): Promise<{ host: Client; code: string }> {
  const host = await connect();
  host.send({ t: 'create' });
  const msg = await host.next();
  if (msg.t !== 'room') throw new Error(`expected a room, got ${msg.t}`);
  return { host, code: msg.code };
}

beforeEach(async () => {
  server = await startSignalingServer({ port: 0, iceServers: ICE, maxRooms: 3, roomTimeoutMs: 300 });
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.ws.terminate();
  await server.close();
});

describe('signaling server', () => {
  it('creates rooms with distinct, valid codes', async () => {
    const a = await openRoom();
    const b = await openRoom();
    expect(a.code).toHaveLength(ROOM_CODE_LENGTH);
    expect(normalizeRoomCode(a.code)).toBe(a.code);
    expect(a.code).not.toBe(b.code);
    expect(server.roomCount()).toBe(2);
  });

  it('pairs a guest with the host and relays signals both ways, untouched', async () => {
    const { host, code } = await openRoom();
    const guest = await connect();
    guest.send({ t: 'join', code: code.toLowerCase() });
    expect(await host.next()).toEqual({ t: 'paired', role: 'host' });
    expect(await guest.next()).toEqual({ t: 'paired', role: 'guest' });

    const offer = { kind: 'description', type: 'offer', sdp: 'v=0 offer' } as const;
    host.send({ t: 'signal', data: offer });
    expect(await guest.next()).toEqual({ t: 'signal', data: offer });
    const candidate = { kind: 'candidate', candidate: 'candidate:1 1 udp 1 10.0.0.1 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 } as const;
    guest.send({ t: 'signal', data: candidate });
    expect(await host.next()).toEqual({ t: 'signal', data: candidate });
  });

  it('turns away unknown codes and a third client', async () => {
    const { code } = await openRoom();
    const stranger = await connect();
    stranger.send({ t: 'join', code: 'ZZZZZ' });
    expect(await stranger.next()).toEqual({ t: 'error', reason: 'no-room' });

    const guest = await connect();
    guest.send({ t: 'join', code });
    expect((await guest.next()).t).toBe('paired');
    const third = await connect();
    third.send({ t: 'join', code });
    expect(await third.next()).toEqual({ t: 'error', reason: 'full' });
  });

  it('tells the other client when one leaves, and closes the room', async () => {
    const { host, code } = await openRoom();
    const guest = await connect();
    guest.send({ t: 'join', code });
    await host.next();
    await guest.next();
    guest.ws.close();
    expect(await host.next()).toEqual({ t: 'peer-left' });
    expect(server.roomCount()).toBe(0);
  });

  it('rejects garbage without crashing, and does not relay before pairing', async () => {
    const { host } = await openRoom();
    host.ws.send('not json');
    expect(await host.next()).toEqual({ t: 'error', reason: 'bad-message' });
    host.send({ t: 'launch-missiles' });
    expect(await host.next()).toEqual({ t: 'error', reason: 'bad-message' });
    host.send({ t: 'signal', data: { kind: 'description', type: 'offer', sdp: 'x' } }); // nobody to relay to: ignored
    host.send({ t: 'create' }); // already has a room
    expect(await host.next()).toEqual({ t: 'error', reason: 'bad-message' });
  });

  it('caps the number of open rooms', async () => {
    for (let i = 0; i < 3; i++) await openRoom();
    const late = await connect();
    late.send({ t: 'create' });
    expect(await late.next()).toEqual({ t: 'error', reason: 'busy' });
  });

  it('closes a room nobody joins in time', async () => {
    const { host } = await openRoom();
    await host.closed;
    expect(server.roomCount()).toBe(0);
  });
});

describe('ICE servers from the environment', () => {
  it('defaults to a public STUN server', () => {
    expect(iceServersFromEnv({})).toEqual([{ urls: ['stun:stun.l.google.com:19302'] }]);
  });

  it('adds TURN when configured', () => {
    const env = { STUN_URLS: 'stun:a:1, stun:b:2', TURN_URLS: 'turn:t:3478', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'p' };
    expect(iceServersFromEnv(env)).toEqual([
      { urls: ['stun:a:1', 'stun:b:2'] },
      { urls: ['turn:t:3478'], username: 'u', credential: 'p' },
    ]);
  });
});

describe('room codes', () => {
  it('normalizes case and rejects bad codes', () => {
    expect(normalizeRoomCode(' abcde ')).toBe('ABCDE');
    expect(normalizeRoomCode('ABCD')).toBeNull();
    expect(normalizeRoomCode('ABCDI')).toBeNull(); // I is left out (looks like 1 / L)
    expect(normalizeRoomCode('AB1DE')).toBeNull();
  });
});
