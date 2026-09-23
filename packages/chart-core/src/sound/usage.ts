// Which sounds a song uses, and where: the keysound workbench's numbers.
//
// A song is a folder of sound files and one bmson per chart; each chart has
// its own channel list naming files. Usage is counted per FILE (a name is
// resolved the way playback resolves it, so "kick.wav" counts for kick.ogg),
// so one sound used by three charts is one row with three chart entries.

import type { ChannelId, ChartData } from '../model/types';
import { groupKeyOf } from './grouping';
import { AUDIO_EXT, SoundIndex } from './resolve';

export interface SoundUse {
  /** The chart file. */
  chart: string;
  /** Channels of that chart that name this sound. */
  channels: ChannelId[];
  /** Notes on playable (and off-mode) lanes. */
  lane: number;
  /** Background notes (x = 0). */
  bgm: number;
}

export interface SoundInfo {
  /** The folder file, or - when the folder has none - the name as the first chart spells it. */
  name: string;
  inFolder: boolean;
  group: string;
  charts: SoundUse[];
  /** All notes, every chart. */
  notes: number;
}

export interface UnusedChannel {
  chart: string;
  ch: ChannelId;
  name: string;
}

export interface SongSounds {
  /** Folder audio files (in folder order), then missing names (in chart order). */
  sounds: SoundInfo[];
  /** By folder file, or by lower-cased name for a missing sound. */
  byKey: Map<string, SoundInfo>;
  /** Folder audio files no chart names. */
  unusedFiles: string[];
  /** Names charts use that the folder does not have. */
  missing: string[];
  /** Channels with no notes, per chart. */
  unusedChannels: UnusedChannel[];
}

/** The key a sound is filed under: its folder file, else its lower-cased name. */
export function soundKey(index: SoundIndex, name: string): string {
  return index.resolve(name) ?? `?${name.toLowerCase()}`;
}

/** One pass over every chart's channels and notes. */
export function soundUsage(
  charts: readonly { file: string; data: ChartData }[],
  folder: readonly string[],
): SongSounds {
  const index = new SoundIndex(folder);
  const byKey = new Map<string, SoundInfo>();
  const sounds: SoundInfo[] = [];
  for (const f of folder) {
    if (!AUDIO_EXT.test(f)) continue;
    const s: SoundInfo = { name: f, inFolder: true, group: groupKeyOf(f), charts: [], notes: 0 };
    byKey.set(f, s);
    sounds.push(s);
  }
  const missing: SoundInfo[] = [];
  const unusedChannels: UnusedChannel[] = [];
  for (const c of charts) {
    const counts = new Map<ChannelId, { lane: number; bgm: number }>();
    for (const ch of c.data.channels) counts.set(ch.id, { lane: 0, bgm: 0 });
    for (const n of c.data.notes) {
      const k = counts.get(n.ch);
      if (!k) continue;
      if (n.x === 0) k.bgm++;
      else k.lane++;
    }
    const uses = new Map<SoundInfo, SoundUse>();
    for (const ch of c.data.channels) {
      const key = soundKey(index, ch.name);
      let s = byKey.get(key);
      if (!s) {
        s = { name: ch.name, inFolder: false, group: groupKeyOf(ch.name), charts: [], notes: 0 };
        byKey.set(key, s);
        missing.push(s);
      }
      let u = uses.get(s);
      if (!u) {
        u = { chart: c.file, channels: [], lane: 0, bgm: 0 };
        uses.set(s, u);
        s.charts.push(u);
      }
      const k = counts.get(ch.id)!;
      u.channels.push(ch.id);
      u.lane += k.lane;
      u.bgm += k.bgm;
      s.notes += k.lane + k.bgm;
      if (!k.lane && !k.bgm) unusedChannels.push({ chart: c.file, ch: ch.id, name: ch.name });
    }
  }
  sounds.push(...missing);
  return {
    sounds,
    byKey,
    unusedFiles: sounds.filter((s) => s.inFolder && !s.charts.length).map((s) => s.name),
    missing: missing.map((s) => s.name),
    unusedChannels,
  };
}
