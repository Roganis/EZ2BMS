// A movie as EZ2PORT's ffmpeg will see it, read from its headers alone: the
// container, the video codec, the picture size and the length. A package's
// BGA (song.ini [Bga]) is opened by the port's scene/bga.c through
// media/video.c, and the Windows build - the cabinet's - links an ffmpeg cut
// down to a few readers and decoders (thirdparty/fetch-ffmpeg.sh). A movie
// outside that list opens nowhere but on Linux, where the distribution's
// full ffmpeg is linked; so lint checks against the Windows list.
//
// Only headers are read, through `read(offset, length)`: an MP4's moov box,
// a Matroska file's Info and Tracks, an ASF header object, an AVI's hdrl.
// The media data is never touched, so probing a 500 MB movie reads a few
// kilobytes.

import { said, sayText, type Said } from '../i18n/say';

export type ReadRange = (offset: number, length: number) => Promise<Uint8Array>;

export type MovieContainer =
  | 'mp4'
  | 'mov'
  | 'webm'
  | 'mkv'
  | 'asf'
  | 'avi'
  | 'mpeg-ps'
  | 'mpeg-ts'
  | 'ogg'
  | 'flv'
  | 'unknown';

export interface MovieInfo {
  container: MovieContainer;
  /**
   * The video codec, by ffmpeg's decoder name (h264, vp9, wmv3, ...), or
   * `fourcc:XXXX` / the container's codec id when EZ2BMS does not know it;
   * null when no video track was found.
   */
  codec: string | null;
  /** The coded picture size; null when the headers do not say. */
  width: number | null;
  height: number | null;
  /** null when the headers do not say (a live-recorded WebM, say). */
  durationMs: number | null;
}

/** The containers the Windows build's ffmpeg reads (demuxers asf, mov, matroska, ogg). */
export const PORT_CONTAINERS: readonly MovieContainer[] = [
  'mp4',
  'mov',
  'webm',
  'mkv',
  'asf',
  'ogg',
];

/**
 * The video decoders it has: the game's own .spv (WMV and the Microsoft
 * MPEG-4 variants) and what editors export (H.264, MPEG-4 part 2, VP8,
 * VP9). mjpeg is there for images, and decodes a Motion-JPEG movie as well.
 */
export const PORT_VIDEO_DECODERS: readonly string[] = [
  'wmv1',
  'wmv2',
  'wmv3',
  'vc1',
  'msmpeg4v1',
  'msmpeg4v2',
  'msmpeg4v3',
  'h264',
  'mpeg4',
  'vp8',
  'vp9',
  'mjpeg',
];

const CONTAINER_NAME: Record<MovieContainer, string> = {
  mp4: 'MP4',
  mov: 'QuickTime',
  webm: 'WebM',
  mkv: 'Matroska',
  asf: 'ASF/WMV',
  avi: 'AVI',
  'mpeg-ps': 'MPEG program stream',
  'mpeg-ts': 'MPEG transport stream',
  ogg: 'Ogg',
  flv: 'Flash video',
  unknown: 'unknown',
};

/** A container's name to show: formats go by their own names, "unknown" in the language chosen. */
export function containerName(c: MovieContainer): string {
  return c === 'unknown' ? sayText(said('media.container.unknown')) : CONTAINER_NAME[c];
}

/** Why EZ2PORT's Windows build cannot play `m`, in the language chosen; undefined when it can. */
export function portCannotPlay(m: MovieInfo): string | undefined {
  const s = portCannotPlaySaid(m);
  return s && sayText(s);
}

/** Why EZ2PORT's Windows build cannot play `m`, as a message to say later. */
export function portCannotPlaySaid(m: MovieInfo): Said | undefined {
  if (m.container === 'unknown') return said('movie.unknown');
  if (m.container === 'avi')
    return said(
      m.codec && PORT_VIDEO_DECODERS.includes(m.codec) ? 'movie.avi.rewrap' : 'movie.avi.convert',
    );
  if (!PORT_CONTAINERS.includes(m.container))
    return said('movie.container', { container: CONTAINER_NAME[m.container] });
  if (!m.codec) return said('movie.no-video');
  if (!PORT_VIDEO_DECODERS.includes(m.codec)) return said('movie.codec', { codec: m.codec });
  return undefined;
}

