# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A browser platform fighter (TypeScript strict, Vite, Canvas 2D, no game framework or physics engine) with its own rollback netcode. `SPEC.md` is the build spec: it sets the milestone workflow and the hard determinism rules. `README.md` documents controls, fighters, CPU levels, replays and the netcode in detail.

## Commands

```bash
npm run dev          # Vite dev server, http://localhost:5173
npm run server       # signaling server for online play, ws://localhost:8787 (Node runs server/*.ts directly)
npm test             # Vitest, whole suite (~8 s)
npx vitest run tests/cpu.test.ts        # one file
npx vitest run -t "recovers"            # tests whose name matches
npm run typecheck    # tsc --noEmit (covers src/, tests/ and server/; noUnusedLocals/Parameters are on)
npm run build:html   # dist/index.html: one self-contained file (JS inlined, IIFE) that runs from file://
npm run build        # typecheck + regular Vite build into dist/app (needs a server)
```

## Working agreements (from SPEC.md)

- **Always rebuild `dist/index.html` (`npm run build:html`) after any change that affects the game.** The user tests by opening that file, not the dev server. It is tracked in git (everything else under `dist/` is ignored). Don't call something fixed unless the rebuilt file has it.
- Work one milestone at a time. When a milestone is done: run tests and typecheck, commit, then stop and report (summary, steps to try it in the browser, open questions) and wait for a go-ahead before the next one.
- Don't add dependencies unless they save real work; ask before adding anything heavy.
- If part of the spec turns out to be a bad idea, say so and propose an alternative instead of silently deviating.
- All characters, names and art must be original (no Nintendo / Brawlhalla assets, names or likenesses).
- Every push to `main` runs `.github/workflows/pages.yml` (typecheck, test, build:html) and deploys `dist/index.html` to GitHub Pages, so a push publishes the live game.

## Architecture

### The deterministic sim (`src/sim/`)

Everything rollback, replays and the CPU rely on comes from these rules. Break them and peers desync.

- `step(prev, inputs)` in `step.ts` is pure: it clones, advances exactly one 60 Hz frame and never mutates `prev`. `inputs[i]` is player i's bitmask (`Btn` in `input.ts`).
- All sim state is integers. Positions and velocities are fixed point with `ONE = 256` subpixels per pixel (`fixed.ts`). `px()` is only for defining constants. Divide with `idiv`/`fmul`/`fdiv`/`Math.trunc`. +y is down, and the main stage top is y = 0.
- `tests/banned.test.ts` scans `src/sim/` and fails on `Math.random`, `Date`, `performance`, timers, rAF, float trig/pow/exp/log, `window`/`document`/`console`, `parseFloat` and similar, and on any import that leaves `src/sim/`. Use the integer trig in `trig.ts` and the seeded RNG in `rng.ts`, whose state lives in `MatchState.rng`.
- `MatchState` (`state.ts`) is `{ frame, rng, stageId, fighters[] }` and every `FighterState` field is an int. Serialization follows the `FIGHTER_FIELDS` array, so **a new fighter field must also be added to `FIGHTER_FIELDS` (append at the end), to `createMatch`, and to `respawn` in `step.ts` if it should reset.** `hashState` is FNV-1a over the serialized bytes.
- Append-only orderings: `FIGHTERS` in `fighters/index.ts` (indexed by `charId`), `MoveId` in `moves/types.ts`, and `FIGHTER_FIELDS`.
- Ledges (`ledges.ts`) are every solid block's two top corners (`ledgeOf(stage, i)`: `2b` left, `2b+1` right). Grabs are resolved in a pass after all fighters move (player order decides ties). Ledge actions (`isLedgeAction`) skip `moveFighter`: the ledge sets the position.
- Up to `MAX_PLAYERS = 4` fighters. Each stage has a spawn layout for every player count.
- Sim → presentation signalling: the sim sets a one-frame `FighterState.event` (`SimEvent` in `events.ts`). Render and audio react to it and dedupe by `(frame, fighter, event)` (`render/effects.ts`), so re-simulating frames after a rollback never double-triggers effects.

### Fighters and moves as data

- `fighters/<name>.ts` holds stats (weight, speeds, gravity, air jumps, hurtbox). `moves/<name>.ts` holds that fighter's moveset.
- A hitbox with `fixed: true` keeps its pixel position and radius for every fighter (not size-scaled). Up smash's top "pillar" uses this so every fighter hits someone on the platform 115 px above.
- Wisp's moveset (`moves/wisp.ts`) is the template. Every other fighter calls `deriveMoves(WISP_MOVES, tuning, ownMoves)` (`moves/derive.ts`): a single `MoveTuning` line (percent frames / size / reach / damage / knockback) rescales every template move, then the fighter's hand-written signature moves (usually the specials) replace template slots. Retune a fighter there, not move by move.
- The down special is the shared Drill Dive from the template (every fighter but Rook, who overrides it with the Riposte counter, and Brick and Basalt, who override it and `DrillLand` with a fast straight plunge: Anvil Drop / Meteor Drop). It uses the generic move fields `rehit` (multi-hit: victim bits of `hitMask` reset every N frames, `HIT_ANY` remembers a connection), `jumpCancel` (jump exits a whiffed move; with `jumpCancelOnHit`, even one that hit) and `landingMove` (touching down starts `MoveId.DrillLand`). A fully charged smash can be held `SMASH_HOLD_FRAMES` more; power is capped at `MAX_SMASH_CHARGE`.
- Move data drives the animation too: `render/animations.ts` keyframes poses from each move's hitbox windows, so changing frame data keeps the visuals in sync.
- Looks (proportions, colors, costume, title) live in `render/looks.ts`, the rig in `render/skeleton.ts`. Render code may use floats and `Math.sin`.

