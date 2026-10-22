// Tiny WebAudio blips. The AudioContext is created on the first key press,
// since browsers block audio until the user interacts with the page.

export class Sfx {
  private ctx: AudioContext | null = null;

  unlock(): void {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Lower and louder for heavier hits. */
  hit(damage: number, launchSpeed: number): void {
    const freq = Math.max(110, 520 - damage * 22 - launchSpeed * 6);
    this.blip(freq, 0.07 + Math.min(0.12, launchSpeed * 0.006), 'square', 0.12);
  }

  ko(): void {
    this.blip(160, 0.45, 'sawtooth', 0.16, 50);
  }

  shield(): void {
    this.blip(900, 0.06, 'triangle', 0.1, 700);
  }

  parry(): void {
    this.blip(1400, 0.18, 'sine', 0.16, 2200);
  }

  counter(): void {
    this.blip(700, 0.25, 'square', 0.12, 1800);
  }

  grab(): void {
    this.blip(260, 0.08, 'triangle', 0.14, 180);
  }

  shieldBreak(): void {
    this.blip(600, 0.5, 'sawtooth', 0.16, 80);
  }

  private blip(freq: number, duration: number, type: OscillatorType, volume: number, endFreq = freq * 0.6): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  }
}
