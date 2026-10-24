// An online match: one rollback Session talking to the other browser over
// the room's game channel. The host's countdown starts half a round trip
// after it sends "start", so both machines reach frame 0 at about the same
// moment (time sync evens out the rest). Matches can't pause; Esc twice
// leaves the room.

import { netDebugLines } from '../render/debug';
import type { OnlineLink } from '../net/online';
import { Session } from '../net/session';
import { createMatch, type MatchSetup, type MatchState } from '../sim/state';
import type { App, Screen } from './app';
import { beginLayout, text, type View } from './draw';
import { countDown, COUNTDOWN, drawBanner, END_TICKS, HeldGate } from './matchFlow';
import { MatchView } from './matchView';
import { matchResult, MatchStats } from './results';

const clock = () => performance.now();
/** Esc arms leaving for this many ticks; a second Esc within them leaves. */
const LEAVE_ARM_TICKS = 120;
const W = 1100;

export class OnlineMatchScreen implements Screen {
  private view: MatchView;
  private gate: HeldGate;
  private preview: MatchState;
  private session: Session | null = null;
  private stats: MatchStats;
  private startAt: number;
  private countdown = COUNTDOWN;
  private sinceStart = 0;
  private endTicks = -1;
  private leaveArmed = 0;

  constructor(
    private app: App,
    private link: OnlineLink,
    readonly setup: MatchSetup,
    readonly match: number,
    startDelayMs: number,
  ) {
    this.view = new MatchView(app);
    this.gate = new HeldGate(app.controls);
    this.gate.block();
    this.preview = createMatch(setup);
    this.stats = new MatchStats(setup.chars.length);
    this.startAt = clock() + startDelayMs;
    // Nothing is expected mid-match (leaving and drops go to the App); later messages wait for the results.
    link.listen(null);
  }

  leave(): void {
    this.keepReplay();
  }

  private keepReplay(): void {
    const replay = this.session?.replay;
    if (replay && replay.inputs.length > 0) this.app.lastMatch = { mode: 'online', replay };
  }

  tick(): void {
    const c = this.app.controls;
    if (this.leaveArmed > 0) this.leaveArmed--;
    if (c.backKey) {
      if (this.leaveArmed > 0) {
        this.keepReplay(); // before the main menu is built, so it offers "Watch replay"
        return this.app.leaveOnline();
      }
      this.leaveArmed = LEAVE_ARM_TICKS;
    }
    if (this.endTicks >= 0) {
      if (++this.endTicks >= END_TICKS) this.finish();
      return;
    }
    if (!this.session) {
      this.gate.block();
      if (clock() < this.startAt) return;
      this.countdown = countDown(this.countdown, this.app.sfx);
      if (this.countdown === 0) this.start();
      return;
    }

    const s = this.session;
    s.tick(this.gate.input(0));
    if (s.disconnected) return this.app.onlineLost('dropped');
    this.sinceStart++;
    if (s.finished) this.endTicks = 0;
  }

  private start(): void {
    this.session = new Session({
      setup: this.setup,
      localPlayer: this.link.slot,
      transport: this.link.game(this.match),
      now: clock,
      onStep: (prev, next, resim) => this.view.onStep(prev, next, resim),
      onConfirm: (prev, next) => this.stats.onStep(prev, next),
    });
  }

  private finish(): void {
    this.keepReplay();
    this.app.toResults(matchResult('online', this.setup.chars, this.session!.confirmed, this.stats));
  }

  draw(ctx: CanvasRenderingContext2D, view: View, dtMs: number): void {
    const s = this.session;
    const you = this.link.slot;
    const labels = this.setup.chars.map((_, slot) => (slot === you ? 'YOU' : ''));
    const ping = this.link.rttMs < 0 ? '' : ` · ping ${Math.round(s && s.stats.pingMs >= 0 ? s.stats.pingMs : this.link.rttMs)} ms`;
    const hint = `Online · room ${this.link.code}${ping} · Esc twice: leave`;
    this.view.draw(ctx, view, dtMs, s?.state ?? this.preview, { labels, hint }, s ? netDebugLines(s) : []);
    drawBanner(ctx, view, { countdown: s ? 0 : this.countdown, sinceStart: this.sinceStart, ended: this.endTicks >= 0 });

    beginLayout(ctx, view, W, 720);
    const alert = { size: 34, bold: true, align: 'center' as const, outline: true, color: '#ff4f4f' };
    if (s && s.desyncFrame >= 0) text(ctx, `DESYNC at frame ${s.desyncFrame}`, W / 2, 190, alert);
    else if (s?.waiting) text(ctx, 'waiting for the other player…', W / 2, 190, { ...alert, size: 20, color: '#ffd166' });
    if (this.leaveArmed > 0) text(ctx, 'Press Esc again to leave the room', W / 2, 240, { ...alert, size: 22, color: '#f6ecd2' });
  }
}