### Outside the sim

- `main.ts` runs the fixed-timestep loop: a rAF accumulator, at most 5 sim ticks per displayed frame, `controls.poll()` before every tick.
- `ui/app.ts` is the screen manager (`Screen` with `tick()` / `draw()` / optional `leave()`). Modes are `'cpu' | 'training' | 'online'` (Local Versus and the netcode test were removed at the user's request). A new screen is constructed before `go()` calls the old one's `leave()`, so state the next screen reads (e.g. `lastMatch` for the main menu's "Watch replay") must be set before navigating. `ui/matchView.ts` draws a match (world, effects, camera, HUD, F1 debug overlay) and is shared by live matches, online matches and replays. The camera is render-only, never sim state.
- `input/bindings.ts` holds player 1's keyboard keys (`layouts.solo`; player 2 only has gamepads) and the gamepad mapping. Keys are physical `e.code` positions. `Keyboard` resolves left+right (and up+down) to the last-pressed key, and ignores key events from editable `<input>`s.
- **CPU players (`src/ai/`) are just input sources.** `CpuPlayer` reads the `MatchState` (opponents delayed by its reaction frames) and returns a `Btn` bitmask, so replays record CPUs like humans. It must never mutate the state it reads. Its randomness is its own seeded xorshift. `predict.ts` is a cheap forward model of moves and physics, and all per-level numbers are in `levels.ts`.
- Replays (`sim/replay.ts`) are setup + per-frame inputs + a `hashState` every 60 frames, and are JSON-safe.
- Netcode (`src/net/`): `session.ts` is a GGPO-style rollback session (input delay, prediction by repeating the last remote input, 8-frame ring buffer, waiting, replay of confirmed frames). It runs over a `Transport` (`transports/`: `LoopbackTransport` and `FakeNetwork` (latency/jitter/loss), both used by tests only; online play uses `OnlineLink`'s WebRTC channel). `sync.ts` handles time sync, `desync.ts` compares checksums every 60 frames, and `protocol.ts` is the binary packet format. Only inputs and hashes go over the wire.
- Online play (M6): `server/signaling.ts` (Node + `ws`) only pairs two clients by room code and relays the WebRTC handshake. Server code must stay erasable TypeScript (no enums or parameter properties) and import with `.ts` extensions, since Node strips types at runtime. Message types shared with the client live in `src/net/signalMessages.ts`. `net/peer.ts` opens two negotiated data channels: `game` (unordered, no retransmits) and `control` (reliable). `net/online.ts`'s `OnlineLink` is the room across screens. Screens take control messages with `link.listen(handler)` (`null` queues them for the next screen). Game packets are prefixed with a 1-byte match number via `link.game(match)`. Peers compare `simFingerprint()` first. The host chooses the seed and sends `start`. Online, the local player always uses player 1's controls (solo layout), whichever slot they occupy.

## Tests worth knowing

- `tests/masher.ts` is a seeded random input source. `determinism.test.ts` uses it for 12,000-frame matches: replay hashes, side-by-side runs, save/restore from clones and serialized bytes, `step()` not mutating its input, and int32-only state.
- `net.test.ts` runs two sessions on a virtual clock and checks that they confirm exactly what an offline run of the same inputs produces. `online.test.ts` does the same through two `OnlineLink`s over in-memory channels. `signaling.test.ts` runs the real server on port 0.
- `roster.test.ts` validates every fighter's move data, that stats really differ, that heavier fighters fly less far, and that every fighter can recover. `moveset.test.ts` pins the input → move table (which buttons and directions give which move). `cpu.test.ts` covers CPU recovery, level ordering (Hard > Normal > Easy) and determinism.

## Checking the game in a real browser

No browser MCP tools are needed. Launch headless Edge (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe --headless=new --remote-debugging-port=...`) and drive it from a Node script over CDP: `Input.dispatchKeyEvent` with `code`, `Page.captureScreenshot`. Pass `--disable-renderer-backgrounding --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-gpu-vsync` and call `Page.bringToFront`, otherwise rAF is throttled and the game loop barely advances. Use a fresh `--user-data-dir` per run. To test online play, run `npm run server` and start one Edge process per player, each with its own debugging port: a background tab in a shared browser gets throttled. Two local browsers connect over WebRTC without extra flags.
