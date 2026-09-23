// Mouse editing on the playfield: one state machine for every gesture.
//
//   draw tool, empty lane     press to place, drag up to make it a hold
//   on a note head            click selects (Shift/Ctrl add), drag moves it in
//                             time and across lanes, snapped (Alt: free)
//   on a hold's tail          drag to change the length
//   empty + Shift, select tool  rubber band
//   right button              erase what the pointer touches
//   middle button             pan
//   Alt+click a note          take its sound as the brush
//
// In a stem strip, whatever the tool: right-click cuts the stem there (on a
// cut, heals it); drag a cut to move it; click a slice to select it (Shift
// adds) and drag it sideways onto a lane to key it there, or from a lane
// back onto a strip or the rack. Cuts snap to the grid, to the stem's onsets
// with Shift, anywhere with Alt. The knife tool cuts with a click - in a
// strip, or on the lanes for the strip in focus. All of it keeps the sound
// (chart-core slice/ops.ts refuses what would not).
//
// In Classic mode (the host passes `classic`) placing keys the sound playing
// there instead of the brush, the right button un-keys, heals or splits
// instead of erasing, drags keep notes at their time, and positions snap to
// the picked sound's group before the grid.
//
// Moves and resizes are drafts: the chart shows the result live, Esc puts
// everything back, and the whole drag is one undo step.

import {
  BGM,
  movedConflict,
  placementConflict,
  placeNote,
  eraseNotes,
  gridsFor,
  stepPulses,
  SNAP_GRIDS,
  type ChannelId,
  type ChartDoc,
  type Column,
  type Draft,
  type NoteId,
  type NoteRec,
  type StemSlice,
} from '@ez2bms/chart-core';
import type { PlayfieldRenderer } from '../render/renderer';

export interface ToolHost {
  renderer: PlayfieldRenderer;
  doc: ChartDoc;
  /** The mode's columns in screen order. */
  columns: readonly Column[];
  tool: 'draw' | 'select' | 'knife';
  snap: number;
  brush: ChannelId | null;
  setBrush(ch: ChannelId): void;
  setGhost(g: { x: number; y: number; l: number } | null): void;
  setMarquee(m: { x0: number; y0: number; x1: number; y1: number } | null): void;
  pan(dPulses: number): void;
  say(msg: string): void;
  /** Hear a sound (placing or picking a note). */
  audition(ch: ChannelId): void;
  /** Classic mode: what placing, right-clicking, snapping and moving mean instead. */
  classic?: ClassicHooks;
  /** Stem strips: slicing. */
  strips?: StripHooks;
}

export interface StripHooks {
  /** The strip under a screen x, if any. */
  at(px: number): number | undefined;
  /** The strip the knife cuts for on the lanes, if any. */
  focused(): number | undefined;
  sliceAt(strip: number, py: number): { slice: StemSlice; part: 'line' | 'body' } | undefined;
  /** The stem's onset nearest p within `within` pulses (Shift-snapping), if any. */
  onsetNear(strip: number, p: number, within: number): number | undefined;
  split(strip: number, y: number): void;
  heal(id: NoteId): void;
  move(id: NoteId, y: number): void;
  key(ids: NoteId[], x: number): void;
  focus(strip: number): void;
  /** Where a cut would go (or is being moved to), or none. */
  ghost(g: { strip: number; y: number } | null): void;
  /** The knife on a lane or the rack. */
  knife(y: number): void;
  /** Whether a screen y is on a strip's header (which opens its panel). */
  onHeader(strip: number, py: number): boolean;
  openPanel(strip: number): void;
}

export interface ClassicHooks {
  /** A position snapped to the sound's own notes, or undefined for the grid. */
  snap(p: number, within: number): number | undefined;
  place(x: number, y: number, l: number): void;
  right(note: NoteRec | undefined, y: number): void;
  /** Whether notes may go where a drag would put them (their time never changes). */
  canMove(targets: { id: NoteId; x: number; y: number; l: number }[]): boolean;
}

type Orig = { id: NoteId; x: number; y: number; l: number };

type Gesture =
  | { kind: 'none' }
  | { kind: 'place'; x: number; y0: number; l: number }
  | {
      kind: 'move';
      sx: number;
      sy: number;
      p0: number;
      col0: number;
      anchor: NoteRec;
      orig: Orig[];
      draft: Draft | null;
    }
  | { kind: 'resize'; note: NoteRec; draft: Draft }
  | { kind: 'marquee'; x0: number; y0: number; base: Set<NoteId> }
  | { kind: 'erase'; ids: Set<NoteId>; draft: Draft }
  | { kind: 'pan'; lastY: number }
  | { kind: 'cut'; id: NoteId; strip: number; from: number; y: number }
  | { kind: 'slices'; ids: NoteId[]; y: number; sx: number; sy: number; moved: boolean };

