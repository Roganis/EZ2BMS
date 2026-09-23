// The editing vocabulary: every change the editor can make to a chart, each a
// single undoable transaction. UI code (mouse tools, keyboard commands, the
// palette, the inspector) calls these and nothing lower.
//
// Placement rules for playable lanes (x != 0): one note per lane per pulse,
// and no note may start inside a hold on the same lane (nor a hold swallow a
// later note) - the engine would judge such a pair unpredictably. Background
// (x 0) is unlimited. A command that would break a rule changes nothing and
// returns false/undefined, so a drag simply stops at the obstacle.

import type { ChannelId, NoteId, NoteRec, SoundChannel } from '../model/types';
import { columnOf, type ModeDef } from '../modes/registry';
import type { ChartDoc, NotePatch } from './doc';

export const BGM = 0;

// ---- rules ------------------------------------------------------------------

/** Why a note cannot go at (x, y, l), or undefined when it can. */
export function placementConflict(
  doc: ChartDoc,
  x: number,
  y: number,
  l: number,
  ignore: ReadonlySet<NoteId> = new Set(),
): string | undefined {
  if (x === BGM) return undefined;
  if (y < 0) return 'before the start of the chart';
  for (const n of doc.index.at(x, y)) if (!ignore.has(n.id)) return 'a note is already there';
  const cover = doc.index.holdCovering(x, y);
  if (cover && !ignore.has(cover.id)) return 'inside a hold';
  if (l > 0) {
    for (const n of doc.index.inRange(x, y + 1, y + l)) {
      if (!ignore.has(n.id) && n.y > y && n.y <= y + l) return 'the hold would cover another note';
    }
  }
  return undefined;
}

/** Check a whole moved set against the rest of the chart and against itself. */
export function movedConflict(
  doc: ChartDoc,
  moved: { id: NoteId; x: number; y: number; l: number }[],
): boolean {
  const ignore = new Set(moved.map((m) => m.id));
  const seen = new Map<number, { y: number; l: number }[]>();
  for (const m of moved) {
    if (m.y < 0) return true;
    if (m.x === BGM) continue;
    if (placementConflict(doc, m.x, m.y, m.l, ignore)) return true;
    const list = seen.get(m.x) ?? [];
    for (const o of list) {
      if (o.y === m.y) return true;
      if (o.l > 0 && m.y > o.y && m.y <= o.y + o.l) return true;
      if (m.l > 0 && o.y > m.y && o.y <= m.y + m.l) return true;
    }
    list.push({ y: m.y, l: m.l });
    seen.set(m.x, list);
  }
  return false;
}

// ---- notes -----------------------------------------------------------------

export interface PlaceSpec {
  x: number;
  y: number;
  ch: ChannelId;
  l?: number;
  c?: boolean;
  vel?: number;
  pan?: number;
  kind?: number;
}

/** Place one note. Returns its id, or undefined when the lane rules refuse it. */
export function placeNote(doc: ChartDoc, spec: PlaceSpec, select = true): NoteId | undefined {
  const l = Math.max(0, spec.l ?? 0);
  if (placementConflict(doc, spec.x, spec.y, l)) return undefined;
  if (!doc.channel(spec.ch)) throw new Error(`no channel ${spec.ch}`);
  return doc.transact('Place note', (tx) => {
    const rec: NoteRec = {
      id: doc.newNoteId(),
      ch: spec.ch,
      x: spec.x,
      y: spec.y,
      l,
      c: spec.c ?? false,
    };
    if (spec.vel !== undefined) rec.vel = spec.vel;
    if (spec.pan !== undefined) rec.pan = spec.pan;
    if (spec.kind !== undefined) rec.kind = spec.kind;
    tx.insertNotes([rec]);
    if (select) tx.select([rec.id], rec.id);
    return rec.id;
  });
}

export function eraseNotes(doc: ChartDoc, ids: Iterable<NoteId>): number {
  const list = [...ids].filter((id) => doc.index.has(id));
  if (!list.length) return 0;
  doc.transact(list.length === 1 ? 'Erase note' : `Erase ${list.length} notes`, (tx) =>
    tx.deleteNotes(list),
  );
  return list.length;
}

export interface MoveSpec {
  /** Pulses to move by. */
  dy?: number;
  /** New lane for a note, from its current lane (identity when absent). */
  mapX?: (x: number, note: NoteRec) => number;
}

