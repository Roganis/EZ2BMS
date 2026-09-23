// Classic-mode charting (BmsTWO's "Classic BMS Mode", docs/Classic-BMS-Mode.md
// there): the music is already complete in the background - sliced stems,
// a converted BMS - and charting means moving what is already sounding onto
// lanes. Placing a note keys the sound playing at that spot; deleting one
// un-keys it; splits and heals only cut or join slices. None of it may change
// what autoplay sounds like.
//
// Every operation here is checked before it is applied: the change is dry-run
// through audible() (publish/audible.ts) for exactly the source files it
// touches, and refused - with the reason and where it would be heard - if the
// sound would differ in any way. So the guarantee does not rest on the rules
// below being right; they only decide what to offer.
//
// From BmsTWO (sequence_view/SequenceViewWriteMode.cpp, SequenceView.cpp
// FindSampleChannelAtTime / FindSoundingSampleChannelAtTime / DeleteSelectedNotes
// / ResetAllNotesToBgm), with these differences:
// - un-keying keeps a note's velocity, pan, hold kind, `up`, `x_stop` and
//   unknown fields (BmsTWO rebuilds the note and drops them);
// - a split copies the sounding note's velocity and pan (a split at another
//   level would change the sound);
// - deleting a background fresh hit is refused: Classic never adds or removes
//   a sound;
// - no automatic split when a keyed long note is released, and no x_stop
//   clearing (EZ2 does not publish x_stop).

import type { ChannelId, NoteId, NoteRec } from '../model/types';
import { audible, audibleDiff } from '../publish/audible';
import type { SampleLookup } from '../publish/chart-plan';
import { OUT_RATE } from '../publish/keysounds';
import { groupKeyOf } from '../sound/grouping';
import { analysis } from './analysis';
import { BGM, movedConflict, placementConflict } from './commands';
import type { ChartDoc, NotePatch } from './doc';

export interface ClassicEnv {
  /** Sample lengths by source name. A sample whose length is unknown is never "sounding". */
  samples?: SampleLookup;
  /** The picked sound: its channel and its group come first. */
  brush?: ChannelId | null;
}

export type Candidate =
  /** A note already at this position (any lane): it moves to the lane, keeping its `c`. */
  | { kind: 'note'; id: NoteId; ch: ChannelId; tier: number; bad?: string }
  /** A sound playing through this position: a continuation is inserted on the lane. */
  | {
      kind: 'split';
      ch: ChannelId;
      /** The note whose sound it continues (velocity and pan are copied from it). */
      from: NoteId;
      onsetMs: number;
      tier: number;
      bad?: string;
    };

export type Verdict = { ok: true } | { ok: false; reason: string; atMs?: number };

export interface ClassicChange {
  patch?: { id: NoteId; patch: NotePatch }[];
  insert?: NoteRec[];
  remove?: NoteId[];
}

// ---- the check ------------------------------------------------------------------

/**
 * Would this change sound different? A pure dry run: nothing is applied. Only
 * the source files of the channels it touches are compared (voices never
 * cross files), each against its cached current sound.
 */
export function classicCheck(doc: ChartDoc, change: ClassicChange, env: ClassicEnv = {}): Verdict {
  const a = analysis(doc);
  const touched = new Set<ChannelId>();
  const patched = new Map<NoteId, NoteRec>();
  for (const { id, patch } of change.patch ?? []) {
    const n = doc.index.get(id);
    if (!n) return { ok: false, reason: 'that note is gone' };
    touched.add(n.ch);
    const next = { ...n, ...patch } as NoteRec;
    for (const [k, v] of Object.entries(patch))
      if (v === undefined) delete (next as unknown as Record<string, unknown>)[k];
    patched.set(id, next);
    touched.add(next.ch);
  }
  const removed = new Set(change.remove ?? []);
  for (const id of removed) {
    const n = doc.index.get(id);
    if (!n) return { ok: false, reason: 'that note is gone' };
    touched.add(n.ch);
  }
  for (const n of change.insert ?? []) touched.add(n.ch);
  const srcs = new Set<string>();
  for (const ch of touched) {
    const c = doc.channel(ch);
    if (c) srcs.add(c.name);
  }
  const chans = doc.data.channels.filter((c) => srcs.has(c.name));
  const lists = new Map<ChannelId, NoteRec[]>();
  for (const c of chans) {
    const out: NoteRec[] = [];
    for (const n of doc.index.channel(c.id)) {
      if (removed.has(n.id) || patched.has(n.id)) continue;
      out.push(n);
    }
    lists.set(c.id, out);
  }
  for (const n of patched.values()) lists.get(n.ch)?.push(n);
  for (const n of change.insert ?? []) lists.get(n.ch)?.push(n);
  const before = new Map([...srcs].map((s) => [s, a.soundOf(s, env.samples)] as const));
  const after = audible(doc.data, {
    ...a.opts(srcs, env.samples),
    notesOf: (ch) => lists.get(ch) ?? [],
  });
  const d = audibleDiff(before, after);
  if (!d) return { ok: true };
  return { ok: false, reason: `it would change how ${d.src} sounds`, atMs: d.atMs };
}