const DRAG_PX = 4;

export class PointerTool {
  private g: Gesture = { kind: 'none' };

  get busy(): boolean {
    return this.g.kind !== 'none';
  }

  /** A note is being drawn (the button is down on an empty spot). */
  get placing(): boolean {
    return this.g.kind === 'place';
  }

  private step(h: ToolHost): number {
    const res = h.doc.resolution;
    const grid = SNAP_GRIDS.find((g) => g.perMeasure === h.snap);
    return (grid && stepPulses(grid, res)) || stepPulses(gridsFor(res).at(-1)!, res) || 1;
  }

  private snap(h: ToolHost, p: number, free: boolean): number {
    if (free) return Math.max(0, Math.round(p));
    const s = this.step(h);
    const toSound = h.classic?.snap(p, s / 2);
    if (toSound !== undefined) return toSound;
    return Math.max(0, Math.round(p / s) * s);
  }

  /** Where a cut goes: the grid, the stem's onsets with Shift, anywhere with Alt. */
  private cutAt(h: ToolHost, strip: number, p: number, e: PointerEvent): number {
    if (e.shiftKey && !e.altKey) {
      const on = h.strips?.onsetNear(strip, p, this.step(h) / 2);
      if (on !== undefined) return on;
    }
    return this.snap(h, p, e.altKey);
  }

  /** A press in a stem strip. */
  private stripDown(e: PointerEvent, h: ToolHost, s: StripHooks, strip: number): void {
    const py = e.offsetY;
    const p = h.renderer.pulseAt(py);
    s.focus(strip);
    if (s.onHeader(strip, py)) {
      if (e.button === 0) s.openPanel(strip);
      return;
    }
    const hit = s.sliceAt(strip, py);
    if (e.button === 2) {
      if (hit?.part === 'line' && !hit.slice.fresh) s.heal(hit.slice.id);
      else s.split(strip, this.cutAt(h, strip, p, e));
      return;
    }
    if (e.button !== 0) return;
    if (h.tool === 'knife') {
      s.split(strip, this.cutAt(h, strip, p, e));
      return;
    }
    if (hit?.part === 'line' && !hit.slice.fresh) {
      const y = hit.slice.y;
      this.g = { kind: 'cut', id: hit.slice.id, strip, from: y, y };
      s.ghost({ strip, y });
      return;
    }
    if (!hit) return;
    const id = hit.slice.id;
    const sel = h.doc.selection.ids;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (additive && sel.has(id)) {
      h.doc.setSelection([...sel].filter((x) => x !== id));
      return;
    }
    if (!sel.has(id)) h.doc.setSelection(additive ? [...sel, id] : [id], id);
    this.g = {
      kind: 'slices',
      ids: [...h.doc.selection.ids],
      y: hit.slice.y,
      sx: e.offsetX,
      sy: py,
      moved: false,
    };
  }

  private colOf(h: ToolHost, px: number): number {
    const lane = h.renderer.laneAt(px);
    return lane ? h.columns.findIndex((c) => c.x === lane.x) : -1;
  }