/** Move notes in time and/or across lanes, all or nothing. */
export function moveNotes(
  doc: ChartDoc,
  ids: Iterable<NoteId>,
  spec: MoveSpec,
  label = 'Move notes',
): boolean {
  const notes = [...ids].map((id) => doc.index.get(id)).filter((n): n is NoteRec => !!n);
  if (!notes.length) return false;
  const dy = spec.dy ?? 0;
  const moved = notes.map((n) => ({
    id: n.id,
    x: spec.mapX ? spec.mapX(n.x, n) : n.x,
    y: n.y + dy,
    l: n.l,
  }));
  if (movedConflict(doc, moved)) return false;
  doc.transact(label, (tx) =>
    tx.patchNotes(moved.map((m) => ({ id: m.id, patch: { x: m.x, y: m.y } }))),
  );
  return true;
}

/**
 * Shift notes by `delta` columns in a mode (Alt+Left/Right). Works across any
 * number of lanes; background notes stay put. Refused when a note would leave
 * the mode's columns.
 */
export function shiftColumns(
  doc: ChartDoc,
  ids: Iterable<NoteId>,
  mode: ModeDef,
  delta: number,
): boolean {
  let ok = true;
  const res = moveNotes(
    doc,
    ids,
    {
      mapX: (x) => {
        if (x === BGM) return x;
        const col = columnOf(mode, x);
        const target = col ? mode.columns[col.index + delta] : undefined;
        if (!target) ok = false;
        return target?.x ?? x;
      },
    },
    'Shift lanes',
  );
  return ok && res;
}

/** Send notes to background (x 0) or bring them onto a lane. */
export function setLane(doc: ChartDoc, ids: Iterable<NoteId>, x: number): boolean {
  return moveNotes(doc, ids, { mapX: () => x }, x === BGM ? 'Move to background' : 'Move to lane');
}

export function setLength(
  doc: ChartDoc,
  ids: Iterable<NoteId>,
  l: number,
  merge?: string,
): boolean {
  const notes = [...ids].map((id) => doc.index.get(id)).filter((n): n is NoteRec => !!n);
  const len = Math.max(0, Math.round(l));
  const ignore = new Set(notes.map((n) => n.id));
  for (const n of notes) if (placementConflict(doc, n.x, n.y, len, ignore)) return false;
  doc.transact(
    'Set length',
    (tx) => tx.patchNotes(notes.map((n) => ({ id: n.id, patch: { l: len } }))),
    {
      ...(merge ? { merge } : {}),
    },
  );
  return true;
}

/** Taps become holds of `len` pulses; holds become taps. */
export function toggleHold(doc: ChartDoc, ids: Iterable<NoteId>, len: number): boolean {
  const notes = [...ids].map((id) => doc.index.get(id)).filter((n): n is NoteRec => !!n);
  if (!notes.length) return false;
  const makeHolds = notes.some((n) => n.l === 0);
  const ignore = new Set(notes.map((n) => n.id));
  const changes: { id: NoteId; patch: NotePatch }[] = [];
  for (const n of notes) {
    const l = makeHolds ? (n.l > 0 ? n.l : len) : 0;
    if (placementConflict(doc, n.x, n.y, l, ignore)) return false;
    changes.push({ id: n.id, patch: { l } });
  }
  doc.transact(makeHolds ? 'Make holds' : 'Make taps', (tx) => tx.patchNotes(changes));
  return true;
}

/**
 * EZ2 hold kinds and what they pay while held (EZ2PORT ez2/score.h): the
 * instalment step, or none. 0 is what every shipped chart uses.
 */
export const HOLD_KINDS: readonly { kind: number; label: string }[] = [
  { kind: 0, label: '1/4 beat (default)' },
  { kind: 1, label: '1/2 beat' },
  { kind: 2, label: '1/8 beat' },
  { kind: 3, label: '1/16 beat' },
  { kind: 4, label: 'once' },
  { kind: 7, label: 'no instalments' },
];

export function setHoldKind(doc: ChartDoc, ids: Iterable<NoteId>, kind: number | undefined): void {
  const list = [...ids].filter((id) => doc.index.has(id));
  doc.transact('Set hold kind', (tx) =>
    tx.patchNotes(list.map((id) => ({ id, patch: { kind: kind === 0 ? undefined : kind } }))),
  );
}

export function cycleHoldKind(doc: ChartDoc, ids: Iterable<NoteId>): void {
  const list = [...ids].map((id) => doc.index.get(id)).filter((n): n is NoteRec => !!n);
  if (!list.length) return;
  const cur = HOLD_KINDS.findIndex((k) => k.kind === (list[0]!.kind ?? 0));
  const next = HOLD_KINDS[(cur + 1) % HOLD_KINDS.length]!.kind;
  setHoldKind(
    doc,
    list.map((n) => n.id),
    next,
  );
}

