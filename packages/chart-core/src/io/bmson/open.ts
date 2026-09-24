// A bmson as the editor opens it: read (a 0.21 file upgraded), its mode and
// tier worked out, a legacy (`beat-*`) chart renumbered onto EZ2 lanes - and
// everything that happened on the way said, as notes Issues lists with the
// chart (lint/lint.ts LintChart.notes). Before, a renumbering or a dropped
// note was silent; the chart just looked different from the file.

import { said, saying, type SaidValue } from '../../i18n/say';
import type { OpenNote } from '../../lint/lint';
import type { ChartData, Tier } from '../../model/types';
import { modeNames, type ModeId } from '../../modes/ids';
import { remapLegacyChart } from './legacy-remap';
import { chartMode, chartTier, isLegacyHint } from './mode-resolve';
import { parseBmson } from './parse';

export interface OpenedChart {
  chart: ChartData;
  mode: ModeId;
  tier: Tier;
  notes: OpenNote[];
  /** The chart differs from the file's bytes as read (upgraded or renumbered). */
  converted: boolean;
}

/** At most this many distinct parse warnings are listed; the rest are counted. */
const MAX_WARNINGS = 20;

export function openChart(file: string, bytes: Uint8Array | string): OpenedChart {
  const { chart, warnings, upgradedFrom } = parseBmson(bytes);
  const notes: OpenNote[] = [];
  const hint = chart.info.modeHint;
  const resolved = chartMode(chart.info, file);
  const mode = resolved?.mode ?? '5k';
  if (upgradedFrom) {
    notes.push({
      rule: 'bmson-0.21',
      severity: 'info',
      ...saying(said('open.upgraded', { file, version: upgradedFrom })),
    });
  }
  // One line per kind of problem, not per note: a converter's mistake is
  // usually made thousands of times. Kinds are told apart by their English.
  const byMessage = new Map<string, { path: string; problem: SaidValue; count: number }>();
  for (const w of warnings) {
    const seen = byMessage.get(w.message);
    if (seen) seen.count++;
    else byMessage.set(w.message, { path: w.path, problem: w.said ?? w.message, count: 1 });
  }
  let listed = 0;
  for (const { path, problem, count } of byMessage.values()) {
    if (listed++ === MAX_WARNINGS) {
      notes.push({
        rule: 'bmson-read',
        severity: 'warning',
        ...saying(said('open.read.more', { n: byMessage.size - MAX_WARNINGS, file })),
      });
      break;
    }
    notes.push({
      rule: 'bmson-read',
      severity: 'warning',
      ...saying(
        count > 1
          ? said('open.read.again', { path, problem, more: count - 1 })
          : said('open.read', { path, problem }),
      ),
    });
  }
  let converted = !!upgradedFrom;
  if (isLegacyHint(hint)) {
    const r = remapLegacyChart(chart, mode);
    converted = true;
    const legacy = {
      file,
      hint,
      // A plain beat-10k chart says which numbering it was read with.
      numbering: r.numbering ?? 'none',
      moved: r.moved,
      mode: modeNames(mode).label,
    };
    notes.push({
      rule: 'legacy-lanes',
      severity: 'info',
      ...saying(
        r.toBgm
          ? said('open.legacy.bgm', { ...legacy, bgm: r.toBgm })
          : said('open.legacy', legacy),
      ),
    });
    if (r.ambiguous) {
      notes.push({
        rule: 'legacy-10k-numbering',
        severity: 'warning',
        ...saying(said('open.legacy.ambiguous', { file })),
      });
    }
  }
  return { chart, mode, tier: chartTier(chart.info, file), notes, converted };
}
