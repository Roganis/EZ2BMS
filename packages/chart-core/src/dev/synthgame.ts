// A synthetic EZ2AC data folder, for tests and the browser build: the files
// the importers read, written in their documented formats by hand-made code -
// nothing here comes from, or stands in for, a game install. (CLAUDE.md:
// game content is never committed; tests that need a real install read
// EZ2_ROOT/EZ2_EXE.)

import { SONGDB_TABLE_VA, songdbCrypt, writeSongdb, type SongEntry } from '../ez2data/songdb';
import { nameField, writeEzff, type EzffChart, type EzffRecord } from '../io/ez/ezff';
import { modeDef } from '../modes/registry';
import { modeNames, type ModeId } from '../modes/ids';

/** The P2 control of a single-player lane (the 2P side's keys, 18-25). */
function p2(slot: number): number {
  if (slot >= 10 && slot <= 14) return slot + 8;
  if (slot === 15) return 23;
  if (slot === 17) return 25;
  return slot;
}

const DOUBLE = new Set<ModeId>(['10k', '14k', 'andromeda', 'catch']);

/**
 * A mode's `.gds` (EZ2PORT docs/gds-slots.md, ez2/gds.c): its lanes in order,
 * each with the control that drives it and the chart track it plays, from the
 * bundled table (modes/registry.ts). Single-player modes get a [Slot2] for
 * the 2P side, as the game's own descriptors have.
 */
export function synthGds(mode: ModeId): string {
  const cols = modeDef(mode).columns;
  const slots = DOUBLE.has(mode)
    ? [cols.map((c) => c.slot)]
    : [cols.map((c) => c.slot), cols.map((c) => p2(c.slot))];
  const lines = [
    `; Synthetic ${modeNames(mode).portName}.gds in the documented format (EZ2PORT docs/gds-slots.md).`,
    '; Generated for tests - not copied from any game install.',
    '[General]',
    `NumberOfSlot=${slots.length}`,
    'MaxBaseStage=3',
  ];
  slots.forEach((keys, s) => {
    lines.push('', `[Slot${s + 1}]`, `NumberOfTrack=${cols.length}`);
    cols.forEach((c, i) => {
      const k = keys[i]!;
      // The turntable is one lane driven by two controls (up and down).
      const k2 = k === 15 || k === 23 ? k + 1 : -1;
      lines.push(`Track${i + 1} =`, '{', `    Key=${k},${k2}`, `    SongTrack=${c.track}`, '}');
    });
  });
  return lines.join('\r\n') + '\r\n';
}

/**
 * A minimal PE32 image holding `data` at the given virtual addresses (image
 * base 0x400000): enough for peVaToOffset / exeRead / keyTableFromExe to find
 * them the way they find the real executable's. The bytes are the caller's -
 * made-up tables, never the game's.
 */
export function synthPe(data: { va: number; bytes: Uint8Array }[]): Uint8Array {
  const base = 0x400000;
  const lo = Math.min(...data.map((d) => d.va - base)) & ~0xfff;
  const hi = (Math.max(...data.map((d) => d.va - base + d.bytes.length)) + 0xfff) & ~0xfff;
  const raw = 0x400;
  const out = new Uint8Array(raw + (hi - lo));
  const dv = new DataView(out.buffer);
  out.set([0x4d, 0x5a], 0); // MZ
  const pe = 0x80;
  dv.setUint32(0x3c, pe, true);
  out.set([0x50, 0x45, 0, 0], pe); // PE\0\0
  dv.setUint16(pe + 4, 0x14c, true); // i386
  dv.setUint16(pe + 6, 1, true); // one section
  const optSize = 0xe0;
  dv.setUint16(pe + 20, optSize, true);
  dv.setUint16(pe + 24, 0x10b, true); // PE32
  dv.setUint32(pe + 24 + 28, base, true);
  const s = pe + 24 + optSize;
  out.set([0x2e, 0x64, 0x61, 0x74, 0x61], s); // .data
  dv.setUint32(s + 8, hi - lo, true);
  dv.setUint32(s + 12, lo, true);
  dv.setUint32(s + 16, hi - lo, true);
  dv.setUint32(s + 20, raw, true);
  for (const d of data) out.set(d.bytes, raw + (d.va - base - lo));
  return out;
}

