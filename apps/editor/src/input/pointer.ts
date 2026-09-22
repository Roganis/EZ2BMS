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
} from '@ez2bms/chart-core';
import type { PlayfieldRenderer } from '../render/renderer';

export interface ToolHost {
  renderer: PlayfieldRenderer;
  doc: ChartDoc;
  /** The mode's columns in screen order. */
  columns: readonly Column[];
  tool: 'draw' | 'select';
  snap: number;
  brush: ChannelId | null;
  setBrush(ch: ChannelId): void;
  setGhost(g: { x: number; y: number; l: number } | null): void;
  setMarquee(m: { x0: number; y0: number; x1: number; y1: number } | null): void;
  pan(dPulses: number): void;
  say(msg: string): void;
  /** Hear a sound (placing or picking a note). */
  audition(ch: ChannelId): void;
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
  | { kind: 'pan'; lastY: number };

const DRAG_PX = 4;

export class PointerTool {
  private g: Gesture = { kind: 'none' };

  get busy(): boolean {
    return this.g.kind !== 'none';
  }

  private step(h: ToolHost): number {
    const res = h.doc.resolution;
    const grid = SNAP_GRIDS.find((g) => g.perMeasure === h.snap);
    return (grid && stepPulses(grid, res)) || stepPulses(gridsFor(res).at(-1)!, res) || 1;
  }

  private snap(h: ToolHost, p: number, free: boolean): number {
    if (free) return Math.max(0, Math.round(p));
    const s = this.step(h);
    return Math.max(0, Math.round(p / s) * s);
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
    let hit = r.noteAt(px, py);
    // Over a hold's body, Shift (or the select tool) means a rubber band, not a grab.
    if (hit?.part === 'body' && (e.shiftKey || h.tool === 'select') && e.button === 0)
      hit = undefined;
    const chip = hit ? undefined : r.rackNoteAt(px, py);
    const note = hit?.note ?? chip;
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
        // Hover: where a click would put a note.
        const lane = r.laneAt(px);
        if (h.tool === 'draw' && lane && !r.noteAt(px, py) && !e.shiftKey) {
          h.setGhost({ x: lane.x, y: this.snap(h, p, e.altKey), l: 0 });
        } else h.setGhost(null);
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
        const dy = this.snap(h, g.anchor.y + (p - g.p0), e.altKey) - g.anchor.y;
        const target = this.targets(h, g, px, dy);
        if (!target || movedConflict(h.doc, target)) return;
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
      case 'place': {
        h.setGhost(null);
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
    const toRack = col < 0 && h.renderer.overRack(px);
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
