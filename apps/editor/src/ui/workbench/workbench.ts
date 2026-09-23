// The keysound workbench's arithmetic, kept out of the components so it can
// be tested: which sounds show, in what order, grouped how, and which rows of
// a 1500-sound grid are on screen.

import type { SongSounds, SoundInfo } from '@ez2bms/chart-core';

export type SoundFilter = 'all' | 'used' | 'unused' | 'missing' | 'channels';
export type SoundSort = 'group' | 'name' | 'usage' | 'length';

export const FILTERS: readonly { id: SoundFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'used', label: 'Used' },
  { id: 'unused', label: 'Not used' },
  { id: 'missing', label: 'Missing' },
  { id: 'channels', label: 'Unused in a chart' },
];

/**
 * A run of cards from one group. `key` names the group where it starts (its
 * label is drawn above it); a long group continues on the next rows unlabelled.
 */
export interface Segment {
  key: string | null;
  count: number;
  items: SoundInfo[];
}

/** One row of the grid: up to `cols` cards, from one or more groups. */
export interface Row {
  segments: Segment[];
  /** Some segment starts a group here: the row has a label strip. */
  labelled: boolean;
}

/** Natural order: "hit_2" before "hit_10", case ignored. */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export interface RowOptions {
  filter: SoundFilter;
  sort: SoundSort;
  query: string;
  /** Cards per row. */
  cols: number;
  /** Seconds, when known. */
  lengthOf: (s: SoundInfo) => number | undefined;
}

function keep(s: SoundInfo, f: SoundFilter, unusedIn: Set<SoundInfo>): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'used':
      return s.charts.length > 0;
    case 'unused':
      return s.inFolder && s.charts.length === 0;
    case 'missing':
      return !s.inFolder;
    case 'channels':
      return unusedIn.has(s);
  }
}

/** Sounds with a channel that plays nothing in some chart. */
export function withUnusedChannels(song: SongSounds): Set<SoundInfo> {
  const owner = new Map<string, SoundInfo>();
  for (const s of song.sounds)
    for (const c of s.charts) for (const ch of c.channels) owner.set(`${c.chart}\0${ch}`, s);
  const out = new Set<SoundInfo>();
  for (const u of song.unusedChannels) {
    const s = owner.get(`${u.chart}\0${u.ch}`);
    if (s) out.add(s);
  }
  return out;
}

/** How many sounds each filter shows. */
export function filterCounts(song: SongSounds): Record<SoundFilter, number> {
  const used = song.sounds.filter((s) => s.charts.length > 0).length;
  return {
    all: song.sounds.length,
    used,
    unused: song.unusedFiles.length,
    missing: song.missing.length,
    channels: withUnusedChannels(song).size,
  };
}

/** The grid's rows of `cols` cards; sorted by group, each group labelled where it starts. */
export function workbenchRows(song: SongSounds, o: RowOptions): Row[] {
  const q = o.query.trim().toLowerCase();
  const unusedIn = o.filter === 'channels' ? withUnusedChannels(song) : new Set<SoundInfo>();
  const list = song.sounds.filter(
    (s) => keep(s, o.filter, unusedIn) && (!q || s.name.toLowerCase().includes(q)),
  );
  const byName = (a: SoundInfo, b: SoundInfo) => collator.compare(a.name, b.name);
  const len = (s: SoundInfo) => o.lengthOf(s) ?? -1;
  switch (o.sort) {
    case 'group':
    case 'name':
      list.sort(byName);
      break;
    case 'usage':
      list.sort((a, b) => b.notes - a.notes || byName(a, b));
      break;
    case 'length':
      list.sort((a, b) => len(b) - len(a) || byName(a, b));
      break;
  }
  const cols = Math.max(1, o.cols);
  const rows: Row[] = [];
  if (o.sort !== 'group') {
    for (let i = 0; i < list.length; i += cols)
      rows.push({
        segments: [{ key: null, count: 0, items: list.slice(i, i + cols) }],
        labelled: false,
      });
    return rows;
  }
  const groups = new Map<string, SoundInfo[]>();
  for (const s of list) {
    const g = groups.get(s.group);
    if (g) g.push(s);
    else groups.set(s.group, [s]);
  }
  // Small groups share a row, as long as a group is never split when it
  // would fit whole on the next one: a kit reads as one block.
  let row: Row | undefined;
  let used = 0;
  for (const key of [...groups.keys()].sort((a, b) => collator.compare(a, b))) {
    const items = groups.get(key)!;
    if (!row || (items.length > cols - used && used > 0)) {
      rows.push((row = { segments: [], labelled: false }));
      used = 0;
    }
    for (let i = 0; i < items.length;) {
      if (used === cols) {
        rows.push((row = { segments: [], labelled: false }));
        used = 0;
      }
      const take = Math.min(cols - used, items.length - i);
      row.segments.push({
        key: i === 0 ? key : null,
        count: items.length,
        items: items.slice(i, i + take),
      });
      if (i === 0) row.labelled = true;
      used += take;
      i += take;
    }
  }
  return rows;
}

/** Top offsets of every row (and the total height at the end). */
export function rowOffsets(rows: readonly Row[], headH: number, cardH: number): number[] {
  const out = [0];
  for (const r of rows) out.push(out.at(-1)! + (r.labelled ? headH : 0) + cardH);
  return out;
}

/** The rows [from, to) that touch the window [top, top + height), with `overscan` rows either side. */
export function visibleRows(
  offsets: readonly number[],
  top: number,
  height: number,
  overscan = 2,
): [number, number] {
  const n = offsets.length - 1;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid + 1]! <= top) lo = mid + 1;
    else hi = mid;
  }
  let end = lo;
  while (end < n && offsets[end]! < top + height) end++;
  return [Math.max(0, lo - overscan), Math.min(n, end + overscan)];
}

/** "1.25 s", "3:04" - a sound's length for a card. */
export function formatLength(seconds: number | undefined): string {
  if (seconds === undefined) return '-';
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
  const m = Math.floor(seconds / 60);
  return `${m}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
