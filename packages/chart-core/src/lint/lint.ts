// Pre-flight checks: what would make EZ2PORT reject, hide or mis-play a song,
// and what will play differently from how it looks in the editor. Errors
// block Publish; warnings and notes are shown.

import { encodeUtf8 } from '../io/text';
import { chartMode, portImporterMode } from '../io/bmson/mode-resolve';
import type { ChartData, NoteId, Tier } from '../model/types';
import { modeNames, type ModeId } from '../modes/ids';
import { chartBaseName, isValidSongKey, parseChartName } from '../modes/filenames';
import type { SongArt } from '../song/art';
import { categoryLabel, unreachableIn, validCategory } from '../song/categories';
import { portCannotPlaySaid, type MovieInfo } from '../media/movie';
import { songMeta } from '../song/meta';
import { modeDef } from '../modes/registry';
import { EZ_SCROLL_MAX, legacyScrollIndices, scrollEventsOf } from '../timing/scroll';
import { TickConverter } from '../timing/ticks';
import { said, sayEnglish, saying, type Said } from '../i18n/say';
import {
  bgmCopies,
  chartFix,
  songFix,
  laneDuplicates,
  oddLines,
  swallowingHolds,
  unusedSounds,
  type Fix,
} from './fixes';

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  rule: string;
  severity: Severity;
  /** In English (the log, the tests); `said` says it in the language chosen (i18n/say.ts). */
  message: string;
  said?: Said;
  /** The chart's file, for chart findings. */
  chart?: string;
  /** Where to look, in pulses. */
  at?: number;
  notes?: NoteId[];
  /** A change that clears it (lint/fixes.ts): one undo step per chart. */
  fix?: Fix;
}

/**
 * Something said about a chart when it was opened or imported: a file read
 * by upgrading or renumbering it, members that could not be read, what an
 * importer could not bring across. Listed with the chart's findings.
 */
export interface OpenNote {
  rule: string;
  severity: Severity;
  /** In English; `said` says it in the language chosen (i18n/say.ts). */
  message: string;
  said?: Said;
  /** Where to look, in pulses. */
  at?: number;
}

export interface LintChart {
  file: string;
  data: ChartData;
  mode: ModeId;
  tier: Tier;
  notes?: readonly OpenNote[];
}

export interface LintSong {
  key: string;
  charts: LintChart[];
  /** The song file's category as stored (absent: CUSTOM). */
  category?: unknown;
  /** Sound names that could not be read (known to the editor, not the chart). */
  missingSounds?: ReadonlySet<string>;
  /** The art a publish would use (song/art.ts songArt); checked when given. */
  art?: SongArt;
  /** The title plate as last rendered; checked when given. */
  plate?: PlateCheck;
  /** The preview's window and source; checked when given. */
  preview?: PreviewCheck;
  /** The BGA movie and what its headers say; checked when given. */
  bga?: BgaCheck;
  /** The song folder lies inside the songs folder it publishes to. */
  insideSongsRoot?: boolean;
  /** What opening or importing the song said about it as a whole (the song file's `source.notes`). */
  notes?: readonly OpenNote[];
}

/** The song's BGA as a publish would use it, and its probe (the host reads the headers). */
export interface BgaCheck {
  src: string;
  path: string | undefined;
  startMs: number;
  /** A movie by its name (the importer keeps nothing else). */
  movie: boolean;
  /** What its headers say; absent until read, or an error when they could not be. */
  probe?: MovieInfo | { error: string };
  /** When the song's last sound ends, ms (the movie should last as long). */
  songEndMs?: number;
}

/** The largest movie EZ2PORT's cabinet has been seen to draw (see the bga-large rule). */
export const BGA_MAX_SIDE = 1024;

export interface PreviewCheck {
  startMs: number;
  /** The chart's last note (a chart's mix). */
  lastNoteMs?: number;
  /** The audio file it is cut from, as named and as found. */
  file?: { src: string; path: string | undefined };
}

/** What rendering the title plate found (the host renders it; lint only reads this). */
export interface PlateCheck {
  /** The song's title, and the title the plate shows (text plates). */
  songTitle: string;
  text?: string;
  /** Characters the fonts have no glyph for. */
  missing: string[];
  /** Why no plate could be made (no CJK font installed, an unreadable image). */
  error?: string;
  /** The plate's own image, as named and as found in the folder. */
  image?: { src: string; path: string | undefined };
}

