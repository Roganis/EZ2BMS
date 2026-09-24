// The song's sounds as a whole: what the workbench shows and the edits it
// makes across every chart.
//
// Replacing a sound is a musical edit, so it is an undo step in each chart
// it touches (Ctrl+Z there undoes it) and the toast offers to undo them all.
// Renaming a file is not an edit: the file is renamed on disk and every
// chart's references - history included - follow it (ChartDoc
// renameSoundRefs), so no undo can bring back a name that no longer exists.
// Charts that had no unsaved changes are saved at once so the folder stays
// consistent; the toast's Undo renames the file back the same way.

import {
  AUDIO_EXT,
  SoundIndex,
  addChannel,
  addChannels,
  planSoundRename,
  removeUnusedChannels,
  replaceSound,
  soundUsage,
  type SongSounds,
  type SoundInfo,
} from '@ez2bms/chart-core';
import { ThumbCache } from '../audio/thumbs';
import { baseName, joinPath, type Imported } from '../bridge';
import { t } from '../i18n/i18n.svelte';
import type { App } from './app.svelte';
import type { ChartSlot, Project } from './project.svelte';
import { songwideToast, stepOf, type SongwideStep } from './songwide';
import { toast, toasts } from './toasts.svelte';

/** What the file chooser offers (the engine decodes these; see chart-core AUDIO_EXT). */
export const IMPORT_EXT = ['wav', 'ogg', 'flac', 'mp3', 'oga'];

export class SoundsState {
  readonly thumbs: ThumbCache;

  constructor(private readonly app: App) {
    this.thumbs = new ThumbCache(app.backend.audio);
  }

  /** Every sound of the song and where it is used (one pass over every chart). */
  usage(p: Project): SongSounds {
    return soundUsage(
      p.charts.map((c) => ({ file: c.file, data: c.doc.data })),
      p.samples,
    );
  }

  /** Load every audio file in the folder, used or not, so each card has a length and a waveform. */
  async loadFolder(p: Project): Promise<void> {
    await this.app.audio.load(
      p,
      p.samples.filter((s) => AUDIO_EXT.test(s)),
    );
  }

  /**
   * Copy sound files (or the audio in folders) into the song folder - never
   * over another file; the same bytes under the same name are reused - and
   * add them to the open chart in one undo step, skipping sounds it has.
   */
  async import(paths: string[]): Promise<void> {
    const p = this.app.project;
    if (!p || !paths.length) return;
    let res: Imported[];
    try {
      res = await this.app.backend.importFiles(p.dir, paths);
    } catch (e) {
      toast(
        t('sounds.importFailed', { error: e instanceof Error ? e.message : String(e) }),
        'error',
      );
      return;
    }
    // Local bookkeeping in this function; nothing renders from these sets.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const names = [...new Set(res.flatMap((r) => (r.name ? [r.name] : [])))];
    const copied = res.filter((r) => r.name && !r.reused).length;
    const skipped = res.filter((r) => r.error);
    await p.rescan();
    await this.app.audio.load(p, names);
    const slot = this.app.slot;
    let added = 0;
    if (slot && names.length) {
      // "kick.wav" in the chart already means kick.ogg when that is the file.
      const index = new SoundIndex(p.samples);
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const have = new Set(slot.doc.data.channels.map((c) => index.resolve(c.name) ?? c.name));
      const fresh = names.filter((n) => !have.has(n));
      if (fresh.length) {
        const made = addChannels(slot.doc, fresh);
        added = made.length;
        if (this.app.view.brush === null) this.app.view.brush = made[0]!.id;
      }
    }
    // Each clause is its own message: any of them can be missing.
    const parts = [
      copied ? t('sounds.imported', { n: copied }) : names.length ? t('sounds.alreadyThere') : '',
      added && slot ? t('sounds.addedTo', { n: added, chart: slot.label }) : '',
      skipped.length
        ? t('sounds.skipped', {
            files: `${skipped
              .slice(0, 3)
              .map((r) => baseName(r.from))
              .join(', ')}${skipped.length > 3 ? '…' : ''}`,
            error: skipped[0]!.error,
          })
        : '',
    ].filter(Boolean);
    toast(
      parts.join(' - ') || t('sounds.nothing'),
      skipped.length && !names.length ? 'warn' : 'ok',
    );
  }

