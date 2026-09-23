// A song written as a BMS folder: one BMS/BME per chart, and the sounds they
// play - flat beside them, as BMS players look for them.
//
// One keysound table for the whole song (charts share a stem's slices), each
// sound one file:
// - a whole WAV or OGG the song already has is copied as it is, under its
//   own name;
// - a whole .ssf/.ezw (EZ2's), FLAC or MP3 becomes a WAV (the host rewraps
//   an .ssf's samples untouched and decodes the others);
// - a slice of a stem (a `c: true` continuation) is cut to a WAV of its own,
//   exactly as the cabinet's keysounds are cut.
// Names are unique whatever their case (two players on Windows and Linux),
// and, when a file's name cannot be written in the BMS's encoding, the
// sound's ASCII name is used instead. The encoding is chosen once for the
// song, so every chart names the files the same way.

import type { OpenNote } from '../../lint/lint';
import type { ChartData, Tier } from '../../model/types';
import type { ModeId } from '../../modes/ids';
import { ChartClock, chartSounds, type SampleLookup } from '../../publish/chart-plan';
import { KeysoundRegistry } from '../../publish/keysounds';
import { TimingMap } from '../../timing/timing-map';
import { fitsLegacy } from '../legacy-text';
import { EZ2_BME_MAP, keysInOrderMap } from './convert';
import { chooseBmsEncoding, writeBms, type BmsTextEncoding, type BmsWritten } from './write';

export interface BmsSongChart {
  /** The chart's file in the project (its .bmson name). */
  file: string;
  data: ChartData;
  mode: ModeId;
  tier: Tier;
}

export interface BmsSongOptions {
  map: 'ez2' | 'keys';
  encoding?: 'auto' | BmsTextEncoding;
  base?: 'auto' | 36 | 62;
  /** A channel's sound as a project file (project-relative), or undefined when it is missing. */
  resolve: (name: string) => string | undefined;
  samples?: SampleLookup;
  /** Project-relative. */
  stagefile?: string;
  preview?: string;
  /** A movie, from this many ms into each chart. */
  bga?: { file: string; ms: number };
}

export interface BmsSongExport {
  /** The BMS files. */
  files: { path: string; bytes: Uint8Array }[];
  /** Project files copied as they are: from (project-relative) -> path. */
  copies: { from: string; path: string }[];
  /** Keysounds the host makes as WAV. */
  sounds: {
    src: string;
    start_frame: number;
    end_frame: number | null;
    path: string;
    format: 'wav';
  }[];
  charts: { file: string; path: string; written: BmsWritten }[];
  /** Each keysound's file (by the song's keysound table), whether copied, made or missing. */
  soundFiles: string[];
  encoding: BmsTextEncoding;
  notes: OpenNote[];
}

const extOf = (p: string) => (p.includes('.') ? p.slice(p.lastIndexOf('.') + 1).toLowerCase() : '');
const baseName = (p: string) => p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1);
const stem = (p: string) => {
  const b = baseName(p);
  return b.includes('.') ? b.slice(0, b.lastIndexOf('.')) : b;
};

