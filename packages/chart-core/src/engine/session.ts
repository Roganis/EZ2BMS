// A play-through of a published chart, the way EZ2PORT plays it
// (tools/ez2play/play.c), for the editor's Play mode.
//
// - Background sounds fire when their time arrives, on the sample's own voice
//   (retriggering a sample restarts it).
// - Autoplay hits every lane note KOOL on time and sounds it the same way.
// - A press ALWAYS sounds something, on the lane's own voice: the lane note
//   nearest the clock (midpoint rule, judged or not). Judgement is separate:
//   the nearest unjudged note on the lane within its MISS window, windows in
//   judge ticks at that note's BPM.
// - A note left unpressed past its window is a MISS, and sounds nothing.
// - Holds pay instalments through the score's hold machine, advanced once per
//   frame with the song position in whole chart ticks.
// Velocity and pan use the original's DirectSound arithmetic.

import type { Column } from '../modes/registry';
import type { ChartPlan, PlanEvent } from '../publish/chart-plan';
import { dsLevel, dsPan, MIX_UNITY, PAN_CENTRE } from '../ez2data/mixparam';
import { J, noteCounted, Score, tickMs } from './score';
import type { SongIni } from './songini';

export interface SoundCmd {
  /** When the sound starts, song ms. */
  ms: number;
  /** Song-wide keysound index. */
  keysound: number;
  /** DirectSound level, hundredths of a dB (0 = full). */
  level: number;
  /** DirectSound pan -10000..10000. */
  pan: number;
  /** Voice to play on: the sample's own, or a lane's. A new sound on a voice restarts it. */
  voice: string;
}

export interface JudgeFx {
  ms: number;
  /** Column index in the mode. */
  lane: number;
  j: J;
  /** A hold instalment rather than a head. */
  instalment: boolean;
  /** Press before the note (FAST) - heads only. */
  early?: boolean;
  /** The bmson note judged (heads only). */
  noteId?: number;
}

interface LaneNote {
  ev: PlanEvent;
  lane: number;
  tickMs: number;
  judged: boolean;
}

export interface SessionOptions {
  autoplay: boolean;
  /**
   * Start part-way through (song ms): lane notes before this are neither
   * judged nor counted, background before it is not sounded - what a test
   * from the cursor needs.
   */
  startMs?: number;
}

export class PlaySession {
  readonly score = new Score();
  readonly totalNotes: number;
  private readonly notes: LaneNote[];
  private readonly byLane: LaneNote[][];
  private readonly backing: PlanEvent[];
  private nextBacking = 0;
  private readonly down: boolean[];
  private fx: JudgeFx[] = [];
  private sounds: SoundCmd[] = [];
  private nowMs = 0;

  constructor(
    private readonly plan: ChartPlan,
    columns: readonly Column[],
    private readonly ini: SongIni,
    private readonly opts: SessionOptions,
  ) {
    const laneOf = new Map(columns.map((c) => [c.x, c.index]));
    this.down = columns.map(() => false);
    this.byLane = columns.map(() => []);
    const notes: LaneNote[] = [];
    let total = 0;
    const start = opts.startMs ?? -Infinity;
    for (const ev of plan.events) {
      if (!ev.lane || ev.ms < start) continue;
      const lane = laneOf.get(ev.x);
      if (lane === undefined) continue;
      const n: LaneNote = { ev, lane, tickMs: tickMs(plan.tempo.bpmAt(ev.tick)), judged: false };
      notes.push(n);
      this.byLane[lane]!.push(n);
      total += noteCounted(ev.kind, 192, ev.holdTicks ? ev.holdTicks + 6 : 0, 0);
    }
    const byTime = (a: LaneNote, b: LaneNote) => a.ev.ms - b.ev.ms;
    this.notes = notes.sort(byTime);
    for (const l of this.byLane) l.sort(byTime);
    this.backing = plan.events.filter((e) => !e.lane && e.ms >= start).sort((a, b) => a.ms - b.ms);
    this.totalNotes = total;
    this.score.onInstalment = (j, lane) =>
      this.fx.push({ ms: this.nowMs, lane, j, instalment: true });
  }

