// Scroll-speed changes: EZFF record type 6, which EZ2PORT plays.
//
// The port collects every type-6 record from every track, reads its first
// word as an f32 multiplier and sorts them by tick (reference/play.c,
// "THE SCROLL EVENTS COME FIRST", and scroll_mult_advance). From a record's
// tick on, the field scrolls at the player's speed times that multiplier;
// the notes' times do not move. It keeps at most 4096 of them, in track
// order, and starts every stage at 1.0.
//
// A chart holds them in `scrollEvents` (bmson `x_scroll_events`). A chart
// imported before EZ2BMS had them still carries its game's type-6 records
// in `x_ez_records`; they play and publish the same, and the
// `scroll-legacy` quick fix turns them into scroll events you can edit.

import type { ChartData, Extra, ScrollEvent } from '../model/types';
import { f32Decimal } from '../util/f32';

/** EZFF record type of a scroll change. */
export const EZ_SCROLL_TYPE = 6;
/** How many the port keeps (`g_scrollpts[4096]`); later ones, in track order, are dropped. */
export const EZ_SCROLL_MAX = 4096;

/** A scroll change as it goes to EZ2PORT or the cabinet. */
export interface ScrollChange {
  y: number;
  rate: number;
  /** The EZFF track it goes on: the game's for an imported one, else 0. */
  track: number;
  /** The record's second word: the game's for an imported one, else 0. */
  raw1: number;
  /** Where it lives: `scrollEvents[i]`, or `x_ez_records[i]` (an import from before M8). */
  from: { kind: 'event' | 'legacy'; index: number };
}

const uint = (v: unknown, max: number): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : undefined;

/** The f32 a 32-bit word holds (little-endian, as EZFF stores it). */
export function f32FromWord(w: number): number {
  const dv = new DataView(new ArrayBuffer(4));
  dv.setUint32(0, w >>> 0, true);
  return dv.getFloat32(0, true);
}

/** The 32-bit word of `rate` as an f32. */
export function wordFromF32(rate: number): number {
  const dv = new DataView(new ArrayBuffer(4));
  dv.setFloat32(0, rate, true);
  return dv.getUint32(0, true);
}

/** The track and second word an event carries back to the cabinet (0 and 0 unless imported). */
export function scrollPlacement(e: ScrollEvent): { track: number; raw1: number } {
  return {
    track: uint(e.extra?.x_track, 95) ?? 0,
    raw1: uint(e.extra?.x_raw1, 0xffffffff) ?? 0,
  };
}

/**
 * A kept record that is a scroll change with a usable multiplier, as the
 * port reads it: the first raw word as an f32 (the importer also wrote it
 * decoded as `scroll`, used when the words are missing). Not finite: not one.
 */
export function legacyScroll(
  rec: unknown,
): { y: number; rate: number; track: number; raw1: number } | undefined {
  if (!rec || typeof rec !== 'object') return undefined;
  const o = rec as Extra;
  if (o.type !== EZ_SCROLL_TYPE) return undefined;
  const track = uint(o.track, 95);
  const y = typeof o.y === 'number' && Number.isFinite(o.y) && o.y >= 0 ? o.y : undefined;
  if (track === undefined || y === undefined) return undefined;
  const raw = o.raw;
  let rate: number | undefined;
  let raw1 = 0;
  if (
    Array.isArray(raw) &&
    raw.length === 2 &&
    raw.every((w) => uint(w, 0xffffffff) !== undefined)
  ) {
    rate = f32FromWord(raw[0] as number);
    raw1 = raw[1] as number;
  } else if (typeof o.scroll === 'number') rate = Math.fround(o.scroll);
  if (rate === undefined || !Number.isFinite(rate)) return undefined;
  return { y, rate, track, raw1 };
}

/**
 * Every scroll change the chart makes, sorted by y (the chart's own before
 * kept ones at one y, each in its list's order).
 */
export function scrollEventsOf(chart: Pick<ChartData, 'scrollEvents' | 'extra'>): ScrollChange[] {
  const out: ScrollChange[] = chart.scrollEvents.map((e, index) => ({
    y: e.y,
    rate: e.rate,
    ...scrollPlacement(e),
    from: { kind: 'event', index },
  }));
  const kept = chart.extra.x_ez_records;
  if (Array.isArray(kept))
    kept.forEach((r, index) => {
      const s = legacyScroll(r);
      if (s) out.push({ ...s, from: { kind: 'legacy', index } });
    });
  return out.sort((a, b) => a.y - b.y);
}

/** The kept records `scroll-legacy` would turn into scroll events, by index. */
export function legacyScrollIndices(chart: Pick<ChartData, 'extra'>): number[] {
  const kept = chart.extra.x_ez_records;
  if (!Array.isArray(kept)) return [];
  const out: number[] = [];
  kept.forEach((r, i) => {
    if (legacyScroll(r)) out.push(i);
  });
  return out;
}

