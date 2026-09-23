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
