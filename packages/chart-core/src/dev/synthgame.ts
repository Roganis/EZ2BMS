// A synthetic EZ2AC data folder, for tests and the browser build: the files
// the importers read, written in their documented formats by hand-made code -
// nothing here comes from, or stands in for, a game install. (CLAUDE.md:
// game content is never committed; tests that need a real install read
// EZ2_ROOT/EZ2_EXE.)

import { modeDef } from '../modes/registry';
import { modeNames, type ModeId } from '../modes/ids';

/** The P2 control of a single-player lane (the 2P side's keys, 18-25). */
function p2(slot: number): number {
  if (slot >= 10 && slot <= 14) return slot + 8;
  if (slot === 15) return 23;
  if (slot === 17) return 25;
  return slot;
}

const DOUBLE = new Set<ModeId>(['10k', '14k', 'andromeda', 'catch']);

/**
 * A mode's `.gds` (EZ2PORT docs/gds-slots.md, ez2/gds.c): its lanes in order,
 * each with the control that drives it and the chart track it plays, from the
 * bundled table (modes/registry.ts). Single-player modes get a [Slot2] for
 * the 2P side, as the game's own descriptors have.
 */
export function synthGds(mode: ModeId): string {
  const cols = modeDef(mode).columns;
  const slots = DOUBLE.has(mode)
    ? [cols.map((c) => c.slot)]
    : [cols.map((c) => c.slot), cols.map((c) => p2(c.slot))];
  const lines = [
    `; Synthetic ${modeNames(mode).portName}.gds in the documented format (EZ2PORT docs/gds-slots.md).`,
    '; Generated for tests - not copied from any game install.',
    '[General]',
    `NumberOfSlot=${slots.length}`,
    'MaxBaseStage=3',
  ];
  slots.forEach((keys, s) => {
    lines.push('', `[Slot${s + 1}]`, `NumberOfTrack=${cols.length}`);
    cols.forEach((c, i) => {
      const k = keys[i]!;
      // The turntable is one lane driven by two controls (up and down).
      const k2 = k === 15 || k === 23 ? k + 1 : -1;
      lines.push(`Track${i + 1} =`, '{', `    Key=${k},${k2}`, `    SongTrack=${c.track}`, '}');
    });
  });
  return lines.join('\r\n') + '\r\n';
}