/** What the headers of a file say about its movie. Never throws on a malformed file. */
export async function probeMovie(read: ReadRange, size: number): Promise<MovieInfo> {
  const none: MovieInfo = {
    container: 'unknown',
    codec: null,
    width: null,
    height: null,
    durationMs: null,
  };
  if (size < 12) return none;
  const head = await read(0, Math.min(size, 64 * 1024));
  try {
    if (u32(head, 0) === 0x1a45dfa3) return await probeMatroska(read, size, head);
    if (guidAt(head, 0) === ASF_HEADER) return await probeAsf(read, head);
    if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'AVI ') return probeAvi(head);
    if (ISO_TOP.has(ascii(head, 4, 4))) return await probeIsoBmff(read, size, head);
    if (u32(head, 0) === 0x000001ba || u32(head, 0) === 0x000001b3)
      return { ...none, container: 'mpeg-ps', codec: 'mpeg1video' };
    if (head[0] === 0x47 && head.length > 188 && head[188] === 0x47)
      return { ...none, container: 'mpeg-ts' };
    if (ascii(head, 0, 4) === 'OggS') return probeOgg(head);
    if (ascii(head, 0, 3) === 'FLV') return { ...none, container: 'flv' };
  } catch {
    // A truncated or broken header: what could be read is not enough.
  }
  return none;
}

// ---- bytes

const u16le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32le = (b: Uint8Array, o: number) => (u16le(b, o) | (u16le(b, o + 2) << 16)) >>> 0;
const u64le = (b: Uint8Array, o: number) => u32le(b, o) + u32le(b, o + 4) * 2 ** 32;
const u16 = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const u32 = (b: Uint8Array, o: number) => ((u16(b, o) << 16) | u16(b, o + 2)) >>> 0;
const u64 = (b: Uint8Array, o: number) => u32(b, o) * 2 ** 32 + u32(b, o + 4);
function ascii(b: Uint8Array, o: number, n: number): string {
  let s = '';
  for (let i = o; i < o + n && i < b.length; i++) s += String.fromCharCode(b[i]!);
  return s;
}
function need(b: Uint8Array, end: number): void {
  if (end > b.length) throw new RangeError('truncated');
}

/** A fourcc as a decoder name (AVI, ASF and Matroska's VFW mode name codecs by it). */
const FOURCC: Record<string, string> = {
  WMV1: 'wmv1',
  WMV2: 'wmv2',
  WMV3: 'wmv3',
  WVC1: 'vc1',
  WMVA: 'vc1',
  MP43: 'msmpeg4v3',
  DIV3: 'msmpeg4v3',
  MP42: 'msmpeg4v2',
  MPG4: 'msmpeg4v1',
  MP41: 'msmpeg4v1',
  XVID: 'mpeg4',
  DIVX: 'mpeg4',
  DX50: 'mpeg4',
  FMP4: 'mpeg4',
  MP4V: 'mpeg4',
  M4S2: 'mpeg4',
  MP4S: 'mpeg4',
  H264: 'h264',
  X264: 'h264',
  AVC1: 'h264',
  MJPG: 'mjpeg',
  HEVC: 'hevc',
  H265: 'hevc',
  HVC1: 'hevc',
  VP80: 'vp8',
  VP90: 'vp9',
  AV01: 'av1',
  CVID: 'cinepak',
  MPG1: 'mpeg1video',
  MPG2: 'mpeg2video',
};
function fourcc(tag: string): string {
  return FOURCC[tag.toUpperCase()] ?? `fourcc:${tag}`;
}

// ---- ISO base media (MP4, MOV)

const ISO_TOP = new Set(['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide', 'pnot']);
/** A moov larger than this is not read (a two-hour movie's is a few MB). */
const MAX_MOOV = 32 * 1024 * 1024;

interface Box {
  type: string;
  /** Content start and end, in the buffer. */
  start: number;
  end: number;
}

