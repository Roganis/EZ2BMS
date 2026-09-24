// ez2bms.song.json: what a song folder knows beyond its charts - the key
// EZ2PORT files it under, its category, whether it is charted in Classic
// mode, its title plate, disc, eyecatch, preview and BGA movie.
//
// The charts stay complete bmson files; this file only holds what bmson has
// no place for. Like the charts it is kept byte-stable: known members are
// written in a fixed order, members EZ2BMS does not know are kept, in their
// order, after them, and a value that is not what EZ2BMS expects (a category
// of 0, say) is kept as it is and reported rather than silently changed.

import { said, sayText, type Said } from '../i18n/say';
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
  /** The game song a cabinet export last went into (its folder under sound/), offered next time. */
  cabinet?: { key: string };
  /** What the song was imported from, and what the import could not bring across. */
  source?: ImportSource;
  /** Members EZ2BMS does not know, in file order. */
  extra: Record<string, unknown>;
}

/** Something an import said about a chart (`chart`: its file; '' for the song). */
export interface SourceNote {
  chart: string;
  rule: string;
  severity: 'error' | 'warning' | 'info';
  /** In English, as it was said at import (an older EZ2BMS kept only this). */
  message: string;
  /** Its catalog key and values, to say it in the language chosen (i18n/say.ts). */
  said?: Said;
  /** Where to look, in pulses. */
  at?: number;
}

export interface ImportSource {
  /** `ez2ac` (the game's own charts), `bms`, `bmson`. */
  from: string;
  /** The original song's key (a game song's folder under sound/). */
  key?: string;
  /** The file or folder it was imported from. */
  path?: string;
  /** Each chart's file -> the file it came from. */
  charts?: Record<string, string>;
  /** Shown in Issues with the song until you clear them. */
  notes?: SourceNote[];
}

const SEVERITIES = new Set(['error', 'warning', 'info']);

/** An import source as the song file holds it, or undefined when it is not one. */
function readImportSource(v: unknown): ImportSource | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.from !== 'string') return undefined;
  if (o.key !== undefined && typeof o.key !== 'string') return undefined;
  if (o.path !== undefined && typeof o.path !== 'string') return undefined;
  if (
    o.charts !== undefined &&
    (!o.charts ||
      typeof o.charts !== 'object' ||
      Array.isArray(o.charts) ||
      !Object.values(o.charts).every((x) => typeof x === 'string'))
  )
    return undefined;
  const note = (n: unknown): n is SourceNote => {
    const r = n as Record<string, unknown> | null;
    return (
      !!r &&
      typeof r === 'object' &&
      typeof r.chart === 'string' &&
      typeof r.rule === 'string' &&
      typeof r.message === 'string' &&
      SEVERITIES.has(r.severity as string) &&
      (r.at === undefined || typeof r.at === 'number')
    );
  };
  if (o.notes !== undefined && !(Array.isArray(o.notes) && o.notes.every(note))) return undefined;
  return o as unknown as ImportSource;
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
  'cabinet',
  'source',
] as const;

export function newSongFile(key = ''): SongFile {
  return { key, extra: {} };
}

/**
 * Read the song file. Never throws: a broken file gives an empty song and a
 * warning. Warnings are said in the language chosen, to show as the song opens.
 */
export function parseSongFile(text: string): { song: SongFile; warnings: string[] } {
  const warnings: string[] = [];
  const warn = (s: Said) => warnings.push(sayText(s));
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (e) {
    warn(said('song.file.json', { error: String(e instanceof Error ? e.message : e) }));
    return { song: newSongFile(), warnings };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    warn(said('song.file.not-object'));
    return { song: newSongFile(), warnings };
  }
  const o = raw as Record<string, unknown>;
  const song = newSongFile(typeof o.key === 'string' ? o.key : '');
  if (o.key !== undefined && typeof o.key !== 'string') {
    warn(said('song.file.key'));
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
      warn(said('song.file.preview'));
      song.extra.preview = o.preview;
    }
  }
  if (o.bga !== undefined) {
    const bga = readBgaSettings(o.bga);
    if (bga !== undefined) song.bga = bga;
    else {
      warn(said('song.file.bga'));
      song.extra.bga = o.bga;
    }
  }
  if (o.plate !== undefined) {
    const plate = readPlateSettings(o.plate);
    if (plate) song.plate = plate;
    else {
      warn(said('song.file.plate'));
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
      warn(said('song.file.art', { field: k }));
      song.extra[k] = o[k];
    } else if (k === 'disc') song.disc = art as DiscArt | null;
    else song.eyecatch = art as EyecatchArt | null;
  }
  if (o.source !== undefined) {
    const source = readImportSource(o.source);
    if (source) song.source = source;
    else {
      warn(said('song.file.source'));
      song.extra.source = o.source;
    }
  }
  const pub = o.published as { root?: unknown; key?: unknown } | undefined;
  if (pub && typeof pub.root === 'string' && typeof pub.key === 'string')
    song.published = { root: pub.root, key: pub.key };
  else if (o.published !== undefined) song.extra.published = o.published;
  const cab = o.cabinet as { key?: unknown } | undefined;
  if (cab && typeof cab === 'object' && typeof cab.key === 'string')
    song.cabinet = { key: cab.key };
  else if (o.cabinet !== undefined) song.extra.cabinet = o.cabinet;
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
  if (s.cabinet !== undefined) out.cabinet = s.cabinet;
  if (s.source !== undefined) out.source = s.source;
  for (const [k, v] of Object.entries(s.extra)) if (!(k in out)) out[k] = v;
  return JSON.stringify(out, null, 2) + '\n';
}
