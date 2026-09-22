// The game's own play field: a mode's STYLE_*.pvi and the .abm art it names,
// read out of the user's game folder the way EZ2PORT's scene/skin.c does.
// Nothing here is drawn - this turns files into numbers and RGBA images the
// renderer can use, so it can be tested without a GPU.
//
// What the port does, and so what this does:
// - the file is system\<mode>\panel\STYLE_<mode>1_<player>.pvi (style 1,
//   the plain panel), every path component matched case-insensitively;
// - a texture reference is tried as `.abm` first (the stem up to its first
//   dot, as ez2_scr_asset_name cuts it), then as written, relative to the
//   panel folder and then to the game root;
// - a numbered series (`prefix0.bmp`, `prefix1.bmp` ...) stops at the first
//   missing number;
// - every texture is colour-keyed on exact black, like the cabinet;
// - a texture that cannot be found is not drawn, never an error.
// Lane i of the mode's .gds (player one's slot) is Track i+1 of the .pvi.

import {
  decodeAbm,
  decodeCp949,
  modeDef,
  parseGds,
  parsePvi,
  judgeLineY,
  laneForSlot,
  type ModeId,
  type PviColor,
  type Side,
} from '@ez2bms/chart-core';
import type { Entry } from '../bridge/types';

/** The part of the Backend the loader needs. */
export interface SkinFs {
  list(dir: string): Promise<Entry[]>;
  readFile(path: string): Promise<Uint8Array>;
}

export interface SkinImage {
  width: number;
  height: number;
  /** Top-down, straight (not premultiplied) RGBA. */
  rgba: Uint8Array;
}

/** How the game blends a quad; its D3D blend pairs reduced to what a canvas can do. */
export type SkinBlend = 'normal' | 'add';

export interface GameLane {
  /** The .pvi track (0-based) this lane draws with. */
  track: number;
  /** Design-space box (640x480). */
  x: number;
  y: number;
  w: number;
  h: number;
  leftLineW: number;
  rightLineW: number;
  leftLine: PviColor;
  rightLine: PviColor;
  /** BkColor1, the colour of the beam lines trailing each note; null draws none. */
  beam: PviColor | null;
  /** Note colour variants, picked by the beat (not animation frames). */
  notes: SkinImage[];
  press: { x: number; y: number; image: SkinImage; color: PviColor; blend: SkinBlend } | null;
  /** The press beam rising from the lane's foot while the key is down. */
  bar: { image: SkinImage; color: PviColor; maxH: number } | null;
}

export interface GameSkin {
  mode: ModeId;
  player: 0 | 1;
  /** The .pvi, as found. */
  path: string;
  /** Keyed by bmson lane x. */
  lanes: Map<number, GameLane>;
  /** The black gradient under the whole field, over every track's box; null when the skin turns it off. */
  backdrop: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Where notes are judged (design y). */
  judgeY: number;
  target: { x: number; y: number; frames: SkinImage[] } | null;
  measure: { left: number; w: number; h: number; frameDelay: number; frames: SkinImage[] } | null;
  keyPanel: { x: number; y: number; image: SkinImage } | null;
  /** References the .pvi makes that are not in the game folder. */
  missing: string[];
}

export class SkinNotFound extends Error {}

/** Directory listings, cached for one load (a skin names dozens of files in a few folders). */
class Vfs {
  private readonly lists = new Map<string, Promise<Entry[] | null>>();

  constructor(private readonly fs: SkinFs) {}

  private list(dir: string): Promise<Entry[] | null> {
    let p = this.lists.get(dir);
    if (!p) {
      p = this.fs.list(dir).catch(() => null);
      this.lists.set(dir, p);
    }
    return p;
  }

  /** ez2_vfs_resolve: `ref` under `dir`, one component at a time, any case. */
  async resolve(dir: string, ref: string): Promise<string | null> {
    let cur = dir.replace(/[\\/]+$/, '');
    for (const comp of ref.split(/[\\/]+/)) {
      if (!comp || comp === '.') continue;
      if (comp === '..') {
        cur = cur.slice(0, Math.max(0, cur.lastIndexOf('/')));
        continue;
      }
      const entries = await this.list(cur);
      const want = comp.toLowerCase();
      const hit =
        entries?.find((e) => e.name === comp) ??
        entries?.find((e) => !e.name.startsWith('.') && e.name.toLowerCase() === want);
      if (!hit) return null;
      cur = `${cur}/${hit.name}`;
    }
    return cur;
  }

  read(path: string): Promise<Uint8Array> {
    return this.fs.readFile(path);
  }

