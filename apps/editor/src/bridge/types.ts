// The editor's only door to the machine. Everything native - files, audio,
// EZ2PORT - goes through a Backend: `tauri.ts` in the desktop app, `web.ts`
// (in-memory files, a silent clock) in a browser and in Playwright. The
// shapes mirror src-tauri's commands one for one.

import type { ArtJob, PlateSpec } from '@ez2bms/chart-core';

export interface Entry {
  name: string;
  is_dir: boolean;
  size: number;
  modified_ms: number;
}

export interface ProjectScan {
  dir: string;
  charts: Entry[];
  sidecar: Entry | null;
  /** Relative to the project, forward slashes. */
  samples: string[];
  images: string[];
  /** Movies (the BGA). */
  movies: string[];
}

export interface AppInfo {
  version: string;
  os: string;
  config_dir: string | null;
  cache_dir: string | null;
}

export interface AudioInfo {
  rate: number;
  backend: 'cpal' | 'null' | 'web';
  device_error: string | null;
}

export interface Loaded {
  path: string;
  id: number | null;
  frames: number;
  channels: number;
  seconds: number;
  error: string | null;
}

/** One compiled chart event for the audio engine (chart-core PlanEvent, reduced). */
export interface AudioEvent {
  ms: number;
  origin_ms: number;
  until_ms: number | null;
  sample: number;
  voice: number;
  level: number;
  pan: number;
}

export interface Trigger {
  sample: number;
  voice: number;
  level?: number;
  pan?: number;
  offset_ms?: number;
  until_ms?: number | null;
}

export interface ClockSnapshot {
  frame: number;
  host_ns: number;
  latency_frames: number;
  rate: number;
  playing: boolean;
  generation: number;
  now_ns: number;
}

/** The song's preview to render (src-tauri audio::PreviewJob). */
export interface PreviewJob {
  /** Sample files the events' `sample` indexes (publishing); absent when auditioning (loaded ids). */
  sources?: string[];
  events?: AudioEvent[];
  /** An audio file instead of a mix. */
  file?: string | null;
  from_ms: number;
  length_ms: number;
  fade_ms: number;
}

/** A rendered preview, ready to trigger (src-tauri audio::Audition). */
export interface Audition {
  sample: number;
  seconds: number;
  /** The voice to play it on: a new trigger there cuts the last one, as the wheel restarts it. */
  voice: number;
}

export interface AudioBackend {
  info(): Promise<AudioInfo>;
  load(paths: string[]): Promise<Loaded[]>;
  /** [min, max] i16 pairs at the mip level nearest `framesPerPx`. */
  peaks(id: number, framesPerPx: number): Promise<Int16Array>;
  /** Thumbnails: `width` [min, max] pairs per id, in order (zeros for an unknown id). */
  thumbs(ids: number[], width: number): Promise<Int16Array>;
  setEvents(events: AudioEvent[]): Promise<void>;
  play(fromMs: number): Promise<void>;
  seek(ms: number): Promise<void>;
  stop(): Promise<void>;
  trigger(t: Trigger): Promise<boolean>;
  setMaster(gain: number): Promise<void>;
  clock(): Promise<ClockSnapshot>;
  /** Host time in ns, for clock-offset pings. */
  now(): Promise<number>;
  /** A snapshot every ~8 ms until the returned function is called. */
  streamClock(on: (c: ClockSnapshot) => void): () => void;
  /** The song's first `endMs` of loudness: `width` [min, max] pairs (it is rendered: not instant). */
  previewOverview(events: AudioEvent[], endMs: number, width: number): Promise<Int16Array>;
  /** Render the preview (events over loaded samples, or a file) for auditioning. */
  preview(job: PreviewJob): Promise<Audition>;
  /** The disk cache that keeps long files (20 s and more) decoded across runs. */
  cacheInfo(): Promise<AudioCacheInfo>;
  /** Its limit, MB; 0 turns it off and empties it. */
  cacheSetCap(mb: number): Promise<void>;
  cacheClear(): Promise<void>;
}

export interface AudioCacheInfo {
  /** Null when there is no disk cache (the browser build). */
  dir: string | null;
  entries: number;
  bytes: number;
  /** Bytes; 0 = off. */
  cap: number;
}

export interface PackageFile {
  path: string;
  bytes: Uint8Array;
}

export interface KeysoundJob {
  src: string;
  start_frame: number;
  end_frame: number | null;
  file: string;
}

export interface PackageSpec {
  key: string;
  project_dir: string;
  files: PackageFile[];
  keysounds: KeysoundJob[];
  /** preview.ssf, rendered by the host. */
  preview?: PreviewJob;
  /** Files the host copies in by path (the BGA movie): `from` relative to the project. */
  copies?: { from: string; name: string }[];
}

export interface Published {
  dir: string;
  files: number;
  missing: [string, string][];
}

export interface Probe {
  path: string;
  commit: string | null;
  options: string[];
  songs_root: boolean;
  log_file: boolean;
  start_at: boolean;
  skip_ready: boolean;
  viewer: boolean;
  result_file: boolean;
}

export interface Located {
  game_root: string | null;
  ez2play: string | null;
  songs_root: string | null;
}