  /** Move the clock to `nowMs`; returns what to sound and what to show since the last call. */
  advance(nowMs: number): { sounds: SoundCmd[]; fx: JudgeFx[] } {
    this.nowMs = nowMs;
    while (this.nextBacking < this.backing.length && this.backing[this.nextBacking]!.ms <= nowMs) {
      const e = this.backing[this.nextBacking++]!;
      this.sound(e, `k${e.keysound}`, PAN_CENTRE, e.ms);
    }
    for (const n of this.notes) {
      if (n.judged) continue;
      const t = n.ev.ms;
      if (this.opts.autoplay) {
        if (nowMs < t) break;
        n.judged = true;
        this.head(n, J.KOOL, t);
        this.sound(n.ev, `k${n.ev.keysound}`, PAN_CENTRE, t);
      } else if (nowMs - t > this.ini.miss * n.tickMs) {
        n.judged = true;
        this.head(n, J.MISS, nowMs);
        if (n.ev.holdTicks) this.score.setHeld(n.lane, this.down[n.lane]!);
      } else {
        break;
      }
    }
    if (!this.opts.autoplay) this.down.forEach((d, lane) => this.score.setHeld(lane, d));
    // ez2_tempo_tick_at_ms: whole ticks, 0 before the chart starts.
    const nowTick = nowMs > 0 ? Math.max(0, Math.floor(this.plan.tempo.tickAtMs(nowMs))) : 0;
    this.score.holdAdvance(nowTick, this.ini);
    return this.drain();
  }

  /** A key went down on a lane (column index) at `pressMs` (<= the current clock). */
  press(lane: number, pressMs: number): { sounds: SoundCmd[]; fx: JudgeFx[] } {
    this.down[lane] = true;
    const list = this.byLane[lane] ?? [];
    // The keysound: nearest lane note to the clock, by the midpoint rule.
    let before = -1;
    let after = -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i]!.ev.ms <= this.nowMs) before = i;
      else {
        after = i;
        break;
      }
    }
    const pick =
      before < 0
        ? after
        : after < 0
          ? before
          : this.nowMs <= (list[before]!.ev.ms + list[after]!.ev.ms) * 0.5
            ? before
            : after;
    if (pick >= 0) this.sound(list[pick]!.ev, `lane${lane}`, PAN_CENTRE, pressMs);
    // The judgement: the nearest unjudged note within its own MISS window.
    let best: LaneNote | undefined;
    let bestDt = Infinity;
    for (const n of list) {
      if (n.judged) continue;
      const dt = pressMs - n.ev.ms;
      const win = this.ini.miss * n.tickMs;
      if (dt < -win) break;
      if (dt > win) continue;
      if (Math.abs(dt) < bestDt) {
        bestDt = Math.abs(dt);
        best = n;
      }
    }
    if (best) {
      const j = scoreJudge(pressMs - best.ev.ms, best.tickMs, this.ini);
      if (j !== J.NONE) {
        best.judged = true;
        this.head(best, j, pressMs, pressMs < best.ev.ms);
      }
    }
    return this.drain();
  }

  release(lane: number): void {
    this.down[lane] = false;
  }

  private head(n: LaneNote, j: J, ms: number, early?: boolean): void {
    const fx: JudgeFx = { ms, lane: n.lane, j, instalment: false, noteId: n.ev.noteId };
    if (early !== undefined) fx.early = early;
    this.fx.push(fx);
    // A missed hold starts its hold at MISS too (the engine's expiry scan goes
    // through the same commit), so its instalments tick out while released.
    if (n.ev.holdTicks) {
      this.score.holdPress(n.lane, j, n.ev.holdTicks + 6, n.ev.tick, n.ev.kind, 192, this.ini);
    } else {
      this.score.apply(j, this.ini);
    }
  }

  private sound(e: PlanEvent, voice: string, panPos: number, ms: number): void {
    this.sounds.push({
      ms,
      keysound: e.keysound,
      level: dsLevel(MIX_UNITY, MIX_UNITY, MIX_UNITY, e.vel),
      pan: dsPan(panPos, e.pan),
      voice,
    });
  }

  private drain(): { sounds: SoundCmd[]; fx: JudgeFx[] } {
    const out = { sounds: this.sounds, fx: this.fx };
    this.sounds = [];
    this.fx = [];
    return out;
  }

  get finished(): boolean {
    return (
      this.notes.every((n) => n.judged) &&
      this.score.holdPending() === 0 &&
      this.nowMs >= this.plan.endMs
    );
  }
}

function scoreJudge(dtMs: number, tickMsSize: number, ini: SongIni): J {
  const adt = Math.abs(dtMs / tickMsSize);
  if (adt <= ini.kool) return J.KOOL;
  if (adt <= ini.cool) return J.COOL;
  if (adt <= ini.good) return J.GOOD;
  if (adt <= ini.miss) return J.FAIL;
  return J.NONE;
}

/**
 * Everything a chart sounds under autoplay, in time order: the preview the
 * editor plays with Space. Lane notes and background alike use their sample's
 * own voice, as EZ2PORT's autoplay does.
 */
export function autoplaySounds(plan: ChartPlan): SoundCmd[] {
  return plan.events
    .map((e) => ({
      ms: e.ms,
      keysound: e.keysound,
      level: dsLevel(MIX_UNITY, MIX_UNITY, MIX_UNITY, e.vel),
      pan: dsPan(PAN_CENTRE, e.pan),
      voice: `k${e.keysound}`,
    }))
    .sort((a, b) => a.ms - b.ms);
}
