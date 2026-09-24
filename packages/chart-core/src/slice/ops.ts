// Slicing a stem: cutting it (by hand, to the grid, at its onsets), moving
// and healing cuts, and putting slices on lanes. A cut is a background
// continuation note on the channel whose sound runs through that spot - the
// standard bmson `c`, no new fields - so the package and EZ2PORT's own
// importer read it as they always have.
//
// Every operation keeps the sound. Cutting a sound where it is playing, moving
// a cut between its neighbours, healing one, keying a slice onto a lane at the
// same position: none of these changes what plays when (a chain's slices join
// sample-exactly). The exceptions - the 0.5 ms minimum slice, a cut past the
// file's end, a voice cut by a retrigger - are exactly what classicCheck
// (edit/classic.ts) catches, and every change is dry-run through it first and
// refused, unchanged, if autoplay would sound any different. Moving a sound
// in time is an ordinary edit, not slicing.

import { analysis, type Analysis } from '../edit/analysis';
import { classicCheck, classicHeal, type ClassicEnv, type Verdict } from '../edit/classic';
import { BGM, movedConflict, placementConflict } from '../edit/commands';
import type { ChartDoc, TransactOptions } from '../edit/doc';
import { said, sayText } from '../i18n/say';
import type { ChannelId, NoteId, NoteRec } from '../model/types';
import { OUT_RATE } from '../publish/keysounds';
import { TICKS_PER_BEAT } from '../timing/ticks';
import { stemView, whenHeard, type StemView } from './view';

export type SliceEnv = ClassicEnv;
export type SliceResult = Verdict & { ids?: NoteId[] };

/** A cut to be made: the continuation it inserts (its id is the one it will get). */
export type Cut = NoteRec;

/** The last sound of channel `ch` to start before song time `t`, if it is still playing at `t`. */
function soundingEvent(a: Analysis, doc: ChartDoc, ch: ChannelId, t: number, env: SliceEnv) {
  const evs = a.eventsOf(ch);
  let lo = 0;
  let hi = evs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (evs[mid]!.ms < t) lo = mid + 1;
    else hi = mid;
  }
  const e = evs[lo - 1];
  if (!e) return undefined;
  const name = doc.channel(ch)?.name;
  const frames = name === undefined ? undefined : env.samples?.(name)?.frames;
  // A file of unknown length is never taken to be playing past its last note.
  const end =
    e.untilMs ?? (frames === undefined ? undefined : e.originMs + (frames * 1000) / OUT_RATE);
  if (end === undefined || t >= end) return undefined;
  return e;
}

/**
 * Where `src` could be cut at each of `ys`: on the channel playing it there
 * (the latest to start, when several do), a background continuation with the
 * sounding note's velocity and pan. Spots where it is not playing, or where
 * a channel playing it already has a note, are left out. Ids are the ones the cuts
 * will get, in order, so a dry run orders same-instant notes as the real
 * insert will.
 */
export function planCuts(
  doc: ChartDoc,
  src: string,
  ys: Iterable<number>,
  env: SliceEnv = {},
): Cut[] {
  const a = analysis(doc);
  const channels = doc.data.channels.filter((c) => c.name === src).map((c) => c.id);
  const out: Cut[] = [];
  const seen = new Set<number>();
  // Where any channel playing the file has a note, it is cut (or starts) already.
  const taken = new Set(channels.flatMap((ch) => doc.index.channel(ch).map((n) => n.y)));
  let id = doc.peekNoteId();
  for (const y of [...ys].sort((p, q) => p - q)) {
    if (y < 0 || seen.has(y) || !Number.isInteger(y)) continue;
    seen.add(y);
    const t = a.clock.msAt(a.clock.tick(y));
    let best: { ch: ChannelId; e: NonNullable<ReturnType<typeof soundingEvent>> } | undefined;
    for (const ch of channels) {
      const e = soundingEvent(a, doc, ch, t, env);
      if (e && (!best || e.originMs > best.e.originMs)) best = { ch, e };
    }
    if (!best || taken.has(y)) continue;
    const ch = best.ch;
    const cut: Cut = { id: id++, ch, x: BGM, y, l: 0, c: true };
    if (best.e.n.vel !== undefined) cut.vel = best.e.n.vel;
    if (best.e.n.pan !== undefined) cut.pan = best.e.n.pan;
    out.push(cut);
  }
  return out;
}

/**
 * Make the cuts in one undo step. Checked together first; when that fails,
 * each is checked alone and only those that keep the sound are made (and the
 * rest are checked together again). Refused, unchanged, if none can be.
 */
