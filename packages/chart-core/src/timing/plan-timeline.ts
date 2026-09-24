// Pulses <-> song milliseconds exactly as the published chart plays: the
// engine's f32 tempo map, with each STOP turned into a gap (time runs, the
// position stays put). Play-from-cursor and the moving cursor both use it,
// so what you see lines up with what EZ2PORT will play; so do the stem
// strips, drawing a stem where it sounds and placing its onsets.
//
// Unlike ChartClock it does not round positions to EZ2 ticks: it maps any
// pulse, and any millisecond back to a (fractional) pulse.

import type { ChartData } from '../model/types';
import type { EngineTempo } from './engine-tempo';
import { TICKS_PER_BEAT } from './ticks';

export class PlanTimeline {
  private readonly stops: { y: number; duration: number }[];

  constructor(
    private readonly tempo: EngineTempo,
    private readonly resolution: number,
    stopEvents: ChartData['stopEvents'],
  ) {
    this.stops = stopEvents
      .filter((s) => s.duration > 0)
      .map((s) => ({ y: s.y, duration: s.duration }))
      .sort((a, b) => a.y - b.y);
  }

  /** Where a pulse lands once every earlier STOP has become a gap. */
  private shift(y: number): number {
    let d = 0;
    for (const s of this.stops) {
      if (s.y >= y) break;
      d += s.duration;
    }
    return y + d;
  }

  /** The inverse: inside a gap the position is the STOP's own. */
  private unshift(s: number): number {
    let acc = 0;
    for (const st of this.stops) {
      const start = st.y + acc;
      if (s <= start) break;
      if (s < start + st.duration) return st.y;
      acc += st.duration;
    }
    return s - acc;
  }

  msAt(pulse: number): number {
    return this.tempo.msAt((this.shift(pulse) * TICKS_PER_BEAT) / this.resolution);
  }

  pulseAt(ms: number): number {
    const tick = this.tempo.tickAtMs(ms);
    return this.unshift((tick * this.resolution) / TICKS_PER_BEAT);
  }
}