function boxes(b: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  let p = from;
  while (p + 8 <= to) {
    let len = u32(b, p);
    let hdr = 8;
    if (len === 1) {
      need(b, p + 16);
      len = u64(b, p + 8);
      hdr = 16;
    } else if (len === 0) len = to - p;
    if (len < hdr || p + len > to) break;
    out.push({ type: ascii(b, p + 4, 4), start: p + hdr, end: p + len });
    p += len;
  }
  return out;
}
const child = (b: Uint8Array, box: Box, type: string) =>
  boxes(b, box.start, box.end).find((c) => c.type === type);

const MP4_SAMPLE_ENTRY: Record<string, string> = {
  avc1: 'h264',
  avc3: 'h264',
  hvc1: 'hevc',
  hev1: 'hevc',
  vp08: 'vp8',
  vp09: 'vp9',
  av01: 'av1',
  jpeg: 'mjpeg',
  mjpa: 'mjpeg',
  mjpb: 'mjpeg',
  s263: 'h263',
  h263: 'h263',
  SVQ3: 'svq3',
  apch: 'prores',
  apcn: 'prores',
  apcs: 'prores',
  apco: 'prores',
  ap4h: 'prores',
};

/** MPEG-4 Systems object types (esds) for mp4v sample entries. */
function esdsCodec(b: Uint8Array, esds: Box): string {
  // Descriptors: a tag, a size of 1-4 bytes of 7 bits, the body.
  let p = esds.start + 4;
  const desc = () => {
    const tag = b[p++]!;
    let size = 0;
    for (let i = 0; i < 4; i++) {
      const c = b[p++]!;
      size = (size << 7) | (c & 0x7f);
      if (!(c & 0x80)) break;
    }
    return { tag, size };
  };
  if (desc().tag !== 0x03) return 'mpeg4';
  const flags = b[p + 2]!;
  p += 3;
  if (flags & 0x80) p += 2;
  if (flags & 0x40) p += 1 + b[p]!;
  if (flags & 0x20) p += 2;
  if (desc().tag !== 0x04) return 'mpeg4';
  const oti = b[p]!;
  if (oti === 0x21) return 'h264';
  if (oti >= 0x60 && oti <= 0x65) return 'mpeg2video';
  if (oti === 0x6a) return 'mpeg1video';
  if (oti === 0x6c) return 'mjpeg';
  return 'mpeg4';
}

async function probeIsoBmff(read: ReadRange, size: number, head: Uint8Array): Promise<MovieInfo> {
  let container: MovieContainer = 'mov';
  let moov: Uint8Array | undefined;
  for (let p = 0; p + 8 <= size;) {
    const h = p + 16 <= head.length ? head.subarray(p, p + 16) : await read(p, 16);
    let len = u32(h, 0);
    let hdr = 8;
    if (len === 1) {
      len = u64(h, 8);
      hdr = 16;
    } else if (len === 0) len = size - p;
    const type = ascii(h, 4, 4);
    if (len < hdr) break;
    if (type === 'ftyp') container = ascii(h, 8, 4) === 'qt  ' ? 'mov' : 'mp4';
    if (type === 'moov') {
      if (len - hdr > MAX_MOOV) break;
      moov = await read(p + hdr, len - hdr);
      break;
    }
    p += len;
  }
  const info: MovieInfo = { container, codec: null, width: null, height: null, durationMs: null };
  if (!moov) return info;
  const root: Box = { type: 'moov', start: 0, end: moov.length };
  const mvhd = child(moov, root, 'mvhd');
  if (mvhd) {
    const v1 = moov[mvhd.start] === 1;
    const scale = u32(moov, mvhd.start + (v1 ? 20 : 12));
    const dur = v1 ? u64(moov, mvhd.start + 24) : u32(moov, mvhd.start + 16);
    if (scale) info.durationMs = (dur / scale) * 1000;
  }
  for (const trak of boxes(moov, 0, moov.length).filter((x) => x.type === 'trak')) {
    const mdia = child(moov, trak, 'mdia');
    const hdlr = mdia && child(moov, mdia, 'hdlr');
    if (!mdia || !hdlr || ascii(moov, hdlr.start + 8, 4) !== 'vide') continue;
    const tkhd = child(moov, trak, 'tkhd');
    if (tkhd) {
      const at = tkhd.start + (moov[tkhd.start] === 1 ? 88 : 76);
      need(moov, at + 8);
      info.width = Math.round(u32(moov, at) / 65536);
      info.height = Math.round(u32(moov, at + 4) / 65536);
    }
    const mdhd = child(moov, mdia, 'mdhd');
    if (mdhd) {
      const v1 = moov[mdhd.start] === 1;
      const scale = u32(moov, mdhd.start + (v1 ? 20 : 12));
      const dur = v1 ? u64(moov, mdhd.start + 24) : u32(moov, mdhd.start + 16);
      if (scale && dur) info.durationMs = (dur / scale) * 1000;
    }
    const minf = child(moov, mdia, 'minf');
    const stbl = minf && child(moov, minf, 'stbl');
    // stsd: version and flags, an entry count, then the sample entries.
    const stsd = stbl && child(moov, stbl, 'stsd');
    const entry = stsd && boxes(moov, stsd.start + 8, stsd.end)[0];
    if (entry) {
      const tag = entry.type;
      // A visual sample entry: 6 reserved, a data reference, 16 predefined, then the size.
      const w = u16(moov, entry.start + 24);
      const h = u16(moov, entry.start + 26);
      if (w && h) [info.width, info.height] = [w, h];
      if (tag === 'mp4v') {
        const esds = boxes(moov, entry.start + 78, entry.end).find((x) => x.type === 'esds');
        info.codec = esds ? esdsCodec(moov, esds) : 'mpeg4';
      } else info.codec = MP4_SAMPLE_ENTRY[tag] ?? `fourcc:${tag}`;
    }
    break;
  }
  return info;
}

