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
import { Application, Container, FillGradient, Graphics, type Sprite } from 'pixi.js';
import { channelHue } from '../colors';
import { beamColor, noteVariant, targetSway, type GameSkin, type SkinBlend } from '../skin/game';
import { GameSkinTextures } from './gameskin';
import {
  computeLayout,
  laneAtX,
  packRack,
  Viewport,
  type LaneGeom,
  type Layout,
  type SkinGeometry,
} from './geometry';
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
  /** The game's own skin for this mode and side; null draws the neon one. */
  skin: GameSkin | null;
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
  /** The game skin's textures and lane boxes, rebuilt when a different skin arrives. */
  private game: { skin: GameSkin; tex: GameSkinTextures; geom: SkinGeometry } | undefined;
  /** Note height on screen, for hit testing (the taller of the two skins' notes). */
  private noteHpx = 0;
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
  /** How long the last draws took (JS only, ms), for the performance log. */
  readonly drawTimes: number[] = [];
  /** Called after each frame with the pulses on screen (bottom, top) and the layout. */
  onView: ((lo: number, hi: number, layout: Layout) => void) | undefined;

  private readonly bg = new Graphics();
  private readonly grid = new Graphics();
  private readonly marks = new Graphics();
  /** Game skin layers: measure lines, the bed (key panel, press beams, target bar), note beams, press glows. */
  private readonly measures = new Container();
  private readonly bed = new Container();
  private readonly beams = new Container();
  private readonly glow = new Container();
  private readonly holds = new Container();
  private readonly notes = new Container();
  private readonly rings = new Container();
  private readonly chips = new Container();
  private readonly overlay = new Graphics();
  private readonly text = new Container();
  /** The game skin's field backdrop, black at 0x96 over black (made once). */
  private backdrop: FillGradient | undefined;
  private readonly bodyPool = new SpritePool(this.holds);
  private readonly headPool = new SpritePool(this.notes);
  private readonly ringPool = new SpritePool(this.rings);
  private readonly chipPool = new SpritePool(this.chips);
  private readonly measurePool = new SpritePool(this.measures);
  private readonly bedPool = new SpritePool(this.bed);
  private readonly beamPool = new SpritePool(this.beams);
  private readonly glowPool = new SpritePool(this.glow);
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
      r.measures,
      r.marks,
      r.bed,
      r.beams,
      r.holds,
      r.chips,
      r.notes,
      r.glow,
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
    const t0 = performance.now();
    const animating = this.draw(this.state);
    this.drawTimes.push(performance.now() - t0);
    if (this.drawTimes.length > 240) this.drawTimes.shift();
    if (animating || this.state.live) this.invalidate();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.skin?.destroy();
    this.game?.tex.destroy();
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
    const tol = Math.max(this.tex.noteH, this.noteHpx) * 0.9;
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

  /** The game skin to draw with, when every lane of the mode has a track in it. */
  private gameFor(s: FieldState): typeof this.game {
    if (this.game && this.game.skin !== s.skin) {
      this.game.tex.destroy();
      this.game = undefined;
    }
    if (!s.skin) return undefined;
    if (!this.game) {
      const boxes = new Map([...s.skin.lanes].map(([x, g]) => [x, { x: g.x, w: g.w }]));
      this.game = {
        skin: s.skin,
        tex: new GameSkinTextures(s.skin),
        geom: { boxes, judgeY: s.skin.judgeY },
      };
    }
    const g = this.game;
    return s.columns.every((c) => g.tex.lanes.get(c.x)?.notes.length) ? g : undefined;
  }

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

    const game = this.gameFor(s);
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
      skin: game?.geom,
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
    const gs = game && l.design ? new GameView(game.skin, game.tex, l, s, vp) : undefined;
    this.noteHpx = gs ? gs.noteH : 0;

    this.drawBackground(s, l, gs);
    this.drawGrid(s, l, vp, p0, p1, !!gs?.tex.measure.length);
    this.drawMarkers(s, l, vp, p0, p1);
    this.drawBed(s, l, vp, gs, p0, p1);
    this.drawNotes(s, l, vp, tex, gs, p0 - pad, p1 + pad);
    this.drawRack(s, l, vp, tex, p0 - pad, p1 + pad);
    this.drawGlow(s, gs);
    this.drawOverlay(s, l, vp, tex, gs);
    this.app.render();
    this.onView?.(p0, p1, l);
    return animating;
  }

  private drawBackground(s: FieldState, l: Layout, gs: GameView | undefined): void {
    const g = this.bg;
    g.clear();
    const H = l.height;
    const fl = l.field.left;
    const fw = l.field.right - l.field.left;
    if (gs) this.drawGameBed(g, s, l, gs);
    // The field well, a hair wider than the lanes, with neon edges.
    else g.rect(fl - 4, 0, fw + 8, H).fill({ color: 0x000000, alpha: 0.55 });
    for (const lane of gs ? [] : l.lanes) {
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
    if (!gs) {
      g.rect(fl - 4, 0, 1.5, H).fill({ color: NEON, alpha: 0.35 });
      g.rect(fl + fw + 2.5, 0, 1.5, H).fill({ color: NEON, alpha: 0.35 });
    }
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
      // Over the game's key panel only while editing.
      if (gs && !lane.offMode && this.extras < 0.02) continue;
      const t = this.laneText.next(lane.short);
      t.tint = lane.offMode ? 0x4b5372 : KIND_COLOR[lane.kind];
      t.alpha = lane.offMode || gs ? this.extras : 0.85;
      t.scale.set(Math.min(1.3, l.scale * 0.75));
      t.position.set(lane.left + (lane.width - t.width) / 2, l.judgeY + 14 * l.scale);
    }
    this.laneText.end();
  }

  private drawGrid(
    s: FieldState,
    l: Layout,
    vp: Viewport,
    p0: number,
    p1: number,
    skinMeasures: boolean,
  ): void {
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
    // The game skin draws its own measure line; ours stays for the gutter and rack.
    g.stroke({ width: 1.5, color: NEON, alpha: skinMeasures ? 0.4 * edit : 0.4 });
    this.measureText.end();
  }

  /** The game skin's backdrop and lane borders (Panel::m42a240), into the background graphics. */
  private drawGameBed(g: Graphics, s: FieldState, l: Layout, gs: GameView): void {
    const b = gs.skin.backdrop;
    if (b) {
      this.backdrop ??= new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
        colorStops: [
          { offset: 0, color: 'rgba(0,0,0,0.588)' },
          { offset: 1, color: 'rgba(0,0,0,1)' },
        ],
        textureSpace: 'local',
      });
      // From the top of the canvas: notes scroll in from above the 480-line screen.
      g.rect(gs.x(b.x0), 0, (b.x1 - b.x0) * gs.s, gs.y(b.y1)).fill(this.backdrop);
    } else {
      g.rect(l.field.left, 0, l.field.right - l.field.left, gs.y(363)).fill({
        color: 0x000000,
        alpha: 0.55,
      });
    }
    for (const lane of l.lanes) {
      const t = gs.skin.lanes.get(lane.x)!;
      const bottom = gs.y(t.y + t.h);
      // Outside the lane on both sides, as the original draws them.
      if (t.leftLineW > 0) {
        const w = Math.max(1, t.leftLineW * gs.s);
        g.rect(lane.left - w, 0, w, bottom).fill(solid(t.leftLine));
      }
      if (t.rightLineW > 0) {
        const w = Math.max(1, t.rightLineW * gs.s);
        g.rect(lane.left + lane.width, 0, w, bottom).fill(solid(t.rightLine));
      }
      if (s.hoverLane === lane.x && s.mode === 'edit')
        g.rect(lane.left, 0, lane.width, bottom).fill({ color: 0xffffff, alpha: 0.05 });
    }
  }

  /** Measure lines, key panel, press beams and the target bar (scene/skin.c draw_bed). */
  private drawBed(
    s: FieldState,
    l: Layout,
    vp: Viewport,
    gs: GameView | undefined,
    p0: number,
    p1: number,
  ): void {
    this.measurePool.begin();
    this.bedPool.begin();
    if (gs) {
      const m = gs.skin.measure;
      const mt = gs.tex.measure;
      if (m && mt.length) {
        // The line animates on the panel clock, 60 ticks a second.
        const f = Math.floor(gs.now / (1000 / 60) / m.frameDelay) % mt.length;
        const bar = s.doc.resolution * 4;
        const floor = gs.y(gs.laneBottom);
        for (let k = Math.max(0, Math.ceil(p0 / bar)); k * bar <= p1; k++) {
          const y = vp.yOf(k * bar);
          if (y > floor) continue;
          const sp = this.measurePool.next(mt[f]!);
          sp.blendMode = 'add';
          sp.position.set(gs.x(m.left), y - (m.h / 2) * gs.s);
          sp.width = m.w * gs.s;
          sp.height = Math.max(1, m.h * gs.s);
        }
      }
      for (const lane of l.lanes) {
        const t = gs.skin.lanes.get(lane.x)!;
        const bar = gs.tex.lanes.get(lane.x)?.bar;
        if (!bar || !t.bar || !s.pressed.has(lane.x)) continue;
        const h = (t.bar.maxH > 0 ? t.bar.maxH : t.bar.image.height) * gs.s;
        const sp = this.bedPool.next(bar);
        paint(sp, 'add', t.bar.color);
        sp.position.set(lane.left, gs.y(t.y + t.h) - h);
        sp.width = lane.width;
        sp.height = h;
      }
      const kp = gs.skin.keyPanel;
      if (kp && gs.tex.keyPanel) {
        const sp = this.bedPool.next(gs.tex.keyPanel);
        sp.blendMode = 'normal';
        sp.position.set(gs.x(kp.x), gs.y(kp.y));
        sp.width = kp.image.width * gs.s;
        sp.height = kp.image.height * gs.s;
      }
      const tg = gs.skin.target;
      if (tg && gs.tex.target.length) {
        // The marker's frame follows the beat; a frame the skin lacks shows frame 0.
        const t = gs.tex.target[noteVariant(gs.tick, 6)] ?? gs.tex.target[0]!;
        const sp = this.bedPool.next(t);
        sp.blendMode = 'add';
        sp.position.set(gs.x(tg.x), gs.y(tg.y + gs.sway));
        sp.width = t.width * gs.s;
        sp.height = t.height * gs.s;
      }
    }
    this.measurePool.end();
    this.bedPool.end();
  }

  /** The press glows, over the notes. */
  private drawGlow(s: FieldState, gs: GameView | undefined): void {
    this.glowPool.begin();
    if (gs) {
      for (const x of s.pressed) {
        const t = gs.skin.lanes.get(x);
        const tex = gs.tex.lanes.get(x)?.press;
        if (!t?.press || !tex) continue;
        const sp = this.glowPool.next(tex);
        paint(sp, t.press.blend, t.press.color);
        sp.position.set(gs.x(t.press.x), gs.y(t.press.y));
        sp.width = t.press.image.width * gs.s;
        sp.height = t.press.image.height * gs.s;
      }
    }
    this.glowPool.end();
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
    gs: GameView | undefined,
    p0: number,
    p1: number,
  ): void {
    this.bodyPool.begin();
    this.headPool.begin();
    this.ringPool.begin();
    this.beamPool.begin();
    this.chipText.begin();
    const noteH = tex.noteH;
    for (const lane of [...l.lanes, ...l.offLanes]) {
      if (lane.width < 1) continue;
      const alpha = lane.offMode ? 0.4 * this.extras : 1;
      if (alpha <= 0.01) continue;
      if (gs && !lane.offMode) {
        this.drawGameLane(s, l, vp, gs, lane, p0, p1);
        continue;
      }
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
    this.beamPool.end();
    // chipText is shared with the rack; ended there.
  }

  /**
   * One lane's notes in the game's art (scene/skin.c draw_note): the beat's
   * colour variant at the texture's own size, centred in the lane; a hold as
   * the three-slice bar; the beam lines above and below each note.
   */
  private drawGameLane(
    s: FieldState,
    l: Layout,
    vp: Viewport,
    gs: GameView,
    lane: LaneGeom,
    p0: number,
    p1: number,
  ): void {
    const t = gs.skin.lanes.get(lane.x)!;
    const variants = gs.tex.lanes.get(lane.x)!.notes;
    const nt = variants[noteVariant(gs.tick, variants.length)]!;
    const w = nt.w * gs.s;
    const h = nt.h * gs.s;
    const half = h / 2;
    const x = lane.left + (lane.width - w) / 2;
    const px = gs.s;
    const beam = t.beam ? beamColor(t.beam) : null;
    // A fourteenth of the lane's height, at this scroll rate, above and below.
    const bodyH = ((t.h * gs.rate) / 14) * gs.s;
    const bottom = gs.beamBottom;
    const line = (y: number, len: number) => {
      if (!beam || Math.abs(len) < 0.5) return;
      for (const lx of [lane.left, lane.left + lane.width - px]) {
        const sp = this.beamPool.next(len < 0 ? gs.tex.beamUp : gs.tex.beamDown);
        sp.tint = beam.rgb;
        sp.alpha = beam.alpha;
        sp.position.set(lx, len < 0 ? y + len : y);
        sp.width = Math.max(1, px);
        sp.height = Math.abs(len);
      }
    };
    const ring = this.skin.ringFor(this.tex!, lane.kind, lane.width);
    for (const n of s.doc.index.inRange(lane.x, p0, p1)) {
      let y = vp.yOf(n.y);
      if (s.hidden.has(n.id)) {
        if (n.l === 0) continue;
        y = Math.min(y, l.judgeY);
        if (vp.yOf(n.y + n.l) >= l.judgeY) continue;
      }
      if (n.l > 0) {
        const yt = vp.yOf(n.y + n.l);
        const ytop = yt - half;
        const y1 = ytop + half / 2;
        line(y1, -bodyH);
        line(y1 + px, y - ytop);
        line(y + px, Math.max(0, Math.min(bodyH, bottom - y - px)));
        const top = this.headPool.next(nt.top);
        top.position.set(x, ytop);
        top.width = w;
        top.height = half;
        const mid = this.bodyPool.next(nt.mid);
        mid.position.set(x, yt);
        mid.width = w;
        mid.height = Math.max(0, y - yt);
        const foot = this.headPool.next(nt.bottom);
        foot.position.set(x, y);
        foot.width = w;
        foot.height = half;
        if (n.kind !== undefined && n.kind !== 0 && y - yt > 28 && this.extras > 0.02) {
          const label = this.chipText.next(HOLD_LABEL[n.kind] ?? String(n.kind));
          label.tint = KIND_COLOR[lane.kind];
          label.alpha = 0.9 * this.extras;
          label.position.set(
            lane.left + (lane.width - label.width) / 2,
            (y + yt) / 2 - label.height / 2,
          );
        }
      } else {
        line(y, -bodyH);
        line(y + px, Math.max(0, Math.min(bodyH, bottom - y)));
        const head = this.headPool.next(nt.full);
        head.position.set(x, y - half);
        head.width = w;
        head.height = h;
      }
      if (s.selection.has(n.id)) {
        const r = this.ringPool.next(ring);
        r.position.set(lane.left + 1 - PAD, y - half - PAD);
        r.height = h + 2 * PAD;
      }
    }
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

  private drawOverlay(
    s: FieldState,
    l: Layout,
    vp: Viewport,
    tex: SkinTextures,
    gs: GameView | undefined,
  ): void {
    const g = this.overlay;
    g.clear();
    const fl = l.field.left - 4;
    const fw = l.field.right - l.field.left + 8;
    const jy = l.judgeY;
    if (gs?.tex.target.length) {
      // The skin's target bar marks the line; the cursor shows only while editing.
      if (this.extras > 0.02)
        g.rect(fl, jy - 0.5, fw, 1).fill({ color: 0xffffff, alpha: 0.5 * this.extras });
    } else {
      // A band for the lane labels, over past notes.
      if (!gs)
        g.rect(fl, jy + 6 * l.scale, fw, 26 * l.scale).fill({ color: 0x05060a, alpha: 0.88 });
      // The judge line: a neon bar with a baked glow.
      g.rect(fl, jy - 6 * l.scale, fw, 12 * l.scale).fill({ color: NEON, alpha: 0.08 });
      g.rect(fl, jy - 2.5 * l.scale, fw, 5 * l.scale).fill({ color: NEON, alpha: 0.25 });
      g.rect(fl, jy - 1, fw, 2).fill({ color: 0xffffff, alpha: 0.95 });
    }
    const noteH = gs ? gs.noteH : tex.noteH;
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
        g.roundRect(lane.left + 1, y - noteH / 2, lane.width - 2, noteH, 3).fill({
          color: c,
          alpha: 0.35,
        });
        g.roundRect(lane.left + 1, y - noteH / 2, lane.width - 2, noteH, 3).stroke({
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

/** One frame's view of the game skin: design space to the screen, and the port's counters. */
class GameView {
  /** Screen pixels per design unit. */
  readonly s: number;
  /** The chart position in EZ2 ticks (48 a beat), which the note and target frames follow. */
  readonly tick: number;
  /** The panel clock (0 while nothing moves, so a still frame is stable). */
  readonly now: number;
  readonly sway: number;
  /** Design pixels per tick: the port's scroll rate, which sizes the beams. */
  readonly rate: number;
  /** The tallest note, on screen. */
  readonly noteH: number;
  /** Design y of the lowest lane edge. */
  readonly laneBottom: number;
  /** Where the lower beams stop: the target bar's foot (screen). */
  readonly beamBottom: number;

  constructor(
    readonly skin: GameSkin,
    readonly tex: GameSkinTextures,
    private readonly l: Layout,
    st: FieldState,
    vp: Viewport,
  ) {
    this.s = l.scale;
    this.tick = Math.floor((Math.max(0, st.cursor) * 48) / st.doc.resolution);
    this.now = st.live ? performance.now() : 0;
    this.sway = st.live ? targetSway(this.now) : 0;
    this.rate = vp.pxPerBeat / l.scale / 48;
    let nh = 0;
    let lb = 0;
    for (const c of st.columns) {
      const lane = skin.lanes.get(c.x);
      nh = Math.max(nh, lane?.notes[0]?.height ?? 0);
      lb = Math.max(lb, lane ? lane.y + lane.h : 0);
    }
    this.noteH = nh * this.s;
    this.laneBottom = lb;
    const tg = skin.target;
    this.beamBottom = tg
      ? this.y(tg.y + this.sway + (tex.target[0]?.height ?? 6))
      : l.judgeY + 6 * this.s;
  }

  x(dx: number): number {
    return this.l.field.left + (dx - this.l.design!.x0) * this.s;
  }

  y(dy: number): number {
    return this.l.judgeY + (dy - this.l.design!.judgeY) * this.s;
  }
}

/** A .pvi colour on a sprite: tint and, for alpha blending, alpha (an additive quad ignores it). */
function paint(sp: Sprite, blend: SkinBlend, c: { r: number; g: number; b: number; a: number }) {
  sp.blendMode = blend;
  sp.tint = ((c.r & 255) << 16) | ((c.g & 255) << 8) | (c.b & 255);
  sp.alpha = blend === 'add' ? 1 : (c.a & 255) / 255;
}

function solid(c: { r: number; g: number; b: number; a: number }) {
  return {
    color: ((c.r & 255) << 16) | ((c.g & 255) << 8) | (c.b & 255),
    alpha: (c.a & 255) / 255,
  };
}

function fmtBpm(b: number): string {
  return Number.isInteger(b) ? String(b) : b.toFixed(2).replace(/0+$/, '');
}
