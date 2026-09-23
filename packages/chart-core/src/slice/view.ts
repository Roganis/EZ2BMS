// A stem as the chart plays it: every note of the channels that play one
// source file, as the part of the file it starts (its slice), and the
// stretches of the file that actually sound, when. The stem strips draw this
// on the chart's own tick axis, and slicing (./ops.ts) reads it to place cuts
// and onsets.
//
// Slices are what EZ2PORT plays (publish/chart-plan.ts channelEvents, the
// importer's walk_channels): a fresh hit starts the file; each later
// continuation (`c`) plays on from where the fresh hit's sound has reached,
// `t - t(fresh hit)`, up to the channel's next note; a fresh hit with no
// continuation after it plays the whole file. So one source second sounds
// at `originMs + second` for as long as its chain runs, and a stem retriggered
// by a later fresh hit is heard again from its start.

import { analysis } from '../edit/analysis';
import { BGM } from '../edit/commands';
import type { ChartDoc } from '../edit/doc';
import type { ChannelId, NoteId } from '../model/types';
import type { AudibleSeg } from '../publish/audible';
import type { SampleLookup } from '../publish/chart-plan';
import { OUT_RATE } from '../publish/keysounds';
import type { PlanTimeline } from '../timing/plan-timeline';

export interface StemSlice {
  /** The note that starts it. */
  id: NoteId;
  ch: ChannelId;
  x: number;
  y: number;
  /** It starts the sound (a fresh hit) rather than continuing it. */
  fresh: boolean;
  /** On a lane, not in the background. */
  keyed: boolean;
  /** When it plays, song ms: from `ms` to `untilMs` (null: to the file's end). */
  ms: number;
  untilMs: number | null;
  /** The part of the file it plays, seconds; `toSec` null: to the end. */
  fromSec: number;
  toSec: number | null;
  /** When its fresh hit started the file. */
  originMs: number;
  /** Its place in its chain (0 is the fresh hit), for telling neighbours apart. */
  index: number;
}

export interface StemView {
  src: string;
  channels: ChannelId[];
  /** Every note of those channels as the slice it starts, by position (y, x, id). */
  slices: StemSlice[];
  /** The stretches that sound (voice cuts applied, a chain's slices merged), by start. */
  segments: AudibleSeg[];
  /** The file's length, when known. */
  seconds?: number;
}

/** The stem `src` (a sound name, as channels spell it) in the chart, cached until it changes. */
export function stemView(doc: ChartDoc, src: string, samples?: SampleLookup): StemView {
  const a = analysis(doc);
  return a.derive('stem', src, samples, () => {
    const channels = doc.data.channels.filter((c) => c.name === src).map((c) => c.id);
    const slices: StemSlice[] = [];
    for (const ch of channels) {
      let index = 0;
      for (const [i, e] of a.eventsOf(ch).entries()) {
        // As channelEvents decides: a leading continuation starts the sound too.
        const fresh = i === 0 || !e.n.c;
        index = fresh ? 0 : index + 1;
        slices.push({
          id: e.n.id,
          ch,
          x: e.n.x,
          y: e.n.y,
          fresh,
          keyed: e.n.x !== BGM,
          ms: e.ms,
          untilMs: e.untilMs,
          fromSec: e.startF / OUT_RATE,
          toSec: e.endF === null ? null : e.endF / OUT_RATE,
          originMs: e.originMs,
          index,
        });
      }
    }
    slices.sort((p, q) => p.y - q.y || p.x - q.x || p.id - q.id);
    const frames = samples?.(src)?.frames;
    const segments = [...a.soundOf(src, samples)].sort((p, q) => p.fromMs - q.fromMs);
    return {
      src,
      channels,
      slices,
      segments,
      ...(frames !== undefined ? { seconds: frames / OUT_RATE } : {}),
    };
  });
}

/** The chart's plan timeline (pulses <-> song ms, STOPs as gaps), cached until the timing changes. */
export function timelineOf(doc: ChartDoc): PlanTimeline {
  return analysis(doc).timeline;
}

/** When a segment stops, song ms (Infinity: plays out with no known length). */
export function segmentEnd(view: StemView, seg: AudibleSeg): number {
  if (seg.toMs !== null) return seg.toMs;
  return view.seconds === undefined ? Infinity : seg.originMs + view.seconds * 1000;
}

/** What of the file sounds at song time `ms`: each stretch playing, and the second of the file it is at. */
export function heardAt(view: StemView, ms: number): { seg: AudibleSeg; sec: number }[] {
  const out: { seg: AudibleSeg; sec: number }[] = [];
  for (const seg of view.segments) {
    if (seg.fromMs > ms) break;
    if (ms < segmentEnd(view, seg)) out.push({ seg, sec: (ms - seg.originMs) / 1000 });
  }
  return out;
}

/** Every song time at which second `sec` of the file sounds (once per chain that plays it). */
export function whenHeard(view: StemView, sec: number): number[] {
  const out: number[] = [];
  for (const seg of view.segments) {
    const t = seg.originMs + sec * 1000;
    if (t >= seg.fromMs && t < segmentEnd(view, seg)) out.push(t);
  }
  return out;
}

/** The slice playing at song time `ms` (the latest to start at or before it), if any. */
export function sliceAt(view: StemView, ms: number): StemSlice | undefined {
  let best: StemSlice | undefined;
  for (const s of view.slices) {
    const end =
      s.untilMs ?? (view.seconds === undefined ? Infinity : s.originMs + view.seconds * 1000);
    if (s.ms <= ms && ms < end && (!best || s.ms >= best.ms)) best = s;
  }
  return best;
}
