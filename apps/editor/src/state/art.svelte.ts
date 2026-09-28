// The song's disc and eyecatch in the editor: which image each is cut from
// and how (ez2bms.song.json; the rules are chart-core's song/art.ts), the
// cut the cropper previews - the host's own, so what you see is what is
// published - and the .abm files a publish writes, the title plate with them.

import {
  PublishError,
  abmToBmp,
  defaultEyecatch,
  encodeAbm,
  findImage,
  plateSpecFor,
  plateText,
  songMeta,
  type ArtJob,
  type DiscArt,
  type EyecatchArt,
  type PlateCheck,
  type PlateSettings,
  type PlateSpec,
} from '@ez2bms/chart-core';
import { baseName, joinPath, type ArtPixels, type Imported, type PlatePixels } from '../bridge';
import { errorText, t } from '../i18n/i18n.svelte';
import type { App } from './app.svelte';
import type { Project } from './project.svelte';
import { toast } from './toasts.svelte';

export type ArtKind = 'disc' | 'eyecatch';

/** The art files of a package, as compileSong takes them. */
export interface PackageArt {
  songnameAbm?: Uint8Array;
  discAbm?: Uint8Array;
  eyecatchAbm?: Uint8Array;
}

/** What the Art tab takes: pictures, and the game's own .abm (made a BMP as it comes in). */
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'bmp', 'abm'];

