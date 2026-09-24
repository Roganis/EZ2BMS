// A folder of BMS files (one per difficulty, sharing their sounds) -> one
// EZ2BMS song: a chart per file, each in its own mode and tier, the song file,
// and the files the charts use - to copy into a new song folder, or to leave
// where they are when the song is written beside the BMS files.
//
// Every choice an import makes (encoding, random values, channel map, mode,
// tier, hidden notes) can be given per file; what is not given is guessed, and
// the preview says what was guessed so the wizard can offer to change it.

import { said, saying } from '../../i18n/say';
import type { OpenNote } from '../../lint/lint';
import type { ChartData, Tier } from '../../model/types';
import { chartBaseName, deriveSongKey } from '../../modes/filenames';
import type { ModeId } from '../../modes/ids';
import { SoundIndex } from '../../sound/resolve';
import { newSongFile, type SongFile } from '../../song/songfile';
import {
  convertBms,
  EZ2_BME_MAP,
  keysInOrderMap,
  type BmsChannelMap,
  type BmsMapId,
} from './convert';
import { decodeAs, decodeBms, type BmsEncoding } from './decode';
import { parseBms, type BmsRandom } from './parse';

export const BMS_FILE = /\.(bms|bme|bml|pms)$/i;

export interface BmsFileChoice {
  encoding?: BmsEncoding;
  /** Values for the file's #RANDOM/#SWITCH blocks, in the order they are met. */
  picks?: number[];
  map?: BmsMapId | BmsChannelMap;
  mode?: ModeId;
  tier?: Tier;
  hiddenAsBackground?: boolean;
  /** Leave the file out. */
  skip?: boolean;
}

export interface BmsSongInput {
  /** The BMS files (names relative to the folder). */
  files: { name: string; bytes: Uint8Array }[];
  /** Every file in the folder, relative, forward slashes (to find sounds in). */
  listing: readonly string[];
  choices?: Readonly<Record<string, BmsFileChoice>>;
  /** The folder's name, for a key when there is no title. */
  folder?: string;
}

export interface BmsFilePreview {
  file: string;
  encoding: BmsEncoding;
  /** The encoding was clear from the bytes. */
  sure: boolean;
  title: string;
  randoms: BmsRandom[];
  mode: ModeId;
  tier: Tier;
  level: number;
  map: BmsMapId;
  lanesUsed: number[];
  noteCount: number;
  skipped: boolean;
  /** Another file took this mode and tier first. */
  clash?: string;
}

export interface BmsSongImport {
  key: string;
  song: SongFile;
  charts: {
    file: string;
    data: ChartData;
    mode: ModeId;
    tier: Tier;
    from: string;
    notes: OpenNote[];
  }[];
  /** Folder files the charts use: sounds, BGA files, the stage image and the preview. */
  uses: string[];
  files: BmsFilePreview[];
  notes: OpenNote[];
}

function mapFor(choice: BmsFileChoice['map'], mode: ModeId | undefined): BmsChannelMap {
  if (choice && typeof choice === 'object') return choice;
  if (choice === 'keys') return keysInOrderMap(mode ?? '14k');
  return EZ2_BME_MAP;
}

