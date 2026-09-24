// Pulses <-> seconds for the editor's own view of a bmson chart.
//
// This is bmson's timing, exact in doubles: BPM changes, and STOPs that freeze
// the chart for `duration` pulses at the BPM in force. It drives display (the
// clock readout, the time ruler) and the "spec" playback profile. What EZ2PORT
// plays is timed by EngineTempo (engine-tempo.ts) from the published ticks -
// f32 BPM, STOPs turned into gaps - and the two agree to well under a
// millisecond except where a chart has STOPs.
//
// Ordering at one position (docs/bmson-dialect.md): a BPM change at y applies
// from y; a STOP at y happens AFTER the notes at y, and lasts `duration`
// pulses at the BPM in force after any change at y.

import { lowerBound, upperBound } from '../util/sorted';

export interface TempoSource {
  resolution: number;
  initBpm: number;
  bpmEvents: readonly { y: number; bpm: number }[];
  stopEvents: readonly { y: number; duration: number }[];
}

interface Segment {
  /** Pulse where the segment starts. */
  y: number;
  /** Seconds at that pulse. */
  t: number;
  bpm: number;
}

export interface TimingOptions {
  /** Treat STOPs as absent (what EZ2PORT's scroll does; its audio timing adds them as gaps). */
  ignoreStops?: boolean;
}

export class TimingMap {
  readonly resolution: number;
  /**
   * Segments in position order. A STOP at y produces two segments at y: the
   * frozen one (time t .. t+stop) then the moving one (from t+stop).
   */
  private readonly seg: Segment[] = [];

  constructor(src: TempoSource, opts: TimingOptions = {}) {
    const res = src.resolution > 0 ? src.resolution : 240;
    this.resolution = res;
    const initBpm = src.initBpm > 0 ? src.initBpm : 120;

    type Ev = { y: number; order: number; bpm?: number; stop?: number };
    const evs: Ev[] = [];
    src.bpmEvents.forEach((e, i) => {
      if (e.bpm > 0 && Number.isFinite(e.bpm)) evs.push({ y: e.y, order: i, bpm: e.bpm });
    });
    if (!opts.ignoreStops) {
      src.stopEvents.forEach((e, i) => {
        if (e.duration > 0) evs.push({ y: e.y, order: 1e9 + i, stop: e.duration });
      });
    }
    // BPM changes before stops at the same position; file order among equals.
    evs.sort((a, b) => a.y - b.y || a.order - b.order);

    let y = 0;
    let t = 0;
    let bpm = initBpm;
    this.seg.push({ y: 0, t: 0, bpm });
    for (let i = 0; i < evs.length;) {
      const p = Math.max(0, evs[i]!.y);
      t += ((p - y) * 60) / (bpm * res);
      y = p;
      let stop = 0;
      for (; i < evs.length && Math.max(0, evs[i]!.y) === p; i++) {
        const e = evs[i]!;
        if (e.bpm !== undefined) bpm = e.bpm;
        if (e.stop !== undefined) stop += e.stop;
      }
      this.push({ y: p, t, bpm });
      if (stop > 0) {
        t += (stop * 60) / (bpm * res);
        this.seg.push({ y: p, t, bpm });
      }
    }
  }

  /** Replace a same-position, same-time segment rather than stacking duplicates. */
  private push(s: Segment): void {
    const last = this.seg[this.seg.length - 1]!;
    if (last.y === s.y && last.t === s.t) this.seg[this.seg.length - 1] = s;
    else this.seg.push(s);
  }

  /** Seconds at pulse y. A note exactly at a STOP sounds before the stop. */
  secondsAt(y: number): number {
    const j = lowerBound(this.seg, y, (s) => s.y);
    const at = this.seg[j];
    if (at && at.y === y) return at.t;
    const s = this.seg[Math.max(0, j - 1)]!;
    return s.t + ((y - s.y) * 60) / (s.bpm * this.resolution);
  }

  /** Pulse at time t (fractional). During a STOP it stays at the STOP's position. */
  pulseAt(t: number): number {
    const i = Math.max(0, upperBound(this.seg, t, (s) => s.t) - 1);
    const s = this.seg[i]!;
    const y = s.y + ((t - s.t) * s.bpm * this.resolution) / 60;
    const next = this.seg[i + 1];
    return next ? Math.min(y, next.y) : y;
  }

  /** BPM in force at pulse y (a change exactly at y counts). */
  bpmAt(y: number): number {
    const i = Math.max(0, upperBound(this.seg, y, (s) => s.y) - 1);
    return this.seg[i]!.bpm;
  }

  /** True when y falls on a STOP's position (frozen time follows it). */
  stopAt(y: number): number {
    const j = lowerBound(this.seg, y, (s) => s.y);
    const a = this.seg[j];
    const b = this.seg[j + 1];
    return a && b && a.y === y && b.y === y ? b.t - a.t : 0;
  }
}
