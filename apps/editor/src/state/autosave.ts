// Unsaved work survives a crash: every few seconds of quiet, each dirty
// chart's bmson goes to the app's own folder (never beside the song), and
// opening the song again offers it back when it is newer than the file.
// Saving clears it.

import { fnv1a64Hex, encodeUtf8 } from '@ez2bms/chart-core';
import { joinPath, type Backend } from '../bridge';
import type { ChartSlot, Project } from './project.svelte';

/** When an autosave was made, for people. */
export function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString();
}

export class Autosave {
  private dir: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly backend: Backend) {}

  private async folder(p: Project): Promise<string> {
    if (!this.dir) {
      const info = await this.backend.appInfo();
      this.dir = joinPath(info.config_dir ?? '/ez2bms', 'autosave');
    }
    return joinPath(this.dir, fnv1a64Hex(encodeUtf8(p.dir)));
  }

  /** Write the dirty charts a moment after the last edit. */
  schedule(p: Project, ms = 4000): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.write(p), ms);
  }

  async write(p: Project): Promise<number> {
    const dir = await this.folder(p);
    let n = 0;
    for (const c of p.charts) {
      if (!c.dirty) continue;
      await this.backend.writeText(joinPath(dir, c.file), c.bmson(), false);
      n++;
    }
    return n;
  }

  /**
   * After a save: nothing left to recover for these charts - nor under the
   * names a save just renamed them from, which would otherwise be offered
   * back as a stray chart.
   */
  async clear(p: Project, slots: readonly ChartSlot[], oldNames: string[] = []): Promise<void> {
    const dir = await this.folder(p);
    for (const f of [...slots.map((c) => c.file), ...oldNames])
      await this.backend.writeText(joinPath(dir, f), '', false);
  }

  /** Autosaved charts newer than their file: [file, text, when]. */
  async pending(p: Project): Promise<{ file: string; text: string; when: number }[]> {
    const dir = await this.folder(p);
    const saved = await this.backend.list(dir).catch(() => []);
    const onDisk = new Map(
      (await this.backend.list(p.dir).catch(() => [])).map((e) => [e.name, e.modified_ms]),
    );
    const out: { file: string; text: string; when: number }[] = [];
    for (const e of saved) {
      if (e.is_dir || e.size === 0 || !e.name.toLowerCase().endsWith('.bmson')) continue;
      const disk = onDisk.get(e.name);
      if (disk !== undefined && disk >= e.modified_ms) continue;
      const text = await this.backend.readText(joinPath(dir, e.name)).catch(() => '');
      if (text) out.push({ file: e.name, text, when: e.modified_ms });
    }
    return out;
  }
}