  /** Pick sound files to import. */
  async importPicked(): Promise<void> {
    const paths = await this.app.backend.pickFiles(t('sounds.pickTitle'), IMPORT_EXT);
    await this.import(paths);
  }

  /** Draw with this sound in the open chart: its channel, or a new one. */
  brush(info: SoundInfo): void {
    const slot = this.app.slot;
    if (!slot) return;
    const own = info.charts.find((c) => c.chart === slot.file)?.channels[0];
    this.app.view.brush = own ?? addChannel(slot.doc, info.name).id;
  }

  /** Point every chart's channels for `info` at the file `to`. */
  replace(info: SoundInfo, to: string): void {
    const p = this.app.project;
    if (!p || to === info.name) return;
    const done: SongwideStep[] = [];
    for (const u of info.charts) {
      const slot = p.charts.find((c) => c.file === u.chart);
      if (slot && replaceSound(slot.doc, u.channels, to)) done.push(stepOf(slot));
    }
    if (!done.length) return;
    void this.app.audio.load(p, [to]);
    songwideToast(
      t('sounds.replaced', { from: info.name, to, n: done.length }),
      done,
      t('sounds.replaceStep'),
    );
  }

  /** Remove every channel that plays no note, in every chart. */
  removeUnused(): void {
    const p = this.app.project;
    if (!p) return;
    const done: SongwideStep[] = [];
    let n = 0;
    for (const slot of p.charts) {
      const gone = removeUnusedChannels(slot.doc);
      if (!gone.length) continue;
      n += gone.length;
      done.push(stepOf(slot));
      if (slot === this.app.slot && gone.includes(this.app.view.brush ?? -1))
        this.app.view.brush = slot.doc.data.channels[0]?.id ?? null;
    }
    if (!n) {
      toast(t('sounds.allUsed'), 'info');
      return;
    }
    songwideToast(t('sounds.removed', { n, charts: done.length }), done, t('sounds.removeStep'));
  }

  /**
   * Rename a sound file (`newBase` is the new file name, in the same folder)
   * and every reference to it. Resolves false when refused or when the disk
   * said no; nothing has changed then.
   */
  async rename(from: string, newBase: string, undo = true): Promise<boolean> {
    const p = this.app.project;
    if (!p) return false;
    const plan = planSoundRename(
      p.charts.map((c) => ({ file: c.file, data: c.doc.data })),
      p.samples,
      from,
      newBase,
    );
    if (!plan.ok) {
      toast(t('sounds.cantRename', { file: baseName(from), reason: plan.reason }), 'warn');
      return false;
    }
    try {
      await this.app.backend.renameFile(joinPath(p.dir, from), joinPath(p.dir, plan.to));
    } catch (e) {
      toast(
        t('sounds.cantRename', {
          file: baseName(from),
          reason: e instanceof Error ? e.message : String(e),
        }),
        'error',
      );
      return false;
    }
    // Old name -> new name, for the audio cache and the clipboard; nothing renders from it.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const all = new Map<string, string>([[from, plan.to]]);
    const saved: ChartSlot[] = [];
    const oldNames: string[] = [];
    for (const slot of p.charts) {
      const m = plan.renames.get(slot.file);
      if (!m) continue;
      for (const [k, v] of m) all.set(k, v);
      const clean = !slot.dirty;
      slot.doc.renameSoundRefs(m);
      if (clean) {
        const was = await p.save(slot);
        if (was) oldNames.push(was);
        saved.push(slot);
      }
    }
    if (saved.length) p.onSaved?.(saved, oldNames);
    for (const n of this.app.clip?.notes ?? []) n.chName = all.get(n.chName) ?? n.chName;
    this.app.audio.rename(all);
    await p.rescan();
    const charts = plan.renames.size;
    const unsaved = charts - saved.length;
    const text = [
      t('sounds.renamed', { from: baseName(from), to: baseName(plan.to), charts, unsaved }),
      plan.adopts.length
        ? t('sounds.adopted', { names: plan.adopts.join(', '), n: plan.adopts.length })
        : '',
    ]
      .filter(Boolean)
      .join(' - ');
    if (undo)
      toasts.push(text, 'ok', 15000, {
        label: t('sounds.undo'),
        run: () => void this.rename(plan.to, baseName(from), false),
      });
    else toast(text, 'ok');
    return true;
  }
}
