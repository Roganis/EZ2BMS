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
import { portCannotPlay, type MovieInfo } from '../media/movie';
import { songMeta } from '../song/meta';
import { modeDef } from '../modes/registry';
import { TickConverter } from '../timing/ticks';
import {
  bgmCopies,
  chartFix,
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
  message: string;
  /** The chart's file, for chart findings. */
  chart?: string;
  /** Where to look, in pulses. */
  at?: number;
  notes?: NoteId[];
  /** A change that clears it (lint/fixes.ts): one undo step per chart. */
  fix?: Fix;
}

export interface LintChart {
  file: string;
  data: ChartData;
  mode: ModeId;
  tier: Tier;
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
  const f = (rule: string, severity: Severity, message: string, extra: Partial<Finding> = {}) =>
    out.push({ rule, severity, message, chart: c.file, ...extra });
  const d = c.data;
  const info = d.info;
  const res = info.resolution && info.resolution > 0 ? info.resolution : 240;

  const level = info.level ?? 0;
  if (!(Number.isInteger(level) && level >= 1 && level <= 20)) {
    f('level', 'error', `Level ${level} is outside 1-20, which EZ2PORT's song list uses`, {
      fix: chartFix('clamp-level'),
    });
  }

  // ---- tempo
  const init = info.initBpm ?? 0;
  if (!(init > 0 && init < 1000)) f('bpm', 'error', `Start BPM ${init} must be between 0 and 1000`);
  const tc = new TickConverter(res, d.stopEvents);
  const bpmTicks = new Map<number, number>();
  for (const e of d.bpmEvents) {
    if (!(e.bpm > 0 && e.bpm < 1000))
      f('bpm', 'error', `BPM ${e.bpm} must be between 0 and 1000`, { at: e.y });
    if (e.y <= 0 && e.bpm !== init) {
      f(
        'init-bpm',
        'error',
        `A BPM change at the start (${e.bpm}) disagrees with the start BPM (${init})`,
        { at: 0, fix: chartFix('align-start-bpm') },
      );
    }
    const t = tc.tick(e.y).tick;
    const prev = bpmTicks.get(t);
    if (prev !== undefined && prev !== e.bpm) {
      f('bpm-same-tick', 'error', `Two BPM changes (${prev}, ${e.bpm}) land on the same EZ2 tick`, {
        at: e.y,
      });
    }
    bpmTicks.set(t, e.bpm);
  }
  if (d.stopEvents.some((s) => s.duration > 0)) {
    f(
      'stops',
      'warning',
      `${d.stopEvents.length} STOP${d.stopEvents.length === 1 ? '' : 's'}: EZ2 has none, so EZ2PORT gets a gap in time and the scroll does not freeze`,
      { at: d.stopEvents[0]!.y },
    );
  }

