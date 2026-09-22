// Which file a chart's sound name means. bmson names are relative to the
// chart; BMS habit is to name "kick.wav" for a file that is really kick.ogg,
// so a missing name falls back to an audio file with the same stem.

import { joinPath } from '../bridge';

const AUDIO_EXT = /\.(wav|ogg|flac|mp3|oga|ssf|ezw)$/i;
const stem = (s: string) => s.replace(/\.[^./]+$/, '').toLowerCase();

export function soundPath(dir: string, samples: readonly string[], name: string): string {
  const exact = samples.find((s) => s.toLowerCase() === name.toLowerCase());
  if (exact) return joinPath(dir, exact);
  const want = stem(name);
  const alt = samples.find((s) => AUDIO_EXT.test(s) && stem(s) === want);
  return joinPath(dir, alt ?? name);
}

/** Every sound name the charts use, once. */
export function soundNames(
  charts: readonly { doc: { data: { channels: readonly { name: string }[] } } }[],
): string[] {
  return [...new Set(charts.flatMap((c) => c.doc.data.channels.map((ch) => ch.name)))];
}
