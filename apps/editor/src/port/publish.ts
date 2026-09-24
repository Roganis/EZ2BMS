// Publish into the real songs folder, safely: prepared first, written once
// confirmed (the Publish dialog shows the preparation).
//
// Before writing, the target is inspected: a package with the key of a song
// the game ships would take that song over in every mode (every resolver in
// EZ2PORT asks the package first), so that is refused outright; a package
// another tool or song made is only replaced when you say so; the song's own
// earlier publish is simply updated. The replaced package goes to the songs
// folder's .ez2bms-backup (EZ2PORT skips dot-folders). Ranking tables EZ2PORT
// wrote into the package are kept for every chart that did not change.

import {
  decodeAbm,
  keptRankings,
  modeNames,
  packageOwner,
  rankedChartFiles,
  rankingFile,
  readSongIni,
  type Finding,
  type ModeId,
  type PackageOwner,
  type PackagePlan,
  type Tier,
} from '@ez2bms/chart-core';
import { joinPath, type Inspection, type PackageSpec } from '../bridge';
import { t } from '../i18n/i18n.svelte';
import type { App } from '../state/app.svelte';
import { buildPackage } from './package';
import { songFindings } from './lint';

const PUBLISH_RATE = 44100;

/** A package picture, decoded from the very bytes Publish writes. */
export interface Thumb {
  w: number;
  h: number;
  rgba: Uint8Array;
}

export interface ChartRow {
  mode: ModeId;
  tier: Tier;
  label: string;
  level: number;
  file: string;
  /** What EZ2PORT's scores for it become: none yet, kept (unchanged), reset (changed). */
  scores: 'none' | 'kept' | 'reset';
}

/** Everything a publish would do, worked out before anything is written. */
export interface Review {
  root: string;
  key: string;
  seen: Inspection;
  owner: PackageOwner;
  /** What lint still says (nothing that stops a publish). */
  warnings: Finding[];
  spec: PackageSpec;
  plan: PackagePlan;
  charts: ChartRow[];
  /** Ranking tables carried over, and those reset with their changed chart. */
  carry: string[];
  reset: string[];
  art: { plate?: Thumb; disc?: Thumb; eyecatch?: Thumb };
  preview?: { fromMs: number; lengthMs: number; file?: string };
  bga?: { file: string; startMs: number; src: string };
  keysounds: { count: number; bytes: number };
}

function thumb(abm: Uint8Array | undefined): Thumb | undefined {
  if (!abm) return undefined;
  const img = decodeAbm(abm, { colorKey: false });
  return { w: img.width, h: img.height, rgba: img.rgba };
}

/**
 * Work out what publishing to `root` would do: build the package (the art
 * rendered, the preview's job), inspect the target, decide whose it is and
 * which scores survive. Nothing is written.
 */