// ---- Matroska, WebM (EBML)

const EBML_UNKNOWN = -1;

/** An element header at `p`: its id (marker kept), content start and size (-1: unknown). */
function ebmlHeader(b: Uint8Array, p: number): { id: number; start: number; size: number } {
  const lenOf = (first: number) => {
    for (let n = 1; n <= 8; n++) if (first & (0x100 >> n)) return n;
    throw new RangeError('bad vint');
  };
  need(b, p + 1);
  const idLen = lenOf(b[p]!);
  if (idLen > 4) throw new RangeError('bad id');
  need(b, p + idLen + 1);
  let id = 0;
  for (let i = 0; i < idLen; i++) id = id * 256 + b[p + i]!;
  const q = p + idLen;
  const sLen = lenOf(b[q]!);
  need(b, q + sLen);
  let size = b[q]! & (0xff >> sLen);
  let allOnes = size === 0xff >> sLen;
  for (let i = 1; i < sLen; i++) {
    size = size * 256 + b[q + i]!;
    allOnes &&= b[q + i] === 0xff;
  }
  return { id, start: q + sLen, size: allOnes ? EBML_UNKNOWN : size };
}

function ebmlChildren(b: Uint8Array, from: number, to: number) {
  const out: { id: number; start: number; end: number }[] = [];
  for (let p = from; p < to;) {
    const e = ebmlHeader(b, p);
    const end = e.size === EBML_UNKNOWN ? to : e.start + e.size;
    if (end > to) break;
    out.push({ id: e.id, start: e.start, end });
    p = end;
  }
  return out;
}
const ebmlUint = (b: Uint8Array, s: number, e: number) => {
  let v = 0;
  for (let i = s; i < e; i++) v = v * 256 + b[i]!;
  return v;
};
function ebmlFloat(b: Uint8Array, s: number, e: number): number {
  const dv = new DataView(b.buffer, b.byteOffset + s, e - s);
  return e - s === 4 ? dv.getFloat32(0) : e - s === 8 ? dv.getFloat64(0) : NaN;
}

const MKV_CODEC: Record<string, string> = {
  V_VP8: 'vp8',
  V_VP9: 'vp9',
  V_AV1: 'av1',
  'V_MPEG4/ISO/AVC': 'h264',
  'V_MPEG4/ISO/ASP': 'mpeg4',
  'V_MPEG4/ISO/SP': 'mpeg4',
  'V_MPEG4/ISO/AP': 'mpeg4',
  'V_MPEGH/ISO/HEVC': 'hevc',
  V_THEORA: 'theora',
  V_MPEG1: 'mpeg1video',
  V_MPEG2: 'mpeg2video',
  V_MJPEG: 'mjpeg',
  'V_MS/VFW/FOURCC': 'vfw',
};

