// The keysounds a song publishes: whole samples and slices of them.
//
// EZ2 plays whole-sample keysounds only, so a bmson slice (a `c: true`
// continuation) becomes its own cut sample file, exactly as EZ2PORT's
// importer does (ez2/bmson.c keysound_index). EZ2BMS keeps the port's naming
// (`stem`, `stem_<startms>_<endms>`, `stem_<startms>_end`, unique without
// regard to case with `~2`, `~3`...) but identifies a slice by its exact
// frame range at 44.1 kHz, so consecutive slices join sample-exactly.

export const OUT_RATE = 44100;

export interface KeysoundDef {
  /** Package file name without extension (the .ezi lists `<name>.wav`, the disk holds `<name>.ssf`). */
  name: string;
  /** Source sample, as the bmson channel names it (relative to the chart folder). */
  src: string;
  /** First source frame at 44.1 kHz. */
  startFrame: number;
  /** One past the last frame, or null to play to the end of the sample. */
  endFrame: number | null;
}

function stemOf(src: string): string {
  const dot = src.lastIndexOf('.');
  const body =
    dot > src.lastIndexOf('/') && dot > src.lastIndexOf('\\') && dot >= 0 ? src.slice(0, dot) : src;
  return [...body]
    .slice(0, 40)
    .map((c) => (/[A-Za-z0-9_-]/.test(c) ? c : '_'))
    .join('');
}

const msOf = (frames: number) => Math.floor((frames * 1000) / OUT_RATE + 0.5);

/** A song-wide table: one entry per distinct (source, frame range). */
export class KeysoundRegistry {
  readonly defs: KeysoundDef[] = [];
  private readonly byIdentity = new Map<string, number>();
  private readonly usedNames = new Set<string>();

  /** Index of the keysound for this slice, creating it on first use. */
  get(src: string, startFrame: number, endFrame: number | null): number {
    const id = `${src}\u0000${startFrame}\u0000${endFrame ?? -1}`;
    const known = this.byIdentity.get(id);
    if (known !== undefined) return known;
    const stem = stemOf(src);
    const base = !src
      ? 'silence'
      : startFrame === 0 && endFrame === null
        ? stem
        : endFrame === null
          ? `${stem}_${msOf(startFrame)}_end`
          : `${stem}_${msOf(startFrame)}_${msOf(endFrame)}`;
    let name = base;
    for (let n = 2; this.usedNames.has(name.toLowerCase()); n++) name = `${base}~${n}`;
    this.usedNames.add(name.toLowerCase());
    const index = this.defs.length;
    this.defs.push({ name, src, startFrame, endFrame });
    this.byIdentity.set(id, index);
    return index;
  }
}
