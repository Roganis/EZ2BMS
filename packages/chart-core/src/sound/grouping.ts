// Sounds grouped by name, and a group's notes packed into side-by-side
// sub-lanes: the background rack's layout. A port of BmsTWO's
// src/util/SampleGrouping.cpp (the "Classic BMS Mode" view), kept faithful so
// a song looks the same in both editors.
//
// Two deliberate differences, both because EZ2BMS names carry more than
// BmsTWO's do:
// - BmsTWO keys a channel by its file's base name (QFileInfo::baseName: no
//   folder, cut at the FIRST dot). Here the folder stays, so "drums/hit_1" and
//   "fx/hit_1" are different groups, and the extension is cut at the last dot
//   of the file name (GroupKeyOf's own rule).
// - Ties between notes with the same start and length are ordered by channel
//   order then note id; BmsTWO's std::sort leaves them unspecified.

/** A trailing number and the separators before it ("piano_03" -> "piano"). ASCII only, as Qt's default. */
const TRAILING_NUMBER = /^(.*?)[ \t\n\v\f\r_-]*[0-9]+$/;

/**
 * The group a sound name belongs to (SampleGrouping::GroupKeyOf): the name
 * without its extension and without one trailing run of digits. A name that is
 * all digits keeps them - every numbered-only sound is its own group.
 */
export function groupKeyOf(name: string): string {
  let s = name;
  const slash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  const dot = s.lastIndexOf('.');
  // Only an extension of the file name itself, and never a leading dot.
  if (dot > slash + 1) s = s.slice(0, dot);
  const m = TRAILING_NUMBER.exec(s);
  if (m) {
    const key = m[1]!.trim();
    if (key) return key;
  }
  return s.trim();
}

export interface GroupPlacement {
  /** Channel id. */
  ch: number;
  /** Note id. */
  id: number;
  y: number;
  l: number;
  /** Which sub-lane of the group, from 0. */
  sub: number;
}

export interface SoundGroup {
  key: string;
  /** At least 1. */
  subLanes: number;
  /** Channel ids in the group, in channel order. */
  channels: number[];
  placements: GroupPlacement[];
}

export interface GroupOptions {
  /**
   * The shortest a note counts as, in pulses. BmsTWO's is 1 (two sounds at
   * the same instant overlap, one a tick later does not); the rack passes a
   * visual extent so chips drawn at a low zoom do not sit on each other.
   */
  minExtent?: number;
  /** Keep groups whose channels have no notes (BmsTWO does). Default true. */
  keepEmpty?: boolean;
}

/**
 * Group channels by name and pack each group's notes first-fit into sub-lanes
 * (SampleGrouping::BuildGroups). Start-sorted first fit is optimal: a group
 * gets as many sub-lanes as notes overlap at its busiest moment.
 */
export function buildGroups(
  channels: readonly { id: number; name: string }[],
  notesOf: (ch: number) => readonly { id: number; y: number; l: number }[],
  opts: GroupOptions = {},
): SoundGroup[] {
  const minExtent = Math.max(1, opts.minExtent ?? 1);
  const keepEmpty = opts.keepEmpty ?? true;
  const buckets = new Map<
    string,
    { channels: number[]; notes: (GroupPlacement & { order: number })[] }
  >();
  channels.forEach((c, order) => {
    const key = groupKeyOf(c.name);
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { channels: [], notes: [] }));
    b.channels.push(c.id);
    for (const n of notesOf(c.id))
      b.notes.push({ ch: c.id, id: n.id, y: n.y, l: n.l, sub: 0, order });
  });

  const groups: SoundGroup[] = [];
  for (const [key, b] of buckets) {
    if (!keepEmpty && !b.notes.length) continue;
    b.notes.sort((p, q) => p.y - q.y || p.l - q.l || p.order - q.order || p.id - q.id);
    // Each sub-lane's last note; a note fits the first sub-lane it does not overlap.
    const lastEnd: number[] = [];
    const placements: GroupPlacement[] = [];
    for (const n of b.notes) {
      const end = n.y + Math.max(n.l, minExtent);
      let sub = 0;
      // Start-sorted, so a sub-lane is free once its last note has ended.
      while (sub < lastEnd.length && lastEnd[sub]! > n.y) sub++;
      lastEnd[sub] = end;
      placements.push({ ch: n.ch, id: n.id, y: n.y, l: n.l, sub });
    }
    groups.push({ key, subLanes: Math.max(1, lastEnd.length), channels: b.channels, placements });
  }
  // Ordinal (UTF-16) order, as QString's operator< - not a natural sort.
  groups.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return groups;
}
