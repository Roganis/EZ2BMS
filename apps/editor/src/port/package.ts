// The open song as an EZ2PORT package: chart-core compiles every file, the
// back end cuts the keysounds and writes it all at once.

import { compileSong, PublishError, type PackagePlan, type SongChart } from '@ez2bms/chart-core';
import { soundPath } from '../audio/paths';
import type { PackageSpec } from '../bridge';
import type { App } from '../state/app.svelte';
import type { ChartSlot } from '../state/project.svelte';
import { renderPlate } from './plate';

const PUBLISH_RATE = 44100;

export interface Built {
  spec: PackageSpec;
  plan: PackagePlan;
}

/** The whole song, or just `only` (a test run needs one chart). */
export function buildPackage(app: App, opts: { only?: ChartSlot; key?: string } = {}): Built {
  const p = app.project;
  if (!p) throw new PublishError('no song is open');
  const slots = opts.only ? [opts.only] : p.charts;
  const key = opts.key ?? p.sidecar.key;
  const first = slots.find((c) => c.tier === 'NM') ?? slots[0];
  const info = first?.doc.data.info ?? { extra: {} };
  const title = info.title ?? p.name;
  const charts: SongChart[] = slots.map((c) => ({ data: c.doc.data, mode: c.mode, tier: c.tier }));
  const plate = typeof document !== 'undefined' ? renderPlate(title) : undefined;
  const plan = compileSong(
    {
      key,
      title,
      artist: info.artist ?? '',
      genre: info.genre ?? '',
      ...(typeof p.sidecar.category === 'number' ? { category: p.sidecar.category } : {}),
      ...(plate ? { songnameAbm: plate } : {}),
    },
    charts,
    {
      samples: (src) => {
        const l = app.audio.loadedInfo(src);
        return l && !l.error ? { frames: Math.round(l.seconds * PUBLISH_RATE) } : undefined;
      },
    },
  );
  const spec: PackageSpec = {
    key,
    project_dir: p.dir,
    files: plan.files.map((f) => ({ path: f.path, bytes: f.bytes })),
    keysounds: plan.keysounds.map((k) => ({
      src: soundPath(p.dir, p.samples, k.src),
      start_frame: k.startFrame,
      end_frame: k.endFrame,
      file: k.file,
    })),
  };
  return { spec, plan };
}
