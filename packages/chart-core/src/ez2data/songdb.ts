// `song.bin` - a mode's song table: which songs the select lists, each
// tier's level and the song's BPM, and the 47 category groups. One per mode
// under system/<mode>/ (EZ2PORT ez2/songdb.c, which transcribes the original's
// SongTable::loadBinFile).
//
// It has a cipher of its own, not the .ez/.ezi/.ini one: two 32-byte tables
// read straight out of the user's executable at 0x4ae9dc, each byte XORed
// with a mask that depends only on its position - so the same function
// encrypts and decrypts. A decrypted table starts "EZSL", which is how the
// port (and we) know the tables were right. The tables never live here.
//
// Record, 0x56 bytes: key[16] (the song's folder under sound/, any case),
// name[32] (empty but for CV2Mix, which keys by number), kind, then four
// tiers of {u8 level; f32 a; f32 b} packed at stride 9 from +0x32 - level 0
// meaning the mode does not offer that tier, `b` being the BPM.

import { exeRead } from './keytable';
import { ciEq } from './initext';

export const SONGDB_TABLE_VA = 0x4ae9dc;
export const SONGDB_TABLE_SIZE = 64;
export const SONGDB_RECORD = 0x56;
export const SONGDB_CATEGORIES = 47;
/** The tier suffixes in step order (NM, HD, SHD, EX), as the chart files spell them. */
export const SONGDB_TIER_SUFFIX = ['', '-hd', '-shd', '-ex'] as const;

export interface SongStep {
  level: number;
  a: number;
  /** The song's BPM. */
  b: number;
}

export interface SongEntry {
  key: string;
  name: string;
  kind: number;
  steps: [SongStep, SongStep, SongStep, SongStep];
}

export interface SongDb {
  entries: SongEntry[];
  /** The 47 category groups' keys, in order (group g is song.ini Category g + 1). */
  groups: string[][];
}

export class SongDbError extends Error {
  constructor(
    readonly code: 'magic' | 'short' | 'tables',
    message: string,
  ) {
    super(message);
  }
}

/**
 * ez2_songdb_decrypt, which is also its own inverse: every byte is XORed with
 * a mask of its position alone. Returns a new buffer.
 */
export function songdbCrypt(buf: Uint8Array, tables: Uint8Array): Uint8Array {
  if (tables.length !== SONGDB_TABLE_SIZE) {
    throw new SongDbError('tables', `song.bin's cipher tables are ${SONGDB_TABLE_SIZE} bytes`);
  }
  const t1 = tables.subarray(0, 32);
  const t2 = tables.subarray(32);
  // tbl1[k] ^ tbl2[k] over the 32 rounds does not depend on the byte.
  let konst = 0;
  for (let k = 0; k < 32; k++) konst ^= t1[k]! ^ t2[k]!;
  const out = new Uint8Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    let c = t2[(i + 1) & 31]! ^ buf[i]! ^ (i & 0xff);
    // The k == 0 round divides by twelve, not by zero (the original's
    // `test edi,edi; jne; mov edi,0xc`).
    for (let k = 0; k < 32; k++) c ^= t1[i % (k || 12)]!;
    out[i] = c ^ konst;
  }
  return out;
}

const field = (b: Uint8Array) => {
  const nul = b.indexOf(0);
  return String.fromCharCode(...(nul < 0 ? b : b.subarray(0, nul)));
};

/** ez2_songdb_parse: a decrypted song.bin. */
export function parseSongdb(data: Uint8Array): SongDb {
  if (data.length < 0x10) throw new SongDbError('short', 'song.bin is too short');
  if (field(data.subarray(0, 4)) !== 'EZSL') {
    throw new SongDbError(
      'magic',
      "song.bin does not say EZSL: the wrong executable's tables, or not a song.bin",
    );
  }
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = dv.getUint16(6, true);
  const off = dv.getUint32(8, true);
  if (off > data.length || Math.floor((data.length - off) / SONGDB_RECORD) < count) {
    throw new SongDbError('short', "song.bin's header points past its end");
  }
  const db: SongDb = { entries: [], groups: [] };
  for (let i = 0; i < count; i++) {
    const r = off + i * SONGDB_RECORD;
    const step = (s: number): SongStep => {
      const g = r + 0x32 + s * 9; // stride nine: the floats sit unaligned
      return {
        level: data[g]!,
        a: dv.getFloat32(g + 1, true),
        b: dv.getFloat32(g + 5, true),
      };
    };
    db.entries.push({
      key: field(data.subarray(r, r + 16)),
      name: field(data.subarray(r + 0x10, r + 0x30)),
      kind: data[r + 0x30]!,
      steps: [step(0), step(1), step(2), step(3)],
    });
  }
  // The groups behind +0x0c: u16 count, then that many 16-byte keys. A
  // group running off the end leaves it and the rest empty, as the port does.
  let p = dv.getUint32(0x0c, true);
  for (let g = 0; g < SONGDB_CATEGORIES; g++) {
    if (p + 2 > data.length) break;
    const cnt = dv.getUint16(p, true);
    p += 2;
    if (cnt > Math.floor((data.length - p) / 16)) break;
    const keys: string[] = [];
    for (let k = 0; k < cnt; k++) keys.push(field(data.subarray(p + k * 16, p + k * 16 + 16)));
    db.groups[g] = keys;
    p += cnt * 16;
  }
  for (let g = 0; g < SONGDB_CATEGORIES; g++) db.groups[g] ??= [];
  return db;
}

/**
 * A song.bin as it is on disk: plaintext already, or decrypted with the
 * tables in the user's executable (and refused if that does not give EZSL).
 */
