// One projectile per fighter, stored as plain fields on FighterState
// (projLife / projX / projY / projVx) so it rolls back with everything else.

import type { StageDef } from './stage';
import type { MatchState } from './state';

export function updateProjectiles(s: MatchState, stage: StageDef): void {
  for (const f of s.fighters) {
    if (f.projLife <= 0) continue;
    f.projX += f.projVx;
    f.projLife--;
    const z = stage.blast;
    if (f.projX < z.left || f.projX > z.right) f.projLife = 0;
    for (const b of stage.blocks) {
      if (f.projX > b.left && f.projX < b.right && f.projY > b.top && f.projY < b.bottom) f.projLife = 0;
    }
  }
}
