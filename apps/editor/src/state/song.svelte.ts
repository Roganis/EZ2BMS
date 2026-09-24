// The song as a whole: its metadata (kept equal in every chart), its
// category, its key, and which tier each chart is. The rules and the file
// format are chart-core's (song/*); this is where the editor applies them.

import {
  CUSTOM_CATEGORY,
  applySongMeta,
  chartBaseName,
  isValidSongKey,
  modeNames,
  newChart,
  songMeta,
  validCategory,
  type ChartData,
  type ModeId,
  type SongMetaValues,
  type Tier,
} from '@ez2bms/chart-core';
import { joinPath } from '../bridge';
import { errorText, t } from '../i18n/i18n.svelte';
import type { App } from './app.svelte';
import type { ChartSlot, Project } from './project.svelte';
import { songwideToast, stepOf, type SongwideStep } from './songwide';
import { toast, toasts } from './toasts.svelte';

export interface NewChartOptions {
  level?: number;
  bpm?: number;
  /** Start with the open chart's sound list. */
  copySounds?: boolean;
  /** Duplicate this chart (notes, sounds, timing) instead of starting empty. */
  from?: ChartSlot;
}

/** Where removed charts go, inside the song folder (dot-folders are skipped by every scan). */
const TRASH = '.ez2bms-trash';

export class SongState {
  constructor(private readonly app: App) {}

  /** The song's title, subtitle, artist and genre, and which the charts disagree on. */
  meta(p: Project): ReturnType<typeof songMeta> {
    for (const c of p.charts) void c.rev;
    return songMeta(p.charts.map((c) => ({ data: c.doc.data, tier: c.tier })));
  }

  /**
   * Set song info in every chart. Typing (`merge`) folds into each chart's
   * previous step quietly; a committed change says what it did and offers
   * to undo it everywhere.
   */
  setMeta(patch: Partial<SongMetaValues>, merge?: string): void {
    const p = this.app.project;
    if (!p) return;
    const done: SongwideStep[] = [];
    for (const slot of p.charts) if (applySongMeta(slot.doc, patch, merge)) done.push(stepOf(slot));
    if (!merge && done.length > 1)
      songwideToast(t('song.metaChanged', { n: done.length }), done, t('song.metaStep'));
  }

  /** The song.ini Category (1..48). */
  category(p: Project): number {
    return validCategory(p.sidecar.category) ?? CUSTOM_CATEGORY;
  }

  async setCategory(n: number): Promise<void> {
    const p = this.app.project;
    if (!p || validCategory(n) === undefined) return;
    p.sidecar.category = n;
    await p.saveSidecar();
  }

  /**
   * Make a chart another tier of its mode. It is an edit of the chart's info
   * (undo puts it back); the file follows on the next save.
   */
  setTier(slot: ChartSlot, tier: Tier): boolean {
    const p = this.app.project;
    if (!p || slot.tier === tier) return false;
    const other = p.charts.find((c) => c !== slot && c.mode === slot.mode && c.tier === tier);
    if (other) {
      toast(t('song.tierTaken', { chart: other.label }), 'warn');
      return false;
    }
    slot.doc.transact(t('song.changeTier'), (tx) => tx.setInfo({ tier }));
    return true;
  }

  /** Why a chart cannot be made at (mode, tier), or undefined. */
  cannotCreate(mode: ModeId, tier: Tier): string | undefined {
    const p = this.app.project;
    if (!p) return t('song.noSong');
    if (!isValidSongKey(p.sidecar.key)) return t('song.needKey');
    if (!modeNames(mode).portPlayable)
      return t('song.unpublishable', { mode: modeNames(mode).label });
    if (p.charts.some((c) => c.mode === mode && c.tier === tier))
      return t('song.chartExists', { mode: modeNames(mode).label, tier });
    return undefined;
  }

  /**
   * A new chart at (mode, tier) - empty, or a copy of another chart - named
   * the way EZ2PORT names charts. It is unsaved until the next save.
   */
  createChart(mode: ModeId, tier: Tier, o: NewChartOptions = {}): ChartSlot | undefined {
    const p = this.app.project;
    const why = this.cannotCreate(mode, tier);
    if (!p || why) {
      toast(t('song.cannotMake', { why }), 'warn');
      return undefined;
    }
    const file = `${chartBaseName(mode, p.sidecar.key, tier)}.bmson`;
    let data: ChartData;
    if (o.from) {
      data = structuredClone($state.snapshot(o.from.doc.data) as ChartData);
      data.info.tier = tier;
      data.info.modeHint = modeNames(mode).hint;
    } else {
      const base = p.active?.doc.data;
      const meta = this.meta(p).values;
      data = newChart({
        mode,
        tier,
        level: o.level ?? 1,
        bpm: o.bpm ?? base?.info.initBpm ?? 150,
        title: meta.title || p.name,
        artist: meta.artist,
        genre: meta.genre,
      });
      if (meta.subtitle) data.info.subtitle = meta.subtitle;
      if (o.copySounds && base)
        data.channels = base.channels.map((c, i) => ({ id: i + 1, name: c.name }));
    }
    const slot = p.addChart(file, data, mode, tier);
    this.app.selectChart(p.charts.indexOf(slot));
    return slot;
  }

  /**
   * Take a chart out of the song: its file moves to the song's trash folder
   * and the toast's Undo brings both back, unsaved edits and history too.
   */
  async removeChart(slot: ChartSlot): Promise<void> {
    const p = this.app.project;
    if (!p) return;
    const onDisk = (await this.app.backend.list(p.dir)).some((e) => e.name === slot.file);
    const trashed = `${TRASH}/${Date.now()}/${slot.file}`;
    if (onDisk) {
      try {
        await this.app.backend.renameFile(joinPath(p.dir, slot.file), joinPath(p.dir, trashed));
      } catch (e) {
        const error = errorText(e);
        toast(t('song.removeFailed', { file: slot.file, error }), 'error');
        return;
      }
    }
    const wasActive = p.active === slot;
    const at = p.detachChart(slot);
    // Its crash copy would otherwise come back as a stray chart on the next open.
    void this.app.autosave.clear(p, [slot]);
    if (wasActive) this.app.selectChart(p.activeIndex);
    const removed = onDisk
      ? t('song.removedTrash', { chart: slot.label, folder: TRASH })
      : t('song.removed', { chart: slot.label });
    toasts.push(removed, 'ok', 15000, {
      label: t('song.undo'),
      run: () =>
        void (async () => {
          if (onDisk)
            await this.app.backend.renameFile(joinPath(p.dir, trashed), joinPath(p.dir, slot.file));
          p.attachChart(slot, at);
          this.app.selectChart(p.charts.indexOf(slot));
        })().catch((e: unknown) =>
          toast(
            t('song.restoreFailed', {
              file: slot.file,
              error: errorText(e),
            }),
            'error',
          ),
        ),
    });
  }
}
