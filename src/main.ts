import { Sfx } from './audio/sfx';
import { Controls } from './input/controls';
import { Keyboard } from './input/keyboard';
import { loadKeyboardLayout } from './input/keyLabels';
import { loadRemap } from './input/remap';
import { takeRoomFromUrl } from './net/config';
import { gfx, noteFrame, settings } from './render/quality';
import { App } from './ui/app';
import type { View } from './ui/draw';

const FRAME_MS = 1000 / 60;
const MAX_STEPS_PER_TICK = 5;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
loadRemap(); // the player's own key and button choices, if they made any
const keyboard = new Keyboard(window);
const sfx = new Sfx();
const app = new App(new Controls(keyboard), sfx);
const joinCode = takeRoomFromUrl(); // a join link: /?room=ABCDE
if (joinCode) app.toOnlineLobby('join', joinCode);
window.addEventListener('keydown', () => sfx.unlock());
void loadKeyboardLayout(); // key labels for the user's keyboard; until then US labels
window.addEventListener('pointerdown', () => sfx.unlock());

const view: View = { w: 0, h: 0, dpr: 1 };
/** Canvas resolution follows the graphics quality (lower = fewer pixels to paint). */
function resize(): void {
  view.dpr = Math.min(window.devicePixelRatio || 1, gfx.maxDpr) * gfx.resolution;
  view.w = Math.floor(window.innerWidth * view.dpr);
  view.h = Math.floor(window.innerHeight * view.dpr);
  canvas.width = view.w;
  canvas.height = view.h;
}
window.addEventListener('resize', resize);
resize();

let acc = 0;
let last = performance.now();
const fps = { frames: 0, since: performance.now(), shown: 0 };

function frame(now: number): void {
  const raw = now - last; // real time since the last frame, for auto quality
  let dt = Math.min(raw, 250);
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
  if (noteFrame(raw)) resize(); // auto quality stepped down
  if (settings.showFps) drawFps(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function drawFps(now: number): void {
  fps.frames++;
  if (now - fps.since >= 500) {
    fps.shown = Math.round((fps.frames * 1000) / (now - fps.since));
    fps.frames = 0;
    fps.since = now;
  }
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.font = 'bold 13px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(view.w / view.dpr - 70, 4, 66, 20);
  ctx.fillStyle = fps.shown >= 55 ? '#9be59b' : fps.shown >= 40 ? '#ffd166' : '#ff6b5b';
  ctx.fillText(`${fps.shown} fps`, view.w / view.dpr - 10, 19);
}
