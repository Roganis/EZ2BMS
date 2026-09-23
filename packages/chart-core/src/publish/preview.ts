// The song's preview: preview.ssf, what EZ2PORT's song wheel loops while the
// song is highlighted (16-bit stereo, 44.1 kHz; a missing one is silence).
// The wheel restarts it hard at its end and fades nothing, so the fades are
// baked in. The host renders it (crates/ez2bms-audio preview.rs): the chart
// mixed as the engine plays it, then faded and normalised in the port
// importer's own arithmetic (test/preview.oracle.test.ts); or cut from an
// audio file of your own.

/** The importer's preview: 20 seconds, a second's fade at each end. */
export const PREVIEW_MS = 20_000;
export const PREVIEW_FADE_MS = 1_000;
/** A window shorter than this loops too often to listen to; longer, the file only grows. */
export const PREVIEW_MIN_MS = 5_000;
export const PREVIEW_MAX_MS = 30_000;

/** The song file's `preview`: what the preview is cut from, and where. */
export interface PreviewSettings {
  /** The chart whose mix it is (its file name; absent: the song's first chart). */
  chart?: string;
  /** An audio file in the song folder to cut it from instead of a mix. */
  file?: string;
  /** Where it starts, ms into the song or the file (absent: the importer's pick). */
  startMs?: number;
  lengthMs?: number;
  fadeMs?: number;
}

export interface PreviewWindow {
  startMs: number;
  lengthMs: number;
  fadeMs: number;
}

/**
 * The importer's pick (ez2/bmson.c write_preview): the first note at or after
 * a quarter of the way from the first note to the last. `noteMs` are the
 * chart's note times, in any order.
 */
export function defaultPreviewStart(noteMs: readonly number[]): number {
  if (!noteMs.length) return 0;
  const sorted = [...noteMs].sort((a, b) => a - b);
  const first = sorted[0]!;
  const want = first + (sorted[sorted.length - 1]! - first) * 0.25;
  return sorted.find((t) => t >= want) ?? first;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The window a setting means, with the defaults filled in and kept in range. */
export function previewWindow(s: PreviewSettings, noteMs: readonly number[]): PreviewWindow {
  const lengthMs = Math.round(clamp(s.lengthMs ?? PREVIEW_MS, PREVIEW_MIN_MS, PREVIEW_MAX_MS));
  return {
    startMs: Math.max(0, Math.round(s.startMs ?? (s.file ? 0 : defaultPreviewStart(noteMs)))),
    lengthMs,
    fadeMs: Math.round(clamp(s.fadeMs ?? PREVIEW_FADE_MS, 0, lengthMs / 2)),
  };
}

/** A song file's `preview` member, or undefined when it is not one EZ2BMS reads. */
export function readPreviewSettings(v: unknown): PreviewSettings | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const out: PreviewSettings = {};
  for (const k of ['chart', 'file'] as const) {
    if (o[k] === undefined) continue;
    if (typeof o[k] !== 'string' || !o[k]) return undefined;
    out[k] = o[k];
  }
  for (const k of ['startMs', 'lengthMs', 'fadeMs'] as const) {
    if (o[k] === undefined) continue;
    if (typeof o[k] !== 'number' || !Number.isFinite(o[k]) || o[k] < 0) return undefined;
    out[k] = o[k];
  }
  if (Object.keys(o).some((k) => !(k in out))) return undefined;
  return out;
}