export function setVelPan(
  doc: ChartDoc,
  ids: Iterable<NoteId>,
  v: { vel?: number; pan?: number },
  merge?: string,
): void {
  const list = [...ids].filter((id) => doc.index.has(id));
  const patch: NotePatch = {};
  if ('vel' in v) patch.vel = v.vel === 127 ? undefined : v.vel;
  if ('pan' in v) patch.pan = v.pan === 64 ? undefined : v.pan;
  doc.transact('Set velocity/pan', (tx) => tx.patchNotes(list.map((id) => ({ id, patch }))), {
    ...(merge ? { merge } : {}),
  });
}

/** Mirror keys inside each five-key bank (1<->5, 2<->4). Turntables, pedals and effectors stay. */
export function mirrorKeys(doc: ChartDoc, ids: Iterable<NoteId>): boolean {
  return moveNotes(
    doc,
    ids,
    {
      mapX: (x) => {
        if (x >= 11 && x <= 15) return 26 - x;
        if (x >= 21 && x <= 25) return 46 - x;
        return x;
      },
    },
    'Mirror',
  );
}

const SIDE_SWAP: Record<number, number> = {
  1: 2,
  2: 1,
  10: 20,
  20: 10,
  31: 33,
  33: 31,
  32: 34,
  34: 32,
};

/** Swap the 1P and 2P sides (keys, turntables, pedals, effector pairs). */
export function swapSides(doc: ChartDoc, ids: Iterable<NoteId>): boolean {
  return moveNotes(
    doc,
    ids,
    {
      mapX: (x) => {
        if (x >= 11 && x <= 15) return x + 10;
        if (x >= 21 && x <= 25) return x - 10;
        return SIDE_SWAP[x] ?? x;
      },
    },
    'Swap sides',
  );
}

// ---- timing ----------------------------------------------------------------

/** Set (or with `null` remove) the BPM change at y. A change at y = 0 sets init_bpm instead. */
export function setBpmAt(doc: ChartDoc, y: number, bpm: number | null): void {
  if (bpm !== null && !(bpm > 0 && Number.isFinite(bpm))) throw new Error('BPM must be positive');
  doc.transact(bpm === null ? 'Remove BPM change' : 'Set BPM', (tx) => {
    if (y <= 0 && bpm !== null) {
      tx.setInfo({ initBpm: bpm });
      if (doc.data.bpmEvents.some((e) => e.y === 0)) {
        tx.setBpmEvents(doc.data.bpmEvents.filter((e) => e.y !== 0));
      }
      return;
    }
    const rest = doc.data.bpmEvents.filter((e) => e.y !== y);
    tx.setBpmEvents(bpm === null ? rest : [...rest, { y, bpm }]);
  });
}

/** Set (or with `null` remove) the STOP at y, `duration` pulses long. */
export function setStopAt(doc: ChartDoc, y: number, duration: number | null): void {
  doc.transact(duration === null ? 'Remove STOP' : 'Set STOP', (tx) => {
    const rest = doc.data.stopEvents.filter((e) => e.y !== y);
    tx.setStopEvents(duration === null || duration <= 0 ? rest : [...rest, { y, duration }]);
  });
}

// ---- channels ----------------------------------------------------------------

export function addChannel(doc: ChartDoc, name: string): SoundChannel {
  return doc.transact('Add sound', (tx) => tx.insertChannel({ name }));
}

/** Add many sounds in one undo step (a folder drop). */
export function addChannels(doc: ChartDoc, names: string[]): SoundChannel[] {
  return doc.transact(`Add ${names.length} sound${names.length === 1 ? '' : 's'}`, (tx) =>
    names.map((name) => tx.insertChannel({ name })),
  );
}

export function removeChannel(doc: ChartDoc, id: ChannelId): void {
  doc.transact('Remove sound', (tx) => tx.deleteChannel(id));
}

export function renameChannel(doc: ChartDoc, id: ChannelId, name: string): void {
  doc.transact('Rename sound', (tx) => tx.patchChannel(id, { name }));
}

/**
 * Point these channels at another sound file (the workbench's Replace). It is
 * a musical edit - the notes now play something else - so it is one undo
 * step. Returns how many channels changed; no step when none did.
 */
export function replaceSound(doc: ChartDoc, ids: Iterable<ChannelId>, name: string): number {
  const list = [...new Set(ids)].filter((id) => {
    const c = doc.channel(id);
    return c && c.name !== name;
  });
  if (!list.length) return 0;
  doc.transact('Replace sound', (tx) => {
    for (const id of list) tx.patchChannel(id, { name });
  });
  return list.length;
}

