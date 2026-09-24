// The records a game chart carries that bmson has no place for, kept by the
// .ez import in `x_ez_records` (io/ez/import.ts) and written back only by a
// cabinet export (publish/chart-plan.ts). The editor shows them, read-only,
// so a charter can see what the cabinet will get back and where.
//
// What each does, from the port's notes and code (ez2/chart.h, reference/
// play.c, GAMEPLAY-AUDIT.md):
//   2 volume  - the original sets the track's mix level (mix_b) to the byte;
//               EZ2PORT mixes every track at unity and ignores it.
//   4 beats   - beats per measure; EZ2PORT parses it and reads it nowhere.
//   5 mark    - no payload; EZ2PORT reads it nowhere.
//   7         - the original logs "Stop" and does nothing else.
//   3 tempo   - kept only when outside 0-1000 BPM, which the engine drops.
//   6 scroll  - kept only when its f32 is not a number (timing/scroll.ts).
// Any record, of any type, keeps the original's stage open until its tick.

import { said, sayEnglish, type Said } from '../../i18n/say';
import type { ChartData, Extra } from '../../model/types';
import { EZ_BEATS, EZ_BPM, EZ_MARK, EZ_SCROLL, EZ_VOLUME } from './ezff';
import { legacyScroll } from '../../timing/scroll';

export type KeptKind = 'volume' | 'beats' | 'mark' | 'stop' | 'tempo' | 'scroll' | 'other';

export interface KeptRecord {
  /** Index in `x_ez_records`. */
  index: number;
  y: number;
  track: number;
  type: number;
  kind: KeptKind;
  /** A few characters for the field: `vol 100`, `mark`, `#9`. */
  short: string;
  /** A sentence: what it is and what each engine does with it. */
  long: string;
  /** `short` and `long` are English; these say them in the language chosen (i18n/say.ts). */
  shortSaid: Said;
  longSaid: Said;
  /** A scroll change that plays (and is drawn with the chart's own): its multiplier. */
  scroll?: number;
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** The tag and the sentence, each in English and as said. */
function described(short: Said, long: Said) {
  return { short: sayEnglish(short), long: sayEnglish(long), shortSaid: short, longSaid: long };
}

/** One kept record, described; undefined when it has no usable track, type or position. */
export function describeKept(rec: unknown, index: number): KeptRecord | undefined {
  if (!rec || typeof rec !== 'object') return undefined;
  const o = rec as Extra;
  const y = num(o.y);
  const track = num(o.track);
  const type = num(o.type);
  if (y === undefined || y < 0 || track === undefined || type === undefined) return undefined;
  const base = { index, y, track, type };
  switch (type) {
    case EZ_VOLUME: {
      const value = num(o.value) ?? 0;
      return {
        ...base,
        kind: 'volume',
        ...described(
          said('ez.record.volume.tag', { value }),
          said('ez.record.volume', { value, track }),
        ),
      };
    }
    case EZ_BEATS: {
      const value = num(o.value) ?? 0;
      return {
        ...base,
        kind: 'beats',
        ...described(
          said('ez.record.beats.tag', { value }),
          said('ez.record.beats', { value, track }),
        ),
      };
    }
    case EZ_MARK:
      return {
        ...base,
        kind: 'mark',
        ...described(said('ez.record.mark.tag'), said('ez.record.mark', { track })),
      };
    case 7:
      return {
        ...base,
        kind: 'stop',
        ...described(said('ez.record.stop.tag'), said('ez.record.stop', { track })),
      };
    case EZ_BPM: {
      const bpm = num(o.bpm) ?? '?';
      return {
        ...base,
        kind: 'tempo',
        ...described(said('ez.record.tempo.tag', { bpm }), said('ez.record.tempo', { bpm, track })),
      };
    }
    case EZ_SCROLL: {
      const s = legacyScroll(o);
      return s
        ? {
            ...base,
            kind: 'scroll',
            scroll: s.rate,
            ...described(
              said('ez.record.scroll.tag', { rate: Number(s.rate.toFixed(3)) }),
              said('ez.record.scroll', { rate: s.rate, track }),
            ),
          }
        : {
            ...base,
            kind: 'scroll',
            ...described(said('ez.record.nan.tag'), said('ez.record.nan', { track })),
          };
    }
    default:
      return {
        ...base,
        kind: 'other',
        ...described(
          said('ez.record.other.tag', { type }),
          said('ez.record.other', { type, track }),
        ),
      };
  }
}

/** Every kept record of a chart, described, in position order. */
export function keptRecordsOf(chart: Pick<ChartData, 'extra'>): KeptRecord[] {
  const list = chart.extra.x_ez_records;
  if (!Array.isArray(list)) return [];
  const out: KeptRecord[] = [];
  list.forEach((r, i) => {
    const k = describeKept(r, i);
    if (k) out.push(k);
  });
  return out.sort((a, b) => a.y - b.y || a.track - b.track);
}
