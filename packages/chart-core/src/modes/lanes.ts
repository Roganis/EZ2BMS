// The canonical EZ2 lanes: what each bmson `x` is, which input control drives
// it in the engine, and which BME channel it takes in a BMS export.
//
// Control ids are EZ2PORT's .gds key ids (ez2/gds.h, docs/gds-slots.md):
// keys 10-14, turntable 15/16 (up/down on one lane), pedal 17, effectors 6-9,
// and the 2P side 18-22, 23/24, 25. They are also what the port's bmson
// importer maps each x to (ez2/bmson.c slot_for_x), which is how a lane gets
// to a chart track: the mode's .gds says which track a control plays.

export type LaneKind = 'scratch' | 'white' | 'blue' | 'pedal' | 'effector';

export interface LaneInfo {
  x: number;
  kind: LaneKind;
  /** .gds control id (the turntable's first id). */
  slot: number;
  /** BME channel for a BMS export. */
  bme: string;
  /** Short label for lane headers. */
  short: string;
  side: 1 | 2 | 0;
}

const key = (x: number, n: number, side: 1 | 2): LaneInfo => ({
  x,
  kind: n % 2 === 1 ? 'white' : 'blue',
  slot: side === 1 ? 9 + n : 17 + n,
  bme: String((side === 1 ? 10 : 20) + n),
  short: String(side === 1 ? n : n + 5),
  side,
});

export const LANES: readonly LaneInfo[] = [
  { x: 1, kind: 'scratch', slot: 15, bme: '16', short: 'TT', side: 1 },
  { x: 2, kind: 'scratch', slot: 23, bme: '26', short: 'TT', side: 2 },
  { x: 10, kind: 'pedal', slot: 17, bme: '17', short: 'PD', side: 1 },
  { x: 20, kind: 'pedal', slot: 25, bme: '27', short: 'PD', side: 2 },
  ...[1, 2, 3, 4, 5].map((n) => key(10 + n, n, 1)),
  ...[1, 2, 3, 4, 5].map((n) => key(20 + n, n, 2)),
  { x: 31, kind: 'effector', slot: 6, bme: '18', short: 'E1', side: 0 },
  { x: 32, kind: 'effector', slot: 7, bme: '19', short: 'E2', side: 0 },
  { x: 33, kind: 'effector', slot: 8, bme: '28', short: 'E3', side: 0 },
  { x: 34, kind: 'effector', slot: 9, bme: '29', short: 'E4', side: 0 },
];

const byX = new Map(LANES.map((l) => [l.x, l]));
const bySlot = new Map<number, LaneInfo>();
for (const l of LANES) bySlot.set(l.slot, l);
// The turntables' second direction.
bySlot.set(16, byX.get(1)!);
bySlot.set(24, byX.get(2)!);

export function laneInfo(x: number): LaneInfo | undefined {
  return byX.get(x);
}

/** The canonical lane a .gds control id drives, if any. */
export function laneForSlot(slot: number): LaneInfo | undefined {
  return bySlot.get(slot);
}

export const BGM_X = 0;