export function applyCuts(
  doc: ChartDoc,
  cuts: readonly Cut[],
  env: SliceEnv = {},
  label = sayText(said('undo.cut-stem')),
  opts: TransactOptions = {},
): SliceResult {
  if (!cuts.length) return { ok: false, reason: sayText(said('slice.nothing-to-cut')) };
  let keep = [...cuts];
  let v = classicCheck(doc, { insert: keep }, env);
  if (!v.ok && keep.length > 1) {
    const first = v;
    // Renumber as the remaining cuts will be inserted.
    const fresh = (list: Cut[]) => list.map((c, i) => ({ ...c, id: doc.peekNoteId() + i }));
    keep = fresh(
      keep.filter((c) => classicCheck(doc, { insert: [{ ...c, id: doc.peekNoteId() }] }, env).ok),
    );
    v = keep.length ? classicCheck(doc, { insert: keep }, env) : first;
  }
  if (!v.ok) return v;
  const ids = doc.transact(
    label,
    (tx) => {
      const stored = tx.insertNotes(keep.map((c) => ({ ...c, id: doc.newNoteId() })));
      return stored.map((n) => n.id);
    },
    opts,
  );
  return { ok: true, ids };
}

/** Cut `src` at y (by hand). */
export function sliceSplit(doc: ChartDoc, src: string, y: number, env: SliceEnv = {}): SliceResult {
  const cuts = planCuts(doc, src, [y], env);
  if (!cuts.length) {
    const a = analysis(doc);
    const t = a.clock.msAt(a.clock.tick(y));
    const at = doc.data.channels
      .filter((c) => c.name === src)
      .some((c) => doc.index.channel(c.id).some((n) => n.y === y));
    return {
      ok: false,
      reason: sayText(at ? said('slice.already-cut') : said('slice.not-playing', { src })),
      atMs: t,
    };
  }
  return applyCuts(doc, cuts, env);
}

/** Heal (remove) a cut in the background, joining its slice to the one before. */
export function sliceHeal(doc: ChartDoc, id: NoteId, env: SliceEnv = {}): Verdict {
  return classicHeal(doc, id, env);
}

/**
 * Move a cut to y, between the cuts either side of it on its channel. Only
 * cuts move: where a sound starts cannot (that would move the sound). A cut
 * on a lane must also fit there.
 */
export function sliceMove(doc: ChartDoc, id: NoteId, y: number, env: SliceEnv = {}): Verdict {
  const n = doc.index.get(id);
  if (!n) return { ok: false, reason: sayText(said('edit.note-gone')) };
  if (y === n.y) return { ok: true };
  const chain = doc.index.channel(n.ch);
  const i = chain.findIndex((m) => m.id === id);
  if (!n.c || i <= 0) return { ok: false, reason: sayText(said('slice.sound-starts')) };
  const prev = chain[i - 1]!;
  const next = chain[i + 1];
  if (!Number.isInteger(y) || y <= prev.y || (next && y >= next.y))
    return { ok: false, reason: sayText(said('slice.between-cuts')) };
  if (n.x !== BGM) {
    const why = placementConflict(doc, n.x, y, n.l, new Set([id]));
    if (why) return { ok: false, reason: why };
  }
  const patch = [{ id, patch: { y } }];
  const v = classicCheck(doc, { patch }, env);
  if (!v.ok) return v;
  doc.transact(sayText(said('undo.move-cut')), (tx) => tx.patchNotes(patch));
  return { ok: true };
}

/**
 * Put slices on lane x at their own positions (x = BGM: back to the
 * background). Holds keep their length on a lane and lose it in the background.
 */
export function sliceKey(
  doc: ChartDoc,
  ids: readonly NoteId[],
  x: number,
  env: SliceEnv = {},
): Verdict {
  const notes = ids.map((id) => doc.index.get(id));
  if (!notes.length || notes.some((n) => !n))
    return { ok: false, reason: sayText(said('edit.note-gone')) };
  const moved = notes.map((n) => ({ id: n!.id, x, y: n!.y, l: x === BGM ? 0 : n!.l }));
  if (movedConflict(doc, moved)) return { ok: false, reason: sayText(said('slice.lane-taken')) };
  const patch = moved.map((m) => ({ id: m.id, patch: { x: m.x, l: m.l } }));
  const v = classicCheck(doc, { patch }, env);
  if (!v.ok) return v;
  const label = said(x === BGM ? 'undo.slice-to-background' : 'undo.key-slice', { n: ids.length });
  doc.transact(sayText(label), (tx) => {
    tx.patchNotes(patch);
    tx.select(ids, ids[0]);
  });
  return { ok: true };
}

