// The song's art: which image the disc and the eyecatch are cut from, and how.
//
// The cutting is Rust's (crates/ez2bms-media, a transcription of EZ2PORT's
// importer, ez2/bmson.c write_disc / write_eyecatch); this is the spec it is
// given, the geometry the cropper draws, and the importer's own choice of
// image for a song that names none - so a bmson folder publishes the art the
// port would have made from it.

import type { ChartInfo } from '../model/types';

/** A rectangle of source pixels (after the image's EXIF turn); it may reach past the image. */
export interface ArtCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DiscArt {
  /** Image in the song folder, relative, forward slashes. */
  src: string;
  /** The square cut to the disc (absent: the centred square, as the importer cuts). */
  crop?: ArtCrop;
}

/**
 * `visible`: the 4:3 crop fills what the song-select exit shows (the
 * eyecatch's top-left 640x480) and the image carries on right and down to
 * 1024x512. `stretch`: the whole image squeezed to 1024x512, as the importer
 * does - right for art already made 2:1.
 */
export type EyecatchMode = 'visible' | 'stretch';

export interface EyecatchArt {
  src: string;
  mode: EyecatchMode;
  /** The visible 4:3 part (`visible` only). */
  crop?: ArtCrop;
}

/** What the host cuts (ez2bms-media `ArtJob`, the same JSON). */
export type ArtJob =
  | { kind: 'disc'; crop?: ArtCrop }
  | { kind: 'eyecatch'; mode: 'stretch' }
  | { kind: 'eyecatch'; mode: 'visible'; crop: ArtCrop };

/** The disc file: 256x256, keyed black outside a radius-125 circle round (127.5, 127.5). */
export const DISC_SIZE = 256;
export const DISC_RADIUS = 125;
export const EYECATCH_W = 1024;
export const EYECATCH_H = 512;
/** The part of the eyecatch the 640x480 song-select screen shows. */
export const VISIBLE_W = 640;
export const VISIBLE_H = 480;

/** The importer's disc crop: the centred square as large as the image allows. */
export function centreSquare(w: number, h: number): ArtCrop {
  const s = Math.min(w, h);
  return { x: Math.floor((w - s) / 2), y: Math.floor((h - s) / 2), w: s, h: s };
}

/** The largest centred 4:3 rectangle. */
export function centredVisible(w: number, h: number): ArtCrop {
  const cw = Math.min(w, Math.floor((h * 4) / 3));
  const ch = Math.round((cw * 3) / 4);
  return { x: Math.floor((w - cw) / 2), y: Math.floor((h - ch) / 2), w: cw, h: ch };
}

/**
 * The source pixels the whole 1024x512 eyecatch covers for a `visible` crop:
 * the crop scaled by 1024/640 and 512/480 from its top-left, rounded as
 * ez2bms-media rounds it.
 */
export function eyecatchExtent(c: ArtCrop): ArtCrop {
  return {
    x: c.x,
    y: c.y,
    w: Math.floor((c.w * EYECATCH_W + VISIBLE_W / 2) / VISIBLE_W),
    h: Math.floor((c.h * EYECATCH_H + VISIBLE_H / 2) / VISIBLE_H),
  };
}

/** Art already 2:1 (within a pixel of it) is an eyecatch as it is. */
export function isEyecatchShaped(w: number, h: number): boolean {
  return Math.abs(w - 2 * h) <= 2;
}

/** A newly chosen image's eyecatch: whole when it is already 2:1, else its centred 4:3. */
export function defaultEyecatch(src: string, w: number, h: number): EyecatchArt {
  return isEyecatchShaped(w, h)
    ? { src, mode: 'stretch' }
    : { src, mode: 'visible', crop: centredVisible(w, h) };
}

export function discJob(d: DiscArt): ArtJob {
  return d.crop ? { kind: 'disc', crop: d.crop } : { kind: 'disc' };
}

export function eyecatchJob(e: EyecatchArt): ArtJob {
  return e.mode === 'visible' && e.crop
    ? { kind: 'eyecatch', mode: 'visible', crop: e.crop }
    : { kind: 'eyecatch', mode: 'stretch' };
}

export interface ArtSource {
  /** The image as the song or a chart names it. */
  src: string;
  /** Where it is in the song folder (the name as found there), or undefined when it is not. */
  path: string | undefined;
  job: ArtJob;
  /** Chosen in the song manager, or the importer's pick from a chart's info. */
  from: 'song' | 'chart';
  /** The chart info field it came from (`from: 'chart'`). */
  field?: 'eyecatch_image' | 'title_image' | 'back_image';
}

