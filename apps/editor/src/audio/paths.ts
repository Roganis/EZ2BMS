// Where a chart's sound name is on disk: chart-core's resolveSound (any case,
// "kick.wav" finding kick.ogg) inside the song folder.

import { resolveSound } from '@ez2bms/chart-core';
import { joinPath } from '../bridge';

export function soundPath(dir: string, samples: readonly string[], name: string): string {
  return joinPath(dir, resolveSound(samples, name) ?? name);
}

/** Every sound name the charts use, once. */
export function soundNames(
  charts: readonly { doc: { data: { channels: readonly { name: string }[] } } }[],
): string[] {
  return [...new Set(charts.flatMap((c) => c.doc.data.channels.map((ch) => ch.name)))];
}
