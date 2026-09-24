// A recorded take: the presses made while the song played, turned into notes.
// Record mode (the editor's play/recorder) collects each press's lane and its
// song time (already corrected for the player's latency); this snaps them to
// the grid, says what the take would do, and applies it as ONE undo step.
//
// - Snapping: to the nearest step of the chosen grid (the editor's snap, or
//   the exact EZ2 tick), by the chart's own clock (PlanTimeline: the f32
//   tempo EZ2PORT plays, STOPs as gaps). How far each press was from its
//   step is kept, for the timing figures a calibration needs.
// - Holds: a press held for `holdMinMs` or longer becomes a hold to its
//   snapped release; shorter is a tap. ScratchMix takes taps only.
// - Clashes: a note where the lane already has one (or inside a hold) is
//   skipped and counted - a take never overwrites; a hold that would swallow
//   a note is shortened to a tap first.
// - Classic songs (the owner's choice, M7): a press keys the background
//   sound playing there - a note already in the background at that spot, or
//   a split of a sound playing through - so the music stays the same. Only
//   background sounds are taken (never another lane's keying), each checked
//   by classicKey, and a press with nothing to key is counted as silent.
//   Other songs get a note with the brush sound.

import type { ChannelId, NoteId, NoteRec } from '../model/types';
import { snapNearest } from '../timing/snap';
import type { PlanTimeline } from '../timing/plan-timeline';
import { classicKey, recordCandidates, type ClassicEnv } from './classic';
import { BGM, placementConflict } from './commands';
import type { ChartDoc } from './doc';

/** One press: its lane and its song times (ms). `upMs` absent: still held when the take stopped. */
export interface TakePress {
  x: number;
  downMs: number;
  upMs?: number;
}

export interface TakeNote {
  x: number;
  y: number;
  l: number;
  /** The press's time minus its step's: negative early, positive late. */
  offsetMs: number;
}

export interface SnapOptions {
  /** The grid step, in pulses. */
  step: number;
  holds: boolean;
  holdMinMs: number;
  /** Presses before this pulse (the count-in) are dropped. */
  fromPulse?: number;
}

