// The editor's only door to the machine. Everything native - files, audio,
// EZ2PORT - goes through a Backend: `tauri.ts` in the desktop app, `web.ts`
// (in-memory files, a silent clock) in a browser and in Playwright. The
// shapes mirror src-tauri's commands one for one.

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

export interface AudioBackend {
  info(): Promise<AudioInfo>;
  load(paths: string[]): Promise<Loaded[]>;
  /** [min, max] i16 pairs at the mip level nearest `framesPerPx`. */
  peaks(id: number, framesPerPx: number): Promise<Int16Array>;
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

export interface PortBackend {
  locate(start: string): Promise<Located>;
  probe(path: string): Promise<Probe>;
  publish(songsRoot: string, pkg: PackageSpec): Promise<Published>;
  test(spec: TestSpec, on: (e: RunEvent) => void): Promise<number>;
  stop(id: number): Promise<void>;
}

export interface Backend {
  readonly kind: 'tauri' | 'web';
  appInfo(): Promise<AppInfo>;
  readFile(path: string): Promise<Uint8Array>;
  readText(path: string): Promise<string>;
  writeText(path: string, text: string, backup: boolean): Promise<void>;
  writeBytes(path: string, bytes: Uint8Array, backup: boolean): Promise<void>;
  list(dir: string): Promise<Entry[]>;
  scanProject(dir: string): Promise<ProjectScan>;
  loadSettings(): Promise<Record<string, unknown>>;
  saveSettings(v: Record<string, unknown>): Promise<void>;
  pickFolder(title: string): Promise<string | null>;
  pickFiles(title: string, extensions: string[]): Promise<string[]>;
  readonly audio: AudioBackend;
  readonly port: PortBackend;
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
