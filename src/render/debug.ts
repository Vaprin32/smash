import { ACTION_NAMES } from '../sim/actions';
import { FIGHTERS } from '../sim/fighters';
import { ONE } from '../sim/fixed';
import { STAGES } from '../sim/stage';
import { hashState, type MatchState } from '../sim/state';
import type { Camera } from './camera';

export interface DebugInfo {
  renderFps: number;
  simFps: number;
}

/** Collision geometry, hurtboxes (yellow) and, from M2, hitboxes (red). */
export function drawDebugWorld(ctx: CanvasRenderingContext2D, state: MatchState, cam: Camera, w: number, h: number): void {
  cam.apply(ctx, w, h);
  const stage = STAGES[state.stageId]!;
  const lw = 1.5 / cam.zoom;

  ctx.lineWidth = lw;
  ctx.setLineDash([12 / cam.zoom, 8 / cam.zoom]);
  ctx.strokeStyle = '#ff4fd8';
  const z = stage.blast;
  ctx.strokeRect(z.left / ONE, z.top / ONE, (z.right - z.left) / ONE, (z.bottom - z.top) / ONE);
  ctx.setLineDash([]);

  ctx.strokeStyle = '#4fe3ff';
  for (const b of stage.blocks) {
    ctx.strokeRect(b.left / ONE, b.top / ONE, (b.right - b.left) / ONE, (b.bottom - b.top) / ONE);
  }
  for (const p of stage.platforms) {
    ctx.beginPath();
    ctx.moveTo(p.left / ONE, p.top / ONE);
    ctx.lineTo(p.right / ONE, p.top / ONE);
    ctx.stroke();
  }

  for (const f of state.fighters) {
    const st = FIGHTERS[f.charId]!.stats;
    const x = f.x / ONE, y = f.y / ONE, fw = st.width / ONE, fh = st.height / ONE;
    ctx.strokeStyle = '#ffe14f';
    ctx.lineWidth = 2 / cam.zoom;
    ctx.strokeRect(x - fw / 2, y - fh, fw, fh);
    ctx.fillStyle = '#ffe14f';
    ctx.beginPath();
    ctx.arc(x, y, 3 / cam.zoom, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawDebugText(ctx: CanvasRenderingContext2D, state: MatchState, info: DebugInfo, scale: number): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const lines = [
    `frame ${state.frame}   render ${info.renderFps} fps   sim ${info.simFps} fps`,
    `hash 0x${hashState(state).toString(16).padStart(8, '0')}   rng 0x${(state.rng >>> 0).toString(16)}`,
  ];
  state.fighters.forEach((f, i) => {
    lines.push(
      `P${i + 1} ${FIGHTERS[f.charId]!.name}: ${ACTION_NAMES[f.action] ?? f.action} [${f.actionFrame}]`,
      `   pos ${(f.x / ONE).toFixed(1)}, ${(f.y / ONE).toFixed(1)}   vel ${(f.vx / ONE).toFixed(2)}, ${(f.vy / ONE).toFixed(2)}`,
      `   ground ${f.ground}  jumps ${f.jumpsLeft}  ff ${f.fastFall}  drop ${f.dropTimer}  inv ${f.invincible}  stocks ${f.stocks}`,
    );
  });

  ctx.font = '13px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(8, 8, 520, lines.length * 17 + 10);
  ctx.fillStyle = '#d6ffd6';
  lines.forEach((l, i) => ctx.fillText(l, 16, 26 + i * 17));
}
