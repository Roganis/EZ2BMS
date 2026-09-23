// ChartDoc: one chart being edited - its data, its index, its selection and
// its undo history.
//
// Every change is a list of primitive operations with pure inverses, applied
// inside a transaction: `doc.transact('Move notes', (tx) => ...)`. Each tx
// call applies immediately (later steps see the new state) and is recorded;
// if the function throws, everything it did is rolled back. A drag is an open
// draft whose operations are replaced on every mouse move and committed (or
// cancelled) once. Undo restores the selection too, but selection changes on
// their own are not history.
//
// Listeners get a ChangeSet saying what moved (lanes, channels, a pulse range,
// timing, info...), which is what lets the renderer, the audio plan and lint
// update only what changed.

import type {
  BarLine,
  BgaData,
  BpmEvent,
  ChannelId,
  ChartData,
  ChartInfo,
  NoteId,
  NoteRec,
  SoundChannel,
  StopEvent,
} from '../model/types';
import { NoteIndex } from './note-index';

/** Fields of a note an edit may change. A key present with `undefined` removes an optional field. */
export type NotePatch = Partial<
  Pick<NoteRec, 'x' | 'y' | 'l' | 'c' | 'ch' | 'vel' | 'pan' | 'kind' | 'up' | 'xStop'>
>;
export type ChannelPatch = Partial<Pick<SoundChannel, 'name' | 'color'>>;
type InfoPatch = Partial<Omit<ChartInfo, 'extra'>>;

export type Op =
  | { t: 'notes+'; notes: NoteRec[] }
  | { t: 'notes-'; notes: NoteRec[] }
  | { t: 'notes~'; ids: NoteId[]; before: NotePatch[]; after: NotePatch[] }
  | { t: 'ch+'; ch: SoundChannel; index: number }
  | { t: 'ch-'; ch: SoundChannel; index: number }
  | { t: 'ch~'; id: ChannelId; before: ChannelPatch; after: ChannelPatch }
  | { t: 'bpm'; before: BpmEvent[]; after: BpmEvent[] }
  | { t: 'stop'; before: StopEvent[]; after: StopEvent[] }
  | { t: 'lines'; before: BarLine[] | null; after: BarLine[] | null }
  | { t: 'info'; before: InfoPatch; after: InfoPatch }
  | { t: 'bga'; before: BgaData | null; after: BgaData | null };

export function invert(op: Op): Op {
  switch (op.t) {
    case 'notes+':
      return { t: 'notes-', notes: op.notes };
    case 'notes-':
      return { t: 'notes+', notes: op.notes };
    case 'notes~':
      return { t: 'notes~', ids: op.ids, before: op.after, after: op.before };
    case 'ch+':
      return { t: 'ch-', ch: op.ch, index: op.index };
    case 'ch-':
      return { t: 'ch+', ch: op.ch, index: op.index };
    case 'ch~':
      return { t: 'ch~', id: op.id, before: op.after, after: op.before };
    case 'bpm':
    case 'stop':
    case 'lines':
    case 'info':
    case 'bga':
      return { ...op, before: op.after, after: op.before } as Op;
  }
}

export interface ChangeSet {
  /** Lanes (bmson x) whose notes changed. */
  lanes: Set<number>;
  /** Channels whose notes or properties changed. */
  channels: Set<ChannelId>;
  /** Pulse range touched by note changes ([Infinity, -Infinity] when none). */
  y0: number;
  y1: number;
  /** The channel list itself changed (added/removed/reordered). */
  channelList: boolean;
  timing: boolean;
  info: boolean;
  bga: boolean;
  lines: boolean;
  selection: boolean;
}

export function emptyChangeSet(): ChangeSet {
  return {
    lanes: new Set(),
    channels: new Set(),
    y0: Infinity,
    y1: -Infinity,
    channelList: false,
    timing: false,
    info: false,
    bga: false,
    lines: false,
    selection: false,
  };
}

function touchNote(cs: ChangeSet, n: { x: number; y: number; l: number; ch: ChannelId }): void {
  cs.lanes.add(n.x);
  cs.channels.add(n.ch);
  cs.y0 = Math.min(cs.y0, n.y);
  cs.y1 = Math.max(cs.y1, n.y + Math.max(0, n.l));
}

const cloneNote = (n: NoteRec): NoteRec => ({
  ...n,
  ...(n.extra ? { extra: { ...n.extra } } : {}),
});

export interface Selection {
  readonly ids: ReadonlySet<NoteId>;
  readonly anchor?: NoteId;
}

const EMPTY_SELECTION: Selection = { ids: new Set() };

