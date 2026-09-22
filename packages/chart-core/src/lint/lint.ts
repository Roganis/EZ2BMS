// Pre-flight checks: what would make EZ2PORT reject, hide or mis-play a song,
// and what will play differently from how it looks in the editor. Errors
// block Publish; warnings and notes are shown.

import { encodeUtf8 } from '../io/text';
import { chartMode, portImporterMode } from '../io/bmson/mode-resolve';
import type { ChartData, NoteId, Tier } from '../model/types';
import { modeNames, type ModeId } from '../modes/ids';
import { isValidSongKey } from '../modes/filenames';
import { modeDef } from '../modes/registry';
import { TickConverter } from '../timing/ticks';

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
  /** Sound names that could not be read (known to the editor, not the chart). */
  missingSounds?: ReadonlySet<string>;
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
    f('level', 'error', `Level ${level} is outside 1-20, which EZ2PORT's song list uses`);
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
        { at: 0 },
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
      { at: offMode[0]!.y, notes: offMode.map((n) => n.id) },
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
      { notes: offGrid },
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
      `${dup.length} note${dup.length === 1 ? '' : 's'} share a position with another note of the same sound: the slice that plays is ambiguous`,
      {
        notes: dup,
      },
    );
  }
  const ups = d.notes.filter((n) => n.up);
  if (ups.length)
    f(
      'up-notes',
      'info',
      `${ups.length} release (up) note${ups.length === 1 ? '' : 's'}: EZ2 has no release sound, they play as ordinary notes`,
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
      'title',
      'warning',
      "The title contains ';', which song.ini reads as a comment; Publish writes ',' instead",
    );
  return out;
}

export function lintSong(s: LintSong): Finding[] {
  const out: Finding[] = [];
  const f = (rule: string, severity: Severity, message: string) =>
    out.push({ rule, severity, message });
  if (!s.key)
    f(
      'song-key',
      'error',
      'The song needs a key: its folder name in EZ2PORT (1-15 lowercase letters or digits)',
    );
  else if (!isValidSongKey(s.key))
    f('song-key', 'error', `Song key "${s.key}" must be 1-15 lowercase letters or digits`);
  if (!s.charts.length) f('no-charts', 'error', 'The song has no charts');
  if (s.charts.length > MAX_CHARTS)
    f('chart-count', 'error', `${s.charts.length} charts: a song holds at most ${MAX_CHARTS}`);
  const nm = s.charts.some((c) => c.tier === 'NM' && (c.data.info.level ?? 0) >= 1);
  if (s.charts.length && !nm) {
    f('song-invisible', 'error', 'EZ2PORT only lists a song with an NM chart of level 1 or more');
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