  down(e: PointerEvent, h: ToolHost): void {
    const r = h.renderer;
    const px = e.offsetX;
    const py = e.offsetY;
    const p = r.pulseAt(py);
    if (e.button === 1) {
      this.g = { kind: 'pan', lastY: py };
      return;
    }
    const strip = h.strips?.at(px);
    if (strip !== undefined && h.strips) {
      this.stripDown(e, h, h.strips, strip);
      return;
    }
    if (h.tool === 'knife' && e.button === 0 && h.strips && !e.altKey) {
      h.strips.knife(this.snap(h, p, false));
      return;
    }
    let hit = r.noteAt(px, py);
    // Over a hold's body, Shift (or the select tool) means a rubber band, not a grab.
    if (hit?.part === 'body' && (e.shiftKey || h.tool === 'select') && e.button === 0)
      hit = undefined;
    const chip = hit ? undefined : r.rackNoteAt(px, py);
    const note = hit?.note ?? chip;
    if (e.button === 2 && h.classic) {
      h.classic.right(note, this.snap(h, p, e.altKey));
      return;
    }
    if (e.button === 2) {
      if (note && h.doc.selection.ids.has(note.id) && h.doc.selection.ids.size > 1) {
        eraseNotes(h.doc, h.doc.selection.ids);
        return;
      }
      const draft = h.doc.begin('Erase notes');
      const ids = new Set<NoteId>();
      this.g = { kind: 'erase', ids, draft };
      this.eraseAt(px, py, h);
      return;
    }
    if (e.button !== 0) return;
    if (note && e.altKey) {
      h.setBrush(note.ch);
      h.say(`Brush: ${h.doc.channel(note.ch)?.name ?? '?'}`);
      return;
    }
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (hit?.part === 'tail') {
      h.doc.setSelection([hit.note.id], hit.note.id);
      this.g = { kind: 'resize', note: hit.note, draft: h.doc.begin('Set length') };
      return;
    }
    if (note) {
      const sel = h.doc.selection.ids;
      if (additive && sel.has(note.id)) {
        h.doc.setSelection([...sel].filter((id) => id !== note.id));
        return;
      }
      if (!sel.has(note.id)) h.doc.setSelection(additive ? [...sel, note.id] : [note.id], note.id);
      if (!additive) h.audition(note.ch);
      const orig = [...h.doc.selection.ids]
        .map((id) => h.doc.index.get(id))
        .filter((n): n is NoteRec => !!n)
        .map((n) => ({ id: n.id, x: n.x, y: n.y, l: n.l }));
      this.g = {
        kind: 'move',
        sx: px,
        sy: py,
        p0: p,
        col0: this.colOf(h, px),
        anchor: note,
        orig,
        draft: null,
      };
      return;
    }
    const lane = r.laneAt(px);
    if (h.tool === 'select' || e.shiftKey || !lane) {
      this.g = {
        kind: 'marquee',
        x0: px,
        y0: py,
        base: new Set(additive ? h.doc.selection.ids : []),
      };
      h.setMarquee({ x0: px, y0: py, x1: px, y1: py });
      return;
    }
    if (!additive) h.doc.setSelection([]);
    const y0 = this.snap(h, p, e.altKey);
    this.g = { kind: 'place', x: lane.x, y0, l: 0 };
    h.setGhost({ x: lane.x, y: y0, l: 0 });
  }

  /** Pointer moved with or without buttons. */
  move(e: PointerEvent, h: ToolHost): void {
    const r = h.renderer;
    const px = e.offsetX;
    const py = e.offsetY;
    const p = r.pulseAt(py);
    const g = this.g;
    switch (g.kind) {
      case 'none': {
        // Hover: where a click would put a note - or, in a strip, a cut.
        const strip = h.strips?.at(px);
        if (strip !== undefined && h.strips) {
          h.setGhost(null);
          const on = h.strips.sliceAt(strip, py);
          h.strips.ghost(on?.part === 'line' ? null : { strip, y: this.cutAt(h, strip, p, e) });
          return;
        }
        const focused = h.tool === 'knife' ? h.strips?.focused() : undefined;
        h.strips?.ghost(
          focused === undefined ? null : { strip: focused, y: this.snap(h, p, false) },
        );
        const lane = r.laneAt(px);
        if (h.tool === 'draw' && lane && !r.noteAt(px, py) && !e.shiftKey) {
          h.setGhost({ x: lane.x, y: this.snap(h, p, e.altKey), l: 0 });
        } else h.setGhost(null);
        return;
      }
      case 'cut': {
        g.y = this.cutAt(h, g.strip, p, e);
        h.strips?.ghost({ strip: g.strip, y: g.y });
        return;
      }
      case 'slices': {
        if (!g.moved && Math.hypot(px - g.sx, py - g.sy) < DRAG_PX) return;
        g.moved = true;
        // Keying keeps a slice at its time: the ghost follows sideways only.
        const lane = r.laneAt(px);
        h.setGhost(lane ? { x: lane.x, y: g.y, l: 0 } : null);
        return;
      }
      case 'place': {
        g.l = Math.max(0, this.snap(h, p, e.altKey) - g.y0);
        h.setGhost({ x: g.x, y: g.y0, l: g.l });
        return;
      }
      case 'move': {
        if (!g.draft && Math.hypot(px - g.sx, py - g.sy) < DRAG_PX) return;
        g.draft ??= h.doc.begin(g.orig.length === 1 ? 'Move note' : `Move ${g.orig.length} notes`);
        // Classic mode moves sounds between lanes, never in time.
        const dy = h.classic ? 0 : this.snap(h, g.anchor.y + (p - g.p0), e.altKey) - g.anchor.y;
        const target = this.targets(h, g, px, dy);
        if (!target || movedConflict(h.doc, target)) return;
        if (h.classic && !h.classic.canMove(target)) return;
        const draft = g.draft;
        draft.update((tx) =>
          tx.patchNotes(target.map((t) => ({ id: t.id, patch: { x: t.x, y: t.y } }))),
        );
        return;
      }
      case 'resize': {
        const l = Math.max(0, this.snap(h, p, e.altKey) - g.note.y);
        if (placementConflict(h.doc, g.note.x, g.note.y, l, new Set([g.note.id]))) return;
        g.draft.update((tx) => tx.patchNotes([{ id: g.note.id, patch: { l } }]));
        return;
      }
      case 'marquee': {
        h.setMarquee({ x0: g.x0, y0: g.y0, x1: px, y1: py });
        const ids = r.notesIn(g.x0, g.y0, px, py);
        h.doc.setSelectionSilently([...g.base, ...ids]);
        h.renderer.invalidate();
        return;
      }
      case 'erase':
        this.eraseAt(px, py, h);
        return;
      case 'pan': {
        h.pan((py - g.lastY) / r.pxPerPulse);
        g.lastY = py;
        return;
      }
    }
  }

