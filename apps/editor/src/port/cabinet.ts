// The open song sent back to the original game (M6): chart-core plans it
// against the game folder (publish/cabinet.ts), the host says which of its
// keysounds the folder already holds (export_probe), chart-core names them,
// encrypts the charts and patches song.bin, and lint says what the cabinet
// will do differently from EZ2PORT. The review holds the finished job, so
// what the dialog shows is exactly what Export writes.
//
// Into a game folder the job carries, for every file, what it must still be
// (the FNV of the bytes the plan read, or absent): the host refuses the
// whole export if anything changed since (ez2bms-launch gamepatch.rs), and
// keeps a backup of every file it replaces, which Restore puts back.

import {
  ez2Decrypt,
  finishCabinet,
  fnv1a64Hex,
  lintCabinet,
  looksPlaintext,
  modeNames,
  nameSounds,
  planCabinet,
  resolveSound,
  soundCandidates,
  type CabinetOutput,
  type CabinetPlan,
  type CabinetTarget,
  type Finding,
  type Game,
  type SoundNaming,
} from '@ez2bms/chart-core';
import { soundPath } from '../audio/paths';
import type { ExportJob, ExportProbeResult, ExportReport } from '../bridge';
import { joinPath } from '../bridge';
import { t } from '../i18n/i18n.svelte';
import type { App } from '../state/app.svelte';
import type { ChartSlot } from '../state/project.svelte';

export type CabinetDest = { kind: 'game' } | { kind: 'folder'; dir: string };

export interface CabinetReview {
  /** The game folder the plan was made against. */
  root: string;
  target: CabinetTarget;
  plan: CabinetPlan;
  names: Map<number, SoundNaming>;
  out: CabinetOutput;
  findings: Finding[];
  dest: CabinetDest;
  job: ExportJob;
  sounds: { write: number; reused: number; missing: number; converted: number };
}

export interface CabinetOptions {
  dest: CabinetDest;
  /** Folder mode: copy the keysounds the game already has too, so the folder is the whole song. */
  includeUnchanged?: boolean;
}

