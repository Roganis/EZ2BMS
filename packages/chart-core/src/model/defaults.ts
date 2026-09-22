// What a new EZ2 chart starts with.
//
// Judgement and gauge presets are the EZ2 chart .ini's own numbers (ticks of
// 1/192 beat, stored raw - the engine adds 3 to every window when it loads
// them). Sources: EZ2PORT ez2/songini.c (missing-file defaults), BMSON.md
// section 4 ("most shipped charts run 73/53/27/9"), BmsTWO EZ2_INFO.txt.

import type { ChartData, ChartInfo, JudgementDeltas, LifeDeltas, Tier } from './types';
import { modeNames, type ModeId } from '../modes/ids';

export const DEFAULT_RESOLUTION = 240;

export interface JudgementPreset {
  id: string;
  label: string;
  deltas: JudgementDeltas;
}

export const JUDGEMENT_PRESETS: readonly JudgementPreset[] = [
  {
    id: 'shipped',
    label: 'Shipped (9/27/53/73)',
    deltas: { KOOL: 9, COOL: 27, GOOD: 53, MISS: 73 },
  },
  {
    id: 'missing',
    label: 'Engine default (6/24/36/72)',
    deltas: { KOOL: 6, COOL: 24, GOOD: 36, MISS: 72 },
  },
  {
    id: 'override',
    label: 'Common override (6/24/50/70)',
    deltas: { KOOL: 6, COOL: 24, GOOD: 50, MISS: 70 },
  },
  {
    id: 'lenient',
    label: 'Lenient (7/30/50/80)',
    deltas: { KOOL: 7, COOL: 30, GOOD: 50, MISS: 80 },
  },
];

export interface LifePreset {
  id: string;
  label: string;
  deltas: LifeDeltas;
}

export const LIFE_PRESETS: readonly LifePreset[] = [
  { id: 'default', label: 'Default', deltas: { COOL: 0.2, GOOD: 0.1, MISS: -1.8, FAIL: -4.8 } },
  { id: 'forgiving', label: 'Forgiving', deltas: { COOL: 0.2, GOOD: 0.1, MISS: -1.5, FAIL: -3.5 } },
  {
    id: 'recovery',
    label: 'Fast recovery',
    deltas: { COOL: 0.3, GOOD: 0.2, MISS: -1.5, FAIL: -4.5 },
  },
];

export interface NewChartOptions {
  mode: ModeId;
  tier: Tier;
  title?: string;
  artist?: string;
  genre?: string;
  level?: number;
  bpm?: number;
}

export function newChartInfo(o: NewChartOptions): ChartInfo {
  return {
    title: o.title ?? '',
    subtitle: '',
    artist: o.artist ?? '',
    subartists: [],
    genre: o.genre ?? '',
    modeHint: modeNames(o.mode).hint,
    chartName: o.tier,
    level: o.level ?? 1,
    initBpm: o.bpm ?? 150,
    judgeRank: 100,
    total: 100,
    backImage: '',
    eyecatchImage: '',
    titleImage: '',
    bannerImage: '',
    previewMusic: '',
    resolution: DEFAULT_RESOLUTION,
    judgementDeltas: { ...JUDGEMENT_PRESETS[0]!.deltas },
    lifeDeltas: { ...LIFE_PRESETS[0]!.deltas },
    tier: o.tier,
    extra: {},
  };
}

export function newChart(o: NewChartOptions): ChartData {
  return {
    version: '1.0.0',
    info: newChartInfo(o),
    lines: null,
    bpmEvents: [],
    stopEvents: [],
    channels: [],
    notes: [],
    bga: null,
    extra: {},
  };
}
