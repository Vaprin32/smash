// Two transports wired straight to each other in the same tab: instant,
// reliable and in order. For tests.

import type { Transport } from './transport';

export class LoopbackTransport implements Transport {
  private handler: ((bytes: Uint8Array) => void) | null = null;
  private peer!: LoopbackTransport;

  static pair(): [LoopbackTransport, LoopbackTransport] {
    const a = new LoopbackTransport();
    const b = new LoopbackTransport();
    a.peer = b;
    b.peer = a;
    return [a, b];
  }

  send(bytes: Uint8Array): void {
    this.peer.handler?.(bytes.slice());
  }

  onMessage(cb: (bytes: Uint8Array) => void): void {
    this.handler = cb;
  }
}