// ---- what is there to key -----------------------------------------------------------

const KEEP = 8;

/**
 * What a note placed at (x, y) could key, best first. Exact notes at y come
 * first (moving one is always an option BmsTWO prefers): background notes of
 * the brush's group, any background note, keyed notes of the group, any keyed
 * note. Then sounds playing through y: the brush's own channel, its group,
 * any - most recent onset first; a sample of unknown length is never taken to
 * be sounding. The first few are dry-run checked; those that would change the
 * sound go last, marked `bad` with the reason.
 */
export function classicCandidates(
  doc: ChartDoc,
  x: number,
  y: number,
  l: number,
  env: ClassicEnv = {},
): Candidate[] {
  const brush = env.brush != null ? doc.channel(env.brush) : undefined;
  const group = brush ? groupKeyOf(brush.name) : undefined;
  const order = new Map(doc.data.channels.map((c, i) => [c.id, i]));
  const inGroup = (ch: ChannelId) => {
    const c = doc.channel(ch);
    return group !== undefined && !!c && groupKeyOf(c.name) === group;
  };

  const exact: Candidate[] = [];
  const atY = new Set<ChannelId>();
  for (const lane of doc.index.laneKeys()) {
    for (const n of doc.index.at(lane, y)) {
      atY.add(n.ch);
      if (n.x === x) continue;
      if (placementConflict(doc, x, y, x === BGM ? 0 : l, new Set([n.id]))) continue;
      const bgm = n.x === BGM;
      const tier = (bgm ? 0 : 2) + (inGroup(n.ch) ? 0 : 1);
      exact.push({ kind: 'note', id: n.id, ch: n.ch, tier });
    }
  }
  exact.sort(
    (p, q) =>
      p.tier - q.tier ||
      (order.get(p.ch) ?? 0) - (order.get(q.ch) ?? 0) ||
      (p.kind === 'note' && q.kind === 'note' ? p.id - q.id : 0),
  );

  const sounding =
    x !== BGM && !placementConflict(doc, x, y, l) ? soundingAt(doc, y, env, atY) : [];

  return checked(doc, [...exact, ...sounding], (cand) => keyChange(doc, x, y, l, cand), env);
}

/** Dry-run the first few candidates; those that would change the sound go last, with the reason. */
function checked(
  doc: ChartDoc,
  all: Candidate[],
  change: (c: Candidate) => ClassicChange,
  env: ClassicEnv,
): Candidate[] {
  const good: Candidate[] = [];
  const bad: Candidate[] = [];
  all.forEach((cand, i) => {
    if (i >= KEEP) return good.push(cand);
    const v = classicCheck(doc, change(cand), env);
    if (v.ok) good.push(cand);
    else bad.push({ ...cand, bad: v.reason });
  });
  return [...good, ...bad];
}

/**
 * Channels whose sound plays through y (and that have no note there): the
 * brush's channel, then its group, then any - most recent onset first. A
 * sample of unknown length is never taken to be sounding past its last cut.
 */
function soundingAt(
  doc: ChartDoc,
  y: number,
  env: ClassicEnv,
  atY: ReadonlySet<ChannelId>,
): Candidate[] {
  const a = analysis(doc);
  const brush = env.brush != null ? doc.channel(env.brush) : undefined;
  const group = brush ? groupKeyOf(brush.name) : undefined;
  const order = new Map(doc.data.channels.map((c, i) => [c.id, i]));
  const t = a.clock.msAt(a.clock.tick(y));
  const out: (Candidate & { kind: 'split' })[] = [];
  for (const c of doc.data.channels) {
    if (atY.has(c.id)) continue;
    const evs = a.eventsOf(c.id);
    // The channel's last sound to start before t.
    let lo = 0;
    let hi = evs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (evs[mid]!.ms < t) lo = mid + 1;
      else hi = mid;
    }
    const e = evs[lo - 1];
    if (!e) continue;
    const frames = env.samples?.(c.name)?.frames;
    const end =
      e.untilMs ?? (frames === undefined ? undefined : e.originMs + (frames * 1000) / OUT_RATE);
    if (end === undefined || t >= end) continue;
    const tier =
      c.id === env.brush ? 4 : group !== undefined && groupKeyOf(c.name) === group ? 5 : 6;
    out.push({ kind: 'split', ch: c.id, from: e.n.id, onsetMs: e.originMs, tier });
  }
  return out.sort(
    (p, q) =>
      p.tier - q.tier || q.onsetMs - p.onsetMs || (order.get(p.ch) ?? 0) - (order.get(q.ch) ?? 0),
  );
}

