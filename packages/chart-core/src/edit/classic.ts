// Classic-mode charting (BmsTWO's "Classic BMS Mode", docs/Classic-BMS-Mode.md
// there): the music is already complete in the background - sliced stems,
// a converted BMS - and charting means moving what is already there onto
// lanes. Placing a note keys a note the background already has at that spot;
// deleting one un-keys it; splits and heals only cut or join slices. None of
// it may change what autoplay sounds like.
//
// Placing never makes a note of its own: only a note already at the spot is
// keyed, and the magnet (classicMagnet) brings the pointer onto one. A split
// of a sound still playing through the spot is the explicit right-click (or a
// stem strip's cut), never a side effect of placing. That is the owner's rule
// (2026-09-28): a keyed slice that starts where the stem had no cut is a new
// sound on the lane - heard alone when the player presses early or late, and
// silent when they miss - so charting must only take slices that already
// exist. BmsTWO falls back to such a split when no note is at the spot
// (SequenceViewWriteMode.cpp, FindSoundingSampleChannelAtTime); EZ2BMS does not.
//
// Every operation here is checked before it is applied: the change is dry-run
// through audible() (publish/audible.ts) for exactly the source files it
// touches, and refused - with the reason and where it would be heard - if the
// sound would differ in any way. So the guarantee does not rest on the rules
// below being right; they only decide what to offer.
//
// From BmsTWO (sequence_view/SequenceViewWriteMode.cpp, SequenceView.cpp
// FindSampleChannelAtTime / SnapToSampleInCurrentGroup / DeleteSelectedNotes /
// ResetAllNotesToBgm), with these differences:
// - no split when nothing is at the spot (above);
// - the magnet reaches a measure, not the whole chart, and pulls to background
//   notes only, the picked sound's group first (below);
// - un-keying keeps a note's velocity, pan, hold kind, `up`, `x_stop` and
//   unknown fields (BmsTWO rebuilds the note and drops them);
// - a split copies the sounding note's velocity and pan (a split at another
//   level would change the sound);
// - deleting a background fresh hit is refused: Classic never adds or removes
//   a sound;
// - no automatic split when a keyed long note is released, and no x_stop
//   clearing (EZ2 does not publish x_stop).

import { said, sayText } from '../i18n/say';
import type { ChannelId, NoteId, NoteRec } from '../model/types';
import { audible, audibleDiff } from '../publish/audible';
import type { SampleLookup } from '../publish/chart-plan';
import { OUT_RATE } from '../publish/keysounds';
import { groupKeyOf } from '../sound/grouping';
import { analysis } from './analysis';
import { BGM, movedConflict, placementConflict, placementRule } from './commands';
import type { ChartDoc, NotePatch } from './doc';

export interface ClassicEnv {
  /** Sample lengths by source name. A sample whose length is unknown is never "sounding". */
  samples?: SampleLookup;
  /** The picked sound: its channel and its group come first. */
  brush?: ChannelId | null;
}

/** A note already at this position (any lane): keying moves it to the lane, keeping its `c`. */
export interface KeyCandidate {
  kind: 'note';
  id: NoteId;
  ch: ChannelId;
  tier: number;
  bad?: string;
}

/** A sound playing through a position: a split inserts a background continuation there. */
export interface SplitCandidate {
  kind: 'split';
  ch: ChannelId;
  /** The note whose sound it continues (velocity and pan are copied from it). */
  from: NoteId;
  onsetMs: number;
  tier: number;
  bad?: string;
}

export type Candidate = KeyCandidate | SplitCandidate;

/**
 * Done, or refused with why (and where the change would be heard). The reason
 * is said in the language chosen when the refusal is made: the editor shows
 * it at once, inside its own sentence ("Can't key that: …").
 */
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
    if (!n) return { ok: false, reason: sayText(said('edit.note-gone')) };
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
    if (!n) return { ok: false, reason: sayText(said('edit.note-gone')) };
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
  return {
    ok: false,
    reason: sayText(said('classic.changes-sound', { src: d.src })),
    atMs: d.atMs,
  };
}