// ---- to the grid ----------------------------------------------------------------

export interface ChopOptions {
  /**
   * Leave a step uncut when the slice it would start is silent up to the next
   * step: silence then stays on the end of the slice before, instead of
   * becoming keysounds of its own. Asked in seconds of the file.
   */
  isSilent?: (fromSec: number, toSec: number) => boolean;
}

/**
 * The cuts chopping `src` at every `step` pulses in [from, to) would make:
 * wherever it is playing and not already cut. Nothing is changed.
 */
export function chopPlan(
  doc: ChartDoc,
  src: string,
  from: number,
  to: number,
  step: number,
  env: SliceEnv = {},
  o: ChopOptions = {},
): Cut[] {
  if (!(step > 0)) return [];
  const ys: number[] = [];
  for (let y = Math.ceil(from / step) * step; y < to; y += step) ys.push(y);
  const cuts = planCuts(doc, src, ys, env);
  if (!o.isSilent) return cuts;
  const a = analysis(doc);
  const kept = cuts.filter((c) => {
    const e = soundingEvent(a, doc, c.ch, a.clock.msAt(a.clock.tick(c.y)), env)!;
    const sec = (y: number) => (a.clock.msAt(a.clock.tick(y)) - e.originMs) / 1000;
    return !o.isSilent!(sec(c.y), sec(c.y + step));
  });
  return kept.map((c, i) => ({ ...c, id: doc.peekNoteId() + i }));
}

/** Chop `src` at every `step` pulses in [from, to), in one undo step. */
export function chopToGrid(
  doc: ChartDoc,
  src: string,
  from: number,
  to: number,
  step: number,
  env: SliceEnv = {},
  o: ChopOptions = {},
): SliceResult {
  const cuts = chopPlan(doc, src, from, to, step, env, o);
  if (!cuts.length) return { ok: false, reason: sayText(said('slice.nothing-to-cut')) };
  return applyCuts(doc, cuts, env, sayText(said('undo.chop')));
}

// ---- at onsets --------------------------------------------------------------------

export interface Onset {
  /** Seconds from the file's start. */
  sec: number;
  /** 0..1. */
  strength: number;
}

export interface OnsetOptions {
  /** Snap to this grid (pulses); an onset further than `tolerance` of a step from it is left out. */
  step: number;
  /** Fraction of a step (default 1/3). */
  tolerance?: number;
  /** Onsets weaker than this are left out (default 0.1). */
  minStrength?: number;
  /** Place on the nearest EZ2 tick instead of the grid (every onset, exact to 1/48 beat). */
  exact?: boolean;
  /** Only positions in [from, to). */
  from?: number;
  to?: number;
}

export interface Suggestion {
  y: number;
  /** The onset it comes from. */
  sec: number;
  strength: number;
  /** Song ms of the onset itself (the cut may sit off it, on the grid). */
  ms: number;
  cut: Cut;
}

/**
 * Where `src` could be cut at its onsets: each onset where it sounds in the
 * chart (once per chain that plays it), on the grid - or the nearest EZ2
 * tick - and only where it is playing and not cut yet. The strongest onset
 * wins a spot. Nothing is changed.
 */
export function onsetSuggestions(
  doc: ChartDoc,
  src: string,
  onsets: readonly Onset[],
  o: OnsetOptions,
  env: SliceEnv = {},
): Suggestion[] {
  const a = analysis(doc);
  const view: StemView = stemView(doc, src, env.samples);
  const res = a.clock.resolution;
  const tol = (o.tolerance ?? 1 / 3) * o.step;
  const min = o.minStrength ?? 0.1;
  const tick = res / TICKS_PER_BEAT;
  const best = new Map<number, { sec: number; strength: number; ms: number }>();
  for (const on of onsets) {
    if (on.strength < min) continue;
    for (const ms of whenHeard(view, on.sec)) {
      const p = a.timeline.pulseAt(ms);
      let y: number;
      if (o.exact) y = Math.round(Math.round(p / tick) * tick);
      else {
        y = Math.round(p / o.step) * o.step;
        if (Math.abs(y - p) > tol) continue;
      }
      if (o.from !== undefined && y < o.from) continue;
      if (o.to !== undefined && y >= o.to) continue;
      const had = best.get(y);
      if (!had || on.strength > had.strength)
        best.set(y, { sec: on.sec, strength: on.strength, ms });
    }
  }
  const cuts = planCuts(doc, src, best.keys(), env);
  return cuts.map((cut) => ({ y: cut.y, ...best.get(cut.y)!, cut }));
}
