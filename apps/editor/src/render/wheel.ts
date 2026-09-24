// The song-select wheel as EZ2PORT draws it, in Canvas 2D (a second WebGL
// context beside the playfield's is what WebKitGTK handles worst). Where
// everything sits and how it moves is chart-core's ez2data/selectwheel.ts,
// checked against the port by the oracle; the layering here is
// tools/ez2play/select.c's, read off the original's m439f00/m438d30:
//
//   the carousel: per disc on the arc, the base mask (9,6), the art (2,2),
//   the ring (9,6) - the focused one turning with the tier swing;
//   the rail: the strip (9,6) at (0,64) stretched 490 tall, then every
//   title plate (2,2) with its left edge white and its right edge the
//   row's band.
//
// Blend (9,6) is DESTCOLOR/INVSRCALPHA: dst * (src*b + 1 - b) for a texel
// of brightness b, which is exactly canvas 'multiply' at globalAlpha b; keyed
// black (alpha 0) leaves the screen alone either way. (2,2) is ONE/ONE:
// 'lighter' at globalAlpha b. The screen's animated parts (.str: the
// backdrop, the rail cursor, the frame) are Milestone 8's; a neon stand-in
// takes the backdrop's place, and any mask the game folder lacks.

import {
  SWING_TIER_INDEX,
  railPlace,
  railSlots,
  selectWheel,
  swingTick,
  wheelChase,
  wheelPlace,
  wheelStep,
  type SelectWheel,
  type Tier,
} from '@ez2bms/chart-core';

export const SCREEN_W = 640;
export const SCREEN_H = 480;

export type Picture = HTMLCanvasElement | OffscreenCanvas | ImageBitmap;

/** The select screen's art from the game folder (skin/select.ts); null draws a stand-in. */
export interface WheelArt {
  discMask: Picture | null;
  shapeMask: Picture | null;
  railStrip: Picture | null;
  stageMask: Picture | null;
  stagePlate: Picture | null;
}

export const NO_ART: WheelArt = {
  discMask: null,
  shapeMask: null,
  railStrip: null,
  stageMask: null,
  stagePlate: null,
};

/** One song on the wheel. */
export interface WheelEntry {
  /** Its title plate, 256x32 RGB on black; a song without one has no row (as in the port). */
  plate: Picture | null;
  /** The focused disc: a package has one for every tier. Without it the focus draws as a thumb. */
  disc: Picture | null;
  /**
   * The thumb drawn while the disc flies along the arc - system\discsmall\<key>,
   * which a package never has: the port asks the game tree, not the package.
   */
  thumb: Picture | null;
}

/** A canvas holding straight RGB (opaque) or RGBA pixels. */
export function toPicture(w: number, h: number, px: Uint8Array, channels: 3 | 4): Picture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const id = g.createImageData(w, h);
  if (channels === 4) id.data.set(px.subarray(0, w * h * 4));
  else
    for (let i = 0; i < w * h; i++) {
      id.data[i * 4] = px[i * 3]!;
      id.data[i * 4 + 1] = px[i * 3 + 1]!;
      id.data[i * 4 + 2] = px[i * 3 + 2]!;
      id.data[i * 4 + 3] = 255;
    }
  g.putImageData(id, 0, 0);
  return c;
}

/**
 * The wheel's state at 60 ticks a second, as the select screen keeps it:
 * the cursor and its chasing scroll, the idle dwell, and the focused disc's
 * swing - latched afresh on each song that comes to rest at the focus.
 */
export class WheelScene {
  readonly wheel: SelectWheel;
  /** NM, HD, SHD, EX: the tier selected (the game's st->tier). */
  tier = 0;
  /** The entry the swing is latched on, its angle (degrees), tier index and step. */
  swingFor = -1;
  angle = 0;
  swingDiff = 0;
  swingStep = -30;
  ticks = 0;

  constructor(count: number, cursor = 0) {
    this.wheel = selectWheel(count, cursor);
  }

  setTier(t: Tier): void {
    this.tier = ['NM', 'HD', 'SHD', 'EX'].indexOf(t);
  }

  /**
   * One tick: the buttons, the chase, then the focus - a song at full size
   * under the cursor, with a disc to show - and its swing toward the tier's
   * rest angle. Returns the cursor's net step.
   */
  tick(down: boolean, up: boolean, hasDisc: (entry: number) => boolean): number {
    this.ticks++;
    const moved = wheelStep(this.wheel, down, up);
    wheelChase(this.wheel);
    const ci = this.wheel.cursor;
    const p = wheelPlace(this.wheel, ci);
    if (p && p.size >= 176 && hasDisc(ci)) {
      if (this.swingFor !== ci) {
        this.swingFor = ci;
        this.angle = 0;
        this.swingDiff = 0;
        this.swingStep = -30;
      }
      const di = Object.values(SWING_TIER_INDEX)[this.tier] ?? 0;
      if (di !== this.swingDiff) {
        this.swingStep = -this.swingStep;
        this.swingDiff = di;
      }
      [this.angle, this.swingStep] = swingTick(this.swingDiff, this.angle, this.swingStep);
    }
    return moved;
  }

