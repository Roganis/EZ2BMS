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
};

export class Settings {
  data = $state<SettingsData>({ ...DEFAULT_SETTINGS });
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly backend: Backend) {}

  async load(): Promise<void> {
    const raw = await this.backend.loadSettings().catch(() => ({}));
    this.data = { ...DEFAULT_SETTINGS, ...(raw as Partial<SettingsData>) };
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
