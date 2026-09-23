// The song's pre-flight findings, as chart-core's lint sees them plus what
// only the editor knows (which sounds failed to load). Memoised on every
// chart's revision, so the status bar and the Issues tab share one run.

import { lintSong, resolveSound, type Finding } from '@ez2bms/chart-core';
import { chartTiming } from '../state/timing';
import type { App } from '../state/app.svelte';

let memo: { key: string; project: unknown; findings: Finding[] } | undefined;

export function songFindings(app: App): Finding[] {
  const p = app.project;
  if (!p) return [];
  const missing = new Set<string>();
  const revs: number[] = [];
  for (const c of p.charts) {
    revs.push(c.rev); // re-run when any chart changes
    for (const ch of c.doc.data.channels)
      if (app.audio.loadedInfo(ch.name)?.error) missing.add(ch.name);
  }
  const art = p.art;
  // The plate's report counts only for the plate as it is now.
  const pc = app.art.plateCheck;
  const plate = pc && pc.key === app.art.plateKey(p) ? pc.check : undefined;
  // Only a start you chose can be past the end (the importer's pick is a
  // note), and the last note's time needs only the tempo map - not a compile
  // of the whole chart on every edit.
  const ps = app.preview.settings(p);
  const doc = app.preview.chart(p)?.doc;
  const lastY = doc?.data.notes.reduce((m, n) => Math.max(m, n.y), -1) ?? -1;
  const preview =
    ps.file !== undefined
      ? { startMs: ps.startMs ?? 0, file: { src: ps.file, path: resolveSound(p.samples, ps.file) } }
      : ps.startMs !== undefined && doc && lastY >= 0
        ? { startMs: ps.startMs, lastNoteMs: chartTiming(doc).secondsAt(lastY) * 1000 }
        : undefined;
  const bga = app.bga.check(p);
  // A raw bmson in EZ2PORT's songs folder is imported by the port itself.
  const root = app.settings.data.songsRoot;
  const norm = (d: string) => d.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const insideSongsRoot = !!root && norm(p.dir).startsWith(norm(root) + '/');
  const key = `${p.sidecar.key}|${JSON.stringify(p.sidecar.category)}|${revs.join(',')}|${p.charts.map((c) => c.file + c.tier).join(',')}|${[...missing].join(',')}|${JSON.stringify(art)}|${JSON.stringify(plate)}|${JSON.stringify(preview)}|${JSON.stringify(bga)}|${insideSongsRoot}`;
  if (memo && memo.project === p && memo.key === key) return memo.findings;
  const findings = lintSong({
    key: p.sidecar.key,
    category: p.sidecar.category,
    charts: p.charts.map((c) => ({
      file: c.file,
      data: c.doc.data,
      mode: c.mode,
      tier: c.tier,
      notes: c.notes,
    })),
    missingSounds: missing,
    art,
    ...(plate ? { plate } : {}),
    ...(preview ? { preview } : {}),
    ...(bga ? { bga } : {}),
    ...(insideSongsRoot ? { insideSongsRoot } : {}),
  });
  memo = { key, project: p, findings };
  return findings;
}