/** The change keying a candidate at (x, y) makes. */
function keyChange(doc: ChartDoc, x: number, y: number, l: number, cand: Candidate): ClassicChange {
  const len = x === BGM ? 0 : l;
  if (cand.kind === 'note') return { patch: [{ id: cand.id, patch: { x, l: len } }] };
  const from = doc.index.get(cand.from);
  // The id the note will get, so a dry run orders same-instant notes as the real one will.
  const rec: NoteRec = { id: doc.peekNoteId(), ch: cand.ch, x, y, l: len, c: true };
  if (from?.vel !== undefined) rec.vel = from.vel;
  if (from?.pan !== undefined) rec.pan = from.pan;
  return { insert: [rec] };
}

// ---- operations -------------------------------------------------------------------

export type ClassicResult = Verdict & { id?: NoteId };

/** Key a candidate onto lane x at y (a hold of length l). Refused, unchanged, when it would change the sound. */
export function classicKey(
  doc: ChartDoc,
  x: number,
  y: number,
  l: number,
  cand: Candidate,
  env: ClassicEnv = {},
): ClassicResult {
  if (x === BGM) return { ok: false, reason: 'pick a lane to key onto' };
  const len = Math.max(0, l);
  const ignore = cand.kind === 'note' ? new Set([cand.id]) : new Set<NoteId>();
  const why = placementConflict(doc, x, y, len, ignore);
  if (why) return { ok: false, reason: why };
  const change = keyChange(doc, x, y, len, cand);
  const v = classicCheck(doc, change, env);
  if (!v.ok) return v;
  const id = doc.transact('Key sound', (tx) => {
    let keyed: NoteId;
    if (cand.kind === 'note') {
      tx.patchNotes(change.patch!);
      keyed = cand.id;
    } else {
      keyed = tx.insertNotes([{ ...change.insert![0]!, id: doc.newNoteId() }])[0]!.id;
    }
    tx.select([keyed], keyed);
    return keyed;
  });
  return { ok: true, id };
}

/** Move keyed notes to other lanes at the same position (Classic never moves a sound in time). */
export function classicMove(
  doc: ChartDoc,
  moves: { id: NoteId; x: number }[],
  env: ClassicEnv = {},
): Verdict {
  const notes = moves.map((m) => ({ m, n: doc.index.get(m.id) }));
  if (notes.some((p) => !p.n)) return { ok: false, reason: 'that note is gone' };
  const moved = notes.map(({ m, n }) => ({ id: m.id, x: m.x, y: n!.y, l: m.x === BGM ? 0 : n!.l }));
  if (movedConflict(doc, moved)) return { ok: false, reason: 'a lane is taken there' };
  const change: ClassicChange = {
    patch: moved.map((m) => ({ id: m.id, patch: { x: m.x, l: m.l } })),
  };
  const v = classicCheck(doc, change, env);
  if (!v.ok) return v;
  doc.transact('Move keyed notes', (tx) => tx.patchNotes(change.patch!));
  return { ok: true };
}

/**
 * Un-key: lane notes go back to the background (length 0, everything else
 * kept). A continuation in `healable` - a split Classic itself made - is
 * removed instead when that sounds the same. Background continuations among
 * `ids` are healed when exact; a background fresh hit is refused.
 */
