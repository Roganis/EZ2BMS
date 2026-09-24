// What a hold's kind makes of it, for the editor to show: where each
// instalment falls due, how many a clean play is paid, and what the engine
// counts the note as - the two can differ, and then a perfect play cannot
// reach 100% (lint hold-kind-max).
//
// EZ2PORT ez2/score.c (score.ts here): instalment k of a hold starting at
// tick t is due at t + k*step and is paid on the first frame after that
// tick while the key is held; the step and the count come from
// holdStep/holdInstalments. Kind 6 pays only its last instalment, and only
// while the hold is still KOOL; kinds 7-12 pay none; 4 and 5 pay one, a
// whole raw length (hold + 6 ticks) after the start - past the hold's end.
// The head is judged like a tap for every kind. The tail is never judged
// (docs/judge-timing.md: "a port must not tally a release").

import { HOLD_BIAS } from '../io/ez/ezff';
import type { ChartData, NoteRec } from '../model/types';
import { TickConverter, TICKS_PER_BEAT } from '../timing/ticks';
import { holdInstalments, holdStep, noteCounted } from './score';

export interface HoldPreview {
  kind: number;
  /** Pulses at which an instalment falls due (kind 6: the one it pays, the last). */
  at: number[];
  /** Instalments a clean play is paid. */
  pays: number;
  /** What the engine counts the note as (its head, and instalments), 300 points each at most. */
  counts: number;
  /** A clean play earns what the note counts for (else 100% is out of reach). */
  balanced: boolean;
  /** The ticks between instalments (0: none). */
  stepTicks: number;
}

/** Pulses back from a tick, through the STOP gaps (a tick inside a gap is the STOP's own pulse). */
function pulseOfTick(
  tc: TickConverter,
  stops: readonly { y: number; duration: number }[],
  t: number,
): number {
  const shifted = (t * tc.resolution) / TICKS_PER_BEAT;
  let acc = 0;
  for (const s of [...stops].filter((s) => s.duration > 0).sort((a, b) => a.y - b.y)) {
    const at = s.y + acc;
    if (at >= shifted) break;
    if (shifted <= at + s.duration) return s.y;
    acc += s.duration;
  }
  return shifted - acc;
}

/** The preview of one hold of a chart (undefined for a tap). */
export function holdPreview(
  chart: Pick<ChartData, 'info' | 'stopEvents'>,
  n: Pick<NoteRec, 'y' | 'l' | 'kind'>,
): HoldPreview | undefined {
  if (n.l <= 0) return undefined;
  const tc = new TickConverter(chart.info.resolution ?? 240, chart.stopEvents);
  const ticks = tc.holdTicks(n.y, n.l);
  if (ticks <= 0) return undefined;
  const kind = n.kind ?? 0;
  const raw = ticks + HOLD_BIAS;
  const step = holdStep(kind, 192, raw);
  const owed = holdInstalments(kind, 192, raw, 0);
  const start = tc.tick(n.y).tick;
  const dues = Array.from({ length: owed }, (_, k) => start + (k + 1) * step);
  const paid = kind === 6 ? dues.slice(-1) : dues;
  const at = paid.map((t) => pulseOfTick(tc, chart.stopEvents, t));
  const counts = noteCounted(kind, 192, raw, 0);
  return {
    kind,
    at,
    pays: paid.length,
    counts,
    balanced: counts === 1 + paid.length,
    stepTicks: step,
  };
}

/**
 * EZ2 hold kinds and what each does (EZ2PORT ez2/score.h, docs/PORT-DELTAS.md
 * findings 1 and 12). 0 is what nearly every shipped chart uses; `common`
 * are the ones K cycles through.
 */
export const HOLD_KIND_INFO: readonly { kind: number; label: string; common: boolean }[] = [
  { kind: 0, label: 'every 1/4 beat (default)', common: true },
  { kind: 1, label: 'every 1/2 beat', common: true },
  { kind: 2, label: 'every 1/8 beat', common: true },
  { kind: 3, label: 'every 1/16 beat', common: true },
  { kind: 4, label: 'once, after the end (counted as 1/32s: never 100%)', common: true },
  { kind: 5, label: 'once, after the end (counted as 1/4s: never 100%)', common: false },
  { kind: 6, label: 'once at the end, if still KOOL', common: false },
  { kind: 7, label: 'nothing while held', common: true },
  { kind: 8, label: 'nothing while held', common: false },
  { kind: 9, label: 'nothing; the head is not counted', common: false },
  { kind: 10, label: 'nothing; the head is not counted', common: false },
  { kind: 11, label: 'nothing; the head is not counted', common: false },
  { kind: 12, label: 'nothing; the head is not counted', common: false },
];
