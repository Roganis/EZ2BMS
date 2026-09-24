// A made-up game folder for the browser build and the tests: a StreetMix and a
// 7StreetMix panel (both players) in the .pvi/.abm/.gds formats the game uses,
// drawn here in code. Nothing in it comes from a game install - it exists so
// the game-skin path can be seen and tested without one.
//
// It deliberately exercises what real folders do: file names in a different
// case from the .pvi's references, `.bmp` references to `.abm` files, a note
// series of six colour variants, a target bar that cycles, a .gds whose name
// does not match its folder's casing. The song select's masks and the exit
// eyecatch's mask and stage plate are here too, for the wheel preview.

import { encodeAbm, modeDef, type LaneKind, type ModeId } from '@ez2bms/chart-core';

export const DEMO_GAME = '/game';

type Rgb = [number, number, number];

const KIND_RGB: Record<LaneKind, Rgb> = {
  white: [236, 238, 250],
  blue: [70, 150, 255],
  scratch: [240, 50, 50],
  pedal: [255, 205, 40],
  effector: [255, 95, 160],
};

/** Lane widths, design units. */
const KIND_W: Record<LaneKind, number> = {
  scratch: 44,
  white: 28,
  blue: 24,
  pedal: 40,
  effector: 26,
};

class Raster {
  readonly rgb: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.rgb = new Uint8Array(w * h * 3);
  }
  fill(x: number, y: number, w: number, h: number, c: Rgb): this {
    for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++)
      for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) {
        const o = (j * this.w + i) * 3;
        this.rgb[o] = c[0];
        this.rgb[o + 1] = c[1];
        this.rgb[o + 2] = c[2];
      }
    return this;
  }
  /** Every pixel from its centre's position. */
  paint(at: (x: number, y: number) => Rgb): this {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) this.rgb.set(at(x + 0.5, y + 0.5), (y * this.w + x) * 3);
    return this;
  }
  abm(): Uint8Array {
    return encodeAbm(this.rgb, this.w, this.h);
  }
}

const mix = (c: Rgb, k: number): Rgb =>
  c.map((v) => Math.max(1, Math.min(255, Math.round(v * k)))) as Rgb;
const toward = (c: Rgb, t: Rgb, k: number): Rgb =>
  c.map((v, i) => Math.round(v + (t[i]! - v) * k)) as Rgb;

/** A note bar: a bevelled block, variant v shading toward white (the beat pulse). */
function noteBar(kind: LaneKind, w: number, v: number): Uint8Array {
  const h = 8;
  const base = toward(KIND_RGB[kind], [255, 255, 255], [0, 0.45, 0.3, 0.18, 0.08, 0][v] ?? 0);
  const r = new Raster(w, h).fill(0, 0, w, h, mix(base, 0.78));
  r.fill(1, 1, w - 2, h - 2, base);
  r.fill(1, 1, w - 2, 2, toward(base, [255, 255, 255], 0.6));
  r.fill(1, h - 2, w - 2, 1, mix(base, 0.55));
  return r.abm();
}

/** The press glow: a column of light, brightest at the key, black (keyed) around it. */
function pressGlow(kind: LaneKind, w: number): Uint8Array {
  const h = 90;
  const r = new Raster(w, h);
  for (let y = 0; y < h; y++) {
    const k = (y / h) ** 2;
    r.fill(2, y, w - 4, 1, mix(KIND_RGB[kind], 0.2 + 0.8 * k));
  }
  return r.abm();
}

function pressBar(w: number): Uint8Array {
  const h = 160;
  const r = new Raster(w, h);
  for (let y = 0; y < h; y++) r.fill(0, y, w, 1, mix([120, 200, 255], 0.15 + 0.5 * (y / h)));
  return r.abm();
}

function targetBar(w: number, frame: number): Uint8Array {
  const r = new Raster(w, 6);
  const glow: Rgb = toward(
    [255, 60, 90],
    [255, 255, 255],
    [0.1, 0.5, 0.35, 0.25, 0.15, 0.05][frame]!,
  );
  r.fill(0, 0, w, 6, mix(glow, 0.45)).fill(0, 2, w, 2, glow);
  return r.abm();
}

function measureLine(w: number): Uint8Array {
  return new Raster(w, 2).fill(0, 0, w, 2, [70, 80, 110]).abm();
}

