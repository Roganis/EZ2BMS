// A package's song.ini read the way EZ2PORT reads it (ez2/usersongs.c
// read_song_ini), so EZ2BMS can tell what is already in a songs folder - and
// its own [EZ2BMS] section, which the port ignores.
//
// The port's rules, kept here byte for byte: lines are cut at 511 bytes; a
// line starting with ; or # is a comment; a ; anywhere in a value ends it;
// sections and keys ignore ASCII case; quotes are not stripped; a BOM is not
// skipped (so a BOM before [Song] hides the whole song); Key keeps 16 bytes,
// Title 32, a mode 23, an asset 255; Category outside 1..48 means 48; at most
// 32 [Charts] rows, and a row whose tier is not NM/HD/SHD/EX is dropped.

import { encodeUtf8 } from '../io/text';
import type { Tier } from '../model/types';
import { EZ2BMS_SECTION } from './text';

export interface SongIniRead {
  /** Empty when the port would not take the folder for a song. */
  key: string;
  title: string;
  category: number;
  charts: { mode: string; tier: Tier; level: number }[];
  assets: { disc: string; songname: string; eyecatch: string; preview: string };
  bga: { file: string; startMs: number };
  /** Values of EZ2BMS's own section (not read by the port). */
  ez2bms: Record<string, string>;
  /** [Song] Converter, which the port does not read either. */
  converter: string;
}

const TIERS: Tier[] = ['NM', 'HD', 'SHD', 'EX'];

// The port copies bytes, so no BOM is skipped here either (one before [Song]
// makes the port ignore the file); invalid UTF-8 reads as U+FFFD.
const utf8 = new TextDecoder('utf-8', { ignoreBOM: true });
const text = (b: Uint8Array) => utf8.decode(b);
const ASSETS = ['disc', 'songname', 'eyecatch', 'preview'] as const;

/** The port's trim: blanks, tabs, CR and LF off both ends. */
const trim = (s: Uint8Array): Uint8Array => {
  let a = 0;
  let b = s.length;
  const blank = (c: number) => c === 0x20 || c === 0x09 || c === 0x0d || c === 0x0a;
  while (a < b && blank(s[a]!)) a++;
  while (b > a && blank(s[b - 1]!)) b--;
  return s.subarray(a, b);
};

/** ASCII-only case folding, as ez2_ci_equal compares. */
const ci = (a: string, b: string) =>
  a.replace(/[A-Z]/g, (c) => c.toLowerCase()) === b.toLowerCase();

/** snprintf into a `size`-byte buffer: at most size-1 bytes (a UTF-8 character can be cut). */
const cap = (b: Uint8Array, size: number): string => text(b.subarray(0, size - 1));

/** C atoi: optional blanks and sign, then digits. */
export function atoi(s: string): number {
  const m = /^[ \t\n\v\f\r]*([+-]?\d+)/.exec(s);
  if (!m) return 0;
  const n = Number(m[1]);
  // atoi's overflow is undefined; int32 wrap is what the port's builds do.
  return n | 0;
}

export function readSongIni(input: Uint8Array | string): SongIniRead {
  const bytes = typeof input === 'string' ? encodeUtf8(input) : input;
  const out: SongIniRead = {
    key: '',
    title: '',
    category: 48,
    charts: [],
    assets: { disc: '', songname: '', eyecatch: '', preview: '' },
    bga: { file: '', startMs: 0 },
    ez2bms: {},
    converter: '',
  };
  let section = '';
  let pos = 0;
  while (pos < bytes.length) {
    let end = bytes.indexOf(0x0a, pos);
    if (end < 0) end = bytes.length;
    const raw = bytes.subarray(pos, Math.min(end, pos + 511));
    pos = end + 1;
    const line = trim(raw);
    if (!line.length || line[0] === 0x3b || line[0] === 0x23) continue;
    if (line[0] === 0x5b) {
      const close = line.indexOf(0x5d);
      if (close >= 0) section = cap(line.subarray(1, close), 32);
      continue;
    }
    const eq = line.indexOf(0x3d);
    if (eq < 0) continue;
    const key = text(trim(line.subarray(0, eq)));
    let valB = trim(line.subarray(eq + 1));
    const semi = valB.indexOf(0x3b);
    if (semi >= 0) valB = trim(valB.subarray(0, semi));
    const val = text(valB);
    if (ci(section, 'Song')) {
      if (ci(key, 'Key')) out.key = cap(valB, 17);
      else if (ci(key, 'Title')) out.title = cap(valB, 33);
      else if (ci(key, 'Category')) {
        const c = atoi(val);
        if (c >= 1 && c <= 48) out.category = c;
      } else if (ci(key, 'Converter')) out.converter = val;
    } else if (ci(section, 'Charts')) {
      const dot = key.indexOf('.');
      if (dot >= 0 && out.charts.length < 32) {
        const tier = TIERS.find((t) => ci(key.slice(dot + 1), t));
        if (tier)
          out.charts.push({
            mode: cap(encodeUtf8(key.slice(0, dot)), 24),
            tier,
            level: atoi(val),
          });
      }
    } else if (ci(section, 'Assets')) {
      for (const a of ASSETS) if (ci(key, a)) out.assets[a] = cap(valB, 256);
    } else if (ci(section, 'Bga')) {
      if (ci(key, 'File')) out.bga.file = cap(valB, 256);
      else if (ci(key, 'StartMs')) out.bga.startMs = atoi(val);
    } else if (ci(section, EZ2BMS_SECTION)) {
      out.ez2bms[key] = val;
    }
  }
  return out;
}
