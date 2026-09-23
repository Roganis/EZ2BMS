// A bmson as the editor opens it: read (a 0.21 file upgraded), its mode and
// tier worked out, a legacy (`beat-*`) chart renumbered onto EZ2 lanes - and
// everything that happened on the way said, as notes Issues lists with the
// chart (lint/lint.ts LintChart.notes). Before, a renumbering or a dropped
// note was silent; the chart just looked different from the file.

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
      message: `${file} is bmson ${upgradedFrom}: it was read as bmson 1.0, and saving writes 1.0`,
    });
  }
  // One line per kind of problem, not per note: a converter's mistake is
  // usually made thousands of times.
  const byMessage = new Map<string, { path: string; count: number }>();
  for (const w of warnings) {
    const seen = byMessage.get(w.message);
    if (seen) seen.count++;
    else byMessage.set(w.message, { path: w.path, count: 1 });
  }
  let listed = 0;
  for (const [message, { path, count }] of byMessage) {
    if (listed++ === MAX_WARNINGS) {
      notes.push({
        rule: 'bmson-read',
        severity: 'warning',
        message: `${byMessage.size - MAX_WARNINGS} more kinds of problem reading ${file}`,
      });
      break;
    }
    notes.push({
      rule: 'bmson-read',
      severity: 'warning',
      message: `${path}: ${message}${count > 1 ? ` (and ${count - 1} more like it)` : ''}`,
    });
  }
  let converted = !!upgradedFrom;
  if (isLegacyHint(hint)) {
    const r = remapLegacyChart(chart, mode);
    converted = true;
    const label = modeNames(mode).label;
    const numbering =
      r.numbering === 'spec'
        ? " (2P keys on x 9-13, the bmson spec's numbering)"
        : r.numbering === 'ez2'
          ? " (2P keys on x 11-15, EZ2's numbering)"
          : '';
    notes.push({
      rule: 'legacy-lanes',
      severity: 'info',
      message:
        `${file} numbers its lanes the old way (${hint})${numbering}: ${r.moved} notes moved onto ${label}'s lanes` +
        (r.toBgm ? `, ${r.toBgm} on lanes ${label} lacks went to the background` : ''),
    });
    if (r.ambiguous) {
      notes.push({
        rule: 'legacy-10k-numbering',
        severity: 'warning',
        message:
          `${file}'s 2P notes are all on x 11-13, which is 2P keys 1-3 in EZ2's numbering and 3-5 in the bmson spec's. ` +
          'It was read as EZ2PORT reads it (keys 1-3); if they are two lanes off, select them and move them with Alt+→',
      });
    }
  }
  return { chart, mode, tier: chartTier(chart.info, file), notes, converted };
}