/** The key panel under the judge line: a plate with a cap per lane. */
function keyPanel(boxes: { x: number; w: number; kind: LaneKind }[], x0: number, w: number) {
  const h = 110;
  const r = new Raster(w, h).fill(0, 0, w, h, [18, 20, 30]).fill(0, 0, w, 3, [90, 100, 140]);
  for (const b of boxes) {
    const x = b.x - x0;
    r.fill(x + 2, 16, b.w - 4, 34, mix(KIND_RGB[b.kind], 0.35));
    r.fill(x + 4, 18, b.w - 8, 10, mix(KIND_RGB[b.kind], 0.7));
  }
  return r.abm();
}

const color = (c: Rgb, a = 255) => `${c[0]}, ${c[1]}, ${c[2]}, ${a}`;

/** One panel's files, keyed by path under the game folder. */
function panel(mode: ModeId, player: 0 | 1, out: Map<string, Uint8Array>): void {
  const def = modeDef(mode);
  const name = def.portName;
  const dir = `${DEMO_GAME}/system/${name}/panel`;
  // Lanes in .gds order (the mode's columns are that order for these modes).
  const cols = def.columns;
  const total = cols.reduce((s, c) => s + KIND_W[c.kind], 0);
  const x0 = player === 0 ? 36 : 640 - 36 - total;
  let x = x0;
  const boxes = cols.map((c) => {
    const b = { x, w: KIND_W[c.kind], kind: c.kind };
    x += b.w;
    return b;
  });
  const lines: string[] = [
    "' Synthetic panel for the EZ2BMS demo - drawn in code, not from a game install.",
    '[General]',
    `NumberOfTrack = ${cols.length}`,
  ];
  cols.forEach((c, i) => {
    const b = boxes[i]!;
    const tint = KIND_RGB[c.kind];
    lines.push(
      '',
      `[Track${i + 1}]`,
      'Enable = 1',
      `Coord = ${b.x}, 0`,
      `Size = ${b.w}, 363`,
      'BKAlphaFunc = 5, 6',
      // The beam colour; the 255/200 scaling lifts 200 to full.
      `BkColor1 = ${color(mix(tint, 200 / 255), 110)}`,
      'BkColor2 = 10, 0, 10, 255',
      'LeftBoader = {',
      '    LineWidth = 1',
      `    LineColor = ${color([60, 66, 92])}`,
      '}',
      'RightBoader = {',
      `    LineWidth = ${i === cols.length - 1 ? 1 : 0}`,
      `    LineColor = ${color([60, 66, 92])}`,
      '}',
      `PressKeyCoord = ${b.x}, 273`,
      `PressKeyDownTexture = "press_${c.kind}.bmp"`,
      `PressKeyColor = ${color([255, 255, 255])}`,
      'PressKeyAlphaFunc = 2, 2',
      'PressBarTexture = "Beam.bmp"',
      `PressBarColor = ${color([255, 255, 255], 200)}`,
      'PressBarMaxHeight = 160',
      `NoteAniTexture = "note\\${c.kind}_${b.w}_"`,
    );
  });
  lines.push(
    '',
    '[TargetBar]',
    'Enable = 1',
    `Coord = ${x0}, 360`,
    `Size = ${total}, 6`,
    'AniTexture = "target_bar_"',
    '',
    '[MeasureLine]',
    'Enable = 1',
    `Left = ${x0}`,
    `Size = ${total}, 2`,
    'FrameDelay = 4',
    'AniTexture = "measure_"',
    '',
    '[KeyPanel]',
    'Enable = 1',
    `Coord = ${x0}, 370`,
    'Size = 0, 0',
    'Bitmap = "keypanel.bmp"',
    '',
  );
  out.set(`${dir}/STYLE_${name}1_${player}.pvi`, new TextEncoder().encode(lines.join('\r\n')));

  // Textures, spelled the way a real folder often is: another case, .abm.
  const seen = new Set<string>();
  cols.forEach((c, i) => {
    const w = boxes[i]!.w;
    const k = `${c.kind}_${w}`;
    if (seen.has(k)) return;
    seen.add(k);
    for (let v = 0; v < 6; v++)
      out.set(`${dir}/Note/${k.toUpperCase()}_${v}.ABM`, noteBar(c.kind, w, v));
    out.set(`${dir}/Press_${c.kind}.abm`, pressGlow(c.kind, w));
  });
  out.set(`${dir}/beam.abm`, pressBar(KIND_W.white));
  for (let f = 0; f < 6; f++) out.set(`${dir}/Target_Bar_${f}.abm`, targetBar(total, f));
  out.set(`${dir}/measure_0.abm`, measureLine(total));
  out.set(`${dir}/KeyPanel.abm`, keyPanel(boxes, x0, total));
}

