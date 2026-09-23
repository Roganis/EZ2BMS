// The open song as a BMS folder (M6): chart-core writes the charts and says
// which sounds are copied, made or missing (io/bms/export.ts); the host
// copies and cuts them into a new folder, all at once (export_folder).

import {
  exportBmsSong,
  isMovieName,
  resolveSound,
  type BmsSongExport,
  type BmsTextEncoding,
} from '@ez2bms/chart-core';
import { joinPath, type ExportJob } from '../bridge';
import type { App } from '../state/app.svelte';
import type { ChartSlot } from '../state/project.svelte';

export interface BmsChoices {
  map: 'ez2' | 'keys';
  encoding: 'auto' | BmsTextEncoding;
  base: 'auto' | 36 | 62;
}

export interface BmsReview {
  exp: BmsSongExport;
  job: ExportJob;
}

export function prepareBms(app: App, slots: readonly ChartSlot[], c: BmsChoices): BmsReview {
  const p = app.project;
  if (!p) throw new Error('no song is open');
  // The song's art and movie, as a publish would take them.
  const eyecatch = p.art.eyecatch?.path;
  const preview = p.sidecar.preview?.file && resolveSound(p.samples, p.sidecar.preview.file);
  const bga = p.bga;
  const exp = exportBmsSong(
    slots.map((s) => ({ file: s.file, data: s.doc.data, mode: s.mode, tier: s.tier })),
    {
      map: c.map,
      encoding: c.encoding,
      base: c.base,
      resolve: (name) => resolveSound(p.samples, name),
      samples: app.audio.lengths(),
      ...(eyecatch ? { stagefile: eyecatch } : {}),
      ...(preview ? { preview } : {}),
      ...(bga?.path && isMovieName(bga.path) ? { bga: { file: bga.path, ms: bga.startMs } } : {}),
    },
  );
  const job: ExportJob = {
    files: exp.files,
    copies: exp.copies.map((x) => ({ from: joinPath(p.dir, x.from), path: x.path })),
    sounds: exp.sounds.map((s) => ({ ...s, src: joinPath(p.dir, s.src) })),
  };
  return { exp, job };
}

export function writeBmsFolder(
  app: App,
  dest: string,
  r: BmsReview,
  onProgress?: (done: number, total: number) => void,
): Promise<{ dir: string; files: number }> {
  return app.backend.export.toFolder(dest, r.job, onProgress);
}
