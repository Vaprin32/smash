// A simulated network link between two transports in the same tab. Each
// packet is delayed by the latency plus a random amount of jitter (so packets
// can overtake each other) or lost outright. Conditions can change at any
// time. Seeded and driven by an injected clock, so tests are repeatable.

import type { Transport } from './transport';

export interface NetConditions {
  /** One-way delay, ms. */
  latencyMs: number;
  /** Up to this much extra delay per packet, ms (uniformly random). */
  jitterMs: number;
  /** Chance that a packet is lost, 0-100. */
  lossPercent: number;
}

interface InFlight {
  at: number;
  seq: number;
  to: FakeNetworkTransport;
  bytes: Uint8Array;
}

export class FakeNetwork {
  /** One transport per peer; what one sends, the other receives. */
  readonly ends: [FakeNetworkTransport, FakeNetworkTransport];
  sent = 0;
  lost = 0;
  private inFlight: InFlight[] = [];
  private seq = 0;
  private rng: number;

  /** `conditions` is read on every send, so changing it takes effect at once. */
  constructor(
    readonly conditions: NetConditions,
    private now: () => number,
    seed = 1,
  ) {
    this.rng = seed | 0 || 1;
    const a = new FakeNetworkTransport(this);
    const b = new FakeNetworkTransport(this);
    a.peer = b;
    b.peer = a;
    this.ends = [a, b];
  }

  /** Deliver every packet whose arrival time has come, earliest first. */
  pump(): void {
    const t = this.now();
    const due = this.inFlight.filter((p) => p.at <= t).sort((p, q) => p.at - q.at || p.seq - q.seq);
    if (due.length === 0) return;
    this.inFlight = this.inFlight.filter((p) => p.at > t);
    for (const p of due) p.to.deliver(p.bytes);
  }

  /** Packets sent but not delivered (or lost) yet. */
  get pending(): number {
    return this.inFlight.length;
  }

  transmit(to: FakeNetworkTransport, bytes: Uint8Array): void {
    const c = this.conditions;
    this.sent++;
    if (this.random() * 100 < c.lossPercent) {
      this.lost++;
      return;
    }
    const at = this.now() + c.latencyMs + this.random() * c.jitterMs;
    this.inFlight.push({ at, seq: this.seq++, to, bytes });
  }

  /** Uniform in [0, 1) (xorshift32). */
  private random(): number {
    let x = this.rng;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng = x;
    return (x >>> 0) / 0x100000000;
  }
}

export class FakeNetworkTransport implements Transport {
  peer!: FakeNetworkTransport;
  private handler: ((bytes: Uint8Array) => void) | null = null;

  constructor(private network: FakeNetwork) {}

  send(bytes: Uint8Array): void {
    this.network.transmit(this.peer, bytes.slice());
  }

  onMessage(cb: (bytes: Uint8Array) => void): void {
    this.handler = cb;
  }

  /** Called by the network when a packet arrives. */
  deliver(bytes: Uint8Array): void {
    this.handler?.(bytes);
  }
}
