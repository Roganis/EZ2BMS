// What a chart actually sounds like under autoplay, as data: for every source
// file, the stretches of the sample that play, when, and how loud. Two charts
// with equal `audible()` sound the same, sample for sample - which is what
// Classic-mode charting promises: moving sounds onto lanes, splitting and
// healing slices, never changes the music.
//
// It follows the plan exactly (channelEvents is compileChart's own per-channel
// walk) and the engine's voice rules (ez2bms-audio schedule/mixer; EZ2PORT's
// backing and autoplay both play the keysound's own slot, reference/play.c):
// - every note plays on the voice of its keysound identity (src, startF,
//   endF), lane or background alike;
// - a slice stops at its `untilMs`; a whole sample plays out;
// - the next event on the same voice cuts the sound (at the same instant the
//   later one in plan order wins, the earlier plays nothing);
// - level and pan come from the note's vel and pan only.
// A stretch is recorded in song ms AND in 44.1 kHz source frames (the .ssf
// cut Publish writes), and neighbouring stretches of one hit merge only when
// both meet exactly - so a slice chain equals the uncut sample, and the 0.5 ms
// minimum slice (an overlap, heard twice) never passes for it.
//
// Not modelled, documented in docs/ez2port-compat.md: EZ2PORT fires sounds
// once per video frame (background before lanes), two seated players pan lane
// sounds to their side, and the cabinet's one-voice-per-track rule (M6).

import type { ChannelId, ChartData, NoteRec } from '../model/types';
import {
  ChartClock,
  channelEvents,
  framesBetween,
  planOrder,
  type ChannelEvent,
  type SampleLookup,
} from './chart-plan';
import { OUT_RATE } from './keysounds';

export interface AudibleSeg {
  src: string;
  /** When the sample this stretch comes from started (its fresh hit). */
  originMs: number;
  fromMs: number;
  /** null: the sample plays out. */
  toMs: number | null;
  /** The same stretch in source frames at 44.1 kHz. */
  fromF: number;
  toF: number | null;
  vel: number;
  pan: number;
}

export interface AudibleOptions {
  /** Only these source names (exact, as channels spell them); default every channel. */
  srcs?: ReadonlySet<string>;
  /** Sample lengths; without one a sample's end stays symbolic (true for any length). */
  samples?: SampleLookup;
  /** A channel's notes, in place of the chart's (a dry run of an edit). */
  notesOf?: (ch: ChannelId) => readonly NoteRec[];
  /** Reuse a clock across calls on the same timing. */
  clock?: ChartClock;
}

/** A sound's end past the sample's own end (plus a margin wider than a frame) is just its end. */
const END_MARGIN_MS = 1;

interface Ev extends ChannelEvent {
  src: string;
  voice: string;
}

