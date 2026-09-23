// Song-level metadata. bmson keeps title, subtitle, artist and genre in
// every chart; EZ2BMS treats them as the song's and keeps the charts equal,
// so each chart stays a complete bmson for any other tool. Where they do
// differ, the song's value is the first NM chart's (else the first chart's) -
// the chart Publish reads song.ini's Title from.

import type { ChartDoc } from '../edit/doc';
import type { ChartData, ChartInfo, Tier } from '../model/types';

export const SONG_FIELDS = ['title', 'subtitle', 'artist', 'genre'] as const;
export type SongField = (typeof SONG_FIELDS)[number];
export type SongMetaValues = Record<SongField, string>;

interface MetaChart {
  data: ChartData;
  tier: Tier;
}

/** The chart the song's metadata is read from. */
export function primaryChart<C extends MetaChart>(charts: readonly C[]): C | undefined {
  return charts.find((c) => c.tier === 'NM') ?? charts[0];
}

const valueOf = (info: ChartInfo, f: SongField) => info[f] ?? '';

/** The song's metadata, and which fields the charts disagree on. */
export function songMeta(charts: readonly MetaChart[]): {
  values: SongMetaValues;
  differs: SongField[];
} {
  const p = primaryChart(charts);
  const values = Object.fromEntries(
    SONG_FIELDS.map((f) => [f, p ? valueOf(p.data.info, f) : '']),
  ) as SongMetaValues;
  const differs = SONG_FIELDS.filter((f) =>
    charts.some((c) => valueOf(c.data.info, f) !== values[f]),
  );
  return { values, differs };
}

/**
 * Set song fields in one chart, as one undo step. An empty value removes the
 * field (bmson leaves out what a chart does not have). Returns whether
 * anything changed.
 */
export function applySongMeta(
  doc: ChartDoc,
  patch: Partial<SongMetaValues>,
  /** Merge with the previous step of the same key (typing in a field). */
  merge?: string,
): boolean {
  const set: Partial<Record<SongField, string | undefined>> = {};
  for (const f of SONG_FIELDS) {
    const v = patch[f];
    if (v === undefined) continue;
    const want = v === '' ? undefined : v;
    if (doc.data.info[f] !== want) set[f] = want;
  }
  if (!Object.keys(set).length) return false;
  doc.transact('Song info', (tx) => tx.setInfo(set), merge ? { merge } : {});
  return true;
}