/** EZ2PORT's limits (ez2/chart.h, ez2/ezi.h) and the original's. */
export const MAX_NOTES = 32768;
export const MAX_SLOTS = 65535;
export const ORIGINAL_SLOTS = 2047;
export const MAX_CHARTS = 16;
export const TITLE_BYTES = 32;

const HOLD_KINDS_OFF_MAX = new Set([4, 5, 9, 10, 11, 12]);

export function lintChart(c: LintChart, missing?: ReadonlySet<string>): Finding[] {
  const out: Finding[] = [];
  const f = (rule: string, severity: Severity, s: Said, extra: Partial<Finding> = {}) =>
    out.push({ rule, severity, message: sayEnglish(s), said: s, chart: c.file, ...extra });
  const d = c.data;
  const info = d.info;
  const res = info.resolution && info.resolution > 0 ? info.resolution : 240;
  for (const n of c.notes ?? [])
    out.push({ ...noteFinding(n), chart: c.file, ...(n.at !== undefined ? { at: n.at } : {}) });

  const level = info.level ?? 0;
  if (!(Number.isInteger(level) && level >= 1 && level <= 20)) {
    f('level', 'error', said('lint.level', { level }), {
      fix: chartFix('clamp-level'),
    });
  }

  // ---- tempo
  const init = info.initBpm ?? 0;
  if (!(init > 0 && init < 1000)) f('bpm', 'error', said('lint.bpm.start', { bpm: init }));
  const tc = new TickConverter(res, d.stopEvents);
  const bpmTicks = new Map<number, number>();
  for (const e of d.bpmEvents) {
    if (!(e.bpm > 0 && e.bpm < 1000))
      f('bpm', 'error', said('lint.bpm', { bpm: e.bpm }), { at: e.y });
    if (e.y <= 0 && e.bpm !== init) {
      f('init-bpm', 'error', said('lint.init-bpm', { bpm: e.bpm, start: init }), {
        at: 0,
        fix: chartFix('align-start-bpm'),
      });
    }
    const t = tc.tick(e.y).tick;
    const prev = bpmTicks.get(t);
    if (prev !== undefined && prev !== e.bpm) {
      f('bpm-same-tick', 'error', said('lint.bpm-same-tick', { a: prev, b: e.bpm }), {
        at: e.y,
      });
    }
    bpmTicks.set(t, e.bpm);
  }
  if (d.stopEvents.some((s) => s.duration > 0)) {
    f('stops', 'warning', said('lint.stops', { n: d.stopEvents.length }), {
      at: d.stopEvents[0]!.y,
    });
  }

  // ---- scroll changes (timing/scroll.ts)
  for (const e of d.scrollEvents)
    if (!(e.rate > 0 && Number.isFinite(e.rate)))
      f('scroll-rate', 'error', said('lint.scroll-rate', { rate: String(e.rate) }), { at: e.y });
  const scrolls = scrollEventsOf(d);
  const scrollTicks = new Map<number, number>();
  for (const e of scrolls) {
    const t = tc.tick(e.y).tick;
    const prev = scrollTicks.get(t);
    if (prev !== undefined && prev !== e.rate)
      f(
        'scroll-same-tick',
        'warning',
        said('lint.scroll-same-tick', { a: String(prev), b: String(e.rate) }),
        { at: e.y },
      );
    scrollTicks.set(t, e.rate);
  }
  if (scrolls.length > EZ_SCROLL_MAX)
    f(
      'scroll-count',
      'warning',
      said('lint.scroll-count', { n: scrolls.length, max: EZ_SCROLL_MAX }),
      { at: scrolls[EZ_SCROLL_MAX]!.y },
    );
  const legacy = legacyScrollIndices(d).length;
  if (legacy)
    f('scroll-legacy', 'info', said('lint.scroll-legacy', { n: legacy }), {
      fix: chartFix('scroll-legacy'),
    });

  // ---- notes
  const lanes = new Set(modeDef(c.mode).columns.map((col) => col.x));
  const offMode = d.notes.filter((n) => n.x !== 0 && !lanes.has(n.x));
  if (offMode.length) {
    f(
      'off-mode',
      'warning',
      said('lint.off-mode', { n: offMode.length, mode: modeNames(c.mode).label }),
      { at: offMode[0]!.y, notes: offMode.map((n) => n.id), fix: chartFix('off-mode-to-bgm') },
    );
  }
  const playable = d.notes.filter((n) => lanes.has(n.x));
  if (!playable.length) f('empty', 'warning', said('lint.empty'));
  if (d.notes.length > MAX_NOTES)
    f('notes-limit', 'error', said('lint.notes-limit', { n: d.notes.length, max: MAX_NOTES }));
  let worst = 0;
  const offGrid: NoteId[] = [];
  for (const n of d.notes) {
    const e = tc.tick(n.y).err;
    if (e > 1e-9) {
      offGrid.push(n.id);
      worst = Math.max(worst, e);
    }
  }
  if (offGrid.length) {
    f(
      'off-grid',
      'warning',
      said('lint.off-grid', { n: offGrid.length, worst: worst.toFixed(2) }),
      { notes: offGrid, fix: chartFix('snap-off-grid') },
    );
  }
  const oddKinds = playable.filter(
    (n) => n.l > 0 && n.kind !== undefined && HOLD_KINDS_OFF_MAX.has(n.kind),
  );
  if (oddKinds.length) {
    f('hold-kind-max', 'warning', said('lint.hold-kind-max', { n: oddKinds.length }), {
      at: oddKinds[0]!.y,
      notes: oddKinds.map((n) => n.id),
    });
  }
  // Same sound twice at one position: which slice plays is ambiguous.
  const seen = new Map<string, NoteId>();
  const dup: NoteId[] = [];
  for (const n of d.notes) {
    const k = `${n.ch}:${n.y}`;
    if (seen.has(k)) dup.push(n.id);
    else seen.set(k, n.id);
  }
  if (dup.length) {
    f('same-pulse-sound', 'warning', said('lint.same-pulse-sound', { n: dup.length }), {
      notes: dup,
      ...(bgmCopies(d).length ? { fix: chartFix('drop-bgm-copies') } : {}),
    });
  }
  // Two notes on one lane at one EZ2 tick: the second can never be hit.
  const doubled = laneDuplicates(d, c.mode);
  if (doubled.length)
    f('lane-duplicates', 'error', said('lint.lane-duplicates', { n: doubled.length }), {
      at: doubled[0]!.y,
      notes: doubled.map((n) => n.id),
      fix: chartFix('lane-duplicates-to-bgm'),
    });
  // The engine judges a hold to its end: a note it covers is never reached.
  const swallowed = swallowingHolds(d, c.mode);
  if (swallowed.length)
    f('note-in-hold', 'error', said('lint.note-in-hold', { n: swallowed.length }), {
      at: swallowed[0]!.hold.y,
      notes: swallowed.flatMap((s) => [s.hold.id, s.first.id]),
      fix: chartFix('shorten-holds'),
    });
  const ups = d.notes.filter((n) => n.up);
  if (ups.length)
    f('up-notes', 'info', said('lint.up-notes', { n: ups.length }), {
      notes: ups.map((n) => n.id),
      fix: chartFix('clear-up'),
    });
  // EZ2 draws a bar every 192 ticks; bmson lines are the editor's alone.
  if (oddLines(d)) f('lines', 'warning', said('lint.lines'), { fix: chartFix('lines-4-4') });
  // BMS's own judge and gauge: an EZ2 chart times and fills from its deltas.
  if ((info.judgeRank ?? 100) !== 100 || (info.total ?? 100) !== 100)
    f(
      'bms-judge',
      'info',
      said('lint.bms-judge', { rank: String(info.judgeRank), total: String(info.total) }),
    );

  // ---- sounds
  if (d.channels.length > MAX_SLOTS)
    f('slots', 'error', said('lint.slots', { n: d.channels.length, max: MAX_SLOTS }));
  else if (d.channels.length > ORIGINAL_SLOTS) {
    f(
      'slots',
      'warning',
      said('lint.slots.original', { n: d.channels.length, max: ORIGINAL_SLOTS }),
    );
  }
  const unused = unusedSounds(d);
  if (unused.length)
    f('unused-sounds', 'info', said('lint.unused-sounds', { n: unused.length }), {
      fix: chartFix('remove-unused-sounds'),
    });
  if (missing?.size) {
    const used = new Set(d.notes.map((n) => n.ch));
    const bad = d.channels.filter((ch) => used.has(ch.id) && missing.has(ch.name));
    if (bad.length) {
      f(
        'missing-sounds',
        'error',
        said('lint.missing-sounds', {
          n: bad.length,
          names: `${bad
            .slice(0, 3)
            .map((b) => b.name)
            .join(', ')}${bad.length > 3 ? '…' : ''}`,
        }),
      );
    }
  }

  // ---- how the port's own importer would read the bmson
  const ours = chartMode(info, c.file)?.mode;
  const theirs = portImporterMode(info, c.file);
  if (theirs && ours && theirs.mode !== ours) {
    f(
      'mode-keyword',
      'warning',
      theirs.keyword
        ? said('lint.mode-keyword.because', {
            mode: modeNames(theirs.mode).label,
            keyword: theirs.keyword,
          })
        : said('lint.mode-keyword', { mode: modeNames(theirs.mode).label }),
    );
  }
  const title = info.title ?? '';
  if (encodeUtf8(title).length > TITLE_BYTES)
    f('title', 'warning', said('lint.title', { max: TITLE_BYTES }));
  if (title.includes(';'))
    f('title-semicolon', 'warning', said('lint.title-semicolon'), {
      fix: chartFix('title-semicolon'),
    });
  return out;
}