/** An `.ssf` keysound (ez2bms-audio ssf.rs: an 18-byte header, then PCM), 16-bit mono. */
export function synthSsf(frames: number, seed: number, rate = 44100): Uint8Array {
  const out = new Uint8Array(18 + frames * 2);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, 1, true);
  dv.setUint32(2, rate, true);
  dv.setUint32(6, rate * 2, true);
  dv.setUint16(10, 2, true);
  dv.setUint16(12, 16, true);
  dv.setUint32(14, frames * 2, true);
  for (let i = 0; i < frames; i++) {
    const env = 1 - i / frames;
    dv.setInt16(18 + i * 2, Math.round(Math.sin((i * (seed + 3)) / 20) * 12000 * env), true);
  }
  return out;
}

/** Made-up song.bin cipher tables (never the game's). */
export const SYNTH_SONGDB_TABLES = Uint8Array.from({ length: 64 }, (_, i) => (i * 73 + 29) & 0xff);

export interface SynthGame {
  /** Game-relative path (forward slashes, as cased on "disk") -> bytes. */
  files: Map<string, Uint8Array>;
  /** An executable holding the made-up song.bin tables where the real ones sit. */
  exe: Uint8Array;
}

const text = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0) & 0xff));

const note = (tick: number, key: number, o: Partial<EzffRecord> = {}): EzffRecord => ({
  tick,
  type: 1,
  key,
  vel: 127,
  pan: 64,
  kind: 0,
  length: 0,
  ...o,
});

/** An EZFF chart with `tracks` tracks, records placed per track, sorted by tick. */
function ezff(
  version: EzffChart['version'],
  bpm: number,
  tracks: number,
  recs: [number, EzffRecord][],
): Uint8Array {
  const ts = Array.from({ length: tracks }, () => ({
    name: new Uint8Array(),
    ticks: 0,
    records: [] as EzffRecord[],
  }));
  for (const [t, r] of recs) ts[t]!.records.push(r);
  let total = 0;
  for (const t of ts) {
    t.records.sort((a, b) => a.tick - b.tick);
    t.ticks = t.records.at(-1)?.tick ?? 0;
    total = Math.max(total, t.ticks);
  }
  return writeEzff({
    version,
    name: nameField('synthetic'),
    name2: new Uint8Array(),
    ticksPerMeasure: 192,
    bpm,
    bpm2: bpm,
    totalTicks: total,
    tracks: ts,
  });
}

const f32bits = (v: number) => {
  const b = new DataView(new ArrayBuffer(4));
  b.setFloat32(0, v, true);
  return b.getUint32(0, true);
};

const step = (level: number, bpm: number) => ({ level, a: 0, b: Math.fround(bpm) });
const entry = (key: string, levels: number[], bpm: number): SongEntry => ({
  key,
  name: '',
  kind: 0,
  steps: [0, 1, 2, 3].map((t) => step(levels[t] ?? 0, bpm)) as SongEntry['steps'],
});

/**
 * A small EZ2AC data folder in the documented formats (plaintext charts,
 * which the port reads as they are; an encrypted song.bin, with the tables
 * in `exe`):
 *
 * - `alpha` (title "Alpha Song"): StreetMix NM (v8: a tempo change, a hold
 *   with velocity/pan/kind, scratch and pedal, background on backing tracks
 *   and on an effector track StreetMix lacks, a background note with a
 *   length, a scroll and a volume record, a keysound shared by two slots, a
 *   slot whose file is missing, a note on an unlisted slot, a sample of
 *   `Beta`'s by relative path) and HD (no .ini: the engine's defaults, the
 *   level from song.bin); 7StreetMix NM (v6).
 * - `Beta`: StreetMix NM (v5) with a legacy note-name .ezi.
 * - `AlphaSong`: a folder with no charts, so "alphasong" is a shipped key.
 */
