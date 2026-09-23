// What happens to the scores players made on a song when it is published
// again. EZ2PORT keeps a user song's ranking tables inside its package folder
// (ez2/ranking.c ez2_ranking_path: `[e_]rank_<Mode>_<key>[-hd|-shd|-ex].bin`,
// the `e_` set being the alternate tables). A chart that did not change keeps
// its tables; a chart that did - its .ez notes or its .ini windows and gauge,
// which decide what a score means - starts empty, as a new chart would.

import { MODES, type ModeId } from '../modes/ids';
import { chartBaseName } from '../modes/filenames';
import type { Tier } from '../model/types';
import type { PackageFile } from './package';

const TIER_OF: Record<string, Tier> = { '': 'NM', '-hd': 'HD', '-shd': 'SHD', '-ex': 'EX' };

export interface RankingFile {
  mode: ModeId;
  tier: Tier;
  alt: boolean;
}

/** A ranking table's mode and tier, when `name` is one of `key`'s. */
export function rankingFile(name: string, key: string): RankingFile | undefined {
  const m = /^(e_)?rank_([^_]+)_(.+?)(-hd|-shd|-ex)?\.bin$/i.exec(name);
  if (!m || m[3]!.toLowerCase() !== key.toLowerCase()) return undefined;
  const mode = MODES.find((x) => x.portName.toLowerCase() === m[2]!.toLowerCase())?.id;
  if (!mode) return undefined;
  return { mode, tier: TIER_OF[(m[4] ?? '').toLowerCase()]!, alt: !!m[1] };
}

const same = (a: Uint8Array | undefined, b: Uint8Array | undefined) =>
  !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * The ranking tables in the old package to carry into the new one: those of
 * charts whose `.ez` and `.ini` come out byte-identical. `old` reads a file
 * of the package now in place (undefined when it has none).
 */
export function keptRankings(o: {
  key: string;
  oldNames: readonly string[];
  old: (name: string) => Uint8Array | undefined;
  files: readonly PackageFile[];
}): string[] {
  const fresh = new Map(o.files.map((f) => [f.path.toLowerCase(), f.bytes]));
  const oldName = (n: string) => o.oldNames.find((x) => x.toLowerCase() === n.toLowerCase());
  const unchanged = (stem: string) =>
    ['.ez', '.ini'].every((ext) => {
      const n = oldName(stem + ext);
      return n !== undefined && same(o.old(n), fresh.get((stem + ext).toLowerCase()));
    });
  return o.oldNames.filter((n) => {
    const r = rankingFile(n, o.key);
    return !!r && unchanged(chartBaseName(r.mode, o.key, r.tier));
  });
}

/** The chart files a ranking decision reads from the old package. */
export function rankedChartFiles(key: string, oldNames: readonly string[]): string[] {
  const want = new Set<string>();
  for (const n of oldNames) {
    const r = rankingFile(n, key);
    if (!r) continue;
    const stem = chartBaseName(r.mode, key, r.tier);
    want.add(`${stem}.ez`);
    want.add(`${stem}.ini`);
  }
  return oldNames.filter((n) => want.has(n.toLowerCase()));
}

export type PackageOwner = 'new' | 'ours' | 'legacy' | 'foreign';

/**
 * Whose package is in the way. `songIni` is the text of the song.ini in the
 * target folder (undefined when the folder has none; `exists` says whether
 * there is a folder at all).
 */
export function packageOwner(
  target: { exists: boolean; songIni?: string | undefined },
  songId: string,
  read: (text: string) => { ez2bms: Record<string, string>; converter: string },
): PackageOwner {
  if (!target.exists) return 'new';
  if (target.songIni === undefined) return 'foreign';
  const r = read(target.songIni);
  const id = Object.entries(r.ez2bms).find(([k]) => k.toLowerCase() === 'songid')?.[1];
  if (id !== undefined) return id === songId ? 'ours' : 'foreign';
  // Published by EZ2BMS before songs had an id.
  return /^EZ2BMS\b/i.test(r.converter) ? 'legacy' : 'foreign';
}
