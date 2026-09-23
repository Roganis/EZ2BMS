// The title plate: songname.abm, the 256x32 title EZ2PORT's song wheel and
// result screen show - the port never draws song.ini's Title as text, so the
// plate IS the title. A plate is a spec - lines of text, each with its place,
// capital height, face and colour, in the form of EZ2PORT's text manifest
// (TEXT.md s3) - and the host renders it (crates/ez2bms-media text.rs),
// byte for byte as the port's own ez2_textspec_render does
// (test/plate.oracle.test.ts).

export const PLATE_W = 256;
export const PLATE_H = 32;

export type PlateAlign = 'right' | 'center' | 'left';
/** Roboto Bold; a line with CJK words in it is set in the CJK face whatever it says. */
export type PlateFace = 'bold' | 'cjkbold';
/** Which forms of the shared ideographs CJK lines take (Noto Sans CJK's faces; EZ2PORT's `@cjk`). */
export type CjkForms = 'jp' | 'kr' | 'sc' | 'tc' | 'hk';

export interface PlateLine {
  text: string;
  /** The anchor column: the ink ends there (right), is centred on it, or starts there (left). */
  x: number;
  /** The row the capitals sit on. */
  baseline: number;
  /** Capital height, pixels. */
  cap: number;
  face: PlateFace;
  /** `rrggbb`. */
  ink: string;
  /** `rrggbb`: a three-pixel halo round the ink. */
  glow?: string;
  align: PlateAlign;
  /** A wider line is condensed sideways to this (0: no cap). */
  maxWidth: number;
  /** Sheared 12 degrees about the baseline. */
  oblique?: boolean;
}

export interface PlateSpec {
  w: number;
  h: number;
  lines: PlateLine[];
  cjk?: CjkForms;
}

export interface PlateTint {
  id: string;
  label: string;
  ink: string;
  glow?: string;
}

/**
 * The colours the shipped plates carry by version (TEXT.md s7, measured
 * from the game's own plates): white; solid green, the 12th's; solid cyan;
 * white in an orange halo, the 11th's; white in a cyan halo, the 15th's.
 */
export const PLATE_TINTS: readonly PlateTint[] = [
  { id: 'white', label: 'White', ink: 'ffffff' },
  { id: 'green', label: 'Green (12th)', ink: '00f283' },
  { id: 'cyan', label: 'Cyan', ink: '46e1ff' },
  { id: 'orange-halo', label: 'Orange halo (11th)', ink: 'ffffff', glow: 'eb4800' },
  { id: 'cyan-halo', label: 'Cyan halo (15th)', ink: 'ffffff', glow: '42d3ef' },
];

/** The shipped subtitles' grey. */
export const SUBTITLE_INK = 'c5c5c5';

/**
 * The CJK forms a title most likely wants: kana means Japanese; otherwise
 * Korean, the game's own language (a Chinese title should say which).
 */
export function guessCjkForms(text: string): CjkForms {
  return /[぀-ヿㇰ-ㇿｦ-ﾝ]/u.test(text) ? 'jp' : 'kr';
}

/**
 * A title plate laid out as the shipped ones are (TEXT.md s7): the title's
 * ink ending at column 246, condensed to the plate's 236 px of room when
 * longer; alone on baseline 22 with capitals 9 tall, or on 15 (capitals 7)
 * over a subtitle on 27 (capitals 6) in grey. The port's own importer puts
 * a title on 23 and scales a long one down both ways; 22 lines the plate up
 * with the game's titles on the same wheel (docs/ez2port-compat.md).
 */
