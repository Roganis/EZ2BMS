// Changes made to every chart of a song at once (replace a sound, remove
// unused sounds, song info). Each chart keeps its own undo history, so such a
// change is one step in each chart it touched; the toast offers to undo it
// in all of them - in each chart where it is still the last step.

import type { ChartSlot } from './project.svelte';
import { toast, toasts } from './toasts.svelte';

export interface SongwideStep {
  slot: ChartSlot;
  /** `doc.historyMark()` right after the change. */
  mark: unknown;
}

export const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** Record a step just made in `slot` (after its transaction). */
export function stepOf(slot: ChartSlot): SongwideStep {
  return { slot, mark: slot.doc.historyMark() };
}

export function undoAll(done: readonly SongwideStep[], what: string): void {
  let skipped = 0;
  for (const d of done) {
    if (d.slot.doc.historyMark() === d.mark) d.slot.doc.undo();
    else skipped++;
  }
  if (skipped)
    toast(
      `${what} undone, except in ${plural(skipped, 'chart')} edited since (undo there with Ctrl+Z)`,
      'warn',
    );
}

/** A toast for a song-wide change, with "Undo in all charts". */
export function songwideToast(text: string, done: readonly SongwideStep[], what: string): void {
  toasts.push(text, 'ok', 15000, {
    label: 'Undo in all charts',
    run: () => undoAll(done, what),
  });
}
