// The song's BGA: one movie, song.ini [Bga] File and StartMs. EZ2PORT's
// scene/bga.c shows its frame 0 at StartMs of chart time and draws it behind
// the play field stretched to 640x480, black before and after it (a movie
// never loops), its sound ignored.
//
// A bmson names its movie in bga_header and places it with bga_events; the
// port's importer (ez2/bmson.c) takes the first chart's earliest event and
// the header entry it points at, keeps only a movie file, and writes the
// event's time. Without a choice of its own the song does the same here, so
// a bmson folder publishes the BGA the port would have made from it; the
// song file can name another movie, or move its start.

import type { ChartData } from '../model/types';
import { ChartClock } from './chart-plan';

/** What the importer calls a movie (bmson.c): anything else is not written. */
export const MOVIE_EXTENSIONS = ['mp4', 'webm', 'mkv', 'avi', 'wmv', 'mpg', 'mpeg', 'mov'];

/** Extensions the editor also offers (containers the port's ffmpeg reads under another name). */
export const MOVIE_FILE_EXTENSIONS = [...MOVIE_EXTENSIONS, 'm4v', 'asf'];

export function isMovieName(name: string): boolean {
  const dot = name.lastIndexOf('.');
  return dot >= 0 && MOVIE_FILE_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase());
}

/** The song file's `bga` (null: none, even when a chart names one). */
export interface BgaSettings {
  /** The movie, relative to the song folder (absent: the chart's). */
  file?: string;
  /** Chart milliseconds at which its first frame shows (absent: the chart's first bga event). */
  startMs?: number;
}

export function readBgaSettings(v: unknown): BgaSettings | null | undefined {
  if (v === null) return null;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const out: BgaSettings = {};
  if (o.file !== undefined) {
    if (typeof o.file !== 'string' || !o.file) return undefined;
    out.file = o.file;
  }
  if (o.startMs !== undefined) {
    if (!Number.isInteger(o.startMs)) return undefined;
    out.startMs = o.startMs as number;
  }
  if (Object.keys(o).some((k) => !(k in out))) return undefined;
  return out;
}

/** A chart's movie as the importer reads it: the file its first event shows, and when. */
export interface ChartBga {
  src: string;
  /** Chart milliseconds of that event, rounded (0 when the chart has only a header). */
  startMs: number;
}

/**
 * bmson.c's rule: the event of least y (the first of a tie), the header
 * entry with its id (the last such; the first entry when none has it), the
 * event's time rounded to the millisecond. Timed on the engine's clock -
 * STOPs before it as gaps, f32 tempo - where the importer uses the bmson's
 * double BPMs: the two can differ by a millisecond at a rounding edge, and
 * this one is the clock the notes play on.
 */
export function chartBga(chart: ChartData): ChartBga | undefined {
  const b = chart.bga;
  if (!b) return undefined;
  let first: (typeof b.bga)[number] | undefined;
  for (const e of b.bga) if (!first || e.y < first.y) first = e;
  const want = first ? first.id : -1;
  let name: string | undefined;
  for (const h of b.header) if (name === undefined || h.id === want) name = h.name;
  if (!name) return undefined;
  let startMs = 0;
  if (first) {
    const clock = new ChartClock(chart);
    startMs = Math.floor(clock.msAt(clock.tick(Math.trunc(first.y))) + 0.5);
  }
  return { src: name, startMs };
}

export interface SongBga {
  /** The movie as named. */
  src: string;
  /** Where it is in the song folder (relative), when it is there. */
  path: string | undefined;
  startMs: number;
  /** The song file chose it, or a chart names it. */
  from: 'song' | 'chart';
  /** A movie by its name: the importer keeps nothing else. */
  movie: boolean;
}

/**
 * The movie a publish would use: the song file's, or (without a setting)
 * the first chart naming one, as the importer would. Its start is the song
 * file's, else that chart's event time.
 */
export function songBga(
  settings: BgaSettings | null | undefined,
  charts: readonly ChartData[],
  find: (name: string) => string | undefined,
): SongBga | undefined {
  if (settings === null) return undefined;
  let fromChart: ChartBga | undefined;
  for (const c of charts) if ((fromChart = chartBga(c))) break;
  const src = settings?.file ?? fromChart?.src;
  if (!src) return undefined;
  // A start of its own; else the chart's, when the chart names this movie.
  const startMs =
    settings?.startMs ??
    (fromChart && (!settings?.file || fromChart.src === settings.file) ? fromChart.startMs : 0);
  return {
    src,
    path: find(src),
    startMs,
    from: settings?.file ? 'song' : 'chart',
    movie: isMovieName(src),
  };
}

/**
 * The movie's name in the package: `bga` and its extension, lower case. The
 * port reads song.ini as bytes and finds the file in any case; an ASCII
 * name is the one every build and file system agrees on.
 */
export function packageBgaName(src: string): string {
  const dot = src.lastIndexOf('.');
  return `bga${dot >= 0 ? src.slice(dot).toLowerCase() : ''}`;
}