const DERIVE_KEY: Fix = songFix('derive-key');

export function lintSong(s: LintSong): Finding[] {
  const out: Finding[] = [];
  const f = (rule: string, severity: Severity, s: Said, fix?: Fix) =>
    out.push({ rule, severity, message: sayEnglish(s), said: s, ...(fix ? { fix } : {}) });
  if (!s.key) f('song-key', 'error', said('lint.song-key.none'), DERIVE_KEY);
  else if (!isValidSongKey(s.key))
    f('song-key', 'error', said('lint.song-key', { key: s.key }), DERIVE_KEY);
  // EZ2PORT imports a raw bmson found in its songs folder as its own package.
  if (s.insideSongsRoot) f('inside-songs-root', 'warning', said('lint.inside-songs-root'));
  if (!s.charts.length) f('no-charts', 'error', said('lint.no-charts'));
  if (s.charts.length > MAX_CHARTS)
    f('chart-count', 'error', said('lint.chart-count', { n: s.charts.length, max: MAX_CHARTS }));
  // Each mode's song list keeps a song only when that mode's NM level is
  // above 0 (ez2/songdb.c ez2_songdb_category_view): the other tiers of a
  // mode without one cannot be reached.
  const listed = (m: ModeId) =>
    s.charts.some((c) => c.mode === m && c.tier === 'NM' && (c.data.info.level ?? 0) >= 1);
  const modes = [...new Set(s.charts.map((c) => c.mode))];
  if (s.charts.length && !modes.some(listed)) {
    f('song-invisible', 'error', said('lint.song-invisible'));
  } else {
    for (const m of modes.filter((m) => !listed(m) && modeNames(m).portPlayable))
      f('mode-invisible', 'warning', said('lint.mode-invisible', { mode: modeNames(m).label }));
  }
  if (s.category !== undefined && validCategory(s.category) === undefined)
    f(
      'category',
      'warning',
      said('lint.category', { category: String(JSON.stringify(s.category)) }),
      songFix('category-custom'),
    );
  else {
    const cat = validCategory(s.category);
    if (cat !== undefined)
      for (const m of unreachableIn(cat))
        if (s.charts.some((c) => c.mode === m))
          f(
            'category-unreachable',
            'warning',
            said('lint.category-unreachable', {
              mode: modeNames(m).label,
              category: categoryLabel(cat),
            }),
          );
  }
  if (s.art) {
    for (const [what, a] of [
      ['disc', s.art.disc],
      ['eyecatch', s.art.eyecatch],
    ] as const)
      if (a && !a.path) f('art-missing', 'error', said(`lint.art-missing.${what}`, { src: a.src }));
    // The importer says the same of a bmson with no jacket (ez2/bmson.c).
    if (!s.art.disc) f('no-disc', 'warning', said('lint.no-disc'));
  }
  if (s.plate) {
    const p = s.plate;
    if (p.image && !p.image.path)
      f('art-missing', 'error', said('lint.art-missing.plate', { src: p.image.src }));
    else if (p.error) f('plate-failed', 'error', said('lint.plate-failed', { error: p.error }));
    if (p.missing.length)
      f('plate-glyphs', 'warning', said('lint.plate-glyphs', { chars: p.missing.join(' ') }));
    if (p.text !== undefined && p.text !== p.songTitle)
      f('plate-text', 'info', said('lint.plate-text', { text: p.text, title: p.songTitle }));
  }
  if (s.preview) {
    const p = s.preview;
    if (p.file && !p.file.path)
      f('art-missing', 'error', said('lint.art-missing.preview', { src: p.file.src }));
    if (!p.file && p.lastNoteMs !== undefined && p.startMs > p.lastNoteMs)
      f('preview-late', 'warning', said('lint.preview-late'));
  }
  if (s.bga) bgaFindings(s.bga, f);
  const meta = songMeta(s.charts);
  for (const field of meta.differs)
    f('song-meta', 'warning', said('lint.song-meta', { field, value: meta.values[field] }));
  // Charts named the port's way (streetmix1p-key-hd) should say what they
  // are: EZ2PORT's own bmson importer reads mode and tier from the name.
  if (isValidSongKey(s.key))
    for (const c of s.charts) {
      const named = parseChartName(c.file);
      if (!named?.mode) continue;
      const want = `${chartBaseName(c.mode, s.key, c.tier)}.bmson`;
      if (c.file.toLowerCase() !== want.toLowerCase())
        out.push({
          rule: 'chart-file-name',
          severity: 'warning',
          ...saying(said('lint.chart-file-name', { file: c.file, want })),
          chart: c.file,
        });
    }
  const seen = new Set<string>();
  for (const c of s.charts) {
    const k = `${c.mode}.${c.tier}`;
    if (seen.has(k))
      f(
        'duplicate-chart',
        'error',
        said('lint.duplicate-chart', { mode: modeNames(c.mode).label, tier: c.tier }),
      );
    seen.add(k);
    if (!modeNames(c.mode).portPlayable) {
      f(
        'mode-unsupported',
        'error',
        said('lint.mode-unsupported', { mode: modeNames(c.mode).label }),
      );
    }
  }
  for (const n of s.notes ?? []) out.push(noteFinding(n));
  for (const c of s.charts) out.push(...lintChart(c, s.missingSounds));
  return out;
}

