import { BINDINGS } from './input/bindings';
import { Keyboard } from './input/keyboard';
import { Camera } from './render/camera';
import { drawDebugText, drawDebugWorld } from './render/debug';
import { drawHud } from './render/hud';
import { drawWorld } from './render/renderer';
import { DEFAULT_STOCKS } from './sim/rules';
import { createMatch, type MatchState } from './sim/state';
import { step } from './sim/step';

const FRAME_MS = 1000 / 60;
const MAX_STEPS_PER_TICK = 5;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const keyboard = new Keyboard(window);
const camera = new Camera();

function newMatch(): MatchState {
  return createMatch({ seed: (Math.random() * 0x100000000) >>> 0, stageId: 0, chars: [0], stocks: DEFAULT_STOCKS });
}

let state = newMatch();
let debug = false;
keyboard.onPress(BINDINGS.toggleDebug, () => (debug = !debug));
keyboard.onPress(BINDINGS.reset, () => (state = newMatch()));

let viewW = 0, viewH = 0;
function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  viewW = Math.floor(window.innerWidth * dpr);
  viewH = Math.floor(window.innerHeight * dpr);
  canvas.width = viewW;
  canvas.height = viewH;
}
window.addEventListener('resize', resize);
resize();

// FPS counters (render-side only).
let renderFrames = 0, simFrames = 0, renderFps = 0, simFps = 0, fpsWindowStart = performance.now();

let acc = 0;
let last = performance.now();

function tick(now: number): void {
  let dt = Math.min(now - last, 250);
  last = now;
  // On a ~60 Hz display, snap tiny rAF jitter to exactly one frame so we don't
  // alternate between 0 and 2 sim steps per displayed frame.
  if (Math.abs(dt - FRAME_MS) < 1) dt = FRAME_MS;
  acc += dt;

  let steps = 0;
  while (acc >= FRAME_MS && steps < MAX_STEPS_PER_TICK) {
    const input = keyboard.sample(0);
    keyboard.endFrame();
    state = step(state, [input]);
    acc -= FRAME_MS;
    steps++;
  }
  if (steps === MAX_STEPS_PER_TICK) acc = 0; // fell far behind (tab was hidden, etc.)
  simFrames += steps;

  camera.update(state, viewW, viewH);
  drawWorld(ctx, state, camera, viewW, viewH);
  if (debug) drawDebugWorld(ctx, state, camera, viewW, viewH);
  drawHud(ctx, state, viewW, viewH);
  if (debug) drawDebugText(ctx, state, { renderFps, simFps });

  renderFrames++;
  if (now - fpsWindowStart >= 1000) {
    renderFps = renderFrames;
    simFps = simFrames;
    renderFrames = simFrames = 0;
    fpsWindowStart = now;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
