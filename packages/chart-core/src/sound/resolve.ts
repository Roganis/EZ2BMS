// Which file in the song folder a chart's sound name means.
//
// bmson names a sound by its path relative to the chart. BMS habit, carried
// into converted charts, is to write "kick.wav" for a file that is really
// kick.ogg, so a name that is not in the folder falls back to an audio file
// with the same stem. Case never matters: the charts come from Windows.
// Audio playback, usage counts and lint all resolve through here, so they
// agree on what a name means.

export const AUDIO_EXT = /\.(wav|ogg|flac|mp3|oga|ssf|ezw)$/i;

/** The name without its last extension, lower-cased ("drums/Kick.WAV" -> "drums/kick"). */
export function soundStem(name: string): string {
  return name.replace(/\.[^./\\]+$/, '').toLowerCase();
}

/** Folder files by lower-cased name and by stem, built once for many lookups. */
export class SoundIndex {
  private readonly byName = new Map<string, string>();
  private readonly byStem = new Map<string, string>();

  constructor(readonly files: readonly string[]) {
    for (const f of files) {
      const k = f.toLowerCase();
      if (!this.byName.has(k)) this.byName.set(k, f);
      // The first audio file with a stem wins, in folder order (as a linear scan would).
      if (AUDIO_EXT.test(f)) {
        const s = soundStem(f);
        if (!this.byStem.has(s)) this.byStem.set(s, f);
      }
    }
  }

  /** The folder file `name` means, or undefined when the folder has none. */
  resolve(name: string): string | undefined {
    return this.byName.get(name.toLowerCase()) ?? this.byStem.get(soundStem(name));
  }
}

/** One lookup without building an index. */
export function resolveSound(files: readonly string[], name: string): string | undefined {
  const want = name.toLowerCase();
  const exact = files.find((f) => f.toLowerCase() === want);
  if (exact) return exact;
  const s = soundStem(name);
  return files.find((f) => AUDIO_EXT.test(f) && soundStem(f) === s);
}
