# Build spec: browser platform fighter with rollback netcode

You are building a 2D platform fighter in the style of Super Smash Bros. / Brawlhalla that runs in the browser and supports online 1v1 play with rollback netcode. All characters, names and art must be original (placeholder shapes are fine). Do not use any Nintendo or Brawlhalla assets, names or likenesses.

Read this whole file before writing code. Re-read the "Hard rules" section before every milestone.

## How we work

- Build **one milestone at a time**, in order. When a milestone is done: run the tests, run the type checker, then stop and give me (1) a short summary of what changed, (2) exact steps to try it in the browser, and (3) anything you were unsure about. Wait for my go-ahead before starting the next milestone.
- Commit to git at the end of each milestone with a clear message.
- **Always keep `dist/smash.html` up to date.** I test the game locally by opening that file, not the dev server. After every code change (milestones, fixes, tweaks, anything that affects the game), run `npm run build:html` before handing back, and check the change in that file. Never tell me something is fixed unless the rebuilt `smash.html` has it.
- Prefer small, readable files. No dependency gets added unless it saves real work; ask me before adding anything heavy.
- If something in this spec turns out to be a bad idea in practice, tell me and propose an alternative instead of silently deviating.

## Stack

- **Client:** TypeScript (strict), Vite, HTML Canvas 2D. No game framework, no physics engine.
- **Server:** Node + TypeScript, the `ws` package. Its only job is signaling (room codes, relaying WebRTC offers/answers/ICE candidates). It never runs the game.
- **Networking:** WebRTC data channels, peer to peer. Channel config `{ ordered: false, maxRetransmits: 0 }` (UDP-like).
- **Tests:** Vitest.
- Monorepo layout with npm workspaces is fine, or a single package with `src/` and `server/`; pick whichever is simpler.

## Hard rules (these make rollback possible — never break them)

1. **The simulation is deterministic.** Given the same starting state and the same inputs, `step()` must produce bit-identical results on every machine and every browser.
   - All simulation math uses **integers** (fixed point). Store positions and velocities in subpixel units (e.g. 1 pixel = 256 units). Use `Math.trunc`, `| 0` or bit shifts for division. No floats in sim state.
   - Banned inside `src/sim/`: `Math.random`, `Date`, `performance`, `setTimeout`/`setInterval`, `requestAnimationFrame`, `Math.sin/cos/tan/atan2/pow/exp/log`, any DOM or browser API, and any import from outside `src/sim/`. If you need trig, use an integer lookup table. If you need randomness, use a seeded integer PRNG (e.g. xorshift32) whose state is part of the game state.
   - Add a test that scans `src/sim/` source files for banned tokens and fails if any appear.
2. **All game state is one serializable value.** `MatchState` holds everything needed to resume a match: frame number, RNG state, every fighter (position, velocity, facing, damage %, stocks, current action, action frame, hitstun/hitlag counters, jumps left, invincibility timer, etc.), and anything else the sim reads. It must be cheap to copy (plain objects / arrays of integers, or typed arrays). Provide `cloneState`, `serializeState` (to bytes) and `hashState` (FNV-1a over the bytes).
3. **The sim is a pure function of state + inputs.** `step(state: MatchState, inputs: InputBits[]): MatchState` (or mutate-in-place on a clone; your call, but be consistent). Rendering, audio and particles only *read* state; they never write to it. Sound and visual effects are derived from state transitions (e.g. "this fighter's action frame is 1 and the action is `jab`"), so replaying frames after a rollback doesn't double-trigger them; dedupe effects by `(frame, fighter, event)`.
4. **Fixed 60 Hz timestep.** The sim always advances in whole frames. Rendering runs on `requestAnimationFrame` with an accumulator; no interpolation needed at first.
5. **Inputs are a per-frame bitmask** per player (left, right, up, down, jump, attack, special, dodge, plus room to grow). Input sampling happens outside the sim and produces one bitmask per frame.

## Game design (v1 scope)

Keep it small and make it feel good. Eight original fighters, one stage, 1v1, 3 stocks.

**Movement:** walk, run (on double-tap or hold, pick one), short hop vs full hop (based on how long jump is held), one double jump, fast-fall (down while falling), air drift, ground friction, air friction, max fall speed. Platforms: one main solid stage plus 2–3 pass-through platforms (drop through with down). Blast zones on all four sides; crossing one loses a stock. Respawn above the stage with ~2 seconds of invincibility.