export interface SongArt {
  disc?: ArtSource;
  eyecatch?: ArtSource;
}

/** The song file's art settings (`null`: none, even when a chart names an image). */
export interface ArtSettings {
  disc?: DiscArt | null;
  eyecatch?: EyecatchArt | null;
}

type ImageField = NonNullable<ArtSource['field']>;
const INFO_FIELD: Record<ImageField, 'eyecatchImage' | 'titleImage' | 'backImage'> = {
  eyecatch_image: 'eyecatchImage',
  title_image: 'titleImage',
  back_image: 'backImage',
};
// The importer's order (ez2/bmson.c, "the song's assets"): the disc from the
// jacket first, the eyecatch from the wide title picture first.
const DISC_ORDER: ImageField[] = ['eyecatch_image', 'title_image', 'back_image'];
const EYECATCH_ORDER: ImageField[] = ['title_image', 'back_image', 'eyecatch_image'];

/**
 * The art a publish uses. The song file's choice wins; without one the
 * importer's: the first of its fields, in its order, naming an image that
 * `find` locates - from the first chart that names one at all (the importer
 * reads the first chart's info). The importer makes an eyecatch only when it
 * made a disc; both look through the same three fields, so that holds here.
 */
export function songArt(
  settings: ArtSettings,
  infos: readonly ChartInfo[],
  find: (name: string) => string | undefined,
): SongArt {
  const out: SongArt = {};
  const info = infos.find((i) => DISC_ORDER.some((f) => i[INFO_FIELD[f]]));
  const fromChart = (order: ImageField[], job: ArtJob): ArtSource | undefined => {
    if (!info) return undefined;
    for (const field of order) {
      const src = info[INFO_FIELD[field]];
      const path = src ? find(src) : undefined;
      if (src && path) return { src, path, job, from: 'chart', field };
    }
    return undefined;
  };
  if (settings.disc) {
    const d = settings.disc;
    out.disc = { src: d.src, path: find(d.src), job: discJob(d), from: 'song' };
  } else if (settings.disc === undefined) {
    const d = fromChart(DISC_ORDER, { kind: 'disc' });
    if (d) out.disc = d;
  }
  if (settings.eyecatch) {
    const e = settings.eyecatch;
    out.eyecatch = { src: e.src, path: find(e.src), job: eyecatchJob(e), from: 'song' };
  } else if (settings.eyecatch === undefined) {
    const e = fromChart(EYECATCH_ORDER, { kind: 'eyecatch', mode: 'stretch' });
    if (e) out.eyecatch = e;
  }
  return out;
}

/** An image name looked up among the song folder's images: exact, then in any case (as EZ2PORT's vfs). */
export function findImage(images: readonly string[], name: string): string | undefined {
  const want = name.replace(/\\/g, '/').replace(/^\.\//, '');
  return (
    images.find((p) => p === want) ?? images.find((p) => p.toLowerCase() === want.toLowerCase())
  );
}

function isCrop(v: unknown): v is ArtCrop {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return (
    Number.isInteger(c.x) &&
    Number.isInteger(c.y) &&
    Number.isInteger(c.w) &&
    Number.isInteger(c.h) &&
    (c.w as number) > 0 &&
    (c.h as number) > 0
  );
}

/** A song file's `disc` member, or undefined when it is not one EZ2BMS reads. */
export function readDiscArt(v: unknown): DiscArt | null | undefined {
  if (v === null) return null;
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.src !== 'string' || !o.src) return undefined;
  if (o.crop === undefined) return { src: o.src };
  if (!isCrop(o.crop) || o.crop.w !== o.crop.h) return undefined;
  return { src: o.src, crop: { x: o.crop.x, y: o.crop.y, w: o.crop.w, h: o.crop.h } };
}

/** A song file's `eyecatch` member, or undefined when it is not one EZ2BMS reads. */
export function readEyecatchArt(v: unknown): EyecatchArt | null | undefined {
  if (v === null) return null;
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.src !== 'string' || !o.src) return undefined;
  if (o.mode === 'stretch' && o.crop === undefined) return { src: o.src, mode: 'stretch' };
  if (o.mode === 'visible' && isCrop(o.crop))
    return {
      src: o.src,
      mode: 'visible',
      crop: { x: o.crop.x, y: o.crop.y, w: o.crop.w, h: o.crop.h },
    };
  return undefined;
}
