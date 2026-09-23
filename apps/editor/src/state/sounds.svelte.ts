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
  addChannel,
  planSoundRename,
  removeUnusedChannels,
  replaceSound,
  soundUsage,
  type SongSounds,
  type SoundInfo,
} from '@ez2bms/chart-core';
import { ThumbCache } from '../audio/thumbs';
import { baseName, joinPath } from '../bridge';
import type { App } from './app.svelte';
import type { ChartSlot, Project } from './project.svelte';
import { toast, toasts } from './toasts.svelte';

interface Done {
  slot: ChartSlot;
  mark: unknown;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

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
    const done: Done[] = [];
    for (const u of info.charts) {
      const slot = p.charts.find((c) => c.file === u.chart);
      if (slot && replaceSound(slot.doc, u.channels, to))
        done.push({ slot, mark: slot.doc.historyMark() });
    }
    if (!done.length) return;
    void this.app.audio.load(p, [to]);
    toasts.push(
      `Replaced ${info.name} with ${to} in ${plural(done.length, 'chart')}`,
      'ok',
      15000,
      { label: 'Undo in all charts', run: () => this.undoAll(done, 'Replace') },
    );
  }

  /** Remove every channel that plays no note, in every chart. */
  removeUnused(): void {
    const p = this.app.project;
    if (!p) return;
    const done: Done[] = [];
    let n = 0;
    for (const slot of p.charts) {
      const gone = removeUnusedChannels(slot.doc);
      if (!gone.length) continue;
      n += gone.length;
      done.push({ slot, mark: slot.doc.historyMark() });
      if (slot === this.app.slot && gone.includes(this.app.view.brush ?? -1))
        this.app.view.brush = slot.doc.data.channels[0]?.id ?? null;
    }
    if (!n) {
      toast('Every sound is used in its charts', 'info');
      return;
    }
    toasts.push(
      `Removed ${plural(n, 'unused sound')} from ${plural(done.length, 'chart')}`,
      'ok',
      15000,
      { label: 'Undo in all charts', run: () => this.undoAll(done, 'Remove') },
    );
  }

  /** Undo a song-wide change in each chart where it is still the last step. */
  private undoAll(done: Done[], what: string): void {
    let skipped = 0;
    for (const d of done) {
      if (d.slot.doc.historyMark() === d.mark) d.slot.doc.undo();
      else skipped++;
    }
    if (skipped)
      toast(
        `${what} undone, except in ${plural(skipped, 'chart')} edited since (undo there with Ctrl+Z)`,
        'warn',
      );
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
      toast(`Can't rename ${baseName(from)}: ${plan.reason}`, 'warn');
      return false;
    }
    try {
      await this.app.backend.renameFile(joinPath(p.dir, from), joinPath(p.dir, plan.to));
    } catch (e) {
      toast(
        `Can't rename ${baseName(from)}: ${e instanceof Error ? e.message : String(e)}`,
        'error',
      );
      return false;
    }
    // Old name -> new name, for the audio cache and the clipboard; nothing renders from it.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const all = new Map<string, string>([[from, plan.to]]);
    const saved: ChartSlot[] = [];
    for (const slot of p.charts) {
      const m = plan.renames.get(slot.file);
      if (!m) continue;
      for (const [k, v] of m) all.set(k, v);
      const clean = !slot.dirty;
      slot.doc.renameSoundRefs(m);
      if (clean) {
        await p.save(slot);
        saved.push(slot);
      }
    }
    if (saved.length) p.onSaved?.(saved);
    for (const n of this.app.clip?.notes ?? []) n.chName = all.get(n.chName) ?? n.chName;
    this.app.audio.rename(all);
    await p.rescan();
    const charts = plan.renames.size;
    const unsaved = charts - saved.length;
    const adopted = plan.adopts.length
      ? ` - ${plan.adopts.join(', ')} ${plan.adopts.length === 1 ? 'was' : 'were'} missing and now play${plan.adopts.length === 1 ? 's' : ''} it`
      : '';
    const text = `Renamed ${baseName(from)} to ${baseName(plan.to)}${charts ? ` in ${plural(charts, 'chart')}` : ''}${unsaved ? ` (${unsaved} unsaved)` : ''}${adopted}`;
    if (undo)
      toasts.push(text, 'ok', 15000, {
        label: 'Undo',
        run: () => void this.rename(plan.to, baseName(from), false),
      });
    else toast(text, 'ok');
    return true;
  }
}
