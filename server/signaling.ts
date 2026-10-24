// The signaling server: pairs two clients by room code and relays their
// WebRTC handshake. It never runs or sees the game. Node + `ws`; started by
// server/index.ts, and by the tests on a random port.

import { randomInt } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  normalizeRoomCode,
  ROOM_CODE_LENGTH,
  ROOM_CODE_LETTERS,
  type ClientMessage,
  type IceServer,
  type ServerMessage,
} from '../src/net/signalMessages.ts';

export interface SignalingOptions {
  /** 0 picks a free port. */
  port: number;
  iceServers: IceServer[];
  /** Most rooms open at once (a create beyond it gets `busy`). */
  maxRooms?: number;
  /** A room nobody joins is closed after this long. */
  roomTimeoutMs?: number;
}

export interface SignalingServer {
  port: number;
  /** Open rooms, for tests and logs. */
  roomCount(): number;
  close(): Promise<void>;
}

interface Room {
  code: string;
  host: WebSocket;
  guest: WebSocket | null;
  timer: ReturnType<typeof setTimeout>;
}

const MAX_MESSAGE_BYTES = 64 * 1024;

export function startSignalingServer(opts: SignalingOptions): Promise<SignalingServer> {
  const maxRooms = opts.maxRooms ?? 1000;
  const roomTimeoutMs = opts.roomTimeoutMs ?? 10 * 60 * 1000;
  const rooms = new Map<string, Room>();
  const roomOf = new Map<WebSocket, Room>();
  const wss = new WebSocketServer({ port: opts.port, maxPayload: MAX_MESSAGE_BYTES });

  const send = (ws: WebSocket | null, msg: ServerMessage) => {
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  const newCode = (): string => {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_LETTERS[randomInt(ROOM_CODE_LETTERS.length)];
      if (!rooms.has(code)) return code;
    }
  };

  const closeRoom = (room: Room) => {
    clearTimeout(room.timer);
    rooms.delete(room.code);
    roomOf.delete(room.host);
    if (room.guest) roomOf.delete(room.guest);
  };

  const onMessage = (ws: WebSocket, msg: ClientMessage) => {
    const mine = roomOf.get(ws);
    switch (msg.t) {
      case 'create': {
        if (mine) return send(ws, { t: 'error', reason: 'bad-message' });
        if (rooms.size >= maxRooms) return send(ws, { t: 'error', reason: 'busy' });
        const code = newCode();
        const room: Room = { code, host: ws, guest: null, timer: setTimeout(() => expire(room), roomTimeoutMs) };
        rooms.set(code, room);
        roomOf.set(ws, room);
        return send(ws, { t: 'room', code });
      }
      case 'join': {
        if (mine) return send(ws, { t: 'error', reason: 'bad-message' });
        const code = typeof msg.code === 'string' ? normalizeRoomCode(msg.code) : null;
        const room = code ? rooms.get(code) : undefined;
        if (!room) return send(ws, { t: 'error', reason: 'no-room' });
        if (room.guest) return send(ws, { t: 'error', reason: 'full' });
        room.guest = ws;
        roomOf.set(ws, room);
        clearTimeout(room.timer);
        send(room.host, { t: 'paired', role: 'host' });
        return send(ws, { t: 'paired', role: 'guest' });
      }
      case 'signal': {
        if (!mine || !mine.guest || typeof msg.data !== 'object' || msg.data === null) return;
        return send(ws === mine.host ? mine.guest : mine.host, { t: 'signal', data: msg.data });
      }
      default:
        return send(ws, { t: 'error', reason: 'bad-message' });
    }
  };

  /** Nobody joined in time: close the host's connection, and with it the room. */
  const expire = (room: Room) => {
    closeRoom(room);
    room.host.close();
  };

  wss.on('connection', (ws) => {
    send(ws, { t: 'hello', iceServers: opts.iceServers });
    ws.on('message', (raw, isBinary) => {
      let msg: ClientMessage;
      try {
        if (isBinary) throw new Error('binary');
        msg = JSON.parse(String(raw)) as ClientMessage;
        if (typeof msg !== 'object' || msg === null) throw new Error('not an object');
      } catch {
        return send(ws, { t: 'error', reason: 'bad-message' });
      }
      onMessage(ws, msg);
    });
    ws.on('close', () => {
      const room = roomOf.get(ws);
      if (!room) return;
      send(ws === room.host ? room.guest : room.host, { t: 'peer-left' });
      closeRoom(room);
    });
    ws.on('error', () => ws.close());
  });

  return new Promise((resolve, reject) => {
    wss.once('error', reject);
    wss.once('listening', () => {
      resolve({
        port: (wss.address() as AddressInfo).port,
        roomCount: () => rooms.size,
        close: () =>
          new Promise<void>((done) => {
            for (const room of rooms.values()) clearTimeout(room.timer);
            for (const client of wss.clients) client.terminate();
            wss.close(() => done());
          }),
      });
    });
  });
}

/** ICE servers from the environment: STUN_URLS (default: a public STUN server), plus TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL. */
export function iceServersFromEnv(env: Record<string, string | undefined>): IceServer[] {
  const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const stun = list(env.STUN_URLS);
  const servers: IceServer[] = [{ urls: stun.length > 0 ? stun : ['stun:stun.l.google.com:19302'] }];
  const turn = list(env.TURN_URLS);
  if (turn.length > 0) servers.push({ urls: turn, username: env.TURN_USERNAME ?? '', credential: env.TURN_CREDENTIAL ?? '' });
  return servers;
}
