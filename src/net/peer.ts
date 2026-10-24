// Connects two browsers with WebRTC, using the signaling server only to
// exchange the offer, answer and ICE candidates. Two data channels, created
// on both sides with fixed ids (no extra negotiation):
//   game:    unordered, no retransmits (UDP-like): rollback input packets
//   control: reliable and ordered: lobby, rematch and keepalive messages

import type { IceServer, SignalData } from './signalMessages';
import type { SignalingClient } from './signalingClient';

export interface PeerChannels {
  pc: RTCPeerConnection;
  game: RTCDataChannel;
  control: RTCDataChannel;
}

/** Most time the WebRTC handshake may take. */
export const CONNECT_TIMEOUT_MS = 15000;

export function connectPeer(sig: SignalingClient, role: 'host' | 'guest', iceServers: IceServer[]): Promise<PeerChannels> {
  const pc = new RTCPeerConnection({ iceServers });
  const game = pc.createDataChannel('game', { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 });
  const control = pc.createDataChannel('control', { negotiated: true, id: 1, ordered: true });
  game.binaryType = 'arraybuffer';

  const signal = (data: SignalData) => sig.send({ t: 'signal', data });
  /** Candidates that arrived before the remote description; added once it is set. */
  let pending: RTCIceCandidateInit[] | null = [];

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      signal({ kind: 'candidate', candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex });
    }
  };

  const setRemote = async (desc: RTCSessionDescriptionInit) => {
    await pc.setRemoteDescription(desc);
    const queued = pending ?? [];
    pending = null;
    for (const c of queued) await pc.addIceCandidate(c);
  };

  sig.onMessage = (msg) => {
    if (msg.t !== 'signal') return;
    const d = msg.data;
    void (async () => {
      if (d.kind === 'description') {
        await setRemote({ type: d.type, sdp: d.sdp });
        if (d.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          signal({ kind: 'description', type: 'answer', sdp: pc.localDescription!.sdp });
        }
      } else {
        const c: RTCIceCandidateInit = { candidate: d.candidate, sdpMid: d.sdpMid, sdpMLineIndex: d.sdpMLineIndex };
        if (pending) pending.push(c);
        else await pc.addIceCandidate(c);
      }
    })().catch(() => {}); // a bad description or candidate shows up as a failed connection
  };

  if (role === 'host') {
    void (async () => {
      await pc.setLocalDescription(await pc.createOffer());
      signal({ kind: 'description', type: 'offer', sdp: pc.localDescription!.sdp });
    })();
  }

  return new Promise((resolve, reject) => {
    const fail = (why: string) => {
      clearTimeout(timer);
      pc.close();
      reject(new Error(why));
    };
    const timer = setTimeout(() => fail('timeout'), CONNECT_TIMEOUT_MS);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') fail('failed');
    };
    const check = () => {
      if (game.readyState === 'open' && control.readyState === 'open') {
        clearTimeout(timer);
        pc.onconnectionstatechange = null;
        resolve({ pc, game, control });
      }
    };
    game.onopen = check;
    control.onopen = check;
  });
}