  up(e: PointerEvent, h: ToolHost): void {
    const g = this.g;
    this.g = { kind: 'none' };
    switch (g.kind) {
      case 'cut':
        h.strips?.ghost(null);
        if (g.y !== g.from) h.strips?.move(g.id, g.y);
        return;
      case 'slices': {
        h.setGhost(null);
        if (!g.moved) return;
        const lane = h.renderer.laneAt(e.offsetX);
        if (lane) h.strips?.key(g.ids, lane.x);
        else if (h.strips?.at(e.offsetX) !== undefined || h.renderer.overRack(e.offsetX))
          h.strips?.key(g.ids, BGM);
        return;
      }
      case 'place': {
        h.setGhost(null);
        if (h.classic) {
          h.classic.place(g.x, g.y0, g.l);
          return;
        }
        if (h.brush === null || !h.doc.channel(h.brush)) {
          h.say('Pick a sound to draw with first (Sounds, on the left)');
          return;
        }
        const why = placementConflict(h.doc, g.x, g.y0, g.l);
        if (why) {
          h.say(`Can't place a note here: ${why}`);
          return;
        }
        placeNote(h.doc, { x: g.x, y: g.y0, l: g.l, ch: h.brush });
        h.audition(h.brush);
        return;
      }
      case 'move':
        g.draft?.commit();
        return;
      case 'resize':
        g.draft.commit();
        return;
      case 'marquee': {
        h.setMarquee(null);
        h.doc.setSelection(h.doc.selection.ids);
        return;
      }
      case 'erase':
        g.draft.commit();
        return;
      default:
        void e;
    }
  }

  /** Esc during a drag: put everything back. */
  cancel(h: ToolHost): void {
    const g = this.g;
    this.g = { kind: 'none' };
    h.strips?.ghost(null);
    if (g.kind === 'move') g.draft?.cancel();
    else if (g.kind === 'resize' || g.kind === 'erase') g.draft.cancel();
    else if (g.kind === 'marquee') {
      h.setMarquee(null);
      h.doc.setSelection([...g.base]);
    }
    h.setGhost(null);
  }

  private eraseAt(px: number, py: number, h: ToolHost): void {
    const g = this.g;
    if (g.kind !== 'erase') return;
    const n = h.renderer.noteAt(px, py)?.note ?? h.renderer.rackNoteAt(px, py);
    if (!n || g.ids.has(n.id)) return;
    g.ids.add(n.id);
    const ids = [...g.ids];
    g.draft.update((tx) => tx.deleteNotes(ids));
  }

  /** Where each dragged note goes, or undefined when a lane note would leave the mode. */
  private targets(
    h: ToolHost,
    g: Extract<Gesture, { kind: 'move' }>,
    px: number,
    dy: number,
  ): Orig[] | undefined {
    const col = this.colOf(h, px);
    // Over the rack or a stem strip: back to the background.
    const toRack = col < 0 && (h.renderer.overRack(px) || h.strips?.at(px) !== undefined);
    const anchorBgm = g.anchor.x === BGM;
    const dcol = anchorBgm || g.col0 < 0 || col < 0 ? 0 : col - g.col0;
    const out: Orig[] = [];
    for (const o of g.orig) {
      let x = o.x;
      if (o.x === BGM) {
        // A background sound dragged onto a lane becomes a note there.
        if (anchorBgm && g.orig.length === 1 && col >= 0) x = h.columns[col]!.x;
      } else if (toRack && !anchorBgm) {
        x = BGM;
      } else if (dcol) {
        const i = h.columns.findIndex((c) => c.x === o.x);
        if (i >= 0) {
          const t = h.columns[i + dcol];
          if (!t) return undefined;
          x = t.x;
        }
      }
      out.push({ id: o.id, x, y: o.y + dy, l: o.l });
    }
    return out;
  }
}