interface Entry {
  label: string;
  ops: Op[];
  selBefore: Selection;
  selAfter: Selection;
  time: number;
  mergeKey?: string;
}

export interface TransactOptions {
  /** Consecutive transactions with the same key within 500 ms merge into one undo step. */
  merge?: string;
}

const MERGE_MS = 500;
const HISTORY_LIMIT = 2000;

export class ChartDoc {
  readonly data: ChartData;
  readonly index: NoteIndex;
  private undoStack: Entry[] = [];
  private redoStack: Entry[] = [];
  /** The undo entry the file was last saved at (null = the initial state). */
  private savedAt: Entry | null = null;
  private savedAtLost = false;
  private _selection: Selection = EMPTY_SELECTION;
  private nextNote: number;
  private nextChannel: number;
  private listeners = new Set<(cs: ChangeSet) => void>();
  private open: { ops: Op[]; cs: ChangeSet } | null = null;
  /** Bumped on every applied change; cheap "did anything happen" check for UIs. */
  version = 0;

  constructor(data: ChartData) {
    this.data = data;
    this.index = new NoteIndex(data.notes);
    this.nextNote = data.notes.reduce((m, n) => Math.max(m, n.id), 0) + 1;
    this.nextChannel = data.channels.reduce((m, c) => Math.max(m, c.id), 0) + 1;
  }

  // ---- ids, queries ----------------------------------------------------------

  newNoteId(): NoteId {
    return this.nextNote++;
  }

  newChannelId(): ChannelId {
    return this.nextChannel++;
  }

  /** The id the next newNoteId() will return, without taking it (for dry runs). */
  peekNoteId(): NoteId {
    return this.nextNote;
  }

  channel(id: ChannelId): SoundChannel | undefined {
    return this.data.channels.find((c) => c.id === id);
  }

  get resolution(): number {
    const r = this.data.info.resolution;
    return r && r > 0 ? r : 240;
  }

  // ---- selection -------------------------------------------------------------

  get selection(): Selection {
    return this._selection;
  }

  setSelection(ids: Iterable<NoteId>, anchor?: NoteId): void {
    const set = new Set([...ids].filter((id) => this.index.has(id)));
    this._selection = anchor !== undefined && set.has(anchor) ? { ids: set, anchor } : { ids: set };
    const cs = emptyChangeSet();
    cs.selection = true;
    this.emit(cs);
  }

  /** @internal Set the selection without an event; used inside transactions. */
  setSelectionSilently(ids: Iterable<NoteId>, anchor?: NoteId): void {
    const set = new Set([...ids].filter((id) => this.index.has(id)));
    this._selection = anchor !== undefined && set.has(anchor) ? { ids: set, anchor } : { ids: set };
  }

  selectedNotes(): NoteRec[] {
    return [...this._selection.ids].map((id) => this.index.get(id)!).filter(Boolean);
  }

  // ---- change notification ---------------------------------------------------