**Combat:**
- Each move is defined as **data** (JSON or TS objects in `src/sim/moves/`): total frames, and a list of hitbox windows `{ startFrame, endFrame, offsetX, offsetY, radius or w/h, damage, baseKnockback, knockbackGrowth, angle }`, plus landing lag for aerials.
- Fighters have a hurtbox (capsule or rectangle).
- On hit: add damage %, apply **hitlag** to both fighters (a few frames of freeze scaled by damage), then launch the victim. Knockback magnitude ≈ `base + (victimDamage * growth) / scale`, applied at the move's angle (flipped by attacker facing). Hitstun frames scale with knockback. A move hits a given fighter only once per use.
- Moveset per fighter: grounded light attack in 3 directions (neutral, side, down), aerial light attack in 4 directions (neutral, forward, back/down, up), a heavy/special in 2 directions (side, up — up is the recovery move), and a dodge (ground: short invincible roll; air: brief invincible air dodge, usable once per airtime).
- The eight fighters must each look and feel different. Vary body size (hurtbox and drawn body together), weight, walk/run speed, jump height and number of air jumps, gravity and fall speed, and attack speed, range and power. The roster covers at least these archetypes:
  1. fast, light and floaty with weak moves;
  2. heavy, slow and hard-hitting;
  3. tiny featherweight with extra air jumps;
  4. giant super-heavyweight;
  5. fast-falling rushdown;
  6. floaty long-range zoner;
  7. long-reach (disjointed) fighter;
  8. all-rounder.
- Each fighter has its own colors, body proportions and one distinguishing visual feature (e.g. scarf, helmet, cape, blade), plus an alternate color for mirror matches. Each has its own hand-written signature specials. Their other moves may come from a shared template scaled per fighter (frame timings, size/reach, damage, knockback), so all eight stay readable and tunable in one place each.

**Presentation:** fighters as simple colored shapes with an outline and a facing indicator, a camera that zooms/pans to keep both fighters in view (camera is render-only, not sim state), damage % and stock icons at the bottom, simple hit sparks, screen shake on strong hits, and a basic WebAudio blip for hits. A debug overlay toggled with F1 shows hitboxes (red), hurtboxes (yellow), frame number, current action and action frame, and in online mode: ping, rollback frames per second, max rollback depth, and the current local/remote frame advantage.

**Controls:** keyboard defaults for 2 local players (e.g. P1: WASD + J/K/L/; and P2: arrows + numpad), plus Gamepad API support. Make bindings a single config object.

## Rollback netcode design

Implement our own small rollback session rather than pulling in a library, so we fully understand it. Put it in `src/net/`.