  // ---- notes
  const lanes = new Set(modeDef(c.mode).columns.map((col) => col.x));
  const offMode = d.notes.filter((n) => n.x !== 0 && !lanes.has(n.x));
  if (offMode.length) {
    f(
      'off-mode',
      'warning',
      `${offMode.length} note${offMode.length === 1 ? ' is' : 's are'} on lanes ${modeNames(c.mode).label} does not have; EZ2PORT plays them as background`,
      { at: offMode[0]!.y, notes: offMode.map((n) => n.id), fix: chartFix('off-mode-to-bgm') },
    );
  }
  const playable = d.notes.filter((n) => lanes.has(n.x));
  if (!playable.length) f('empty', 'warning', 'No notes to play in this chart yet');
  if (d.notes.length > MAX_NOTES)
    f('notes-limit', 'error', `${d.notes.length} notes: EZ2PORT holds at most ${MAX_NOTES}`);
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
      `${offGrid.length} note${offGrid.length === 1 ? '' : 's'} between EZ2 ticks (1/48 beat) will be rounded, by up to ${worst.toFixed(2)} tick`,
      { notes: offGrid, fix: chartFix('snap-off-grid') },
    );
  }
  const oddKinds = playable.filter(
    (n) => n.l > 0 && n.kind !== undefined && HOLD_KINDS_OFF_MAX.has(n.kind),
  );
  if (oddKinds.length) {
    f(
      'hold-kind-max',
      'warning',
      `${oddKinds.length} hold${oddKinds.length === 1 ? ' uses a kind' : 's use kinds'} (4, 5, 9-12) the engine counts differently from how it pays: a perfect play will not score exactly 100%`,
      { at: oddKinds[0]!.y, notes: oddKinds.map((n) => n.id) },
    );
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
    f(
      'same-pulse-sound',
      'warning',
      `${dup.length} note${dup.length === 1 ? ' shares' : 's share'} a position with another note of the same sound: the slice that plays is ambiguous`,
      { notes: dup, ...(bgmCopies(d).length ? { fix: chartFix('drop-bgm-copies') } : {}) },
    );
  }
  // Two notes on one lane at one EZ2 tick: the second can never be hit.
  const doubled = laneDuplicates(d, c.mode);
  if (doubled.length)
    f(
      'lane-duplicates',
      'error',
      `${doubled.length} note${doubled.length === 1 ? ' shares' : 's share'} a lane and an EZ2 tick with another: one press cannot hit both`,
      {
        at: doubled[0]!.y,
        notes: doubled.map((n) => n.id),
        fix: chartFix('lane-duplicates-to-bgm'),
      },
    );
  // The engine judges a hold to its end: a note it covers is never reached.
  const swallowed = swallowingHolds(d, c.mode);
  if (swallowed.length)
    f(
      'note-in-hold',
      'error',
      `${swallowed.length} hold${swallowed.length === 1 ? ' covers' : 's cover'} a later note on the same lane`,
      {
        at: swallowed[0]!.hold.y,
        notes: swallowed.flatMap((s) => [s.hold.id, s.first.id]),
        fix: chartFix('shorten-holds'),
      },
    );
  const ups = d.notes.filter((n) => n.up);
  if (ups.length)
    f(
      'up-notes',
      'info',
      `${ups.length} release (up) note${ups.length === 1 ? '' : 's'}: EZ2 has no release sound, they play as ordinary notes`,
      { notes: ups.map((n) => n.id), fix: chartFix('clear-up') },
    );
  // EZ2 draws a bar every 192 ticks; bmson lines are the editor's alone.
  if (oddLines(d))
    f(
      'lines',
      'warning',
      "The chart's bar lines are not every four beats: EZ2PORT draws a line every four beats whatever the chart says",
      { fix: chartFix('lines-4-4') },
    );
  // BMS's own judge and gauge: an EZ2 chart times and fills from its deltas.
  if ((info.judgeRank ?? 100) !== 100 || (info.total ?? 100) !== 100)
    f(
      'bms-judge',
      'info',
      `judge_rank ${info.judgeRank} and total ${info.total} are BMS settings EZ2PORT does not use: its judgement and gauge are set in Chart info`,
    );

  // ---- sounds
  if (d.channels.length > MAX_SLOTS)
    f(
      'slots',
      'error',
      `${d.channels.length} sounds: more than EZ2PORT's ${MAX_SLOTS} keysound slots`,
    );
  else if (d.channels.length > ORIGINAL_SLOTS) {
    f(
      'slots',
      'warning',
      `${d.channels.length} sounds: the original game loads at most ${ORIGINAL_SLOTS} (EZ2PORT is fine)`,
    );
  }
  const unused = unusedSounds(d);
  if (unused.length)
    f(
      'unused-sounds',
      'info',
      `${unused.length} sound${unused.length === 1 ? ' plays' : 's play'} no note in this chart`,
      { fix: chartFix('remove-unused-sounds') },
    );
  if (missing?.size) {
    const used = new Set(d.notes.map((n) => n.ch));
    const bad = d.channels.filter((ch) => used.has(ch.id) && missing.has(ch.name));
    if (bad.length) {
      f(
        'missing-sounds',
        'error',
        `${bad.length} sound${bad.length === 1 ? '' : 's'} used by notes cannot be read: ${bad
          .slice(0, 3)
          .map((b) => b.name)
          .join(', ')}${bad.length > 3 ? '…' : ''}`,
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
      `EZ2PORT's bmson importer would read this chart as ${modeNames(theirs.mode).label}${theirs.keyword ? ` (because of "${theirs.keyword}")` : ''}; Publish writes the package itself, so only a raw bmson dropped into the songs folder is affected`,
    );
  }
  const title = info.title ?? '';
  if (encodeUtf8(title).length > TITLE_BYTES)
    f(
      'title',
      'warning',
      `The title is over ${TITLE_BYTES} bytes; EZ2PORT's song list shows the first ${TITLE_BYTES}`,
    );
  if (title.includes(';'))
    f(
      'title-semicolon',
      'warning',
      "The title contains ';', which song.ini reads as a comment; Publish writes ',' instead",
      { fix: chartFix('title-semicolon') },
    );
  return out;
}