  /** Whether the entry at the cursor is drawn as the turning focus right now. */
  focused(entry: number, hasDisc: boolean): boolean {
    const p = wheelPlace(this.wheel, entry);
    return !!p && p.size >= 176 && entry === this.wheel.cursor && hasDisc;
  }
}

const f = Math.fround;

/** The arc the discs fly along: the focus's path for d -400..800 (wheelPlace's range). */
function arcPoints(): [number, number][] {
  const pts: [number, number][] = [];
  for (let d = -398; d < 800; d += 8) {
    const p = wheelPlace({ count: 100, cursor: 0, scroll: f(-d / 2), idle: 0 }, 0);
    if (p) pts.push([p.x, p.y]);
  }
  return pts;
}

/** The dark sky the port fills before its backdrop, and a neon stand-in for the backdrop. */
function backdrop(): Picture {
  const c = document.createElement('canvas');
  c.width = SCREEN_W;
  c.height = SCREEN_H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#101018';
  g.fillRect(0, 0, SCREEN_W, SCREEN_H);
  const sky = g.createRadialGradient(470, 230, 20, 470, 230, 420);
  sky.addColorStop(0, 'rgba(40, 90, 170, 0.55)');
  sky.addColorStop(0.45, 'rgba(30, 30, 90, 0.35)');
  sky.addColorStop(1, 'rgba(8, 8, 20, 0)');
  g.fillStyle = sky;
  g.fillRect(0, 0, SCREEN_W, SCREEN_H);
  g.strokeStyle = 'rgba(88, 225, 255, 0.08)';
  g.lineWidth = 1;
  for (let y = 24; y < SCREEN_H; y += 24) {
    g.beginPath();
    g.moveTo(0, y + 0.5);
    g.lineTo(SCREEN_W, y + 0.5);
    g.stroke();
  }
  // The disc's own track, from the port's arithmetic.
  g.strokeStyle = 'rgba(88, 225, 255, 0.28)';
  g.lineWidth = 2;
  g.beginPath();
  arcPoints().forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
  return c;
}

export class WheelPainter {
  private readonly sky = backdrop();
  private readonly row: HTMLCanvasElement = document.createElement('canvas');

  constructor() {
    this.row.width = 256;
    this.row.height = 32;
  }

