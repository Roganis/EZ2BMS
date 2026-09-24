// `.abm` - EZ2AC's textures: a BMP whose header has four fields XOR-masked
// with a per-game-version table. Transcribed from EZ2PORT ez2/abm.c
// (knowledge from EZ2REWRITE's docs and freem's ezabm.c).
//
// Decoding also applies the game's colour key the way the cabinet does:
// every exactly-black texel is transparent (DirectDraw SetColorKey {0,0} on
// every surface - ez2/abm.c ez2_image_punch_key, game path). The encoder
// writes the Final EX variant, 24-bit, bottom-up, as ez2_abm_write does.

import { said, sayText, type Said } from '../i18n/say';

export interface AbmImage {
  width: number;
  height: number;
  /** Top-down RGBA, width*height*4 bytes. */
  rgba: Uint8Array;
  /** True when the texture carries its own varying alpha (32-bit). */
  hasAlpha: boolean;
  /** 1 old .. 6 Final EX. */
  version: number;
  bpp: number;
}

/** Why an .abm cannot be read, in the language chosen (an encoder's misuse stays in English). */
export class AbmError extends Error {}

const OFF_DATASTART = 0x0a;
const OFF_WIDTH = 0x12;
const OFF_HEIGHT = 0x16;
const OFF_BPP = 0x1c;
const HEADER = 0x36;

/** { dataStart, width, height, bpp } masks per version. */
const XOR: readonly (readonly [number, number, number, number])[] = [
  [0x56fe, 0x0831, 0x1019, 0x1120], // 1 old (2nd Trax .. Endless Circulation)
  [0x45ae, 0x9af1, 0x1d1b, 0x67be], // 2 Evolve
  [0x85be, 0x96ec, 0xfdeb, 0x67ae], // 3 Night Traveler
  [0x95ab, 0x45bb, 0xae12, 0x78ef], // 4 Time Traveler
  [0x23ff, 0xbdc9, 0x1f01, 0xa97f], // 5 Final
  [0x109a, 0xcfa1, 0x51ae, 0xb18f], // 6 Final EX
];

export const ABM_VERSION_NAMES = [
  'old',
  'Evolve',
  'Night Traveler',
  'Time Traveler',
  'Final',
  'Final EX',
];

const legalBpp = (b: number) => b === 1 || b === 4 || b === 8 || b === 16 || b === 24 || b === 32;
const paletteMax = (bpp: number) => (bpp <= 8 ? 4 << bpp : 0);

function detectVersion(dv: DataView): number {
  const encOff = dv.getUint32(OFF_DATASTART, true);
  const encBpp = dv.getUint32(OFF_BPP, true);
  for (let v = 0; v < XOR.length; v++) {
    const off = (encOff ^ XOR[v]![0]) >>> 0;
    const bpp = (encBpp ^ XOR[v]![3]) & 0xffff;
    if (!legalBpp(bpp) || off < HEADER || off - HEADER > paletteMax(bpp)) continue;
    return v + 1;
  }
  return 0;
}

