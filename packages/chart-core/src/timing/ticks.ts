// bmson pulses -> EZ2 chart ticks, exactly as EZ2PORT converts them.
//
// EZFF has 48 ticks to the beat (192 to the 4/4 measure) and no STOP. The
// port's importer (ez2/bmson.c tl_tick) turns a STOP into a GAP: every event
// strictly after the stop moves later by the stop's pulses, which keeps the
// timing exact (the inserted pulses pass at the BPM in force) while the scroll
// keeps moving. EZ2BMS publishes the same way, with one fix: a hold's end is
// shifted as a position too, so a stop inside a hold does not shorten it (the
// port's importer converts the unshifted length - see ez2port-compat.md).

export const TICKS_PER_BEAT = 48;
export const TICKS_PER_MEASURE = 192;

export interface TickResult {
  tick: number;
  /** |exact - tick| in ticks: nonzero when the position is off the EZ2 grid. */
  err: number;
}

export class TickConverter {
  readonly resolution: number;
  private readonly stops: { y: number; duration: number }[];

  constructor(resolution: number, stopEvents: readonly { y: number; duration: number }[]) {
    this.resolution = resolution > 0 ? resolution : 240;
    this.stops = stopEvents
      .filter((s) => s.duration > 0)
      .map((s) => ({ y: s.y, duration: s.duration }))
      .sort((a, b) => a.y - b.y);
  }

  /** Position after the gaps of every STOP strictly before y (ez2/bmson.c tl_shift). */
  shift(y: number): number {
    let d = 0;
    for (const s of this.stops) {
      if (s.y >= y) break;
      d += s.duration;
    }
    return y + d;
  }

  /** Tick of pulse y: round-half-up of the shifted exact value, clamped at 0. */
  tick(y: number): TickResult {
    const exact = (this.shift(y) * TICKS_PER_BEAT) / this.resolution;
    const tick = Math.floor(exact + 0.5);
    return { tick: Math.max(0, tick), err: Math.abs(exact - tick) };
  }

  /** Hold length in ticks for a note at y lasting l pulses (end shifted too). */
  holdTicks(y: number, l: number): number {
    if (l <= 0) return 0;
    return Math.max(0, this.tick(y + l).tick - this.tick(y).tick);
  }

  /** True when pulse y lands exactly on an EZ2 tick (ignoring STOP shifts). */
  onGrid(y: number): boolean {
    return (y * TICKS_PER_BEAT) % this.resolution === 0;
  }
}
