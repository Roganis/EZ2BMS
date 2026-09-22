// The text files of an EZ2PORT package: the chart .ezi and .ini, and the
// package's song.ini. Formats as EZ2PORT's importer writes them (ez2/bmson.c)
// and its readers read them (ez2/ezi.c, ez2/songini.c, ez2/usersongs.c).
// Plaintext, no BOM (the port's parsers do not strip one). A `;` starts a
// comment in song.ini, so values are cleaned of it.

import type { JudgementDeltas, LifeDeltas, Tier } from '../model/types';

export type Eol = '\n' | '\r\n';

/** `<slot> 1 <name>.wav` per keysound; the engine swaps .wav for .ssf on disk. */
export function eziText(names: readonly string[], eol: Eol = '\n'): string {
  return names.map((n, i) => `${i + 1} 1 ${n}.wav${eol}`).join('');
}

export interface ChartIni {
  level: number;
  measureScale?: number;
  judgement: JudgementDeltas;
  life: LifeDeltas;
}

const num = (v: number) => (Number.isInteger(v) ? String(v) : String(v));

export function chartIniText(ini: ChartIni, eol: Eol = '\n'): string {
  const j = ini.judgement;
  const l = ini.life;
  return [
    '[General]',
    `Level = ${Math.round(ini.level)}`,
    `MeasureScale = ${num(ini.measureScale ?? 1.6)}`,
    '',
    '[JudgmentDelta]',
    `Kool = ${Math.round(j.KOOL)}`,
    `Cool = ${Math.round(j.COOL)}`,
    `Good = ${Math.round(j.GOOD)}`,
    `Miss = ${Math.round(j.MISS)}`,
    '',
    '[GaugeUpDownRate]',
    `Cool = ${num(l.COOL)}`,
    `Good = ${num(l.GOOD)}`,
    `Miss = ${num(l.MISS)}`,
    `Fail = ${num(l.FAIL)}`,
    '',
  ].join(eol);
}

/** Make a value safe for song.ini: one line, no comment character. */
export function iniValue(s: string): string {
  return s
    .replace(/[\r\n]+/g, ' ')
    .replace(/;/g, ',')
    .trim();
}

/** The contents of a package's song.ini. */
export interface SongIniFile {
  key: string;
  title: string;
  artist: string;
  genre: string;
  category?: number;
  source?: string;
  converter: string;
  charts: { portMode: string; tier: Tier; level: number; stem: string }[];
  assets: { disc?: string; songname?: string; eyecatch?: string; preview?: string };
  bga?: { file: string; startMs: number };
}

export function songIniText(s: SongIniFile, eol: Eol = '\n'): string {
  const lines = [
    '[Song]',
    `Key = ${s.key}`,
    `Title = ${iniValue(s.title)}`,
    `Artist = ${iniValue(s.artist)}`,
    `Genre = ${iniValue(s.genre)}`,
  ];
  if (s.category !== undefined) lines.push(`Category = ${s.category}`);
  if (s.source) lines.push(`Source = ${iniValue(s.source)}`);
  lines.push(`Converter = ${iniValue(s.converter)}`, '', '[Charts]');
  for (const c of s.charts)
    lines.push(`${c.portMode}.${c.tier} = ${Math.round(c.level)} ; ${c.stem}.ez`);
  lines.push('', '[Assets]');
  if (s.assets.disc) lines.push(`Disc = ${s.assets.disc}`);
  if (s.assets.songname) lines.push(`Songname = ${s.assets.songname}`);
  if (s.assets.eyecatch) lines.push(`Eyecatch = ${s.assets.eyecatch}`);
  if (s.assets.preview) lines.push(`Preview = ${s.assets.preview}`);
  if (s.bga)
    lines.push('', '[Bga]', `File = ${s.bga.file}`, `StartMs = ${Math.round(s.bga.startMs)}`);
  lines.push('');
  return lines.join(eol);
}
