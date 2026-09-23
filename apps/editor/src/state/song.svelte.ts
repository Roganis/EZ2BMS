// The song as a whole: its metadata (kept equal in every chart), its
// category, its key, and which tier each chart is. The rules and the file
// format are chart-core's (song/*); this is where the editor applies them.

import {
  CUSTOM_CATEGORY,
  applySongMeta,
  songMeta,
  validCategory,
  type SongMetaValues,
  type Tier,
} from '@ez2bms/chart-core';
import type { App } from './app.svelte';
import type { ChartSlot, Project } from './project.svelte';
import { plural, songwideToast, stepOf, type SongwideStep } from './songwide';
import { toast } from './toasts.svelte';

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
      songwideToast(`Song info changed in ${plural(done.length, 'chart')}`, done, 'Song info');
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
      toast(`${other.label} already exists - move that chart first`, 'warn');
      return false;
    }
    slot.doc.transact('Change tier', (tx) => tx.setInfo({ tier }));
    return true;
  }
}
