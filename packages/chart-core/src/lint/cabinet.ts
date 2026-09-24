// What a cabinet export (publish/cabinet.ts) needs said before it writes into
// the game: what the original executable cannot load, what it plays
// differently from EZ2PORT, and what the export changes in the game's own
// tables. Shown in the export dialog, not in Issues - these depend on the
// song it goes into, the executable's tables and the samples' lengths, none
// of which the chart knows. Errors stop the export.
//
// Where each limit comes from (none of it can be checked against the
// original executable itself, which is not in the oracle):
// - 131068 bytes a file: the original decrypts a file in one stack frame of
//   header[128], data[131072], out[131068] (EZ2PORT ez2/crypt.c);
// - 2047 keysound slots: its table is 0x800 entries and slot 0 is never used
//   (ez2/ezi.h EZ2_EZI_SLOTS_ORIGINAL);
// - one voice per track: its sound entries are indexed by the chart track
//   (EZ2PORT reference/play.c), so a sound still ringing when the next record
//   on its track plays is cut there. EZ2PORT keeps a voice per keysound.

import type { NoteId } from '../model/types';
import type { ChartPlan, SampleLookup } from '../publish/chart-plan';
import type { CabinetOutput, CabinetPlan, SoundNaming } from '../publish/cabinet';
import { OUT_RATE, type KeysoundRegistry } from '../publish/keysounds';
import { modeNames } from '../modes/ids';
import { said, saying, type Said } from '../i18n/say';
import type { Finding, Severity } from './lint';
import { positionOf } from '../timing/measures';
import { TickConverter } from '../timing/ticks';

export const CABINET_FILE_MAX = 131068;
export const CABINET_SLOTS = 2047;
export const CABINET_LEVEL = { min: 1, max: 20 } as const;

export interface TrackCut {
  track: number;
  tick: number;
  /** The note whose sound is cut. */
  noteId: NoteId;
  /** How much of it is lost, ms. */
  cutMs: number;
  lane: boolean;
  /** Both it and the sound that cuts it are on the track the game had them on. */
  original: boolean;
}

/**
 * Where the cabinet's one voice per track cuts a sound short: each record's
 * sound (its keysound file's length - a slice's own, a whole sample's from
 * `samples`) against the next record on its track. Sounds whose length is
 * not known are counted, not guessed.
 */
export function trackCuts(
  plan: ChartPlan,
  registry: KeysoundRegistry,
  samples: SampleLookup,
  pinned: (noteId: NoteId, track: number) => boolean = () => false,
): { cuts: TrackCut[]; unknown: number } {
  const byTrack = new Map<number, ChartPlan['events']>();
  for (const e of plan.events) {
    const l = byTrack.get(e.track);
    if (l) l.push(e);
    else byTrack.set(e.track, [e]);
  }
  const cuts: TrackCut[] = [];
  let unknown = 0;
  for (const [track, evs] of byTrack) {
    // Plan order already: by tick, then lane, then note.
    for (let i = 0; i + 1 < evs.length; i++) {
      const e = evs[i]!;
      const next = evs[i + 1]!;
      const def = registry.defs[e.keysound]!;
      let frames: number | undefined;
      if (def.endFrame !== null) frames = def.endFrame - def.startFrame;
      else {
        const f = samples(def.src)?.frames;
        if (f !== undefined) frames = Math.max(0, f - def.startFrame);
      }
      if (frames === undefined) {
        unknown++;
        continue;
      }
      const end = e.ms + (frames * 1000) / OUT_RATE;
      if (end > next.ms + 0.5)
        cuts.push({
          track,
          tick: e.tick,
          noteId: e.noteId,
          cutMs: end - next.ms,
          lane: e.lane,
          original: pinned(e.noteId, track) && pinned(next.noteId, track),
        });
    }
  }
  cuts.sort((a, b) => a.tick - b.tick || a.track - b.track);
  return { cuts, unknown };
}

export interface CabinetLintOptions {
  /** The bytes, once finished: their sizes are checked. */
  out?: CabinetOutput;
  /** Keysound files, once named: missing sources are said. */
  names?: ReadonlyMap<number, SoundNaming>;
  samples?: SampleLookup;
  /** Keysounds the host cuts at 44.1 kHz rather than rewrapping as they are. */
  converted?: number;
}