export function readSongdb(bytes: Uint8Array, exe?: Uint8Array): SongDb {
  if (field(bytes.subarray(0, 4)) === 'EZSL') return parseSongdb(bytes);
  if (!exe) {
    throw new SongDbError('tables', 'song.bin is encrypted: set the unpacked EZ2AC executable');
  }
  return parseSongdb(songdbCrypt(bytes, exeRead(exe, SONGDB_TABLE_VA, SONGDB_TABLE_SIZE)));
}

/** The entry for a key, case-insensitively, as SongTable::find matches (ez2_songdb_find). */
export function songdbFind(db: SongDb, key: string): SongEntry | undefined {
  return db.entries.find((e) => ciEq(e.key, key));
}

/**
 * ez2_songdb_category_view: a category's rows in its own order - each key
 * resolved against the entries case-insensitively, kept when its first level
 * is non-zero. Entry indices.
 */
export function songdbCategoryView(db: SongDb, cat: number): number[] {
  const out: number[] = [];
  for (const key of db.groups[cat] ?? []) {
    const j = db.entries.findIndex((e) => ciEq(e.key, key));
    if (j >= 0 && db.entries[j]!.steps[0].level > 0) out.push(j);
  }
  return out;
}

/** The 1-based categories (song.ini's Category numbers) a key is listed in. */
export function songdbGroupsOf(db: SongDb, key: string): number[] {
  const out: number[] = [];
  db.groups.forEach((keys, g) => {
    if (keys.some((k) => ciEq(k, key))) out.push(g + 1);
  });
  return out;
}

/**
 * The charts a mode's table offers for an entry (ez2_songdb_charts): for each
 * tier with a level, `<mode><players>p-<key><suffix>.ez` if the song's folder
 * has it (any case); with none of those, CV2Mix's shape `<mode><players>p-
 * <name>.ez`. `files` is the song folder's listing; the names returned are
 * as listed.
 */
export function songdbCharts(
  e: SongEntry,
  modeFile: string,
  files: readonly string[],
  players = 1,
): { tier: number; level: number; file: string }[] {
  const find = (name: string) => files.find((f) => ciEq(f, name));
  const out: { tier: number; level: number; file: string }[] = [];
  e.steps.forEach((s, t) => {
    if (s.level <= 0) return;
    const f = find(`${modeFile}${players}p-${e.key}${SONGDB_TIER_SUFFIX[t]}.ez`);
    if (f) out.push({ tier: t, level: s.level, file: f });
  });
  if (!out.length && e.name) {
    const f = find(`${modeFile}${players}p-${e.name}.ez`);
    if (f) out.push({ tier: 0, level: e.steps[0].level, file: f });
  }
  return out;
}

/**
 * The folder an entry's charts are in (ez2_songdb_song_dir, less the user
 * packages): the key, else the name, else the name without its last
 * `-suffix` (CV2Mix's "11ambit-5o1" is in `11ambit`), matched in any case
 * against the `sound/` listing.
 */
export function songdbSongDir(e: SongEntry, soundDirs: readonly string[]): string | undefined {
  const find = (n: string) => (n ? soundDirs.find((d) => ciEq(d, n)) : undefined);
  const dash = e.name.lastIndexOf('-');
  return find(e.key) ?? find(e.name) ?? (dash > 0 ? find(e.name.slice(0, dash)) : undefined);
}

/**
 * The category an imported song should be filed in: the first version bank
 * (1st ... TT: song.ini Categories 4-19) any mode's table lists it in, else
 * CUSTOM (48). The HOT/NEW/ALL, level and alphabet banks say nothing about
 * the song itself.
 */
export function versionCategory(dbs: readonly SongDb[], key: string): number {
  let best = 48;
  for (const db of dbs)
    for (const c of songdbGroupsOf(db, key)) if (c >= 4 && c <= 19 && c < best) best = c;
  return best;
}

/**
 * A plaintext song.bin for a table (what parseSongdb reads back): the header,
 * the records from 0x10, then the 47 groups. For the synthetic game the
 * tests and the browser build use, and for cabinet exports (M6).
 */
export function writeSongdb(db: SongDb): Uint8Array {
  const groups = Array.from({ length: SONGDB_CATEGORIES }, (_, g) => db.groups[g] ?? []);
  const recOff = 0x10;
  const grpOff = recOff + db.entries.length * SONGDB_RECORD;
  const size = grpOff + groups.reduce((n, g) => n + 2 + g.length * 16, 0);
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  const put = (at: number, s: string, n: number) => {
    for (let i = 0; i < Math.min(n, s.length); i++) out[at + i] = s.charCodeAt(i) & 0xff;
  };
  put(0, 'EZSL', 4);
  dv.setUint16(6, db.entries.length, true);
  dv.setUint32(8, recOff, true);
  dv.setUint32(0x0c, grpOff, true);
  db.entries.forEach((e, i) => {
    const r = recOff + i * SONGDB_RECORD;
    put(r, e.key, 16);
    put(r + 0x10, e.name, 32);
    out[r + 0x30] = e.kind & 0xff;
    e.steps.forEach((s, t) => {
      const g = r + 0x32 + t * 9;
      out[g] = s.level & 0xff;
      dv.setFloat32(g + 1, s.a, true);
      dv.setFloat32(g + 5, s.b, true);
    });
  });
  let p = grpOff;
  for (const keys of groups) {
    dv.setUint16(p, keys.length, true);
    p += 2;
    for (const k of keys) {
      put(p, k, 16);
      p += 16;
    }
  }
  return out;
}
