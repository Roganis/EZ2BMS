// Every EZ2 mode's columns: which lanes, in which order, on which chart track.
//
// The bundled table is numbers only, taken from EZ2PORT's docs/gds-slots.md
// (the game's own .gds lane orders, read out of the binary 2026-08-09) and
// ez2/mode.c; with the user's game folder configured, columnsFromGds() reads
// the real descriptor instead, which is correct by construction. The chart
// TRACK a lane plays depends on the mode, not just the lane: 2P keys (x 21-25)
// are tracks 12-16 in 10K (Club) but 14-18 in 14K (Space) - the EZ2AC Bible's
// "CLUB gotcha".

import type { Gds } from '../ez2data/gds';
import { laneForSlot, laneInfo, type LaneInfo } from './lanes';
import { MODES, modeNames, type ModeId, type ModeNames } from './ids';

export interface Column extends LaneInfo {
  /** The EZFF chart track this lane plays in this mode. */
  track: number;
  /** 0-based position in the mode's P1 lane order. */
  index: number;
}

export interface ModeDef extends ModeNames {
  /** Columns in P1 visual order (left to right). */
  columns: Column[];
}

/** [x, track] pairs in P1 order. */
const TABLE: Record<ModeId, [number, number][]> = {
  '5k-only': [
    [11, 3],
    [12, 4],
    [13, 5],
    [14, 6],
    [15, 7],
  ],
  // ScratchMix is fret-and-strum: the turntable strums the held keys, so the
  // notes live on the five key lanes only (EZ2PORT play.c, mode.c {3-7}).
  scratch: [
    [11, 3],
    [12, 4],
    [13, 5],
    [14, 6],
    [15, 7],
  ],
  ruby: [
    [1, 10],
    [11, 3],
    [12, 4],
    [13, 5],
    [14, 6],
    [15, 7],
    [10, 11],
  ],
  '5k': [
    [1, 10],
    [11, 3],
    [12, 4],
    [13, 5],
    [14, 6],
    [15, 7],
    [10, 11],
  ],
  '7k': [
    [1, 10],
    [11, 3],
    [12, 4],
    [13, 5],
    [14, 6],
    [15, 7],
    [10, 11],
    [31, 8],
    [32, 9],
  ],
  '10k': [
    [1, 10],
    [11, 3],
    [12, 4],
    [13, 5],
    [14, 6],
    [15, 7],
    [10, 11],
    [21, 12],
    [22, 13],
    [23, 14],
    [24, 15],
    [25, 16],
    [2, 19],
  ],
  '14k': [
    [1, 10],
    [11, 3],
    [12, 4],
    [13, 5],
    [14, 6],
    [15, 7],
    [31, 8],
    [32, 9],
    [33, 12],
    [34, 13],
    [21, 14],
    [22, 15],
    [23, 16],
    [24, 17],
    [25, 18],
    [2, 19],
  ],
  andromeda: [
    [1, 10],
    [11, 3],
    [12, 4],
    [13, 5],
    [14, 6],
    [15, 7],
    [10, 11],
    [31, 8],
    [32, 9],
    [33, 12],
    [34, 13],
    [20, 20],
    [21, 14],
    [22, 15],
    [23, 16],
    [24, 17],
    [25, 18],
    [2, 19],
  ],
  catch: [
    [1, 10],
    [11, 3],
    [12, 4],
    [13, 5],
    [14, 6],
    [15, 7],
    [10, 11],
    [21, 12],
    [22, 13],
    [23, 14],
    [24, 15],
    [25, 16],
  ],
};

/** Relabel keys by their number in the mode (10K's 2P bank is keys 6-10, 14K's effectors keys 6-9). */
function label(mode: ModeId, lane: LaneInfo): string {
  if (mode === '10k' && lane.side === 2 && lane.kind !== 'scratch' && lane.kind !== 'pedal') {
    return String(lane.x - 15);
  }
  if (mode === '14k') {
    if (lane.kind === 'effector') return String(lane.x - 25);
    if (lane.side === 2 && lane.kind !== 'scratch') return String(lane.x - 11);
  }
  if (mode === '7k' && lane.kind === 'effector') return String(lane.x - 25);
  return lane.short;
}

function build(mode: ModeId, pairs: [number, number][]): Column[] {
  return pairs.map(([x, track], index) => {
    const lane = laneInfo(x);
    if (!lane) throw new Error(`no lane ${x}`);
    return { ...lane, short: label(mode, lane), track, index };
  });
}

const DEFS = new Map<ModeId, ModeDef>(
  MODES.map((m) => [m.id, { ...m, columns: build(m.id, TABLE[m.id]) }]),
);

export function modeDef(id: ModeId): ModeDef {
  return DEFS.get(id)!;
}

export function allModes(): ModeDef[] {
  return MODES.map((m) => DEFS.get(m.id)!);
}

/** The column a lane occupies in a mode, or undefined when the mode has no such lane. */
export function columnOf(mode: ModeDef, x: number): Column | undefined {
  return mode.columns.find((c) => c.x === x);
}

/** Chart tracks that are lanes in a mode (everything else is backing audio). */
export function laneTracks(mode: ModeDef): Set<number> {
  return new Set(mode.columns.map((c) => c.track));
}

export interface GdsDiff {
  /** Columns the .gds has that the bundled table lacks (or orders differently). */
  message: string;
}

/**
 * Columns from the user's own .gds (player 1): order and tracks exactly as the
 * engine will use them. Lanes whose control id is not a known EZ2 lane are
 * skipped (and reported).
 */
export function columnsFromGds(mode: ModeId, gds: Gds): { columns: Column[]; skipped: number[] } {
  const slot = gds.slots[0];
  const columns: Column[] = [];
  const skipped: number[] = [];
  for (const l of slot?.lanes ?? []) {
    const lane = laneForSlot(l.key) ?? laneForSlot(l.key2);
    if (!lane) {
      skipped.push(l.track);
      continue;
    }
    columns.push({ ...lane, short: label(mode, lane), track: l.track, index: columns.length });
  }
  return { columns, skipped };
}

/** Compare the bundled table with a real .gds; empty when they agree. */
export function diffWithGds(mode: ModeId, gds: Gds): string[] {
  const want = modeDef(mode).columns.map((c) => `${c.x}@${c.track}`);
  const got = columnsFromGds(mode, gds).columns.map((c) => `${c.x}@${c.track}`);
  if (want.join(' ') === got.join(' ')) return [];
  return [`${modeNames(mode).portName}: bundled ${want.join(' ')} vs .gds ${got.join(' ')}`];
}
