// A song sent back to the original game (M6): charts compiled for the cabinet
// (chart-plan.ts `target: 'cabinet'`) into a song the game already has - its
// folder under sound/, and its record in each mode's song.bin. Nothing new is
// added to the game's tables: a remix takes an existing song's place.
//
// Three steps, because keysound names depend on what is on the disk:
// - planCabinet: which file each chart becomes (the game's own name for that
//   tier, in the case it is on disk; else the name the table implies), the
//   song.bin changes, and one keysound table for the whole song;
// - nameSounds: each keysound's file. A keysound whose audio is already in
//   the folder uses that file; any other takes a name no file has (`kick~2`).
//   A file already there is never written over - another chart of the game
//   may use it (a song's charts share one folder, and other songs reach into
//   it with `..\..\sound\<song>\...`), which is why no .ezi needs reading;
// - finishCabinet: the bytes. .ez/.ezi/.ini encrypted with the tables from the
//   user's executable (the original only decrypts), .ezi CRLF as the game's,
//   a .ini only where it would change, song.bin patched in
//   place (ez2data/songdb.ts patchSongdb: only the changed bytes differ).

import { ez2Encrypt } from '../ez2data/crypt';
import { said, sayEnglish, type Said } from '../i18n/say';
import type { Gds } from '../ez2data/gds';
import { ciEq } from '../ez2data/initext';
import {
  patchSongdb,
  SONGDB_TIER_SUFFIX,
  songdbSongDir,
  type SongdbEdit,
  type SongEntry,
  type SongStep,
} from '../ez2data/songdb';
import type { SongTitle } from '../ez2data/songtext';
import { parseSongIni, songIniDefaults, type SongIni } from '../engine/songini';
import { writeEzff } from '../io/ez/ezff';
import type { Game } from '../io/ez/game';
import type { EzTables } from '../io/ez/import';
import { JUDGEMENT_PRESETS, LIFE_PRESETS } from '../model/defaults';
import type { ChartData, Tier } from '../model/types';
import { MODES, modeNames, type ModeId } from '../modes/ids';
import { columnsFromGds, modeDef, type Column } from '../modes/registry';
import type { ImportSource } from '../song/songfile';
import { compileChart, type ChartPlan, type SampleLookup } from './chart-plan';
import { KeysoundRegistry } from './keysounds';
import { cabinetIniText, eziText } from './text';

const TIERS: Tier[] = ['NM', 'HD', 'SHD', 'EX'];
const f32 = Math.fround;

/** A song of the game a cabinet export can go into. */
export interface CabinetTarget {
  /** Its folder under sound/, as listed. */
  dir: string;
  /** The key the tables file it under. */
  key: string;
  title?: SongTitle;
  /** Each mode's record for it. */
  entries: Partial<Record<ModeId, SongEntry>>;
}

/**
 * Every song the game's tables list whose folder is there - whatever charts
 * it has on disk (a tier may be added), by title.
 */
export function cabinetTargets(game: Pick<Game, 'sound' | 'songdbs' | 'titles'>): CabinetTarget[] {
  const byDir = new Map<string, CabinetTarget>();
  for (const m of MODES) {
    const db = game.songdbs[m.id];
    if (!db) continue;
    for (const e of db.entries) {
      const d = songdbSongDir(e, game.sound);
      if (!d) continue;
      let t = byDir.get(d.toLowerCase());
      if (!t) {
        const title = game.titles.get(e.key.toLowerCase()) ?? game.titles.get(d.toLowerCase());
        t = { dir: d, key: e.key, entries: {}, ...(title ? { title } : {}) };
        byDir.set(d.toLowerCase(), t);
      }
      t.entries[m.id] ??= e;
    }
  }
  return [...byDir.values()].sort((a, b) =>
    (a.title?.title ?? a.dir).localeCompare(b.title?.title ?? b.dir),
  );
}

/** The song a song file was imported from, if it is still in the game. */
export function sourceTarget(
  targets: readonly CabinetTarget[],
  source: ImportSource | undefined,
): CabinetTarget | undefined {
  if (source?.from !== 'ez2ac' || !source.key) return undefined;
  return targets.find((t) => ciEq(t.dir, source.key!));
}

export interface CabinetChart {
  /** The chart's file in the project. */
  file: string;
  data: ChartData;
  mode: ModeId;
  tier: Tier;
}