/**
 * A scroll event for a kept record: the rate as the shortest decimal that is
 * the same f32, and the track and second word kept when they are not the
 * defaults, so the cabinet gets the same record back.
 */
export function scrollEventFromLegacy(s: {
  y: number;
  rate: number;
  track: number;
  raw1: number;
}): ScrollEvent {
  const extra: Extra = {};
  if (s.track) extra.x_track = s.track;
  if (s.raw1) extra.x_raw1 = s.raw1;
  const e: ScrollEvent = { y: s.y, rate: f32Decimal(s.rate) };
  if (Object.keys(extra).length) e.extra = extra;
  return e;
}

// ---- the field's arithmetic: ez2/scroll.c, f32 where the port is f32 --------

const f = Math.fround;

/** MeasureScale outside modes 6/7/8/9/12: 1.6 px per tick (EZ2_SCROLL_MEASURE_SCALE). */
export const SCROLL_MEASURE_SCALE = f(1.6);
/** The beat the tempo query reports, in ticks (EZ2_SCROLL_BEAT). */
export const SCROLL_BEAT = 48;
/** The live rate closes a tenth of the gap to its target each frame (EZ2_SCROLL_CHASE). */
export const SCROLL_CHASE = f(0.1);

/** The lane-independent half of the field's scroll (`ez2_scroll`). */
export interface ScrollState {
  /** MeasureScale. */
  base: number;
  /** The live rate, eased toward the target. */
  rate: number;
  beat: number;
}

/** ez2_scroll_init: the live rate starts on the target, not eased up to it. */
export function scrollInit(measureScale: number, beat: number, target: number): ScrollState {
  return {
    base: f(measureScale) !== 0 ? f(measureScale) : SCROLL_MEASURE_SCALE,
    beat: beat > 0 ? Math.trunc(beat) : SCROLL_BEAT,
    rate: f(target),
  };
}

/**
 * ez2_scroll_target: what the live rate chases - the speed dial (a percent,
 * an int in the port) times the chart's multiplier, the percent scaled first.
 */
export function scrollTarget(percent: number, multiplier: number): number {
  return f(f(f(Math.trunc(percent)) * f(0.01)) * f(multiplier));
}

/** ez2_scroll_tick: one frame of the chase, with no snap (the original has none). */
export function scrollChase(rate: number, target: number): number {
  const d = f(f(target) - rate);
  return d !== 0 ? f(f(d * SCROLL_CHASE) + rate) : rate;
}

/**
 * ez2_scroll_offset: pixels between a note and the cursor (positive: still
 * above the judgement line), from chart ticks - never milliseconds. Doubles
 * inside, as the port computes it, rounded to f32 at the end.
 */
export function scrollOffset(
  s: ScrollState,
  noteTick: number,
  nowTick: number,
  noteRate = 1,
  laneRate = 1,
): number {
  const k = 48 / (s.beat > 0 ? s.beat : SCROLL_BEAT);
  return f(k * (noteTick - nowTick) * f(noteRate) * (s.base * f(laneRate) * s.rate));
}

/** ez2_scroll_y: the note's y on a field whose judgement line is at `judgeY`. */
export function scrollY(
  s: ScrollState,
  judgeY: number,
  noteTick: number,
  nowTick: number,
  noteRate = 1,
  laneRate = 1,
): number {
  return f(f(judgeY) - scrollOffset(s, noteTick, nowTick, noteRate, laneRate));
}

/** A scroll change on the tick axis: what the port keeps from each record. */
export interface ScrollPoint {
  tick: number;
  /** The multiplier as the f32 the record carries. */
  mult: number;
}

/**
 * The chart's changes as the port holds them: the first EZ_SCROLL_MAX, sorted
 * by tick (reference/play.c). A package carries them all on track 0 in
 * order, so the first ones kept are the earliest; ties keep the list's
 * order. `tickOf` places a pulse on the tick axis (STOP gaps included).
 */
export function scrollPoints(
  chart: Pick<ChartData, 'scrollEvents' | 'extra'>,
  tickOf: (y: number) => number,
): ScrollPoint[] {
  return scrollEventsOf(chart)
    .slice(0, EZ_SCROLL_MAX)
    .map((s) => ({ tick: tickOf(s.y), mult: f(s.rate) }))
    .sort((a, b) => a.tick - b.tick);
}

/**
 * The chart's multiplier at a (fractional) tick, as scroll_mult_advance
 * walks it: the last change at or before the tick, 1.0 before the first
 * (the port resets it every stage).
 */
export function multiplierAt(points: readonly ScrollPoint[], tick: number): number {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.tick <= tick) lo = mid + 1;
    else hi = mid;
  }
  return lo ? points[lo - 1]!.mult : 1;
}
