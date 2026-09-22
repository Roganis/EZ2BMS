// The playfield: EZ2PORT's lanes and scroll, drawn with Pixi (WebGL).
//
// Draws only when something changed (Edit) or every frame while playing or
// animating. Everything visible is found by binary search on the note index
// and drawn from pooled sprites, so a 50k-note chart costs what is on screen.

import {
  type ChartDoc,
  type Column,
  type NoteId,
  type NoteRec,
  type TimingMap,
} from '@ez2bms/chart-core';
import { Application, Container, Graphics } from 'pixi.js';
import { channelHue } from '../colors';
import { computeLayout, laneAtX, packRack, Viewport, type LaneGeom, type Layout } from './geometry';
import { SpritePool, TextPool } from './pool';
import { hsl, KIND_COLOR, KIND_FILL, NEON, NEON_2, NeonSkin, PAD, type SkinTextures } from './skin';

export interface FieldState {
  doc: ChartDoc;
  rev: number;
  /** The mode's columns in screen order. */
  columns: readonly Column[];
  timing: TimingMap;
  mode: 'edit' | 'play';
  /** Design pixels per beat. */
  pxPerBeat: number;
  cursor: number;
  snap: number;
  selection: ReadonlySet<NoteId>;
  hoverLane: number | null;
  /** The note the draw tool would place. */
  ghost: { x: number; y: number; l: number } | null;
  /** Rubber band, screen pixels. */
  marquee: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Lanes held down in Play (bmson x). */
  pressed: ReadonlySet<number>;
  /** Notes already hit in Play: taps vanish, holds pin their head to the judge line. */
  hidden: ReadonlySet<NoteId>;
  /** Draw every frame (playing). */
  live: boolean;
}

const HOLD_LABEL: Record<number, string> = {
  1: '½',
  2: '⅛',
  3: '1/16',
  4: '×1',
  5: '×1',
  6: '6',
  7: '—',
  9: '9',
  10: '10',
  11: '11',
  12: '12',
};

export class PlayfieldRenderer {
  readonly app = new Application();
  private state: FieldState | undefined;
  private layout: Layout | undefined;
  private vp: Viewport | undefined;
  private skin!: NeonSkin;
  private tex: SkinTextures | undefined;
  private raf = 0;
  private shownPx = 0;
  private extras = 1;
  private rack: { rev: number; cols: Map<number, number>; n: number } = {
    rev: -1,
    cols: new Map(),
    n: 0,
  };
  /** Rack chips as last drawn, for hit testing. */
  private rackHits: { id: NoteId; x: number; y: number; w: number; h: number }[] = [];
  /** Called after each frame with the pulses on screen (bottom, top) and the layout. */
  onView: ((lo: number, hi: number, layout: Layout) => void) | undefined;

  private readonly bg = new Graphics();
  private readonly grid = new Graphics();
  private readonly marks = new Graphics();
  private readonly holds = new Container();
  private readonly notes = new Container();
  private readonly rings = new Container();
  private readonly chips = new Container();
  private readonly overlay = new Graphics();
  private readonly text = new Container();
  private readonly bodyPool = new SpritePool(this.holds);
  private readonly headPool = new SpritePool(this.notes);
  private readonly ringPool = new SpritePool(this.rings);
  private readonly chipPool = new SpritePool(this.chips);
  private readonly measureText = new TextPool(this.text, {
    fontFamily: 'monospace',
    fontSize: 11,
    fill: 0x58e1ff,
  });
  private readonly markText = new TextPool(this.text, {
    fontFamily: 'monospace',
    fontSize: 11,
    fill: 0xffffff,
  });
  private readonly laneText = new TextPool(this.text, {
    fontFamily: 'sans-serif',
    fontSize: 11,
    fill: 0xffffff,
    fontWeight: 'bold',
  });
  private readonly chipText = new TextPool(this.text, {
    fontFamily: 'sans-serif',
    fontSize: 9,
    fill: 0xffffff,
  });

