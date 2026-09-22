// The song's pre-flight findings, as chart-core's lint sees them plus what
// only the editor knows (which sounds failed to load).

import { lintSong, type Finding } from '@ez2bms/chart-core';
import type { App } from '../state/app.svelte';

export function songFindings(app: App): Finding[] {
  const p = app.project;
  if (!p) return [];
  const missing = new Set<string>();
  for (const c of p.charts) {
    void c.rev; // re-run when any chart changes
    for (const ch of c.doc.data.channels)
      if (app.audio.loadedInfo(ch.name)?.error) missing.add(ch.name);
  }
  return lintSong({
    key: p.sidecar.key,
    charts: p.charts.map((c) => ({ file: c.file, data: c.doc.data, mode: c.mode, tier: c.tier })),
    missingSounds: missing,
  });
}
