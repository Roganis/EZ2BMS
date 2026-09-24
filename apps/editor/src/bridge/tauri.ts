// The desktop Backend: Tauri commands (src-tauri/src/lib.rs).

import { Channel, convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';
import type {
  AppInfo,
  AudioCacheInfo,
  Audition,
  AudioEvent,
  AudioInfo,
  Backend,
  Clicks,
  ClockSnapshot,
  ConfigFile,
  Entry,
  ExportBackup,
  ExportJob,
  ExportProbeResult,
  ExportReport,
  Imported,
  ImportReport,
  InputInfo,
  Inspection,
  Loaded,
  Located,
  PackageSpec,
  PadEvent,
  Probe,
  ProjectScan,
  Published,
  RestoreReport,
  RunEvent,
  SoundAnalysis,
  TestSpec,
  Trigger,
} from './types';

const bytesOf = (r: unknown): Uint8Array =>
  r instanceof ArrayBuffer ? new Uint8Array(r) : new Uint8Array(r as number[]);

/** Rust's Vec<u8> arrives from JSON as an array of numbers. */
/** An export job over IPC: bytes as arrays, as a package's are. */
const wireJob = (j: ExportJob) => ({
  stamp: j.stamp ?? null,
  label: j.label ?? null,
  files: j.files.map((f) => ({
    path: f.path,
    bytes: Array.from(f.bytes),
    expect: f.expect ?? null,
  })),
  copies: (j.copies ?? []).map((c) => ({ ...c, expect: c.expect ?? null })),
  sounds: (j.sounds ?? []).map((s) => ({ ...s, expect: s.expect ?? null })),
  keep: j.keep ?? [],
});

const wirePackage = (p: PackageSpec) => ({
  ...p,
  files: p.files.map((f) => ({ path: f.path, bytes: Array.from(f.bytes) })),
});

export function tauriBackend(): Backend {
  return {
    kind: 'tauri',
    appInfo: () => invoke<AppInfo>('app_info'),
    diag: {
      log: (level, message) => void invoke('diag_log', { level, message }).catch(() => {}),
      tail: (maxBytes) => invoke<string>('diag_tail', { maxBytes }),
      revealLogs: () => invoke('diag_reveal_logs'),
      onPanic: (cb) => {
        let stop: (() => void) | undefined;
        let gone = false;
        void listen<string>('diag://panic', (e) => cb(e.payload)).then((u) => {
          if (gone) u();
          else stop = u;
        });
        return () => {
          gone = true;
          stop?.();
        };
      },
    },
    readFile: async (path) => bytesOf(await invoke('fs_read', { path })),
    readRange: async (path, offset, length) => {
      const b = bytesOf(await invoke('fs_read_range', { path, offset, length }));
      const dv = new DataView(b.buffer, b.byteOffset, 8);
      return { size: Number(dv.getBigUint64(0, true)), bytes: b.subarray(8) };
    },
    mediaUrl: async (path) => {
      await invoke('media_allow', { path });
      return convertFileSrc(path);
    },
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
    importFiles: (dir, paths, kind = 'audio') =>
      invoke<Imported[]>('fs_copy_into', { dir, paths, kind }),
    renameFile: (from, to) => invoke('fs_rename', { from, to }),
    importRun: (dest, job, onProgress) => {
      const ch = new Channel<[number, number]>();
      if (onProgress) ch.onmessage = ([done, total]) => onProgress(done, total);
      return invoke<ImportReport>('import_run', { dest, job, onProgress: ch });
    },
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
      peakRange: async (id, level, from, count) => {
        const b = bytesOf(await invoke('audio_peak_range', { id, level, from, count }));
        const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
        // A copy, so the pairs are aligned whatever the response's offset.
        const body = b.slice(24);
        return {
          base: dv.getUint32(0, true),
          levels: dv.getUint32(4, true),
          frames: Number(dv.getBigUint64(8, true)),
          length: dv.getUint32(16, true),
          from: dv.getUint32(20, true),
          data: new Int16Array(body.buffer, 0, body.byteLength >> 1),
        };
      },
      analysis: (id) => invoke<SoundAnalysis>('audio_analysis', { id }),
      cacheInfo: () => invoke<AudioCacheInfo>('audio_cache_info'),
      cacheSetCap: (mb) => invoke('audio_cache_set_cap', { mb }),
      cacheClear: () => invoke('audio_cache_clear'),
      setEvents: (events: AudioEvent[]) => invoke('audio_set_events', { events }),
      play: (fromMs) => invoke('audio_play', { fromMs }),
      seek: (ms) => invoke('audio_seek', { ms }),
      stop: () => invoke('audio_stop'),
      trigger: (trigger: Trigger) => invoke<boolean>('audio_trigger', { trigger }),
      setMaster: (gain) => invoke('audio_set_master', { gain }),
      clock: () => invoke<ClockSnapshot>('audio_clock'),
      now: () => invoke<number>('audio_now'),
      previewOverview: async (events, endMs, width) => {
        const b = bytesOf(await invoke('audio_preview_overview', { events, endMs, width }));
        return new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1);
      },
      preview: (job) => invoke<Audition>('audio_preview', { job }),
      clicks: () => invoke<Clicks>('audio_clicks'),
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
    media: {
      art: async (path, job) => {
        // [u32 width][u32 height] then the pixels.
        const b = bytesOf(await invoke('media_art', { path, job }));
        const dv = new DataView(b.buffer, b.byteOffset, 8);
        return { w: dv.getUint32(0, true), h: dv.getUint32(4, true), rgb: b.subarray(8) };
      },
      plate: async (spec) => {
        // [u32 w][u32 h][u32 n][n code points] then the pixels.
        const b = bytesOf(await invoke('media_plate', { spec }));
        const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
        const n = dv.getUint32(8, true);
        const missing = Array.from({ length: n }, (_, i) =>
          String.fromCodePoint(dv.getUint32(12 + i * 4, true)),
        );
        const w = dv.getUint32(0, true);
        const h = dv.getUint32(4, true);
        return { w, h, missing, rgb: b.subarray(12 + n * 4) };
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
    input: {
      info: () => invoke<InputInfo>('input_devices'),
      stream: (on) => {
        let live = true;
        const ch = new Channel<PadEvent[]>();
        ch.onmessage = (evs) => {
          if (live) on(evs);
        };
        void invoke('input_stream', { onEvent: ch });
        return () => {
          live = false;
        };
      },
      hold: (active) => invoke('input_hold', { active }),
      configFiles: (ez2play, gameRoot) =>
        invoke<ConfigFile[]>('port_config_files', { ez2play, gameRoot }),
    },
    export: {
      probe: (sounds) => invoke<ExportProbeResult[]>('export_probe', { sounds }),
      toGame: (root, job, onProgress) => {
        const ch = new Channel<[number, number]>();
        ch.onmessage = ([d, t]) => onProgress?.(d, t);
        return invoke<ExportReport>('export_game', { root, job: wireJob(job), onProgress: ch });
      },
      toFolder: (dest, job, onProgress) => {
        const ch = new Channel<[number, number]>();
        ch.onmessage = ([d, t]) => onProgress?.(d, t);
        return invoke('export_folder', { dest, job: wireJob(job), onProgress: ch });
      },
      backups: (root) => invoke<ExportBackup[]>('export_backups', { root }),
      restore: (root, stamp, force) =>
        invoke<RestoreReport>('export_restore', { root, stamp, force: force ?? false }),
    },
  };
}
