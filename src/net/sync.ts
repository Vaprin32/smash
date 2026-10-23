// Time sync: keeps both peers on about the same frame, so neither has to roll
// back further than needed. Each tick a peer measures its frame advantage: its
// frame minus its estimate of the peer's current frame (the last frame the
// peer reported plus half a round trip). It also sends that number along.
// Latency estimates are never exact, but the error shows up on both sides
// alike: if we are A frames ahead, our measure is about A + e and the peer's
// about -A + e. So (ours - theirs) / 2 ≈ A. While that average stays above
// one frame, we skip a frame now and then and the peer catches up.

export const FRAME_MS = 1000 / 60;
/** Samples averaged on each side. */
export const SYNC_WINDOW = 40;
/** Wait only when ahead by more than this many frames on average. */
export const SYNC_THRESHOLD = 1;
/** Ticks between two skipped frames, so a correction shows up in the measures before the next. */
export const SYNC_COOLDOWN = 30;

export class TimeSync {
  /** Latest measured advantage, in frames (negative: behind). */
  advantage = 0;
  private local: number[] = [];
  private remote: number[] = [];
  private cooldown = 0;

  /** Measure once per tick. `remoteFrame`: newest frame the peer reported (-1: none yet). `rttMs`: -1 if unknown. */
  measure(localFrame: number, remoteFrame: number, rttMs: number): void {
    if (this.cooldown > 0) this.cooldown--;
    if (remoteFrame < 0) return;
    this.advantage = localFrame - (remoteFrame + Math.max(0, rttMs) / 2 / FRAME_MS);
    push(this.local, this.advantage);
  }

  /** The peer's own measure, from one of its packets. */
  onRemote(advantage: number): void {
    push(this.remote, advantage);
  }

  get localAverage(): number {
    return average(this.local);
  }

  get remoteAverage(): number {
    return average(this.remote);
  }

  /** How many frames we are ahead of the peer, on average (negative: behind). */
  get lead(): number {
    return (this.localAverage - this.remoteAverage) / 2;
  }

  /** True if this tick should not advance, to let the peer catch up. */
  shouldWait(): boolean {
    if (this.cooldown > 0 || this.local.length < SYNC_WINDOW || this.remote.length === 0) return false;
    if (this.lead <= SYNC_THRESHOLD) return false;
    this.cooldown = SYNC_COOLDOWN;
    return true;
  }
}

function push(window: number[], v: number): void {
  window.push(v);
  if (window.length > SYNC_WINDOW) window.shift();
}

function average(window: readonly number[]): number {
  return window.length === 0 ? 0 : window.reduce((a, b) => a + b, 0) / window.length;
}
