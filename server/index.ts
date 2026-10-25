// Signaling server entry point: `npm run server` (Node runs the TypeScript directly).
//
//   PORT              port to listen on (default 8787)
//   STUN_URLS         comma-separated STUN URLs (default stun:stun.l.google.com:19302)
//   TURN_URLS         comma-separated TURN URLs, e.g. turn:turn.example.com:3478 (optional)
//   TURN_USERNAME     TURN credentials, sent to the players' browsers
//   TURN_CREDENTIAL

import { networkInterfaces } from 'node:os';
import { iceServersFromEnv, startSignalingServer } from './signaling.ts';

const port = Number(process.env.PORT ?? 8787);
const iceServers = iceServersFromEnv(process.env);
const server = await startSignalingServer({ port, iceServers });
const turn = iceServers.length > 1 ? 'with TURN' : 'STUN only';
console.log(`signaling server on ws://localhost:${server.port} (${turn})`);
// Where to point the game: this PC, and this PC's addresses on the local network.
const lan = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  .map((a) => a!.address);
console.log('');
console.log('This PC: open dist/index.html (or the dev server) and use Create Online Room.');
for (const ip of lan) console.log(`Same network: open the game with ?signal=ws://${ip}:${server.port} on the end of its address`);
console.log('Over the internet: see README.md, "Online play" (a tunnel gives this server a wss:// address).');
console.log('Leave this window open while playing. Ctrl+C stops the server.');

const stop = () => void server.close().then(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