/** Remove channels that play no note, in one undo step. Returns how many went. */
export function removeUnusedChannels(doc: ChartDoc, ids?: Iterable<ChannelId>): ChannelId[] {
  const want = ids ? new Set(ids) : undefined;
  const gone = doc.data.channels
    .filter((c) => (!want || want.has(c.id)) && doc.index.channel(c.id).length === 0)
    .map((c) => c.id);
  if (gone.length)
    doc.transact(`Remove ${gone.length} unused sound${gone.length === 1 ? '' : 's'}`, (tx) => {
      for (const id of gone) tx.deleteChannel(id);
    });
  return gone;
}

/** Re-assign notes to another sound (the brush). */
export function setChannel(doc: ChartDoc, ids: Iterable<NoteId>, ch: ChannelId): void {
  if (!doc.channel(ch)) throw new Error(`no channel ${ch}`);
  const list = [...ids].filter((id) => doc.index.has(id));
  doc.transact('Change sound', (tx) => tx.patchNotes(list.map((id) => ({ id, patch: { ch } }))));
}

// ---- clipboard ---------------------------------------------------------------

export interface ClipNote {
  dy: number;
  x: number;
  /** Column index in the source mode, so a paste into another mode lands sensibly. */
  col?: number;
  l: number;
  c: boolean;
  ch: ChannelId;
  chName: string;
  vel?: number;
  pan?: number;
  kind?: number;
}

export interface Clip {
  resolution: number;
  mode?: string;
  notes: ClipNote[];
}

export function copyNotes(doc: ChartDoc, ids: Iterable<NoteId>, mode?: ModeDef): Clip | undefined {
  const notes = [...ids].map((id) => doc.index.get(id)).filter((n): n is NoteRec => !!n);
  if (!notes.length) return undefined;
  const y0 = Math.min(...notes.map((n) => n.y));
  const clip: Clip = {
    resolution: doc.resolution,
    notes: notes.map((n) => {
      const c: ClipNote = {
        dy: n.y - y0,
        x: n.x,
        l: n.l,
        c: n.c,
        ch: n.ch,
        chName: doc.channel(n.ch)?.name ?? '',
      };
      const col = mode ? columnOf(mode, n.x) : undefined;
      if (col) c.col = col.index;
      if (n.vel !== undefined) c.vel = n.vel;
      if (n.pan !== undefined) c.pan = n.pan;
      if (n.kind !== undefined) c.kind = n.kind;
      return c;
    }),
  };
  if (mode) clip.mode = mode.id;
  return clip;
}

/**
 * Paste at `y`. Sounds are matched by channel id, then by file name, then
 * created. Into a different mode, lanes follow the column index; a column the
 * target lacks becomes background. Returns the new ids, or undefined if the
 * lane rules refuse the paste.
 */
export function pasteNotes(
  doc: ChartDoc,
  clip: Clip,
  y: number,
  mode?: ModeDef,
): NoteId[] | undefined {
  const scale = doc.resolution / clip.resolution;
  // Keep the lane when the target mode has it; else the same column position;
  // else background.
  const mapX = (n: ClipNote): number => {
    if (n.x === BGM || !mode || columnOf(mode, n.x)) return n.x;
    return n.col !== undefined ? (mode.columns[n.col]?.x ?? BGM) : BGM;
  };
  const placed = clip.notes.map((n) => ({
    id: -1,
    x: mapX(n),
    y: y + Math.round(n.dy * scale),
    l: Math.round(n.l * scale),
  }));
  if (movedConflict(doc, placed)) return undefined;
  return doc.transact('Paste', (tx) => {
    const byName = new Map(doc.data.channels.map((c) => [c.name, c.id]));
    const chFor = (n: ClipNote): ChannelId => {
      if (doc.channel(n.ch)?.name === n.chName) return n.ch;
      const found = byName.get(n.chName);
      if (found !== undefined) return found;
      const created = tx.insertChannel({ name: n.chName });
      byName.set(n.chName, created.id);
      return created.id;
    };
    const recs: NoteRec[] = clip.notes.map((n, i) => {
      const p = placed[i]!;
      const rec: NoteRec = { id: doc.newNoteId(), ch: chFor(n), x: p.x, y: p.y, l: p.l, c: n.c };
      if (n.vel !== undefined) rec.vel = n.vel;
      if (n.pan !== undefined) rec.pan = n.pan;
      if (n.kind !== undefined) rec.kind = n.kind;
      return rec;
    });
    tx.insertNotes(recs);
    tx.select(recs.map((r) => r.id));
    return recs.map((r) => r.id);
  });
}
