// The game's own charts -> an EZ2BMS song: one bmson per `.ez`, the song file,
// and the keysounds to copy (and convert from .ssf).
//
// A chart is read the way EZ2PORT plays it, so an imported original sounds and
// times exactly as it does in the port:
//
// - Positions: an EZFF tick is 1/48 beat (192 a measure), so at 240 pulses a
//   beat every tick is exactly 5 pulses - nothing is rounded.
// - Tempo: ez2_tempo_build - the header BPM at tick 0, then every type-3
//   record on any track with 0 < bpm <= 1000, sorted by tick (stably: two at
//   one tick, the later governs). The BPM in force at tick 0 is `init_bpm`;
//   the rest are BPM events. Values are the file's f32s, written as the
//   shortest decimal that is still that f32, so a re-publish writes the same
//   bits.
// - Lanes: a track is a lane when the mode's .gds (the game's own, when
//   read; else the bundled table) plays it there; every other track is
//   background, keeping its number as `x_track` for a cabinet export (M6).
// - Notes: velocity, pan and hold kind as `x_vel`/`x_pan`/`x_kind` (omitted
//   at 127/64/0); a length over 6 is a hold of `length - 6` ticks on a lane
//   (publish writes background notes as taps, so their length is kept raw
//   as `x_len`).
// - Keysounds: the .ezi (legacy note names read as notes: ezi.ts), each name
//   resolved as ez2_ezi_resolve does (the .ssf, relative paths into other
//   songs' folders), one sound channel per file.
// - Level from the mode's song.bin, else the .ini; judgement and gauge from
//   the .ini (the engine's defaults when there is none).
//
// Everything with no bmson home is kept rather than dropped - other record
// types and the header's fields in `x_ez`/`x_ez_records` - and said, as notes
// Issues shows with the chart.

import { deltasOfIni, parseSongIni, type ParsedSongIni } from '../../engine/songini';
import { ez2Decrypt, looksPlaintext } from '../../ez2data/crypt';
import type { Gds } from '../../ez2data/gds';
import { decodeCp949 } from '../../ez2data/initext';
import { songdbFind, versionCategory, type SongDb } from '../../ez2data/songdb';
import type { SongTitle } from '../../ez2data/songtext';
import type { OpenNote, Severity } from '../../lint/lint';
import { newChart } from '../../model/defaults';
import type { ChartData, Extra, NoteRec, SoundChannel, Tier } from '../../model/types';
import { chartBaseName, deriveSongKey, parseChartName } from '../../modes/filenames';
import { modeNames, type ModeId } from '../../modes/ids';
import { columnsFromGds, modeDef } from '../../modes/registry';
import { newSongFile, type SongFile } from '../../song/songfile';
import {
  EZ_BEATS,
  EZ_BPM,
  EZ_MARK,
  EZ_NOTE,
  EZ_SCROLL,
  EZ_VOLUME,
  HOLD_BIAS,
  readEzff,
  type EzffChart,
  type EzffRecord,
} from './ezff';
import { eziResolve, eziTable, parseEzi, type EziEntry } from './ezi';

export interface EzTables {
  ez: Uint8Array;
  ezi: Uint8Array;
  ini: Uint8Array;
}

export interface EzChartSource {
  /** The .ez's name as its folder lists it. */
  file: string;
  ez: Uint8Array;
  /** The sibling .ezi and .ini, when the folder has them (either case). */
  ezi?: Uint8Array;
  ini?: Uint8Array;
}

export interface EzSongSource {
  /** The song's folder under `sound/`, as listed. */
  dir: string;
  charts: EzChartSource[];
  /** The .ez/.ezi/.ini cipher tables from the user's executable; plaintext files need none. */
  tables?: EzTables;
  /** Why there are no tables, said when a chart turns out to be encrypted. */
  tablesError?: string;
  /** A mode's .gds from the game: its lanes as the game plays them. */
  gds?: Partial<Record<ModeId, Gds>>;
  /** A mode's song table: levels and categories. */
  songdbs?: Partial<Record<ModeId, SongDb>>;
  /** From the port's manifest (ez2data/songtext.ts). */
  title?: SongTitle;
  /**
   * Where a game-relative path is on disk, matched in any case
   * ("sound/stay/p_mr.ssf" -> "sound/Stay/p_MR.ssf"), or undefined.
   */
  locate(path: string): string | undefined;
  /** The game's `sound/` folders: shipped keys, which a new key must not be. */
  shipped: readonly string[];
}