/** A backup's name: when, and which song (letters, digits, - and _ only, as the host takes). */
export function backupStamp(dir: string, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const when = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `${when}-${dir.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 80);
}

export async function prepareCabinet(
  app: App,
  game: Game,
  target: CabinetTarget,
  slots: readonly ChartSlot[],
  o: CabinetOptions,
): Promise<CabinetReview> {
  const p = app.project;
  const root = app.settings.data.gameRoot;
  if (!p) throw new Error(t('export.noSong'));
  if (!root) throw new Error(t('import.game.noRoot'));
  const tables = game.tables;
  // The original reads only encrypted charts, and only the executable has the keys.
  if (!tables)
    throw new Error(
      game.tablesError != null
        ? t('export.cabinet.noTables', { why: game.tablesError })
        : t('export.cabinet.noExe'),
    );
  const samples = app.audio.lengths();
  const listing = await game.fs.list(`sound/${target.dir}`);
  const plan = planCabinet({
    target,
    files: listing,
    gds: game.gds,
    charts: slots.map((c) => ({ file: c.file, data: c.doc.data, mode: c.mode, tier: c.tier })),
    ...(p.sidecar.source ? { source: p.sidecar.source } : {}),
    samples,
  });

  // Each keysound: its file in the song folder, or none.
  const defs = plan.registry.defs;
  const missing = defs.map((d) => resolveSound(p.samples, d.src) === undefined);
  const candidates = soundCandidates(plan, listing);
  const asked = defs.flatMap((_, i) => (missing[i] ? [] : [i]));
  const answers = await app.backend.export.probe(
    asked.map((i) => ({
      src: soundPath(p.dir, p.samples, defs[i]!.src),
      start_frame: defs[i]!.startFrame,
      end_frame: defs[i]!.endFrame,
      candidates: candidates[i]!.map((c) => joinPath(root, `${plan.dir}/${c}`)),
    })),
  );
  const probe = new Map<number, ExportProbeResult>(asked.map((d, k) => [d, answers[k]!]));
  const unreadable = asked.filter((i) => probe.get(i)?.error);
  const names = nameSounds(
    plan,
    listing,
    (i) => {
      const r = probe.get(i);
      return r?.equal != null ? candidates[i]![r.equal]! : null;
    },
    (i) => missing[i]!,
  );

  // The files each chart replaces, as they are now: their .ini decides
  // whether ours is needed, and their bytes are what the export expects.
  const before = new Map<string, Uint8Array>();
  for (const cp of plan.charts)
    for (const k of ['ez', 'ezi', 'ini'] as const) {
      if (!cp.exists[k]) continue;
      const b = await game.fs.read(cp.paths[k]);
      if (!b) throw new Error(t('export.cabinet.unreadable', { file: cp.paths[k] }));
      before.set(cp.paths[k], b);
    }
  for (const f of Object.values(game.songdbFiles)) if (f) before.set(f.path, f.bytes);
  const out = finishCabinet(plan, names, {
    tables,
    songdb: game.songdbFiles,
    ...(game.songdbTables ? { songdbTables: game.songdbTables } : {}),
    currentIni: (path) => {
      const b = before.get(path);
      return b && !looksPlaintext('ini', b) ? ez2Decrypt(b, tables.ini) : b;
    },
  });

  const converted = out.sounds.filter((s) =>
    ['cut', 'decode'].includes(probe.get(s.def)?.how ?? ''),
  ).length;
  const findings = lintCabinet(plan, { out, names, samples, converted });
  if (unreadable.length) {
    const files =
      unreadable
        .slice(0, 3)
        .map((i) => `${defs[i]!.src} (${probe.get(i)!.error})`)
        .join(', ') + (unreadable.length > 3 ? '...' : '');
    findings.unshift({
      rule: 'cabinet-sound-unreadable',
      severity: 'error',
      message: t('export.cabinet.soundsUnreadable', { n: unreadable.length, files }),
    });
  }

  const inGame = o.dest.kind === 'game';
  const sound = (s: { def: number; path: string }) => {
    const d = defs[s.def]!;
    return {
      src: soundPath(p.dir, p.samples, d.src),
      start_frame: d.startFrame,
      end_frame: d.endFrame,
      path: s.path,
      format: 'ssf' as const,
      ...(inGame ? { expect: 'absent' } : {}),
    };
  };
  // A reused file's FNV, as the probe found it equal: it must still be that.
  const reusedFnv = new Map<string, string>();
  names.forEach((n, i) => {
    const fnv = probe.get(i)?.fnv;
    if (!n.write && !n.missing && fnv)
      reusedFnv.set(`${plan.dir}/${n.name}.ssf`.toLowerCase(), fnv);
  });
  const title = songTitle(app, target);
  const job: ExportJob = inGame
    ? {
        label: `${title} -> sound/${target.dir} (${plan.charts.map((c) => `${modeNames(c.chart.mode).label} ${c.chart.tier}`).join(', ')})`,
        files: out.files.map((f) => ({
          path: f.path,
          bytes: f.bytes,
          expect: f.replaces ? fnv1a64Hex(before.get(f.path)!) : 'absent',
        })),
        sounds: out.sounds.map(sound),
        keep: out.reused.flatMap((path) => {
          const fnv = reusedFnv.get(path.toLowerCase());
          return fnv ? [{ path, fnv }] : [];
        }),
      }
    : {
        files: [
          ...out.files.map((f) => ({ path: f.path, bytes: f.bytes })),
          {
            path: 'EZ2BMS-EXPORT.txt',
            bytes: new TextEncoder().encode(folderNote(title, root, plan, out, o.includeUnchanged)),
          },
        ],
        sounds: out.sounds.map(sound),
        ...(o.includeUnchanged
          ? { copies: out.reused.map((path) => ({ from: joinPath(root, path), path })) }
          : {}),
      };
  return {
    root,
    target,
    plan,
    names,
    out,
    findings,
    dest: o.dest,
    job,
    sounds: {
      write: out.sounds.length,
      reused: out.reused.length,
      missing: missing.filter(Boolean).length,
      converted,
    },
  };
}

function songTitle(app: App, target: CabinetTarget): string {
  const title = app.project?.charts[0]?.doc.data.info.title;
  return title || target.title?.title || target.dir;
}

/**
 * What a folder export holds and where each file goes (the folder's
 * EZ2BMS-EXPORT.txt). In the editor's language: the person exporting is the
 * one who reads it, copying the folder onto the cabinet.
 */
function folderNote(
  title: string,
  root: string,
  plan: CabinetPlan,
  out: CabinetOutput,
  includeUnchanged?: boolean,
): string {
  const lines = [
    t('export.note.title', { title, dir: plan.target.dir }),
    t('export.note.made', { when: new Date().toISOString(), root }),
    '',
    t('export.note.copy'),
  ];
  for (const f of out.files) {
    const what =
      f.kind === 'songdb'
        ? 'export.note.songdb'
        : f.replaces
          ? 'export.note.replaces'
          : 'export.note.new';
    lines.push(`  ${t(what, { file: f.path })}`);
  }
  for (const s of out.sounds) lines.push(`  ${t('export.note.sound', { file: s.path })}`);
  if (includeUnchanged)
    for (const r of out.reused) lines.push(`  ${t('export.note.own', { file: r })}`);
  else if (out.reused.length) lines.push(`  ${t('export.note.reused', { n: out.reused.length })}`);
  lines.push('');
  return lines.join('\r\n');
}

/** Write the review's job, and remember the target in the song file. */
export async function writeCabinet(
  app: App,
  r: CabinetReview,
  onProgress?: (done: number, total: number) => void,
): Promise<{ report?: ExportReport; folder?: { dir: string; files: number } }> {
  let result: { report?: ExportReport; folder?: { dir: string; files: number } };
  if (r.dest.kind === 'game') {
    // Named now, not when planned, and never the name of an earlier backup
    // (two exports in one second).
    const taken = new Set((await app.backend.export.backups(r.root)).map((b) => b.stamp));
    const want = backupStamp(r.target.dir);
    let stamp = want;
    for (let n = 2; taken.has(stamp); n++) stamp = `${want.slice(0, 76)}-${n}`;
    result = { report: await app.backend.export.toGame(r.root, { ...r.job, stamp }, onProgress) };
  } else result = { folder: await app.backend.export.toFolder(r.dest.dir, r.job, onProgress) };
  const p = app.project;
  if (p && p.sidecar.cabinet?.key !== r.target.dir) {
    p.sidecar.cabinet = { key: r.target.dir };
    await p.saveSidecar().catch(() => {});
  }
  return result;
}
