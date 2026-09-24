// Renaming a sound file: which names in which charts must follow it, and when
// a rename would quietly change what another name means.
//
// Charts name sounds loosely (any case; "kick.wav" for kick.ogg - see
// resolve.ts), so a file is referred to by every spelling that resolves to it.
// After the rename all of them are rewritten to the new name exactly. Two
// renames are refused because they would change what OTHER references play:
// a new name that another file already answers to (same name or same stem:
// "snare.wav" may be how a chart spells snare.ogg), and a new stem shared with
// a file the old name did not own. A chart name that the folder lacks and the
// new name now answers to is allowed - that is how a missing sound is fixed -
// and reported so the editor can say so.

import { said, sayText } from '../i18n/say';
import type { ChartData } from '../model/types';
import { AUDIO_EXT, SoundIndex, soundStem } from './resolve';

export type RenamePlan =
  | {
      ok: true;
      /** The new name, relative to the song folder (the old file's folder kept). */
      to: string;
      /** Per chart file: each spelling that meant the old file -> the new name. */
      renames: Map<string, Map<string, string>>;
      /** Names charts use that were missing and now find the renamed file. */
      adopts: string[];
    }
  | {
      ok: false;
      /** Why not, in the language chosen: the editor shows it at once ("Can't rename kick.wav: …"). */
      reason: string;
    };

/** Characters Windows refuses in a file name (the song folders travel between machines). */
const BAD_NAME = /[<>:"/\\|?*]/;
const hasControl = (s: string) => [...s].some((c) => c.charCodeAt(0) < 0x20);

function ext(name: string): string {
  return /\.[^./\\]+$/.exec(name)?.[0].toLowerCase() ?? '';
}

/**
 * Rename `from` (a folder file) to `newBase` in the same folder. `charts` are
 * every chart of the song; `folder` the song's files.
 */
export function planSoundRename(
  charts: readonly { file: string; data: ChartData }[],
  folder: readonly string[],
  from: string,
  newBase: string,
): RenamePlan {
  const base = newBase.trim();
  if (!folder.includes(from))
    return { ok: false, reason: sayText(said('sound.rename.missing', { file: from })) };
  if (!base) return { ok: false, reason: sayText(said('sound.rename.empty')) };
  if (
    BAD_NAME.test(base) ||
    hasControl(base) ||
    /[. ]$/.test(base) ||
    /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(base)
  )
    return { ok: false, reason: sayText(said('sound.rename.windows', { name: base })) };
  if (ext(base) !== ext(from))
    return { ok: false, reason: sayText(said('sound.rename.extension', { ext: ext(from) })) };
  const slash = Math.max(from.lastIndexOf('/'), from.lastIndexOf('\\'));
  const to = from.slice(0, slash + 1) + base;
  if (to === from) return { ok: false, reason: sayText(said('sound.rename.same')) };
  const index = new SoundIndex(folder);
  const toLower = to.toLowerCase();
  const toStem = soundStem(to);
  const fromStem = soundStem(from);
  for (const f of folder) {
    if (f === from) continue;
    if (f.toLowerCase() === toLower)
      return { ok: false, reason: sayText(said('sound.rename.taken', { file: f })) };
    // Another sound with the new stem: a chart spelling "<stem>.xyz" for it
    // would start finding the renamed file instead (or the other way round).
    // A same-stem sibling of the OLD name is fine only when the stem stays.
    if (AUDIO_EXT.test(f) && soundStem(f) === toStem && toStem !== fromStem)
      return { ok: false, reason: sayText(said('sound.rename.same-stem', { file: f })) };
  }
  const renames = new Map<string, Map<string, string>>();
  const adopts = new Set<string>();
  // The index as it will be: the old file gone, the new one there.
  const after = new SoundIndex(folder.map((f) => (f === from ? to : f)));
  for (const c of charts) {
    const names = [...c.data.channels.map((ch) => ch.name)];
    if (c.data.info.previewMusic) names.push(c.data.info.previewMusic);
    for (const n of names) {
      const was = index.resolve(n);
      if (was === from) {
        let m = renames.get(c.file);
        if (!m) renames.set(c.file, (m = new Map()));
        m.set(n, to);
      } else if (was === undefined && after.resolve(n) === to) {
        adopts.add(n);
      }
    }
  }
  return { ok: true, to, renames, adopts: [...adopts] };
}
