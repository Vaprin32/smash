/**
 * Moves bytes between two peers. Like UDP (and a WebRTC data channel with
 * `{ ordered: false, maxRetransmits: 0 }`), a message may arrive late, out of
 * order, or never; the session copes with all three.
 */
export interface Transport {
  send(bytes: Uint8Array): void;
  onMessage(cb: (bytes: Uint8Array) => void): void;
}