export interface ImportedChart {
  file: string;
  data: ChartData;
  mode: ModeId;
  tier: Tier;
  /** The .ez it came from. */
  from: string;
  notes: OpenNote[];
}

export interface SampleCopy {
  /** Game-relative path, as on disk. */
  from: string;
  /** Path in the song folder. */
  to: string;
  /** `pcm`: an .ssf/.ezw whose PCM becomes a .wav; `copy`: as it is. */
  convert: 'pcm' | 'copy';
}

export interface EzSongImport {
  /** The new song's key (never a shipped one). */
  key: string;
  song: SongFile;
  charts: ImportedChart[];
  copies: SampleCopy[];
  /** About the song as a whole (charts left out, why). */
  notes: OpenNote[];
}

export class EzImportError extends Error {}

const TIER_INDEX: Record<Tier, number> = { NM: 0, HD: 1, SHD: 2, EX: 3 };
const f32 = Math.fround;

/** The shortest decimal that reads back as the same f32 (175.3, not 175.3000030517578). */
export function f32Decimal(v: number): number {
  const x = f32(v);
  if (!Number.isFinite(x) || x === 0) return x;
  for (let p = 1; p <= 9; p++) {
    const d = Number(x.toPrecision(p));
    if (f32(d) === x) return d;
  }
  return x;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** A game-relative path from a folder and a name that may climb out of it (either slash). */
export function gamePath(dir: string, name: string): string {
  const out: string[] = [];
  for (const seg of `${dir}/${name}`.split(/[/\\]+/)) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}

function plain(kind: 'ez' | 'ezi' | 'ini', bytes: Uint8Array, src: EzSongSource) {
  if (looksPlaintext(kind, bytes)) return bytes;
  if (!src.tables) {
    throw new EzImportError(
      `it is encrypted, and the keys are in the unpacked EZ2AC executable (${src.tablesError ?? 'none is set'})`,
    );
  }
  return ez2Decrypt(bytes, src.tables[kind]);
}

/** The whole song. Charts that cannot come across are left out, with the reason in `notes`. */
export function importEzSong(src: EzSongSource): EzSongImport {
  const songNotes: OpenNote[] = [];
  const origKey = src.dir;
  const title = src.title?.title || origKey;
  const key = newKey(title, origKey, src.shipped);
  const samples = new SampleNamer(src);
  const charts: ImportedChart[] = [];
  const taken = new Set<string>();
  for (const c of src.charts) {
    const id = parseChartName(c.file);
    const skip = (why: string) =>
      songNotes.push({ rule: 'import-skipped', severity: 'warning', message: `${c.file}: ${why}` });
    if (!id?.mode) {
      skip('not a chart of a mode EZ2BMS edits (the radio and CV2 modes have none)');
      continue;
    }
    if (id.players !== 1) {
      skip('a two-player chart; the one-player file is what the game plays');
      continue;
    }
    if (!id.tier) {
      skip('a stage or variant chart, not one of the four tiers');
      continue;
    }
    const slot = `${id.mode}/${id.tier}`;
    if (taken.has(slot)) {
      skip(`a second ${modeNames(id.mode).label} ${id.tier} chart`);
      continue;
    }
    try {
      charts.push(importChart(src, c, id.mode, id.tier, key, samples));
      taken.add(slot);
    } catch (e) {
      skip(e instanceof Error ? e.message : String(e));
    }
  }
  const song = newSongFile(key);
  const dbs = Object.values(src.songdbs ?? {}).filter((d): d is SongDb => !!d);
  song.category = versionCategory(dbs, origKey);
  song.source = {
    from: 'ez2ac',
    key: origKey,
    charts: Object.fromEntries(charts.map((c) => [c.file, c.from])),
  };
  if (key !== deriveSongKey(title)) {
    songNotes.push({
      rule: 'import-key',
      severity: 'info',
      message: `The song's key is ${key}: "${origKey}" and "${deriveSongKey(title)}" are the game's own, and publishing under one would replace that song`,
    });
  }
  const noteList = [
    ...songNotes.map((n) => ({ chart: '', ...n })),
    ...charts.flatMap((c) => c.notes.map((n) => ({ chart: c.file, ...n }))),
  ];
  if (noteList.length) song.source.notes = noteList;
  return { key, song, charts, copies: samples.copies(), notes: songNotes };
}

/** A key from the title that names no shipped song (a digit added until it is free). */
function newKey(title: string, origKey: string, shipped: readonly string[]): string {
  const taken = new Set([...shipped, origKey].map((s) => s.toLowerCase()));
  const base = deriveSongKey(title) || deriveSongKey(origKey) || 'song';
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const k = `${base.slice(0, 15 - String(n).length)}${n}`;
    if (!taken.has(k)) return k;
  }
}