export interface TestSpec {
  package: PackageSpec;
  chart_file: string;
  mode: string;
  ez2play: string;
  game_root: string;
  exe?: string | null;
  auto?: boolean;
  windowed?: boolean;
  bga?: boolean | null;
  speed?: number | null;
  start_ms?: number | null;
  skip_ready?: boolean;
}

export type RunEvent =
  | { kind: 'line'; stream: 'out' | 'err'; text: string; at_ms: number }
  | { kind: 'exit'; outcome: string; code: number | null };

/** What is at `<songs root>/<key>` (src-tauri port::InspectionDto). */
export interface Inspection {
  /** The folder EZ2PORT resolves the key to (any case). */
  folder: string | null;
  song_ini: string | null;
  files: string[];
  /** The game ships a song with this key (`<game>/sound/<key>`). */
  shipped: boolean;
}

/** What the editor decided after inspecting the target (src-tauri port::PublishOptions). */
export interface PublishOptions {
  /** Ranking tables of the package in place to keep. */
  carry?: string[];
  /** The target as inspected; the publish is refused if it changed since. */
  expect?: { song_ini: string | null };
  /** Keep the replaced package in `.ez2bms-backup/<key>`. */
  backup?: boolean;
}

export interface PortBackend {
  locate(start: string): Promise<Located>;
  probe(path: string): Promise<Probe>;
  /** What a publish would replace. `gameRoot` checks the key against the game's own songs. */
  inspect(songsRoot: string, key: string, gameRoot: string | null): Promise<Inspection>;
  publish(songsRoot: string, pkg: PackageSpec, options?: PublishOptions): Promise<Published>;
  /** Move a package (still holding `songIni`) to the backup folder. */
  retire(songsRoot: string, key: string, songIni: string): Promise<void>;
  test(spec: TestSpec, on: (e: RunEvent) => void): Promise<number>;
  stop(id: number): Promise<void>;
}

/** One file offered for import, and what became of it (src-tauri files::Imported). */
export interface Imported {
  from: string;
  /** Its name in the song folder, relative with forward slashes, when imported. */
  name: string | null;
  /** The folder already had it. */
  reused: boolean;
  error: string | null;
}

/** What an import takes; other files offered with it are refused (src-tauri files::ImportKind). */
export type ImportKind = 'audio' | 'image' | 'movie';

/** Song art cut by the host (src-tauri media_art): RGB, top-down. */
export interface ArtPixels {
  w: number;
  h: number;
  rgb: Uint8Array;
}

/** A rendered title plate (src-tauri media_plate). */
export interface PlatePixels extends ArtPixels {
  /** Characters the fonts have no glyph for (drawn as boxes). */
  missing: string[];
}

export interface MediaBackend {
  /** The disc or the eyecatch cut from an image, with the port importer's arithmetic. */
  art(path: string, job: ArtJob): Promise<ArtPixels>;
  /** The title plate, from the bundled fonts, as EZ2PORT renders one. */
  plate(spec: PlateSpec): Promise<PlatePixels>;
}

/** Files dragged over the window (paths only on drop; CSS pixels). */
export interface FileDrop {
  kind: 'over' | 'drop' | 'leave';
  paths: string[];
  x: number;
  y: number;
}

export interface Backend {
  readonly kind: 'tauri' | 'web';
  appInfo(): Promise<AppInfo>;
  readFile(path: string): Promise<Uint8Array>;
  /** Up to `length` bytes from `offset`, and the file's size (a movie's headers). */
  readRange(
    path: string,
    offset: number,
    length: number,
  ): Promise<{ size: number; bytes: Uint8Array }>;
  /** A URL the webview can play a song-folder file from (the BGA's <video>). */
  mediaUrl(path: string): Promise<string>;
  readText(path: string): Promise<string>;
  writeText(path: string, text: string, backup: boolean): Promise<void>;
  writeBytes(path: string, bytes: Uint8Array, backup: boolean): Promise<void>;
  list(dir: string): Promise<Entry[]>;
  scanProject(dir: string): Promise<ProjectScan>;
  loadSettings(): Promise<Record<string, unknown>>;
  saveSettings(v: Record<string, unknown>): Promise<void>;
  pickFolder(title: string): Promise<string | null>;
  pickFiles(title: string, extensions: string[]): Promise<string[]>;
  /** Copy sound files or images (and those in folders) into a song folder, flat, never overwriting. */
  importFiles(dir: string, paths: string[], kind?: ImportKind): Promise<Imported[]>;
  /** Rename a file; refuses to replace another one. */
  renameFile(from: string, to: string): Promise<void>;
  /** Files dragged onto the window. Returns the unsubscribe. */
  onFileDrop(cb: (d: FileDrop) => void): () => void;
  readonly audio: AudioBackend;
  readonly port: PortBackend;
  readonly media: MediaBackend;
}

/** Path helpers that work on both separators. */
export function joinPath(dir: string, rel: string): string {
  if (!dir) return rel;
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
  return dir.replace(/[\\/]+$/, '') + sep + rel.replace(/^[\\/]+/, '');
}

export function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

export function dirName(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i < 0 ? '' : i === 0 ? path.slice(0, 1) : path.slice(0, i);
}