export const hasErrors = (fs: readonly Finding[]) => fs.some((x) => x.severity === 'error');

/** An opening or import note as a finding: its message as it was made (a stored one may have no key). */
function noteFinding(n: OpenNote): Finding {
  return {
    rule: n.rule,
    severity: n.severity,
    message: n.message,
    ...(n.said ? { said: n.said } : {}),
  };
}

function bgaFindings(b: BgaCheck, f: (rule: string, severity: Severity, s: Said) => void) {
  if (!b.movie) {
    // The importer's own words (bmson.c): an image or a sequence is not a package BGA.
    f('bga-not-movie', 'warning', said('lint.bga-not-movie', { src: b.src }));
    return;
  }
  if (!b.path) return f('art-missing', 'error', said('lint.art-missing.bga', { src: b.src }));
  const m = b.probe;
  if (!m) return;
  if ('error' in m)
    return f(
      'bga-unreadable',
      'error',
      said('lint.bga-unreadable', { src: b.src, error: m.error }),
    );
  const why = portCannotPlaySaid(m);
  if (why) return f('bga-codec', 'error', said('lint.bga-codec', { src: b.src, why }));
  const [w, h] = [m.width ?? 0, m.height ?? 0];
  // "Cat's rule's bga2.mp4 is 1280x960 H.264 and drew nothing on the
  // cabinet" (thirdparty/fetch-ffmpeg.sh); every frame is converted and
  // uploaded at its own size, and the screen shows 640x480.
  if (w > BGA_MAX_SIDE || h > BGA_MAX_SIDE)
    f('bga-large', 'warning', said('lint.bga-large', { w, h }));
  if (w && h && Math.abs(w / h - 4 / 3) > 0.02)
    f('bga-aspect', 'info', said('lint.bga-aspect', { w, h }));
  if (
    m.durationMs !== null &&
    b.songEndMs !== undefined &&
    b.startMs + m.durationMs < b.songEndMs - 500
  )
    f(
      'bga-short',
      'warning',
      said('lint.bga-short', {
        s: Math.round((b.songEndMs - b.startMs - m.durationMs) / 1000),
      }),
    );
}
