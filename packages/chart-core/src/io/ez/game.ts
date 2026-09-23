// An EZ2AC data folder, as the importer reads it: the songs each mode's table
// offers (with their tiers, levels and BPM), their titles, and everything one
// song's import needs - read through a small file-system interface, so the
// editor (over its backend) and the tests (over a synthetic folder) share it.
//
// Folder and file names are matched in any case, as the port matches them
// (ez2/vfs.c): the game's tree mixes `sound/DirtyD` with a table key `dirtyd`.

import { parseGds, type Gds } from '../../ez2data/gds';
import { decodeCp949 } from '../../ez2data/initext';
import { exeRead, keyTableFromExe } from '../../ez2data/keytable';
import { ez2Decrypt, looksPlaintext } from '../../ez2data/crypt';
import {
  readSongdb,
  SONGDB_TABLE_SIZE,
  SONGDB_TABLE_VA,
  songdbCharts,
  songdbSongDir,
  type SongDb,
  type SongEntry,
} from '../../ez2data/songdb';
import { parseSongTitles, type SongTitle } from '../../ez2data/songtext';
import type { Tier } from '../../model/types';
import { MODES, type ModeId } from '../../modes/ids';
import { gamePath, type EzSongSource, type EzTables } from './import';
import { eziResolve, parseEzi } from './ezi';

export interface GameFs {
  /** The names in a folder (game-relative, forward slashes); [] when it is not there. */
  list(dir: string): Promise<string[]>;
  read(path: string): Promise<Uint8Array | undefined>;
}

export interface GameChart {
  mode: ModeId;
  tier: Tier;
  level: number;
  /** The .ez's name in the song's folder. */
  file: string;
}

export interface GameSong {
  /** The song's folder under sound/, as listed. */
  dir: string;
  /** The table's key. */
  key: string;
  title?: SongTitle;
  bpm: number;
  charts: GameChart[];
}

export interface Game {
  fs: GameFs;
  sound: string[];
  songs: GameSong[];
  gds: Partial<Record<ModeId, Gds>>;
  songdbs: Partial<Record<ModeId, SongDb>>;
  /** Each mode's song.bin as it is on disk, and where (a cabinet export patches it). */
  songdbFiles: Partial<Record<ModeId, { path: string; bytes: Uint8Array }>>;
  /** song.bin's cipher tables, from the executable (undefined without one, or for a plaintext game). */
  songdbTables?: Uint8Array;
  /** The port's titles, by key and by folder (lower case). */
  titles: Map<string, SongTitle>;
  tables?: EzTables;
  /** Why the executable gave no chart keys (only matters for encrypted charts). */
  tablesError?: string;
  /** Problems reading the folder (a table that would not decrypt...). */
  problems: string[];
}

const TIERS: Tier[] = ['NM', 'HD', 'SHD', 'EX'];

async function findIn(fs: GameFs, dir: string, name: string): Promise<string | undefined> {
  const hit = (await fs.list(dir)).find((n) => n.toLowerCase() === name.toLowerCase());
  return hit === undefined ? undefined : dir ? `${dir}/${hit}` : hit;
}

export interface OpenGameOptions {
  /**
   * Chart tables to use when the executable gives none. Only the browser
   * build's made-up game passes these (its made-up executable cannot carry the
   * real tables, whose digests are checked); the desktop app never does.
   */
  tables?: EzTables;
}

/**
 * Open a data folder: each mode's `.gds` and `song.bin` (decrypted with the
 * executable's tables when it is not plaintext), the titles from the port's
 * manifest (`manifest`: the text of text/manifest.songs.ini, or undefined),
 * and the songs the tables list whose folder is there.
 */
