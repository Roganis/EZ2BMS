// Legacy (BMS-numbered, `beat-*`) bmson lanes -> the canonical EZ2 lanes.
//
// Old EZ2 bmson conversions numbered lanes like BMS key channels, and EZ2PORT
// still reads them (ez2/bmson.c slot_for_x). EZ2BMS works in the canonical
// numbering only, so a legacy chart is renumbered once when it is opened. The
// table below is the port's, expressed as .gds input slots (the control ids a
// lane's keys send), then mapped to canonical x.
//
// `beat-10k` is written two ways. EZ2's own conversions (and the port) put
// the 2P keys on x 11-15; the bmson spec, and BmsTWO's BMS import, put them
// on x 9-13 with the 2P scratch on 16. The port reads only the first, so a
// spec-numbered file loads with its 2P side shifted two lanes. EZ2BMS tells
// them apart by the notes: anything on x 9 or 10 can only be the spec's 2P
// keys 1-2. A chart whose 2P notes are all on x 11-13 fits both readings; it
// is read the port's way and reported (docs/ez2port-compat.md).

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

/** How a `beat-10k` chart numbers its 2P side: the port's (x 11-15) or the bmson spec's (x 9-13). */
export type TenKeyNumbering = 'ez2' | 'spec';

/**
 * Which numbering a plain `beat-10k` chart uses, from its notes, and whether
 * the notes leave it open (2P notes only on x 11-13, where both readings put
 * 2P keys). BGM (x 0) never counts.
 */
export function tenKeyNumbering(chart: ChartData): {
  numbering: TenKeyNumbering;
  ambiguous: boolean;
} {
  let low = false;
  let high = false;
  let mid = false;
  for (const n of chart.notes) {
    if (n.x === 9 || n.x === 10) low = true;
    else if (n.x === 14 || n.x === 15) high = true;
    else if (n.x >= 11 && n.x <= 13) mid = true;
  }
  if (low) return { numbering: 'spec', ambiguous: false };
  return { numbering: 'ez2', ambiguous: mid && !high };
}

/** ez2/bmson.c slot_for_x for a legacy hint; -1 for a lane the mode lacks. */
export function legacySlotForX(
  x: number,
  hint: string,
  mode: ModeId,
  numbering: TenKeyNumbering = 'ez2',
): number {
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
    // The spec's 2P keys (not the port's; see the top of the file).
    if (numbering === 'spec') {
      if (x >= 9 && x <= 13) return 9 + x;
    } else if (x >= 11 && x <= 15) return 7 + x;
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
  /** A plain `beat-10k` chart: the numbering it was read with. */
  numbering?: TenKeyNumbering;
  /** ...and whether its notes fit the other numbering as well. */
  ambiguous?: boolean;
}

/**
 * Renumber a legacy chart in place to canonical lanes and set its mode_hint to
 * the canonical hint. Returns what changed. BGM (x 0) is left alone.
 */
export function remapLegacyChart(chart: ChartData, mode: ModeId): RemapReport {
  const hint = chart.info.modeHint ?? '';
  const report: RemapReport = { moved: 0, toBgm: 0 };
  let numbering: TenKeyNumbering = 'ez2';
  if (mode === '10k' && hint.toLowerCase() === 'beat-10k') {
    const t = tenKeyNumbering(chart);
    numbering = t.numbering;
    report.numbering = t.numbering;
    report.ambiguous = t.ambiguous;
  }
  const remap = (n: NoteRec) => {
    if (n.x === 0) return;
    const slot = legacySlotForX(n.x, hint, mode, numbering);
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
