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
import type { Finding } from './lint';
import { positionOf } from '../timing/measures';

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
  const f = (x: Finding) => found.push(x);
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  for (const r of plan.refused)
    f({ rule: 'cabinet-table', severity: 'error', message: r.reason, chart: r.chart.file });

  for (const cp of plan.charts) {
    const chart = cp.chart.file;
    const names = modeNames(cp.chart.mode);
    const tierName = `${names.label} ${cp.chart.tier}`;
    const noteY = new Map(cp.chart.data.notes.map((n) => [n.id, n.y]));

    // What the original cannot load.
    for (const file of o.out?.files ?? []) {
      if (file.kind === 'songdb' || ![cp.paths.ez, cp.paths.ezi, cp.paths.ini].includes(file.path))
        continue;
      if (file.bytes.length > CABINET_FILE_MAX)
        f({
          rule: 'cabinet-size',
          severity: 'error',
          chart,
          message: `${file.path.slice(file.path.lastIndexOf('/') + 1)} is ${file.bytes.length} bytes: the original game reads a file into ${CABINET_FILE_MAX} and cannot load it (${Math.round(file.bytes.length / 1024)} KB of 128 KB)`,
        });
    }
    const slots = cp.plan.keysoundSlots.length;
    if (slots > CABINET_SLOTS)
      f({
        rule: 'cabinet-slots',
        severity: 'error',
        chart,
        message: `${slots} keysounds (slices each count): the original game loads at most ${CABINET_SLOTS}`,
      });
    if (!Number.isInteger(cp.level) || cp.level < CABINET_LEVEL.min || cp.level > CABINET_LEVEL.max)
      f({
        rule: 'cabinet-level',
        severity: 'error',
        chart,
        message: `level ${cp.level}: the game's table takes 1-20`,
      });

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
      const first = (c: TrackCut) => {
        const y = noteY.get(c.noteId);
        return y === undefined
          ? ''
          : `, first in measure ${positionOf(y, cp.chart.data.info.resolution || 240).measure}`;
      };
      const tail = unknown ? ` (${plural(unknown, 'sound')} of unknown length not checked)` : '';
      if (ours.length)
        f({
          rule: 'cabinet-voice-backing',
          severity: 'warning',
          chart,
          ...where(ours[0]!),
          notes: ours.map((c) => c.noteId),
          message: `${plural(ours.length, 'background sound')} cut short on the cabinet by the next sound on ${ours.length === 1 ? 'its' : 'their'} track (the original plays one sound per track; EZ2PORT plays both)${first(ours[0]!)}${tail}`,
        });
      if (theirs.length)
        f({
          rule: 'cabinet-voice-backing',
          severity: 'info',
          chart,
          ...where(theirs[0]!),
          notes: theirs.map((c) => c.noteId),
          message: `${plural(theirs.length, 'background sound')} cut by the next on the track, as the game's own chart has ${theirs.length === 1 ? 'it' : 'them'}${first(theirs[0]!)}`,
        });
      if (lane.length)
        f({
          rule: 'cabinet-voice-lane',
          severity: 'info',
          chart,
          ...where(lane[0]!),
          notes: lane.map((c) => c.noteId),
          message: `${plural(lane.length, 'keyed sound')} cut by the lane's next note - on the cabinet in autoplay too, not only when played${first(lane[0]!)}`,
        });
    }
    const cab = cp.plan.cabinet;
    if (cab?.repinned)
      f({
        rule: 'cabinet-tracks',
        severity: 'info',
        chart,
        message: `${plural(cab.repinned, 'background note')} could not stay on the game's track (a lane in ${names.label}) and ${cab.repinned === 1 ? 'was' : 'were'} placed on another`,
      });
    if (cab?.grown)
      f({
        rule: 'cabinet-tracks',
        severity: 'info',
        chart,
        message: `${plural(cab.grown, 'track')} added to the chart so no background sound is cut`,
      });
    if (cab?.kept)
      f({
        rule: 'cabinet-kept',
        severity: 'info',
        chart,
        message: `${plural(cab.kept, 'record')} bmson has no place for (scroll, volume, beats...) written back where the game had ${cab.kept === 1 ? 'it' : 'them'}`,
      });
    if (cab?.nameUnmappable.length)
      f({
        rule: 'cabinet-name',
        severity: 'info',
        chart,
        message: `The chart's header name has characters Korean Windows (CP949) cannot write: ${cab.nameUnmappable.join(' ')} (written as ?)`,
      });
    const records = cp.chart.data.extra.x_ez_records;
    if (Array.isArray(records) && records.length && cp.chart.data.info.resolution !== 240)
      f({
        rule: 'cabinet-records-res',
        severity: 'warning',
        chart,
        message: `The resolution was changed since the import (${cp.chart.data.info.resolution}, not 240): the kept records were not moved with the notes and may land elsewhere`,
      });

    // What changes in the game.
    if (cp.before.level === 0)
      f({
        rule: 'cabinet-tier-new',
        severity: 'info',
        chart,
        message: `${tierName} is new to this song: the game will list it at level ${cp.level}`,
      });
    if (cp.twoP)
      f({
        rule: 'cabinet-2p',
        severity: 'warning',
        chart,
        message: `The game also has a two-player file for ${tierName} (${cp.twoP.slice(cp.twoP.lastIndexOf('/') + 1)}), which stays as it is`,
      });
    if (cp.gdsMissing)
      f({
        rule: 'cabinet-gds',
        severity: 'warning',
        chart,
        message: `The game folder has no ${names.portName}.gds: lanes are placed on EZ2BMS's own tracks for ${names.label}`,
      });
  }

  // The song: whether each mode still lists it, and its keysounds.
  for (const { mode, edits } of plan.songdb) {
    const entry = plan.target.entries[mode]!;
    const nm = edits.find((e) => e.tier === 0)?.level ?? entry.steps[0].level;
    if (nm <= 0)
      f({
        rule: 'cabinet-song-hidden',
        severity: 'warning',
        message: `${modeNames(mode).label}: the game lists a song only when its NM has a level, and ${plan.target.dir} has none there`,
      });
  }
  if (o.names) {
    const missing = [...o.names.entries()].filter(([, n]) => n.missing);
    if (missing.length)
      f({
        rule: 'cabinet-missing-sound',
        severity: 'warning',
        message: `${plural(missing.length, 'keysound')} ${missing.length === 1 ? 'has' : 'have'} no file (${missing
          .slice(0, 5)
          .map(([i]) => plan.registry.defs[i]!.src)
          .join(
            ', ',
          )}${missing.length > 5 ? '...' : ''}): listed, and silent, as the game's own missing sounds are`,
      });
  }
  if (o.converted)
    f({
      rule: 'cabinet-convert',
      severity: 'info',
      message: `${plural(o.converted, 'keysound')} converted to 16-bit 44.1 kHz stereo (the rest go as they are)`,
    });
  return found;
}
