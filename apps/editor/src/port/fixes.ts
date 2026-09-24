// Lint's quick fixes, applied in the editor. A chart fix is one undo step in
// its chart (chart-core lint/fixes.ts); "Fix all" runs a rule's fix in every
// chart that has the finding - one step in each - and offers to undo it in
// all of them, as other song-wide changes do. Song fixes change the song file.

import {
  CUSTOM_CATEGORY,
  fixChart,
  isChartFix,
  songKeyFor,
  songMeta,
  type Finding,
} from '@ez2bms/chart-core';
import { t, tSaid } from '../i18n/i18n.svelte';
import type { App } from '../state/app.svelte';
import { songwideToast, stepOf, type SongwideStep } from '../state/songwide';
import { toast } from '../state/toasts.svelte';
import { songFindings } from './lint';

/** Apply one finding's fix. Returns whether anything changed. */
export async function applyFix(app: App, f: Finding): Promise<boolean> {
  const p = app.project;
  const fix = f.fix;
  if (!p || !fix) return false;
  if (!isChartFix(fix.id)) {
    if (fix.id === 'derive-key') {
      const title = songMeta(p.charts.map((c) => ({ data: c.doc.data, tier: c.tier }))).values
        .title;
      p.sidecar.key = songKeyFor(title, p.name);
      toast(t('fix.key', { key: p.sidecar.key }), 'ok');
    } else p.sidecar.category = CUSTOM_CATEGORY;
    await p.saveSidecar();
    return true;
  }
  const slot = p.charts.find((c) => c.file === f.chart);
  return !!slot && fixChart(slot.doc, slot.mode, fix.id);
}

/** Every finding of `rule` with a fix, fixed chart by chart. */
export async function fixAll(app: App, rule: string): Promise<void> {
  const p = app.project;
  if (!p) return;
  const todo = songFindings(app).filter((f) => f.rule === rule && f.fix);
  const done: SongwideStep[] = [];
  let label = '';
  for (const f of todo) {
    label = tSaid(f.fix!.said);
    if (!isChartFix(f.fix!.id)) {
      await applyFix(app, f);
      continue;
    }
    const slot = p.charts.find((c) => c.file === f.chart);
    if (slot && fixChart(slot.doc, slot.mode, f.fix!.id)) done.push(stepOf(slot));
  }
  if (done.length > 1) songwideToast(t('fix.doneAll', { fix: label, n: done.length }), done, label);
  else if (done.length) toast(t('fix.done', { fix: label }), 'ok');
}