const ABM = /\.abm$/i;

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

  /**
   * What the last plate render found (missing glyphs, a font or image it
   * could not use), for lint - which cannot render - keyed by what was
   * rendered so a stale report is never shown.
   */
  plateCheck = $state<{ key: string; check: PlateCheck } | null>(null);

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
    const paths = await this.app.backend.pickFiles(t('art.pick'), IMAGE_EXTENSIONS);
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
      const plain = paths.filter((f) => !ABM.test(f));
      const res = [
        ...(plain.length ? await this.app.backend.importFiles(p.dir, plain, 'image') : []),
        ...(await this.importAbm(
          p.dir,
          paths.filter((f) => ABM.test(f)),
        )),
      ];
      names = res.flatMap((r) => (r.name ? [r.name] : []));
      const copied = res.filter((r) => r.name && !r.reused).length;
      const skipped = res.filter((r) => r.error);
      await p.rescan();
      // A message for each outcome, so a translation words what was and was
      // not imported as one sentence.
      const files = skipped.map((r) => baseName(r.from)).join(', ');
      const error = skipped[0]?.error;
      let text = '';
      if (skipped.length)
        text = copied
          ? t('art.importedSkipped', { n: copied, files, error })
          : names.length
            ? t('art.alreadySkipped', { files, error })
            : t('art.skipped', { files, error });
      else if (copied) text = t('art.imported', { n: copied });
      else if (names.length) text = t('art.already');
      if (text) toast(text, skipped.length ? 'warn' : 'ok');
    } catch (e) {
      toast(t('song.importFailed', { error: errorText(e) }), 'error');
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
   * The game's .abm pictures into the song folder as plain BMPs (chart-core
   * abmToBmp), which the host's image reader and the webview both open. As
   * the host's copy does: the same picture already there is reused, another
   * file of that name is never replaced (`name (2).bmp`).
   */
  private async importAbm(dir: string, paths: string[]): Promise<Imported[]> {
    const out: Imported[] = [];
    if (!paths.length) return out;
    // The names taken, for this call only: nothing renders from it.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const there = new Set((await this.app.backend.list(dir)).map((e) => e.name.toLowerCase()));
    for (const from of paths) {
      try {
        const bmp = abmToBmp(await this.app.backend.readFile(from));
        const stem = baseName(from).replace(ABM, '');
        let name = `${stem}.bmp`;
        let reused = false;
        for (let n = 2; there.has(name.toLowerCase()); n++) {
          const old = await this.app.backend.readFile(joinPath(dir, name)).catch(() => undefined);
          if (old && old.length === bmp.length && old.every((b, i) => b === bmp[i])) {
            reused = true;
            break;
          }
          name = `${stem} (${n}).bmp`;
        }
        if (!reused) await this.app.backend.writeBytes(joinPath(dir, name), bmp, false);
        there.add(name.toLowerCase());
        out.push({ from, name, reused, error: null });
      } catch (e) {
        out.push({ from, name: null, reused: false, error: errorText(e) });
      }
    }
    return out;
  }

  /** The song's title and subtitle as every chart shares them. */
  private songText(p: Project): { title: string; subtitle: string } {
    const meta = songMeta(p.charts.map((c) => ({ data: c.doc.data, tier: c.tier }))).values;
    return { title: meta.title || p.name, subtitle: meta.subtitle };
  }

  plateSettings(p: Project): PlateSettings {
    return p.sidecar.plate ?? {};
  }

  /**
   * The song's title plate as text: the shipped plates' layout (TEXT.md s7)
   * with the song file's words, tint and CJK forms.
   */
  plateSpec(p: Project): PlateSpec {
    return plateSpecFor(this.plateSettings(p), this.songText(p));
  }

  /** Change the plate setting (undefined members are removed; nothing left, no setting). */
  async setPlate(patch: Partial<Record<keyof PlateSettings, string | undefined>>): Promise<void> {
    const p = this.app.project;
    if (!p) return;
    const next: Record<string, string> = { ...($state.snapshot(p.sidecar.plate) ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    if (Object.keys(next).length) p.sidecar.plate = next as PlateSettings;
    else delete p.sidecar.plate;
    await p.saveSidecar();
  }

  /** What identifies a plate render: its image or its spec. */
  plateKey(p: Project): string {
    const img = this.plateSettings(p).image;
    return img ? `image:${findImage(p.images, img) ?? img}` : JSON.stringify(this.plateSpec(p));
  }

  /**
   * The title plate, rendered by the host: your own image fit to 256x32, or
   * the text. Records what it found for lint.
   */
  async renderPlate(p: Project): Promise<PlatePixels> {
    const key = this.plateKey(p);
    const s = this.plateSettings(p);
    const song = this.songText(p);
    const report = (check: Omit<PlateCheck, 'songTitle'>) => {
      this.plateCheck = { key, check: { songTitle: song.title, ...check } };
    };
    try {
      if (s.image) {
        const path = findImage(p.images, s.image);
        if (!path) {
          report({ missing: [], image: { src: s.image, path } });
          throw new PublishError(t('art.plateMissing', { file: s.image }));
        }
        const px = await this.pixels(p, path, { kind: 'plate' });
        report({ missing: [], image: { src: s.image, path } });
        return { ...px, missing: [] };
      }
      const px = await this.app.backend.media.plate(this.plateSpec(p));
      report({ missing: px.missing, text: plateText(s, song).title });
      return px;
    } catch (e) {
      const error = errorText(e);
      if (!(e instanceof PublishError)) report({ missing: [], error });
      throw e;
    }
  }

  /**
   * The title plate, disc and eyecatch as package files: rendered and cut by
   * the host, encoded as .abm.
   */
  async packageArt(p: Project): Promise<PackageArt> {
    const art = p.art;
    const plate = await this.renderPlate(p).catch((e: unknown) => {
      if (e instanceof PublishError) throw e;
      throw new PublishError(t('plate.failed', { error: errorText(e) }));
    });
    const out: PackageArt = { songnameAbm: encodeAbm(plate.rgb, plate.w, plate.h) };
    for (const kind of ['disc', 'eyecatch'] as const) {
      const a = art[kind];
      if (!a) continue;
      const disc = kind === 'disc';
      if (!a.path)
        throw new PublishError(
          t(disc ? 'art.disc.missing' : 'art.eyecatch.missing', { file: a.src }),
        );
      const px = await this.pixels(p, a.path, a.job).catch((e: unknown) => {
        const error = errorText(e);
        throw new PublishError(t(disc ? 'art.disc.failed' : 'art.eyecatch.failed', { error }));
      });
      out[kind === 'disc' ? 'discAbm' : 'eyecatchAbm'] = encodeAbm(px.rgb, px.w, px.h);
    }
    return out;
  }
}
