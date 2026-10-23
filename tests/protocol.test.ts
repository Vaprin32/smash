import { describe, expect, it } from 'vitest';
import {
  decodeMessage,
  encodeInputPacket,
  encodeStateDump,
  MAX_PACKET_INPUTS,
  MsgType,
  type InputPacket,
} from '../src/net/protocol';
import { FakeNetwork } from '../src/net/transports/fakeNetwork';

const packet: Omit<InputPacket, 'type'> = {
  frame: 1234,
  ack: -1,
  advantage: -2.37,
  ping: 98765,
  pong: -1,
  hashFrame: 1200,
  hash: 0xdeadbeef,
  start: 1230,
  inputs: [0, 1, 0x3ff, 0xffff],
};

describe('protocol', () => {
  it('an input packet round-trips', () => {
    const bytes = encodeInputPacket(packet);
    expect(bytes.length).toBe(32 + 2 * packet.inputs.length);
    expect(decodeMessage(bytes)).toEqual({ type: MsgType.Input, ...packet });
  });

  it('a packet carries at most MAX_PACKET_INPUTS inputs, oldest first', () => {
    const inputs = Array.from({ length: MAX_PACKET_INPUTS + 10 }, (_, i) => i);
    const msg = decodeMessage(encodeInputPacket({ ...packet, inputs }));
    expect(msg?.type === MsgType.Input && msg.inputs).toEqual(inputs.slice(0, MAX_PACKET_INPUTS));
  });

  it('a state dump round-trips', () => {
    const state = new Uint8Array([1, 2, 3, 250]);
    expect(decodeMessage(encodeStateDump(360, state))).toEqual({ type: MsgType.StateDump, frame: 360, bytes: state });
  });

  it('malformed messages are rejected, never thrown on', () => {
    const good = encodeInputPacket(packet);
    expect(decodeMessage(new Uint8Array(0))).toBeNull();
    expect(decodeMessage(new Uint8Array([99, 0, 0, 0]))).toBeNull();
    expect(decodeMessage(good.slice(0, 20))).toBeNull();
    expect(decodeMessage(good.slice(0, good.length - 1))).toBeNull();
    expect(decodeMessage(new Uint8Array([MsgType.StateDump, 1]))).toBeNull();
  });

  it('decodes a message that sits inside a larger buffer', () => {
    const good = encodeInputPacket(packet);
    const big = new Uint8Array(good.length + 7);
    big.set(good, 7);
    expect(decodeMessage(big.subarray(7))).toEqual({ type: MsgType.Input, ...packet });
  });
});

describe('fake network', () => {
  function link(latencyMs: number, jitterMs: number, lossPercent: number, seed = 1) {
    const clock = { t: 0 };
    const net = new FakeNetwork({ latencyMs, jitterMs, lossPercent }, () => clock.t, seed);
    const got: number[] = [];
    net.ends[1].onMessage((b) => got.push(b[0]!));
    return { clock, net, got };
  }

  it('delivers after the latency, not before', () => {
    const { clock, net, got } = link(100, 0, 0);
    net.ends[0].send(new Uint8Array([7]));
    clock.t = 99;
    net.pump();
    expect(got).toEqual([]);
    clock.t = 100;
    net.pump();
    expect(got).toEqual([7]);
  });

  it('jitter reorders packets; loss drops about the set share', () => {
    const { clock, net, got } = link(50, 40, 10, 42);
    for (let i = 0; i < 2000; i++) {
      net.ends[0].send(new Uint8Array([i & 0xff]));
      clock.t += 1000 / 60;
      net.pump();
    }
    clock.t += 1000;
    net.pump();
    expect(net.sent).toBe(2000);
    expect(got.length).toBe(2000 - net.lost);
    expect(net.lost / 2000).toBeGreaterThan(0.07);
    expect(net.lost / 2000).toBeLessThan(0.13);
    const outOfOrder = got.filter((v, i) => i > 0 && ((v - got[i - 1]!) & 0xff) > 128).length;
    expect(outOfOrder).toBeGreaterThan(20);
  });

  it('is repeatable for a given seed, and changes to conditions apply at once', () => {
    const runs = [1, 2].map(() => {
      const { clock, net, got } = link(30, 30, 20, 9);
      for (let i = 0; i < 200; i++) {
        if (i === 100) net.conditions.lossPercent = 100;
        net.ends[0].send(new Uint8Array([i]));
        clock.t += 5;
        net.pump();
      }
      clock.t += 1000;
      net.pump();
      return got;
    });
    expect(runs[0]).toEqual(runs[1]);
    expect(runs[0]!.every((v) => v < 100)).toBe(true);
  });
});