export interface CabinetInput {
  target: CabinetTarget;
  /** The song folder's files, as listed. */
  files: readonly string[];
  gds: Partial<Record<ModeId, Gds>>;
  charts: readonly CabinetChart[];
  /** The song file's `source`: a chart imported from this very song keeps the table's BPM. */
  source?: ImportSource;
  samples?: SampleLookup;
}

export interface CabinetChartPlan {
  chart: CabinetChart;
  plan: ChartPlan;
  columns: Column[];
  /** The game has no .gds for the mode: EZ2BMS's own lane table was used. */
  gdsMissing: boolean;
  tier: 0 | 1 | 2 | 3;
  /** Game-relative paths (the names on disk where the files exist). */
  paths: { ez: string; ezi: string; ini: string };
  exists: { ez: boolean; ezi: boolean; ini: boolean };
  /** The tier's song.bin values before, and the level and BPM it gets. */
  before: SongStep;
  level: number;
  bpm: number;
  /** A two-player file for this tier, which stays as the game has it. */
  twoP?: string;
}

export interface CabinetPlan {
  target: CabinetTarget;
  /** The song's folder, game-relative (`sound/<dir>`). */
  dir: string;
  registry: KeysoundRegistry;
  charts: CabinetChartPlan[];
  /** Charts that cannot go, and why: in English, and `said` in the language chosen (i18n/say.ts). */
  refused: { chart: CabinetChart; reason: string; said: Said }[];
  songdb: { mode: ModeId; edits: SongdbEdit[] }[];
}

function isOwnImport(data: ChartData, target: CabinetTarget, source?: ImportSource): boolean {
  const x = data.extra.x_ez;
  return (
    source?.from === 'ez2ac' &&
    !!source.key &&
    ciEq(source.key, target.dir) &&
    !!x &&
    typeof x === 'object'
  );
}

export function planCabinet(i: CabinetInput): CabinetPlan {
  const { target } = i;
  const dir = `sound/${target.dir}`;
  const find = (name: string) => i.files.find((f) => ciEq(f, name));
  const registry = new KeysoundRegistry();
  const out: CabinetPlan = { target, dir, registry, charts: [], refused: [], songdb: [] };
  const taken = new Set<string>();
  const edits = new Map<ModeId, SongdbEdit[]>();
  const refuse = (chart: CabinetChart, s: Said) =>
    out.refused.push({ chart, reason: sayEnglish(s), said: s });
  for (const chart of i.charts) {
    const names = modeNames(chart.mode);
    const entry = target.entries[chart.mode];
    if (!entry) {
      refuse(chart, said('export.not-listed', { table: names.portName, song: target.dir }));
      continue;
    }
    const slot = `${chart.mode} ${chart.tier}`;
    if (taken.has(slot)) {
      refuse(chart, said('export.second-chart', { mode: names.label, tier: chart.tier }));
      continue;
    }
    taken.add(slot);
    const gds = i.gds[chart.mode];
    const columns = gds ? columnsFromGds(chart.mode, gds).columns : modeDef(chart.mode).columns;
    const plan = compileChart(chart.data, {
      columns,
      name: entry.key,
      keysounds: registry,
      target: 'cabinet',
      ...(i.samples ? { samples: i.samples } : {}),
    });
    const t = TIERS.indexOf(chart.tier) as 0 | 1 | 2 | 3;
    const suffix = SONGDB_TIER_SUFFIX[t];
    const ezName = find(`${names.filePrefix}1p-${entry.key}${suffix}.ez`);
    const stem = (ezName ?? `${names.filePrefix}1p-${entry.key}${suffix}.ez`).replace(/\.ez$/i, '');
    const eziName = find(`${stem}.ezi`);
    const iniName = find(`${stem}.ini`);
    const twoP = find(`${names.filePrefix}2p-${entry.key}${suffix}.ez`);
    const before = entry.steps[t];
    const level = Math.round(chart.data.info.level ?? 0);
    // The table's BPM (what the select screen shows) stays where the chart is
    // this song's own and starts on the tempo it had; otherwise it is the
    // chart's start tempo.
    const start = f32(plan.tempo.bpmAt(0));
    const x = chart.data.extra.x_ez as { bpm?: unknown } | undefined;
    const keepBpm =
      before.level > 0 &&
      isOwnImport(chart.data, target, i.source) &&
      (start === f32(before.b) || (typeof x?.bpm === 'number' && start === f32(x.bpm)));
    const bpm = keepBpm ? before.b : start;
    const edit: SongdbEdit = { key: entry.key, tier: t, level };
    if (!keepBpm) edit.bpm = bpm;
    if (before.level === 0) {
      // A tier the game did not have: `a` as its other tiers have it, when they agree.
      const as = entry.steps.filter((s) => s.level > 0).map((s) => f32(s.a));
      edit.a = as.length && as.every((a) => a === as[0]) ? as[0]! : 0;
    }
    (edits.get(chart.mode) ?? edits.set(chart.mode, []).get(chart.mode)!).push(edit);
    out.charts.push({
      chart,
      plan,
      columns,
      gdsMissing: !gds,
      tier: t,
      paths: {
        ez: `${dir}/${ezName ?? `${stem}.ez`}`,
        ezi: `${dir}/${eziName ?? `${stem}.ezi`}`,
        ini: `${dir}/${iniName ?? `${stem}.ini`}`,
      },
      exists: { ez: !!ezName, ezi: !!eziName, ini: !!iniName },
      before,
      level,
      bpm,
      ...(twoP ? { twoP: `${dir}/${twoP}` } : {}),
    });
  }
  out.songdb = [...edits].map(([mode, e]) => ({ mode, edits: e }));
  return out;
}