  static async create(host: HTMLElement): Promise<PlayfieldRenderer> {
    const r = new PlayfieldRenderer();
    await r.app.init({
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      background: 0x05060a,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      preference: 'webgl',
      powerPreference: 'high-performance',
      autoStart: false,
    });
    r.app.ticker.stop();
    r.skin = new NeonSkin(r.app.renderer);
    r.app.stage.addChild(
      r.bg,
      r.grid,
      r.marks,
      r.holds,
      r.chips,
      r.notes,
      r.rings,
      r.overlay,
      r.text,
    );
    host.appendChild(r.app.canvas);
    return r;
  }

  set(state: FieldState): void {
    this.state = state;
    this.invalidate();
  }

  resize(w: number, h: number): void {
    this.app.renderer.resize(Math.max(1, w), Math.max(1, h));
    this.invalidate();
  }

  invalidate(): void {
    if (!this.raf) this.raf = requestAnimationFrame(() => this.frame());
  }

  private frame(): void {
    this.raf = 0;
    if (!this.state) return;
    const animating = this.draw(this.state);
    if (animating || this.state.live) this.invalidate();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.skin?.destroy();
    this.app.destroy(true, { children: true, texture: true });
  }

  // ---- hit testing (screen pixels, CSS)

  laneAt(px: number): LaneGeom | undefined {
    return this.layout ? laneAtX(this.layout, px) : undefined;
  }

  pulseAt(py: number): number {
    return this.vp ? this.vp.pulseOf(py) : 0;
  }

  yOf(pulse: number): number {
    return this.vp ? this.vp.yOf(pulse) : 0;
  }

  get pxPerPulse(): number {
    return this.vp?.pxPerPulse ?? 1;
  }

  get currentLayout(): Layout | undefined {
    return this.layout;
  }

  /** The note under the pointer: a head (within half a note's height), or a hold body. */
  noteAt(px: number, py: number): { note: NoteRec; part: 'head' | 'body' | 'tail' } | undefined {
    const s = this.state;
    const lane = this.laneAt(px);
    const vp = this.vp;
    if (!s || !lane || !vp || !this.tex) return undefined;
    const tol = this.tex.noteH * 0.9;
    const p = vp.pulseOf(py);
    const span = tol / vp.pxPerPulse;
    const near = s.doc.index.inRange(lane.x, p - span, p + span);
    let best: { note: NoteRec; part: 'head' | 'body' | 'tail'; d: number } | undefined;
    for (const n of near) {
      const dHead = Math.abs(vp.yOf(n.y) - py);
      if (dHead <= tol && (!best || dHead < best.d)) best = { note: n, part: 'head', d: dHead };
      if (n.l > 0) {
        const dTail = Math.abs(vp.yOf(n.y + n.l) - py);
        if (dTail <= tol * 0.8 && (!best || dTail < best.d))
          best = { note: n, part: 'tail', d: dTail };
      }
    }
    if (best) return { note: best.note, part: best.part };
    const hold = s.doc.index.holdCovering(lane.x, p);
    return hold ? { note: hold, part: 'body' } : undefined;
  }

  /** The background sound under the pointer, if any. */
  rackNoteAt(px: number, py: number): NoteRec | undefined {
    const pad = 3;
    for (let i = this.rackHits.length - 1; i >= 0; i--) {
      const h = this.rackHits[i]!;
      if (px >= h.x - pad && px <= h.x + h.w + pad && py >= h.y - pad && py <= h.y + h.h + pad) {
        return this.state?.doc.index.get(h.id);
      }
    }
    return undefined;
  }

  /** Whether a screen x is over the background rack. */
  overRack(px: number): boolean {
    const l = this.layout;
    return (
      !!l &&
      l.rack.cols > 0 &&
      px >= l.rack.left - 6 &&
      px <= l.rack.left + l.rack.cols * l.rack.colWidth + 6
    );
  }

