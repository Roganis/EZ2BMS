// The engine's tick <-> time mapping, reproduced bit for bit.
//
// EZ2PORT times everything from the chart's tempo map (ez2/chart.c
// ez2_tempo_build / ez2_tempo_seconds): a point at tick 0 with the header BPM,
// plus every type-3 record with 0 < bpm <= 1000, sorted by tick. BPMs are f32
// as stored in the file; the integration is in doubles in a fixed operation
// order, reproduced here so a note's time in the editor is the engine's time to
// the last bit (the oracle test checks this).

import { TICKS_PER_MEASURE } from './ticks';

export interface TempoPoint {
  tick: number;
  /** As the engine holds it: an f32 value. */
  bpm: number;
}

export class EngineTempo {
  readonly points: readonly TempoPoint[];
  readonly ticksPerMeasure: number;
  private readonly perBeat: number;

  /**
   * @param headerBpm the header's initial BPM (rounded to f32 here)
   * @param changes type-3 records; out-of-range ones are dropped as the engine does
   */
  constructor(
    headerBpm: number,
    changes: readonly TempoPoint[],
    ticksPerMeasure = TICKS_PER_MEASURE,
  ) {
    const h = Math.fround(headerBpm);
    const pts: TempoPoint[] = [{ tick: 0, bpm: h > 0 ? h : 120 }];
    for (const c of changes) {
      const bpm = Math.fround(c.bpm);
      if (!(bpm > 0) || bpm > 1000) continue;
      pts.push({ tick: c.tick, bpm });
    }
    // Stable, where the engine's qsort is not: EZ2BMS never writes two points
    // at one tick, so the difference cannot show in anything it publishes.
    this.points = pts
      .map((p, i) => ({ p, i }))
      .sort((a, b) => a.p.tick - b.p.tick || a.i - b.i)
      .map((e) => e.p);
    this.ticksPerMeasure = ticksPerMeasure || TICKS_PER_MEASURE;
    this.perBeat = this.ticksPerMeasure / 4.0;
  }

  /** ez2_tempo_seconds. */
  secondsAt(tick: number): number {
    const pts = this.points;
    let sec = 0.0;
    for (let i = 0; i < pts.length; i++) {
      const from = pts[i]!.tick;
      let to = i + 1 < pts.length ? pts[i + 1]!.tick : tick;
      if (from >= tick) break;
      if (to > tick) to = tick;
      sec += ((to - from) * 60.0) / (pts[i]!.bpm * this.perBeat);
    }
    return sec;
  }

  /** ez2_tempo_ms. */
  msAt(tick: number): number {
    return this.secondsAt(tick) * 1000.0;
  }

  /** ez2_tempo_tick_at_ms_f: fractional tick at a time; negative times extrapolate backwards. */
  tickAtMs(ms: number): number {
    const pts = this.points;
    const sec = ms / 1000.0;
    let at = 0.0;
    if (!(sec > 0.0)) {
      const tickSec = 60.0 / (pts[0]!.bpm * this.perBeat);
      return pts[0]!.tick + sec / tickSec;
    }
    for (let i = 0; i < pts.length; i++) {
      const tickSec = 60.0 / (pts[i]!.bpm * this.perBeat);
      const from = pts[i]!.tick;
      if (i + 1 < pts.length) {
        const seg = (pts[i + 1]!.tick - from) * tickSec;
        if (at + seg > sec) return from + (sec - at) / tickSec;
        at += seg;
      } else {
        return from + (sec - at) / tickSec;
      }
    }
    return 0.0;
  }

  /** ez2_tempo_bpm_at: the BPM in force at a tick. */
  bpmAt(tick: number): number {
    let bpm = 120.0;
    for (let i = 0; i < this.points.length; i++) {
      if (i > 0 && this.points[i]!.tick > tick) break;
      bpm = this.points[i]!.bpm;
    }
    return bpm;
  }
}
