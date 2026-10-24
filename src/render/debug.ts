import type { Session } from '../net/session';
import { Action, ACTION_NAMES } from '../sim/actions';
import { activeHitboxes, isIntangible } from '../sim/combat';
import { FIGHTERS } from '../sim/fighters';
import { ONE } from '../sim/fixed';
import { platformAt, STAGES } from '../sim/stage';
import { hashState, type MatchState } from '../sim/state';
import type { Camera } from './camera';

export interface DebugInfo {
  renderFps: number;
  simFps: number;
  /** Extra lines from the screen (e.g. replay progress). */
  lines?: readonly string[];
}

/** Collision geometry, hurtboxes (yellow; cyan while intangible) and active hitboxes (red). */
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
  for (let i = 0; i < stage.platforms.length; i++) {
    const p = platformAt(stage, i, state.frame);
    ctx.beginPath();
    ctx.moveTo(p.left / ONE, p.top / ONE);
    ctx.lineTo(p.right / ONE, p.top / ONE);
    ctx.stroke();
  }

  for (const f of state.fighters) {
    if (f.action === Action.KO || f.action === Action.Out) continue;
    const st = FIGHTERS[f.charId]!.stats;
    const x = f.x / ONE, y = f.y / ONE, fw = st.width / ONE, fh = st.height / ONE;
    ctx.strokeStyle = isIntangible(f, st) ? '#4fe3ff' : '#ffe14f';
    ctx.lineWidth = 2 / cam.zoom;
    ctx.strokeRect(x - fw / 2, y - fh, fw, fh);
    ctx.fillStyle = '#ffe14f';
    ctx.beginPath();
    ctx.arc(x, y, 3 / cam.zoom, 0, Math.PI * 2);
    ctx.fill();

    for (const b of activeHitboxes(f)) {
      ctx.fillStyle = 'rgba(255,40,40,0.35)';
      ctx.strokeStyle = '#ff2828';
      ctx.beginPath();
      ctx.arc(x + (f.facing * b.x) / ONE, y + b.y / ONE, b.r / ONE, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

export function drawDebugText(ctx: CanvasRenderingContext2D, state: MatchState, info: DebugInfo, scale: number): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const lines = [
    `frame ${state.frame}   render ${info.renderFps} fps   sim ${info.simFps} fps`,
    `hash 0x${hashState(state).toString(16).padStart(8, '0')}   rng 0x${(state.rng >>> 0).toString(16)}`,
    ...(info.lines ?? []),
  ];
  state.fighters.forEach((f, i) => {
    const def = FIGHTERS[f.charId]!;
    const action = ACTION_NAMES[f.action] ?? String(f.action);
    const move = f.action === Action.Attack ? ` ${def.moves[f.move]?.name ?? f.move}` : '';
    lines.push(
      `P${i + 1} ${def.name}: ${action}${move} [${f.actionFrame}]   ${f.damage}%`,
      `   pos ${(f.x / ONE).toFixed(1)}, ${(f.y / ONE).toFixed(1)}   vel ${(f.vx / ONE).toFixed(2)}, ${(f.vy / ONE).toFixed(2)}`,
      `   ground ${f.ground}  jumps ${f.jumpsLeft}  ff ${f.fastFall}  hitstun ${f.hitstun}  hitlag ${f.hitlag}  inv ${f.invincible}`,
      `   shield ${(f.shieldHp / 100).toFixed(1)}  dash cd ${f.dashCooldown}`,
    );
  });

  ctx.font = '13px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'left';
  const width = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(8, 8, width, lines.length * 17 + 10);
  ctx.fillStyle = '#d6ffd6';
  lines.forEach((l, i) => ctx.fillText(l, 16, 26 + i * 17));
}

const signed = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;

/** A rollback session's numbers: ping, rollbacks, frame advantage, waits and checksums. */
export function netDebugLines(s: Session): string[] {
  const st = s.stats;
  const ping = st.pingMs < 0 ? '–' : `${Math.round(st.pingMs)} ms`;
  return [
    `ping ${ping}   input delay ${s.inputDelay}   frame ${s.state.frame} (confirmed ${s.confirmed.frame})`,
    `rollback ${st.rollbackFramesPerSec} frames/s   depth ${st.rollbackDepth} (max ${st.maxRollbackDepth})   total ${st.rollbacks}`,
    `frame advantage local ${signed(s.localAdvantage)} / remote ${signed(s.remoteAdvantage)}   waits ${st.stalls}   skips ${st.skips}`,
    s.desyncFrame >= 0 ? `DESYNC at frame ${s.desyncFrame}` : `checksums ${s.checksumsMatched} matched`,
  ];
}