export function synthGame(): SynthGame {
  const files = new Map<string, Uint8Array>();
  const put = (p: string, b: Uint8Array | string) =>
    files.set(p, typeof b === 'string' ? text(b) : b);
  put('system/StreetMix/StreetMix.gds', synthGds('5k'));
  put('system/7StreetMix/7StreetMix.gds', synthGds('7k'));
  const groups = (g: Record<number, string[]>) => Array.from({ length: 47 }, (_, i) => g[i] ?? []);
  const bin = (entries: SongEntry[], g: Record<number, string[]>) =>
    songdbCrypt(writeSongdb({ entries, groups: groups(g) }), SYNTH_SONGDB_TABLES);
  // Category 3 is ALL, 4 the 1st version bank, 9 PLT (song/categories.ts).
  put(
    'system/StreetMix/song.bin',
    bin([entry('alpha', [3, 7], 150), entry('beta', [2], 128)], {
      2: ['alpha', 'beta'],
      3: ['BETA'],
      8: ['alpha'],
    }),
  );
  put(
    'system/7StreetMix/song.bin',
    bin([entry('alpha', [5], 150)], { 2: ['alpha'], 8: ['alpha'] }),
  );
  put(
    'text/manifest.songs.ini',
    '; synthetic\r\n[system/songname/alpha.abm]\r\nsize = 256,32\r\n' +
      'line = "Alpha Song" | 246,15,7 | bold | ffffff | right | 236\r\n' +
      'line = "(Synthetic)" | 246,27,6 | bold | c5c5c5 | right | 236\r\n' +
      '[system/songname/beta.abm]\r\nline = "Beta" | 246,22,9 | bold | ffffff | right | 236\r\n',
  );
  put('sound/alpha/kick.ssf', synthSsf(4410, 1));
  put('sound/alpha/snare.ssf', synthSsf(6615, 2));
  put('sound/alpha/pad.ssf', synthSsf(44100 * 3, 3));
  put('sound/Beta/Bass.ssf', synthSsf(8820, 4));
  put('sound/AlphaSong/readme.txt', 'not a song');

  // alpha, StreetMix NM: tracks 3-7 keys, 10 scratch, 11 pedal (modes/registry.ts).
  const M = 192;
  put(
    'sound/alpha/streetmix1p-alpha.ez',
    ezff(8, 150, 23, [
      [0, { tick: 0, type: 3, bpm: 150 }],
      [0, { tick: 4 * M, type: 3, bpm: 175.3 }],
      [0, { tick: 2 * M, type: 6, raw: [f32bits(2), 0] }],
      [1, note(0, 3)],
      [1, { tick: 0, type: 2, value: 100 }],
      [3, note(M, 1)],
      [4, note(M + 48, 2)],
      [5, note(2 * M, 1, { length: 6 + 96, vel: 100, pan: 30, kind: 2 })],
      [6, note(3 * M, 5)],
      [7, note(3 * M + 24, 6)],
      [10, note(4 * M, 2)],
      [11, note(4 * M + 48, 1)],
      [8, note(5 * M, 2)],
      [22, note(5 * M, 4, { length: 20 })],
      [3, note(6 * M, 9)],
    ]),
  );
  put(
    'sound/alpha/streetmix1p-alpha.ezi',
    '1 1 kick.wav\r\n2 1 snare.wav\r\n3 1 pad.wav\r\n4 1 ..\\..\\sound\\beta\\bass.wav\r\n5 1 KICK.wav\r\n6 1 gone.wav\r\n',
  );
  put(
    'sound/alpha/streetmix1p-alpha.ini',
    '[General]\r\nLevel=1\r\nMeasureScale=1.6\r\n[JudgmentDelta]\r\nKool=9\r\nCool=27\r\nGood=53\r\nMiss=73\r\n' +
      '[GaugeUpDownRate]\r\nCool=0.2\r\nGood=0.1\r\nMiss=-1.8\r\nFail=-4.8\r\n',
  );
  // alpha, StreetMix HD: no .ini.
  put(
    'sound/alpha/StreetMix1p-alpha-hd.ez',
    ezff(8, 150, 12, [
      [1, note(0, 3)],
      [3, note(M, 1)],
      [4, note(M, 2)],
      [5, note(M + 16, 1)],
    ]),
  );
  put('sound/alpha/StreetMix1p-alpha-hd.ezi', '1 1 kick.wav\r\n2 1 snare.wav\r\n3 1 pad.wav\r\n');
  // alpha, 7StreetMix NM (v6): the effector lanes are keys 6 and 7 there.
  put(
    'sound/alpha/7streetmix1p-alpha.ez',
    ezff(6, 150, 12, [
      [1, note(0, 3)],
      [8, note(M, 1)],
      [9, note(M + 48, 2)],
    ]),
  );
  put('sound/alpha/7streetmix1p-alpha.ezi', '1 1 kick.wav\r\n2 1 snare.wav\r\n3 1 pad.wav\r\n');
  // Beta, StreetMix NM (v5): legacy note names.
  put(
    'sound/Beta/streetmix1p-beta.ez',
    ezff(5, 128, 12, [
      [3, note(0, 0)],
      [4, note(M, 1)],
    ]),
  );
  put('sound/Beta/streetmix1p-beta.ezi', 'C0 1 bass.wav\r\nC#0 1 ..\\alpha\\kick.wav\r\n');
  put('sound/Beta/streetmix1p-beta.ini', '[General]\r\nLevel=2\r\n');
  return { files, exe: synthPe([{ va: SONGDB_TABLE_VA, bytes: SYNTH_SONGDB_TABLES }]) };
}
