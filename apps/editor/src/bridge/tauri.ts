// The desktop Backend: Tauri commands (src-tauri/src/lib.rs).

import { Channel, invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';
import type {
  AppInfo,
  AudioEvent,
  AudioInfo,
  Backend,
  ClockSnapshot,
  Entry,
  Imported,
  Inspection,
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
    importFiles: (dir, paths) => invoke<Imported[]>('fs_copy_into', { dir, paths }),
    renameFile: (from, to) => invoke('fs_rename', { from, to }),
    onFileDrop: (cb) => {
      // Tauri takes OS file drops itself (dragDropEnabled), so the page never
      // sees them as DOM events; its positions are physical pixels.
      let stop: (() => void) | undefined;
      let gone = false;
      void getCurrentWebview()
        .onDragDropEvent((e) => {
          const p = e.payload;
          const dpr = window.devicePixelRatio || 1;
          const pos =
            'position' in p ? { x: p.position.x / dpr, y: p.position.y / dpr } : { x: 0, y: 0 };
          if (p.type === 'leave') cb({ kind: 'leave', paths: [], ...pos });
          else if (p.type === 'drop') cb({ kind: 'drop', paths: p.paths, ...pos });
          else cb({ kind: 'over', paths: [], ...pos });
        })
        .then((un) => (gone ? un() : (stop = un)));
      return () => {
        gone = true;
        stop?.();
      };
    },
    audio: {
      info: () => invoke<AudioInfo>('audio_info'),
      load: (paths) => invoke<Loaded[]>('audio_load', { paths }),
      peaks: async (id, framesPerPx) => {
        const b = bytesOf(await invoke('audio_peaks', { id, framesPerPx }));
        return new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1);
      },
      thumbs: async (ids, width) => {
        const b = bytesOf(await invoke('audio_thumbs', { ids, width }));
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
      inspect: (songsRoot, key, gameRoot) =>
        invoke<Inspection>('port_inspect', { songsRoot, key, gameRoot }),
      publish: (songsRoot, pkg, options) =>
        invoke<Published>('port_publish', {
          songsRoot,
          package: wirePackage(pkg),
          options: options ?? null,
        }),
      retire: (songsRoot, key, songIni) => invoke('port_retire', { songsRoot, key, songIni }),
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
