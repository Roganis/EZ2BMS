// Record mode: press along while the song plays, and the presses become
// notes. R starts from the cursor after a count-in; R (or Esc) stops; the
// take is then reviewed - snapped to the grid, what it would do shown on the
// field - and kept as ONE undo step (Enter), taken again (R) or dropped (Esc).
//
// - Presses come from the input hub (keyboard and controllers, the player's
//   bindings, each timed when it happened and corrected by the input offset)
//   and are routed as EZ2PORT routes the channels.
// - In a song charted in Classic mode a press keys the background sound
//   playing there, so the music stays as it is (chart-core edit/record.ts);
//   it is silent while recording, since the music already holds that sound.
//   Otherwise a press is a note with the brush sound, which it plays.
// - ScratchMix records as it plays: a fret alone is nothing, the turntable
//   strums the frets held (and a fret just after a strum still counts); taps
//   only, as the port's scratch game has no holds.

import {
  applyTake,
  modeDef,
  previewTake,
  routeChannel,
  snapTake,
  StrumLatch,
  takeStats,
  type ChannelEdge,
  type Column,
  type SnapOptions,
  type TakeNote,
  type TakePress,
  type TakeState,
  type TakeStats,
  type TakeTarget,
} from '@ez2bms/chart-core';
import type { App } from '../state/app.svelte';
import type { ChartSlot } from '../state/project.svelte';
import { DEFAULT_RECORD, type RecordOptions } from '../state/settings.svelte';
import { toast } from '../state/toasts.svelte';

const LANE_VOICE_BASE = 1 << 16;

export type RecState = 'idle' | 'countin' | 'recording' | 'review';

export interface TakeReview {
  notes: TakeNote[];
  /** What each note would become (a clash, nothing to key, or fine). */
  states: TakeState[];
  stats: TakeStats;
  classic: boolean;
}

