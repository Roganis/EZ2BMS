// The playfield: EZ2PORT's lanes and scroll, drawn with Pixi (WebGL).
//
// Draws only when something changed (Edit) or every frame while playing or
// animating. Everything visible is found by binary search on the note index
// and drawn from pooled sprites, so a 50k-note chart costs what is on screen.

import {
  buildGroups,
  groupKeyOf,
  holdPreview,
  keptRecordsOf,
  sayText,
  type KeptRecord,
  multiplierAt,
  scrollEventsOf,
  scrollPoints,
  TickConverter,
  type ScrollChange,
  type ScrollPoint,
  type HoldPreview,
  laneInfo,
  sliceAt,
  type ChannelId,
  type ChartDoc,
  type Column,
  type NoteId,
  type NoteRec,
  type SoundGroup,
  type StemSlice,
  type TimingMap,
} from '@ez2bms/chart-core';
import { Application, Container, FillGradient, Graphics, Sprite } from 'pixi.js';
import { channelHue } from '../colors';
import { i18n, t } from '../i18n/i18n.svelte';
import { beamColor, noteVariant, targetSway, type GameSkin, type SkinBlend } from '../skin/game';
import { GameSkinTextures } from './gameskin';
import {
  computeLayout,
  laneAtX,
  RACK_LABEL,
  Viewport,
  type LaneGeom,
  type Layout,
  type SkinGeometry,
} from './geometry';
import { SpritePool, TextPool } from './pool';
import { hsl, KIND_COLOR, KIND_FILL, NEON, NEON_2, NeonSkin, PAD, type SkinTextures } from './skin';
import { stripKey, StripPainter } from './strip';
import { onsetTimes, stripRows, type StripSpec } from './striprows';

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
  /** The note the draw tool would place (in Classic mode, with what it would key). */
  ghost: { x: number; y: number; l: number; label?: string; bad?: boolean } | null;
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
  /** Classic mode: the rack keeps keyed notes too (as outlines), so keying does not reshuffle it. */
  classic: boolean;
  /** The picked sound; its group's rack column is lit. */
  brush: ChannelId | null;
  /** How far the rack is scrolled sideways, design units. */
  rackScroll: number;
  /** Classic: the rack note whose sound the ghost would key, lit. */
  classicHint: NoteId | null;
  /** Stem strips beside the lanes (Edit), in order. */
  strips: readonly StripSpec[];
  /** Bumped as strip waveforms and onsets arrive. */
  stripsRev: number;
  /** The slice under the pointer: lit in its strip and, when keyed, on its lane. */
  hoverSlice: NoteId | null;
  /** Where a cut would go, or is being moved to: a line across that strip. */
  stripGhost: { strip: number; y: number } | null;
  /** Cuts the stem's onsets would make, drawn on that strip. */
  stripSuggest: { strip: number; ys: readonly number[] } | null;
  /**
   * A recorded take not yet in the chart (play/recorder.svelte.ts), snapped
   * as it will land; with `states` in review: what each note would become.
   */
  take: {
    notes: readonly { x: number; y: number; l: number }[];
    states: readonly ('ok' | 'clash' | 'silent')[] | null;
  } | null;
}

/** A take's notes: fine, on a note already there, or with nothing to key. */
const TAKE_COLOR = { ok: 0x7dffb2, clash: 0xff5c7a, silent: 0x8a8fa8 } as const;

/** Background slices alternate between two tints so neighbours read apart. */
const SLICE_TINTS = [0x58e1ff, 0x9d7bff];
const ONSET = 0xffd166;

/** The game chart's kept records: grey, being read-only. */
const KEPT_COLOR = 0xa3acc2;
/** Scroll changes' flags: cyan, apart from BPM's yellow and STOP's pink. */
const SCROLL_COLOR = 0x5ef2c8;
/** `×1.5`, `×0.75`, `×1.333`: a multiplier in at most three decimals. */
const fmtScroll = (r: number) => `×${Number(r.toFixed(3))}`;