  /** The select screen: backdrop, carousel, rail. */
  drawWheel(
    g: CanvasRenderingContext2D,
    s: WheelScene,
    entries: readonly WheelEntry[],
    art: WheelArt,
  ): void {
    g.save();
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.sky, 0, 0);
    for (let ci = 0; ci < s.wheel.count; ci++) this.disc(g, s, ci, entries[ci], art);
    this.rail(g, s, entries, art);
    g.restore();
  }

  private disc(
    g: CanvasRenderingContext2D,
    s: WheelScene,
    ci: number,
    e: WheelEntry | undefined,
    art: WheelArt,
  ): void {
    const p = wheelPlace(s.wheel, ci);
    if (!p) return;
    const b = p.bright / 255;
    const [dx, dy] = [p.x - p.size * 0.5, p.y - p.size * 0.5];
    if (!s.focused(ci, !!e?.disc)) {
      // The drawer's unfocused layering: base, thumb, ring at size + 3.
      this.mask(g, art.discMask, dx, dy, p.size, 0, b, 'base');
      if (e?.thumb) blit(g, e.thumb, dx, dy, p.size, p.size, 0, 'lighter', b);
      this.mask(g, art.shapeMask, dx, dy, p.size + 3, 0, b, 'ring');
      return;
    }
    // THE FOCUS: the base twice, turning; the art (the NM face below 180
    // degrees - a package's is the same disc); the ring still.
    this.mask(g, art.discMask, dx, dy, p.size, s.angle, b, 'base');
    this.mask(g, art.discMask, dx, dy, p.size, s.angle, b, 'base');
    blit(g, e!.disc!, dx, dy, p.size, p.size, s.angle, 'lighter', b);
    this.mask(g, art.shapeMask, dx, dy, p.size, 0, b, 'ring');
  }

  /** A mask multiplied on, or its neon stand-in. */
  private mask(
    g: CanvasRenderingContext2D,
    pic: Picture | null,
    x: number,
    y: number,
    size: number,
    angle: number,
    b: number,
    kind: 'base' | 'ring',
  ): void {
    if (pic) return blit(g, pic, x, y, size, size, angle, 'multiply', b);
    const [cx, cy, r] = [x + size / 2, y + size / 2, size / 2 - 1];
    g.save();
    g.globalAlpha = b;
    if (kind === 'base') {
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = 'rgb(12, 14, 26)';
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
    } else {
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = 'rgba(88, 225, 255, 0.85)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, cy, r - 1, 0, Math.PI * 2);
      g.stroke();
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = 'rgb(24, 24, 34)';
      g.beginPath();
      g.arc(cx, cy, size * 0.05, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  private rail(
    g: CanvasRenderingContext2D,
    s: WheelScene,
    entries: readonly WheelEntry[],
    art: WheelArt,
  ): void {
    g.save();
    if (art.railStrip) {
      // Width 0 is the texture's own; 490 tall from y 64.
      g.globalCompositeOperation = 'multiply';
      g.drawImage(art.railStrip, 0, 64, art.railStrip.width, 490);
    } else {
      g.globalCompositeOperation = 'multiply';
      const grad = g.createLinearGradient(0, 0, 280, 0);
      grad.addColorStop(0, 'rgb(40, 46, 78)');
      grad.addColorStop(1, 'rgb(255, 255, 255)');
      g.fillStyle = grad;
      g.fillRect(0, 64, 280, 490);
    }
    g.restore();
    const rg = this.row.getContext('2d')!;
    for (let k = 0; k < railSlots(s.wheel); k++) {
      const r = railPlace(s.wheel, k);
      if (!r) continue;
      const plate = entries[r.entry]?.plate;
      if (!plate) continue;
      // The gradient: left corners white, right corners the band - built as
      // the original builds the word, so a negative band is ffffffXX.
      const right =
        r.bright < 0
          ? `rgb(255, 255, ${r.bright & 0xff})`
          : `rgb(${r.bright}, ${r.bright}, ${r.bright})`;
      rg.globalCompositeOperation = 'copy';
      rg.drawImage(plate, 0, 0, 256, 32);
      rg.globalCompositeOperation = 'multiply';
      const grad = rg.createLinearGradient(0, 0, 256, 0);
      grad.addColorStop(0, '#fff');
      grad.addColorStop(1, right);
      rg.fillStyle = grad;
      rg.fillRect(0, 0, 256, 32);
      g.save();
      g.globalCompositeOperation = 'lighter';
      // Half a pixel in each way, as the original's rows sit.
      g.drawImage(this.row, r.x + 0.5, r.y + 16 + 41 + 0.5, 256, 32);
      g.restore();
    }
  }

  /**
   * The exit eyecatch: the picture at its own size from the top left (a
   * 1024x512 eyecatch shows its top-left 640x480), the stage mask multiplied
   * over it, the stage plate added, all faded in from black - `level` 0..255,
   * ten a tick.
   */
  drawEyecatch(
    g: CanvasRenderingContext2D,
    pic: Picture | null,
    art: WheelArt,
    level: number,
  ): void {
    g.save();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000';
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    if (pic) g.drawImage(pic, 0, 0);
    if (art.stageMask) {
      g.globalCompositeOperation = 'multiply';
      g.drawImage(art.stageMask, 0, 0);
    }
    g.globalCompositeOperation = 'lighter';
    if (art.stagePlate) g.drawImage(art.stagePlate, 0, 0);
    else {
      const bar = g.createLinearGradient(0, 420, 0, 460);
      bar.addColorStop(0, 'rgba(88, 225, 255, 0.9)');
      bar.addColorStop(1, 'rgba(88, 225, 255, 0.1)');
      g.fillStyle = bar;
      g.fillRect(392, 420, 220, 40);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#08222c';
      g.font = 'bold 22px sans-serif';
      g.textBaseline = 'middle';
      g.fillText('STAGE 1', 452, 441);
    }
    // draw_fade: black over at 1 - level/255.
    if (level < 255) {
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = `rgba(0, 0, 0, ${1 - Math.max(0, level) / 255})`;
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
    g.restore();
  }
}

/** draw_texture / draw_texture_rot: turned about its centre, degrees clockwise on screen. */
function blit(
  g: CanvasRenderingContext2D,
  pic: Picture,
  x: number,
  y: number,
  w: number,
  h: number,
  angle: number,
  op: GlobalCompositeOperation,
  alpha: number,
): void {
  g.save();
  g.globalCompositeOperation = op;
  g.globalAlpha = alpha;
  g.translate(x + w / 2, y + h / 2);
  if (angle) g.rotate(angle * 0.017453292);
  g.drawImage(pic, -w / 2, -h / 2, w, h);
  g.restore();
}