  /** ez2_vfs_child_ext: the first file in `dir` with this extension, any case. */
  async withExt(dir: string, ext: string): Promise<string | null> {
    const hit = (await this.list(dir))?.find(
      (e) => !e.is_dir && !e.name.startsWith('.') && e.name.toLowerCase().endsWith(ext),
    );
    return hit ? `${dir}/${hit.name}` : null;
  }
}

/** The .abm spelling of a reference: the stem up to the first dot, plus .abm. */
function abmName(ref: string): string {
  const dot = ref.indexOf('.');
  return (dot < 0 ? ref : ref.slice(0, dot)) + '.abm';
}

/** SrcBlend/DestBlend pairs (D3D numbering) to the two blends the renderer has. */
function blendOf(src: number, dst: number): SkinBlend {
  return (src === 2 || src === 5 || src === 0) && dst === 2 ? 'add' : 'normal';
}

const NOTE_FRAMES = 8;
const TARGET_FRAMES = 6;
const MEASURE_FRAMES = 8;

/**
 * Load the game's skin for a mode and side, or throw SkinNotFound when the
 * game folder has no panel for it. Textures the panel names but the folder
 * lacks are listed in `missing`.
 */
export async function loadGameSkin(
  fs: SkinFs,
  root: string,
  mode: ModeId,
  side: Side,
): Promise<GameSkin> {
  const vfs = new Vfs(fs);
  const base = root.replace(/\\/g, '/').replace(/\/+$/, '');
  const def = modeDef(mode);
  const name = def.portName;
  const player: 0 | 1 = side === 'P1' ? 0 : 1;
  const path = await vfs.resolve(base, `system/${name}/panel/STYLE_${name}1_${player}.pvi`);
  if (!path)
    throw new SkinNotFound(`no STYLE_${name}1_${player}.pvi in ${root}/system/${name}/panel`);
  const pvi = parsePvi(decodeCp949(await vfs.read(path)));
  const dir = path.slice(0, path.lastIndexOf('/'));
  const missing: string[] = [];

  const locate = async (ref: string): Promise<string | null> => {
    if (!ref) return null;
    const alt = abmName(ref);
    return (
      (await vfs.resolve(dir, alt)) ??
      (await vfs.resolve(dir, ref)) ??
      (await vfs.resolve(base, alt)) ??
      (await vfs.resolve(base, ref))
    );
  };
  const image = async (ref: string, quiet = false): Promise<SkinImage | null> => {
    const p = await locate(ref);
    if (!p) {
      if (!quiet && ref) missing.push(ref);
      return null;
    }
    try {
      const img = decodeAbm(await vfs.read(p), { colorKey: true });
      return { width: img.width, height: img.height, rgba: img.rgba };
    } catch {
      missing.push(ref);
      return null;
    }
  };
  const series = async (prefix: string, max: number): Promise<SkinImage[]> => {
    const out: SkinImage[] = [];
    for (let n = 0; n < max && prefix; n++) {
      const img = await image(`${prefix}${n}.bmp`, n > 0);
      if (!img) break;
      out.push(img);
    }
    return out;
  };

  // Which track each lane draws with: the .gds's own lane order when the
  // folder has one, else the bundled order (the same numbers).
  const order = new Map<number, number>();
  const gdsPath = await findGds(vfs, base, name);
  if (gdsPath) {
    try {
      const gds = parseGds(decodeCp949(await vfs.read(gdsPath)));
      // By position in the slot, unknown controls included: lane i is track i.
      gds.slots[0]?.lanes.forEach((l, i) => {
        const x = (laneForSlot(l.key) ?? laneForSlot(l.key2))?.x;
        if (x !== undefined && !order.has(x)) order.set(x, i);
      });
    } catch {
      // A broken .gds: the bundled order still stands.
    }
  }
  if (!order.size) {
    // The bundled numbers. 5KeyMix and ScratchMix play keys only, but their
    // .gds still opens on the turntable and ends on the pedal
    // (docs/gds-slots.md: 10 3 4 5 6 7 11), so the keys are Track2..Track6.
    const full = mode === '5k-only' || mode === 'scratch' ? modeDef('5k').columns : def.columns;
    for (const c of def.columns)
      order.set(
        c.x,
        full.findIndex((f) => f.track === c.track),
      );
  }

  const lanes = new Map<number, GameLane>();
  for (const [x, ti] of order) {
    const t = pvi.tracks[ti];
    if (!t || !t.present || !t.enable) continue;
    const pressImg = await image(t.pressTex);
    const barImg = await image(t.barTex);
    const notes = await series(t.noteTex[0] ?? '', NOTE_FRAMES);
    const bk = t.bk1;
    lanes.set(x, {
      track: ti,
      x: t.x,
      y: t.y,
      w: t.w,
      h: t.h,
      leftLineW: t.leftLineW,
      rightLineW: t.rightLineW,
      leftLine: t.leftLine,
      rightLine: t.rightLine,
      beam:
        bk.a || bk.r || bk.g || bk.b || t.bk2.a || t.bk2.r || t.bk2.g || t.bk2.b ? { ...bk } : null,
      notes,
      press: pressImg
        ? {
            x: t.pressX,
            y: t.pressY,
            image: pressImg,
            color: t.pressColor,
            blend: blendOf(t.pressSrc, t.pressDst),
          }
        : null,
      bar: barImg ? { image: barImg, color: t.barColor, maxH: t.barMaxH } : null,
    });
  }

  // One black gradient over the box of every Track section (enabled or not),
  // gated on Track1's colours being set (Panel::m42a240).
  let backdrop: GameSkin['backdrop'] = null;
  const t0 = pvi.tracks[0]!;
  const gate = [t0.bk1, t0.bk2].some((c) => c.a || c.r || c.g || c.b);
  const present = pvi.tracks.filter((t) => t.present);
  if (gate && present.length) {
    backdrop = {
      x0: Math.min(...present.map((t) => t.x)),
      y0: Math.min(...present.map((t) => t.y)),
      x1: Math.max(...present.map((t) => t.x + t.w)),
      y1: Math.max(...present.map((t) => t.y + t.h)),
    };
    if (backdrop.x1 <= backdrop.x0 || backdrop.y1 <= backdrop.y0) backdrop = null;
  }

  let target: GameSkin['target'] = null;
  const bar0 = pvi.target.bars[0];
  if (pvi.target.enable && bar0) {
    const frames = await series(bar0.tex, TARGET_FRAMES);
    if (frames.length) target = { x: bar0.x, y: bar0.y, frames };
  }
  let measure: GameSkin['measure'] = null;
  if (pvi.measure.enable && pvi.measure.tex[0]) {
    const frames = await series(pvi.measure.tex[0], MEASURE_FRAMES);
    if (frames.length)
      measure = {
        left: pvi.measure.left,
        w: pvi.measure.w,
        h: pvi.measure.h,
        frameDelay: Math.max(1, pvi.measure.frameDelay),
        frames,
      };
  }
  let keyPanel: GameSkin['keyPanel'] = null;
  if (pvi.keyPanel.enable && pvi.keyPanel.bitmap) {
    const img = await image(pvi.keyPanel.bitmap);
    if (img) keyPanel = { x: pvi.keyPanel.x, y: pvi.keyPanel.y, image: img };
  }

  return {
    mode,
    player,
    path,
    lanes,
    backdrop,
    judgeY: judgeLineY(pvi) ?? firstPressY(pvi.tracks) ?? 363,
    target,
    measure,
    keyPanel,
    missing: [...new Set(missing)],
  };
}

