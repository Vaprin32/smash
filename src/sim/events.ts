// One-frame events stored in FighterState.event so render/audio can react to
// them (deduped by frame, so rollback replays never double-trigger).

export const SimEvent = {
  None: 0,
  Hit: 1,
  ShieldHit: 2,
  Parry: 3,
  ShieldBreak: 4,
  KO: 5,
  Counter: 6,
  Grab: 7,
} as const;
