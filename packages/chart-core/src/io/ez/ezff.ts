// EZFF - the `.ez` chart format, read and written byte for byte.
//
// Layout (EZ2PORT ez2/chart.c, the EZ2AC Bible's ez-chart.md):
//   header 0x96 bytes: "EZFF", NUL, u8 version @5, name[64] @6, name2[64]
//     @0x46, u16 ticks/measure @0x86, f32 bpm @0x88, u16 track count @0x8c,
//     u32 total ticks @0x8e, f32 bpm2 @0x92
//   then per track 0x4e bytes: "EZTR", u16 0, name[64] @6, u32 ticks @0x46,
//     u32 data bytes @0x4a, followed by fixed-width records
//   record: u32 tick, u8 type, payload. Width 10 (v4), 11 (v5/v6), 13 (v7/v8).
//   type 1 note:  v7+: u16 key @5, vel @7, pan @8, kind @9, u16 length @10
//                 v5/6: u8 key @5, vel @6, pan @7, kind @8, u16 length @9
//   type 2 volume / 4 beats: u8 @5;  3 BPM: f32 @5;  5 mark: nothing;
//   6+: u32 raw words @5 (and @9); type 6 is a scroll multiplier read as f32.
// Everything little-endian. The file is plaintext here; the cipher is separate
// (ez2data/crypt.ts).

import { said } from '../../i18n/say';
import { SaidError } from '../said-error';
import { encodeUtf8 } from '../text';

export type EzffVersion = 4 | 5 | 6 | 7 | 8;

export const EZ_NOTE = 1;
export const EZ_VOLUME = 2;
export const EZ_BPM = 3;
export const EZ_BEATS = 4;
export const EZ_MARK = 5;
export const EZ_SCROLL = 6;

/** A hold's `length` carries a bias of 6: 0 or 6 is a tap, 6+n a hold of n ticks. */
export const HOLD_BIAS = 6;

export interface EzffRecord {
  tick: number;
  type: number;
  /** Note: keysound index into the sibling .ezi. */
  key?: number;
  vel?: number;
  pan?: number;
  /** Note: the hold kind byte (the Bible's `note_type`, the port's `unknown`). */
  kind?: number;
  /** Note: raw length field, HOLD_BIAS included. */
  length?: number;
  /** BPM record: f32 value. */
  bpm?: number;
  /** Volume / beats-per-measure byte. */
  value?: number;
  /** Types >= 6: the raw words. */
  raw?: [number, number];
}

export interface EzffTrack {
  /** Raw 64-byte name field (NULs trimmed). */
  name: Uint8Array;
  /** The track header's tick field (the port writes its last record's tick). */
  ticks: number;
  records: EzffRecord[];
}

export interface EzffChart {
  version: EzffVersion;
  name: Uint8Array;
  name2: Uint8Array;
  ticksPerMeasure: number;
  bpm: number;
  bpm2: number;
  totalTicks: number;
  tracks: EzffTrack[];
}

/** A .ez that cannot be read (said to whoever gave it); the writer's are EZ2BMS's own mistakes. */
export class EzffError extends SaidError {}

const HDR = 0x96;
const TRK = 0x4e;

export function recordSize(version: number): number {
  switch (version) {
    case 4:
      return 10;
    case 5:
    case 6:
      return 11;
    case 7:
    case 8:
      return 13;
    default:
      return 0;
  }
}

/** Encode a name as UTF-8, cut at a character boundary to fit 63 bytes + NUL. */
export function nameField(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const b = encodeUtf8(ch);
    if (out.length + b.length > 63) break;
    out.push(...b);
  }
  return new Uint8Array(out);
}

function trimName(b: Uint8Array): Uint8Array {
  const nul = b.indexOf(0);
  return nul < 0 ? b.slice() : b.slice(0, nul);
}

export function readEzff(bytes: Uint8Array): EzffChart {
  if (bytes.length < HDR) throw new EzffError(said('ez.read.short'));
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'EZFF') {
    throw new EzffError(said('ez.read.not-ezff'));
  }
  const version = bytes[5]!;
  const rec = recordSize(version);
  if (!rec) throw new EzffError(said('ez.read.version', { version }));
  const trackCount = dv.getUint16(0x8c, true);
  if (trackCount > 96) throw new EzffError(said('ez.read.tracks', { n: trackCount }));
  const chart: EzffChart = {
    version: version as EzffVersion,
    name: trimName(bytes.subarray(0x06, 0x06 + 64)),
    name2: trimName(bytes.subarray(0x46, 0x46 + 64)),
    ticksPerMeasure: dv.getUint16(0x86, true),
    bpm: dv.getFloat32(0x88, true),
    totalTicks: dv.getUint32(0x8e, true),
    bpm2: dv.getFloat32(0x92, true),
    tracks: [],
  };
  let o = HDR;
  for (let t = 0; t < trackCount; t++) {
    if (o + TRK > bytes.length) throw new EzffError(said('ez.read.track-header', { track: t }));
    if (String.fromCharCode(...bytes.subarray(o, o + 4)) !== 'EZTR') {
      throw new EzffError(said('ez.read.not-eztr', { track: t }));
    }
    const track: EzffTrack = {
      name: trimName(bytes.subarray(o + 6, o + 6 + 64)),
      ticks: dv.getUint32(o + 0x46, true),
      records: [],
    };
    const size = dv.getUint32(o + 0x4a, true);
    o += TRK;
    if (size > bytes.length - o) throw new EzffError(said('ez.read.track-data', { track: t }));
    const count = Math.floor(size / rec);
    for (let j = 0; j < count; j++) track.records.push(readRecord(dv, o + j * rec, version));
    o += size;
    chart.tracks.push(track);
  }
  return chart;
}

