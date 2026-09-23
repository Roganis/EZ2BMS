// Stem strips, worked out purely (no canvas, no Pixi - tested as is): per
// pixel row, what of the stem sounds there and which slice it is. See
// render/strip.ts for what a strip is and how it is drawn.

import type { PlanTimeline, StemView } from '@ez2bms/chart-core';

export interface StripSpec {
  src: string;
  /** The header: the file's name and what is known about it. */
  label: string;
  view: StemView;
  timeline: PlanTimeline;
  /** [min, max] (i16) of the file over seconds [a, b); undefined while it loads. */
  peaks: (a: number, b: number) => [number, number] | undefined;
  /** Onsets as [seconds, strength]; those at `minStrength` or more are marked. */
  onsets: readonly [number, number][];
  minStrength: number;
  focused: boolean;
}

export interface StripRow {
  /** The waveform's extent, -1..1 (square-root compressed so quiet stems read). */
  lo: number;
  hi: number;
  /** The slice playing (an index into `view.slices`), or -1. */
  slice: number;
  /** The file has not loaded that far yet. */
  loading?: boolean;
}

interface Axis {
  pulseOf(y: number): number;
}

const amp = (v: number) => {
  const x = Math.max(-1, Math.min(1, v / 32767));
  return Math.sign(x) * Math.sqrt(Math.abs(x));
};

/** Where each slice stops sounding, song ms (Infinity: plays out, length unknown). */
function sliceEnds(view: StemView): number[] {
  return view.slices.map(
    (s) => s.untilMs ?? (view.seconds === undefined ? Infinity : s.originMs + view.seconds * 1000),
  );
}

/**
 * Per pixel row of a strip `height` pixels tall (row 0 at the top), what to
 * draw: the file's peak over the song time the row covers, and the slice
 * playing at its middle. Null where nothing of the file sounds.
 */
export function stripRows(
  spec: Pick<StripSpec, 'view' | 'timeline' | 'peaks'>,
  vp: Axis,
  height: number,
  row = 1,
): (StripRow | null)[] {
  const { view, timeline } = spec;
  const ends = sliceEnds(view);
  const segEnd = view.segments.map((g) =>
    g.toMs !== null
      ? g.toMs
      : view.seconds === undefined
        ? Infinity
        : g.originMs + view.seconds * 1000,
  );
  const out: (StripRow | null)[] = [];
  for (let y = 0; y < height; y += row) {
    const pTop = vp.pulseOf(y);
    const pBot = Math.max(0, vp.pulseOf(y + row));
    if (pTop <= 0) {
      out.push(null);
      continue;
    }
    const t0 = timeline.msAt(pBot);
    const t1 = timeline.msAt(pTop);
    let lo = 0;
    let hi = 0;
    let any = false;
    let loading = false;
    view.segments.forEach((g, i) => {
      if (g.fromMs >= t1 || segEnd[i]! <= t0) return;
      const a = (Math.max(t0, g.fromMs) - g.originMs) / 1000;
      const b = (Math.min(t1, segEnd[i]!) - g.originMs) / 1000;
      any = true;
      const p = spec.peaks(a, Math.max(b, a + 1e-4));
      if (!p) {
        loading = true;
        return;
      }
      lo = Math.min(lo, p[0]);
      hi = Math.max(hi, p[1]);
    });
    if (!any) {
      out.push(null);
      continue;
    }
    // The slice playing at the row's middle: the latest to start by then that still plays.
    const mid = (t0 + t1) / 2;
    let slice = -1;
    let a = 0;
    let b = view.slices.length;
    while (a < b) {
      const m = (a + b) >> 1;
      if (view.slices[m]!.ms <= mid) a = m + 1;
      else b = m;
    }
    for (let i = a - 1; i >= 0 && i >= a - 8; i--) {
      if (mid < ends[i]!) {
        slice = i;
        break;
      }
    }
    out.push({ lo: amp(lo), hi: amp(hi), slice, ...(loading ? { loading } : {}) });
  }
  return out;
}

/** Song times (ms) of the onsets at `min` strength or more that sound in [t0, t1). */
export function onsetTimes(
  view: StemView,
  onsets: readonly [number, number][],
  min: number,
  t0: number,
  t1: number,
): { ms: number; strength: number }[] {
  const out: { ms: number; strength: number }[] = [];
  for (const g of view.segments) {
    const end =
      g.toMs ?? (view.seconds === undefined ? Infinity : g.originMs + view.seconds * 1000);
    const a = Math.max(t0, g.fromMs);
    const b = Math.min(t1, end);
    if (b <= a) continue;
    const s0 = (a - g.originMs) / 1000;
    const s1 = (b - g.originMs) / 1000;
    let lo = 0;
    let hi = onsets.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (onsets[m]![0] < s0) lo = m + 1;
      else hi = m;
    }
    for (let i = lo; i < onsets.length && onsets[i]![0] < s1; i++) {
      const [sec, strength] = onsets[i]!;
      if (strength >= min) out.push({ ms: g.originMs + sec * 1000, strength });
    }
  }
  return out;
}
