# Smash prototype

Browser platform fighter with (eventually) rollback netcode. See [SPEC.md](SPEC.md).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest
npm run typecheck  # tsc --noEmit
```

Controls (P1): A/D move, L or Space jump, S fast-fall / drop through platforms, F1 debug overlay, R reset.
All bindings live in `src/input/bindings.ts`; Wisp's movement tuning lives in `src/sim/fighters/wisp.ts`.