/**
 * Keysound files -> names in the song folder, one per file on disk: the
 * song's own at the top, another song's under its folder name (`stay/p_MR.wav`),
 * an .ssf or .ezw becoming a .wav.
 */
class SampleNamer {
  private readonly byPath = new Map<
    string,
    { name: string; from: string; convert: 'pcm' | 'copy' }
  >();
  private readonly names = new Set<string>();

  constructor(private readonly src: EzSongSource) {}

  /** The project name for an .ezi name, and whether the file is there. */
  name(written: string): { name: string; found: boolean } {
    const dir = `sound/${this.src.dir}`;
    const resolved = gamePath(dir, eziResolve(written));
    const candidates = [resolved, resolved.replace(/\.ssf$/i, '.ezw'), gamePath(dir, written)];
    let from: string | undefined;
    for (const c of candidates) if ((from = this.src.locate(c))) break;
    const path = from ?? gamePath(dir, written);
    const k = path.toLowerCase();
    const known = this.byPath.get(k);
    if (known) return { name: known.name, found: !!from };
    const segs = path.split('/');
    let rel =
      segs.length === 3 && segs[0]!.toLowerCase() === 'sound'
        ? segs[1]!.toLowerCase() === this.src.dir.toLowerCase()
          ? segs[2]!
          : `${segs[1]}/${segs[2]}`
        : segs.slice(-2).join('/');
    const pcm = /\.(ssf|ezw)$/i.test(rel);
    if (pcm) rel = rel.replace(/\.(ssf|ezw)$/i, '.wav');
    let name = rel;
    for (let n = 2; this.names.has(name.toLowerCase()); n++)
      name = rel.replace(/(\.[^./]*)?$/, ` (${n})$1`);
    this.names.add(name.toLowerCase());
    if (from) this.byPath.set(k, { name, from, convert: pcm ? 'pcm' : 'copy' });
    else this.byPath.set(k, { name, from: '', convert: 'copy' });
    return { name, found: !!from };
  }

  copies(): SampleCopy[] {
    return [...this.byPath.values()]
      .filter((v) => v.from)
      .map((v) => ({ from: v.from, to: v.name, convert: v.convert }));
  }
}

