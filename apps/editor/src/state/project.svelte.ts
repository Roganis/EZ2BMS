// An open song: its folder, one ChartDoc per bmson, and the samples beside
// them. The project lives outside EZ2PORT's songs folder; Publish writes the
// package there.

import {
  ChartDoc,
  chartMode,
  chartTier,
  decodeUtf8,
  encodeUtf8,
  isLegacyHint,
  modeNames,
  parseBmson,
  remapLegacyChart,
  serializeBmson,
  type ChartData,
  type ModeId,
  type ParseWarning,
  type Tier,
} from '@ez2bms/chart-core';
import { baseName, joinPath, type Backend } from '../bridge';

export interface Sidecar {
  key: string;
  category?: number;
  [k: string]: unknown;
}

export const SIDECAR = 'ez2bms.song.json';

/** One chart of the song, with a revision counter the UI can react to. */
export class ChartSlot {
  rev = $state(0);
  dirty = $state(false);
  warnings: ParseWarning[] = [];

  constructor(
    public file: string,
    public readonly doc: ChartDoc,
    public mode: ModeId,
    public tier: Tier,
  ) {
    doc.onChange(() => {
      this.rev++;
      this.dirty = doc.dirty;
    });
  }

  get label(): string {
    return `${modeNames(this.mode).label} ${this.tier}`;
  }

  get level(): number {
    return this.doc.data.info.level ?? 0;
  }

  bmson(): string {
    return serializeBmson(this.doc.data);
  }
}

const TIER_ORDER: Record<Tier, number> = { NM: 0, HD: 1, SHD: 2, EX: 3 };

export class Project {
  charts = $state<ChartSlot[]>([]);
  activeIndex = $state(0);
  samples = $state<string[]>([]);
  sidecar = $state<Sidecar>({ key: '' });

  private constructor(
    public readonly dir: string,
    private readonly backend: Backend,
  ) {}

  get name(): string {
    return baseName(this.dir);
  }

  get active(): ChartSlot | undefined {
    return this.charts[this.activeIndex];
  }

  get dirty(): boolean {
    return this.charts.some((c) => c.dirty);
  }

  static async open(backend: Backend, dir: string): Promise<Project> {
    const p = new Project(dir, backend);
    const scan = await backend.scanProject(dir);
    p.samples = scan.samples;
    if (scan.sidecar) {
      try {
        const raw = JSON.parse(await backend.readText(joinPath(dir, SIDECAR))) as Partial<Sidecar>;
        p.sidecar = { ...raw, key: typeof raw.key === 'string' ? raw.key : '' };
      } catch {
        // A broken sidecar is rewritten on the next save.
      }
    }
    const slots: ChartSlot[] = [];
    for (const e of scan.charts) {
      const bytes = await backend.readFile(joinPath(dir, e.name));
      slots.push(Project.slotFor(e.name, bytes));
    }
    slots.sort((a, b) => a.mode.localeCompare(b.mode) || TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
    p.charts = slots;
    return p;
  }

  /** Swap a chart for recovered text (it stays unsaved until you save). */
  recover(file: string, text: string): void {
    const i = this.charts.findIndex((c) => c.file === file);
    const slot = Project.slotFor(file, encodeUtf8(text));
    slot.dirty = true;
    if (i >= 0) this.charts[i] = slot;
    else this.charts.push(slot);
  }

  static slotFor(file: string, bytes: Uint8Array): ChartSlot {
    const { chart, warnings } = parseBmson(bytes);
    const resolved = chartMode(chart.info, file);
    const mode = resolved?.mode ?? '5k';
    if (isLegacyHint(chart.info.modeHint)) remapLegacyChart(chart, mode);
    const slot = new ChartSlot(file, new ChartDoc(chart), mode, chartTier(chart.info, file));
    slot.warnings = warnings;
    return slot;
  }

  addChart(file: string, data: ChartData, mode: ModeId, tier: Tier): ChartSlot {
    const slot = new ChartSlot(file, new ChartDoc(data), mode, tier);
    slot.dirty = true;
    this.charts.push(slot);
    this.activeIndex = this.charts.length - 1;
    return slot;
  }

  async save(slot: ChartSlot): Promise<void> {
    await this.backend.writeText(joinPath(this.dir, slot.file), slot.bmson(), true);
    slot.doc.markSaved();
    slot.dirty = false;
  }

  /** Called with the charts just written (autosave clears its copies). */
  onSaved: ((slots: ChartSlot[]) => void) | undefined;

  async saveAll(): Promise<number> {
    const dirty = this.charts.filter((c) => c.dirty);
    for (const c of dirty) await this.save(c);
    if (dirty.length) this.onSaved?.(dirty);
    await this.backend.writeText(
      joinPath(this.dir, SIDECAR),
      JSON.stringify($state.snapshot(this.sidecar), null, 2) + '\n',
      false,
    );
    return dirty.length;
  }

  /** Bytes of a chart as it would be saved (for tests and exports). */
  static bytes(slot: ChartSlot): Uint8Array {
    return encodeUtf8(slot.bmson());
  }

  static text(bytes: Uint8Array): string {
    return decodeUtf8(bytes).text;
  }
}
