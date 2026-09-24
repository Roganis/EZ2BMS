// Synthetic charts for tests, benchmarks and the demo: deterministic (seeded),
// shaped like real EZ2 charts - dense lane streams, holds of every kind,
// tempo changes, slices of long backing stems - with no audio attached.

import { ChartDoc } from '../edit/doc';
import { newChart } from '../model/defaults';
import type { ChartData, NoteRec } from '../model/types';
import type { ModeId } from '../modes/ids';
import { modeDef } from '../modes/registry';

export interface SynthOptions {
  mode: ModeId;
  /** Lane + background notes in total (roughly). */
  notes: number;
  /** Sound channels. */
  channels: number;
  seed?: number;
  resolution?: number;
  /**
   * Sound names: "s0001.wav" (one name group, the default), or "grouped" -
   * 60 kits of ~25 numbered sounds ("kick-a_01.wav"), as a keysounded song
   * names them, so the rack and the workbench have groups to draw.
   */
  names?: 'numbered' | 'grouped';
}

const KITS = ['kick', 'snare', 'hat', 'clap', 'tom', 'bass', 'lead', 'pad', 'vox', 'fx'];

/** The i-th sound's name in a synthetic chart. */
export function synthSoundName(i: number, names: SynthOptions['names'] = 'numbered'): string {
  if (names !== 'grouped') return `s${String(i).padStart(4, '0')}.wav`;
  const kit = `${KITS[i % KITS.length]}-${'abcdef'[Math.floor(i / KITS.length) % 6]}`;
  return `${kit}_${String(Math.floor(i / 60) + 1).padStart(2, '0')}.wav`;
}

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A big chart built straight into the model (no per-note transactions). */
export function synthChart(o: SynthOptions): ChartData {
  const rnd = lcg(o.seed ?? 7);
  const res = o.resolution ?? 240;
  const data = newChart({
    mode: o.mode,
    tier: 'EX',
    level: 20,
    bpm: 170,
    title: `Synth ${o.notes}`,
  });
  data.info.resolution = res;
  data.channels = Array.from({ length: o.channels }, (_, i) => ({
    id: i + 1,
    name: synthSoundName(i, o.names),
  }));
  const cols = modeDef(o.mode).columns.map((c) => c.x);
  const notes: NoteRec[] = [];
  const step = res / 4; // 1/16 notes
  const laneBusy = new Map<number, number>(); // lane -> last pulse used (holds included)
  let y = 0;
  let id = 1;
  while (notes.length < o.notes) {
    // A chord of 1-3 lane notes and a background sound every 1/16.
    const chord = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < chord && notes.length < o.notes; k++) {
      const x = cols[Math.floor(rnd() * cols.length)]!;
      if ((laneBusy.get(x) ?? -1) >= y) continue;
      const hold = rnd() < 0.08 ? step * (2 + Math.floor(rnd() * 6)) : 0;
      const kind = hold && rnd() < 0.3 ? [1, 2, 3, 7][Math.floor(rnd() * 4)] : undefined;
      const n: NoteRec = {
        id: id++,
        ch: 1 + Math.floor(rnd() * o.channels),
        x,
        y,
        l: hold,
        c: false,
      };
      if (kind !== undefined) n.kind = kind;
      notes.push(n);
      laneBusy.set(x, y + hold);
    }
    if (notes.length < o.notes && rnd() < 0.7) {
      notes.push({
        id: id++,
        ch: 1 + Math.floor(rnd() * o.channels),
        x: 0,
        y,
        l: 0,
        c: rnd() < 0.2,
      });
    }
    y += step;
  }
  data.notes = notes;
  const measures = Math.ceil(y / (res * 4));
  data.bpmEvents = Array.from({ length: Math.floor(measures / 16) }, (_, i) => ({
    y: (i + 1) * 16 * res * 4,
    bpm: 150 + ((i * 37) % 60),
  }));
  return data;
}

/** The same, wrapped in a ChartDoc (index built). */
export function synthDoc(o: SynthOptions): ChartDoc {
  return new ChartDoc(synthChart(o));
}