const DERIVE_KEY: Fix = { id: 'derive-key', label: 'Make one from the title' };

export function lintSong(s: LintSong): Finding[] {
  const out: Finding[] = [];
  const f = (rule: string, severity: Severity, message: string, fix?: Fix) =>
    out.push({ rule, severity, message, ...(fix ? { fix } : {}) });
  if (!s.key)
    f(
      'song-key',
      'error',
      'The song needs a key: its folder name in EZ2PORT (1-15 lowercase letters or digits)',
      DERIVE_KEY,
    );
  else if (!isValidSongKey(s.key))
    f(
      'song-key',
      'error',
      `Song key "${s.key}" must be 1-15 lowercase letters or digits`,
      DERIVE_KEY,
    );
  // EZ2PORT imports a raw bmson found in its songs folder as its own package.
  if (s.insideSongsRoot)
    f(
      'inside-songs-root',
      'warning',
      "The song folder is inside EZ2PORT's songs folder: the port would import its bmson files itself, beside what Publish writes",
    );
  if (!s.charts.length) f('no-charts', 'error', 'The song has no charts');
  if (s.charts.length > MAX_CHARTS)
    f('chart-count', 'error', `${s.charts.length} charts: a song holds at most ${MAX_CHARTS}`);
  // Each mode's song list keeps a song only when that mode's NM level is
  // above 0 (ez2/songdb.c ez2_songdb_category_view): the other tiers of a
  // mode without one cannot be reached.
  const listed = (m: ModeId) =>
    s.charts.some((c) => c.mode === m && c.tier === 'NM' && (c.data.info.level ?? 0) >= 1);
  const modes = [...new Set(s.charts.map((c) => c.mode))];
  if (s.charts.length && !modes.some(listed)) {
    f('song-invisible', 'error', 'EZ2PORT only lists a song with an NM chart of level 1 or more');
  } else {
    for (const m of modes.filter((m) => !listed(m) && modeNames(m).portPlayable))
      f(
        'mode-invisible',
        'warning',
        `${modeNames(m).label} charts will not show: EZ2PORT lists a song in a mode only when that mode has an NM chart of level 1 or more`,
      );
  }
  if (s.category !== undefined && validCategory(s.category) === undefined)
    f(
      'category',
      'warning',
      `Category ${JSON.stringify(s.category)} is not one EZ2PORT knows (1-48): the song goes under CUSTOM`,
      { id: 'category-custom', label: 'Make it CUSTOM (48)' },
    );
  else {
    const cat = validCategory(s.category);
    if (cat !== undefined)
      for (const m of unreachableIn(cat))
        if (s.charts.some((c) => c.mode === m))
          f(
            'category-unreachable',
            'warning',
            `${modeNames(m).label} pages past ${categoryLabel(cat)}: its charts cannot be reached there`,
          );
  }
  if (s.art) {
    for (const [what, a] of [
      ['disc', s.art.disc],
      ['eyecatch', s.art.eyecatch],
    ] as const)
      if (a && !a.path)
        f('art-missing', 'error', `The ${what} image ${a.src} is not in the song folder`);
    // The importer says the same of a bmson with no jacket (ez2/bmson.c).
    if (!s.art.disc)
      f('no-disc', 'warning', 'The song has no disc art: its disc on the wheel will be blank');
  }
  if (s.plate) {
    const p = s.plate;
    if (p.image && !p.image.path)
      f('art-missing', 'error', `The title plate image ${p.image.src} is not in the song folder`);
    else if (p.error) f('plate-failed', 'error', `The title plate cannot be made: ${p.error}`);
    if (p.missing.length)
      f(
        'plate-glyphs',
        'warning',
        `The title plate's fonts have no ${p.missing.join(' ')}: they come out as boxes`,
      );
    if (p.text !== undefined && p.text !== p.songTitle)
      f(
        'plate-text',
        'info',
        `The title plate reads "${p.text}"; the song is titled "${p.songTitle}"`,
      );
  }
  if (s.preview) {
    const p = s.preview;
    if (p.file && !p.file.path)
      f('art-missing', 'error', `The preview's audio file ${p.file.src} is not in the song folder`);
    if (!p.file && p.lastNoteMs !== undefined && p.startMs > p.lastNoteMs)
      f(
        'preview-late',
        'warning',
        'The preview starts after the last note: the wheel may loop silence',
      );
  }
  if (s.bga) bgaFindings(s.bga, f);
  const meta = songMeta(s.charts);
  for (const field of meta.differs)
    f(
      'song-meta',
      'warning',
      `The charts have different ${field}s; Publish uses "${meta.values[field]}" (the NM chart's)`,
    );
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
          message: `${c.file} will be saved as ${want} (its mode, key and tier)`,
          chart: c.file,
        });
    }
  const seen = new Set<string>();
  for (const c of s.charts) {
    const k = `${c.mode}.${c.tier}`;
    if (seen.has(k))
      f('duplicate-chart', 'error', `Two charts are ${modeNames(c.mode).label} ${c.tier}`);
    seen.add(k);
    if (!modeNames(c.mode).portPlayable) {
      f(
        'mode-unsupported',
        'error',
        `${modeNames(c.mode).label} cannot be published to EZ2PORT yet (cabinet export only)`,
      );
    }
  }
  for (const c of s.charts) out.push(...lintChart(c, s.missingSounds));
  return out;
}