function importChart(
  src: EzSongSource,
  c: EzChartSource,
  mode: ModeId,
  tier: Tier,
  key: string,
  samples: SampleNamer,
): ImportedChart {
  const notes: OpenNote[] = [];
  const say = (rule: string, severity: Severity, message: string, at?: number) =>
    notes.push({ rule, severity, message, ...(at !== undefined ? { at } : {}) });
  const ez = readEzff(plain('ez', c.ez, src));
  let ezi: Map<number, EziEntry> = new Map();
  if (c.ezi) {
    const parsed = parseEzi(plain('ezi', c.ezi, src), { legacyNames: true });
    ezi = eziTable(parsed);
    if (parsed.legacy)
      say(
        'import-legacy-ezi',
        'info',
        `Its keysound list names ${parsed.legacy} notes like MIDI keys (C#0): read as notes, which EZ2PORT does not do (it plays them all as note 0)`,
      );
  } else say('import-no-ezi', 'error', 'It has no .ezi: none of its notes has a sound');
  const ini: ParsedSongIni = parseSongIni(c.ini ? plain('ini', c.ini, src) : new Uint8Array());

  // Positions: pulses per tick at a resolution that makes every tick whole.
  const tpm = ez.ticksPerMeasure || 192;
  const res = 240 * (tpm / gcd(960, tpm));
  const ppt = (4 * res) / tpm;
  const yOf = (tick: number) => tick * ppt;

  const title = src.title?.title || src.dir;
  const data: ChartData = newChart({ mode, tier, title, bpm: 120 });
  const info = data.info;
  info.subtitle = src.title?.subtitle ?? '';
  info.resolution = res;
  const d = deltasOfIni(ini);
  info.judgementDeltas = d.judgement;
  info.lifeDeltas = {
    COOL: f32Decimal(d.life.COOL),
    GOOD: f32Decimal(d.life.GOOD),
    MISS: f32Decimal(d.life.MISS),
    FAIL: f32Decimal(d.life.FAIL),
  };
  if (!c.ini)
    say(
      'import-no-ini',
      'info',
      "It has no .ini: the engine's own judgement (6/24/36/72) and gauge, as the game plays it",
    );

  // Level: the song table's, else the .ini's.
  const entry = src.songdbs?.[mode] && songdbFind(src.songdbs[mode]!, src.dir);
  const tableLevel = entry?.steps[TIER_INDEX[tier]]?.level ?? 0;
  let level = tableLevel > 0 ? tableLevel : ini.level;
  if (!(level >= 1 && level <= 20)) {
    say(
      'import-level',
      'warning',
      `Its level ${tableLevel > 0 || c.ini ? level : '(none)'} is not 1-20, which EZ2PORT's song list needs: set to ${Math.min(20, Math.max(1, level || 1))}`,
    );
    level = Math.min(20, Math.max(1, Number.isFinite(level) ? level : 1));
  }
  info.level = level;

  const tempo = importTempo(ez, yOf, say);
  info.initBpm = tempo.init;
  data.bpmEvents = tempo.events;

  // Lanes.
  const gds = src.gds?.[mode];
  const cols = gds ? columnsFromGds(mode, gds).columns : modeDef(mode).columns;
  const laneOf = new Map(cols.map((col) => [col.track, col.x]));

  // Notes and the records with no bmson home.
  const channels = new Map<string, SoundChannel>();
  const slotsOf = new Map<string, Set<number>>();
  const missing = new Set<string>();
  const unlisted = new Set<number>();
  const kept: Extra[] = [];
  const counts = new Map<number, number>();
  let nextNote = 1;
  let bgHolds = 0;
  ez.tracks.forEach((t, ti) => {
    for (const r of t.records) {
      if (r.type === EZ_NOTE) {
        const x = laneOf.get(ti) ?? 0;
        const e = ezi.get(r.key!);
        let sound: string;
        if (!e) {
          unlisted.add(r.key!);
          sound = `slot ${r.key}.wav`;
        } else {
          const s = samples.name(e.name);
          sound = s.name;
          if (!s.found) missing.add(s.name);
        }
        let ch = channels.get(sound.toLowerCase());
        if (!ch) channels.set(sound.toLowerCase(), (ch = { id: channels.size + 1, name: sound }));
        if (e) {
          const slots = slotsOf.get(sound.toLowerCase()) ?? new Set();
          slots.add(r.key!);
          slotsOf.set(sound.toLowerCase(), slots);
        }
        const hold = (r.length ?? 0) > HOLD_BIAS ? r.length! - HOLD_BIAS : 0;
        const n: NoteRec = {
          id: nextNote++,
          ch: ch.id,
          x,
          y: yOf(r.tick),
          l: x ? hold * ppt : 0,
          c: false,
        };
        if (r.vel !== undefined && r.vel !== 127) n.vel = r.vel;
        if (r.pan !== undefined && r.pan !== 64) n.pan = r.pan;
        if (r.kind) n.kind = r.kind;
        const extra: Extra = {};
        if (!x) extra.x_track = ti;
        // What a re-publish would not write: a background note's length, a
        // lane tap's non-zero length (1-6).
        const written = x && hold ? hold + HOLD_BIAS : 0;
        if ((r.length ?? 0) !== written) {
          extra.x_len = r.length;
          if (!x && hold) bgHolds++;
        }
        if (Object.keys(extra).length) n.extra = extra;
        data.notes.push(n);
      } else if (!(r.type === EZ_BPM && tempo.used.has(r))) {
        kept.push(keptRecord(ti, r, yOf));
        counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
      }
    }
  });
  data.channels = [...channels.values()];

  // Said once each.
  const scroll = counts.get(EZ_SCROLL) ?? 0;
  if (scroll)
    say(
      'import-scroll',
      'warning',
      `${scroll} scroll-speed change${scroll === 1 ? '' : 's'}: EZ2PORT scrolls faster or slower there; kept in the chart, but EZ2BMS neither shows nor publishes them yet`,
    );
  const other: [number, string][] = [
    [EZ_VOLUME, 'track volume'],
    [EZ_BEATS, 'beats-per-measure'],
    [EZ_MARK, 'mark'],
    [7, 'stop (the engine ignores them)'],
    [EZ_BPM, 'tempo outside 0-1000 BPM (the engine ignores them)'],
  ];
  for (const [type, what] of other) {
    const n = counts.get(type) ?? 0;
    if (n)
      say(
        'import-kept',
        'info',
        `${n} ${what} record${n === 1 ? '' : 's'}: kept in the chart, not published`,
      );
  }
  const unknown = [...counts].filter(([t]) => t > 7).reduce((a, [, n]) => a + n, 0);
  if (unknown)
    say(
      'import-kept',
      'info',
      `${unknown} records of kinds EZ2BMS does not know: kept, not published`,
    );
  if (bgHolds)
    say(
      'import-kept',
      'info',
      `${bgHolds} background note${bgHolds === 1 ? ' has' : 's have'} a length: kept as x_len; publishing writes them as taps, as the game plays them`,
    );
  if (missing.size)
    say(
      'import-missing-sound',
      'warning',
      `${missing.size} keysound${missing.size === 1 ? ' is' : 's are'} not in the game folder: ${[...missing].slice(0, 6).join(', ')}${missing.size > 6 ? '...' : ''}`,
    );
  if (unlisted.size)
    say(
      'import-missing-sound',
      'warning',
      `Notes use keysound slot${unlisted.size === 1 ? '' : 's'} ${[...unlisted].slice(0, 8).join(', ')}, which the .ezi does not list: the game plays nothing for them`,
    );
  const shared = [...slotsOf.values()].filter((s) => s.size > 1).length;
  if (shared)
    say(
      'import-shared-voice',
      'info',
      `${shared} keysound${shared === 1 ? ' is' : 's are'} listed in more than one slot; in EZ2BMS (and a re-publish) each file is one voice, so two of them at once cut each other`,
    );

  data.extra.x_ez = {
    file: c.file,
    version: ez.version,
    name: decodeCp949(ez.name),
    name2: decodeCp949(ez.name2),
    bpm: f32Decimal(ez.bpm),
    bpm2: f32Decimal(ez.bpm2),
    total_ticks: ez.totalTicks,
    // The last record's tick: a cabinet export keeps total_ticks as the game
    // had it (even short of its own last record) unless the chart grows past it.
    last_tick: ez.tracks.reduce((m, t) => Math.max(m, t.records.at(-1)?.tick ?? 0), 0),
    ticks_per_measure: ez.ticksPerMeasure,
    tracks: ez.tracks.length,
    measure_scale: f32Decimal(ini.measureScale),
  };
  if (kept.length) data.extra.x_ez_records = kept;
  return { file: `${chartBaseName(mode, key, tier)}.bmson`, data, mode, tier, from: c.file, notes };
}

