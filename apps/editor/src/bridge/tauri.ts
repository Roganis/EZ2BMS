// The desktop Backend: Tauri commands (src-tauri/src/lib.rs).

import { Channel, invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type {
  AppInfo,
  AudioEvent,
  AudioInfo,
  Backend,
  ClockSnapshot,
  Entry,
  Loaded,
  Located,
  PackageSpec,
  Probe,
  ProjectScan,
  Published,
  RunEvent,
  TestSpec,
  Trigger,
} from './types';

const bytesOf = (r: unknown): Uint8Array =>
  r instanceof ArrayBuffer ? new Uint8Array(r) : new Uint8Array(r as number[]);

/** Rust's Vec<u8> arrives from JSON as an array of numbers. */
const wirePackage = (p: PackageSpec) => ({
  ...p,
  files: p.files.map((f) => ({ path: f.path, bytes: Array.from(f.bytes) })),
});

export function tauriBackend(): Backend {
  return {
    kind: 'tauri',
    appInfo: () => invoke<AppInfo>('app_info'),
    readFile: async (path) => bytesOf(await invoke('fs_read', { path })),
    readText: (path) => invoke<string>('fs_read_text', { path }),
    writeText: (path, text, backup) => invoke('fs_write_text', { path, text, backup }),
    writeBytes: (path, bytes, backup) =>
      invoke('fs_write_bytes', { path, bytes: Array.from(bytes), backup }),
    list: (dir) => invoke<Entry[]>('fs_list', { dir }),
    scanProject: (dir) => invoke<ProjectScan>('project_scan', { dir }),
    loadSettings: () => invoke<Record<string, unknown>>('settings_load'),
    saveSettings: (value) => invoke('settings_save', { value }),
    pickFolder: async (title) => {
      const r = await open({ directory: true, title });
      return typeof r === 'string' ? r : null;
    },
    pickFiles: async (title, extensions) => {
      const r = await open({ multiple: true, title, filters: [{ name: 'Files', extensions }] });
      return Array.isArray(r) ? r : r ? [r] : [];
    },
    audio: {
      info: () => invoke<AudioInfo>('audio_info'),
      load: (paths) => invoke<Loaded[]>('audio_load', { paths }),
      peaks: async (id, framesPerPx) => {
        const b = bytesOf(await invoke('audio_peaks', { id, framesPerPx }));
        return new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1);
      },
      setEvents: (events: AudioEvent[]) => invoke('audio_set_events', { events }),
      play: (fromMs) => invoke('audio_play', { fromMs }),
      seek: (ms) => invoke('audio_seek', { ms }),
      stop: () => invoke('audio_stop'),
      trigger: (trigger: Trigger) => invoke<boolean>('audio_trigger', { trigger }),
      setMaster: (gain) => invoke('audio_set_master', { gain }),
      clock: () => invoke<ClockSnapshot>('audio_clock'),
      now: () => invoke<number>('audio_now'),
      streamClock: (on) => {
        let live = true;
        const ch = new Channel<ClockSnapshot>();
        ch.onmessage = (c) => {
          if (live) on(c);
        };
        void invoke('audio_clock_stream', { onClock: ch });
        return () => {
          live = false;
        };
      },
    },
    port: {
      locate: (start) => invoke<Located>('port_locate', { start }),
      probe: (path) => invoke<Probe>('port_probe', { path }),
      publish: (songsRoot, pkg) =>
        invoke<Published>('port_publish', { songsRoot, package: wirePackage(pkg) }),
      test: (spec: TestSpec, on: (e: RunEvent) => void) => {
        const ch = new Channel<RunEvent>();
        ch.onmessage = on;
        return invoke<number>('port_test', {
          test: { ...spec, package: wirePackage(spec.package) },
          onEvent: ch,
        });
      },
      stop: (id) => invoke('port_stop', { id }),
    },
  };
}