export function decodeAbm(data: Uint8Array, opts: { colorKey?: boolean } = {}): AbmImage {
  const fail = (s: Said) => new AbmError(sayText(s));
  if (data.length < HEADER) throw fail(said('data.abm.short'));
  if (data[0] !== 0x41 || data[1] !== 0x57) throw fail(said('data.abm.magic'));
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const version = detectVersion(dv);
  if (!version) throw fail(said('data.abm.version'));
  const k = XOR[version - 1]!;
  const w = (dv.getUint32(OFF_WIDTH, true) ^ k[1]) | 0;
  const h = (dv.getUint32(OFF_HEIGHT, true) ^ k[2]) | 0;
  let bpp = (dv.getUint32(OFF_BPP, true) ^ k[3]) & 0xffff;
  if (!legalBpp(bpp)) throw fail(said('data.abm.bpp', { bpp }));
  if (w <= 0 || w > 8192 || h === 0 || h < -8192 || h > 8192)
    throw fail(said('data.abm.size', { w, h }));
  const topDown = h < 0;
  const rows = topDown ? -h : h;
  const off = (dv.getUint32(OFF_DATASTART, true) ^ k[0]) >>> 0;
  if (off > data.length) throw fail(said('data.abm.data'));
  const palette = data.subarray(HEADER, off);
  const palEntries = Math.floor((off - HEADER) / 4);
  const px = data.subarray(off);
  const avail = px.length;

  // Some shipped files store rows unpadded, or declare a paletted depth while
  // carrying 24-bit pixels and no palette; the body size decides (abm.c).
  if (bpp <= 8 && palEntries === 0) {
    for (const t of [24, 16, 32, 8]) {
      const padded = Math.floor((w * t + 31) / 32) * 4;
      const tight = Math.floor((w * t + 7) / 8);
      if (padded * rows === avail || tight * rows === avail) {
        bpp = t;
        break;
      }
    }
  }
  let rowBytes = Math.floor((w * bpp + 31) / 32) * 4;
  if (rowBytes * rows > avail) {
    const tight = Math.floor((w * bpp + 7) / 8);
    if (tight * rows <= avail) rowBytes = tight;
  }

  const out = new Uint8Array(w * rows * 4);
  let firstA = -1;
  let varying = false;
  for (let y = 0; y < rows; y++) {
    const srcY = topDown ? y : rows - 1 - y;
    const row = srcY * rowBytes;
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 255;
      if (bpp <= 8) {
        let idx = 0;
        if (bpp === 8) {
          const i = row + x;
          if (i < avail) idx = px[i]!;
        } else {
          const per = 8 / bpp;
          const shift = (per - 1 - (x % per)) * bpp;
          const i = row + Math.floor(x / per);
          if (i < avail) idx = (px[i]! >> shift) & ((1 << bpp) - 1);
        }
        if (idx < palEntries) {
          b = palette[idx * 4]!;
          g = palette[idx * 4 + 1]!;
          r = palette[idx * 4 + 2]!;
        }
      } else if (bpp === 24) {
        const i = row + x * 3;
        if (i + 2 < avail) {
          b = px[i]!;
          g = px[i + 1]!;
          r = px[i + 2]!;
        }
      } else if (bpp === 32) {
        const i = row + x * 4;
        if (i + 3 < avail) {
          b = px[i]!;
          g = px[i + 1]!;
          r = px[i + 2]!;
          a = px[i + 3]!;
        }
        if (firstA < 0) firstA = a;
        else if (a !== firstA) varying = true;
      } else {
        const i = row + x * 2;
        const v = i + 1 < avail ? px[i]! | (px[i + 1]! << 8) : 0;
        const r5 = (v >> 10) & 31;
        const g5 = (v >> 5) & 31;
        const b5 = v & 31;
        r = (r5 << 3) | (r5 >> 2);
        g = (g5 << 3) | (g5 >> 2);
        b = (b5 << 3) | (b5 >> 2);
      }
      const o = (y * w + x) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = a;
    }
  }
  // 24-bit art padded to 32 carries a constant (usually zero) alpha: ignore it.
  if (bpp === 32 && !varying) for (let i = 3; i < out.length; i += 4) out[i] = 255;
  const img: AbmImage = {
    width: w,
    height: rows,
    rgba: out,
    hasAlpha: bpp === 32 && varying,
    version,
    bpp,
  };
  if (opts.colorKey) punchBlack(img);
  return img;
}

/** The cabinet's colour key: an exactly-black texel is transparent. */
export function punchBlack(img: AbmImage): void {
  const p = img.rgba;
  for (let k = 0; k < p.length; k += 4) {
    if (p[k] === 0 && p[k + 1] === 0 && p[k + 2] === 0) p[k + 3] = 0;
  }
  img.hasAlpha = true;
}

/** Encode top-down RGB (w*h*3) as a Final EX 24-bit .abm (ez2_abm_write). */
export function encodeAbm(rgb: Uint8Array, w: number, h: number): Uint8Array {
  if (w <= 0 || h <= 0 || rgb.length < w * h * 3)
    throw new AbmError('RGB buffer smaller than w*h*3');
  const k = XOR[5]!;
  const row = w * 3;
  const pad = (4 - (row % 4)) % 4;
  const body = (row + pad) * h;
  const out = new Uint8Array(HEADER + body);
  const dv = new DataView(out.buffer);
  out[0] = 0x41;
  out[1] = 0x57;
  dv.setUint32(2, HEADER + body, true);
  dv.setUint32(OFF_DATASTART, (HEADER ^ k[0]) >>> 0, true);
  dv.setUint32(0x0e, 40, true);
  dv.setUint32(OFF_WIDTH, (w ^ k[1]) >>> 0, true);
  dv.setUint32(OFF_HEIGHT, (h ^ k[2]) >>> 0, true);
  out[0x1a] = 1;
  dv.setUint32(OFF_BPP, (24 ^ k[3]) >>> 0, true);
  dv.setUint32(0x22, body, true);
  let o = HEADER;
  for (let y = h - 1; y >= 0; y--) {
    const src = y * row;
    for (let x = 0; x < w; x++) {
      out[o + x * 3] = rgb[src + x * 3 + 2]!;
      out[o + x * 3 + 1] = rgb[src + x * 3 + 1]!;
      out[o + x * 3 + 2] = rgb[src + x * 3]!;
    }
    o += row + pad;
  }
  return out;
}

/** 64-bit FNV-1a as a 16-digit hex string (the oracle's image fingerprint). */
export function fnv1a64Hex(p: Uint8Array): string {
  let h = 0xcbf29ce484222325n;
  for (const b of p) {
    h ^= BigInt(b);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}
