// The open song as an EZ2PORT package: chart-core compiles every file, the
// back end cuts the keysounds and writes it all at once.

import {
  compileSong,
  effectiveCategory,
  PublishError,
  songMeta,
  type PackagePlan,
  type SongChart,
} from '@ez2bms/chart-core';
import { soundPath } from '../audio/paths';
import type { PackageSpec, PreviewJob } from '../bridge';
import { t } from '../i18n/i18n.svelte';
import type { App } from '../state/app.svelte';
import type { PackageArt } from '../state/art.svelte';
import type { ChartSlot } from '../state/project.svelte';

const PUBLISH_RATE = 44100;

export interface Built {
  spec: PackageSpec;
  plan: PackagePlan;
}

/**
 * The whole song, or just `only` (a test run needs one chart). `art` is the
 * title plate, disc and eyecatch, made beforehand (ArtState.packageArt: the
 * host renders and cuts them, which a test run does without - ez2play shows
 * none of them).
 */
export function buildPackage(
  app: App,
  opts: { only?: ChartSlot; key?: string; art?: PackageArt; preview?: PreviewJob } = {},
): Built {
  const p = app.project;
  if (!p) throw new PublishError(t('publish.noSong'));
  const slots = opts.only ? [opts.only] : p.charts;
  const key = opts.key ?? p.sidecar.key;
  // The song's info, from all its charts even when testing one.
  const meta = songMeta(p.charts.map((c) => ({ data: c.doc.data, tier: c.tier }))).values;
  const title = meta.title || p.name;
  const charts: SongChart[] = slots.map((c) => ({ data: c.doc.data, mode: c.mode, tier: c.tier }));
  // The movie goes with a test run too: ez2play shows it with --bga.
  const bga = app.bga.packageJob(p);
  const plan = compileSong(
    {
      key,
      title,
      artist: meta.artist,
      genre: meta.genre,
      // Always written: a song without one is CUSTOM (48), which song.ini now says.
      category: effectiveCategory(p.sidecar.category),
      ...opts.art,
      ...(opts.preview ? { preview: true } : {}),
      ...(bga ? { bga: bga.ini } : {}),
      ...(p.sidecar.id ? { songId: p.sidecar.id } : {}),
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
    ...(opts.preview ? { preview: opts.preview } : {}),
    ...(bga ? { copies: [bga.copy] } : {}),
    keysounds: plan.keysounds.map((k) => ({
      src: soundPath(p.dir, p.samples, k.src),
      start_frame: k.startFrame,
      end_frame: k.endFrame,
      file: k.file,
    })),
  };
  return { spec, plan };
}
