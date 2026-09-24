// The song's BGA in the editor: which movie and when it starts
// (ez2bms.song.json; the rules are chart-core's publish/bga.ts), what its
// headers say - read once per file through the host, a few kilobytes of a
// movie of any size - and what a publish copies and writes into song.ini.

import {
  MOVIE_FILE_EXTENSIONS,
  isMovieName,
  packageBgaName,
  probeMovie,
  type BgaCheck,
  type BgaSettings,
  type MovieInfo,
} from '@ez2bms/chart-core';
import { SvelteMap } from 'svelte/reactivity';
import { baseName, joinPath } from '../bridge';
import { t } from '../i18n/i18n.svelte';
import type { App } from './app.svelte';
import type { Project } from './project.svelte';
import { chartTiming } from './timing';
import { toast } from './toasts.svelte';

export type Probe = MovieInfo | { error: string };

export class BgaState {
  constructor(private readonly app: App) {}

  /** What each movie's headers said, by its absolute path. */
  private readonly probes = new SvelteMap<string, Probe>();
  // Bookkeeping only: nothing renders from it.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  private readonly asked = new Set<string>();

  settings(p: Project): BgaSettings | null | undefined {
    return p.sidecar.bga;
  }

  /** Set the song's BGA (undefined: the charts' own; null: none). */
  async set(v: BgaSettings | null | undefined): Promise<void> {
    const p = this.app.project;
    if (!p) return;
    if (v === undefined) delete p.sidecar.bga;
    else p.sidecar.bga = v;
    await p.saveSidecar();
  }

  /** Change the setting's members (undefined ones are removed). */
  async patch(patch: Partial<Record<keyof BgaSettings, string | number | undefined>>) {
    const p = this.app.project;
    if (!p) return;
    const next: Record<string, string | number> = { ...($state.snapshot(p.sidecar.bga) ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    await this.set(next as BgaSettings);
  }

  /** The file chooser, then `import`. */
  async pickAndImport(): Promise<void> {
    const paths = await this.app.backend.pickFiles(t('bga.pick'), MOVIE_FILE_EXTENSIONS);
    await this.import(paths);
  }

  /** Copy movies into the song folder (never over another file); the first becomes the BGA. */
  async import(paths: string[]): Promise<void> {
    const p = this.app.project;
    if (!p || !paths.length) return;
    try {
      const res = await this.app.backend.importFiles(p.dir, paths, 'movie');
      await p.rescan();
      const names = res.flatMap((r) => (r.name ? [r.name] : []));
      const bad = res.filter((r) => r.error);
      const copied = res.filter((r) => r.name && !r.reused).length;
      if (copied) toast(t('bga.imported', { n: copied }), 'ok');
      if (bad.length) {
        const files = bad.map((r) => baseName(r.from)).join(', ');
        toast(t('bga.skipped', { files, error: bad[0]!.error }), 'warn');
      }
      if (names[0]) await this.patch({ file: names[0], startMs: undefined });
    } catch (e) {
      toast(t('song.importFailed', { error: e instanceof Error ? e.message : String(e) }), 'error');
    }
  }

  /**
   * What the movie's headers say (undefined until read; the read starts
   * here and lands in a reactive map, so whoever asked sees it arrive).
   */
  probe(p: Project, path: string): Probe | undefined {
    const abs = joinPath(p.dir, path);
    const got = this.probes.get(abs);
    if (got || this.asked.has(abs)) return got;
    this.asked.add(abs);
    const backend = this.app.backend;
    void (async () => {
      const read = async (offset: number, length: number) =>
        (await backend.readRange(abs, offset, length)).bytes;
      const info = await backend
        .readRange(abs, 0, 0)
        .then(({ size }) => probeMovie(read, size))
        .catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
      this.probes.set(abs, info);
    })();
    return undefined;
  }

  /** Read a movie's headers again (it was replaced on disk). */
  forget(p: Project, path: string): void {
    const abs = joinPath(p.dir, path);
    this.asked.delete(abs);
    this.probes.delete(abs);
  }

  /** When the song's last note sounds, ms: the movie should run at least that long. */
  songEndMs(p: Project): number | undefined {
    let end: number | undefined;
    for (const c of p.charts) {
      const lastY = c.doc.data.notes.reduce((m, n) => Math.max(m, n.y), -1);
      if (lastY < 0) continue;
      const ms = chartTiming(c.doc).secondsAt(lastY) * 1000;
      end = end === undefined ? ms : Math.max(end, ms);
    }
    return end;
  }

  /** The BGA as lint checks it. */
  check(p: Project): BgaCheck | undefined {
    const b = p.bga;
    if (!b) return undefined;
    const probe = b.path && b.movie ? this.probe(p, b.path) : undefined;
    const end = this.songEndMs(p);
    return {
      src: b.src,
      path: b.path,
      startMs: b.startMs,
      movie: b.movie,
      ...(probe ? { probe } : {}),
      ...(end !== undefined ? { songEndMs: end } : {}),
    };
  }

  /**
   * What a publish (or a test run) carries: song.ini's [Bga] and the copy,
   * under an ASCII name - or nothing, for no BGA or one that is not a movie
   * (lint says so; the importer drops it the same way).
   */
  packageJob(
    p: Project,
  ): { ini: { file: string; startMs: number }; copy: { from: string; name: string } } | undefined {
    const b = p.bga;
    if (!b?.path || !isMovieName(b.path)) return undefined;
    const name = packageBgaName(b.path);
    return { ini: { file: name, startMs: b.startMs }, copy: { from: b.path, name } };
  }
}