export const hasErrors = (fs: readonly Finding[]) => fs.some((x) => x.severity === 'error');

function bgaFindings(b: BgaCheck, f: (rule: string, severity: Severity, message: string) => void) {
  if (!b.movie) {
    // The importer's own words (bmson.c): an image or a sequence is not a package BGA.
    f('bga-not-movie', 'warning', `The BGA ${b.src} is not a movie: EZ2PORT shows none for it`);
    return;
  }
  if (!b.path) return f('art-missing', 'error', `The BGA movie ${b.src} is not in the song folder`);
  const m = b.probe;
  if (!m) return;
  if ('error' in m)
    return f('bga-unreadable', 'error', `The BGA ${b.src} cannot be read: ${m.error}`);
  const why = portCannotPlay(m);
  if (why) return f('bga-codec', 'error', `The BGA ${b.src} will not play: ${why}`);
  const [w, h] = [m.width ?? 0, m.height ?? 0];
  // "Cat's rule's bga2.mp4 is 1280x960 H.264 and drew nothing on the
  // cabinet" (thirdparty/fetch-ffmpeg.sh); every frame is converted and
  // uploaded at its own size, and the screen shows 640x480.
  if (w > BGA_MAX_SIDE || h > BGA_MAX_SIDE)
    f(
      'bga-large',
      'warning',
      `The BGA is ${w}x${h}: a 1280x960 movie drew nothing on EZ2PORT's cabinet; 640x480 is all it shows`,
    );
  if (w && h && Math.abs(w / h - 4 / 3) > 0.02)
    f('bga-aspect', 'info', `The BGA is ${w}x${h}: EZ2PORT stretches it to 640x480 (4:3)`);
  if (
    m.durationMs !== null &&
    b.songEndMs !== undefined &&
    b.startMs + m.durationMs < b.songEndMs - 500
  )
    f(
      'bga-short',
      'warning',
      `The BGA ends ${Math.round((b.songEndMs - b.startMs - m.durationMs) / 1000)} s before the song: it does not loop, the screen goes black`,
    );
}
