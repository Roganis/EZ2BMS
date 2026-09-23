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

/**
 * A minimal PE32 image holding `data` at the given virtual addresses (image
 * base 0x400000): enough for peVaToOffset / exeRead / keyTableFromExe to find
 * them the way they find the real executable's. The bytes are the caller's -
 * made-up tables, never the game's.
 */
export function synthPe(data: { va: number; bytes: Uint8Array }[]): Uint8Array {
  const base = 0x400000;
  const lo = Math.min(...data.map((d) => d.va - base)) & ~0xfff;
  const hi = (Math.max(...data.map((d) => d.va - base + d.bytes.length)) + 0xfff) & ~0xfff;
  const raw = 0x400;
  const out = new Uint8Array(raw + (hi - lo));
  const dv = new DataView(out.buffer);
  out.set([0x4d, 0x5a], 0); // MZ
  const pe = 0x80;
  dv.setUint32(0x3c, pe, true);
  out.set([0x50, 0x45, 0, 0], pe); // PE\0\0
  dv.setUint16(pe + 4, 0x14c, true); // i386
  dv.setUint16(pe + 6, 1, true); // one section
  const optSize = 0xe0;
  dv.setUint16(pe + 20, optSize, true);
  dv.setUint16(pe + 24, 0x10b, true); // PE32
  dv.setUint32(pe + 24 + 28, base, true);
  const s = pe + 24 + optSize;
  out.set([0x2e, 0x64, 0x61, 0x74, 0x61], s); // .data
  dv.setUint32(s + 8, hi - lo, true);
  dv.setUint32(s + 12, lo, true);
  dv.setUint32(s + 16, hi - lo, true);
  dv.setUint32(s + 20, raw, true);
  for (const d of data) out.set(d.bytes, raw + (d.va - base - lo));
  return out;
}
