# Smash prototype

Browser platform fighter with rollback netcode, playable online. See [SPEC.md](SPEC.md).

**Play it:** https://vaprin32.github.io/smash/ (GitHub Pages; share that link). Online play also
needs a signaling server; see [Online play](#online-play).

```bash
npm install
npm run dev        # http://localhost:5173
npm run server     # signaling server for online play, ws://localhost:8787
npm test           # Vitest
npm run typecheck  # tsc --noEmit
npm run build:html # dist/index.html, a single file that runs from disk
npm run build      # regular Vite build into dist/app (needs a web server)
```

Main menu → **Versus CPU** (you against 1 to 3 computer players),
**Create / Join Online Room** (1v1 against another browser), **Training** (you against an idle
CPU dummy) or **Netcode test** (two players, each on their own simulated machine; see below) →
character select → 3-stock match → results (Rematch / Watch replay / Character select / Main menu).

## Publishing (GitHub Pages)

`.github/workflows/pages.yml` runs on every push to `main`: it type-checks, runs the tests, builds
`dist/index.html` and publishes it as the site's front page. The repository's Pages source is set
to "GitHub Actions" (Settings → Pages). A run takes a minute or two; the Actions tab shows its
progress, and a failed test stops the deploy, so the live game only ever changes to a tested build.

Online play on the published site needs a signaling server reachable over `wss://` (see
[Deploying](#deploying)). Set its address as the repository variable `SIGNAL_URL` (Settings →
Secrets and variables → Actions → Variables, e.g. `wss://signal.example.com`) and the next deploy
builds it in. Until then the site's online menus explain that no server could be reached.

## Versus CPU

Pick how many opponents (1–3) and how well they play (Easy / Normal / Hard), then your fighter
and each CPU's (they start on random fighters, so pressing Attack a few times is enough). With
more than one CPU it's a free-for-all: everyone fights everyone, including the CPUs each other.
The results rank players by how long they lasted and show KOs and damage dealt, both credited to
whoever landed the hit (`lastHitBy` in the sim state, cleared once a fighter is back on their feet).

A CPU is an ordinary input source (`src/ai/`): every frame it reads the match and returns the same
kind of button bitmask a controller would, so replays record it like anyone else. It sees its
opponents as they were a few frames ago (its reaction time) and tries every move it could start
against a quick forward model of where everyone will be (`src/ai/predict.ts`: move data, impulses,
friction, gravity, hitlag), picking one that would connect, preferring launch power as targets get
closer to a KO and avoiding moves that would carry it off the stage. It also shields or dodges
attacks it sees coming, grabs out of shield, mashes out of grabs, throws toward the nearer edge,
waits at the edge for fighters who are off stage, and recovers with its jumps and specials.

| Level | Reaction | Plays like |
|---|---|---|
| Easy | 24 frames | dawdles, attacks now and then, almost never blocks |
| Normal | 13 frames | keeps up the pressure, blocks about a third of attacks |
| Hard | 7 frames | picks the best move, blocks about half, punishes out of shield |

Every number that differs between levels is in `src/ai/levels.ts`. `tests/cpu.test.ts` checks that
every fighter's CPU recovers from all around the stage, beats an idle dummy at every level without
falling off by itself, that Hard beats Normal and Normal beats Easy, that four CPUs play a
free-for-all to the end (and it replays exactly), and that a CPU is deterministic and never
touches the state it reads.

## Stages

After character select comes stage select (online, the host picks; rematches stay on the same
stage):

| Stage | Layout |
|---|---|
| Moonlit Rampart | castle walls at night; three platforms (two low, one high) |
| Sunset Bridge | a longer, thinner stone bridge at dusk; a lift swings across the middle on chains, carrying whoever stands on it, with two high platforms at the sides |

Stages are data in `src/sim/stage.ts`. A platform with a `sway` moves smoothly back and forth; where
it is depends only on the frame number, so moving platforms cost nothing in the rollback state.
Every solid block's top corners are ledges.

## Fighters

| Fighter | Archetype | Notes |
|---|---|---|
| Wisp | fast, light, floaty | weak hits, Wind Bolt projectile, counter |
| Brick | heavy, slow, hard-hitting | Haymaker, Bull Rush, Ground Pound |
| Pip | tiny featherweight | three air jumps, Pebble Toss, Spring (extra jump) |
| Kestrel | fast-faller rushdown | Feather Dart, Dive Kick, Plummet spike |
| Lumen | floaty zoner | slow strong Lumen Orb, Light Lance tip, Flare |
| Basalt | giant super-heavyweight | slowest and strongest, worst recovery |
| Sable | long reach (sword) | disjointed normals, tipper Lunge, Whirl Slash |
| Rook | all-rounder | Palm Burst, Spin Kick, Riposte counter |

The look is medieval: a moonlit night over a castle, mountains, a forest and a village, a stone rampart with torches and ivy, oak and gold menus, heraldic HUD shields. The scenery is in `src/render/scenery.ts` (static layers are painted once from a fixed seed, then drawn with parallax), figures and costumes in `src/render/skeleton.ts`, palette and menu pieces in `src/render/theme.ts`; each fighter's title (the Iron Knight, the Cleric, ...) is in `src/render/looks.ts`.

Each fighter's stats live in `src/sim/fighters/<name>.ts`. Moves are in `src/sim/moves/<name>.ts`:
a tuning line (frames / size / reach / damage / knockback, relative to Wisp's moveset)
plus that fighter's hand-written specials. Looks (proportions, colors, costume) are in
`src/render/looks.ts`.

## Controls

Everything except the netcode test uses the one-player ("solo") layout. The netcode test splits the keyboard
in half (no numpad needed), and P2's half is P1's mirrored around the middle of each row: movement on
the outside, actions toward the middle. Keys are physical positions (Ñ is `;` on a US keyboard).
Holding left and right together (or up and down) counts as whichever was pressed last, so rolling
from one key to the other never stops you in between.

| Action | Solo (P1) | Versus P1 | Versus P2 | Gamepad |
|---|---|---|---|---|
| Move (up left down right) | W A S D | W A S D | O K L Ñ | left stick / d-pad |
| Jump | L or Space | R | U | X / Y |
| Attack | J | F | J | A |
| Smash (ground only) | K | T | Y | RB |
| Special | I | G | H | B |
| Shield / roll / dodge / grab | E | E | I | LT / RT |
| Dash | N | B | N | LB |

Attack: jab combo, tilts, dash attack on the ground; aerials in the air. Smash: forward / up / down
smash (hold to charge); up smash also reaches straight up through the platform overhead, so it hits
someone standing on it. Special + direction: neutral / side / up (recovery) / down special.
Down on a platform drops through it, and holding down while falling passes through platforms
instead of landing on them.

**Ledges** work like in Ultimate. Falling (or recovering with an up special) close to a corner of
the stage grabs it, unless you hold down. Grabbing restores your air jumps, air dodge and
once-per-air specials, and the first grab since you last touched the ground makes you briefly
intangible (regrabs don't, so you can't stall on the ledge). From the ledge: up or toward the stage
climbs up, jump leaps up, attack / smash / special climbs into a ledge attack, shield rolls in, and
down or away lets go. Hanging for 5 seconds lets go by itself. Grabbing a ledge someone already
hangs from knocks them off it. The rules are in `src/sim/ledges.ts`, the numbers in `src/sim/rules.ts`.
Shield + direction rolls or spot dodges, shield + attack grabs; while holding, attack pummels
and a direction throws.

Menus: directions to move, Attack / Jump / Enter to choose, Special / Esc to go back.
In a match: Esc or the pad's Menu button pauses, F1 toggles the debug overlay, R resets (Training).

Gamepads are assigned in the order they connect (first pad = P1, second = P2); each player's
keyboard keys keep working too. On character select, a pad's View/Back button moves it to the
other player.

All bindings (both keyboard layouts and the gamepad) live in `src/input/bindings.ts`.

## Replays and determinism

Every match is recorded as its setup (seed, stage, fighters, stocks) plus each frame's inputs
(`src/sim/replay.ts`). The simulation is deterministic, so that is enough to play the match back
exactly. **Watch replay** (on the results screen, and in the main menu once a match has been
played) re-simulates the last match:

| Key | In a replay |
|---|---|
| J / Space / Enter (pad A or Menu) | pause / resume; at the end, watch again |
| A / D (d-pad) | slower / faster (¼× to 4×); while paused, one frame back / forward |
| R | restart |
| Esc / I (pad B) | back |

A replay also stores a state hash every 60 frames. Playback checks against them (F1 shows
"checksums ok") and shows "REPLAY DESYNC at frame N" if one ever differs.

`tests/determinism.test.ts` plays 12,000-frame matches of seeded random input (`tests/masher.ts`)
covering all eight fighters plus a mirror match, and checks every frame: the replay plays back
to the same `hashState` (also after a JSON round-trip), two runs stepped side by side stay
identical, saving at frame N and re-simulating from a clone or from serialized bytes reproduces
the original (including after a mispredicted branch, as rollback will do), `step()` never
mutates its input, and the state only ever holds int32 integers.

## Rollback netcode and the netcode test

Online play uses our own small rollback session (`src/net/session.ts`, GGPO-style). Each tick a
peer schedules its local input `inputDelay` frames ahead (2 by default, 0–4), simulates the next
frame at once while predicting that the other player still holds their last known input, and
sends every input the other side hasn't acknowledged yet (so a lost packet doesn't matter). When a
real input arrives that differs from the prediction, it rewinds to that frame (the last 8 states
are kept) and re-simulates to the present. It never runs more than 8 frames past the last remote
input it has; past that it waits. Time sync skips a frame now and then while one peer is
consistently more than a frame ahead. Every 60 frames both peers compare `hashState` of a
confirmed frame (one simulated with both players' real inputs); a mismatch shows
**DESYNC at frame N** and logs both states and the fields that differ to the console.
Confirmed frames also go into a normal replay, so a networked match can be watched again.

| File | Job |
|---|---|
| `src/net/session.ts` | input delay, prediction, rollback, waiting, replay recording |
| `src/net/sync.ts` | frame advantage and time sync |
| `src/net/desync.ts` | checksum comparison and state dumps |
| `src/net/protocol.ts` | binary packet format |
| `src/net/transports/` | `Transport` interface, `LoopbackTransport` (tests), `FakeNetwork` (latency, jitter, loss) |

**Netcode test** (main menu) runs one match as two sessions side by side: the left half is P1's
machine, the right half P2's, linked by a fake network. P1's versus keys (and pad 1) play on the
left, P2's (and pad 2) on the right. The bar on top sets:

- **Latency**: one-way delay per packet, 0–200 ms (the ping shown is about twice this)
- **Jitter**: up to this much extra random delay per packet, so packets also arrive out of order
- **Loss**: share of packets dropped, 0–20%
- **Input delay**: frames between pressing a button and it taking effect, on both machines

It starts at 100 ms, 10 ms jitter and 5% loss. **Hitch P2** freezes P2's machine for half a second
(P1's waits, then time sync evens them out), **Force desync** nudges P2's simulation so the next
checksum catches it, and **Restart** starts over. Each half shows its machine's net stats in the
top-right corner (inside the F1 panel while that's open): ping, rollback frames per second and
depth, local / remote frame advantage, waits (ticks spent waiting for the other machine), skips
(frames skipped by time sync) and checksums matched.

How far it stretches (8 frames of rollback, 2 frames of input delay): up to about 150 ms one way
(300 ms ping) play stays at full speed; beyond that both machines start waiting for each other and
the game slows down. Raising the input delay buys a little more.

`tests/net.test.ts` runs both peers on a virtual clock and checks that they confirm exactly what
an offline run of the same inputs produces: over a perfect link; at 100 ms / 10 ms jitter / 5% loss
for 7,200 frames (rollbacks within 8 frames, no waiting); with heavy jitter and duplicated packets;
while the input delay changes; at the exact frame a late input rewinds to; through a stall and time
sync; on disconnect; and that desyncs are detected.

## Online play

Two browsers play 1v1 over a direct WebRTC connection, using the same rollback session as the
netcode test. A small signaling server (`server/`) only introduces them: it hands out room codes
and passes the WebRTC offer, answer and ICE candidates between the two. Once they are connected
it is out of the picture and never sees the game.

**Create Online Room** shows a 5-letter code and a join link. The friend either opens the link
(`…/?room=ABCDE`) or picks **Join Online Room** and types the code. Both then pick fighters on a
shared character select (each moves their own cursor; the match starts once both are locked in),
play with the one-player ("solo") keys or a pad, and on the results screen choose **Rematch**
(starts when both ask), **Character select** (takes both there) or **Leave room**. During a
match, Esc twice leaves. If nothing arrives from the other player for 3 seconds the match ends
with "connection lost"; if the other player leaves, you are told so.

Each side's HUD marks its own fighter "YOU", and F1 shows the same netcode stats as the netcode
test (ping, rollbacks, frame advantage, checksums). A finished or abandoned online match can be
watched again from the main menu.

### Running it locally

```bash
npm run server   # terminal 1: ws://localhost:8787
npm run dev      # terminal 2 (or open dist/index.html from disk)
```

Open the game in two browser windows (or two browsers), create a room in one and join from the
other. To play on two machines on the same network, run `npm run dev -- --host` and open
`http://<your-ip>:5173/?signal=ws://<your-ip>:8787` on both. The game finds the signaling server
in this order: a `?signal=` URL parameter (remembered in that browser, and carried in join links),
then `VITE_SIGNAL_URL` at build time, then port 8787 on the page's own host (localhost when opened
from disk).

### Deploying

- **Game:** any static host. `npm run build:html` gives one self-contained `dist/index.html`
  (GitHub Pages already publishes it; see above). Build with `VITE_SIGNAL_URL=wss://your-server`
  to point it at your signaling server.
- **Signaling server:** any small Node 24 host (it runs the TypeScript directly). `npm ci`, then
  `PORT=8787 npm run server`. Pages served over https may only open `wss://` connections, so put it
  behind TLS, e.g. a reverse proxy (Caddy, nginx) or a platform that terminates TLS for you.
- **TURN (optional):** players behind strict NATs or firewalls can't always connect directly; the
  game then says "Couldn't connect to the other player". A TURN server relays their traffic. Give
  the signaling server its address and credentials and it passes them to both browsers:

  | Variable | Meaning |
  |---|---|
  | `PORT` | port to listen on (default 8787) |
  | `STUN_URLS` | comma-separated STUN URLs (default `stun:stun.l.google.com:19302`) |
  | `TURN_URLS` | comma-separated TURN URLs, e.g. `turn:turn.example.com:3478` |
  | `TURN_USERNAME`, `TURN_CREDENTIAL` | TURN credentials |

### How it fits together

| File | Job |
|---|---|
| `server/signaling.ts` | rooms and codes, relaying the handshake, ICE config from the environment |
| `src/net/signalMessages.ts` | the JSON messages between browsers and the server |
| `src/net/peer.ts` | the WebRTC handshake: an unreliable `game` channel (`ordered: false, maxRetransmits: 0`) for input packets and a reliable `control` channel |
| `src/net/online.ts` | the room once connected: lobby / rematch messages, heartbeat and round trip, and game packets tagged with a match number so a late packet from the last match never reaches a rematch |
| `src/net/fingerprint.ts` | a hash of a short scripted brawl per fighter: both sides compare it first, so two different builds refuse to play instead of desyncing |
| `src/ui/onlineLobby.ts`, `onlineMatch.ts`, `onlineEnd.ts` | create / join, the match, and "connection lost" |

The host picks the seed and sends it with the fighters; its countdown starts half a round trip
later so both reach frame 0 at about the same time, and time sync evens out the rest.

`tests/signaling.test.ts` runs the real server on a random port with WebSocket clients (rooms,
pairing, relaying, full and unknown rooms, leaving, garbage, limits, timeouts). `tests/online.test.ts`
checks the room link in memory: the version check, heartbeat and timeout, leaving, message
queueing between screens, match tagging, and a whole match played through it confirming the same
frames on both sides as an offline run.
