// Importing a song: the game's own charts from the configured EZ2AC folder,
// a folder of BMS files, or (by opening its folder) any bmson. The reading
// is chart-core's (io/ez, io/bms); this is the wizard's state - what was
// found, what was chosen - and the step that writes the new song folder
// through the host (import_run: all or nothing, .ssf keysounds as .wav).

import {
  BMS_FILE,
  ezSongSource,
  importBmsSong,
  importEzSong,
  serializeBmson,
  serializeSongFile,
  type BmsFileChoice,
  type BmsSongImport,
  type EzSongImport,
  type Game,
  type GameSong,
} from '@ez2bms/chart-core';
import { baseName, dirName, joinPath, type ImportJob } from '../bridge';
import type { App } from './app.svelte';
import { loadGame } from './game';
import { SIDECAR } from './project.svelte';
import { toast } from './toasts.svelte';

export type ImportSource = 'game' | 'bms' | 'bmson';

/** A folder name from a title: what the disk accepts on Windows and Linux. */
export function folderName(title: string): string {
  return (
    title
      .replace(/[<>:"/\\|?*]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\.+$/, '') || 'song'
  );
}

export class Importer {
  open = $state(false);
  source = $state<ImportSource>('game');
  busy = $state(false);
  progress = $state<[number, number] | null>(null);
  /** Where the new song folder goes. */
  dest = $state('');

  // ---- the game
  game = $state.raw<Game | null>(null);
  gameError = $state<string | null>(null);
  loadingGame = $state(false);
  query = $state('');
  selected = $state.raw<GameSong | null>(null);
  /** The selected song, read and converted (what Import writes). */
  gameImport = $state.raw<EzSongImport | null>(null);

  // ---- BMS
  bmsDir = $state('');
  bmsFiles = $state.raw<{ name: string; bytes: Uint8Array }[]>([]);
  bmsListing = $state.raw<string[]>([]);
  choices = $state<Record<string, BmsFileChoice>>({});
  /** Write the song beside the BMS files instead of copying them into a new folder. */
  inPlace = $state(false);
  bmsError = $state<string | null>(null);

  constructor(private readonly app: App) {}

  show(source?: ImportSource): void {
    if (source) this.source = source;
    this.open = true;
    if (this.source === 'game' && !this.game && !this.loadingGame) void this.loadGame();
  }

  close(): void {
    this.open = false;
  }

  /** Where new songs go by default: beside the last song opened. */
  private defaultParent(): string {
    const recent = this.app.settings.data.recent[0];
    return recent ? dirName(recent) : '';
  }

  // ---- the game -----------------------------------------------------------------

  async loadGame(): Promise<void> {
    this.gameError = null;
    if (!this.app.settings.data.gameRoot) {
      this.gameError = 'Set your EZ2AC data folder on the EZ2PORT panel first';
      return;
    }
    this.loadingGame = true;
    try {
      const game = await loadGame(this.app.backend, this.app.settings);
      this.game = game;
      if (!game.songs.length)
        this.gameError =
          game.problems[0] ?? 'No songs found: is this the folder with sound/ and system/ in it?';
    } catch (e) {
      this.gameError = e instanceof Error ? e.message : String(e);
    } finally {
      this.loadingGame = false;
    }
  }

  /** The game's songs matching the search, by title. */
  readonly songs: GameSong[] = $derived.by(() => {
    const q = this.query.trim().toLowerCase();
    const all = this.game?.songs ?? [];
    return q
      ? all.filter(
          (s) =>
            s.dir.toLowerCase().includes(q) || (s.title?.title ?? '').toLowerCase().includes(q),
        )
      : all;
  });

  async select(song: GameSong): Promise<void> {
    this.selected = song;
    this.gameImport = null;
    if (!this.game) return;
    try {
      this.gameImport = importEzSong(await ezSongSource(this.game, song));
      this.dest = joinPath(this.defaultParent(), folderName(song.title?.title ?? song.dir));
    } catch (e) {
      this.gameError = e instanceof Error ? e.message : String(e);
    }
  }

  // ---- BMS ----------------------------------------------------------------------

  async loadBms(dir: string): Promise<void> {
    this.bmsError = null;
    this.bmsDir = dir;
    this.choices = {};
    const b = this.app.backend;
    // The folder's files, subfolders included (BMS keeps sounds in them).
    const listing: string[] = [];
    const walk = async (rel: string, depth: number) => {
      for (const e of await b.list(rel ? joinPath(dir, rel) : dir).catch(() => [])) {
        const p = rel ? `${rel}/${e.name}` : e.name;
        if (e.is_dir) {
          if (depth < 3 && !e.name.startsWith('.')) await walk(p, depth + 1);
        } else listing.push(p);
      }
    };
    await walk('', 0);
    const bms = listing.filter((f) => !f.includes('/') && BMS_FILE.test(f));
    if (!bms.length) {
      this.bmsError = 'No .bms, .bme, .bml or .pms files in that folder';
      this.bmsFiles = [];
      return;
    }
    this.bmsListing = listing;
    this.bmsFiles = await Promise.all(
      bms.map(async (name) => ({ name, bytes: await b.readFile(joinPath(dir, name)) })),
    );
    this.dest = joinPath(this.defaultParent(), folderName(baseName(dir)));
  }

  /** The folder's song as it would be imported with the choices made. */
  readonly bmsImport: BmsSongImport | null = $derived.by(() =>
    this.bmsFiles.length
      ? importBmsSong({
          files: this.bmsFiles,
          listing: this.bmsListing,
          choices: this.choices,
          folder: baseName(this.bmsDir),
        })
      : null,
  );

  choose(file: string, patch: Partial<BmsFileChoice>): void {
    this.choices = { ...this.choices, [file]: { ...this.choices[file], ...patch } };
  }

  // ---- writing ------------------------------------------------------------------

  async run(): Promise<boolean> {
    if (this.busy) return false;
    const imp = this.source === 'game' ? this.gameImport : this.bmsImport;
    if (!imp || !imp.charts.length) {
      toast('Nothing to import', 'warn');
      return false;
    }
    this.busy = true;
    this.progress = null;
    try {
      const texts = [
        ...imp.charts.map((c) => ({ path: c.file, text: serializeBmson(c.data) })),
        { path: SIDECAR, text: serializeSongFile(imp.song) },
      ];
      let dir: string;
      if (this.source === 'bms' && this.inPlace) {
        dir = this.bmsDir;
        const there = (await this.app.backend.list(dir)).map((e) => e.name.toLowerCase());
        const clash = texts.find((t) => there.includes(t.path.toLowerCase()));
        if (clash) throw new Error(`${clash.path} is already in ${dir}`);
        for (const t of texts)
          await this.app.backend.writeText(joinPath(dir, t.path), t.text, false);
      } else {
        dir = this.dest.trim();
        if (!dir) throw new Error('Choose where the new song goes');
        const job: ImportJob =
          this.source === 'game'
            ? {
                files: texts,
                copies: (imp as EzSongImport).copies.map((c) => ({
                  from: joinPath(this.app.settings.data.gameRoot!, c.from),
                  to: c.to,
                  convert: c.convert,
                })),
              }
            : {
                files: texts,
                copies: (imp as BmsSongImport).uses.map((f) => ({
                  from: joinPath(this.bmsDir, f),
                  to: f,
                  convert: 'copy' as const,
                })),
              };
        const r = await this.app.backend.importRun(
          dir,
          job,
          (done, total) => (this.progress = [done, total]),
        );
        if (r.failed.length)
          toast(
            `${r.failed.length} keysound${r.failed.length === 1 ? '' : 's'} could not be copied: ${r.failed[0]![0]}${r.failed.length > 1 ? '...' : ''}`,
            'warn',
          );
      }
      this.open = false;
      if (await this.app.openProject(dir)) {
        const n = imp.charts.length;
        toast(
          `Imported ${n} chart${n === 1 ? '' : 's'} - Issues says what could not come across`,
          'ok',
        );
      }
      return true;
    } catch (e) {
      toast(`Import failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
      return false;
    } finally {
      this.busy = false;
      this.progress = null;
    }
  }
}