/** Per source name, the stretches that sound, merged and sorted. */
export function audible(chart: ChartData, o: AudibleOptions = {}): Map<string, AudibleSeg[]> {
  const clock = o.clock ?? new ChartClock(chart);
  let notesOf = o.notesOf;
  if (!notesOf) {
    const by = new Map<ChannelId, NoteRec[]>();
    for (const n of chart.notes) {
      const l = by.get(n.ch);
      if (l) l.push(n);
      else by.set(n.ch, [n]);
    }
    notesOf = (ch) => by.get(ch) ?? [];
  }
  // Voices never cross source names, so each name is independent.
  const bySrc = new Map<string, Ev[]>();
  for (const ch of chart.channels) {
    if (o.srcs && !o.srcs.has(ch.name)) continue;
    let list = bySrc.get(ch.name);
    if (!list) bySrc.set(ch.name, (list = []));
    for (const e of channelEvents(clock, notesOf(ch.id)))
      list.push({ ...e, src: ch.name, voice: `${e.startF}:${e.endF ?? -1}` });
  }
  const out = new Map<string, AudibleSeg[]>();
  for (const [src, evs] of bySrc) {
    evs.sort(planOrder);
    const lenMs = (() => {
      const f = o.samples?.(src)?.frames;
      return f === undefined ? undefined : (f * 1000) / OUT_RATE;
    })();
    const segs: AudibleSeg[] = [];
    const nextOnVoice = new Map<string, number>();
    // Walk backwards so each event knows the next one on its voice.
    const cutOf: (number | undefined)[] = new Array(evs.length);
    for (let i = evs.length - 1; i >= 0; i--) {
      const e = evs[i]!;
      cutOf[i] = nextOnVoice.get(e.voice);
      nextOnVoice.set(e.voice, e.ms);
    }
    evs.forEach((e, i) => {
      const cut = cutOf[i];
      if (cut !== undefined && cut <= e.ms) return; // replaced at its own start
      let toMs: number | null = e.untilMs;
      let toF: number | null = e.endF;
      if (cut !== undefined && (toMs === null || cut < toMs)) {
        toMs = cut;
        // Counted from the fresh hit, as a slice's end is, so a cut whole
        // sample and the slice chain that replaces it end on the same frame.
        toF = framesBetween(e.originMs, cut);
      }
      if (lenMs !== undefined) {
        const end = e.originMs + lenMs + END_MARGIN_MS;
        if (e.ms >= end) return; // the sample is over: silent
        if (toMs !== null && toMs >= end) {
          toMs = null;
          toF = null;
        }
      }
      segs.push({
        src,
        originMs: e.originMs,
        fromMs: e.ms,
        toMs,
        fromF: e.startF,
        toF,
        vel: e.n.vel ?? 127,
        pan: e.n.pan ?? 64,
      });
    });
    out.set(src, merge(segs));
  }
  return out;
}

const endKey = (v: number | null) => (v === null ? Infinity : v);

function merge(segs: AudibleSeg[]): AudibleSeg[] {
  segs.sort(
    (a, b) =>
      a.originMs - b.originMs ||
      a.vel - b.vel ||
      a.pan - b.pan ||
      a.fromMs - b.fromMs ||
      a.fromF - b.fromF ||
      endKey(a.toMs) - endKey(b.toMs) ||
      endKey(a.toF) - endKey(b.toF),
  );
  const out: AudibleSeg[] = [];
  for (const s of segs) {
    const p = out.at(-1);
    if (
      p &&
      p.originMs === s.originMs &&
      p.vel === s.vel &&
      p.pan === s.pan &&
      p.toMs !== null &&
      p.toMs === s.fromMs &&
      p.toF === s.fromF
    ) {
      p.toMs = s.toMs;
      p.toF = s.toF;
    } else out.push({ ...s });
  }
  return out;
}

const sameSeg = (a: AudibleSeg, b: AudibleSeg) =>
  a.originMs === b.originMs &&
  a.fromMs === b.fromMs &&
  a.toMs === b.toMs &&
  a.fromF === b.fromF &&
  a.toF === b.toF &&
  a.vel === b.vel &&
  a.pan === b.pan;

/** Where two charts first sound different, or undefined when they sound the same. */
export function audibleDiff(
  a: Map<string, AudibleSeg[]>,
  b: Map<string, AudibleSeg[]>,
): { src: string; atMs: number } | undefined {
  let first: { src: string; atMs: number } | undefined;
  for (const src of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(src) ?? [];
    const y = b.get(src) ?? [];
    const n = Math.max(x.length, y.length);
    for (let i = 0; i < n; i++) {
      const p = x[i];
      const q = y[i];
      if (p && q && sameSeg(p, q)) continue;
      const atMs = Math.min(p?.fromMs ?? Infinity, q?.fromMs ?? Infinity);
      if (!first || atMs < first.atMs) first = { src, atMs };
      break;
    }
  }
  return first;
}

/** The whole chart's sound as one comparable string. */
export function fingerprint(chart: ChartData, samples?: SampleLookup): string {
  const a = audible(chart, samples ? { samples } : {});
  return JSON.stringify([...a].sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0)));
}
