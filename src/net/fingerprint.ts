// A hash of what the simulation does: a short scripted brawl for every
// fighter. Two builds whose fingerprints differ would desync, so online
// peers compare theirs before playing.

import { FIGHTERS } from '../sim/fighters';
import { createMatch, hashState } from '../sim/state';
import { step } from '../sim/step';

const FRAMES = 300;
let cached = -1;

export function simFingerprint(): number {
  if (cached >= 0) return cached;
  let h = 0x811c9dc5;
  for (let c = 0; c < FIGHTERS.length; c++) {
    let s = createMatch({ seed: 1000 + c, stageId: 0, chars: [c, (c + 3) % FIGHTERS.length], stocks: 3 });
    let x = (0x9e3779b9 ^ c) | 0;
    for (let f = 0; f < FRAMES; f++) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      s = step(s, [x & 0x3ff, (x >>> 10) & 0x3ff]);
    }
    h = Math.imul(h ^ hashState(s), 0x01000193);
  }
  cached = h >>> 0;
  return cached;
}