export function titlePlate(
  title: string,
  subtitle = '',
  tint: PlateTint = PLATE_TINTS[0]!,
  cjk?: CjkForms,
): PlateSpec {
  const line = (text: string, baseline: number, cap: number, ink: string, glow?: string) => ({
    text,
    x: 246,
    baseline,
    cap,
    face: 'bold' as const,
    ink,
    ...(glow ? { glow } : {}),
    align: 'right' as const,
    maxWidth: 236,
  });
  const lines = subtitle.trim()
    ? [
        line(title, 15, 7, tint.ink, tint.glow),
        // A subtitle keeps its own grey, without the title's halo.
        line(subtitle, 27, 6, SUBTITLE_INK),
      ]
    : [line(title, 22, 9, tint.ink, tint.glow)];
  return {
    w: PLATE_W,
    h: PLATE_H,
    lines,
    cjk: cjk ?? guessCjkForms(`${title}${subtitle}`),
  };
}

/**
 * The song file's `plate`: what the title plate says and how it looks.
 * Everything is optional - an empty plate setting is the song's own title
 * (and subtitle) in white.
 */
export interface PlateSettings {
  /** Words other than the song's title (absent: the title). */
  title?: string;
  /** Absent: the song's subtitle. Empty: none. */
  subtitle?: string;
  /** A PLATE_TINTS id; `custom` takes `ink` and `glow`. Absent: white. */
  tint?: string;
  ink?: string;
  glow?: string;
  /** Absent: guessed from the words (guessCjkForms). */
  cjk?: CjkForms;
  /** An image in the song folder used instead of text: fit to 256x32, black is see-through. */
  image?: string;
}

const HEX = /^[0-9a-f]{6}$/;
const FORMS: readonly CjkForms[] = ['jp', 'kr', 'sc', 'tc', 'hk'];

/** The tint a setting names (a custom one from its colours; white when unknown). */
export function plateTint(s: PlateSettings): PlateTint {
  if (s.tint === 'custom' && s.ink && HEX.test(s.ink))
    return {
      id: 'custom',
      label: 'Custom',
      ink: s.ink,
      ...(s.glow && HEX.test(s.glow) ? { glow: s.glow } : {}),
    };
  return PLATE_TINTS.find((t) => t.id === s.tint) ?? PLATE_TINTS[0]!;
}

/** The words a plate shows, from its setting and the song's info. */
export function plateText(
  s: PlateSettings,
  song: { title: string; subtitle: string },
): { title: string; subtitle: string } {
  return { title: s.title ?? song.title, subtitle: s.subtitle ?? song.subtitle };
}

/** The spec a text plate renders from (not used when the setting names an image). */
export function plateSpecFor(
  s: PlateSettings,
  song: { title: string; subtitle: string },
): PlateSpec {
  const t = plateText(s, song);
  return titlePlate(t.title, t.subtitle, plateTint(s), s.cjk);
}

/** A song file's `plate` member, or undefined when it is not one EZ2BMS reads. */
export function readPlateSettings(v: unknown): PlateSettings | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const out: PlateSettings = {};
  for (const k of ['title', 'subtitle', 'tint', 'image'] as const) {
    if (o[k] === undefined) continue;
    if (typeof o[k] !== 'string') return undefined;
    out[k] = o[k];
  }
  for (const k of ['ink', 'glow'] as const) {
    if (o[k] === undefined) continue;
    if (typeof o[k] !== 'string' || !HEX.test(o[k])) return undefined;
    out[k] = o[k];
  }
  if (o.cjk !== undefined) {
    if (!FORMS.includes(o.cjk as CjkForms)) return undefined;
    out.cjk = o.cjk as CjkForms;
  }
  // Anything else in it is not ours to drop: the whole member is kept as is.
  if (Object.keys(o).some((k) => !(k in out))) return undefined;
  return out;
}

/**
 * Words the Latin face does not have - CJK ideographs, kana, hangul, CJK
 * punctuation, full-width forms - which the renderer sets in the CJK face
 * (ez2/textspec.c has_cjk, the same ranges).
 */
export function hasCjk(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (
      (c >= 0x1100 && c < 0x1200) ||
      (c >= 0x2e80 && c < 0xa000) ||
      (c >= 0xac00 && c < 0xd7b0) ||
      (c >= 0xf900 && c < 0xfb00) ||
      (c >= 0xff00 && c < 0xfff0) ||
      c >= 0x20000
    )
      return true;
  }
  return false;
}