  onChange(fn: (cs: ChangeSet) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(cs: ChangeSet): void {
    this.version++;
    for (const fn of this.listeners) fn(cs);
  }

  // ---- transactions ----------------------------------------------------------

  transact<T>(label: string, fn: (tx: Tx) => T, opts: TransactOptions = {}): T {
    if (this.open) throw new Error('a draft is open; commit or cancel it first');
    const selBefore = this._selection;
    const ops: Op[] = [];
    const cs = emptyChangeSet();
    const tx = new Tx(this, ops, cs);
    let result: T;
    try {
      result = fn(tx);
    } catch (e) {
      for (let i = ops.length - 1; i >= 0; i--) this.apply(invert(ops[i]!), emptyChangeSet());
      this._selection = selBefore;
      throw e;
    }
    if (ops.length === 0) return result;
    this.pruneSelection();
    this.record(label, ops, selBefore, opts.merge);
    cs.selection = true;
    this.emit(cs);
    return result;
  }

  /** Open a draft (a drag). Its content is replaced by each `update`, then committed or cancelled. */
  begin(label: string): Draft {
    if (this.open) throw new Error('a draft is already open');
    const draft = { ops: [] as Op[], cs: emptyChangeSet() };
    this.open = draft;
    const selBefore = this._selection;
    const rollback = () => {
      for (let i = draft.ops.length - 1; i >= 0; i--) this.apply(invert(draft.ops[i]!), draft.cs);
      draft.ops.length = 0;
    };
    return {
      update: (fn) => {
        rollback();
        this._selection = selBefore;
        const tx = new Tx(this, draft.ops, draft.cs);
        try {
          fn(tx);
        } catch (e) {
          rollback();
          throw e;
        }
        this.pruneSelection();
        const cs = draft.cs;
        draft.cs = emptyChangeSet();
        cs.selection = true;
        this.emit(cs);
      },
      commit: () => {
        this.open = null;
        if (draft.ops.length) this.record(label, [...draft.ops], selBefore);
      },
      cancel: () => {
        rollback();
        this.open = null;
        this._selection = selBefore;
        const cs = draft.cs;
        cs.selection = true;
        this.emit(cs);
      },
    };
  }

  private record(label: string, ops: Op[], selBefore: Selection, mergeKey?: string): void {
    const now = Date.now();
    const last = this.undoStack[this.undoStack.length - 1];
    if (
      mergeKey &&
      last &&
      last.mergeKey === mergeKey &&
      now - last.time < MERGE_MS &&
      last !== this.savedAt
    ) {
      last.ops.push(...ops);
      last.selAfter = this._selection;
      last.time = now;
    } else {
      const entry: Entry = { label, ops, selBefore, selAfter: this._selection, time: now };
      if (mergeKey) entry.mergeKey = mergeKey;
      this.undoStack.push(entry);
      if (this.undoStack.length > HISTORY_LIMIT) {
        const dropped = this.undoStack.shift();
        if (dropped === this.savedAt) this.savedAtLost = true;
      }
    }
    this.redoStack = [];
  }

  private pruneSelection(): void {
    const ids = [...this._selection.ids].filter((id) => this.index.has(id));
    if (ids.length !== this._selection.ids.size) {
      const anchor = this._selection.anchor;
      this._selection =
        anchor !== undefined && this.index.has(anchor)
          ? { ids: new Set(ids), anchor }
          : { ids: new Set(ids) };
    }
  }

  // ---- history -----------------------------------------------------------------

  get canUndo(): boolean {
    return this.undoStack.length > 0 && !this.open;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0 && !this.open;
  }

  get undoLabel(): string | undefined {
    return this.undoStack[this.undoStack.length - 1]?.label;
  }

  get redoLabel(): string | undefined {
    return this.redoStack[this.redoStack.length - 1]?.label;
  }

  undo(): boolean {
    if (!this.canUndo) return false;
    const e = this.undoStack.pop()!;
    const cs = emptyChangeSet();
    for (let i = e.ops.length - 1; i >= 0; i--) this.apply(invert(e.ops[i]!), cs);
    this._selection = e.selBefore;
    this.redoStack.push(e);
    cs.selection = true;
    this.emit(cs);
    return true;
  }

  redo(): boolean {
    if (!this.canRedo) return false;
    const e = this.redoStack.pop()!;
    const cs = emptyChangeSet();
    for (const op of e.ops) this.apply(op, cs);
    this._selection = e.selAfter;
    this.undoStack.push(e);
    cs.selection = true;
    this.emit(cs);
    return true;
  }

  get dirty(): boolean {
    if (this.savedAtLost) return true;
    const top = this.undoStack[this.undoStack.length - 1] ?? null;
    return top !== this.savedAt;
  }

  markSaved(): void {
    this.savedAt = this.undoStack[this.undoStack.length - 1] ?? null;
    this.savedAtLost = false;
  }

  /** Something that changes whenever the top of the undo history does (compare with ===). */
  historyMark(): unknown {
    return this.undoStack[this.undoStack.length - 1] ?? null;
  }

  /**
   * A sound file was renamed on disk: rename every reference to it - the
   * channels, the preview, AND the undo/redo history - without recording an
   * edit, so undoing can never bring back a name that no longer exists.
   * `renames` maps names exactly as the chart spells them to their new names.
   * The chart now differs from its file, so it counts as unsaved.
   */
  renameSoundRefs(renames: ReadonlyMap<string, string>): boolean {
    const cs = emptyChangeSet();
    const swap = (name: string | undefined) => (name === undefined ? name : renames.get(name));
    for (const c of this.data.channels) {
      const to = swap(c.name);
      if (to !== undefined && to !== c.name) {
        c.name = to;
        cs.channels.add(c.id);
      }
    }
    const preview = swap(this.data.info.previewMusic);
    if (preview !== undefined && preview !== this.data.info.previewMusic) {
      this.data.info.previewMusic = preview;
      cs.info = true;
    }
    const patch = (p: ChannelPatch | InfoPatch) => {
      const r = p as { name?: string; previewMusic?: string };
      const n = swap(r.name);
      if (n !== undefined) r.name = n;
      const m = swap(r.previewMusic);
      if (m !== undefined) r.previewMusic = m;
    };
    for (const e of [...this.undoStack, ...this.redoStack]) {
      for (const op of e.ops) {
        if (op.t === 'ch+' || op.t === 'ch-') {
          const n = swap(op.ch.name);
          if (n !== undefined) op.ch = { ...op.ch, name: n };
        } else if (op.t === 'ch~' || op.t === 'info') {
          patch(op.before);
          patch(op.after);
        }
      }
    }
    if (!cs.channels.size && !cs.info) return false;
    this.savedAtLost = true;
    this.emit(cs);
    return true;
  }

  // ---- applying one operation --------------------------------------------------

  /** @internal Apply a primitive op to the data and index, recording what changed. */
  apply(op: Op, cs: ChangeSet): void {
    const d = this.data;
    switch (op.t) {
      case 'notes+': {
        const fresh = op.notes.map(cloneNote);
        for (const n of fresh) {
          if (!d.channels.some((c) => c.id === n.ch)) throw new Error(`no channel ${n.ch}`);
        }
        this.index.insert(fresh);
        for (const n of fresh) d.notes.push(n); // no spread: 50k args overflow the stack
        fresh.forEach((n) => touchNote(cs, n));
        break;
      }
      case 'notes-': {
        const live = op.notes.map((n) => {
          const cur = this.index.get(n.id);
          if (!cur) throw new Error(`note ${n.id} is not in the chart`);
          return cur;
        });
        this.index.remove(live);
        const gone = new Set(live.map((n) => n.id));
        const kept = d.notes.filter((n) => !gone.has(n.id));
        d.notes.length = 0;
        d.notes.push(...kept);
        live.forEach((n) => touchNote(cs, n));
        break;
      }
      case 'notes~': {
        op.ids.forEach((id, i) => {
          const n = this.index.get(id);
          if (!n) throw new Error(`note ${id} is not in the chart`);
          touchNote(cs, n);
          this.index.refileBegin(n);
          const patch = op.after[i]!;
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined) delete (n as unknown as Record<string, unknown>)[k];
            else (n as unknown as Record<string, unknown>)[k] = v;
          }
          this.index.refileEnd(n);
          touchNote(cs, n);
        });
        break;
      }
      case 'ch+':
        if (d.channels.some((c) => c.id === op.ch.id))
          throw new Error(`channel ${op.ch.id} exists`);
        d.channels.splice(Math.min(op.index, d.channels.length), 0, { ...op.ch });
        cs.channelList = true;
        cs.channels.add(op.ch.id);
        break;
      case 'ch-': {
        const i = d.channels.findIndex((c) => c.id === op.ch.id);
        if (i < 0) throw new Error(`no channel ${op.ch.id}`);
        if (this.index.channel(op.ch.id).length)
          throw new Error(`channel ${op.ch.id} still has notes`);
        d.channels.splice(i, 1);
        cs.channelList = true;
        cs.channels.add(op.ch.id);
        break;
      }
      case 'ch~': {
        const c = d.channels.find((x) => x.id === op.id);
        if (!c) throw new Error(`no channel ${op.id}`);
        for (const [k, v] of Object.entries(op.after)) {
          if (v === undefined) delete (c as unknown as Record<string, unknown>)[k];
          else (c as unknown as Record<string, unknown>)[k] = v;
        }
        cs.channels.add(op.id);
        break;
      }
      case 'bpm':
        d.bpmEvents = op.after.map((e) => ({ ...e }));
        cs.timing = true;
        break;
      case 'stop':
        d.stopEvents = op.after.map((e) => ({ ...e }));
        cs.timing = true;
        break;
      case 'lines':
        d.lines = op.after && op.after.map((e) => ({ ...e }));
        cs.lines = true;
        break;
      case 'info': {
        const info = d.info as unknown as Record<string, unknown>;
        for (const [k, v] of Object.entries(op.after)) {
          if (v === undefined) delete info[k];
          else info[k] = structuredClone(v);
        }
        cs.info = true;
        if ('resolution' in op.after || 'initBpm' in op.after) cs.timing = true;
        break;
      }
      case 'bga':
        d.bga = op.after && structuredClone(op.after);
        cs.bga = true;
        break;
    }
  }
}