export function lintCabinet(plan: CabinetPlan, o: CabinetLintOptions = {}): Finding[] {
  const found: Finding[] = [];
  const f = (rule: string, severity: Severity, s: Said, extra: Partial<Finding> = {}) =>
    found.push({ rule, severity, ...saying(s), ...extra });

  for (const r of plan.refused) f('cabinet-table', 'error', r.said, { chart: r.chart.file });

  for (const cp of plan.charts) {
    const chart = cp.chart.file;
    const names = modeNames(cp.chart.mode);
    const tier = { mode: names.label, tier: cp.chart.tier };
    const noteY = new Map(cp.chart.data.notes.map((n) => [n.id, n.y]));

    // What the original cannot load.
    for (const file of o.out?.files ?? []) {
      if (file.kind === 'songdb' || ![cp.paths.ez, cp.paths.ezi, cp.paths.ini].includes(file.path))
        continue;
      if (file.bytes.length > CABINET_FILE_MAX)
        f(
          'cabinet-size',
          'error',
          said('cabinet.size', {
            file: file.path.slice(file.path.lastIndexOf('/') + 1),
            bytes: file.bytes.length,
            max: CABINET_FILE_MAX,
            kb: Math.round(file.bytes.length / 1024),
          }),
          { chart },
        );
    }
    const slots = cp.plan.keysoundSlots.length;
    if (slots > CABINET_SLOTS)
      f('cabinet-slots', 'error', said('cabinet.slots', { n: slots, max: CABINET_SLOTS }), {
        chart,
      });
    if (!Number.isInteger(cp.level) || cp.level < CABINET_LEVEL.min || cp.level > CABINET_LEVEL.max)
      f('cabinet-level', 'error', said('cabinet.level', { level: cp.level }), { chart });

    // What the original plays differently.
    if (o.samples) {
      const gameTrack = new Map(cp.chart.data.notes.map((n) => [n.id, n.extra?.x_track]));
      const pinned = (id: NoteId, track: number) => gameTrack.get(id) === track;
      const { cuts, unknown } = trackCuts(cp.plan, plan.registry, o.samples, pinned);
      const lane = cuts.filter((c) => c.lane);
      const ours = cuts.filter((c) => !c.lane && !c.original);
      const theirs = cuts.filter((c) => !c.lane && c.original);
      const where = (c: TrackCut) => {
        const y = noteY.get(c.noteId);
        return y === undefined ? {} : { at: y };
      };
      // What is said of a list of cuts: how many, and the measure of the
      // first when its note is still in the chart (the key's `.measure` form).
      const cutSaid = (
        key: 'cabinet.voice-cut' | 'cabinet.voice-game' | 'cabinet.voice-lane',
        list: TrackCut[],
        more: Record<string, number> = {},
      ): Said => {
        const y = noteY.get(list[0]!.noteId);
        const params = { n: list.length, ...more };
        if (y === undefined) return said(key, params);
        const measure = positionOf(y, cp.chart.data.info.resolution || 240).measure;
        return said(`${key}.measure`, { ...params, measure });
      };
      if (ours.length)
        f('cabinet-voice-backing', 'warning', cutSaid('cabinet.voice-cut', ours, { unknown }), {
          chart,
          ...where(ours[0]!),
          notes: ours.map((c) => c.noteId),
        });
      if (theirs.length)
        f('cabinet-voice-backing', 'info', cutSaid('cabinet.voice-game', theirs), {
          chart,
          ...where(theirs[0]!),
          notes: theirs.map((c) => c.noteId),
        });
      if (lane.length)
        f('cabinet-voice-lane', 'info', cutSaid('cabinet.voice-lane', lane), {
          chart,
          ...where(lane[0]!),
          notes: lane.map((c) => c.noteId),
        });
    }
    const cab = cp.plan.cabinet;
    if (cab?.repinned)
      f(
        'cabinet-tracks',
        'info',
        said('cabinet.repinned', { n: cab.repinned, mode: names.label }),
        { chart },
      );
    if (cab?.grown) f('cabinet-tracks', 'info', said('cabinet.grown', { n: cab.grown }), { chart });
    if (cab?.kept) f('cabinet-kept', 'info', said('cabinet.kept', { n: cab.kept }), { chart });
    if (cab?.nameUnmappable.length)
      f('cabinet-name', 'info', said('cabinet.name', { chars: cab.nameUnmappable.join(' ') }), {
        chart,
      });
    // A change of resolution moves the kept records with the notes
    // (timing/rescale.ts); one set by hand does not, and leaves them between
    // ticks, where the export can only round them.
    const records = cp.chart.data.extra.x_ez_records;
    if (Array.isArray(records) && records.length) {
      const d = cp.chart.data;
      const tc = new TickConverter(d.info.resolution ?? 240, d.stopEvents);
      const off = records.filter(
        (r) =>
          !!r &&
          typeof r === 'object' &&
          typeof (r as { y?: unknown }).y === 'number' &&
          tc.tick((r as { y: number }).y).err > 1e-9,
      ).length;
      if (off)
        f('cabinet-records-res', 'warning', said('cabinet.records-res', { n: off }), { chart });
    }

    // What changes in the game.
    if (cp.before.level === 0)
      f('cabinet-tier-new', 'info', said('cabinet.tier-new', { ...tier, level: cp.level }), {
        chart,
      });
    if (cp.twoP)
      f(
        'cabinet-2p',
        'warning',
        said('cabinet.2p', { ...tier, file: cp.twoP.slice(cp.twoP.lastIndexOf('/') + 1) }),
        { chart },
      );
    if (cp.gdsMissing)
      f(
        'cabinet-gds',
        'warning',
        said('cabinet.gds', { file: `${names.portName}.gds`, mode: names.label }),
        { chart },
      );
  }

  // The song: whether each mode still lists it, and its keysounds.
  for (const { mode, edits } of plan.songdb) {
    const entry = plan.target.entries[mode]!;
    const nm = edits.find((e) => e.tier === 0)?.level ?? entry.steps[0].level;
    if (nm <= 0)
      f(
        'cabinet-song-hidden',
        'warning',
        said('cabinet.song-hidden', { mode: modeNames(mode).label, song: plan.target.dir }),
      );
  }
  if (o.names) {
    const missing = [...o.names.entries()].filter(([, n]) => n.missing);
    if (missing.length) {
      const names = missing
        .slice(0, 5)
        .map(([i]) => plan.registry.defs[i]!.src)
        .join(', ');
      f(
        'cabinet-missing-sound',
        'warning',
        said('cabinet.missing-sound', {
          n: missing.length,
          names: `${names}${missing.length > 5 ? '...' : ''}`,
        }),
      );
    }
  }
  if (o.converted) f('cabinet-convert', 'info', said('cabinet.convert', { n: o.converted }));
  return found;
}
