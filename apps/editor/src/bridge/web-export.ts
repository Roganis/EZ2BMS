// The host's exports in memory, for the browser build and its tests: the same
// rules as src-tauri export.rs, ez2bms-audio export.rs and ez2bms-launch
// gamepatch.rs, over the web mock's file map.
//
// - Keysounds: a whole 16-bit PCM WAV or .ssf is rewrapped with its samples
//   untouched (so a game keysound brought in and sent back is its own bytes
//   again, and one already in the folder is found equal); anything else is
//   "cut" at 44.1 kHz stereo 16-bit - from a 16-bit 44.1 kHz WAV exactly,
//   from anything else as silence of the right length (the browser build
//   decodes nothing; the Rust tests carry the real proof).
// - Into a game folder: every path checked (inside, no dot-folders), every
//   file as the plan saw it, reused files unchanged; then the replaced files
//   copied to .ez2bms-backup/<stamp>/ with a manifest, and the new ones put
//   in place under the names already on disk. restore undoes it where each
//   file is still what the export wrote.

import { fnv1a64Hex } from '@ez2bms/chart-core';
import type {
  ExportBackend,
  ExportBackup,
  ExportExpect,
  ExportJob,
  ExportProbeResult,
  RestoreReport,
} from './types';

export interface MemoryFiles {
  files: Map<string, Uint8Array>;
  mtimes: Map<string, number>;
  norm(p: string): string;
}

const OUT_RATE = 44100;
const BACKUP = '.ez2bms-backup';

interface Pcm {
  bits: number;
  channels: number;
  rate: number;
  pcm: Uint8Array;
}

function ssfParse(b: Uint8Array): Pcm | undefined {
  if (b.length < 18) return undefined;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const channels = dv.getUint16(0, true);
  const rate = dv.getUint32(2, true);
  const byteRate = dv.getUint32(6, true);
  const block = dv.getUint16(10, true);
  const bits = dv.getUint16(12, true);
  const data = dv.getUint32(14, true);
  const ok =
    channels >= 1 &&
    channels <= 8 &&
    [8, 16, 24, 32].includes(bits) &&
    rate >= 1000 &&
    rate <= 192000 &&
    block === channels * (bits / 8) &&
    byteRate === rate * block &&
    data <= b.length - 18;
  return ok ? { bits, channels, rate, pcm: b.subarray(18, 18 + data) } : undefined;
}

