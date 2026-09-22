// Which EZ2 mode and tier a bmson is - two answers, on purpose.
//
// EZ2BMS reads its own dialect literally: `mode_hint` names the mode and
// `x_tier` the tier. EZ2PORT's importer (ez2/bmson.c detect_mode/detect_tier)
// reads them differently - keywords in chart_name and the file name come
// FIRST and beat mode_hint - so a chart called "Streetlife" in a clubmix file
// is still ClubMix, but one called "Space Street" in a streetmix file becomes
// SpaceMix. Both answers are computed so lint can say when they disagree.

import type { ChartInfo, Tier } from '../../model/types';
import { MODES, modeFromHint, type ModeId } from '../../modes/ids';

/** Port keyword table, in the port's order (first match wins). */
const PORT_KEYWORDS: readonly (readonly [string, ModeId])[] = [
  ['7street', '7k'],
  ['7radio', '7k'],
  ['space', '14k'],
  ['club', '10k'],
  ['10radio', '10k'],
  ['ruby', 'ruby'],
  ['5radio', '5k'],
  ['street', '5k'],
  ['scratch', 'scratch'],
  ['5key', '5k-only'],
];

/** The seven hints the port's importer accepts (ez2/bmson.c kModes). */
const PORT_HINTS = new Set(MODES.filter((m) => m.portPlayable).map((m) => m.hint));

/** Legacy BMS-numbered hints the port maps onto EZ2 modes. */
const LEGACY_HINTS: Record<string, ModeId> = {
  'beat-5k': '5k',
  'beat-5k-fp': '5k',
  'beat-7k': '7k',
  'beat-10k': '10k',
  'beat-10k-fp': '10k',
  'beat-14k': '14k',
};

export type ModeSource = 'keyword' | 'mode_hint' | 'legacy_hint';

export interface ResolvedMode {
  mode: ModeId;
  source: ModeSource;
  /** The keyword that decided it, for `source === 'keyword'`. */
  keyword?: string;
}

function baseName(path: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return path.slice(slash + 1);
}

/** EZ2PORT's importer: keywords, then the exact hint, then the legacy hints. */
export function portImporterMode(info: ChartInfo, fileName: string): ResolvedMode | undefined {
  const text = `${info.chartName ?? ''} ${baseName(fileName)}`.toLowerCase();
  for (const [kw, mode] of PORT_KEYWORDS) {
    if (text.includes(kw)) return { mode, source: 'keyword', keyword: kw };
  }
  const hint = (info.modeHint ?? '').toLowerCase();
  if (PORT_HINTS.has(hint)) return { mode: modeFromHint(hint)!, source: 'mode_hint' };
  const legacy = LEGACY_HINTS[hint];
  if (legacy) return { mode: legacy, source: 'legacy_hint' };
  return undefined;
}

/** EZ2PORT's importer tier: `shd`/`s.hd`, then `hd`, then `ex`, as tokens bounded by non-letters. */
export function portImporterTier(info: ChartInfo, fileName: string): Tier {
  const text = `${baseName(fileName)} ${info.chartName ?? ''}`.toLowerCase();
  const isAlpha = (c: string | undefined) => c !== undefined && /[a-z]/.test(c);
  const token = (tag: string): boolean => {
    for (let i = 0; i <= text.length - tag.length; i++) {
      if (i > 0 && isAlpha(text[i - 1])) continue;
      if (text.startsWith(tag, i) && !isAlpha(text[i + tag.length])) return true;
    }
    return false;
  };
  if (token('shd') || token('s.hd')) return 'SHD';
  if (token('hd')) return 'HD';
  if (token('ex')) return 'EX';
  return 'NM';
}

/** EZ2BMS's reading: the hint (including the legacy ones), else what the port would pick. */
export function chartMode(info: ChartInfo, fileName: string): ResolvedMode | undefined {
  const hinted = modeFromHint(info.modeHint);
  if (hinted) return { mode: hinted, source: 'mode_hint' };
  const legacy = LEGACY_HINTS[(info.modeHint ?? '').toLowerCase()];
  if (legacy) return { mode: legacy, source: 'legacy_hint' };
  return portImporterMode(info, fileName);
}

/** EZ2BMS's reading of the tier: `x_tier`, else what the port would pick. */
export function chartTier(info: ChartInfo, fileName: string): Tier {
  return info.tier ?? portImporterTier(info, fileName);
}

/** True when the hint uses the old BMS-derived lane numbering (beat-*). */
export function isLegacyHint(hint: string | undefined): boolean {
  return !!hint && hint.toLowerCase().startsWith('beat-');
}