export async function preparePublish(app: App, root: string): Promise<Review> {
  const p = app.project!;
  // A song id tells this song's packages from anyone else's (song.ini [EZ2BMS]).
  p.sidecar.id ??= crypto.randomUUID();
  const art = await app.art.packageArt(p);
  const previewJob = app.preview.packageJob(p);
  const { spec, plan } = buildPackage(app, { art, preview: previewJob });
  const key = spec.key;
  const seen = await app.backend.port.inspect(root, key, app.settings.data.gameRoot);
  const owner = packageOwner(
    { exists: !!seen.folder, songIni: seen.song_ini ?? undefined },
    p.sidecar.id,
    readSongIni,
  );
  // Which scores still mean the same: those of charts whose .ez and .ini are unchanged.
  const dir = seen.folder ? joinPath(root, seen.folder) : '';
  const old = new Map<string, Uint8Array | undefined>();
  for (const n of rankedChartFiles(key, seen.files))
    old.set(n, await app.backend.readFile(joinPath(dir, n)).catch(() => undefined));
  const carry = keptRankings({
    key,
    oldNames: seen.files,
    old: (n) => old.get(n),
    files: spec.files,
  });
  const reset = seen.files.filter((n) => rankingFile(n, key) && !carry.includes(n));
  const scoresOf = (mode: ModeId, tier: Tier): ChartRow['scores'] => {
    const mine = (names: string[]) =>
      names.some((n) => {
        const r = rankingFile(n, key);
        return r && r.mode === mode && r.tier === tier;
      });
    return mine(carry) ? 'kept' : mine(reset) ? 'reset' : 'none';
  };
  const charts = plan.charts.map((c) => ({
    mode: c.mode,
    tier: c.tier,
    label: `${modeNames(c.mode).label} ${c.tier}`,
    level: c.level,
    file: `${c.stem}.ez`,
    scores: scoresOf(c.mode, c.tier),
  }));
  // Keysounds as the host cuts them: 16-bit stereo at 44.1 kHz.
  let bytes = 0;
  for (const k of plan.keysounds) {
    const total = (app.audio.loadedInfo(k.src)?.seconds ?? 0) * PUBLISH_RATE;
    bytes += 4 * Math.max(0, (k.endFrame ?? total) - k.startFrame) + 44;
  }
  const bgaJob = app.bga.packageJob(p);
  return {
    root,
    key,
    seen,
    owner,
    warnings: songFindings(app).filter((f) => f.severity === 'warning'),
    spec,
    plan,
    charts,
    carry,
    reset,
    art: {
      plate: thumb(art.songnameAbm),
      disc: thumb(art.discAbm),
      eyecatch: thumb(art.eyecatchAbm),
    },
    ...(previewJob
      ? {
          preview: {
            fromMs: previewJob.from_ms,
            lengthMs: previewJob.length_ms,
            ...('file' in previewJob && previewJob.file ? { file: previewJob.file } : {}),
          },
        }
      : {}),
    ...(bgaJob ? { bga: { ...bgaJob.ini, src: bgaJob.copy.from } } : {}),
    keysounds: { count: plan.keysounds.length, bytes },
  };
}

/** Lint errors: nothing is packaged, let alone written, while there are any. */
export function publishErrors(app: App): Finding[] {
  return songFindings(app).filter((f) => f.severity === 'error');
}

/** Why this review cannot be written as it stands, or undefined. */
export function refusal(r: Review): string | undefined {
  if (r.seen.shipped) return t('publish.shipped', { key: r.key });
  return undefined;
}

export interface Written {
  dir: string;
  files: number;
  kept: number;
  reset: number;
  missing: [string, string][];
  /** The song's package under its old key, still on the wheel: offer to take it off. */
  retire?: { key: string; songIni: string };
}

/** Write the reviewed package (the charts are saved first). */
export async function writePublish(app: App, r: Review): Promise<Written> {
  const p = app.project!;
  await p.saveAll();
  const res = await app.backend.port.publish(r.root, r.spec, {
    carry: r.carry,
    expect: { song_ini: r.seen.song_ini },
    backup: true,
  });
  const before = p.sidecar.published;
  p.sidecar.published = { root: r.root, key: r.key };
  await p.saveSidecar();
  const out: Written = {
    dir: res.dir,
    files: res.files,
    kept: r.carry.length,
    reset: r.reset.length,
    missing: res.missing,
  };
  if (before && before.root === r.root && before.key !== r.key) {
    const seen = await app.backend.port.inspect(r.root, before.key, null).catch(() => undefined);
    if (
      seen?.folder &&
      seen.song_ini !== null &&
      packageOwner({ exists: true, songIni: seen.song_ini }, p.sidecar.id!, readSongIni) === 'ours'
    )
      out.retire = { key: before.key, songIni: seen.song_ini };
  }
  return out;
}

/** What a finished publish says: files, and what became of the scores. */
export function writtenText(key: string, w: Written): string {
  const p = { key, files: w.files, dir: w.dir, kept: w.kept, reset: w.reset };
  if (w.kept && w.reset) return t('publish.writtenKeptReset', p);
  if (w.kept) return t('publish.writtenKept', p);
  if (w.reset) return t('publish.writtenReset', p);
  return t('publish.written', p);
}