// ---- what is there to key -----------------------------------------------------------

const KEEP = 8;

/**
 * What a note placed at (x, y) could key, best first: only notes already at
 * y (FindSampleChannelAtTime's order) - background notes of the brush's
 * group, any background note, keyed notes of the group, any keyed note. None
 * there, nothing to key: placing is refused, never turned into a split. The
 * first few are dry-run checked; those that would change the sound go last,
 * marked `bad` with the reason.
 */
export function classicCandidates(
  doc: ChartDoc,
  x: number,
  y: number,
  l: number,
  env: ClassicEnv = {},
): KeyCandidate[] {
  const inGroup = groupTest(doc, env.brush);
  const exact: KeyCandidate[] = [];
  for (const lane of doc.index.laneKeys()) {
    for (const n of doc.index.at(lane, y)) {
      if (n.x === x) continue;
      if (placementRule(doc, x, y, x === BGM ? 0 : l, new Set([n.id]))) continue;
      const bgm = n.x === BGM;
      const tier = (bgm ? 0 : 2) + (inGroup(n.ch) ? 0 : 1);
      exact.push({ kind: 'note', id: n.id, ch: n.ch, tier });
    }
  }
  return checked(doc, byTier(doc, exact), (cand) => keyChange(x, l, cand), env);
}

/**
 * What a recorded press could key at (x, y), unchecked: notes already there
 * in the background only (never a note keyed on another lane - a take must
 * not take another lane's keyings away), the brush's group first. No dry
 * runs, which is what makes a take of hundreds of presses affordable;
 * classicKey's own check refuses one that would change the sound.
 */
export function recordCandidates(
  doc: ChartDoc,
  x: number,
  y: number,
  l: number,
  env: ClassicEnv = {},
): KeyCandidate[] {
  const inGroup = groupTest(doc, env.brush);
  const exact: KeyCandidate[] = [];
  if (x === BGM || placementRule(doc, x, y, l)) return exact;
  for (const n of doc.index.at(BGM, y))
    exact.push({ kind: 'note', id: n.id, ch: n.ch, tier: inGroup(n.ch) ? 0 : 1 });
  return byTier(doc, exact);
}

/** Whether a channel is in the brush's group (the backing track it came from). */
function groupTest(doc: ChartDoc, brush: ChannelId | null | undefined): (ch: ChannelId) => boolean {
  const b = brush != null ? doc.channel(brush) : undefined;
  if (!b) return () => false;
  const group = groupKeyOf(b.name);
  const memo = new Map<ChannelId, boolean>();
  return (ch) => {
    let g = memo.get(ch);
    if (g === undefined) {
      const c = doc.channel(ch);
      memo.set(ch, (g = !!c && groupKeyOf(c.name) === group));
    }
    return g;
  };
}

/** Tier, then the channel's place in the list, then the note's age. */
function byTier(doc: ChartDoc, cands: KeyCandidate[]): KeyCandidate[] {
  const order = new Map(doc.data.channels.map((c, i) => [c.id, i]));
  return cands.sort(
    (p, q) => p.tier - q.tier || (order.get(p.ch) ?? 0) - (order.get(q.ch) ?? 0) || p.id - q.id,
  );
}

