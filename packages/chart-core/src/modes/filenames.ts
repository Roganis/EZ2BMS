// Chart file names and song keys, in EZ2PORT's grammar.
//
// The game builds chart paths as `<modename><players>p-<song>[-tier].ez`
// ("%s%dp-%s.ez"; EZ2PORT ez2/mode.c ez2_chart_id_parse splits at the first
// `<digit>p-` and takes the LAST `-` as the tier suffix). The song key is the
// universal id: package folder, chart names, ranking files. It must be short
// ASCII with no dash - EZ2PORT derives one from a folder name by keeping
// letters and digits, lowercased, 15 at most (ez2/bmson.c derive_key).

import type { Tier } from '../model/types';
import { MODES, modeNames, type ModeId } from './ids';

export const TIER_SUFFIX: Record<Tier, string> = { NM: '', HD: '-hd', SHD: '-shd', EX: '-ex' };
export const TIERS: readonly Tier[] = ['NM', 'HD', 'SHD', 'EX'];

export function chartBaseName(mode: ModeId, key: string, tier: Tier): string {
  return `${modeNames(mode).filePrefix}1p-${key}${TIER_SUFFIX[tier]}`;
}

export interface ChartNameInfo {
  mode?: ModeId;
  modeName: string;
  players: number;
  song: string;
  stem: string;
  /** undefined for a radio stage or variant suffix (-r1, -5o1...). */
  tier?: Tier;
}

/** ez2_chart_id_parse, for a base name with or without directory and extension. */
export function parseChartName(path: string): ChartNameInfo | undefined {
  const base = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  const m = /\d[pP]-/.exec(base);
  if (!m || m.index === 0) return undefined;
  const modeName = base.slice(0, m.index);
  const players = Number(base[m.index]);
  let song = base.slice(m.index + 3);
  const dot = song.lastIndexOf('.');
  if (dot >= 0) song = song.slice(0, dot);
  const mode = MODES.find(
    (x) =>
      x.filePrefix === modeName.toLowerCase() ||
      x.portName.toLowerCase() === modeName.toLowerCase(),
  )?.id;
  const dash = song.lastIndexOf('-');
  let tier: Tier | undefined = 'NM';
  let stem = song;
  if (dash >= 0) {
    const suffix = song.slice(dash + 1).toLowerCase();
    tier = suffix === 'hd' ? 'HD' : suffix === 'shd' ? 'SHD' : suffix === 'ex' ? 'EX' : undefined;
    if (tier) stem = song.slice(0, dash);
  }
  const out: ChartNameInfo = { modeName, players, song, stem };
  if (mode) out.mode = mode;
  if (tier) out.tier = tier;
  return out;
}

/** EZ2PORT's derive_key: letters and digits of a name, lowercased, at most 15. */
export function deriveSongKey(name: string): string {
  return name
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase()
    .slice(0, 15);
}

export function isValidSongKey(key: string): boolean {
  return /^[a-z0-9]{1,15}$/.test(key);
}