- **Session interface:** a `Session` class that owns the frame loop and works with any `Transport` (`send(bytes)`, `onMessage(cb)`). Implementations: `LoopbackTransport` (same tab, for tests), `FakeNetworkTransport` (adds configurable latency, jitter and packet loss), and `WebRTCTransport`.
- **Input delay:** 2 frames by default (configurable 0–4).
- **Prediction:** when the remote input for a frame hasn't arrived, predict it as "same as their last known input".
- **Rollback:** keep a ring buffer of saved states and inputs for the last `MAX_ROLLBACK = 8` frames. When a real remote input arrives that differs from what was predicted, restore the state from that frame and re-simulate up to the current frame. If the remote falls more than `MAX_ROLLBACK` frames behind, pause locally (don't advance) until inputs arrive.
- **Packets:** every packet carries the sender's current frame, the last remote frame it has confirmed, and all of its own inputs that the other side hasn't acknowledged yet (redundancy, so a lost packet doesn't matter). Inputs are tiny, so send every frame.
- **Time sync:** each side tracks its frame advantage over the other. If we are consistently ahead by more than 1 frame, skip advancing for one frame occasionally so the peers drift back together. Keep this simple.
- **Desync detection:** every 60 frames, each peer sends `hashState` for a confirmed frame. If hashes differ, show a big "DESYNC at frame N" message in the debug overlay and log both serialized states to the console.
- **Match start:** the host picks a random seed and stage/fighter choices and sends them to the guest; both start from identical initial state at frame 0 after a short synchronized countdown.
- **Disconnects:** if no packet arrives for 3 seconds, end the match with a "connection lost" screen.

## Signaling and lobby

- Signaling server: `POST`/WebSocket "create room" → returns a 4–5 letter room code. "Join room" with a code pairs exactly two clients; the server relays SDP and ICE messages between them, then is no longer involved.
- ICE servers come from config: a public STUN server by default, plus optional TURN credentials read from environment variables (needed for players behind strict NATs; document this in the README).
- Client flow: main menu → Local Versus / Create Online Room / Join Online Room → character select (both players pick) → match → results screen with Rematch / Back to menu.
- Also support a URL like `/?room=ABCDE` that joins directly, so a host can just send a link.

## Folder structure (suggested)

```
src/
  sim/        state.ts, step.ts, physics.ts, combat.ts, fighters/, moves/, stage.ts, rng.ts, fixed.ts
  render/     renderer.ts, camera.ts, hud.ts, effects.ts, debug.ts
  input/      keyboard.ts, gamepad.ts, bindings.ts
  net/        session.ts, transports/, protocol.ts, sync.ts
  audio/      sfx.ts
  ui/         menus, character select, lobby
  main.ts
server/
  index.ts    signaling only
tests/
```

## Milestones

Each milestone lists what "done" means. Don't move on until those all hold.

**M1 — Skeleton + movement feel (local, 1 player)**
Vite app runs, fixed-timestep loop, integer fixed-point helpers, stage with solid ground and pass-through platforms, one fighter with full movement (walk/run, short/full hop, double jump, fast-fall, drop-through, blast zones, respawn). F1 debug overlay with frame counter and boxes.
Done when: movement feels responsive at 60 fps; tunable constants live in one place per fighter; banned-token test passes.

**M2 — Combat**
Hitboxes/hurtboxes, move data format, full moveset for fighter A, damage %, hitlag, knockback, hitstun, stocks, dodges, respawn invincibility.
Done when: you can hit a training dummy (second fighter with no input) and it flies further at higher %; hitboxes are visible in debug view.

**M3 — Local versus**
Seven more fighters (eight in total) with distinct stats, visuals and specials, as described under Game design. Two local players on keyboard and gamepads, camera, HUD, menus, character select (all eight fighters in a grid, with a preview and stat bars), results screen.
Done when: two people on one keyboard can play a full 3-stock match start to finish with any pair of the eight fighters, mirror matches included. Tests check that every fighter's move data is valid, that the fighters' stats really differ, that heavier fighters are launched less far, and that every fighter can recover to the stage from just off the edge.

**M4 — Determinism harness + replays**
Record a match as `(seed, setup, input list)`. Tests: (a) run the same recorded inputs twice and assert identical `hashState` at every frame; (b) run a long randomized-input match and assert identical hashes across two runs; (c) save-state at frame N, simulate to M, restore N, re-simulate to M, assert identical hash. Add a "watch replay" option for the last match.
Done when: all determinism tests pass for 10,000+ frames of random input.

**M5 — Rollback over a fake network**
`Session` with rollback, input delay, prediction, time sync and desync checks. A dev page that runs two sessions side by side in one tab, connected by `FakeNetworkTransport` with sliders for latency (0–200 ms), jitter and packet loss (0–20%). Both halves controllable (P1 keys on the left session, P2 keys on the right).
Done when: at 100 ms latency and 5% loss, play stays smooth, the two halves end up in identical states (no desync messages), and the debug overlay shows rollback stats.

**M6 — Real online play**
Signaling server, `WebRTCTransport`, room codes, join-by-link, lobby → character select → match → rematch over the network, disconnect handling. README with how to run locally (two browser windows) and how to deploy (static client on any static host; signaling server on a small Node host; TURN optional).
Done when: two different machines can find each other via a room code and play a full match without desyncing.

**M7 — Polish (only after M6 works)**
Better placeholder art or simple sprite animation, more sound, a second stage, a training mode with a frame-data readout, and remappable controls. Ask me which of these to prioritize.

## Things to avoid

- Running physics or game logic in `requestAnimationFrame` deltas — the sim only ever advances by whole fixed frames.
- Letting render-side code (camera, particles, UI state) leak into `MatchState`, or sim code read anything outside it.
- Iterating over objects in an order that could differ between peers; keep fighters and hitboxes in arrays with stable order.
- Sending full game state over the network. Only inputs (and periodic hashes) are sent.
- Building 4-player online before 1v1 online is solid.
