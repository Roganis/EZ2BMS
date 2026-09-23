// The preview's window and settings. Its PCM is the host's, checked against
// EZ2PORT's importer in preview.oracle.test.ts.

import { describe, expect, it } from 'vitest';
import { lintSong, type PreviewCheck } from '../src/lint/lint';
import { newChart } from '../src/model/defaults';
import { compileSong } from '../src/publish/package';
import {
  PREVIEW_MAX_MS,
  PREVIEW_MIN_MS,
  defaultPreviewStart,
  previewWindow,
  readPreviewSettings,
} from '../src/publish/preview';
import { readSongIni } from '../src/publish/songini-read';
import { parseSongFile, serializeSongFile } from '../src/song/songfile';

describe('the preview window', () => {
  it("starts where the importer's does: the first note a quarter of the way in", () => {
    // Notes from 1 s to 41 s: a quarter in is 11 s; the first note there or after is 12 s.
    expect(defaultPreviewStart([41000, 1000, 5000, 12000, 30000])).toBe(12000);
    expect(defaultPreviewStart([3000])).toBe(3000);
    expect(defaultPreviewStart([])).toBe(0);
  });

  it('keeps its length and fades in range', () => {
    expect(previewWindow({}, [0, 10000, 40000])).toEqual({
      startMs: 10000,
      lengthMs: 20000,
      fadeMs: 1000,
    });
    expect(previewWindow({ lengthMs: 999_999, fadeMs: 1e9 }, []).lengthMs).toBe(PREVIEW_MAX_MS);
    expect(previewWindow({ lengthMs: 10 }, []).lengthMs).toBe(PREVIEW_MIN_MS);
    expect(previewWindow({ lengthMs: 8000, fadeMs: 9000 }, []).fadeMs).toBe(4000);
    // A file starts at its beginning unless told otherwise.
    expect(previewWindow({ file: 'a.ogg' }, [0, 40000]).startMs).toBe(0);
  });
});

describe('preview settings', () => {
  it('read only numbers and names, and ride in the song file', () => {
    expect(readPreviewSettings({ chart: 'a.bmson', startMs: 1500 })).toEqual({
      chart: 'a.bmson',
      startMs: 1500,
    });
    expect(readPreviewSettings({ startMs: -1 })).toBeUndefined();
    expect(readPreviewSettings({ file: '' })).toBeUndefined();
    expect(readPreviewSettings({ startMs: 1, other: 2 })).toBeUndefined();
    const text = '{"key":"abc","preview":{"file":"full.ogg","startMs":62000,"lengthMs":25000}}';
    const { song, warnings } = parseSongFile(text);
    expect(warnings).toEqual([]);
    expect(JSON.parse(serializeSongFile(song))).toEqual(JSON.parse(text));
  });

  it("name preview.ssf in song.ini's [Assets] when there is one", () => {
    const plan = compileSong({ key: 'abc', title: 'T', artist: '', genre: '', preview: true }, [
      { data: newChart({ mode: '5k', tier: 'NM', level: 1 }), mode: '5k', tier: 'NM' },
    ]);
    expect(readSongIni(plan.files[0]!.bytes).assets.preview).toBe('preview.ssf');
  });

  it('are linted: a missing file, a start past the last note', () => {
    const c = {
      file: 'streetmix1p-abc.bmson',
      data: newChart({ mode: '5k', tier: 'NM', level: 3 }),
      mode: '5k' as const,
      tier: 'NM' as const,
    };
    const found = (preview: PreviewCheck) =>
      lintSong({ key: 'abc', charts: [c], preview })
        .filter((f) => /preview|art-missing/.test(f.rule))
        .map((f) => `${f.rule}:${f.severity}`);
    expect(found({ startMs: 1000, lastNoteMs: 5000 })).toEqual([]);
    expect(found({ startMs: 6000, lastNoteMs: 5000 })).toEqual(['preview-late:warning']);
    expect(found({ startMs: 0, file: { src: 'x.ogg', path: undefined } })).toEqual([
      'art-missing:error',
    ]);
  });
});
