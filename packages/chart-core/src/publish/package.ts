// A whole song -> an EZ2PORT package: every file's bytes except the audio,
// plus the list of cuts the audio back end performs (decode, resample to 44.1
// kHz stereo 16-bit, cut, write .ssf).
//
// Package layout (EZ2PORT BMSON.md section 7, ez2/usersongs.c):
//   <songs root>/<key>/song.ini
//                     /<modeprefix>1p-<key>[-hd|-shd|-ex].{ez,ezi,ini}
//                     /<keysound>.ssf ...
//                     /songname.abm (title plate, when given)
//                     /disc.abm, /eyecatch.abm (song art, when given)
//                     /preview.ssf (the wheel's loop, when given: the host renders it)
// Everything is plaintext; EZ2PORT accepts plaintext .ez/.ezi/.ini by content.

import type { ChartData, Tier } from '../model/types';
import { JUDGEMENT_PRESETS, LIFE_PRESETS } from '../model/defaults';
import { encodeUtf8 } from '../io/text';
import { said, sayText } from '../i18n/say';
import { writeEzff } from '../io/ez/ezff';
import { chartBaseName, isValidSongKey } from '../modes/filenames';
import { modeNames, type ModeId } from '../modes/ids';
import { modeDef, type Column } from '../modes/registry';
import { compileChart, type ChartPlan, type SampleLookup } from './chart-plan';
import { KeysoundRegistry, type KeysoundDef } from './keysounds';
import { chartIniText, eziText, songIniText, type Eol } from './text';

export const CONVERTER = 'EZ2BMS 0.1.0';

export interface SongChart {
  data: ChartData;
  mode: ModeId;
  tier: Tier;
  /** Optional: the mode's columns read from the user's .gds. */
  columns?: readonly Column[];
}

export interface SongMeta {
  key: string;
  title: string;
  artist: string;
  genre: string;
  category?: number;
  source?: string;
  /** Title plate, already encoded as .abm (the app renders it). */
  songnameAbm?: Uint8Array;
  /** The disc (256x256) and the eyecatch (1024x512), already encoded as .abm. */
  discAbm?: Uint8Array;
  eyecatchAbm?: Uint8Array;
  /** The package has a preview.ssf (rendered by the host, not in `files`). */
  preview?: boolean;
  bga?: { file: string; startMs: number };
  /** The song's id (ez2bms.song.json), written to song.ini's [EZ2BMS] section. */
  songId?: string;
}

export interface PlannedChart {
  mode: ModeId;
  tier: Tier;
  level: number;
  stem: string;
  plan: ChartPlan;
}

export interface PackageFile {
  /** Path inside the package folder. */
  path: string;
  bytes: Uint8Array;
}

export interface KeysoundJob extends KeysoundDef {
  /** Output file inside the package folder. */
  file: string;
}

export interface PackagePlan {
  key: string;
  charts: PlannedChart[];
  files: PackageFile[];
  keysounds: KeysoundJob[];
  registry: KeysoundRegistry;
}

/** Why a song cannot be published: said in the language chosen, for showing as it is thrown. */
export class PublishError extends Error {}

export interface PublishOptions {
  samples?: SampleLookup;
  eol?: Eol;
}

export function compileSong(
  meta: SongMeta,
  charts: SongChart[],
  opts: PublishOptions = {},
): PackagePlan {
  if (!isValidSongKey(meta.key))
    throw new PublishError(sayText(said('publish.song-key', { key: meta.key })));
  if (!charts.length) throw new PublishError(sayText(said('publish.no-charts')));
  const seen = new Set<string>();
  for (const c of charts) {
    const k = `${c.mode}.${c.tier}`;
    const mode = modeNames(c.mode).label;
    if (seen.has(k))
      throw new PublishError(sayText(said('publish.duplicate-chart', { mode, tier: c.tier })));
    seen.add(k);
    if (!modeNames(c.mode).portPlayable)
      throw new PublishError(sayText(said('publish.mode-unsupported', { mode })));
  }
  const eol = opts.eol ?? '\n';
  const registry = new KeysoundRegistry();
  const planned: PlannedChart[] = [];
  const files: PackageFile[] = [];
  for (const c of charts) {
    const plan = compileChart(c.data, {
      columns: c.columns ?? modeDef(c.mode).columns,
      name: meta.key,
      keysounds: registry,
      ...(opts.samples ? { samples: opts.samples } : {}),
    });
    const stem = chartBaseName(c.mode, meta.key, c.tier);
    const level = Math.round(c.data.info.level ?? 0);
    planned.push({ mode: c.mode, tier: c.tier, level, stem, plan });
    files.push({ path: `${stem}.ez`, bytes: writeEzff(plan.ezff) });
    files.push({
      path: `${stem}.ezi`,
      bytes: encodeUtf8(
        eziText(
          plan.keysoundSlots.map((i) => registry.defs[i]!.name),
          eol,
        ),
      ),
    });
    files.push({
      path: `${stem}.ini`,
      bytes: encodeUtf8(
        chartIniText(
          {
            level,
            judgement: c.data.info.judgementDeltas ?? JUDGEMENT_PRESETS[0]!.deltas,
            life: c.data.info.lifeDeltas ?? LIFE_PRESETS[0]!.deltas,
          },
          eol,
        ),
      ),
    });
  }
  // The names the port's importer gives them (ez2/bmson.c), so a package
  // reads the same whoever made it.
  const assets: { disc?: string; songname?: string; eyecatch?: string; preview?: string } = {};
  if (meta.songnameAbm) {
    files.push({ path: 'songname.abm', bytes: meta.songnameAbm });
    assets.songname = 'songname.abm';
  }
  if (meta.discAbm) {
    files.push({ path: 'disc.abm', bytes: meta.discAbm });
    assets.disc = 'disc.abm';
  }
  if (meta.eyecatchAbm) {
    files.push({ path: 'eyecatch.abm', bytes: meta.eyecatchAbm });
    assets.eyecatch = 'eyecatch.abm';
  }
  if (meta.preview) assets.preview = 'preview.ssf';
  const songIni = songIniText(
    {
      key: meta.key,
      title: meta.title,
      artist: meta.artist,
      genre: meta.genre,
      ...(meta.category !== undefined ? { category: meta.category } : {}),
      ...(meta.source ? { source: meta.source } : {}),
      converter: CONVERTER,
      charts: planned.map((p) => ({
        portMode: modeNames(p.mode).portName,
        tier: p.tier,
        level: p.level,
        stem: p.stem,
      })),
      assets,
      ...(meta.bga ? { bga: meta.bga } : {}),
      ...(meta.songId ? { songId: meta.songId } : {}),
    },
    eol,
  );
  files.unshift({ path: 'song.ini', bytes: encodeUtf8(songIni) });
  return {
    key: meta.key,
    charts: planned,
    files,
    keysounds: registry.defs.map((d) => ({ ...d, file: `${d.name}.ssf` })),
    registry,
  };
}