async function probeMatroska(read: ReadRange, size: number, head: Uint8Array): Promise<MovieInfo> {
  const at = async (p: number, n: number) =>
    p + n <= head.length ? head.subarray(p, p + n) : read(p, Math.min(n, size - p));
  const ebml = ebmlHeader(head, 0);
  const docType = ebmlChildren(head, ebml.start, ebml.start + ebml.size).find(
    (c) => c.id === 0x4282,
  );
  const info: MovieInfo = {
    container:
      docType && ascii(head, docType.start, docType.end - docType.start) === 'webm'
        ? 'webm'
        : 'mkv',
    codec: null,
    width: null,
    height: null,
    durationMs: null,
  };
  const seg = ebmlHeader(await at(ebml.start + ebml.size, 12), 0);
  if (seg.id !== 0x18538067) return info;
  let p = ebml.start + ebml.size + seg.start;
  const segEnd = seg.size === EBML_UNKNOWN ? size : Math.min(size, p + seg.size);
  let haveInfo = false;
  let haveTracks = false;
  // The segment's top-level elements, read one header at a time; clusters are skipped unread.
  while (p < segEnd && !(haveInfo && haveTracks)) {
    const hb = await at(p, 12);
    const e = ebmlHeader(hb, 0);
    if (e.size === EBML_UNKNOWN) break; // a live-recorded cluster: nothing past it is findable
    const start = p + e.start;
    if (e.id === 0x1549a966 || e.id === 0x1654ae6b) {
      const body = await at(start, Math.min(e.size, 4 * 1024 * 1024));
      if (e.id === 0x1549a966) {
        haveInfo = true;
        let scale = 1_000_000;
        let dur = NaN;
        for (const c of ebmlChildren(body, 0, body.length)) {
          if (c.id === 0x2ad7b1) scale = ebmlUint(body, c.start, c.end);
          if (c.id === 0x4489) dur = ebmlFloat(body, c.start, c.end);
        }
        if (Number.isFinite(dur)) info.durationMs = (dur * scale) / 1e6;
      } else {
        haveTracks = true;
        for (const t of ebmlChildren(body, 0, body.length).filter((c) => c.id === 0xae)) {
          const kids = ebmlChildren(body, t.start, t.end);
          const type = kids.find((c) => c.id === 0x83);
          if (!type || ebmlUint(body, type.start, type.end) !== 1) continue;
          const id = kids.find((c) => c.id === 0x86);
          const codecId = id ? ascii(body, id.start, id.end - id.start).replace(/\0+$/, '') : '';
          let codec = MKV_CODEC[codecId] ?? codecId;
          if (codec === 'vfw') {
            const priv = kids.find((c) => c.id === 0x63a2);
            codec = priv ? fourcc(ascii(body, priv.start + 16, 4)) : 'fourcc:?';
          }
          info.codec = codec || null;
          const video = kids.find((c) => c.id === 0xe0);
          if (video)
            for (const v of ebmlChildren(body, video.start, video.end)) {
              if (v.id === 0xb0) info.width = ebmlUint(body, v.start, v.end);
              if (v.id === 0xba) info.height = ebmlUint(body, v.start, v.end);
            }
          break;
        }
      }
    }
    p = start + e.size;
  }
  return info;
}

// ---- ASF (WMV)

/** A GUID as ASF stores it (the first three fields little-endian), in its usual text form. */
function guidAt(b: Uint8Array, o: number): string {
  if (o + 16 > b.length) return '';
  const hex = (v: number, n: number) => v.toString(16).padStart(n, '0');
  const tail = [...b.subarray(o + 8, o + 16)].map((x) => hex(x, 2)).join('');
  return `${hex(u32le(b, o), 8)}-${hex(u16le(b, o + 4), 4)}-${hex(u16le(b, o + 6), 4)}-${tail.slice(0, 4)}-${tail.slice(4)}`;
}
const ASF_HEADER = '75b22630-668e-11cf-a6d9-00aa0062ce6c';
const ASF_FILE_PROPERTIES = '8cabdca1-a947-11cf-8ee4-00c00c205365';
const ASF_STREAM_PROPERTIES = 'b7dc0791-a9b7-11cf-8ee6-00c00c205365';
const ASF_VIDEO_MEDIA = 'bc19efc0-5b4d-11cf-a8fd-00805f5c442b';