/** Stored record options, whatever an older or hand-edited settings file holds. */
export function normRecord(o: unknown): RecordOptions {
  const r = { ...DEFAULT_RECORD, ...((o ?? {}) as Partial<RecordOptions>) };
  const num = (v: unknown, d: number, lo: number, hi: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
  return {
    countIn: Math.round(num(r.countIn, DEFAULT_RECORD.countIn, 0, 16)),
    metronome: !!r.metronome,
    muteLanes: !!r.muteLanes,
    holdMinMs: num(r.holdMinMs, DEFAULT_RECORD.holdMinMs, 0, 5000),
    quantize: r.quantize === 'exact' ? 'exact' : 'grid',
  };
}

export class Recorder {
  state = $state<RecState>('idle');
  /** Beats of count-in still to go. */
  countLeft = $state(0);
  /** The take so far, snapped as it will land: drawn on the field. */
  ghosts = $state.raw<TakeNote[]>([]);
  review = $state.raw<TakeReview | null>(null);
  /** Presses counted so far (after the count-in). */
  presses = $state(0);
  private taken: TakePress[] = [];
  /** Lane (bmson x) -> its press still held. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  private held = new Map<number, TakePress>();
  /** ScratchMix: the frets held (column indices), and the strum latch. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  private frets = new Set<number>();
  private readonly latch = new StrumLatch();
  private slot: ChartSlot | undefined;
  private cols: readonly Column[] = [];
  private from = 0;
  private fromMs = 0;
  private classic = false;
  private scratch = false;
  private detach: (() => void) | undefined;
  private raf = 0;

  constructor(private readonly app: App) {}

  get active(): boolean {
    return this.state !== 'idle';
  }

  /** R: start from the cursor; stop while recording; take again while reviewing. */
  async toggle(): Promise<void> {
    if (this.state === 'idle') return this.begin(this.app.view.cursor);
    if (this.state === 'review') return this.retake();
    return this.stop();
  }

  private options(): RecordOptions {
    return normRecord(this.app.settings.data.record);
  }

  private async begin(from: number): Promise<void> {
    const app = this.app;
    const slot = app.slot;
    if (!slot) return;
    if (app.play.active) await app.play.stop(false);
    if (app.view.playing) await app.audio.stop();
    const classic = app.classic.on;
    if (!classic && app.view.brush === null)
      return toast('Pick a sound to record with first (or turn Classic mode on)', 'warn');
    const o = this.options();
    this.slot = slot;
    this.classic = classic;
    this.scratch = slot.mode === 'scratch';
    this.cols = modeDef(slot.mode).columns;
    this.from = from;
    this.taken = [];
    this.held.clear();
    this.frets.clear();
    this.latch.reset();
    this.ghosts = [];
    this.review = null;
    this.presses = 0;
    // Muting the lanes would leave holes in a Classic song's music.
    app.audio.lanesMuted = o.muteLanes && !classic;
    await app.audio.sync(slot);
    const res = slot.doc.resolution;
    const start = Math.max(0, from - o.countIn * res);
    this.fromMs = app.audio.msAt(slot, from);
    const beatMs = Math.max(1, this.fromMs - app.audio.msAt(slot, Math.max(0, from - res)));
    this.state = start < from ? 'countin' : 'recording';
    this.countLeft = Math.round((from - start) / res);
    this.detach = app.input.attach({ keys: 'all', pads: true, edges: (e) => this.onEdges(e) });
    await app.audio.play(slot, start);
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (this.state !== 'countin' && this.state !== 'recording') return;
      // The song ran out (or something stopped it): the take is done.
      if (!app.view.playing) return void this.stop();
      const heard = app.audio.heardNow();
      if (heard !== undefined && this.state === 'countin') {
        if (heard >= this.fromMs) this.state = 'recording';
        else this.countLeft = Math.ceil((this.fromMs - heard) / beatMs);
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private snapOptions(): SnapOptions {
    const o = this.options();
    const res = this.slot!.doc.resolution;
    const exact = o.quantize === 'exact' && res % 48 === 0;
    return {
      step: exact ? res / 48 : (res * 4) / this.app.view.snap,
      holds: !this.scratch,
      holdMinMs: o.holdMinMs,
      fromPulse: this.from,
    };
  }

  private snapped(): TakeNote[] {
    const tl = this.slot && this.app.audio.timelineFor(this.slot);
    return tl ? snapTake(this.taken, tl, this.snapOptions()) : [];
  }

  private onEdges(edges: readonly ChannelEdge[]): void {
    const slot = this.slot;
    if (!slot || (this.state !== 'countin' && this.state !== 'recording')) return;
    let changed = false;
    for (const e of edges) {
      const ms = this.app.input.songMs(e.ms);
      if (ms === undefined) continue;
      const route = routeChannel(slot.mode, this.cols, e.channel);
      if (!route) continue;
      if ('strum' in route) {
        if (!e.down) continue;
        // A strum plays every fret held on its side.
        this.latch.strum(route.strum, ms);
        for (const col of this.frets)
          if (this.sideOf(col) === route.strum && this.cols[col]!.kind !== 'pedal')
            changed = this.press(col, ms) || changed;
        continue;
      }
      const col = route.column;
      if (this.scratch) {
        // A fret alone is nothing - unless a strum's latch is still open.
        if (!e.down) this.frets.delete(col);
        else {
          this.frets.add(col);
          if (this.cols[col]!.kind !== 'pedal' && this.latch.fires(this.sideOf(col), ms))
            changed = this.press(col, ms) || changed;
        }
        continue;
      }
      if (e.down) changed = this.press(col, ms) || changed;
      else {
        const p = this.held.get(this.cols[col]!.x);
        if (p) {
          p.upMs = ms;
          this.held.delete(p.x);
          changed = true;
        }
      }
    }
    if (changed) this.ghosts = this.snapped();
  }

  private sideOf(col: number): 0 | 1 {
    return (this.cols[col]!.side ?? 1) === 2 ? 1 : 0;
  }

  private press(col: number, ms: number): boolean {
    const x = this.cols[col]!.x;
    const p: TakePress = { x, downMs: ms };
    this.taken.push(p);
    if (!this.scratch) this.held.set(x, p);
    if (ms >= this.fromMs) this.presses++;
    // The brush sound, on the lane's own voice; Classic presses are silent
    // (the music already has what they key).
    const brush = this.app.view.brush;
    const name = brush === null ? undefined : this.slot!.doc.channel(brush)?.name;
    if (!this.classic && name) void this.app.audio.triggerSample(name, LANE_VOICE_BASE + col);
    return true;
  }

  private target(): TakeTarget {
    return this.classic ? { classic: this.app.classic.env() } : { brush: this.app.view.brush ?? 0 };
  }

  /** Stop recording and show the take for review. */
  async stop(): Promise<void> {
    if (this.state !== 'countin' && this.state !== 'recording') return;
    cancelAnimationFrame(this.raf);
    this.detach?.();
    this.detach = undefined;
    const app = this.app;
    if (app.view.playing) await app.audio.stop();
    app.audio.lanesMuted = false;
    const slot = this.slot!;
    const notes = this.snapped();
    app.view.cursor = this.from;
    if (!notes.length) {
      this.state = 'idle';
      this.ghosts = [];
      toast('Nothing was recorded', 'info');
      return;
    }
    this.review = {
      notes,
      states: previewTake(slot.doc, notes, this.target()),
      stats: takeStats(notes),
      classic: this.classic,
    };
    this.ghosts = notes;
    this.state = 'review';
  }

  /** In review: snap the take again with the options as they are now. */
  resnap(): void {
    const slot = this.slot;
    if (this.state !== 'review' || !slot) return;
    const notes = this.snapped();
    this.review = {
      notes,
      states: previewTake(slot.doc, notes, this.target()),
      stats: takeStats(notes),
      classic: this.classic,
    };
    this.ghosts = notes;
  }

  /** Keep the take: into the chart as one undo step. */
  keep(): void {
    const r = this.review;
    const slot = this.slot;
    if (this.state !== 'review' || !r || !slot) return;
    const res = applyTake(slot.doc, r.notes, this.target());
    if (res.splits.length) this.app.classic.remember(slot.doc, res.splits);
    const parts = [`${res.placed} note${res.placed === 1 ? '' : 's'}`];
    if (res.clash) parts.push(`${res.clash} on notes already there`);
    if (res.silent) parts.push(`${res.silent} with nothing to key`);
    if (res.refused) parts.push(`${res.refused} that would have changed the sound`);
    if (res.shortened)
      parts.push(`${res.shortened} hold${res.shortened === 1 ? '' : 's'} made taps`);
    toast(`Take kept: ${parts.join(', ')}`, res.placed ? 'ok' : 'warn');
    this.clear();
  }

  /** Throw the take away and record again from the same place. */
  async retake(): Promise<void> {
    const from = this.from;
    this.clear();
    await this.begin(from);
  }

  discard(): void {
    if (this.state === 'review') toast('Take discarded', 'info');
    this.clear();
  }

  private clear(): void {
    cancelAnimationFrame(this.raf);
    this.detach?.();
    this.detach = undefined;
    this.app.audio.lanesMuted = false;
    this.state = 'idle';
    this.review = null;
    this.ghosts = [];
    this.taken = [];
    this.held.clear();
    this.frets.clear();
  }
}