  /** Notes whose heads fall inside a screen rectangle. */
  notesIn(x0: number, y0: number, x1: number, y1: number): NoteId[] {
    const s = this.state;
    const l = this.layout;
    const vp = this.vp;
    if (!s || !l || !vp) return [];
    const [xa, xb] = x0 < x1 ? [x0, x1] : [x1, x0];
    const [pa, pb] = [vp.pulseOf(Math.max(y0, y1)), vp.pulseOf(Math.min(y0, y1))];
    const out: NoteId[] = [];
    for (const g of [...l.lanes, ...l.offLanes]) {
      if (g.left + g.width < xa || g.left > xb) continue;
      for (const n of s.doc.index.inRange(g.x, pa, pb)) if (n.y >= pa && n.y <= pb) out.push(n.id);
    }
    for (const h of this.rackHits) {
      if (h.x + h.w >= xa && h.x <= xb && h.y + h.h >= Math.min(y0, y1) && h.y <= Math.max(y0, y1))
        out.push(h.id);
    }
    return out;
  }

  // ---- drawing

  private draw(s: FieldState): boolean {
    const doc = s.doc;
    const res = doc.resolution;
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    let animating = false;

    // Edit <-> Play: the rack slides away and the beat spacing eases over.
    const wantExtras = s.mode === 'edit' ? 1 : 0;
    this.extras += (wantExtras - this.extras) * 0.22;
    if (Math.abs(wantExtras - this.extras) < 0.01) this.extras = wantExtras;
    else animating = true;

    const inMode = new Set(s.columns.map((c) => c.x));
    const offModeXs = doc.index
      .laneKeys()
      .filter((x) => x !== 0 && !inMode.has(x))
      .sort((a, b) => a - b);
    if (this.rack.rev !== s.rev) {
      const bgm = doc.index.lane(0);
      const cols = packRack(bgm, res / 2);
      this.rack = { rev: s.rev, cols, n: bgm.length ? Math.max(...cols.values()) + 1 : 0 };
    }
    const l = computeLayout({
      width: W,
      height: H,
      columns: s.columns,
      offModeXs,
      rackCols: Math.min(this.rack.n, 12),
      extras: this.extras,
    });
    this.layout = l;
    const wantPx = s.pxPerBeat * l.scale;
    if (!this.shownPx) this.shownPx = wantPx;
    this.shownPx += (wantPx - this.shownPx) * 0.25;
    if (Math.abs(wantPx - this.shownPx) < 0.05) this.shownPx = wantPx;
    else animating = true;
    const vp = new Viewport(res, s.cursor, this.shownPx, l.judgeY);
    this.vp = vp;
    const tex = this.skin.textures([...l.lanes, ...l.offLanes], l.scale);
    this.tex = tex;
    const [p0, p1] = vp.visible(H);
    const pad = res;

    this.drawBackground(s, l);
    this.drawGrid(s, l, vp, p0, p1);
    this.drawMarkers(s, l, vp, p0, p1);
    this.drawNotes(s, l, vp, tex, p0 - pad, p1 + pad);
    this.drawRack(s, l, vp, tex, p0 - pad, p1 + pad);
    this.drawOverlay(s, l, vp, tex);
    this.app.render();
    this.onView?.(p0, p1, l);
    return animating;
  }