async function probeAsf(read: ReadRange, head: Uint8Array): Promise<MovieInfo> {
  const info: MovieInfo = {
    container: 'asf',
    codec: null,
    width: null,
    height: null,
    durationMs: null,
  };
  const len = u64le(head, 16);
  const h = len <= head.length ? head : await read(0, Math.min(len, 4 * 1024 * 1024));
  const count = u32le(h, 24);
  let p = 30;
  for (let i = 0; i < count && p + 24 <= h.length; i++) {
    const guid = guidAt(h, p);
    const size = u64le(h, p + 16);
    if (size < 24) break;
    const c = p + 24;
    if (guid === ASF_FILE_PROPERTIES) {
      need(h, c + 64);
      const play = u64le(h, c + 40);
      const preroll = u64le(h, c + 56);
      if (play) info.durationMs = play / 10_000 - preroll;
    } else if (guid === ASF_STREAM_PROPERTIES && guidAt(h, c) === ASF_VIDEO_MEDIA && !info.codec) {
      const t = c + 54;
      need(h, t + 31);
      info.width = u32le(h, t);
      info.height = u32le(h, t + 4);
      info.codec = fourcc(ascii(h, t + 11 + 16, 4));
    }
    p += size;
  }
  return info;
}

// ---- AVI (recognised to say so: the port's build cannot read it)

function probeAvi(head: Uint8Array): MovieInfo {
  const info: MovieInfo = {
    container: 'avi',
    codec: null,
    width: null,
    height: null,
    durationMs: null,
  };
  // RIFF chunks: a fourcc, a little-endian size, the body padded to even.
  const walk = (from: number, to: number, fn: (id: string, s: number, e: number) => void) => {
    for (let p = from; p + 8 <= to;) {
      const id = ascii(head, p, 4);
      const n = u32le(head, p + 4);
      const e = Math.min(p + 8 + n, to);
      fn(id, p + 8, e);
      p = p + 8 + n + (n & 1);
    }
  };
  walk(12, head.length, (id, s, e) => {
    if (id !== 'LIST' || ascii(head, s, 4) !== 'hdrl') return;
    walk(s + 4, e, (id2, s2, e2) => {
      if (id2 === 'avih' && e2 - s2 >= 40) {
        const usPerFrame = u32le(head, s2);
        const frames = u32le(head, s2 + 16);
        if (usPerFrame && frames) info.durationMs = (usPerFrame * frames) / 1000;
        info.width = u32le(head, s2 + 32);
        info.height = u32le(head, s2 + 36);
      }
      if (id2 === 'LIST' && ascii(head, s2, 4) === 'strl' && !info.codec) {
        let video = false;
        walk(s2 + 4, e2, (id3, s3) => {
          if (id3 === 'strh') video = ascii(head, s3, 4) === 'vids';
          if (id3 === 'strf' && video) info.codec = fourcc(ascii(head, s3 + 16, 4));
        });
      }
    });
  });
  return info;
}

// ---- Ogg (the port reads it, for audio; it has no Theora decoder)

function probeOgg(head: Uint8Array): MovieInfo {
  const info: MovieInfo = {
    container: 'ogg',
    codec: null,
    width: null,
    height: null,
    durationMs: null,
  };
  // The first page's first packet names the stream: 0x80 "theora" for Theora.
  const segs = head[26] ?? 0;
  const body = 27 + segs;
  if (head[body] === 0x80 && ascii(head, body + 1, 6) === 'theora') {
    info.codec = 'theora';
    need(head, body + 20);
    info.width = ((head[body + 14]! << 16) | (head[body + 15]! << 8) | head[body + 16]!) >>> 0;
    info.height = ((head[body + 17]! << 16) | (head[body + 18]! << 8) | head[body + 19]!) >>> 0;
  }
  return info;
}
