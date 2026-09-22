// Legacy (BMS-numbered, `beat-*`) bmson lanes -> the canonical EZ2 lanes.
//
// Old EZ2 bmson conversions numbered lanes like BMS key channels, and EZ2PORT
// still reads them (ez2/bmson.c slot_for_x). EZ2BMS works in the canonical
// numbering only, so a legacy chart is renumbered once when it is opened. The
// table below is the port's, expressed as .gds input slots (the control ids a
// lane's keys send), then mapped to canonical x.

import type { ChartData, NoteRec } from '../../model/types';
import type { ModeId } from '../../modes/ids';
import { modeNames } from '../../modes/ids';

/** Port .gds input slot -> canonical bmson x. */
const SLOT_TO_X: Record<number, number> = {
  15: 1, // 1P scratch (up; 16 is down on the same lane)
  23: 2, // 2P scratch
  17: 10, // 1P pedal
  25: 20, // 2P pedal
  10: 11,
  11: 12,
  12: 13,
  13: 14,
  14: 15,
  18: 21,
  19: 22,
  20: 23,
  21: 24,
  22: 25,
  6: 31,
  7: 32,
  8: 33,
  9: 34,
};

/** ez2/bmson.c slot_for_x for a legacy hint; -1 for a lane the mode lacks. */
export function legacySlotForX(x: number, hint: string, mode: ModeId): number {
  const fp = hint.toLowerCase().includes('-fp');
  if (x >= 1 && x <= 5) return 9 + x;
  if (fp) {
    if (x === 6) return 17;
    if (x === 8) return 15;
    if (mode === '10k') {
      if (x >= 9 && x <= 13) return 9 + x;
      if (x === 14) return 17;
      if (x === 16) return 23;
    }
    return -1;
  }
  if (mode === '7k') {
    if (x === 6 || x === 7) return x;
    if (x === 8) return 15;
    if (x === 9) return 17;
    return -1;
  }
  if (mode === '10k') {
    if (x === 7) return 17;
    if (x === 8) return 15;
    if (x >= 11 && x <= 15) return 7 + x;
    if (x === 16) return 23;
    return -1;
  }
  if (mode === '14k') {
    if (x === 6 || x === 7) return x;
    if (x === 8) return 15;
    if (x === 9 || x === 10) return x - 1;
    if (x >= 11 && x <= 15) return 7 + x;
    if (x === 16) return 23;
    return -1;
  }
  if (x === 7) return 17;
  if (x === 8) return 15;
  return -1;
}

export interface RemapReport {
  /** Notes moved to a canonical lane. */
  moved: number;
  /** Notes on lanes the legacy mode has no slot for; they become BGM (x 0), as the port plays them. */
  toBgm: number;
}

/**
 * Renumber a legacy chart in place to canonical lanes and set its mode_hint to
 * the canonical hint. Returns what changed. BGM (x 0) is left alone.
 */
export function remapLegacyChart(chart: ChartData, mode: ModeId): RemapReport {
  const hint = chart.info.modeHint ?? '';
  const report: RemapReport = { moved: 0, toBgm: 0 };
  const remap = (n: NoteRec) => {
    if (n.x === 0) return;
    const slot = legacySlotForX(n.x, hint, mode);
    const x = slot < 0 ? 0 : SLOT_TO_X[slot];
    if (x === undefined) throw new Error(`slot ${slot} has no canonical lane`);
    if (x === 0) report.toBgm++;
    else if (x !== n.x) report.moved++;
    n.x = x;
  };
  chart.notes.forEach(remap);
  chart.info.modeHint = modeNames(mode).hint;
  return report;
}
