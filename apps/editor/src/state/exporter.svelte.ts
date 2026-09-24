// The Export dialog's state: sending the song back to the original game
// (a song it already has: its folder under sound/ and its song.bin record),
// writing it out as BMS, and undoing an earlier export to the game. The work
// is port/cabinet.ts's and port/bms.ts's; this holds the choices and where
// each tab is.

import {
  cabinetTargets,
  ciEq,
  sourceTarget,
  type CabinetTarget,
  type Game,
} from '@ez2bms/chart-core';
import { dirName, joinPath, type ExportBackup, type ExportReport } from '../bridge';
import { t } from '../i18n/i18n.svelte';
import { prepareBms, writeBmsFolder, type BmsChoices, type BmsReview } from '../port/bms';
import { prepareCabinet, writeCabinet, type CabinetReview } from '../port/cabinet';
import type { App } from './app.svelte';
import { loadGame } from './game';
import { ask, toast } from './toasts.svelte';

export type ExportTab = 'cabinet' | 'bms' | 'history';

export type CabinetStage =
  | { kind: 'idle' }
  | { kind: 'preparing' }
  | { kind: 'ready'; review: CabinetReview }
  | { kind: 'writing'; review: CabinetReview }
  | {
      kind: 'done';
      review: CabinetReview;
      report?: ExportReport;
      folder?: { dir: string; files: number };
    }
  | { kind: 'failed'; message: string };

export type BmsStage =
  | { kind: 'idle' }
  | { kind: 'writing' }
  | { kind: 'done'; dir: string; files: number }
  | { kind: 'failed'; message: string };

export class Exporter {
  open = $state(false);
  tab = $state<ExportTab>('cabinet');
  progress = $state<[number, number] | null>(null);

  // ---- the game
  game = $state.raw<Game | null>(null);
  /** The folder `game` was read from; an export or a restore makes it stale. */
  private gameRoot: string | null = null;
  private stale = false;
  gameError = $state<string | null>(null);
  loadingGame = $state(false);
  query = $state('');
  target = $state.raw<CabinetTarget | null>(null);
  /** Chart files left out of the export (all go by default). */
  skip = $state<Record<string, boolean>>({});
  destKind = $state<'game' | 'folder'>('game');
  folder = $state('');
  includeUnchanged = $state(false);
  cabinet = $state.raw<CabinetStage>({ kind: 'idle' });
  private seq = 0;
  /** The song the choices were made for. */
  private songDir = '';

  // ---- BMS
  bmsSkip = $state<Record<string, boolean>>({});
  bmsChoices = $state<BmsChoices>({ map: 'ez2', encoding: 'auto', base: 'auto' });
  bmsDest = $state('');
  bmsStage = $state.raw<BmsStage>({ kind: 'idle' });

  // ---- past exports
  backups = $state.raw<ExportBackup[]>([]);
  backupsError = $state<string | null>(null);

  constructor(private readonly app: App) {}

  show(tab: ExportTab = 'cabinet'): void {
    const p = this.app.project;
    if (!p) return;
    this.tab = tab;
    this.open = true;
    this.cabinet = { kind: 'idle' };
    this.bmsStage = { kind: 'idle' };
    this.progress = null;
    if (this.songDir !== p.dir) {
      // Another song: nothing chosen for the last one carries over.
      this.songDir = p.dir;
      const parent = dirName(p.dir);
      this.folder = joinPath(parent, `${p.name} (cabinet)`);
      this.bmsDest = joinPath(parent, `${p.name} (BMS)`);
      this.skip = {};
      this.bmsSkip = {};
      this.target = null;
      this.query = '';
    }
    void this.enter(tab);
  }

  close(): void {
    this.seq++;
    this.open = false;
  }

  /** Switch tabs, reading what the tab needs. */
  async enter(tab: ExportTab): Promise<void> {
    this.tab = tab;
    if (tab === 'cabinet') {
      await this.ensureGame();
      if (this.target) await this.prepare();
    } else if (tab === 'history') await this.loadBackups();
  }