  private drawBackground(s: FieldState, l: Layout): void {
    const g = this.bg;
    g.clear();
    const H = l.height;
    const fl = l.field.left;
    const fw = l.field.right - l.field.left;
    // The field well, a hair wider than the lanes, with neon edges.
    g.rect(fl - 4, 0, fw + 8, H).fill({ color: 0x000000, alpha: 0.55 });
    for (const lane of l.lanes) {
      const [c, a] = KIND_FILL[lane.kind];
      const lit = s.pressed.has(lane.x)
        ? 0.22
        : s.hoverLane === lane.x && s.mode === 'edit'
          ? 0.05
          : 0;
      g.rect(lane.left, 0, lane.width, H).fill({ color: c, alpha: a + lit });
      if (s.pressed.has(lane.x)) {
        // A key beam rising from the judge line.
        g.rect(lane.left, l.judgeY - 180 * l.scale, lane.width, 180 * l.scale).fill({
          color: KIND_COLOR[lane.kind],
          alpha: 0.12,
        });
      }
    }
    g.rect(fl - 4, 0, 1.5, H).fill({ color: NEON, alpha: 0.35 });
    g.rect(fl + fw + 2.5, 0, 1.5, H).fill({ color: NEON, alpha: 0.35 });
    for (const lane of l.offLanes)
      g.rect(lane.left, 0, lane.width, H).fill({ color: 0xffffff, alpha: 0.02 });
    if (l.rack.cols && this.extras > 0.02) {
      g.rect(l.rack.left - 4, 0, l.rack.cols * l.rack.colWidth + 8, H).fill({
        color: 0xffffff,
        alpha: 0.015 * this.extras,
      });
    }
    // Lane labels under the judge line.
    this.laneText.begin();
    for (const lane of [...l.lanes, ...l.offLanes]) {
      const t = this.laneText.next(lane.short);
      t.tint = lane.offMode ? 0x4b5372 : KIND_COLOR[lane.kind];
      t.alpha = lane.offMode ? this.extras : 0.85;
      t.scale.set(Math.min(1.3, l.scale * 0.75));
      t.position.set(lane.left + (lane.width - t.width) / 2, l.judgeY + 14 * l.scale);
    }
    this.laneText.end();
  }

  private drawGrid(s: FieldState, l: Layout, vp: Viewport, p0: number, p1: number): void {
    const g = this.grid;
    g.clear();
    const res = s.doc.resolution;
    const left = l.field.left - 4;
    const right = Math.max(
      l.field.right + 4,
      ...l.offLanes.map((o) => o.left + o.width),
      l.rack.left + l.rack.cols * l.rack.colWidth,
    );
    const edit = this.extras;
    // Snap lines (Edit only, when they are far enough apart to read).
    const step = (res * 4) / s.snap;
    if (edit > 0.02 && step * vp.pxPerPulse >= 7) {
      const triplet = s.snap % 3 === 0;
      for (let p = Math.ceil(p0 / step) * step; p <= p1; p += step) {
        if (p % res === 0) continue;
        const y = Math.round(vp.yOf(p)) + 0.5;
        g.moveTo(l.field.left, y).lineTo(l.field.right, y);
      }
      g.stroke({ width: 1, color: triplet ? NEON_2 : 0xffffff, alpha: 0.06 * edit });
    }
    // Beats.
    for (let p = Math.ceil(p0 / res) * res; p <= p1; p += res) {
      if (p % (res * 4) === 0) continue;
      const y = Math.round(vp.yOf(p)) + 0.5;
      g.moveTo(l.field.left, y).lineTo(l.field.right, y);
    }
    g.stroke({ width: 1, color: 0xffffff, alpha: 0.05 + 0.1 * edit });
    // Measures, numbered in the gutter.
    this.measureText.begin();
    const m0 = Math.max(0, Math.ceil(p0 / (res * 4)));
    for (let m = m0; m * res * 4 <= p1; m++) {
      const y = Math.round(vp.yOf(m * res * 4)) + 0.5;
      g.moveTo(left, y).lineTo(right, y);
      const t = this.measureText.next(`#${String(m).padStart(3, '0')}`);
      t.scale.set(Math.min(1.4, l.scale * 0.8));
      t.alpha = 0.55 + 0.45 * edit;
      t.position.set(l.gutter.left + 4 * l.scale, y - t.height - 1);
    }
    g.stroke({ width: 1.5, color: NEON, alpha: 0.4 });
    this.measureText.end();
  }