function readRecord(dv: DataView, p: number, version: number): EzffRecord {
  const r: EzffRecord = { tick: dv.getUint32(p, true), type: dv.getUint8(p + 4) };
  switch (r.type) {
    case EZ_NOTE:
      if (version >= 7) {
        r.key = dv.getUint16(p + 5, true);
        r.vel = dv.getUint8(p + 7);
        r.pan = dv.getUint8(p + 8);
        r.kind = dv.getUint8(p + 9);
        r.length = dv.getUint16(p + 10, true);
      } else {
        r.key = dv.getUint8(p + 5);
        r.vel = dv.getUint8(p + 6);
        r.pan = dv.getUint8(p + 7);
        r.kind = dv.getUint8(p + 8);
        // v4's 10-byte record has room for only the length's low byte. EZ2PORT
        // reads a u16 there anyway, picking up the next record's first byte;
        // EZ2BMS reads only what belongs to the record (v4 is import-only).
        r.length = version === 4 ? dv.getUint8(p + 9) : dv.getUint16(p + 9, true);
      }
      break;
    case EZ_VOLUME:
    case EZ_BEATS:
      r.value = dv.getUint8(p + 5);
      break;
    case EZ_BPM:
      r.bpm = dv.getFloat32(p + 5, true);
      break;
    case EZ_MARK:
      break;
    default: {
      const w1 = p + 9 + 4 <= dv.byteLength ? dv.getUint32(p + 9, true) : 0;
      r.raw = [dv.getUint32(p + 5, true), version >= 7 ? w1 : 0];
    }
  }
  return r;
}

/**
 * Serialize. Records are written in the order given within each track (the
 * caller sorts); v5/v6 need key < 256, v7/v8 key < 65536. v4 is read-only.
 */
export function writeEzff(c: EzffChart): Uint8Array {
  const rec = recordSize(c.version);
  if (!rec || c.version === 4) throw new EzffError(`cannot write EZFF version ${c.version}`);
  const size = HDR + c.tracks.reduce((n, t) => n + TRK + t.records.length * rec, 0);
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  out.set([0x45, 0x5a, 0x46, 0x46], 0);
  out[5] = c.version;
  out.set(c.name.subarray(0, 63), 0x06);
  out.set(c.name2.subarray(0, 63), 0x46);
  dv.setUint16(0x86, c.ticksPerMeasure, true);
  dv.setFloat32(0x88, c.bpm, true);
  dv.setUint16(0x8c, c.tracks.length, true);
  dv.setUint32(0x8e, c.totalTicks, true);
  dv.setFloat32(0x92, c.bpm2, true);
  let o = HDR;
  for (const t of c.tracks) {
    out.set([0x45, 0x5a, 0x54, 0x52], o);
    out.set(t.name.subarray(0, 63), o + 6);
    dv.setUint32(o + 0x46, t.ticks, true);
    dv.setUint32(o + 0x4a, t.records.length * rec, true);
    o += TRK;
    for (const r of t.records) {
      writeRecord(dv, o, c.version, r);
      o += rec;
    }
  }
  return out;
}

function writeRecord(dv: DataView, p: number, version: number, r: EzffRecord): void {
  dv.setUint32(p, r.tick, true);
  dv.setUint8(p + 4, r.type);
  switch (r.type) {
    case EZ_NOTE: {
      const key = r.key ?? 0;
      const wide = version >= 7;
      if (key < 0 || key > (wide ? 0xffff : 0xff)) {
        throw new EzffError(`keysound index ${key} does not fit an EZFF v${version} note`);
      }
      if (wide) {
        dv.setUint16(p + 5, key, true);
        dv.setUint8(p + 7, r.vel ?? 127);
        dv.setUint8(p + 8, r.pan ?? 64);
        dv.setUint8(p + 9, r.kind ?? 0);
        dv.setUint16(p + 10, r.length ?? 0, true);
      } else {
        dv.setUint8(p + 5, key);
        dv.setUint8(p + 6, r.vel ?? 127);
        dv.setUint8(p + 7, r.pan ?? 64);
        dv.setUint8(p + 8, r.kind ?? 0);
        dv.setUint16(p + 9, r.length ?? 0, true);
      }
      break;
    }
    case EZ_VOLUME:
    case EZ_BEATS:
      dv.setUint8(p + 5, r.value ?? 0);
      break;
    case EZ_BPM:
      dv.setFloat32(p + 5, r.bpm ?? 0, true);
      break;
    case EZ_MARK:
      break;
    default:
      dv.setUint32(p + 5, r.raw?.[0] ?? 0, true);
      if (version >= 7) dv.setUint32(p + 9, r.raw?.[1] ?? 0, true);
  }
}

/** Hold ticks of a note record (0 for a tap), as ez2_note_hold_ticks. */
export function holdTicksOf(r: EzffRecord): number {
  if (r.type !== EZ_NOTE || (r.length ?? 0) <= HOLD_BIAS) return 0;
  return r.length! - HOLD_BIAS;
}
