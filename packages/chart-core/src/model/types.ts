// The chart model: a bmson document as EZ2BMS edits it.
//
// Plain data, JSON-shaped, no classes: the editor's ChartDoc (edit/) wraps it
// with indexes and history, the publisher (publish/) compiles it, and the
// bmson reader/writer (io/bmson/) is the only code that knows the file's
// spelling. See docs/bmson-dialect.md for every field's meaning.

/** Unknown JSON members of an object, kept verbatim and written back. */
export type Extra = Record<string, unknown>;

/** Runtime identity of a note - never written to disk. */
export type NoteId = number;
/** Runtime identity of a sound channel - never written to disk. */
export type ChannelId = number;

export interface NoteRec {
  id: NoteId;
  ch: ChannelId;
  /** bmson lane. EZ2 canonical: 1/2 scratch, 10/20 pedal, 11-15/21-25 keys, 31-34 effectors, 0 BGM. */
  x: number;
  /** Position in pulses (`info.resolution` per quarter note). */
  y: number;
  /** Hold length in pulses; 0 = tap. */
  l: number;
  /** Continuation: plays on from where the channel's sample was, instead of restarting it. */
  c: boolean;
  /** BmsTWO `up`: re-trigger the sample at the hold's release. EZ2 has no such thing. */
  up?: boolean;
  /** BmsTWO `x_stop`: cut the sample this many pulses after the note. */
  xStop?: number;
  /** EZ2 note velocity 0-127 (`x_vel`); absent = 127. */
  vel?: number;
  /** EZ2 note pan 0-127, 64 centre (`x_pan`); absent = 64. */
  pan?: number;
  /** EZ2 hold kind byte (`x_kind`): the instalment step of a hold; absent = 0. */
  kind?: number;
  extra?: Extra;
}

export interface SoundChannel {
  id: ChannelId;
  /** Sample file, relative to the chart's folder. */
  name: string;
  /** BmsTWO `x_color` (#rrggbb). */
  color?: string;
  extra?: Extra;
}

export interface BpmEvent {
  y: number;
  bpm: number;
  extra?: Extra;
}

export interface StopEvent {
  y: number;
  /** Length of the stop in pulses. */
  duration: number;
  extra?: Extra;
}

/**
 * A scroll-speed change (EZFF type 6; bmson has none, so EZ2BMS writes
 * `x_scroll_events`). From its pulse on, EZ2PORT scrolls at the player's
 * speed times `rate`, chasing the new speed a tenth of the way each frame
 * (ez2/scroll.c); timing is untouched. An imported one keeps the track it
 * was on (`extra.x_track`) and the record's second word (`extra.x_raw1`), so
 * the cabinet gets it back as it was.
 */
export interface ScrollEvent {
  y: number;
  rate: number;
  extra?: Extra;
}

export interface BarLine {
  y: number;
  extra?: Extra;
}

export interface BgaHeader {
  id: number;
  name: string;
  extra?: Extra;
}

export interface BgaEvent {
  y: number;
  id: number;
  extra?: Extra;
}

export interface BgaData {
  header: BgaHeader[];
  bga: BgaEvent[];
  layer: BgaEvent[];
  poor: BgaEvent[];
  extra?: Extra;
}

export type Tier = 'NM' | 'HD' | 'SHD' | 'EX';

export interface JudgementDeltas {
  /** EZ2 judge windows in ticks of 1/192 beat, as the chart's .ini stores them (before the +3 widening). */
  KOOL: number;
  COOL: number;
  GOOD: number;
  MISS: number;
}

export interface LifeDeltas {
  /** EZ2 gauge change per judgement. KOOL mirrors COOL in the engine. */
  COOL: number;
  GOOD: number;
  MISS: number;
  FAIL: number;
}

/**
 * bmson `info`. A field is `undefined` when the file did not have it (or had a
 * value of the wrong type, which is then kept verbatim in `extra`), so a
 * foreign file round-trips without gaining members it never had.
 */
export interface ChartInfo {
  title?: string;
  subtitle?: string;
  artist?: string;
  subartists?: string[];
  genre?: string;
  modeHint?: string;
  chartName?: string;
  level?: number;
  initBpm?: number;
  judgeRank?: number;
  total?: number;
  backImage?: string;
  eyecatchImage?: string;
  titleImage?: string;
  bannerImage?: string;
  previewMusic?: string;
  resolution?: number;
  judgementDeltas?: JudgementDeltas;
  lifeDeltas?: LifeDeltas;
  /** EZ2BMS: the chart's difficulty tier, explicit instead of guessed from names. */
  tier?: Tier;
  extra: Extra;
}

export interface ChartData {
  /** bmson `version` (a 0.21 file is read as 1.0.0: io/bmson/v021.ts). */
  version?: string;
  info: ChartInfo;
  /** Bar lines; `null` when the file has none (EZ2 draws 4/4 regardless). */
  lines: BarLine[] | null;
  bpmEvents: BpmEvent[];
  stopEvents: StopEvent[];
  /** Sorted by y. `x_scroll_events`, written only when there are some. */
  scrollEvents: ScrollEvent[];
  /** In file order. Channel ids are unique within a chart. */
  channels: SoundChannel[];
  /** Every note of every channel. Order is not significant. */
  notes: NoteRec[];
  bga: BgaData | null;
  /** Unknown root members (e.g. `mine_channels`, `key_channels`). */
  extra: Extra;
  /**
   * Standard arrays the source file did not have. They are written back only
   * once they have something in them, so a foreign file does not grow members.
   */
  absent?: ('bpm_events' | 'stop_events' | 'sound_channels')[];
}
