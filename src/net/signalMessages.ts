// JSON messages between a client and the signaling server (server/). The
// server only pairs two clients by room code and relays their WebRTC offer,
// answer and ICE candidates; once the peers are connected it is out of the
// picture and never sees the game.

/** Room codes: 5 letters, without ones that are easy to mix up (I, L, O, U). */
export const ROOM_CODE_LENGTH = 5;
export const ROOM_CODE_LETTERS = 'ABCDEFGHJKMNPQRSTVWXYZ';

export type ClientMessage =
  /** Open a new room; the reply is `room`. */
  | { t: 'create' }
  /** Join an open room; the reply is `paired` (to both clients) or `error`. */
  | { t: 'join'; code: string }
  /** Relayed as is to the other client in the room. */
  | { t: 'signal'; data: SignalData };

export type ServerMessage =
  /** Sent on connect: the ICE servers to use (STUN, plus TURN if the server has credentials). */
  | { t: 'hello'; iceServers: IceServer[] }
  | { t: 'room'; code: string }
  /** Both clients are in the room. The host made it and starts the WebRTC handshake. */
  | { t: 'paired'; role: 'host' | 'guest' }
  | { t: 'signal'; data: SignalData }
  /** The other client's connection to the server closed. */
  | { t: 'peer-left' }
  | { t: 'error'; reason: SignalError };

export type SignalError = 'no-room' | 'full' | 'bad-message' | 'busy';

/** WebRTC handshake pieces, passed through the server untouched. */
export type SignalData =
  | { kind: 'description'; type: 'offer' | 'answer'; sdp: string }
  | { kind: 'candidate'; candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };

/** The plain-data subset of RTCIceServer the server hands out. */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Uppercase, letters only, `ROOM_CODE_LENGTH` long, or null. */
export function normalizeRoomCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_CODE_LETTERS.includes(ch)) return null;
  return code;
}