export function importBmsSong(input: BmsSongInput): BmsSongImport {
  const sounds = new SoundIndex(input.listing);
  const lower = new Map(input.listing.map((f) => [f.toLowerCase(), f]));
  const resolveAny = (name: string) => {
    const n = name.replace(/\\/g, '/');
    return lower.get(n.toLowerCase()) ?? sounds.resolve(n);
  };
  const files: BmsFilePreview[] = [];
  const charts: BmsSongImport['charts'] = [];
  const uses = new Set<string>();
  const taken = new Map<string, string>();
  const songNotes: OpenNote[] = [];
  let title = '';
  let stagefile: string | undefined;
  let preview: string | undefined;

  for (const f of [...input.files].sort((a, b) => a.name.localeCompare(b.name))) {
    const c = input.choices?.[f.name] ?? {};
    const decoded = c.encoding
      ? { text: decodeAs(f.bytes, c.encoding), encoding: c.encoding, sure: true }
      : decodeBms(f.bytes);
    const doc = parseBms(decoded.text, { pick: (_max, i) => c.picks?.[i] ?? 1 });
    // The map "keys in order" depends on the mode: guess the mode first with EZ2's.
    const first = convertBms(doc, {
      file: f.name,
      resolve: resolveAny,
      ...(c.mode ? { mode: c.mode } : {}),
      ...(c.tier ? { tier: c.tier } : {}),
      map: mapFor(c.map, c.mode),
      ...(c.hiddenAsBackground ? { hiddenAsBackground: true } : {}),
    });
    const conv =
      c.map === 'keys' && !c.mode
        ? convertBms(doc, {
            file: f.name,
            resolve: resolveAny,
            mode: first.mode,
            ...(c.tier ? { tier: c.tier } : {}),
            map: keysInOrderMap(first.mode),
            ...(c.hiddenAsBackground ? { hiddenAsBackground: true } : {}),
          })
        : first;
    const slot = `${conv.mode}/${conv.tier}`;
    const clash = taken.get(slot);
    const preview1: BmsFilePreview = {
      file: f.name,
      encoding: decoded.encoding,
      sure: decoded.sure,
      title: conv.data.info.title ?? '',
      randoms: doc.randoms,
      mode: conv.mode,
      tier: conv.tier,
      level: conv.data.info.level ?? 1,
      map: typeof c.map === 'object' ? c.map.id : (c.map ?? 'ez2'),
      lanesUsed: conv.lanesUsed,
      noteCount: conv.data.notes.filter((n) => n.x).length,
      skipped: !!c.skip || !!clash,
      ...(clash ? { clash } : {}),
    };
    files.push(preview1);
    if (c.skip) continue;
    if (clash) {
      songNotes.push({
        rule: 'import-skipped',
        severity: 'warning',
        ...saying(
          said('bms.clash', { file: f.name, other: clash, mode: conv.mode, tier: conv.tier }),
        ),
      });
      continue;
    }
    taken.set(slot, f.name);
    title ||= conv.data.info.title ?? '';
    for (const s of conv.sounds) uses.add(s);
    for (const b of conv.bga) if (lower.has(b.toLowerCase())) uses.add(b);
    stagefile ??= conv.stagefile && lower.get(conv.stagefile.toLowerCase());
    preview ??= conv.preview && resolveAny(conv.preview);
    if (!decoded.sure)
      conv.notes.unshift({
        rule: 'bms-encoding',
        severity: 'info',
        ...saying(said('bms.encoding-guess', { encoding: decoded.encoding })),
      });
    charts.push({
      file: '',
      data: conv.data,
      mode: conv.mode,
      tier: conv.tier,
      from: f.name,
      notes: conv.notes,
    });
  }

  // A title like "Song [HYPER]" names the chart, not the song.
  const songTitle = title.replace(/\s*[[(（【<].*?[\])）】>]\s*$/u, '') || title;
  const key = deriveSongKey(songTitle) || deriveSongKey(input.folder ?? '') || 'song';
  for (const c of charts) c.file = `${chartBaseName(c.mode, key, c.tier)}.bmson`;
  const song = newSongFile(key);
  song.category = 48;
  const noteList = [
    ...songNotes.map((n) => ({ chart: '', ...n })),
    ...charts.flatMap((c) => c.notes.map((n) => ({ chart: c.file, ...n }))),
  ];
  song.source = {
    from: 'bms',
    ...(input.folder ? { path: input.folder } : {}),
    charts: Object.fromEntries(charts.map((c) => [c.file, c.from])),
    ...(noteList.length ? { notes: noteList } : {}),
  };
  // #STAGEFILE is the 640x480 picture a BMS player shows while loading:
  // what the song-select exit shows of the eyecatch.
  if (stagefile) {
    uses.add(stagefile);
    song.eyecatch = { src: stagefile, mode: 'visible' };
  }
  if (preview) {
    uses.add(preview);
    song.preview = { file: preview };
  }
  // A movie BGA needs nothing here: the song takes the charts' (M3).
  return { key, song, charts, uses: [...uses].sort(), files, notes: songNotes };
}