  private drawMarkers(s: FieldState, l: Layout, vp: Viewport, p0: number, p1: number): void {
    const g = this.marks;
    g.clear();
    this.markText.begin();
    const d = s.doc.data;
    const flag = (p: number, label: string, color: number) => {
      const y = vp.yOf(p);
      const t = this.markText.next(label);
      t.scale.set(Math.min(1.3, l.scale * 0.75));
      const w = t.width + 8;
      const x = l.gutter.right - w - 14 * l.scale;
      g.roundRect(x, y - t.height - 3, w, t.height + 4, 3).fill({ color, alpha: 0.9 });
      g.moveTo(x + w, y + 0.5)
        .lineTo(l.field.right + 4, y + 0.5)
        .stroke({ width: 1, color, alpha: 0.45 });
      t.tint = 0x05060a;
      t.position.set(x + 4, y - t.height - 1);
    };
    const bpms = [{ y: 0, bpm: d.info.initBpm ?? 120 }, ...d.bpmEvents.filter((e) => e.y > 0)];
    for (const e of bpms) if (e.y >= p0 && e.y <= p1) flag(e.y, fmtBpm(e.bpm), 0xffd11f);
    for (const e of d.stopEvents)
      if (e.y >= p0 && e.y <= p1) flag(e.y, `STOP ${e.duration}`, 0xff4fd8);
    this.markText.end();
  }

  private drawNotes(
    s: FieldState,
    l: Layout,
    vp: Viewport,
    tex: SkinTextures,
    p0: number,
    p1: number,
  ): void {
    this.bodyPool.begin();
    this.headPool.begin();
    this.ringPool.begin();
    this.chipText.begin();
    const noteH = tex.noteH;
    for (const lane of [...l.lanes, ...l.offLanes]) {
      if (lane.width < 1) continue;
      const alpha = lane.offMode ? 0.4 * this.extras : 1;
      if (alpha <= 0.01) continue;
      const head = this.skin.headFor(tex, lane.kind, lane.width);
      const body = this.skin.bodyFor(tex, lane.kind, lane.width);
      const ring = this.skin.ringFor(tex, lane.kind, lane.width);
      const bw = Math.max(4, Math.round(lane.width * 0.72));
      for (const n of s.doc.index.inRange(lane.x, p0, p1)) {
        let y = vp.yOf(n.y);
        if (s.hidden.has(n.id)) {
          if (n.l === 0) continue;
          y = Math.min(y, l.judgeY);
          if (vp.yOf(n.y + n.l) >= l.judgeY) continue;
        }
        const sel = s.selection.has(n.id);
        if (n.l > 0) {
          const ye = vp.yOf(n.y + n.l);
          const b = this.bodyPool.next(body);
          b.position.set(lane.left + (lane.width - bw) / 2 - PAD, ye - PAD);
          b.height = y - ye + 2 * PAD;
          b.width = bw + 2 * PAD;
          b.alpha = alpha;
          // The end cap: a thin bar in the body's colour, clearly part of the hold.
          const tail = this.bodyPool.next(body);
          tail.position.set(lane.left + (lane.width - bw) / 2 - PAD - 2, ye - 2 - PAD);
          tail.width = bw + 4 + 2 * PAD;
          tail.height = 4 + 2 * PAD;
          tail.alpha = alpha;
          tail.tint = 0xffffff;
          if (n.kind !== undefined && n.kind !== 0 && y - ye > 28) {
            const t = this.chipText.next(HOLD_LABEL[n.kind] ?? String(n.kind));
            t.tint = KIND_COLOR[lane.kind];
            t.alpha = 0.9 * alpha;
            t.position.set(lane.left + (lane.width - t.width) / 2, (y + ye) / 2 - t.height / 2);
          }
        }
        const h = this.headPool.next(head);
        h.position.set(lane.left + 1 - PAD, y - noteH / 2 - PAD);
        h.alpha = alpha;
        if (sel) {
          const r = this.ringPool.next(ring);
          r.position.set(lane.left + 1 - PAD, y - noteH / 2 - PAD);
        }
      }
    }
    this.bodyPool.end();
    this.headPool.end();
    this.ringPool.end();
    // chipText is shared with the rack; ended there.
  }

