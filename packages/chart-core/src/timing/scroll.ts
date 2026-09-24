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