/** Dry-run the first few candidates; those that would change the sound go last, with the reason. */
function checked<C extends Candidate>(
  doc: ChartDoc,
  all: C[],
  change: (c: C) => ClassicChange,
  env: ClassicEnv,
): C[] {
  const good: C[] = [];
  const bad: C[] = [];
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
): SplitCandidate[] {
  const a = analysis(doc);
  const brush = env.brush != null ? doc.channel(env.brush) : undefined;
  const group = brush ? groupKeyOf(brush.name) : undefined;
  const order = new Map(doc.data.channels.map((c, i) => [c.id, i]));
  const t = a.clock.msAt(a.clock.tick(y));
  const out: SplitCandidate[] = [];
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

/** The change keying a note onto lane x (a hold of length l) makes: the note moves, nothing is added. */
function keyChange(x: number, l: number, cand: KeyCandidate): ClassicChange {
  return { patch: [{ id: cand.id, patch: { x, l: x === BGM ? 0 : l } }] };
}

/** The change splitting a sound at y makes: a background continuation. */
function splitChange(doc: ChartDoc, y: number, cand: SplitCandidate): ClassicChange {
  const from = doc.index.get(cand.from);
  // The id the note will get, so a dry run orders same-instant notes as the real one will.
  const rec: NoteRec = { id: doc.peekNoteId(), ch: cand.ch, x: BGM, y, l: 0, c: true };
  if (from?.vel !== undefined) rec.vel = from.vel;
  if (from?.pan !== undefined) rec.pan = from.pan;
  return { insert: [rec] };
}

// ---- operations -------------------------------------------------------------------

export type ClassicResult = Verdict & { id?: NoteId };

/**
 * Key a note already at y onto lane x (a hold of length l): the note moves,
 * nothing is added. Refused, unchanged, when the note is not at y any more or
 * the move would change the sound.
 */
export function classicKey(
  doc: ChartDoc,
  x: number,
  y: number,
  l: number,
  cand: KeyCandidate,
  env: ClassicEnv = {},
): ClassicResult {
  if (x === BGM) return { ok: false, reason: sayText(said('classic.no-lane')) };
  const n = doc.index.get(cand.id);
  if (!n || n.y !== y) return { ok: false, reason: sayText(said('edit.note-gone')) };
  const len = Math.max(0, l);
  const why = placementConflict(doc, x, y, len, new Set([cand.id]));
  if (why) return { ok: false, reason: why };
  const change = keyChange(x, len, cand);
  const v = classicCheck(doc, change, env);
  if (!v.ok) return v;
  doc.transact(sayText(said('undo.key-sound')), (tx) => {
    tx.patchNotes(change.patch!);
    tx.select([cand.id], cand.id);
  });
  return { ok: true, id: cand.id };
}

/** Move keyed notes to other lanes at the same position (Classic never moves a sound in time). */
export function classicMove(
  doc: ChartDoc,
  moves: { id: NoteId; x: number }[],
  env: ClassicEnv = {},
): Verdict {
  const notes = moves.map((m) => ({ m, n: doc.index.get(m.id) }));
  if (notes.some((p) => !p.n)) return { ok: false, reason: sayText(said('edit.note-gone')) };
  const moved = notes.map(({ m, n }) => ({ id: m.id, x: m.x, y: n!.y, l: m.x === BGM ? 0 : n!.l }));
  if (movedConflict(doc, moved)) return { ok: false, reason: sayText(said('classic.lane-taken')) };
  const change: ClassicChange = {
    patch: moved.map((m) => ({ id: m.id, patch: { x: m.x, l: m.l } })),
  };
  const v = classicCheck(doc, change, env);
  if (!v.ok) return v;
  doc.transact(sayText(said('undo.move-keyed')), (tx) => tx.patchNotes(change.patch!));
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
      if (!n.c) return { ok: false, reason: sayText(said('classic.sound-starts')) };
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
  doc.transact(sayText(said('undo.unkey', { n: patch.length + heal.length })), (tx) => {
    if (change.patch?.length) tx.patchNotes(change.patch);
    if (removed.length) tx.deleteNotes(removed);
  });
  return { ok: true, healed: removed };
}

/** Sounds playing through y that could be split there (a background continuation). */
export function splitCandidates(doc: ChartDoc, y: number, env: ClassicEnv = {}): SplitCandidate[] {
  const atY = new Set<ChannelId>();
  for (const lane of doc.index.laneKeys()) for (const n of doc.index.at(lane, y)) atY.add(n.ch);
  return checked(doc, soundingAt(doc, y, env, atY), (cand) => splitChange(doc, y, cand), env);
}

/** Split the sound of `cand` at y with a background continuation. */
export function classicSplit(
  doc: ChartDoc,
  y: number,
  cand: Candidate,
  env: ClassicEnv = {},
): ClassicResult {
  if (cand.kind !== 'split')
    return { ok: false, reason: sayText(said('classic.nothing-to-split')) };
  const change = splitChange(doc, y, cand);
  const v = classicCheck(doc, change, env);
  if (!v.ok) return v;
  const id = doc.transact(
    sayText(said('undo.split-sound')),
    (tx) => tx.insertNotes([{ ...change.insert![0]!, id: doc.newNoteId() }])[0]!.id,
  );
  return { ok: true, id };
}

/** Heal (remove) a background continuation, when that sounds the same. */
export function classicHeal(doc: ChartDoc, id: NoteId, env: ClassicEnv = {}): Verdict {
  const n = doc.index.get(id);
  if (!n || n.x !== BGM || !n.c)
    return { ok: false, reason: sayText(said('classic.heal-background')) };
  const v = classicCheck(doc, { remove: [id] }, env);
  if (!v.ok) return v;
  doc.transact(sayText(said('undo.heal-split')), (tx) => tx.deleteNotes([id]));
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
  doc.transact(sayText(said('undo.reset-background')), (tx) => tx.patchNotes(change.patch!));
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

/** How far the magnet reaches when a note is placed by hand: a measure. */
export const MAGNET_BEATS = 4;

export interface MagnetOptions {
  /** How far from p it pulls, in pulses (default a measure, MAGNET_BEATS beats). */
  reach?: number;
  /** The lane the note goes on: a spot it cannot take (a note there, or a hold over it) is passed over. */
  lane?: number;
  /** The picked sound (the last note keyed or clicked): its group's notes pull first. */
  brush?: ChannelId | null;
}

/**
 * The magnet: where a note placed near p goes in Classic mode - always onto
 * a note already in the background, since that is all placing may key.
 * BmsTWO's SnapToSampleInCurrentGroup (SequenceView.cpp) pulls to the nearest
 * note of the current channel's name group, keyed or not, however far; here
 * the picked sound's group (the backing track the last keyed or clicked note
 * came from) pulls first too, then any background note, the nearest within
 * `reach` pulses - so a group with a long rest does not drag the note off the
 * screen, and another track's note under the pointer is taken instead.
 * Undefined when there is none: nothing near to key.
 */
export function classicMagnet(doc: ChartDoc, p: number, o: MagnetOptions = {}): number | undefined {
  const bg = doc.index.lane(BGM);
  const reach = o.reach ?? MAGNET_BEATS * doc.resolution;
  const inGroup = groupTest(doc, o.brush);
  const grouped = o.brush != null && !!doc.channel(o.brush);
  const lane = o.lane;
  const open = new Map<number, boolean>();
  const takes = (y: number) => {
    if (lane === undefined || lane === BGM) return y >= 0;
    let f = open.get(y);
    if (f === undefined) open.set(y, (f = !placementRule(doc, lane, y, 0)));
    return f;
  };
  // Outward from p, nearest first (at or after p wins a tie, as in BmsTWO).
  let up = 0;
  let hi = bg.length;
  while (up < hi) {
    const mid = (up + hi) >>> 1;
    if (bg[mid]!.y < p) up = mid + 1;
    else hi = mid;
  }
  let down = up - 1;
  let any: number | undefined;
  while (down >= 0 || up < bg.length) {
    const dDown = down >= 0 ? p - bg[down]!.y : Infinity;
    const dUp = up < bg.length ? bg[up]!.y - p : Infinity;
    const n = dUp <= dDown ? bg[up++]! : bg[down--]!;
    if (Math.abs(n.y - p) > reach) break;
    if (!takes(n.y)) continue;
    if (!grouped || inGroup(n.ch)) return n.y;
    any ??= n.y;
  }
  return any;
}