// ---- keysound files ------------------------------------------------------------

export interface SoundNaming {
  /** The file name, without `.ssf` (what the .ezi lists, with `.wav`). */
  name: string;
  /** Whether the export writes it (false: a file already there, or a missing sound). */
  write: boolean;
  /** Its source is missing: the .ezi still lists it and nothing is written (the game plays nothing). */
  missing?: boolean;
}

/** For each keysound, the files in the folder that may already hold it (`<name>.ssf`, `<name>~n.ssf`). */
export function soundCandidates(plan: CabinetPlan, listing: readonly string[]): string[][] {
  return plan.registry.defs.map((d) => {
    const re = new RegExp(`^${escape(d.name.replace(/~\d+$/, ''))}(~\\d+)?\\.ssf$`, 'i');
    return listing.filter((f) => re.test(f));
  });
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Each keysound's file. `equal(def)` is the listed file that already holds
 * exactly its audio (the host compares them), or null; `missing(def)` says
 * its source is not in the project.
 */
export function nameSounds(
  plan: CabinetPlan,
  listing: readonly string[],
  equal: (def: number) => string | null,
  missing: (def: number) => boolean = () => false,
): Map<number, SoundNaming> {
  const onDisk = new Set(listing.map((f) => f.toLowerCase()));
  const used = new Set<string>();
  const out = new Map<number, SoundNaming>();
  plan.registry.defs.forEach((d, i) => {
    if (missing(i)) {
      out.set(i, { name: d.name, write: false, missing: true });
      used.add(d.name.toLowerCase());
      return;
    }
    const same = equal(i);
    if (same) {
      const name = same.replace(/\.ssf$/i, '');
      out.set(i, { name, write: false });
      used.add(name.toLowerCase());
      return;
    }
    const base = d.name;
    let name = base;
    for (let n = 2; onDisk.has(`${name.toLowerCase()}.ssf`) || used.has(name.toLowerCase()); n++)
      name = `${base}~${n}`;
    out.set(i, { name, write: true });
    used.add(name.toLowerCase());
  });
  return out;
}

// ---- the bytes -----------------------------------------------------------------

export interface CabinetKeys {
  /** The chart tables from the user's executable. */
  tables: EzTables;
  /** Each mode's song.bin as it is on disk. */
  songdb: Partial<Record<ModeId, { path: string; bytes: Uint8Array }>>;
  /** song.bin's tables (needed when it is encrypted). */
  songdbTables?: Uint8Array;
  /** A chart .ini already in the folder, decrypted. */
  currentIni?: (path: string) => Uint8Array | undefined;
}

export interface CabinetFile {
  /** Game-relative. */
  path: string;
  /** As written (encrypted, but for song.bin already in its on-disk form). */
  bytes: Uint8Array;
  /** Before encryption (song.bin: decrypted is not kept - same as bytes). */
  plain: Uint8Array;
  kind: 'ez' | 'ezi' | 'ini' | 'songdb';
  /** It replaces a file that is there. */
  replaces: boolean;
}

export interface CabinetOutput {
  files: CabinetFile[];
  /** Keysounds to make, game-relative. */
  sounds: { def: number; path: string }[];
  /** Keysound files used as they are, game-relative. */
  reused: string[];
  /** Per chart: its .ini written, kept as it is, or - as the game had it - absent. */
  ini: ('write' | 'keep' | 'none')[];
  /** Offsets song.bin changed at, per mode. */
  songdbChanged: Partial<Record<ModeId, number[]>>;
}

/** What decides a chart's play: the .ini values the engine reads, level aside (song.bin's is shown). */
function sameIni(a: SongIni, b: SongIni): boolean {
  const keys: (keyof SongIni)[] = [
    'measureScale',
    'kool',
    'cool',
    'good',
    'miss',
    'gaugeCool',
    'gaugeGood',
    'gaugeMiss',
    'gaugeFail',
  ];
  return keys.every((k) => f32(a[k]) === f32(b[k]));
}

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

export function finishCabinet(
  plan: CabinetPlan,
  names: ReadonlyMap<number, SoundNaming>,
  keys: CabinetKeys,
): CabinetOutput {
  const out: CabinetOutput = { files: [], sounds: [], reused: [], ini: [], songdbChanged: {} };
  for (const cp of plan.charts) {
    const ez = writeEzff(cp.plan.ezff);
    out.files.push({
      path: cp.paths.ez,
      bytes: ez2Encrypt(ez, keys.tables.ez),
      plain: ez,
      kind: 'ez',
      replaces: cp.exists.ez,
    });
    const slots = cp.plan.keysoundSlots.map(
      (k) => names.get(k)?.name ?? plan.registry.defs[k]!.name,
    );
    const ezi = ascii(eziText(slots, '\r\n'));
    out.files.push({
      path: cp.paths.ezi,
      bytes: ez2Encrypt(ezi, keys.tables.ezi),
      plain: ezi,
      kind: 'ezi',
      replaces: cp.exists.ezi,
    });
    // The .ini: written only where the game would read other values from it -
    // kept when the one there already says the same, left absent when the
    // game had none and the chart plays by the engine's defaults.
    const info = cp.chart.data.info;
    const x = cp.chart.data.extra.x_ez as { measure_scale?: unknown } | undefined;
    const ini = ascii(
      cabinetIniText({
        level: cp.level,
        measureScale: typeof x?.measure_scale === 'number' ? x.measure_scale : 1.6,
        judgement: info.judgementDeltas ?? JUDGEMENT_PRESETS[0]!.deltas,
        life: info.lifeDeltas ?? LIFE_PRESETS[0]!.deltas,
      }),
    );
    const ours = parseSongIni(ini);
    const current = cp.exists.ini ? keys.currentIni?.(cp.paths.ini) : undefined;
    const decision: 'write' | 'keep' | 'none' = current
      ? sameIni(parseSongIni(current), ours)
        ? 'keep'
        : 'write'
      : !cp.exists.ini && sameIni(songIniDefaults(), ours)
        ? 'none'
        : 'write';
    out.ini.push(decision);
    if (decision === 'write')
      out.files.push({
        path: cp.paths.ini,
        bytes: ez2Encrypt(ini, keys.tables.ini),
        plain: ini,
        kind: 'ini',
        replaces: cp.exists.ini,
      });
  }
  for (const { mode, edits } of plan.songdb) {
    const file = keys.songdb[mode];
    if (!file) throw new Error(`the game's ${modeNames(mode).portName} song.bin was not read`);
    const r = patchSongdb(file.bytes, keys.songdbTables, edits);
    out.songdbChanged[mode] = r.changed;
    if (r.changed.length)
      out.files.push({
        path: file.path,
        bytes: r.bytes,
        plain: r.bytes,
        kind: 'songdb',
        replaces: true,
      });
  }
  const seen = new Set<string>();
  plan.registry.defs.forEach((_, i) => {
    const n = names.get(i);
    if (!n || n.missing) return;
    const path = `${plan.dir}/${n.name}.ssf`;
    if (seen.has(path.toLowerCase())) return;
    seen.add(path.toLowerCase());
    if (n.write) out.sounds.push({ def: i, path });
    else out.reused.push(path);
  });
  return out;
}
