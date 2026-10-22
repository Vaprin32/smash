import { Sfx } from './audio/sfx';
import { Controls } from './input/controls';
import { Keyboard } from './input/keyboard';
import { App } from './ui/app';
import type { View } from './ui/draw';

const FRAME_MS = 1000 / 60;
const MAX_STEPS_PER_TICK = 5;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const keyboard = new Keyboard(window);
const sfx = new Sfx();
const app = new App(new Controls(keyboard), sfx);
window.addEventListener('keydown', () => sfx.unlock());
window.addEventListener('pointerdown', () => sfx.unlock());

const view: View = { w: 0, h: 0, dpr: 1 };
function resize(): void {
  view.dpr = window.devicePixelRatio || 1;
  view.w = Math.floor(window.innerWidth * view.dpr);
  view.h = Math.floor(window.innerHeight * view.dpr);
  canvas.width = view.w;
  canvas.height = view.h;
}
window.addEventListener('resize', resize);
resize();

let acc = 0;
let last = performance.now();

function frame(now: number): void {
  let dt = Math.min(now - last, 250);
  last = now;
  // On a ~60 Hz display, snap tiny rAF jitter to exactly one frame so we don't
  // alternate between 0 and 2 fixed ticks per displayed frame.
  if (Math.abs(dt - FRAME_MS) < 1) dt = FRAME_MS;
  acc += dt;

  let steps = 0;
  while (acc >= FRAME_MS && steps < MAX_STEPS_PER_TICK) {
    app.controls.poll();
    app.tick();
    acc -= FRAME_MS;
    steps++;
  }
  if (steps === MAX_STEPS_PER_TICK) acc = 0; // fell far behind (tab was hidden, etc.)

  app.draw(ctx, view, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
