// When to look for a new version by itself: at most once a day after a
// look that worked (one that failed - offline - is tried again next start),
// and only for a version not skipped.

import type { UpdateOptions } from './settings.svelte';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether a start should look for a new version now. */
export function checkDue(o: UpdateOptions, nowMs: number): boolean {
  return o.check && (nowMs - o.lastCheckMs >= DAY_MS || nowMs < o.lastCheckMs);
}

/** Whether a version found by the daily look should be offered (a skipped one is not). */
export function offer(o: UpdateOptions, version: string, manual: boolean): boolean {
  return manual || o.skip !== version;
}
