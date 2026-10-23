// Wire format between two peers: little-endian binary. Every packet stands on
// its own, since the channel may lose or reorder them. Inputs travel as 16-bit
// masks (the sim uses 10 bits, leaving room to grow).

import type { InputBits } from '../sim/input';

export const MsgType = {
  Input: 1,
  StateDump: 2,
} as const;

/** Most inputs one packet carries; the oldest unacknowledged ones go first. */
export const MAX_PACKET_INPUTS = 64;

const INPUT_HEADER = 32;
const DUMP_HEADER = 5;

/** Sent every tick. */
export interface InputPacket {
  type: typeof MsgType.Input;
  /** The sender's current frame. */
  frame: number;
  /** The sender has the receiver's inputs for every frame up to this one (-1: none). */
  ack: number;
  /** The sender's measured frame advantage over the receiver (frames, 2 decimals). */
  advantage: number;
  /** The sender's clock (ms) when sending. */
  ping: number;
  /** The receiver's latest `ping` plus how long the sender has held it, or -1. The receiver's clock minus this is the round trip. */
  pong: number;
  /** The sender's latest checksum: its frame (-1: none yet) and hashState there. */
  hashFrame: number;
  hash: number;
  /** Frame of inputs[0]. */
  start: number;
  inputs: InputBits[];
}

/** The sender's serialized state at a frame where checksums disagreed (sent once, for debugging). */
export interface StateDump {
  type: typeof MsgType.StateDump;
  frame: number;
  bytes: Uint8Array;
}

export type Message = InputPacket | StateDump;

export function encodeInputPacket(p: Omit<InputPacket, 'type'>): Uint8Array {
  const count = Math.min(p.inputs.length, MAX_PACKET_INPUTS);
  const view = new DataView(new ArrayBuffer(INPUT_HEADER + count * 2));
  view.setUint8(0, MsgType.Input);
  view.setInt32(1, p.frame, true);
  view.setInt32(5, p.ack, true);
  view.setInt16(9, Math.max(-32768, Math.min(32767, Math.round(p.advantage * 100))), true);
  view.setInt32(11, Math.round(p.ping), true);
  view.setInt32(15, Math.round(p.pong), true);
  view.setInt32(19, p.hashFrame, true);
  view.setUint32(23, p.hash >>> 0, true);
  view.setInt32(27, p.start, true);
  view.setUint8(31, count);
  for (let i = 0; i < count; i++) view.setUint16(INPUT_HEADER + i * 2, p.inputs[i]! & 0xffff, true);
  return new Uint8Array(view.buffer);
}

export function encodeStateDump(frame: number, bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(DUMP_HEADER + bytes.length);
  const view = new DataView(out.buffer);
  view.setUint8(0, MsgType.StateDump);
  view.setInt32(1, frame, true);
  out.set(bytes, DUMP_HEADER);
  return out;
}

/** Parse a message, or return null if it is malformed (never throws). */
export function decodeMessage(bytes: Uint8Array): Message | null {
  if (bytes.length < 1) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  switch (view.getUint8(0)) {
    case MsgType.Input: {
      if (bytes.length < INPUT_HEADER) return null;
      const count = view.getUint8(31);
      if (bytes.length !== INPUT_HEADER + count * 2 || count > MAX_PACKET_INPUTS) return null;
      const inputs: InputBits[] = [];
      for (let i = 0; i < count; i++) inputs.push(view.getUint16(INPUT_HEADER + i * 2, true));
      return {
        type: MsgType.Input,
        frame: view.getInt32(1, true),
        ack: view.getInt32(5, true),
        advantage: view.getInt16(9, true) / 100,
        ping: view.getInt32(11, true),
        pong: view.getInt32(15, true),
        hashFrame: view.getInt32(19, true),
        hash: view.getUint32(23, true),
        start: view.getInt32(27, true),
        inputs,
      };
    }
    case MsgType.StateDump:
      if (bytes.length < DUMP_HEADER) return null;
      return { type: MsgType.StateDump, frame: view.getInt32(1, true), bytes: bytes.slice(DUMP_HEADER) };
    default:
      return null;
  }
}