  // ---- the game -----------------------------------------------------------------

  private async ensureGame(): Promise<void> {
    const root = this.app.settings.data.gameRoot ?? null;
    if (this.game && !this.stale && root === this.gameRoot) {
      if (!this.target) this.target = this.defaultTarget(this.game);
      return;
    }
    this.gameError = null;
    this.loadingGame = true;
    try {
      const game = await loadGame(this.app.backend, this.app.settings);
      this.game = game;
      this.gameRoot = root;
      this.stale = false;
      const targets = cabinetTargets(game);
      if (!targets.length) this.gameError = game.problems[0] ?? t('import.game.noSongs');
      const keep = this.target && targets.find((t) => ciEq(t.dir, this.target!.dir));
      this.target = keep ?? this.defaultTarget(game);
    } catch (e) {
      this.game = null;
      this.target = null;
      this.gameError = e instanceof Error ? e.message : String(e);
    } finally {
      this.loadingGame = false;
    }
  }

  /** The song it went into last time, else the one it was imported from. */
  private defaultTarget(game: Game): CabinetTarget | null {
    const targets = cabinetTargets(game);
    const side = this.app.project?.sidecar;
    const last = side?.cabinet && targets.find((t) => ciEq(t.dir, side.cabinet!.key));
    return last ?? sourceTarget(targets, side?.source) ?? null;
  }

  async reloadGame(): Promise<void> {
    this.stale = true;
    await this.ensureGame();
    if (this.target) await this.prepare();
  }

  readonly targets: CabinetTarget[] = $derived(this.game ? cabinetTargets(this.game) : []);

  /** The targets matching the search, by title or folder. */
  readonly found: CabinetTarget[] = $derived.by(() => {
    const q = this.query.trim().toLowerCase();
    return q
      ? this.targets.filter(
          (t) =>
            t.dir.toLowerCase().includes(q) || (t.title?.title ?? '').toLowerCase().includes(q),
        )
      : this.targets;
  });

  /** The song this project came from, when it is not the one chosen. */
  get otherSong(): string | undefined {
    const src = this.app.project?.sidecar.source;
    if (src?.from !== 'ez2ac' || !src.key || !this.target) return undefined;
    return ciEq(src.key, this.target.dir) ? undefined : src.key;
  }

  choose(t: CabinetTarget): void {
    this.target = t;
    void this.prepare();
  }

  toggle(file: string, on: boolean): void {
    this.skip = { ...this.skip, [file]: !on };
    void this.prepare();
  }

  setDest(kind: 'game' | 'folder'): void {
    this.destKind = kind;
    void this.prepare();
  }

  setIncludeUnchanged(on: boolean): void {
    this.includeUnchanged = on;
    void this.prepare();
  }

