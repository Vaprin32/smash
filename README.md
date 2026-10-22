# Smash prototype

Browser platform fighter with (eventually) rollback netcode. See [SPEC.md](SPEC.md).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest
npm run typecheck  # tsc --noEmit
```

Controls (P1), laid out like Smash Ultimate:

| Key | Ground | Air |
|---|---|---|
| A / D | walk (hold to run) | drift |
| L or Space | jump | double jump |
| S | drop through platforms | fast-fall |
| N | dash | – |
| J (+ W/A/D/S) | jab combo, side / up / down tilt; dash attack while running | neutral / forward / back / up / down air |
| K (+ W/A/D/S) | forward / up / down smash (hold to charge) | specials (same as I) |
| I (+ W/A/D/S) | neutral (Wind Bolt), side (Gust Dash), up (Updraft), down (Mirror Guard counter) | same |
| ; | shield (hold); + A/D roll, + S spot dodge, + J grab | air dodge |
| while holding | J pummel; W/A/D/S throw | – |

F1 toggles the debug overlay, R resets. All bindings live in `src/input/bindings.ts`;
Wisp's tuning is in `src/sim/fighters/wisp.ts` and its moves in `src/sim/moves/wisp.ts`.