/**
 * The tempo map as ez2_tempo_build makes it: the BPM in force at tick 0 and
 * one event per later tick where a record governs. `used` holds the records
 * that became part of it (the rest are kept as records).
 */
function importTempo(
  ez: EzffChart,
  yOf: (tick: number) => number,
  say: (rule: string, severity: Severity, message: string, at?: number) => void,
): { init: number; events: { y: number; bpm: number }[]; used: Set<EzffRecord> } {
  const used = new Set<EzffRecord>();
  const byTick = new Map<number, EzffRecord[]>();
  for (const t of ez.tracks)
    for (const r of t.records) {
      if (r.type !== EZ_BPM || !(f32(r.bpm!) > 0) || f32(r.bpm!) > 1000) continue;
      used.add(r);
      const l = byTick.get(r.tick) ?? [];
      l.push(r);
      byTick.set(r.tick, l);
    }
  const header = f32(ez.bpm) > 0 ? f32(ez.bpm) : 120;
  // Stable: the header first at tick 0, then records in track order; the last governs.
  const init = byTick.get(0)?.at(-1)?.bpm ?? header;
  const events = [...byTick]
    .filter(([tick]) => tick > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([tick, rs]) => ({ y: yOf(tick), bpm: f32Decimal(rs.at(-1)!.bpm!) }));
  const doubled = [...byTick.values()].filter((rs) => rs.length > 1).length;
  if (doubled)
    say(
      'import-tempo',
      'info',
      `${doubled} tick${doubled === 1 ? ' has' : 's have'} two tempo records: the one EZ2PORT plays (the last) is kept`,
    );
  return { init: f32Decimal(init), events, used };
}

function keptRecord(track: number, r: EzffRecord, yOf: (tick: number) => number): Extra {
  const o: Extra = { track, y: yOf(r.tick), type: r.type };
  if (r.value !== undefined) o.value = r.value;
  if (r.bpm !== undefined) o.bpm = f32Decimal(r.bpm);
  if (r.raw) {
    o.raw = r.raw;
    if (r.type === EZ_SCROLL) {
      const dv = new DataView(new ArrayBuffer(4));
      dv.setUint32(0, r.raw[0], true);
      o.scroll = f32Decimal(dv.getFloat32(0, true));
    }
  }
  return o;
}