  /** Work out what the export would write, again. */
  async prepare(): Promise<void> {
    const p = this.app.project;
    const game = this.game;
    const target = this.target;
    if (!p || !game || !target) return;
    const slots = p.charts.filter((c) => !this.skip[c.file]);
    const n = ++this.seq;
    if (!slots.length) {
      this.cabinet = { kind: 'failed', message: t('export.noChart') };
      return;
    }
    this.cabinet = { kind: 'preparing' };
    try {
      const review = await prepareCabinet(this.app, game, target, slots, {
        dest: this.destKind === 'game' ? { kind: 'game' } : { kind: 'folder', dir: this.folder },
        includeUnchanged: this.includeUnchanged,
      });
      if (n === this.seq) this.cabinet = { kind: 'ready', review };
    } catch (e) {
      if (n === this.seq)
        this.cabinet = { kind: 'failed', message: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Why Export is not available now, or undefined. */
  blocked(r: CabinetReview): string | undefined {
    const errors = r.findings.filter((f) => f.severity === 'error');
    if (errors.length) return t('export.blocked.errors', { n: errors.length });
    if (!r.plan.charts.length) return t('export.blocked.noChart');
    if (r.dest.kind === 'folder' && !this.folder.trim()) return t('export.blocked.noFolder');
    return undefined;
  }

  async writeCabinet(): Promise<void> {
    const s = this.cabinet;
    if (s.kind !== 'ready' || this.blocked(s.review)) return;
    let review = s.review;
    // The folder typed after the review was made.
    if (review.dest.kind === 'folder' && review.dest.dir !== this.folder.trim())
      review = { ...review, dest: { kind: 'folder', dir: this.folder.trim() } };
    this.cabinet = { kind: 'writing', review };
    this.progress = null;
    try {
      const r = await writeCabinet(this.app, review, (d, t) => (this.progress = [d, t]));
      if (review.dest.kind === 'game') this.stale = true;
      this.cabinet = { kind: 'done', review, ...r };
    } catch (e) {
      this.cabinet = {
        kind: 'failed',
        message: t('export.failed', { error: e instanceof Error ? e.message : String(e) }),
      };
    } finally {
      this.progress = null;
    }
  }

  // ---- past exports -----------------------------------------------------------------

  async loadBackups(): Promise<void> {
    const root = this.app.settings.data.gameRoot;
    this.backupsError = null;
    if (!root) {
      this.backups = [];
      this.backupsError = t('import.game.noRoot');
      return;
    }
    try {
      this.backups = await this.app.backend.export.backups(root);
    } catch (e) {
      this.backups = [];
      this.backupsError = e instanceof Error ? e.message : String(e);
    }
  }

  /** Put back what an export replaced, and take away what it added. */
  async restore(stamp: string, force = false): Promise<void> {
    const root = this.app.settings.data.gameRoot;
    if (!root) return;
    try {
      const r = await this.app.backend.export.restore(root, stamp, force);
      this.stale = true;
      const done = r.restored.length + r.removed.length;
      if (r.conflicts.length) {
        const files = r.conflicts.slice(0, 3).join(', ') + (r.conflicts.length > 3 ? '...' : '');
        ask(t('export.restore.conflicts', { n: r.conflicts.length, files }), {
          label: t('export.restore.anyway'),
          run: () => void this.restore(stamp, true),
        });
      } else
        toast(
          done
            ? t('export.restore.done', { restored: r.restored.length, removed: r.removed.length })
            : t('export.restore.nothing'),
          'ok',
        );
      await this.loadBackups();
    } catch (e) {
      toast(
        t('export.restore.failed', { error: e instanceof Error ? e.message : String(e) }),
        'error',
      );
    }
  }

  // ---- BMS ----------------------------------------------------------------------------

  /** The song as BMS with the choices made, or why not. */
  readonly bms: { review?: BmsReview; error?: string } = $derived.by(() => {
    const p = this.app.project;
    if (!p || !this.open || this.tab !== 'bms') return {};
    const slots = p.charts.filter((c) => !this.bmsSkip[c.file]);
    if (!slots.length) return { error: t('export.noChart') };
    // Every chart's edits are read (rev), so the review follows them.
    for (const s of slots) void s.rev;
    try {
      return { review: prepareBms(this.app, slots, $state.snapshot(this.bmsChoices)) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  });

  async writeBms(): Promise<void> {
    const r = this.bms.review;
    const dest = this.bmsDest.trim();
    if (!r || !dest || this.bmsStage.kind === 'writing') return;
    this.bmsStage = { kind: 'writing' };
    this.progress = null;
    try {
      const out = await writeBmsFolder(this.app, dest, r, (d, t) => (this.progress = [d, t]));
      this.bmsStage = { kind: 'done', ...out };
    } catch (e) {
      this.bmsStage = {
        kind: 'failed',
        message: t('export.failed', { error: e instanceof Error ? e.message : String(e) }),
      };
    } finally {
      this.progress = null;
    }
  }
}