export function exportBmsSong(charts: readonly BmsSongChart[], o: BmsSongOptions): BmsSongExport {
  const notes: OpenNote[] = [];
  const registry = new KeysoundRegistry();
  // Every chart's sounds into the one table first: names depend on all of them.
  for (const c of charts) chartSounds(c.data, new ChartClock(c.data), registry, o.samples);

  // What each sound is, and the name it would like.
  const taken = new Set<string>();
  const unique = (name: string) => {
    const dot = name.lastIndexOf('.');
    const [b, e] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
    let n = name;
    for (let k = 2; taken.has(n.toLowerCase()); k++) n = `${b}~${k}${e}`;
    taken.add(n.toLowerCase());
    return n;
  };
  interface Plan {
    file?: string;
    want: string;
    ascii: string;
    how: 'copy' | 'make' | 'missing';
  }
  const plans: Plan[] = registry.defs.map((d) => {
    const file = o.resolve(d.src);
    const whole = d.startFrame === 0 && d.endFrame === null;
    const ascii = `${d.name}.wav`;
    if (!file) return { want: baseName(d.src) || ascii, ascii, how: 'missing' };
    if (whole && ['wav', 'ogg'].includes(extOf(file)))
      return { file, want: baseName(file), ascii: `${d.name}.${extOf(file)}`, how: 'copy' };
    return { file, want: whole ? `${stem(file)}.wav` : ascii, ascii, how: 'make' };
  });
  const extras = [o.stagefile, o.preview, o.bga?.file].filter((f): f is string => !!f);

  // The encoding, for the song: every chart's text and every file's name.
  const words = charts.flatMap((c) => {
    const i = c.data.info;
    return [i.title, i.subtitle, i.artist, i.genre, ...(i.subartists ?? [])].map((t) => t ?? '');
  });
  const encoding =
    o.encoding && o.encoding !== 'auto'
      ? o.encoding
      : chooseBmsEncoding([...words, ...plans.map((p) => p.want), ...extras.map(baseName)]);
  const fits = (s: string) => encoding === 'utf-8' || fitsLegacy(s, encoding);
  const names = plans.map((p) => unique(fits(p.want) ? p.want : p.ascii));
  const extra = new Map(
    extras.map((f) => [f, unique(fits(baseName(f)) ? baseName(f) : `extra.${extOf(f)}`)]),
  );

  const out: BmsSongExport = {
    files: [],
    copies: [],
    sounds: [],
    charts: [],
    soundFiles: names,
    encoding,
    notes,
  };
  plans.forEach((p, i) => {
    const d = registry.defs[i]!;
    if (p.how === 'copy') out.copies.push({ from: p.file!, path: names[i]! });
    else if (p.how === 'make')
      out.sounds.push({
        src: p.file!,
        start_frame: d.startFrame,
        end_frame: d.endFrame,
        path: names[i]!,
        format: 'wav',
      });
  });
  for (const [from, path] of extra) out.copies.push({ from, path });
  const missing = plans.filter((p) => p.how === 'missing');
  if (missing.length)
    notes.push({
      rule: 'bms-missing-sound',
      severity: 'warning',
      message: `${missing.length} sound${missing.length === 1 ? ' is' : 's are'} not in the song folder (${missing
        .slice(0, 5)
        .map((p) => p.want)
        .join(', ')}${missing.length > 5 ? '...' : ''}): named in the BMS, not copied`,
    });

  for (const c of charts) {
    const map = o.map === 'keys' ? keysInOrderMap(c.mode) : EZ2_BME_MAP;
    const bga = o.bga
      ? {
          file: extra.get(o.bga.file)!,
          y: new TimingMap({
            resolution: c.data.info.resolution ?? 240,
            initBpm: c.data.info.initBpm ?? 120,
            bpmEvents: c.data.bpmEvents,
            stopEvents: c.data.stopEvents,
          }).pulseAt(o.bga.ms / 1000),
        }
      : undefined;
    const written = writeBms(
      c.data,
      {
        mode: c.mode,
        tier: c.tier,
        map,
        encoding,
        ...(o.base ? { base: o.base } : {}),
        soundFile: (ks) => names[ks]!,
        ...(o.samples ? { samples: o.samples } : {}),
        ...(o.stagefile ? { stagefile: extra.get(o.stagefile)! } : {}),
        ...(o.preview ? { preview: extra.get(o.preview)! } : {}),
        ...(bga ? { bga } : {}),
      },
      registry,
    );
    const path = unique(`${stem(c.file)}${written.ext}`);
    out.files.push({ path, bytes: written.bytes });
    out.charts.push({ file: c.file, path, written });
    for (const n of written.notes) notes.push({ ...n, message: `${path}: ${n.message}` });
  }
  return out;
}