  private drawRack(
    s: FieldState,
    l: Layout,
    vp: Viewport,
    tex: SkinTextures,
    p0: number,
    p1: number,
  ): void {
    this.chipPool.begin();
    if (l.rack.cols && this.extras > 0.02) {
      const bgm = s.doc.index.inRange(0, p0, p1);
      const labels = bgm.length < 400 && vp.pxPerPulse * s.doc.resolution >= 70;
      for (const n of bgm) {
        const col = this.rack.cols.get(n.id) ?? 0;
        if (col >= l.rack.cols) continue;
        const ch = s.doc.channel(n.ch);
        const y = vp.yOf(n.y);
        const c = this.chipPool.next(tex.chip);
        const x = l.rack.left + col * l.rack.colWidth;
        c.position.set(x - PAD, y - (tex.chip.height - 2 * PAD) / 2 - PAD);
        c.width = Math.max(4, l.rack.colWidth - 3) + 2 * PAD;
        const chipH = tex.chip.height - 2 * PAD;
        this.rackHits.push({
          id: n.id,
          x,
          y: y - chipH / 2,
          w: Math.max(4, l.rack.colWidth - 3),
          h: chipH,
        });
        c.tint = hsl(channelHue(ch?.name ?? ''), 0.8, 0.62);
        c.alpha = (s.selection.has(n.id) ? 1 : 0.8) * this.extras;
        if (s.selection.has(n.id)) c.tint = 0xffffff;
        if (labels) {
          const t = this.chipText.next((ch?.name ?? '?').replace(/\.[^.]+$/, '').slice(0, 6));
          t.alpha = 0.75 * this.extras;
          t.position.set(x + 1, y - t.height - 3);
        }
      }
    }
    this.chipPool.end();
    this.chipText.end();
  }

  private drawOverlay(s: FieldState, l: Layout, vp: Viewport, tex: SkinTextures): void {
    const g = this.overlay;
    g.clear();
    const fl = l.field.left - 4;
    const fw = l.field.right - l.field.left + 8;
    const jy = l.judgeY;
    // A band for the lane labels, over past notes.
    g.rect(fl, jy + 6 * l.scale, fw, 26 * l.scale).fill({ color: 0x05060a, alpha: 0.88 });
    // The judge line: a neon bar with a baked glow.
    g.rect(fl, jy - 6 * l.scale, fw, 12 * l.scale).fill({ color: NEON, alpha: 0.08 });
    g.rect(fl, jy - 2.5 * l.scale, fw, 5 * l.scale).fill({ color: NEON, alpha: 0.25 });
    g.rect(fl, jy - 1, fw, 2).fill({ color: 0xffffff, alpha: 0.95 });
    // The cursor's handle in the gutter.
    const hx = l.field.left - 5;
    g.poly([hx - 10 * l.scale, jy - 6 * l.scale, hx, jy, hx - 10 * l.scale, jy + 6 * l.scale]).fill(
      { color: NEON, alpha: 1 },
    );
    // The draw tool's ghost.
    if (s.ghost && s.mode === 'edit') {
      const lane = [...l.lanes, ...l.offLanes].find((g2) => g2.x === s.ghost!.x);
      if (lane) {
        const y = vp.yOf(s.ghost.y);
        const c = KIND_COLOR[lane.kind];
        if (s.ghost.l > 0) {
          const ye = vp.yOf(s.ghost.y + s.ghost.l);
          g.rect(lane.left + lane.width * 0.14, ye, lane.width * 0.72, y - ye).fill({
            color: c,
            alpha: 0.18,
          });
        }
        g.roundRect(lane.left + 1, y - tex.noteH / 2, lane.width - 2, tex.noteH, 3).fill({
          color: c,
          alpha: 0.35,
        });
        g.roundRect(lane.left + 1, y - tex.noteH / 2, lane.width - 2, tex.noteH, 3).stroke({
          width: 1,
          color: c,
          alpha: 0.8,
        });
      }
    }
    if (s.marquee) {
      const m = s.marquee;
      const x = Math.min(m.x0, m.x1);
      const y = Math.min(m.y0, m.y1);
      g.rect(x, y, Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0))
        .fill({ color: NEON, alpha: 0.07 })
        .stroke({ width: 1, color: NEON, alpha: 0.8 });
    }
  }
}

function fmtBpm(b: number): string {
  return Number.isInteger(b) ? String(b) : b.toFixed(2).replace(/0+$/, '');
}
