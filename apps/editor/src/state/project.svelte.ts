// An open song: its folder, one ChartDoc per bmson, and the samples beside
// them. The project lives outside EZ2PORT's songs folder; Publish writes the
// package there.

import { errorText } from '../i18n/i18n.svelte';
import {
  ChartDoc,
  chartBaseName,
  chartTier,
  decodeUtf8,
  encodeUtf8,
  findImage,
  isValidSongKey,
  modeNames,
  newSongFile,
  openChart,
  parseChartName,
  parseSongFile,
  serializeBmson,
  serializeSongFile,
  songArt,
  songBga,
  type ChartData,
  type ModeId,
  type OpenNote,
  type SongArt,
  type SongBga,
  type SongFile,
  type SourceNote,
  type Tier,
} from '@ez2bms/chart-core';
import { baseName, joinPath, type Backend } from '../bridge';

export const SIDECAR = 'ez2bms.song.json';

/** One chart of the song, with a revision counter the UI can react to. */
export class ChartSlot {
  rev = $state(0);
  dirty = $state(false);
  /** The bmson's name in the song folder (it follows mode, key and tier when saved). */
  file = $state('');
  /** From the chart's info (an edit, so undo moves it back), else its file name. */
  tier = $state<Tier>('NM');
  /** What opening it said (a 0.21 upgrade, a renumbering, members it could not read): shown in Issues. */
  notes: OpenNote[] = [];
  /** What importing it said (the song file's `source.notes` for this chart), until cleared. */
  importNotes = $state.raw<OpenNote[]>([]);

  constructor(
    file: string,
    public readonly doc: ChartDoc,
    public mode: ModeId,
    tier: Tier,
  ) {
    this.file = file;
    this.tier = tier;
    doc.onChange(() => {
      this.rev++;
      this.dirty = doc.dirty;
      this.tier = chartTier(doc.data.info, this.file);
    });
  }

  get label(): string {
    return `${modeNames(this.mode).label} ${this.tier}`;
  }

  get level(): number {
    return this.doc.data.info.level ?? 0;
  }

  bmson(): string {
    return serializeBmson(this.doc.data);
  }
}

const TIER_ORDER: Record<Tier, number> = { NM: 0, HD: 1, SHD: 2, EX: 3 };

const noteOf = ({ chart: _chart, ...n }: SourceNote): OpenNote => n;

export class Project {
  charts = $state<ChartSlot[]>([]);
  /** What importing the song said about it as a whole, until cleared. */
  importNotes = $state.raw<OpenNote[]>([]);
  activeIndex = $state(0);
  samples = $state<string[]>([]);
  /** Images in the folder (relative, forward slashes), for the disc and eyecatch. */
  images = $state<string[]>([]);
  /** Movies in the folder, for the BGA. */
  movies = $state<string[]>([]);
  /** ez2bms.song.json (chart-core song/songfile.ts). */
  sidecar = $state<SongFile>(newSongFile());
  /**
   * Classic mode when the song file does not say: on for a song whose charts
   * already continue sounds (it was built from stems or a converted BMS).
   */
  classicDefault = false;

  private constructor(
    public readonly dir: string,
    private readonly backend: Backend,
  ) {}

  get name(): string {
    return baseName(this.dir);
  }

  get active(): ChartSlot | undefined {
    return this.charts[this.activeIndex];
  }

  get dirty(): boolean {
    return this.charts.some((c) => this.unsaved(c));
  }

  /**
   * The name a chart is saved under: charts named the port's way
   * (streetmix1p-<key>-hd.bmson) follow their mode, the song key and their
   * tier, so a tier change or a new key renames the file on the next save.
   * Other names are the user's and stay.
   */
  targetFile(slot: ChartSlot): string {
    const key = this.sidecar.key;
    if (!isValidSongKey(key) || !parseChartName(slot.file)?.mode) return slot.file;
    const want = `${chartBaseName(slot.mode, key, slot.tier)}.bmson`;
    // Never onto another chart of the song.
    const taken = this.charts.some(
      (c) => c !== slot && c.file.toLowerCase() === want.toLowerCase(),
    );
    return taken ? slot.file : want;
  }

  /**
   * The disc and eyecatch a publish uses: the song file's choice, else the
   * image the port's importer would take from the charts' info.
   */
  get art(): SongArt {
    const images = this.images;
    return songArt(
      this.sidecar,
      this.charts.map((c) => c.doc.data.info),
      (n) => findImage(images, n),
    );
  }

  /**
   * The BGA a publish would use: the song file's movie, or the first chart's
   * (chart-core publish/bga.ts), looked up among the folder's movies - and
   * its images, since a converted BMS names stills there.
   */
  get bga(): SongBga | undefined {
    const files = [...this.movies, ...this.images];
    return songBga(
      this.sidecar.bga,
      this.charts.map((c) => c.doc.data),
      (n) => findImage(files, n),
    );
  }

  /** Unsaved edits, or a name the next save will change. */
  unsaved(slot: ChartSlot): boolean {
    return slot.dirty || this.targetFile(slot) !== slot.file;
  }