export function classicUnkey(
  doc: ChartDoc,
  ids: Iterable<NoteId>,
  env: ClassicEnv & { healable?: ReadonlySet<NoteId> } = {},
): Verdict & { healed?: NoteId[] } {
  const patch: { id: NoteId; patch: NotePatch }[] = [];
  const heal: NoteId[] = [];
  for (const id of new Set(ids)) {
    const n = doc.index.get(id);
    if (!n) continue;
    if (n.x === BGM) {
      if (!n.c)
        return {
          ok: false,
          reason: 'that is where a sound starts - Classic mode never removes one',
        };
      heal.push(id);
    } else if (n.c && env.healable?.has(id)) heal.push(id);
    else patch.push({ id, patch: { x: BGM, l: 0 } });
  }
  if (!patch.length && !heal.length) return { ok: true };
  let change: ClassicChange = { patch, remove: heal };
  let v = classicCheck(doc, change, env);
  if (!v.ok && heal.length) {
    // Healing is optional for keyed splits: send them to the background instead.
    const keyedHeal = heal.filter((id) => doc.index.get(id)!.x !== BGM);
    const bgmHeal = heal.filter((id) => doc.index.get(id)!.x === BGM);
    if (bgmHeal.length) return v;
    change = { patch: [...patch, ...keyedHeal.map((id) => ({ id, patch: { x: BGM, l: 0 } }))] };
    v = classicCheck(doc, change, env);
  }
  if (!v.ok) return v;
  const removed = change.remove ?? [];
  doc.transact(patch.length + heal.length === 1 ? 'Un-key note' : 'Un-key notes', (tx) => {
    if (change.patch?.length) tx.patchNotes(change.patch);
    if (removed.length) tx.deleteNotes(removed);
  });
  return { ok: true, healed: removed };
}

/** Sounds playing through y that could be split there (a background continuation). */
export function splitCandidates(doc: ChartDoc, y: number, env: ClassicEnv = {}): Candidate[] {
  const atY = new Set<ChannelId>();
  for (const lane of doc.index.laneKeys()) for (const n of doc.index.at(lane, y)) atY.add(n.ch);
  return checked(doc, soundingAt(doc, y, env, atY), (cand) => keyChange(doc, BGM, y, 0, cand), env);
}

/** Split the sound of `cand` at y with a background continuation. */
export function classicSplit(
  doc: ChartDoc,
  y: number,
  cand: Candidate,
  env: ClassicEnv = {},
): ClassicResult {
  if (cand.kind !== 'split') return { ok: false, reason: 'nothing to split there' };
  const change = keyChange(doc, BGM, y, 0, cand);
  const v = classicCheck(doc, change, env);
  if (!v.ok) return v;
  const id = doc.transact(
    'Split sound',
    (tx) => tx.insertNotes([{ ...change.insert![0]!, id: doc.newNoteId() }])[0]!.id,
  );
  return { ok: true, id };
}

/** Heal (remove) a background continuation, when that sounds the same. */
export function classicHeal(doc: ChartDoc, id: NoteId, env: ClassicEnv = {}): Verdict {
  const n = doc.index.get(id);
  if (!n || n.x !== BGM || !n.c)
    return { ok: false, reason: 'only a split in the background can be healed' };
  const v = classicCheck(doc, { remove: [id] }, env);
  if (!v.ok) return v;
  doc.transact('Heal split', (tx) => tx.deleteNotes([id]));
  return { ok: true };
}

/** Every lane note back to the background (length 0), all or nothing. Splits stay. */
export function resetAllToBgm(doc: ChartDoc, env: ClassicEnv = {}): Verdict & { count?: number } {
  const lane: NoteRec[] = [];
  for (const x of doc.index.laneKeys()) if (x !== BGM) lane.push(...doc.index.lane(x));
  if (!lane.length) return { ok: true, count: 0 };
  const change: ClassicChange = { patch: lane.map((n) => ({ id: n.id, patch: { x: BGM, l: 0 } })) };
  const v = classicCheck(doc, change, env);
  if (!v.ok) return v;
  doc.transact('Reset all to background', (tx) => tx.patchNotes(change.patch!));
  return { ok: true, count: lane.length };
}

/**
 * Snap to sample (BmsTWO's magnet in Classic mode): the nearest note of the
 * group's channels within `within` pulses of p, or undefined.
 */
export function snapToSample(
  doc: ChartDoc,
  p: number,
  within: number,
  group: string,
): number | undefined {
  let best: number | undefined;
  for (const c of doc.data.channels) {
    if (groupKeyOf(c.name) !== group) continue;
    const notes = doc.index.channel(c.id);
    let lo = 0;
    let hi = notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (notes[mid]!.y < p) lo = mid + 1;
      else hi = mid;
    }
    for (const n of [notes[lo - 1], notes[lo]]) {
      if (!n) continue;
      const d = Math.abs(n.y - p);
      if (d <= within && (best === undefined || d < Math.abs(best - p))) best = n.y;
    }
  }
  return best;
}
