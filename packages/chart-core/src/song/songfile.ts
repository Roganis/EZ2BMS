// ez2bms.song.json: what a song folder knows beyond its charts - the key
// EZ2PORT files it under, its category, whether it is charted in Classic
// mode - and, as later steps add them, its plate, art, preview and BGA.
//
// The charts stay complete bmson files; this file only holds what bmson has
// no place for. Like the charts it is kept byte-stable: known members are
// written in a fixed order, members EZ2BMS does not know are kept, in their
// order, after them, and a value that is not what EZ2BMS expects (a category
// of 0, say) is kept as it is and reported rather than silently changed.

export interface SongFile {
  /** EZ2PORT's key: the package folder's name (1-15 of a-z, 0-9). */
  key: string;
  /** Identifies this song's packages in a songs folder (set on first publish). */
  id?: string;
  /** The song.ini Category, as stored; `validCategory` says whether the port takes it. */
  category?: unknown;
  /** Classic-mode charting (absent: on when a chart already has continuations). */
  classic?: boolean;
  /** Members EZ2BMS does not know, in file order. */
  extra: Record<string, unknown>;
}

const KNOWN = ['key', 'id', 'category', 'classic'] as const;

export function newSongFile(key = ''): SongFile {
  return { key, extra: {} };
}

/** Read the song file. Never throws: a broken file gives an empty song and a warning. */
export function parseSongFile(text: string): { song: SongFile; warnings: string[] } {
  const warnings: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (e) {
    warnings.push(`ez2bms.song.json is not valid JSON (${e instanceof Error ? e.message : e})`);
    return { song: newSongFile(), warnings };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    warnings.push('ez2bms.song.json does not hold an object');
    return { song: newSongFile(), warnings };
  }
  const o = raw as Record<string, unknown>;
  const song = newSongFile(typeof o.key === 'string' ? o.key : '');
  if (o.key !== undefined && typeof o.key !== 'string') {
    warnings.push('key is not text; it was ignored');
    song.extra.key = o.key;
  }
  if (typeof o.id === 'string') song.id = o.id;
  else if (o.id !== undefined) song.extra.id = o.id;
  if (o.category !== undefined) song.category = o.category;
  if (typeof o.classic === 'boolean') song.classic = o.classic;
  else if (o.classic !== undefined) song.extra.classic = o.classic;
  for (const [k, v] of Object.entries(o))
    if (!(KNOWN as readonly string[]).includes(k)) song.extra[k] = v;
  return { song, warnings };
}

/** The file's text: known members first, in a fixed order, then the rest; 2-space JSON. */
export function serializeSongFile(s: SongFile): string {
  const out: Record<string, unknown> = { key: s.key };
  if (s.id !== undefined) out.id = s.id;
  if (s.category !== undefined) out.category = s.category;
  if (s.classic !== undefined) out.classic = s.classic;
  for (const [k, v] of Object.entries(s.extra)) if (!(k in out)) out[k] = v;
  return JSON.stringify(out, null, 2) + '\n';
}
