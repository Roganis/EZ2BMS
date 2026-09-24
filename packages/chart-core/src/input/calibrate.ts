// Latency calibration: how late the player's taps land against a steady
// beat, as one number. The sound test (tapping to clicks) gives the input
// offset; the picture test (tapping to a flash) the picture offset. EZ2PORT
// has neither - these are EZ2BMS's own, for its test play and recording.
//
// - The first taps are warm-up (the player finding the beat) and are dropped.
// - A tap far from the rest (a slip, a double tap) is dropped by the median
//   absolute deviation: robust where a mean and a standard deviation would be
//   dragged by the very outlier they are meant to catch.
// - What is left gives its median: half the taps early, half late.

export interface Tap {
  /** Which beat of the test it answered (0 first). */
  beat: number;
  /** Its time minus the beat's: positive late. */
  offsetMs: number;
}

export interface Calibration {
  offsetMs: number;
  /** Taps the offset is the median of. */
  used: number;
  /** Warm-up taps and outliers left out. */
  dropped: number;
  /** How far the kept taps spread: the scaled median absolute deviation (about one standard deviation). */
  spreadMs: number;
}

export interface CalibrateOptions {
  /** Beats before this are warm-up. */
  warmup?: number;
  /** Fewer taps than this left: no answer. */
  minTaps?: number;
}

/** MAD to standard deviation, for normally spread taps. */
const MAD_SIGMA = 1.4826;
/** A tap further than this many (scaled) MADs from the median is an outlier... */
const OUTLIER_SIGMAS = 3;
/** ...but never one within this many ms: a steady player's MAD can be tiny. */
const OUTLIER_FLOOR_MS = 15;

export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (!n) return NaN;
  return n % 2 ? s[n >> 1]! : (s[(n >> 1) - 1]! + s[n >> 1]!) / 2;
}

/** The offset the taps say, or null when too few are left to say it. */
export function calibrate(taps: readonly Tap[], o: CalibrateOptions = {}): Calibration | null {
  const warmup = o.warmup ?? 4;
  const minTaps = o.minTaps ?? 6;
  const warm = taps.filter((t) => t.beat >= warmup).map((t) => t.offsetMs);
  if (warm.length < minTaps) return null;
  const m = median(warm);
  const mad = median(warm.map((x) => Math.abs(x - m)));
  const limit = Math.max(OUTLIER_SIGMAS * MAD_SIGMA * mad, OUTLIER_FLOOR_MS);
  const kept = warm.filter((x) => Math.abs(x - m) <= limit);
  if (kept.length < minTaps) return null;
  const km = median(kept);
  return {
    offsetMs: km,
    used: kept.length,
    dropped: taps.length - kept.length,
    spreadMs: MAD_SIGMA * median(kept.map((x) => Math.abs(x - km))),
  };
}
