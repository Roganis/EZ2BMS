// A sound's onsets and tempo (computed by the engine: crates/ez2bms-audio
// analysis.rs), fetched once per Loaded - the first time a stem strip shows
// the file - and kept while that Loaded is. About a second for a long stem
// the first time; the engine keeps it on disk after that.

import type { AudioBackend, Loaded, SoundAnalysis } from '../bridge';

export class AnalysisCache {
  private readonly cache = new WeakMap<Loaded, SoundAnalysis | 'pending' | 'failed'>();

  constructor(
    private readonly audio: Pick<AudioBackend, 'analysis'>,
    /** Called when an analysis arrives (draw again). */
    private readonly onLoad: () => void,
  ) {}

  /** The analysis, if it is here; asked for (once) if not. */
  get(l: Loaded): SoundAnalysis | undefined {
    const v = this.cache.get(l);
    if (v === undefined && l.id !== null) {
      this.cache.set(l, 'pending');
      this.audio.analysis(l.id).then(
        (a) => {
          this.cache.set(l, a);
          this.onLoad();
        },
        () => this.cache.set(l, 'failed'),
      );
    }
    return typeof v === 'object' ? v : undefined;
  }

  /** Still being worked out. */
  pending(l: Loaded): boolean {
    return this.cache.get(l) === 'pending';
  }
}
