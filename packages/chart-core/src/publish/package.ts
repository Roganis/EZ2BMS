// A whole song -> an EZ2PORT package: every file's bytes except the audio,
// plus the list of cuts the audio back end performs (decode, resample to 44.1
// kHz stereo 16-bit, cut, write .ssf).
//
// Package layout (EZ2PORT BMSON.md section 7, ez2/usersongs.c):
//   <songs root>/<key>/song.ini
//                     /<modeprefix>1p-<key>[-hd|-shd|-ex].{ez,ezi,ini}
//                     /<keysound>.ssf ...
//                     /songname.abm (title plate, when given)
// Everything is plaintext; EZ2PORT accepts plaintext .ez/.ezi/.ini by content.

import type { ChartData, Tier } from '../model/types';
import { JUDGEMENT_PRESETS, LIFE_PRESETS } from '../model/defaults';
import { encodeUtf8 } from '../io/text';
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
  bga?: { file: string; startMs: number };
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
  if (!isValidSongKey(meta.key)) {
    throw new PublishError(`song key "${meta.key}" must be 1-15 lowercase letters or digits`);
  }
  if (!charts.length) throw new PublishError('a song needs at least one chart');
  const seen = new Set<string>();
  for (const c of charts) {
    const k = `${c.mode}.${c.tier}`;
    if (seen.has(k)) throw new PublishError(`two charts are ${modeNames(c.mode).label} ${c.tier}`);
    seen.add(k);
    if (!modeNames(c.mode).portPlayable) {
      throw new PublishError(`${modeNames(c.mode).label} cannot be published to EZ2PORT yet`);
    }
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
  const assets: { songname?: string } = {};
  if (meta.songnameAbm) {
    files.push({ path: 'songname.abm', bytes: meta.songnameAbm });
    assets.songname = 'songname.abm';
  }
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
