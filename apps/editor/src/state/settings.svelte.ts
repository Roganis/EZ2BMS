// User settings, kept by the backend (the app's config folder in the desktop
// app, localStorage in a browser). Saved a moment after each change.

import type { Backend } from '../bridge';

export interface SettingsData {
  /** EZ2AC data folder (the one with `sound` and `system`). */
  gameRoot: string | null;
  /** The unpacked executable; null lets EZ2PORT find it. */
  exe: string | null;
  ez2play: string | null;
  /** Where Publish writes songs (default: <game>/ez2port/songs). */
  songsRoot: string | null;
  recent: string[];
  side: 'P1' | 'P2';
  /** Play mode speed dial, percent. */
  speed: number;
  /** Positive = the chart is heard/seen later than the clock says. */
  audioOffsetMs: number;
  visualOffsetMs: number;
  inputOffsetMs: number;
  /** Key rebinds: command id -> keys. */
  keys: Record<string, string[]>;
  /** Draw the playfield with the game folder's own panel when it has one. */
  gameSkin: boolean;
  /** Disk kept for long files (stems) decoded across runs, MB; 0 = off. */
  audioCacheMB: number;
  /** Per song folder: the files with stem strips, once the song has chosen. */
  strips: Record<string, string[]>;
  /** Keyboard and controller bindings (input/hub.svelte.ts). */
  controls: Controls;
  /** Record mode (play/recorder.svelte.ts). */
  record: RecordOptions;
  /** Updates (state/updates.svelte.ts). */
  updates: UpdateOptions;
}

export interface UpdateOptions {
  /** Look for a new version at start (at most once a day). */
  check: boolean;
  /** When it last looked, ms since the epoch. */
  lastCheckMs: number;
  /** A version you said to skip: not offered again at start. */
  skip: string | null;
}

export const DEFAULT_UPDATES: UpdateOptions = { check: true, lastCheckMs: 0, skip: null };

export interface RecordOptions {
  /** Beats of count-in before the cursor. */
  countIn: number;
  /** Click every beat while recording. */
  metronome: boolean;
  /** Mute the chart's own lane sounds while recording (never in Classic). */
  muteLanes: boolean;
  /** A press held this long or longer is a hold. */
  holdMinMs: number;
  /** Snap to the editor's grid, or to EZ2's own (1/48 beat). */
  quantize: 'grid' | 'exact';
}

export const DEFAULT_RECORD: RecordOptions = {
  countIn: 4,
  metronome: false,
  muteLanes: false,
  holdMinMs: 200,
  quantize: 'grid',
};

/**
 * EZ2BMS's own bindings, in keys.ini's grammar (chart-core input/keyconf.ts),
 * so they copy into EZ2PORT's file as they are. `ini` null: none chosen yet -
 * EZ2PORT's own keys.ini is taken (and kept) when one is found, else its
 * defaults are used. `debounceMs` null: settings.ini's, else the port's 8.
 */
export interface Controls {
  ini: string | null;
  debounceMs: number | null;
}

export const DEFAULT_SETTINGS: SettingsData = {
  gameRoot: null,
  exe: null,
  ez2play: null,
  songsRoot: null,
  recent: [],
  side: 'P1',
  speed: 250,
  audioOffsetMs: 0,
  visualOffsetMs: 0,
  inputOffsetMs: 0,
  keys: {},
  gameSkin: true,
  audioCacheMB: 2048,
  strips: {},
  controls: { ini: null, debounceMs: null },
  record: DEFAULT_RECORD,
  updates: DEFAULT_UPDATES,
};

export class Settings {
  data = $state<SettingsData>({ ...DEFAULT_SETTINGS });
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly backend: Backend) {}

  async load(): Promise<void> {
    const raw = await this.backend.loadSettings().catch(() => ({}));
    const r = raw as Partial<SettingsData>;
    this.data = {
      ...DEFAULT_SETTINGS,
      ...r,
      updates: { ...DEFAULT_UPDATES, ...(r.updates ?? {}) },
    };
  }

  /** Change and schedule a save. */
  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
    this.data[key] = value;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.backend.saveSettings($state.snapshot(this.data)), 400);
  }

  addRecent(dir: string): void {
    this.set('recent', [dir, ...this.data.recent.filter((d) => d !== dir)].slice(0, 8));
  }
}
