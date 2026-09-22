// The song's pre-flight findings, as chart-core's lint sees them plus what
// only the editor knows (which sounds failed to load). Memoised on every
// chart's revision, so the status bar and the Issues tab share one run.

import { lintSong, type Finding } from '@ez2bms/chart-core';
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
  const key = `${p.sidecar.key}|${revs.join(',')}|${p.charts.map((c) => c.file + c.tier).join(',')}|${[...missing].join(',')}`;
  if (memo && memo.project === p && memo.key === key) return memo.findings;
  const findings = lintSong({
    key: p.sidecar.key,
    charts: p.charts.map((c) => ({ file: c.file, data: c.doc.data, mode: c.mode, tier: c.tier })),
    missingSounds: missing,
  });
  memo = { key, project: p, findings };
  return findings;
}
