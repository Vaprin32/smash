// The browser's side of the signaling server: a WebSocket carrying JSON
// (see signalMessages.ts). Used only until the two peers are connected.

import type { ClientMessage, IceServer, ServerMessage } from './signalMessages';

export class SignalingClient {
  /** Resolves with the ICE servers once the server says hello; rejects if it can't be reached. */
  readonly ready: Promise<IceServer[]>;
  /** Every message after `hello`. */
  onMessage: (msg: ServerMessage) => void = () => {};
  /** The connection closed (or never opened), unless `close()` was called. */
  onClose: () => void = () => {};
  private ws: WebSocket;
  private closedByUs = false;

  constructor(readonly url: string) {
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      let hello = false;
      this.ws.addEventListener('message', (e) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(e.data)) as ServerMessage;
        } catch {
          return;
        }
        if (msg.t === 'hello') {
          hello = true;
          resolve(msg.iceServers);
        } else {
          this.onMessage(msg);
        }
      });
      this.ws.addEventListener('close', () => {
        if (!hello) reject(new Error(`can't reach the signaling server at ${url}`));
        if (!this.closedByUs) this.onClose();
      });
    });
    this.ready.catch(() => {}); // handled by whoever awaits it
  }

  send(msg: ClientMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.closedByUs = true;
    this.ws.close();
  }
}