function wavParse(b: Uint8Array): Pcm | undefined {
  const tag = (at: number) => String.fromCharCode(...b.subarray(at, at + 4));
  if (b.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return undefined;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let fmt: Omit<Pcm, 'pcm'> | undefined;
  for (let p = 12; p + 8 <= b.length;) {
    const id = tag(p);
    const size = dv.getUint32(p + 4, true);
    const body = p + 8;
    if (id === 'fmt ') {
      const t = dv.getUint16(body, true);
      const channels = dv.getUint16(body + 2, true);
      const bits = dv.getUint16(body + 14, true);
      const pcmTag = t === 1 || (t === 0xfffe && size >= 40 && dv.getUint16(body + 24, true) === 1);
      if (!pcmTag || !channels || dv.getUint16(body + 12, true) !== channels * (bits / 8))
        return undefined;
      fmt = { bits, channels, rate: dv.getUint32(body + 4, true) };
    } else if (id === 'data') {
      if (!fmt) return undefined;
      return { ...fmt, pcm: b.subarray(body, Math.min(b.length, body + size)) };
    }
    p = body + size + (size & 1);
  }
  return undefined;
}

function header(kind: 'ssf' | 'wav', { bits, channels, rate, pcm }: Pcm): Uint8Array {
  const block = channels * (bits / 8);
  if (kind === 'ssf') {
    const out = new Uint8Array(18 + pcm.length);
    const o = new DataView(out.buffer);
    o.setUint16(0, channels, true);
    o.setUint32(2, rate, true);
    o.setUint32(6, rate * block, true);
    o.setUint16(10, block, true);
    o.setUint16(12, bits, true);
    o.setUint32(14, pcm.length, true);
    out.set(pcm, 18);
    return out;
  }
  const pad = pcm.length & 1;
  const out = new Uint8Array(44 + pcm.length + pad);
  const o = new DataView(out.buffer);
  out.set([0x52, 0x49, 0x46, 0x46], 0);
  o.setUint32(4, 36 + pcm.length + pad, true);
  out.set([0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20], 8);
  o.setUint32(16, 16, true);
  o.setUint16(20, 1, true);
  o.setUint16(22, channels, true);
  o.setUint32(24, rate, true);
  o.setUint32(28, rate * block, true);
  o.setUint16(32, block, true);
  o.setUint16(34, bits, true);
  out.set([0x64, 0x61, 0x74, 0x61], 36);
  o.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

const extOf = (p: string) => p.slice(p.lastIndexOf('.') + 1).toLowerCase();

function pcm16(bytes: Uint8Array, ext: string): Pcm | undefined {
  const p =
    ext === 'ssf' || ext === 'ezw' ? ssfParse(bytes) : ext === 'wav' ? wavParse(bytes) : undefined;
  return p && p.bits === 16 && p.channels <= 2 ? p : undefined;
}

/** Frames [start, end) as 16-bit stereo at 44.1 kHz (see the header). */
function cut(bytes: Uint8Array, ext: string, start: number, end: number | null): Pcm {
  const src = pcm16(bytes, ext);
  let frames: Uint8Array;
  if (src && src.rate === OUT_RATE) {
    const n = src.pcm.length / (2 * src.channels);
    const a = Math.min(start, n);
    const b = Math.max(a, Math.min(end ?? n, n));
    const dv = new DataView(src.pcm.buffer, src.pcm.byteOffset, src.pcm.byteLength);
    frames = new Uint8Array((b - a) * 4);
    const o = new DataView(frames.buffer);
    for (let i = a; i < b; i++) {
      const l = dv.getInt16(i * 2 * src.channels, true);
      const r = src.channels === 2 ? dv.getInt16(i * 4 + 2, true) : l;
      o.setInt16((i - a) * 4, l, true);
      o.setInt16((i - a) * 4 + 2, r, true);
    }
  } else frames = new Uint8Array(Math.max(0, (end ?? start + 4410) - start) * 4);
  if (!frames.length) frames = new Uint8Array(64 * 4);
  return { bits: 16, channels: 2, rate: OUT_RATE, pcm: frames };
}

type How = NonNullable<ExportProbeResult['how']>;

function makeSound(
  bytes: Uint8Array,
  src: string,
  start: number,
  end: number | null,
  format: 'ssf' | 'wav',
): { bytes: Uint8Array; how: How } {
  const ext = extOf(src);
  const whole = start === 0 && end === null;
  if (format === 'ssf') {
    const p = whole ? pcm16(bytes, ext) : undefined;
    if (p) return { bytes: header('ssf', p), how: 'rewrap' };
    return { bytes: header('ssf', cut(bytes, ext, start, end)), how: 'cut' };
  }
  if (!whole) return { bytes: header('wav', cut(bytes, ext, start, end)), how: 'cut' };
  if (ext === 'wav') return { bytes: bytes.slice(), how: 'copy' };
  const s = ext === 'ssf' || ext === 'ezw' ? ssfParse(bytes) : undefined;
  if (s) return { bytes: header('wav', s), how: 'rewrap' };
  return { bytes: header('wav', cut(bytes, ext, 0, null)), how: 'decode' };
}

function sameAudio(a: Uint8Array, b: Uint8Array): boolean {
  const x = ssfParse(a);
  const y = ssfParse(b);
  if (!x || !y || x.channels !== y.channels || x.rate !== y.rate || x.bits !== y.bits) return false;
  if (x.pcm.length !== y.pcm.length) return false;
  for (let i = 0; i < x.pcm.length; i++) if (x.pcm[i] !== y.pcm[i]) return false;
  return true;
}

interface ManifestFile {
  path: string;
  action: 'replaced' | 'created';
  before: string | null;
  after: string;
  backup: string | null;
}

interface Manifest {
  ez2bms: 1;
  stamp: string;
  label: string;
  created_ms: number;
  state: string;
  files: ManifestFile[];
}

export function memoryExport(m: MemoryFiles): ExportBackend {
  const { files, norm } = m;
  const put = (p: string, b: Uint8Array) => {
    files.set(p, b);
    m.mtimes.set(p, Date.now());
  };
  const sum = (b: Uint8Array | undefined) => (b ? `${b.length}:${fnv1a64Hex(b)}` : null);

  /** The names in a folder of the map. */
  const names = (dir: string) => {
    const d = `${dir}/`;
    const out = new Set<string>();
    for (const k of files.keys()) if (k.startsWith(d)) out.add(k.slice(d.length).split('/')[0]!);
    return [...out];
  };
  /** A root-relative path matched as on disk (exact, then any case). */
  const resolve = (root: string, rel: string): { path: string; exists: boolean } => {
    const parts = rel.split('/');
    if (
      !rel ||
      rel.includes('\\') ||
      parts.some((s) => !s || s === '.' || s === '..' || s.startsWith('.'))
    )
      throw new Error(`${rel}: not a path inside the game folder`);
    let p = norm(root);
    let found = true;
    for (const part of parts) {
      if (found) {
        const there = names(p);
        const hit =
          there.find((n) => n === part) ??
          there.find((n) => n.toLowerCase() === part.toLowerCase());
        if (hit !== undefined) {
          p = `${p}/${hit}`;
          continue;
        }
        found = false;
      }
      p = `${p}/${part}`;
    }
    return { path: p, exists: found && files.has(p) };
  };
  const rel = (root: string, p: string) => p.slice(norm(root).length + 1);
  const check = (e: ExportExpect | undefined, now: Uint8Array | undefined) =>
    !e || e === 'any' ? true : e === 'absent' ? !now : !!now && fnv1a64Hex(now) === e;

  const entries = (job: ExportJob, progress?: (d: number, t: number) => void) => {
    const out: { rel: string; bytes: Uint8Array; expect?: ExportExpect }[] = [];
    for (const f of job.files) out.push({ rel: f.path, bytes: f.bytes, expect: f.expect });
    for (const c of job.copies ?? []) {
      const b = files.get(norm(c.from));
      if (!b) throw new Error(`${c.from}: no such file`);
      out.push({ rel: c.path, bytes: b.slice(), expect: c.expect });
    }
    const sounds = job.sounds ?? [];
    sounds.forEach((s, i) => {
      const b = files.get(norm(s.src));
      if (!b) throw new Error(`${s.src}: no such file`);
      out.push({
        rel: s.path,
        bytes: makeSound(b, s.src, s.start_frame, s.end_frame, s.format).bytes,
        expect: s.expect,
      });
      progress?.(i + 1, sounds.length + out.length * 2);
    });
    return out;
  };

  const manifestPath = (root: string, stamp: string) =>
    `${norm(root)}/${BACKUP}/${stamp}/manifest.json`;
  const readManifest = (root: string, stamp: string): Manifest => {
    const b = files.get(manifestPath(root, stamp));
    if (!b) throw new Error(`no backup named ${stamp}`);
    return JSON.parse(new TextDecoder().decode(b)) as Manifest;
  };
  const writeManifest = (root: string, mf: Manifest) =>
    put(manifestPath(root, mf.stamp), new TextEncoder().encode(JSON.stringify(mf, null, 2)));

  return {
    probe: async (sounds) =>
      sounds.map((s) => {
        const b = files.get(norm(s.src));
        if (!b) return { how: null, equal: null, fnv: null, error: `${s.src}: no such file` };
        const made = makeSound(b, s.src, s.start_frame, s.end_frame, 'ssf');
        const at = s.candidates.findIndex((c) => {
          const there = files.get(norm(c));
          return !!there && sameAudio(made.bytes, there);
        });
        return {
          how: made.how,
          equal: at < 0 ? null : at,
          fnv: at < 0 ? null : fnv1a64Hex(files.get(norm(s.candidates[at]!))!),
          error: null,
        };
      }),

    toGame: async (root, job, onProgress) => {
      const stamp = job.stamp ?? '';
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(stamp)) throw new Error(`a backup name, not ${stamp}`);
      if (files.has(manifestPath(root, stamp)))
        throw new Error(`a backup named ${stamp} is already there`);
      const list = entries(job, onProgress);
      const targets = list.map((e) => resolve(root, e.rel));
      const seen = new Set<string>();
      targets.forEach((t, i) => {
        if (seen.has(t.path.toLowerCase())) throw new Error(`${list[i]!.rel} is written twice`);
        seen.add(t.path.toLowerCase());
        if (!check(list[i]!.expect, t.exists ? files.get(t.path) : undefined))
          throw new Error(
            `${list[i]!.rel} is not what it was when the export was planned: plan it again`,
          );
      });
      for (const k of job.keep ?? []) {
        const t = resolve(root, k.path);
        const b = t.exists ? files.get(t.path) : undefined;
        if (!b || fnv1a64Hex(b) !== k.fnv)
          throw new Error(
            `${k.path}, which the export uses as it is, has changed or gone: plan it again`,
          );
      }
      const mf: Manifest = {
        ez2bms: 1,
        stamp,
        label: job.label ?? '',
        created_ms: Date.now(),
        state: 'applied',
        files: [],
      };
      targets.forEach((t, i) => {
        const r = rel(root, t.path);
        const before = t.exists ? files.get(t.path)! : undefined;
        if (before) put(`${norm(root)}/${BACKUP}/${stamp}/files/${r}`, before.slice());
        mf.files.push({
          path: r,
          action: before ? 'replaced' : 'created',
          before: sum(before),
          after: sum(list[i]!.bytes)!,
          backup: before ? `files/${r}` : null,
        });
      });
      writeManifest(root, mf);
      const total = (job.sounds?.length ?? 0) + list.length * 2;
      targets.forEach((t, i) => {
        put(t.path, list[i]!.bytes);
        onProgress?.(total - list.length + i + 1, total);
      });
      return {
        stamp,
        created: mf.files.filter((f) => f.action === 'created').map((f) => f.path),
        replaced: mf.files.filter((f) => f.action === 'replaced').map((f) => f.path),
      };
    },

    toFolder: async (dest, job, onProgress) => {
      const d = norm(dest);
      if ([...files.keys()].some((k) => k.startsWith(`${d}/`)))
        throw new Error(`${dest} is not empty`);
      const list = entries(job, onProgress);
      for (const e of list) resolve(d, e.rel); // the same path rules
      list.forEach((e, i) => {
        put(`${d}/${e.rel}`, e.bytes);
        onProgress?.(i + 1, list.length);
      });
      return { dir: d, files: list.length };
    },

    backups: async (root) => {
      const out: ExportBackup[] = [];
      for (const stamp of names(`${norm(root)}/${BACKUP}`)) {
        try {
          const mf = readManifest(root, stamp);
          out.push({
            stamp: mf.stamp,
            label: mf.label,
            created_ms: mf.created_ms,
            state: mf.state,
            files: mf.files.length,
          });
        } catch {
          // not an export's backup
        }
      }
      return out.sort((a, b) => b.created_ms - a.created_ms || b.stamp.localeCompare(a.stamp));
    },

    restore: async (root, stamp, force = false) => {
      const mf = readManifest(root, stamp);
      const r: RestoreReport = { restored: [], removed: [], conflicts: [], skipped: [] };
      const todo: ManifestFile[] = [];
      for (const f of mf.files) {
        const now = sum(files.get(`${norm(root)}/${f.path}`));
        if (now === f.after || (force && now !== f.before)) todo.push(f);
        else if (now === f.before) r.skipped.push(f.path);
        else r.conflicts.push(f.path);
      }
      if (r.conflicts.length && !force) return r;
      for (const f of todo) {
        const p = `${norm(root)}/${f.path}`;
        if (f.backup) {
          put(p, files.get(`${norm(root)}/${BACKUP}/${stamp}/${f.backup}`)!.slice());
          r.restored.push(f.path);
        } else {
          files.delete(p);
          r.removed.push(f.path);
        }
      }
      mf.state = 'restored';
      writeManifest(root, mf);
      return r;
    },
  };
}
