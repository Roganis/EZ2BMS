// The song's disc and eyecatch in the editor: which image each is cut from
// and how (ez2bms.song.json; the rules are chart-core's song/art.ts), the
// cut the cropper previews - the host's own, so what you see is what is
// published - and the .abm files a publish writes, the title plate with them.

import {
  PublishError,
  defaultEyecatch,
  encodeAbm,
  songMeta,
  titlePlate,
  type ArtJob,
  type DiscArt,
  type EyecatchArt,
  type PlateSpec,
} from '@ez2bms/chart-core';
import { baseName, joinPath, type ArtPixels } from '../bridge';
import type { App } from './app.svelte';
import type { Project } from './project.svelte';
import { plural } from './songwide';
import { toast } from './toasts.svelte';

export type ArtKind = 'disc' | 'eyecatch';

/** The art files of a package, as compileSong takes them. */
export interface PackageArt {
  songnameAbm?: Uint8Array;
  discAbm?: Uint8Array;
  eyecatchAbm?: Uint8Array;
}

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'bmp'];

/** An image's size as the webview decodes it (turned upright, as the host turns it). */
export async function imageSize(bytes: Uint8Array): Promise<{ w: number; h: number }> {
  const img = await createImageBitmap(new Blob([bytes as BlobPart]));
  const size = { w: img.width, h: img.height };
  img.close();
  return size;
}

/** An object URL for an image's bytes (the caller revokes it). */
export function imageUrl(bytes: Uint8Array): string {
  return URL.createObjectURL(new Blob([bytes as BlobPart]));
}

export class ArtState {
  constructor(private readonly app: App) {}

  /** The cut, from the host: RGB at the file's size (256x256 or 1024x512). */
  pixels(p: Project, path: string, job: ArtJob): Promise<ArtPixels> {
    return this.app.backend.media.art(joinPath(p.dir, path), job);
  }

  async size(p: Project, path: string): Promise<{ w: number; h: number }> {
    return imageSize(await this.app.backend.readFile(joinPath(p.dir, path)));
  }

  /** Set (or with undefined, give back to the charts; with null, turn off) the disc. */
  async setDisc(v: DiscArt | null | undefined): Promise<void> {
    await this.set('disc', v);
  }

  async setEyecatch(v: EyecatchArt | null | undefined): Promise<void> {
    await this.set('eyecatch', v);
  }

  private async set(kind: ArtKind, v: DiscArt | EyecatchArt | null | undefined): Promise<void> {
    const p = this.app.project;
    if (!p) return;
    if (v === undefined) delete p.sidecar[kind];
    else if (kind === 'disc') p.sidecar.disc = v as DiscArt | null;
    else p.sidecar.eyecatch = v as EyecatchArt | null;
    await p.saveSidecar();
  }

  /** Choose an image for the disc or the eyecatch, framed as a new image is. */
  async choose(kind: ArtKind, src: string): Promise<void> {
    const p = this.app.project;
    if (!p) return;
    if (kind === 'disc') return this.setDisc({ src });
    const { w, h } = await this.size(p, src);
    await this.setEyecatch(defaultEyecatch(src, w, h));
  }

  /** The file chooser, then `import`. */
  async pickAndImport(): Promise<string[]> {
    const paths = await this.app.backend.pickFiles(
      'Images for the disc and eyecatch',
      IMAGE_EXTENSIONS,
    );
    return this.import(paths);
  }

  /**
   * Copy images into the song folder (never over another file). Art the song
   * has none of - not even from its charts - is set from the first one.
   * Returns their names in the folder.
   */
  async import(paths: string[]): Promise<string[]> {
    const p = this.app.project;
    if (!p || !paths.length) return [];
    let names: string[];
    try {
      const res = await this.app.backend.importFiles(p.dir, paths, 'image');
      names = res.flatMap((r) => (r.name ? [r.name] : []));
      const copied = res.filter((r) => r.name && !r.reused).length;
      const skipped = res.filter((r) => r.error);
      await p.rescan();
      const parts = [
        copied
          ? `Imported ${plural(copied, 'image')}`
          : names.length
            ? 'Already in the folder'
            : '',
        skipped.length
          ? `skipped ${skipped.map((r) => baseName(r.from)).join(', ')} (${skipped[0]!.error})`
          : '',
      ].filter(Boolean);
      if (parts.length) toast(parts.join('; '), skipped.length ? 'warn' : 'ok');
    } catch (e) {
      toast(`Import failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
      return [];
    }
    const first = names[0];
    if (first) {
      const art = p.art;
      if (!art.disc && p.sidecar.disc === undefined) await this.choose('disc', first);
      if (!art.eyecatch && p.sidecar.eyecatch === undefined)
        await this.choose('eyecatch', first).catch(() => undefined);
    }
    return names;
  }

  /**
   * The song's title plate: the shipped plates' layout (TEXT.md s7) from its
   * title and subtitle.
   */
  plateSpec(p: Project): PlateSpec {
    const meta = songMeta(p.charts.map((c) => ({ data: c.doc.data, tier: c.tier }))).values;
    return titlePlate(meta.title || p.name, meta.subtitle);
  }

  /**
   * The title plate, disc and eyecatch as package files: rendered and cut by
   * the host, encoded as .abm.
   */
  async packageArt(p: Project): Promise<PackageArt> {
    const art = p.art;
    const plate = await this.app.backend.media.plate(this.plateSpec(p)).catch((e: unknown) => {
      throw new PublishError(`The title plate: ${e instanceof Error ? e.message : String(e)}`);
    });
    const out: PackageArt = { songnameAbm: encodeAbm(plate.rgb, plate.w, plate.h) };
    for (const kind of ['disc', 'eyecatch'] as const) {
      const a = art[kind];
      if (!a) continue;
      if (!a.path) throw new PublishError(`The ${kind} image ${a.src} is not in the song folder`);
      const px = await this.pixels(p, a.path, a.job).catch((e: unknown) => {
        throw new PublishError(`The ${kind}: ${e instanceof Error ? e.message : String(e)}`);
      });
      out[kind === 'disc' ? 'discAbm' : 'eyecatchAbm'] = encodeAbm(px.rgb, px.w, px.h);
    }
    return out;
  }
}