/** A .gds whose lane order is the mode's (P1 slot only). */
function gds(mode: ModeId): Uint8Array {
  const def = modeDef(mode);
  const lines = [
    '[General]',
    'NumberOfSlot=1',
    '',
    '[Slot1]',
    `NumberOfTrack=${def.columns.length}`,
  ];
  def.columns.forEach((c, i) =>
    lines.push(
      `Track${i + 1} =`,
      '{',
      `    Key=${c.slot},${c.kind === 'scratch' ? c.slot + 1 : -1}`,
      `    SongTrack=${c.track}`,
      '}',
    ),
  );
  return new TextEncoder().encode(lines.join('\r\n') + '\r\n');
}

const KEY: Rgb = [0, 0, 0];

/**
 * The disc's base, multiplied under the art (twice) and turning with it: near
 * black, so the backdrop goes dark behind the disc, with a lighter notch at
 * the rim so the turn shows. Exact black round it is the key.
 */
function discMask(): Uint8Array {
  const n = 128;
  return new Raster(n, n)
    .paint((x, y) => {
      const [dx, dy] = [x - n / 2, y - n / 2];
      const r = Math.hypot(dx, dy);
      if (r >= n / 2 - 1) return KEY;
      const notch = r > n / 2 - 12 && Math.abs(dx) < 4 && dy < 0;
      return notch ? [70, 80, 120] : [10, 12, 22];
    })
    .abm();
}

/** The ring over the disc, still: clear inside, a tinted rim, the spindle hole. */
function shapeMask(): Uint8Array {
  const n = 128;
  return new Raster(n, n)
    .paint((x, y) => {
      const r = Math.hypot(x - n / 2, y - n / 2);
      if (r >= n / 2 - 1) return KEY;
      if (r < 6) return [24, 24, 34];
      if (r < 12) return [170, 175, 190];
      if (r > n / 2 - 5) return [120, 210, 255];
      return [255, 255, 255];
    })
    .abm();
}

/** The strip behind the title rail, stretched 490 tall: dark at the left, clear at the right. */
function railStrip(): Uint8Array {
  const w = 280;
  return new Raster(w, 16)
    .paint((x) => toward([40, 46, 78], [255, 255, 255], (x / w) ** 1.5))
    .abm();
}

/** The exit eyecatch's mask: the picture clear, darkened into bands at the top and bottom. */
function stageMask(): Uint8Array {
  return new Raster(640, 480)
    .paint((_x, y) => (y < 36 || y > 404 ? [60, 64, 90] : [255, 255, 255]))
    .abm();
}

/** The stage plate, added over it: a neon bar with a blocky 1. */
function stagePlate(): Uint8Array {
  const r = new Raster(640, 480);
  for (let y = 0; y < 40; y++) r.fill(392, 420 + y, 220, 1, mix([88, 225, 255], 0.9 - y / 60));
  r.fill(392, 420, 220, 2, [230, 250, 255]);
  // The 1: a stem, a flag and a foot, dark on the bar.
  r.fill(496, 426, 8, 28, [8, 30, 40]).fill(488, 426, 8, 6, [8, 30, 40]);
  r.fill(486, 450, 26, 4, [8, 30, 40]);
  return r.abm();
}

/** The demo game folder: StreetMix and 7StreetMix panels for both players. */
export function demoSkinFiles(): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  for (const mode of ['5k', '7k'] as const) {
    panel(mode, 0, out);
    panel(mode, 1, out);
    const name = modeDef(mode).portName;
    out.set(`${DEMO_GAME}/system/${name}/${name.toLowerCase()}.GDS`, gds(mode));
  }
  out.set(`${DEMO_GAME}/system/disc/Disc-Mask.abm`, discMask());
  out.set(`${DEMO_GAME}/system/disc/SHAPE_MASK.abm`, shapeMask());
  out.set(`${DEMO_GAME}/system/SongSelect/vf/b_mask_2.abm`, railStrip());
  out.set(`${DEMO_GAME}/system/channel_eyecatch/Common/Stage_Mask.abm`, stageMask());
  out.set(`${DEMO_GAME}/system/channel_eyecatch/Common/stage_1.abm`, stagePlate());
  return out;
}