export async function openGame(
  fs: GameFs,
  exe?: Uint8Array,
  manifest?: string,
  opts: OpenGameOptions = {},
): Promise<Game> {
  const problems: string[] = [];
  const sound = await fs.list('sound');
  const system = await fs.list('system');
  const titles = manifest ? parseSongTitles(manifest) : new Map<string, SongTitle>();
  const gds: Game['gds'] = {};
  const songdbs: Game['songdbs'] = {};
  const songdbFiles: Game['songdbFiles'] = {};
  let songdbTables: Uint8Array | undefined;
  let tables: EzTables | undefined;
  let tablesError: string | undefined = exe ? undefined : 'no executable is set';
  if (exe) {
    try {
      tables = {
        ez: keyTableFromExe(exe, 'ez'),
        ezi: keyTableFromExe(exe, 'ezi'),
        ini: keyTableFromExe(exe, 'ini'),
      };
    } catch (e) {
      tablesError = e instanceof Error ? e.message : String(e);
    }
    try {
      songdbTables = exeRead(exe, SONGDB_TABLE_VA, SONGDB_TABLE_SIZE);
    } catch {
      // Not this executable: a table that is encrypted says so below.
    }
  }
  if (!tables && opts.tables) {
    tables = opts.tables;
    tablesError = undefined;
  }
  const byDir = new Map<string, GameSong>();
  for (const m of MODES) {
    const dir = system.find((d) => d.toLowerCase() === m.portName.toLowerCase());
    if (!dir) continue;
    const g = await findIn(fs, `system/${dir}`, `${m.portName}.gds`);
    const gb = g && (await fs.read(g));
    if (gb) gds[m.id] = parseGds(decodeCp949(gb));
    const b = await findIn(fs, `system/${dir}`, 'song.bin');
    const bytes = b && (await fs.read(b));
    if (!bytes) continue;
    songdbFiles[m.id] = { path: b, bytes };
    let db: SongDb;
    try {
      db = readSongdb(bytes, exe);
    } catch (e) {
      problems.push(`${m.portName}'s song.bin: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    songdbs[m.id] = db;
    for (const e of db.entries) {
      const d = songdbSongDir(e, sound);
      if (!d) continue;
      let song = byDir.get(d.toLowerCase());
      if (!song) {
        const title = titles.get(e.key.toLowerCase()) ?? titles.get(d.toLowerCase());
        song = { dir: d, key: e.key, bpm: bpmOf(e), charts: [], ...(title ? { title } : {}) };
        byDir.set(d.toLowerCase(), song);
      }
      const files = await fs.list(`sound/${d}`);
      for (const c of songdbCharts(e, m.filePrefix, files))
        song.charts.push({ mode: m.id, tier: TIERS[c.tier]!, level: c.level, file: c.file });
    }
  }
  const songs = [...byDir.values()]
    .filter((s) => s.charts.length)
    .sort((a, b) => (a.title?.title ?? a.dir).localeCompare(b.title?.title ?? b.dir));
  return {
    fs,
    sound,
    songs,
    gds,
    songdbs,
    songdbFiles,
    ...(songdbTables ? { songdbTables } : {}),
    titles,
    ...(tables ? { tables } : {}),
    ...(tablesError ? { tablesError } : {}),
    problems,
  };
}

const bpmOf = (e: SongEntry) => e.steps.find((s) => s.level > 0)?.b ?? e.steps[0].b;

/**
 * Everything importEzSong needs for one song: its charts' files (only those
 * the tables offer), and the listings of every folder their keysounds are in,
 * so a keysound is found in any case.
 */
export async function ezSongSource(game: Game, song: GameSong): Promise<EzSongSource> {
  const fs = game.fs;
  const dir = `sound/${song.dir}`;
  const files = await fs.list(dir);
  const sibling = async (file: string, ext: string) => {
    const want = `${file.replace(/\.ez$/i, '')}${ext}`.toLowerCase();
    const n = files.find((f) => f.toLowerCase() === want);
    return n ? fs.read(`${dir}/${n}`) : undefined;
  };
  const charts: EzSongSource['charts'] = [];
  /** Lower-cased folder -> its name as on disk and what is in it. */
  const listings = new Map<string, { real: string; names: string[] }>([
    [dir.toLowerCase(), { real: dir, names: files }],
  ]);
  const want = new Set<string>();
  for (const c of song.charts) {
    const ez = await fs.read(`${dir}/${c.file}`);
    if (!ez) continue;
    const ezi = await sibling(c.file, '.ezi');
    const ini = await sibling(c.file, '.ini');
    charts.push({ file: c.file, ez, ...(ezi ? { ezi } : {}), ...(ini ? { ini } : {}) });
    // The folders its keysounds are in, to list below.
    if (!ezi) continue;
    try {
      const text = looksPlaintext('ezi', ezi)
        ? ezi
        : game.tables && ez2Decrypt(ezi, game.tables.ezi);
      if (!text) continue;
      for (const e of parseEzi(text, { legacyNames: true }).entries) {
        const p = gamePath(dir, eziResolve(e.name));
        want.add(p.slice(0, Math.max(0, p.lastIndexOf('/'))));
      }
    } catch {
      // importEzSong says what is wrong with it.
    }
  }
  for (const d of want) {
    if (listings.has(d.toLowerCase())) continue;
    // Each level of the path matched in any case.
    let real = '';
    for (const seg of d.split('/')) {
      const hit = (await fs.list(real)).find((n) => n.toLowerCase() === seg.toLowerCase());
      if (!hit) {
        real = '';
        break;
      }
      real = real ? `${real}/${hit}` : hit;
    }
    listings.set(d.toLowerCase(), { real, names: real ? await fs.list(real) : [] });
  }
  const locate = (path: string): string | undefined => {
    const slash = path.lastIndexOf('/');
    const l = listings.get(path.slice(0, slash).toLowerCase());
    const name = path.slice(slash + 1).toLowerCase();
    const hit = l?.names.find((n) => n.toLowerCase() === name);
    return hit === undefined ? undefined : `${l!.real}/${hit}`;
  };
  return {
    dir: song.dir,
    charts,
    ...(game.tables ? { tables: game.tables } : {}),
    ...(game.tablesError ? { tablesError: game.tablesError } : {}),
    gds: game.gds,
    songdbs: game.songdbs,
    ...(song.title ? { title: song.title } : {}),
    locate,
    shipped: game.sound,
  };
}

/** A GameFs over a map of game-relative paths (the synthetic game, tests). */
export function memoryGameFs(files: ReadonlyMap<string, Uint8Array>): GameFs {
  return {
    list: async (dir) => {
      const prefix = dir ? `${dir.toLowerCase()}/` : '';
      const out = new Set<string>();
      for (const k of files.keys()) {
        if (!k.toLowerCase().startsWith(prefix)) continue;
        out.add(k.slice(prefix.length).split('/')[0]!);
      }
      return [...out];
    },
    read: async (path) => {
      for (const [k, v] of files) if (k.toLowerCase() === path.toLowerCase()) return v;
      return undefined;
    },
  };
}