  static async open(backend: Backend, dir: string): Promise<Project> {
    const p = new Project(dir, backend);
    const scan = await backend.scanProject(dir);
    p.samples = scan.samples;
    p.images = scan.images;
    p.movies = scan.movies;
    if (scan.sidecar) {
      // A broken song file reads as empty (and is rewritten on the next save).
      const text = await backend.readText(joinPath(dir, SIDECAR)).catch(() => '{}');
      p.sidecar = parseSongFile(text).song;
    }
    const slots: ChartSlot[] = [];
    for (const e of scan.charts) {
      const bytes = await backend.readFile(joinPath(dir, e.name));
      slots.push(Project.slotFor(e.name, bytes));
    }
    slots.sort((a, b) => a.mode.localeCompare(b.mode) || TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
    // What the import said, by chart; the rest is the song's.
    const said = p.sidecar.source?.notes ?? [];
    for (const s of slots) s.importNotes = said.filter((n) => n.chart === s.file).map(noteOf);
    p.importNotes = said.filter((n) => !slots.some((s) => s.file === n.chart)).map(noteOf);
    p.charts = slots;
    p.classicDefault = slots.some((s) => s.doc.data.notes.some((n) => n.c));
    return p;
  }

  /** Read the folder's file list again (after a rename or an import). */
  async rescan(): Promise<void> {
    const scan = await this.backend.scanProject(this.dir);
    this.samples = scan.samples;
    this.images = scan.images;
    this.movies = scan.movies;
  }

  /** Swap a chart for recovered text (it stays unsaved until you save). */
  recover(file: string, text: string): void {
    const i = this.charts.findIndex((c) => c.file === file);
    const slot = Project.slotFor(file, encodeUtf8(text));
    slot.dirty = true;
    if (i >= 0) this.charts[i] = slot;
    else this.charts.push(slot);
  }

  static slotFor(file: string, bytes: Uint8Array): ChartSlot {
    const o = openChart(file, bytes);
    const slot = new ChartSlot(file, new ChartDoc(o.chart), o.mode, o.tier);
    slot.notes = o.notes;
    return slot;
  }

  addChart(file: string, data: ChartData, mode: ModeId, tier: Tier): ChartSlot {
    const slot = new ChartSlot(file, new ChartDoc(data), mode, tier);
    slot.dirty = true;
    this.charts.push(slot);
    this.activeIndex = this.charts.length - 1;
    return slot;
  }

  /** Take a chart out of the song (its file is the caller's business). Returns where it was. */
  detachChart(slot: ChartSlot): number {
    const i = this.charts.indexOf(slot);
    if (i < 0) return -1;
    const active = this.active;
    this.charts.splice(i, 1);
    const keep = active && active !== slot ? this.charts.indexOf(active) : Math.max(0, i - 1);
    this.activeIndex = Math.max(0, keep);
    return i;
  }

  /** Put a chart back (undoing a removal), with its history as it was. */
  attachChart(slot: ChartSlot, at: number): void {
    this.charts.splice(Math.min(Math.max(0, at), this.charts.length), 0, slot);
  }

  /**
   * Write a chart, renaming its file first when its name should follow a new
   * tier or key. Returns the old name when it was renamed. A rename the disk
   * refuses (another file has the name) leaves the chart under its old name.
   */
  async save(slot: ChartSlot): Promise<string | undefined> {
    const to = this.targetFile(slot);
    let renamed: string | undefined;
    if (to !== slot.file) {
      const onDisk = (await this.backend.list(this.dir)).some((e) => e.name === slot.file);
      try {
        if (onDisk)
          await this.backend.renameFile(joinPath(this.dir, slot.file), joinPath(this.dir, to));
        renamed = slot.file;
        slot.file = to;
      } catch (e) {
        this.renameFailures.push(`${slot.file}: ${errorText(e)}`);
      }
    }
    await this.backend.writeText(joinPath(this.dir, slot.file), slot.bmson(), true);
    slot.doc.markSaved();
    slot.dirty = false;
    return renamed;
  }

  /** Renames the last saves could not do (the command reports them). */
  renameFailures: string[] = [];

  /** Called with the charts just written and the names they left (autosave clears both). */
  onSaved: ((slots: ChartSlot[], oldNames: string[]) => void) | undefined;

  async saveAll(): Promise<number> {
    const due = this.charts.filter((c) => this.unsaved(c));
    const oldNames: string[] = [];
    for (const c of due) {
      const from = await this.save(c);
      if (from) oldNames.push(from);
    }
    if (due.length) this.onSaved?.(due, oldNames);
    await this.saveSidecar();
    return due.length;
  }

  /** Forget what the import said (it stays in Issues until this). */
  async clearImportNotes(): Promise<void> {
    for (const c of this.charts) c.importNotes = [];
    this.importNotes = [];
    if (this.sidecar.source?.notes) {
      delete this.sidecar.source.notes;
      await this.saveSidecar();
    }
  }

  /** Write the song file (ez2bms.song.json) now. */
  async saveSidecar(): Promise<void> {
    await this.backend.writeText(
      joinPath(this.dir, SIDECAR),
      serializeSongFile($state.snapshot(this.sidecar) as SongFile),
      false,
    );
  }

  /** Bytes of a chart as it would be saved (for tests and exports). */
  static bytes(slot: ChartSlot): Uint8Array {
    return encodeUtf8(slot.bmson());
  }

  static text(bytes: Uint8Array): string {
    return decodeUtf8(bytes).text;
  }
}