export function snapTake(
  presses: readonly TakePress[],
  timeline: PlanTimeline,
  o: SnapOptions,
): TakeNote[] {
  const out: TakeNote[] = [];
  const seen = new Set<string>();
  for (const p of [...presses].sort((a, b) => a.downMs - b.downMs)) {
    const y = snapNearest(timeline.pulseAt(p.downMs), o.step);
    if (y < (o.fromPulse ?? 0)) continue;
    // Two presses snapping onto one step of a lane are one note.
    const key = `${p.x}:${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let l = 0;
    if (o.holds && p.upMs !== undefined && p.upMs - p.downMs >= o.holdMinMs)
      l = Math.max(0, snapNearest(timeline.pulseAt(p.upMs), o.step) - y);
    out.push({ x: p.x, y, l, offsetMs: p.downMs - timeline.msAt(y) });
  }
  return out;
}

export interface TakeStats {
  count: number;
  meanMs: number;
  medianMs: number;
  early: number;
  late: number;
}

/** How the take sat against the grid: what a latency calibration wants to know. */
export function takeStats(notes: readonly TakeNote[]): TakeStats {
  const offs = notes.map((n) => n.offsetMs).sort((a, b) => a - b);
  const n = offs.length;
  const mid = n >> 1;
  return {
    count: n,
    meanMs: n ? offs.reduce((a, b) => a + b, 0) / n : 0,
    medianMs: n ? (n % 2 ? offs[mid]! : (offs[mid - 1]! + offs[mid]!) / 2) : 0,
    early: offs.filter((o) => o < 0).length,
    late: offs.filter((o) => o > 0).length,
  };
}

export type TakeState = 'ok' | 'clash' | 'silent';

export type TakeTarget = { brush: ChannelId } | { classic: ClassicEnv };

/**
 * What each note would become, cheaply (for the review): a clash with the
 * chart or an earlier note of the take, nothing to key (Classic), or fine.
 * Whether a Classic keying keeps the sound is only known when it is applied.
 */
export function previewTake(
  doc: ChartDoc,
  notes: readonly TakeNote[],
  target: TakeTarget,
): TakeState[] {
  const taken = new Map<number, [number, number][]>();
  const overlaps = (x: number, y: number, l: number) =>
    (taken.get(x) ?? []).some(([a, b]) => y <= b && y + l >= a);
  return notes.map((n) => {
    let l = n.l;
    if (overlaps(n.x, n.y, l) || placementConflict(doc, n.x, n.y, l)) {
      l = 0;
      if (overlaps(n.x, n.y, 0) || placementConflict(doc, n.x, n.y, 0)) return 'clash';
    }
    if ('classic' in target && !recordCandidates(doc, n.x, n.y, l, target.classic).length)
      return 'silent';
    (taken.get(n.x) ?? taken.set(n.x, []).get(n.x)!).push([n.y, n.y + l]);
    return 'ok';
  });
}

export interface TakeResult {
  placed: number;
  /** Where the lane already had a note. */
  clash: number;
  /** Classic: nothing sounding there to key. */
  silent: number;
  /** Classic: every sound there would have sounded different keyed. */
  refused: number;
  /** Holds made taps, because the hold would have swallowed a note. */
  shortened: number;
  /** The notes placed or keyed. */
  ids: NoteId[];
  /** Classic: continuation notes the take inserted (splits it made, which un-keying heals). */
  splits: NoteId[];
}

/** Apply a take to the chart as one undo step labelled `label`, and select what it placed. */
export function applyTake(
  doc: ChartDoc,
  notes: readonly TakeNote[],
  target: TakeTarget,
  label = 'Record take',
): TakeResult {
  const r: TakeResult = {
    placed: 0,
    clash: 0,
    silent: 0,
    refused: 0,
    shortened: 0,
    ids: [],
    splits: [],
  };
  const ordered = [...notes].sort((a, b) => a.y - b.y || a.x - b.x);
  if ('brush' in target) {
    // One transaction: it applies as it goes, so each placement sees the last.
    doc.transact(label, (tx) => {
      for (const n of ordered) {
        if (n.x === BGM) continue;
        let l = n.l;
        if (placementConflict(doc, n.x, n.y, l)) {
          if (!l || placementConflict(doc, n.x, n.y, 0)) {
            r.clash++;
            continue;
          }
          l = 0;
          r.shortened++;
        }
        const rec: NoteRec = { id: doc.newNoteId(), ch: target.brush, x: n.x, y: n.y, l, c: false };
        r.ids.push(tx.insertNotes([rec])[0]!.id);
        r.placed++;
      }
      tx.select(r.ids);
    });
    return r;
  }
  // Classic: each keying is its own checked transaction - it reads the chart as
  // the last one left it - grouped into one undo step.
  const env = target.classic;
  doc.group(label, () => {
    for (const n of ordered) {
      if (n.x === BGM) continue;
      const tryKey = (l: number): 'ok' | 'clash' | 'silent' | 'refused' => {
        if (placementConflict(doc, n.x, n.y, l)) return 'clash';
        const cands = recordCandidates(doc, n.x, n.y, l, env).slice(0, 3);
        if (!cands.length) return 'silent';
        for (const cand of cands) {
          const k = classicKey(doc, n.x, n.y, l, cand, env);
          if (k.ok && k.id !== undefined) {
            r.ids.push(k.id);
            if (cand.kind === 'split') r.splits.push(k.id);
            return 'ok';
          }
        }
        return 'refused';
      };
      let got = tryKey(n.l);
      if (got !== 'ok' && n.l > 0) {
        const tap = tryKey(0);
        if (tap === 'ok') r.shortened++;
        if (tap === 'ok' || got === 'clash') got = tap;
      }
      if (got === 'ok') r.placed++;
      else r[got]++;
    }
  });
  if (r.ids.length) doc.setSelection(r.ids);
  return r;
}
