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
character select → 3-stock match → results (Rematch / Character select / Main menu).

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

| Action | Player 1 | Player 2 | Gamepad |
|---|---|---|---|
| Move | W A S D | arrows | left stick / d-pad |
| Jump | L or Space | Numpad 3 | X / Y |
| Attack | J | Numpad 1 | A |
| Smash (specials in the air) | K | Numpad 2 | RB |
| Special | I | Numpad 5 | B |
| Shield / roll / dodge / grab | ; | Numpad 0 | LT / RT |
| Dash | N | Numpad 4 | LB |

Attack: jab combo, tilts, dash attack on the ground; aerials in the air. Smash: forward / up / down
smash (hold to charge). Special + direction: neutral / side / up (recovery) / down special.
Shield + direction rolls or spot dodges, shield + attack grabs; while holding, attack pummels
and a direction throws.

Menus: directions to move, Attack / Jump / Enter to choose, Special / Esc to go back.
In a match: Esc or the pad's Menu button pauses, F1 toggles the debug overlay, R resets (Training).

Gamepads are assigned in the order they connect (first pad = P1, second = P2); each player's
keyboard keys keep working too. On character select, a pad's View/Back button moves it to the
other player. Player 2's keyboard layout needs a numpad; without one, use a gamepad.

All bindings (keyboard and gamepad) live in `src/input/bindings.ts`.