/** A hold kind in a few characters (HOLD_KINDS says it in words). */
const HOLD_LABEL: Record<number, string> = {
  1: '½',
  2: '⅛',
  3: '1/16',
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
  /** The rack's groups and where each note sits in them, rebuilt when the chart changes. */
  private rack: {
    rev: number;
    classic: boolean;
    at: number;
    buildMs: number;
    groups: SoundGroup[];
    place: Map<NoteId, { g: number; sub: number }>;
  } = { rev: -1, classic: false, at: 0, buildMs: 0, groups: [], place: new Map() };
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
  /** Stem strips: their waveforms (one canvas texture each), then lines and marks over them. */
  private readonly stripLayer = new Container();
  private readonly stripLines = new Graphics();
  private readonly stripMarks = new Container();
  private readonly stripCross = new SpritePool(this.stripMarks);
  private readonly stripHi = new Graphics();
  private readonly painters = new Map<string, { painter: StripPainter; sprite: Sprite }>();
  private readonly viewIds = new WeakMap<object, number>();
  private viewSeq = 0;
  /** The game skin's field backdrop, black at 0x96 over black (made once). */
  private backdrop: FillGradient | undefined;
  private readonly bodyPool = new SpritePool(this.holds);
  private readonly headPool = new SpritePool(this.notes);
  private readonly ringPool = new SpritePool(this.rings);
  private readonly chipPool = new SpritePool(this.chips);
  private readonly chipMarks = new Container();
  private readonly crossPool = new SpritePool(this.chipMarks);
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
  private readonly ghostText = new TextPool(this.text, {
    fontFamily: 'sans-serif',
    fontSize: 11,
    fill: 0xffffff,
    fontWeight: 'bold',
  });
  private readonly groupText = new TextPool(this.text, {
    fontFamily: 'sans-serif',
    fontSize: 10,
    fill: 0xffffff,
    fontWeight: 'bold',
  });
  private readonly stripText = new TextPool(this.text, {
    fontFamily: 'sans-serif',
    fontSize: 10,
    fill: 0xffffff,
    fontWeight: 'bold',
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
      r.stripLayer,
      r.stripLines,
      r.stripMarks,
      r.chips,
      r.chipMarks,
      r.notes,
      r.glow,
      r.rings,
      r.stripHi,
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
    for (const p of this.painters.values()) p.painter.destroy();
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

  /** Where a background note's chip was last drawn (screen pixels), if it was. */
  rackBox(id: NoteId): { x: number; y: number; w: number; h: number } | undefined {
    return this.rackHits.find((h) => h.id === id);
  }

  /** Whether a screen x is over the background rack. */
  overRack(px: number): boolean {
    const l = this.layout;
    return !!l && l.rack.width > 0 && px >= l.rack.left - 6 && px <= l.rack.left + l.rack.width + 6;
  }

  /** The stem strip under a screen x (its index in the strips drawn), if any. */
  stripAt(px: number): number | undefined {
    const l = this.layout;
    if (!l || this.extras < 0.5) return undefined;
    const i = l.strips.findIndex((g) => px >= g.left && px < g.left + g.width);
    return i < 0 ? undefined : i;
  }

  /** Where a strip is on screen, and its header's height. */
  stripBox(i: number): { left: number; width: number; header: number } | undefined {
    const l = this.layout;
    const g = l?.strips[i];
    return g && l ? { ...g, header: RACK_LABEL * l.scale } : undefined;
  }

  /**
   * The slice of strip i at screen y: its cut line when within a few pixels
   * of one (a fresh hit's too, though that cannot move), else the slice
   * playing there.
   */
  stripSliceAt(i: number, py: number): { slice: StemSlice; part: 'line' | 'body' } | undefined {
    const spec = this.state?.strips[i];
    const vp = this.vp;
    if (!spec || !vp) return undefined;
    let best: { slice: StemSlice; d: number } | undefined;
    for (const sl of spec.view.slices) {
      const d = Math.abs(vp.yOf(sl.y) - py);
      if (d <= 4 && (!best || d < best.d)) best = { slice: sl, d };
    }
    if (best) return { slice: best.slice, part: 'line' };
    const p = vp.pulseOf(py);
    if (p < 0) return undefined;
    const hit = sliceAt(spec.view, spec.timeline.msAt(p));
    return hit ? { slice: hit, part: 'body' } : undefined;
  }

  /** How far the rack can scroll, design units (0 when it fits). */
  get rackMaxScroll(): number {
    const l = this.layout;
    if (!l || !l.rack.width || !this.extras) return 0;
    return (l.rack.content - l.rack.width) / (l.scale * this.extras);
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
    if (this.rack.rev !== s.rev || this.rack.classic !== s.classic) {
      // A big chart's rack takes a few ms to regroup; while a drag streams
      // changes, regroup at most every 150 ms (and once more when it settles).
      const now = performance.now();
      if (this.rack.buildMs > 8 && now - this.rack.at < 150) animating = true;
      else this.buildRack(s, now);
    }
    const l = computeLayout({
      width: W,
      height: H,
      columns: s.columns,
      offModeXs,
      strips: s.strips.length,
      rackGroups: this.rack.groups,
      rackScroll: s.rackScroll,
      extras: this.extras,
      skin: game?.geom,
    });
    this.layout = l;
    // In Play the field scrolls at the player's speed times the chart's own
    // multiplier at the cursor (its scroll changes). While the chart plays,
    // the spacing chases that the way EZ2PORT's live rate does - a tenth of
    // the gap per 60 Hz frame (ez2_scroll_tick), here per elapsed 1/60 s so
    // a 144 Hz display eases as fast - and the whole field rescales at once.
    // Otherwise (zoom, speed, Edit <-> Play) it eases a quarter per frame.
    const mult = s.mode === 'play' ? this.multiplierAt(s) : 1;
    const wantPx = s.pxPerBeat * mult * l.scale;
    const frameAt = performance.now();
    const dt = this.lastFrameAt ? Math.min(250, frameAt - this.lastFrameAt) : 1000 / 60;
    this.lastFrameAt = frameAt;
    const k = s.live && s.mode === 'play' ? 1 - Math.pow(1 - 0.1, dt / (1000 / 60)) : 0.25;
    if (!this.shownPx) this.shownPx = wantPx;
    this.shownPx += (wantPx - this.shownPx) * k;
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
    this.drawStrips(s, l, vp, tex, p0, p1);
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
    this.groupText.begin();
    if (l.rack.width && this.extras > 0.02) {
      const r = l.rack;
      const brush = s.brush !== null ? s.doc.channel(s.brush) : undefined;
      const lit = brush ? groupKeyOf(brush.name) : undefined;
      g.rect(r.left - 4, 0, r.width + 8, H).fill({ color: 0xffffff, alpha: 0.015 * this.extras });
      for (const grp of r.groups) {
        const x0 = Math.max(grp.left, r.left);
        const x1 = Math.min(grp.left + grp.width, r.left + r.width);
        if (x1 <= x0) continue;
        const on = grp.key === lit;
        g.rect(x0, 0, x1 - x0, H).fill({
          color: on ? NEON : 0xffffff,
          alpha: (on ? 0.07 : 0.02) * this.extras,
        });
        // Faint lines between sub-lanes; the group label strip on top.
        for (let k = 1; k < grp.subLanes; k++) {
          const x = grp.left + k * r.sub;
          if (x > x0 && x < x1)
            g.rect(x, r.labelH, 1, H - r.labelH).fill({
              color: 0xffffff,
              alpha: 0.04 * this.extras,
            });
        }
        g.rect(x0, 0, x1 - x0, r.labelH).fill({
          color: on ? NEON : 0x1a2034,
          alpha: (on ? 0.35 : 0.9) * this.extras,
        });
        if (x1 - x0 >= 18) {
          const t = this.groupText.next(grp.key.slice(grp.key.lastIndexOf('/') + 1));
          t.scale.set(Math.min(1.2, l.scale * 0.7));
          t.alpha = this.extras;
          t.tint = on ? 0xffffff : 0xa9b3d6;
          // Cut long names to the column rather than let them run over the next.
          const room = x1 - x0 - 4;
          if (t.width > room) {
            const name = t.text;
            const keep = Math.max(1, Math.floor((name.length * room) / t.width) - 1);
            t.text = `${name.slice(0, keep)}…`;
          }
          t.position.set(x0 + 2, (r.labelH - t.height) / 2);
        }
      }
      if (r.content > r.width) {
        // A scrollbar under the labels shows where the window onto the rack is.
        const k = r.width / r.content;
        g.rect(r.left + r.scroll * k, r.labelH, r.width * k, 2).fill({
          color: NEON,
          alpha: 0.6 * this.extras,
        });
      }
    }
    this.groupText.end();
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
      l.rack.left + l.rack.width,
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
    // A flag sits on its line; `below` hangs it under the line instead, so a
    // scroll change and a BPM change at one spot both read.
    const flag = (p: number, label: string, color: number, below = false, alpha = 0.9) => {
      const y = vp.yOf(p);
      const t = this.markText.next(label);
      t.scale.set(Math.min(1.3, l.scale * 0.75));
      const w = t.width + 8;
      const x = l.gutter.right - w - 14 * l.scale;
      const top = below ? y + 1 : y - t.height - 3;
      g.roundRect(x, top, w, t.height + 4, 3).fill({ color, alpha });
      g.moveTo(x + w, y + 0.5)
        .lineTo(l.field.right + 4, y + 0.5)
        .stroke({ width: 1, color, alpha: alpha / 2 });
      t.tint = 0x05060a;
      t.position.set(x + 4, top + 2);
    };
    const bpms = [{ y: 0, bpm: d.info.initBpm ?? 120 }, ...d.bpmEvents.filter((e) => e.y > 0)];
    for (const e of bpms) if (e.y >= p0 && e.y <= p1) flag(e.y, fmtBpm(e.bpm), 0xffd11f);
    for (const e of d.stopEvents)
      if (e.y >= p0 && e.y <= p1) flag(e.y, `STOP ${e.duration}`, 0xff4fd8);
    // Scroll changes; those an older import kept (not yet the chart's own:
    // Issues turns them into its own) are dimmer.
    for (const e of this.scrollOf(s.doc).events)
      if (e.y >= p0 && e.y <= p1)
        flag(e.y, fmtScroll(e.rate), SCROLL_COLOR, true, e.from.kind === 'event' ? 0.9 : 0.5);
    // The game chart's own records (volume, marks...: x_ez_records), grey
    // and read-only, hanging under their line at the gutter's left, one tag
    // per position. Edit only; hovering one says what each is.
    this.keptHits = [];
    if (this.extras > 0.02)
      for (const k of this.keptOf(s.doc)) {
        if (k.y < p0 || k.y > p1) continue;
        const y = vp.yOf(k.y);
        const t = this.markText.next(k.label);
        t.scale.set(Math.min(1.2, l.scale * 0.65));
        const w = t.width + 6;
        const x = l.gutter.left + 4 * l.scale;
        const a = 0.75 * this.extras;
        g.roundRect(x, y + 1, w, t.height + 2, 2).fill({ color: KEPT_COLOR, alpha: 0.35 * a });
        g.moveTo(x, y + 0.5)
          .lineTo(l.field.left, y + 0.5)
          .stroke({ width: 1, color: KEPT_COLOR, alpha: 0.5 * a });
        t.tint = KEPT_COLOR;
        t.alpha = a;
        t.position.set(x + 3, y + 2);
        this.keptHits.push({ x, y: y + 1, w, h: t.height + 2, recs: k.recs });
      }
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
            const t = this.chipText.next(this.holdLabel(s, n));
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
          const label = this.chipText.next(this.holdLabel(s, n));
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

  /** A strip's StemView by identity, for its paint key (views are cached until they change). */
  private viewId(o: object): number {
    let id = this.viewIds.get(o);
    if (id === undefined) this.viewIds.set(o, (id = ++this.viewSeq));
    return id;
  }

  private drawStrips(
    s: FieldState,
    l: Layout,
    vp: Viewport,
    tex: SkinTextures,
    p0: number,
    p1: number,
  ): void {
    const g = this.stripLines;
    const hi = this.stripHi;
    g.clear();
    hi.clear();
    this.stripText.begin();
    this.stripCross.begin();
    const used = new Set<string>();
    const H = l.height;
    const header = RACK_LABEL * l.scale;
    const dpr = this.app.renderer.resolution;
    const shown = this.extras > 0.02;
    s.strips.forEach((spec, i) => {
      const box = l.strips[i];
      if (!box || box.width < 2 || !shown) return;
      used.add(spec.src);
      const view = spec.view;
      const lit = new Set<number>();
      view.slices.forEach((sl, k) => {
        if (s.selection.has(sl.id) || s.hoverSlice === sl.id) lit.add(k);
      });
      // The column, lit when it is the one slicing acts on.
      g.rect(box.left, 0, box.width, H).fill({
        color: spec.focused ? NEON : 0xffffff,
        alpha: (spec.focused ? 0.045 : 0.02) * this.extras,
      });
      // The waveform, painted again only when something it shows changed.
      let p = this.painters.get(spec.src);
      if (!p) {
        const painter = new StripPainter();
        const sprite = new Sprite(painter.texture);
        this.stripLayer.addChild(sprite);
        this.painters.set(spec.src, (p = { painter, sprite }));
      }
      const w = Math.max(1, Math.round(box.width));
      const key = stripKey([
        this.viewId(view),
        this.viewId(spec.timeline),
        s.cursor,
        vp.pxPerBeat,
        vp.judgeY,
        w,
        H,
        dpr,
        s.stripsRev,
        [...lit].join(','),
      ]);
      if (p.painter.stale(key))
        p.painter.paint(key, stripRows(spec, vp, H), w, H, dpr, {
          of: (k) => {
            const sl = view.slices[k]!;
            if (sl.keyed) return KIND_COLOR[laneInfo(sl.x)?.kind ?? 'white'];
            return SLICE_TINTS[sl.index % 2]!;
          },
          lit: (k) => lit.has(k),
        });
      p.sprite.visible = true;
      p.sprite.position.set(box.left, 0);
      p.sprite.width = w;
      p.sprite.height = H;
      p.sprite.alpha = this.extras;

      // Beats, faintly, to read the stem against the grid.
      const res = s.doc.resolution;
      for (let q = Math.ceil(p0 / res) * res; q <= p1; q += res) {
        const y = Math.round(vp.yOf(q)) + 0.5;
        g.rect(box.left, y, box.width, 1).fill({ color: 0xffffff, alpha: 0.05 * this.extras });
      }
      // The cuts: where a sound starts, bright; a continuation, a thin line and the rack's red cross.
      const size = tex.cross.height - 2 * PAD;
      for (const sl of view.slices) {
        if (sl.y < p0 - res || sl.y > p1 + res) continue;
        const y = vp.yOf(sl.y);
        if (y < header) continue;
        if (sl.fresh) {
          g.rect(box.left, y - 1, box.width, 2).fill({ color: 0xffffff, alpha: 0.9 * this.extras });
          g.poly([box.left, y - 5, box.left + 7, y, box.left, y + 5]).fill({
            color: 0xffffff,
            alpha: this.extras,
          });
        } else {
          g.rect(box.left, y - 0.5, box.width, 1).fill({
            color: 0xffffff,
            alpha: 0.5 * this.extras,
          });
          const m = this.stripCross.next(tex.cross);
          m.position.set(box.left + box.width - size - PAD - 1, y - size / 2 - PAD);
          m.alpha = this.extras;
        }
        if (sl.keyed) {
          const info = laneInfo(sl.x);
          const t = this.stripText.next(info?.short ?? String(sl.x));
          t.scale.set(Math.min(1.1, l.scale * 0.65));
          t.tint = KIND_COLOR[info?.kind ?? 'white'];
          t.alpha = this.extras;
          t.position.set(box.left + 9, y - t.height - 1);
        }
      }
      // Onsets: ticks on the right edge, stronger ones brighter.
      if (spec.onsets.length) {
        const t0 = spec.timeline.msAt(Math.max(0, p0));
        const t1 = spec.timeline.msAt(Math.max(0, p1));
        for (const o of onsetTimes(view, spec.onsets, spec.minStrength, t0, t1)) {
          const y = vp.yOf(spec.timeline.pulseAt(o.ms));
          if (y < header) continue;
          g.rect(box.left + box.width - 7, y - 0.75, 7, 1.5).fill({
            color: ONSET,
            alpha: (0.3 + 0.7 * o.strength) * this.extras,
          });
        }
      }
      // Cuts at onsets, suggested.
      if (s.stripSuggest?.strip === i) {
        for (const q of s.stripSuggest.ys) {
          if (q < p0 || q > p1) continue;
          const y = vp.yOf(q);
          for (let x = box.left; x < box.left + box.width; x += 5)
            g.rect(x, y - 0.75, Math.min(3, box.left + box.width - x), 1.5).fill({
              color: ONSET,
              alpha: 0.9 * this.extras,
            });
        }
      }
      // Where a cut would go.
      if (s.stripGhost?.strip === i) {
        const y = vp.yOf(s.stripGhost.y);
        for (let x = box.left; x < box.left + box.width; x += 6)
          g.rect(x, y - 1, Math.min(4, box.left + box.width - x), 2).fill({
            color: NEON,
            alpha: this.extras,
          });
      }
      // The header: the file, its length and tempo.
      g.rect(box.left, 0, box.width, header).fill({
        color: spec.focused ? NEON : 0x1a2034,
        alpha: (spec.focused ? 0.35 : 0.9) * this.extras,
      });
      const t = this.stripText.next(spec.label);
      t.scale.set(Math.min(1.2, l.scale * 0.62));
      t.tint = spec.focused ? 0xffffff : 0xa9b3d6;
      t.alpha = this.extras;
      const room = box.width - 4;
      if (t.width > room) {
        const name = t.text;
        const keep = Math.max(1, Math.floor((name.length * room) / t.width) - 1);
        t.text = `${name.slice(0, keep)}…`;
      }
      t.position.set(box.left + 2, (header - t.height) / 2);
    });
    // The hovered slice's note on its lane, ringed.
    const n = s.hoverSlice !== null ? s.doc.index.get(s.hoverSlice) : undefined;
    if (n && n.x !== 0 && shown) {
      const lane = [...l.lanes, ...l.offLanes].find((g2) => g2.x === n.x);
      if (lane) {
        const y = vp.yOf(n.y);
        hi.rect(lane.left - 2, y - 7, lane.width + 4, 14).stroke({
          width: 2,
          color: 0xffffff,
          alpha: 0.9,
        });
      }
    }
    for (const [src, p] of this.painters) {
      if (used.has(src)) continue;
      p.sprite.visible = false;
      if (!s.strips.some((x) => x.src === src)) {
        p.sprite.destroy();
        p.painter.destroy();
        this.painters.delete(src);
      }
    }
    this.stripText.end();
    this.stripCross.end();
  }

  /** Group the chart's sounds for the rack (BmsTWO's Classic BMS layout). */
  private buildRack(s: FieldState, now: number): void {
    const doc = s.doc;
    const t0 = performance.now();
    const notesOf = s.classic
      ? (ch: ChannelId) => doc.index.channel(ch)
      : (ch: ChannelId) => doc.index.channel(ch).filter((n) => n.x === 0);
    // A chip is drawn a few pixels tall: half a beat keeps neighbours apart at
    // an ordinary zoom (BmsTWO counts a sound as one tick long).
    const groups = buildGroups(doc.data.channels, notesOf, {
      minExtent: doc.resolution / 2,
      keepEmpty: false,
    });
    const place = new Map<NoteId, { g: number; sub: number }>();
    groups.forEach((grp, g) => {
      for (const p of grp.placements) place.set(p.id, { g, sub: p.sub });
    });
    this.rack = {
      rev: s.rev,
      classic: s.classic,
      at: now,
      buildMs: performance.now() - t0,
      groups,
      place,
    };
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
    this.crossPool.begin();
    this.rackHits = [];
    const r = l.rack;
    if (r.width && this.extras > 0.02) {
      const notes = s.doc.index.inRange(0, p0, p1);
      const keyed: NoteRec[] = [];
      if (s.classic)
        for (const x of s.doc.index.laneKeys())
          if (x !== 0) keyed.push(...s.doc.index.inRange(x, p0, p1));
      const labels = notes.length < 400 && vp.pxPerPulse * s.doc.resolution >= 70;
      const chipW = Math.max(4, r.sub - 3);
      const chipH = tex.chip.height - 2 * PAD;
      const draw = (n: NoteRec, ghost: boolean) => {
        const at = this.rack.place.get(n.id);
        const grp = at && r.groups[at.g];
        if (!grp) return;
        const x = grp.left + at.sub * r.sub + 1;
        // Only what is inside the rack's window (it scrolls).
        if (x < r.left - 0.5 || x + chipW > r.left + r.width + 0.5) return;
        const y = vp.yOf(n.y);
        if (y < r.labelH) return;
        const ch = s.doc.channel(n.ch);
        const c = this.chipPool.next(tex.chip);
        c.position.set(x - PAD, y - chipH / 2 - PAD);
        c.width = chipW + 2 * PAD;
        const sel = s.selection.has(n.id);
        const hinted = s.classicHint === n.id;
        c.tint = sel || hinted ? 0xffffff : hsl(channelHue(ch?.name ?? ''), 0.8, 0.62);
        // A keyed note (Classic) stays in its place as a faint outline.
        c.alpha = (hinted ? 1 : ghost ? 0.22 : sel ? 1 : 0.8) * this.extras;
        if (ghost) return;
        this.rackHits.push({ id: n.id, x, y: y - chipH / 2, w: chipW, h: chipH });
        if (n.c) {
          const m = this.crossPool.next(tex.cross);
          const size = tex.cross.height - 2 * PAD;
          m.position.set(x + chipW - size - PAD, y - size / 2 - PAD);
          m.alpha = this.extras;
        }
        if (labels) {
          const t = this.chipText.next((ch?.name ?? '?').replace(/\.[^.]+$/, '').slice(0, 6));
          t.alpha = 0.75 * this.extras;
          t.position.set(x + 1, y - t.height - 3);
        }
      };
      for (const n of keyed) draw(n, true);
      for (const n of notes) draw(n, false);
    }
    this.chipPool.end();
    this.crossPool.end();
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
    // The draw tool's ghost (in Classic mode, named after what it would key).
    this.ghostText.begin();
    if (s.ghost && s.mode === 'edit') {
      const lane = [...l.lanes, ...l.offLanes].find((g2) => g2.x === s.ghost!.x);
      if (lane) {
        const y = vp.yOf(s.ghost.y);
        const c = s.ghost.bad ? 0x8a8fa8 : KIND_COLOR[lane.kind];
        if (s.ghost.label) {
          const t = this.ghostText.next(s.ghost.label);
          t.tint = s.ghost.bad ? 0xff7a7a : NEON;
          t.scale.set(Math.min(1.3, l.scale * 0.8));
          t.position.set(lane.left + lane.width + 6, y - t.height / 2);
        }
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
    this.ghostText.end();
    if (this.extras > 0.02) this.drawHoldTicks(g, s, l, vp);
    if (s.take) this.drawTake(g, s.take, l, vp, noteH);
    if (s.marquee) {
      const m = s.marquee;
      const x = Math.min(m.x0, m.x1);
      const y = Math.min(m.y0, m.y1);
      g.rect(x, y, Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0))
        .fill({ color: NEON, alpha: 0.07 })
        .stroke({ width: 1, color: NEON, alpha: 0.8 });
    }
  }

  /** The chart's scroll changes, as flags and on the tick axis, kept until it changes. */
  private scrollOf(doc: ChartDoc): {
    tc: TickConverter;
    points: ScrollPoint[];
    events: ScrollChange[];
  } {
    const c = this.scrollCache;
    if (c.doc !== doc || c.version !== doc.version || !c.tc) {
      const tc = new TickConverter(doc.resolution, doc.data.stopEvents);
      c.doc = doc;
      c.version = doc.version;
      c.tc = tc;
      c.points = scrollPoints(doc.data, (y) => tc.tick(y).tick);
      c.events = scrollEventsOf(doc.data);
    }
    return { tc: c.tc, points: c.points, events: c.events };
  }
  private readonly scrollCache = {
    doc: undefined as ChartDoc | undefined,
    version: -1,
    tc: undefined as TickConverter | undefined,
    points: [] as ScrollPoint[],
    events: [] as ScrollChange[],
  };

  /** The chart's multiplier at the cursor's (fractional) EZ tick, as EZ2PORT walks it. */
  private multiplierAt(s: FieldState): number {
    const { tc, points } = this.scrollOf(s.doc);
    if (!points.length) return 1;
    return multiplierAt(points, (tc.shift(Math.max(0, s.cursor)) * 48) / s.doc.resolution);
  }
  private lastFrameAt = 0;

  /** Kept records by position, labelled, kept until the chart changes. */
  private keptOf(doc: ChartDoc): { y: number; label: string; recs: KeptRecord[] }[] {
    const c = this.keptCache;
    // Labelled in the language chosen: a switch labels them again.
    const lang = `${i18n.locale}${i18n.pseudo ? '*' : ''}`;
    if (c.doc === doc && c.version === doc.version && c.lang === lang) return c.groups;
    const byY = new Map<number, KeptRecord[]>();
    // Scroll changes that play are drawn with the chart's own flags.
    for (const k of keptRecordsOf(doc.data)) {
      if (k.scroll !== undefined) continue;
      const list = byY.get(k.y) ?? [];
      list.push(k);
      byY.set(k.y, list);
    }
    c.doc = doc;
    c.version = doc.version;
    c.lang = lang;
    c.groups = [...byY].map(([y, recs]) => {
      const shorts = [...new Set(recs.map((r) => sayText(r.shortSaid)))];
      const label =
        shorts.length === 1
          ? shorts[0]! + (recs.length > 1 ? ` ×${recs.length}` : '')
          : `${shorts[0]} +${recs.length - 1}`;
      return { y, label, recs };
    });
    return c.groups;
  }
  private readonly keptCache = {
    doc: undefined as ChartDoc | undefined,
    version: -1,
    lang: '',
    groups: [] as { y: number; label: string; recs: KeptRecord[] }[],
  };
  private keptHits: { x: number; y: number; w: number; h: number; recs: KeptRecord[] }[] = [];

  /** The kept records whose tag is under a point (CSS pixels), for the tooltip. */
  keptAt(px: number, py: number): KeptRecord[] | undefined {
    return this.keptHits.find((k) => px >= k.x && px <= k.x + k.w && py >= k.y && py <= k.y + k.h)
      ?.recs;
  }

  /** The Play field's scroll rate as drawn: 1 is 76.8 design px a beat (EZ2PORT's 100 %). */
  get liveRate(): number {
    return this.layout ? this.shownPx / this.layout.scale / 76.8 : 0;
  }

  /**
   * A hold's preview, kept until the chart changes: the label and the ticks
   * ask for every visible hold on every frame.
   */
  private preview(s: FieldState, n: NoteRec): HoldPreview | undefined {
    const c = this.previews;
    if (c.doc !== s.doc || c.version !== s.doc.version) {
      c.doc = s.doc;
      c.version = s.doc.version;
      c.map.clear();
    }
    if (!c.map.has(n.id)) c.map.set(n.id, holdPreview(s.doc.data, n));
    return c.map.get(n.id);
  }
  private readonly previews = {
    doc: undefined as ChartDoc | undefined,
    version: -1,
    map: new Map<number, HoldPreview | undefined>(),
  };

  /** A hold's kind and what a clean play is paid for it: `½ ×7`. */
  private holdLabel(s: FieldState, n: NoteRec): string {
    // Kinds 4 and 5 pay once, after the end: a word, so the catalog's, read
    // when drawn (the playfield redraws when the language changes).
    const k =
      n.kind === 4 || n.kind === 5
        ? t('field.holdEnd')
        : (HOLD_LABEL[n.kind ?? 0] ?? String(n.kind));
    const p = this.preview(s, n);
    return p?.pays ? `${k} ×${p.pays}` : k;
  }

  /**
   * Where each hold pays an instalment while held (engine/holdpreview.ts):
   * a short bar across the body, in Edit. Left out where they would crowd
   * closer than 5 px - the label still says how many.
   */
  private drawHoldTicks(g: Graphics, s: FieldState, l: Layout, vp: Viewport): void {
    const [p0, p1] = vp.visible(l.height);
    const res = s.doc.resolution;
    for (const lane of l.lanes) {
      if (lane.width < 6) continue;
      const w = Math.max(4, lane.width * 0.5);
      // A beat of margin: kinds 4 and 5 pay 6 ticks past the tail.
      for (const n of s.doc.index.inRange(lane.x, p0 - res, p1)) {
        if (n.l <= 0) continue;
        const p = this.preview(s, n);
        if (!p?.at.length) continue;
        const gap = p.at.length > 1 ? Math.abs(vp.yOf(p.at[1]!) - vp.yOf(p.at[0]!)) : 99;
        if (gap < 5) continue;
        // Leave the kind label (drawn mid-body on holds over 28 px) readable.
        const ya = vp.yOf(n.y);
        const yb = vp.yOf(n.y + n.l);
        const mid = (n.kind ?? 0) !== 0 && ya - yb > 28 ? (ya + yb) / 2 : -1e9;
        for (const at of p.at) {
          if (at < p0 || at > p1) continue;
          const y = vp.yOf(at);
          if (Math.abs(y - mid) < 8) continue;
          g.rect(lane.left + (lane.width - w) / 2, y - 1, w, 2).fill({
            color: 0xffffff,
            alpha: 0.6 * this.extras,
          });
        }
      }
    }
  }

  /**
   * A take's ghost notes: outlined, in the take's colour (or, in review, by
   * what each would become), holds as a faint bar. Only what is on screen.
   */
  private drawTake(
    g: Graphics,
    take: NonNullable<FieldState['take']>,
    l: Layout,
    vp: Viewport,
    noteH: number,
  ): void {
    const lanes = [...l.lanes, ...l.offLanes];
    take.notes.forEach((n, i) => {
      const lane = lanes.find((g2) => g2.x === n.x);
      if (!lane) return;
      const y = vp.yOf(n.y);
      const ye = n.l > 0 ? vp.yOf(n.y + n.l) : y;
      if (y < -noteH || ye > l.height + noteH) return;
      const c = TAKE_COLOR[take.states?.[i] ?? 'ok'];
      if (n.l > 0)
        g.rect(lane.left + lane.width * 0.2, ye, lane.width * 0.6, y - ye).fill({
          color: c,
          alpha: 0.22,
        });
      g.roundRect(lane.left + 2, y - noteH / 2, lane.width - 4, noteH, 3)
        .fill({ color: c, alpha: 0.28 })
        .stroke({ width: 1.5, color: c, alpha: 0.95 });
    });
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
