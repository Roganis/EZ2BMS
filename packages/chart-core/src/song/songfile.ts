// ez2bms.song.json: what a song folder knows beyond its charts - the key
// EZ2PORT files it under, its category, whether it is charted in Classic
// mode, its title plate, disc, eyecatch, preview and BGA movie.
//
// The charts stay complete bmson files; this file only holds what bmson has
// no place for. Like the charts it is kept byte-stable: known members are
// written in a fixed order, members EZ2BMS does not know are kept, in their
// order, after them, and a value that is not what EZ2BMS expects (a category
// of 0, say) is kept as it is and reported rather than silently changed.

import { readBgaSettings, type BgaSettings } from '../publish/bga';
import { readPlateSettings, type PlateSettings } from '../publish/plate';
import { readPreviewSettings, type PreviewSettings } from '../publish/preview';
import { readDiscArt, readEyecatchArt, type DiscArt, type EyecatchArt } from './art';

export interface SongFile {
  /** EZ2PORT's key: the package folder's name (1-15 of a-z, 0-9). */
  key: string;
  /** Identifies this song's packages in a songs folder (set on first publish). */
  id?: string;
  /** The song.ini Category, as stored; `validCategory` says whether the port takes it. */
  category?: unknown;
  /** Classic-mode charting (absent: on when a chart already has continuations). */
  classic?: boolean;
  /** What the title plate says and how it looks (absent: the title in white). */
  plate?: PlateSettings;
  /** The disc's image and crop (absent: the importer's pick from the charts; null: none). */
  disc?: DiscArt | null;
  /** The eyecatch's image and framing (absent: the importer's pick; null: none). */
  eyecatch?: EyecatchArt | null;
  /** What the preview is cut from and where (absent: the importer's pick from the first chart). */
  preview?: PreviewSettings;
  /** The BGA movie and its start (absent: the importer's pick from the charts; null: none). */
  bga?: BgaSettings | null;
  /** Where the song was last published (a key change offers to retire that package). */
  published?: { root: string; key: string };
  /** Members EZ2BMS does not know, in file order. */
  extra: Record<string, unknown>;
}

const KNOWN = [
  'key',
  'id',
  'category',
  'classic',
  'plate',
  'disc',
  'eyecatch',
  'preview',
  'bga',
  'published',
] as const;

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
  if (o.preview !== undefined) {
    const preview = readPreviewSettings(o.preview);
    if (preview) song.preview = preview;
    else {
      warnings.push('preview is not a preview setting EZ2BMS reads; it was kept as it is');
      song.extra.preview = o.preview;
    }
  }
  if (o.bga !== undefined) {
    const bga = readBgaSettings(o.bga);
    if (bga !== undefined) song.bga = bga;
    else {
      warnings.push('bga is not a BGA setting EZ2BMS reads; it was kept as it is');
      song.extra.bga = o.bga;
    }
  }
  if (o.plate !== undefined) {
    const plate = readPlateSettings(o.plate);
    if (plate) song.plate = plate;
    else {
      warnings.push('plate is not a plate setting EZ2BMS reads; it was kept as it is');
      song.extra.plate = o.plate;
    }
  }
  for (const [k, read] of [
    ['disc', readDiscArt],
    ['eyecatch', readEyecatchArt],
  ] as const) {
    if (o[k] === undefined) continue;
    const art = read(o[k]);
    if (art === undefined) {
      warnings.push(`${k} is not an image setting EZ2BMS reads; it was kept as it is`);
      song.extra[k] = o[k];
    } else if (k === 'disc') song.disc = art as DiscArt | null;
    else song.eyecatch = art as EyecatchArt | null;
  }
  const pub = o.published as { root?: unknown; key?: unknown } | undefined;
  if (pub && typeof pub.root === 'string' && typeof pub.key === 'string')
    song.published = { root: pub.root, key: pub.key };
  else if (o.published !== undefined) song.extra.published = o.published;
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
  if (s.plate !== undefined) out.plate = s.plate;
  if (s.disc !== undefined) out.disc = s.disc;
  if (s.eyecatch !== undefined) out.eyecatch = s.eyecatch;
  if (s.preview !== undefined) out.preview = s.preview;
  if (s.bga !== undefined) out.bga = s.bga;
  if (s.published !== undefined) out.published = s.published;
  for (const [k, v] of Object.entries(s.extra)) if (!(k in out)) out[k] = v;
  return JSON.stringify(out, null, 2) + '\n';
}
