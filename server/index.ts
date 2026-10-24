// Signaling server entry point: `npm run server` (Node runs the TypeScript directly).
//
//   PORT              port to listen on (default 8787)
//   STUN_URLS         comma-separated STUN URLs (default stun:stun.l.google.com:19302)
//   TURN_URLS         comma-separated TURN URLs, e.g. turn:turn.example.com:3478 (optional)
//   TURN_USERNAME     TURN credentials, sent to the players' browsers
//   TURN_CREDENTIAL

import { iceServersFromEnv, startSignalingServer } from './signaling.ts';

const port = Number(process.env.PORT ?? 8787);
const iceServers = iceServersFromEnv(process.env);
const server = await startSignalingServer({ port, iceServers });
const turn = iceServers.length > 1 ? 'with TURN' : 'STUN only';
console.log(`signaling server on ws://localhost:${server.port} (${turn})`);

const stop = () => void server.close().then(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