/** Without a target bar, the press key's top edge is where the lane ends (ez2_skin_judge_y). */
function firstPressY(tracks: { present: boolean; enable: number; pressY: number }[]) {
  return tracks.find((t) => t.present && t.enable)?.pressY;
}

/** The one .gds in system/<mode>/ - its casing does not follow the folder's on shipped data. */
async function findGds(vfs: Vfs, base: string, name: string): Promise<string | null> {
  const dir = await vfs.resolve(base, `system/${name}`);
  return dir ? vfs.withExt(dir, '.gds') : null;
}

/**
 * The note colour variant for a chart position: the port's cycleFrame - the
 * position within the beat in six steps, stepped back one and floored at 0,
 * so variant 0 shows for a third of each beat and 1..4 a sixth each.
 */
export function noteVariant(tick: number, frames: number): number {
  if (frames <= 1) return 0;
  const f = Math.floor(((((tick % 48) + 48) % 48) * 6) / 48) - 1;
  return Math.max(0, Math.min(frames - 1, f));
}

/** The target bar's sway (Panel::m428c60): up to two pixels, a 960 ms period. */
export function targetSway(nowMs: number): number {
  const u = Math.floor(Math.floor(nowMs * 2) / 8) % 480;
  const y = Math.sin((u * 6.28) / 240);
  return Math.trunc(y + y);
}

/** A beam line's colour: BkColor1's alpha, each channel scaled 255/200 and clamped. */
export function beamColor(c: PviColor): { rgb: number; alpha: number } {
  const s = (v: number) => Math.max(0, Math.min(255, Math.trunc((v * 255) / 200)));
  return { rgb: (s(c.r) << 16) | (s(c.g) << 8) | s(c.b), alpha: (c.a & 255) / 255 };
}
