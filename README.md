# Smash prototype

Browser platform fighter with (eventually) rollback netcode. See [SPEC.md](SPEC.md).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest
npm run typecheck  # tsc --noEmit
npm run build:html # dist/smash.html, a single file that runs from disk
```

Main menu → **Local Versus** (two players) or **Training** (you against an idle CPU dummy) →
character select → 3-stock match → results (Rematch / Watch replay / Character select / Main menu).

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

Each fighter's stats live in `src/sim/fighters/<name>.ts`. Moves are in `src/sim/moves/<name>.ts`:
a tuning line (frames / size / reach / damage / knockback, relative to Wisp's moveset)
plus that fighter's hand-written specials. Looks (proportions, colors, accessory) are in
`src/render/looks.ts`.

## Controls

Menus and Training use the one-player layout. Local Versus splits the keyboard in half
(no numpad needed), and P2's half is P1's mirrored around the middle of each row: movement on
the outside, actions toward the middle. Keys are physical positions (Ñ is `;` on a US keyboard).

| Action | Training (P1) | Versus P1 | Versus P2 | Gamepad |
|---|---|---|---|---|
| Move (up left down right) | W A S D | W A S D | O K L Ñ | left stick / d-pad |
| Jump | L or Space | R | U | X / Y |
| Attack | J | F | J | A |
| Smash (ground only) | K | T | Y | RB |
| Special | I | G | H | B |
| Shield / roll / dodge / grab | E | E | I | LT / RT |
| Dash | N | B | N | LB |

Attack: jab combo, tilts, dash attack on the ground; aerials in the air. Smash: forward / up / down
smash (hold to charge). Special + direction: neutral / side / up (recovery) / down special.
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