export interface Draft {
  update(fn: (tx: Tx) => void): void;
  commit(): void;
  cancel(): void;
}

/** The only way to change a ChartDoc. Every method applies immediately and records its inverse. */
export class Tx {
  constructor(
    private readonly doc: ChartDoc,
    private readonly ops: Op[],
    private readonly cs: ChangeSet,
  ) {}

  private run(op: Op): void {
    this.doc.apply(op, this.cs);
    this.ops.push(op);
  }

  get chart(): ChartDoc {
    return this.doc;
  }

  /** Insert notes; each needs a fresh id from doc.newNoteId(). Returns the stored records. */
  insertNotes(notes: NoteRec[]): NoteRec[] {
    if (!notes.length) return [];
    this.run({ t: 'notes+', notes: notes.map(cloneNote) });
    return notes.map((n) => this.doc.index.get(n.id)!);
  }

  deleteNotes(ids: Iterable<NoteId>): void {
    const notes = [...new Set(ids)].map((id) => {
      const n = this.doc.index.get(id);
      if (!n) throw new Error(`note ${id} is not in the chart`);
      return cloneNote(n);
    });
    if (notes.length) this.run({ t: 'notes-', notes });
  }

  /** Change fields of notes. Unchanged fields are dropped from the recorded patch. */
  patchNotes(changes: { id: NoteId; patch: NotePatch }[]): void {
    const ids: NoteId[] = [];
    const before: NotePatch[] = [];
    const after: NotePatch[] = [];
    for (const { id, patch } of changes) {
      const n = this.doc.index.get(id);
      if (!n) throw new Error(`note ${id} is not in the chart`);
      const b: Record<string, unknown> = {};
      const a: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        const cur = (n as unknown as Record<string, unknown>)[k];
        if (cur === v) continue;
        b[k] = cur;
        a[k] = v;
      }
      if (Object.keys(a).length) {
        ids.push(id);
        before.push(b as NotePatch);
        after.push(a as NotePatch);
      }
    }
    if (ids.length) this.run({ t: 'notes~', ids, before, after });
  }

  insertChannel(ch: Omit<SoundChannel, 'id'> & { id?: ChannelId }, index?: number): SoundChannel {
    const full: SoundChannel = { ...ch, id: ch.id ?? this.doc.newChannelId() };
    this.run({ t: 'ch+', ch: full, index: index ?? this.doc.data.channels.length });
    return this.doc.channel(full.id)!;
  }

  /** Delete a channel and every note it plays. */
  deleteChannel(id: ChannelId): void {
    const i = this.doc.data.channels.findIndex((c) => c.id === id);
    if (i < 0) throw new Error(`no channel ${id}`);
    this.deleteNotes(this.doc.index.channel(id).map((n) => n.id));
    this.run({ t: 'ch-', ch: { ...this.doc.data.channels[i]! }, index: i });
  }

  patchChannel(id: ChannelId, patch: ChannelPatch): void {
    const c = this.doc.channel(id);
    if (!c) throw new Error(`no channel ${id}`);
    const b: Record<string, unknown> = {};
    const a: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if ((c as unknown as Record<string, unknown>)[k] === v) continue;
      b[k] = (c as unknown as Record<string, unknown>)[k];
      a[k] = v;
    }
    if (Object.keys(a).length) this.run({ t: 'ch~', id, before: b, after: a });
  }

  setBpmEvents(events: BpmEvent[]): void {
    const sorted = [...events].sort((a, b) => a.y - b.y);
    this.run({ t: 'bpm', before: this.doc.data.bpmEvents.map((e) => ({ ...e })), after: sorted });
  }

  setStopEvents(events: StopEvent[]): void {
    const sorted = [...events].sort((a, b) => a.y - b.y);
    this.run({ t: 'stop', before: this.doc.data.stopEvents.map((e) => ({ ...e })), after: sorted });
  }

  setLines(lines: BarLine[] | null): void {
    this.run({
      t: 'lines',
      before: this.doc.data.lines && this.doc.data.lines.map((e) => ({ ...e })),
      after: lines,
    });
  }

  setInfo(patch: InfoPatch): void {
    const info = this.doc.data.info as unknown as Record<string, unknown>;
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (JSON.stringify(info[k]) === JSON.stringify(v)) continue;
      before[k] = info[k] === undefined ? undefined : structuredClone(info[k]);
      after[k] = v;
    }
    if (Object.keys(after).length) this.run({ t: 'info', before, after });
  }

  setBga(bga: BgaData | null): void {
    this.run({
      t: 'bga',
      before: this.doc.data.bga && structuredClone(this.doc.data.bga),
      after: bga,
    });
  }

  /** Replace the selection as part of this transaction (restored by undo). */
  select(ids: Iterable<NoteId>, anchor?: NoteId): void {
    this.doc.setSelectionSilently(ids, anchor);
    this.cs.selection = true;
  }
}
